// Keplerian orbit mechanics shared by the solar system and the black-hole
// probe orbits. Periods anchor to each body's own true (radius, period)
// pair, so dragging demonstrates T² ∝ r³ exactly around real home values.

import * as THREE from 'three';

export const EARTH_ORBIT_RADIUS = 2.6;
export const EARTH_PERIOD_DAYS = 365.25;
/** Days of simulated time per real second. Earth year ≈ 24 s. */
export const TIME_DAYS_PER_SECOND = 15;
export const MIN_ORBIT_RADIUS = 1.3;
export const MAX_ORBIT_RADIUS = 9.0;

/** Kepler's third law: period scales as r^1.5 relative to an anchor orbit. */
export function keplerPeriodDays(
  radius: number,
  anchorRadius: number = EARTH_ORBIT_RADIUS,
  anchorPeriod: number = EARTH_PERIOD_DAYS,
): number {
  return anchorPeriod * Math.pow(Math.max(0.1, radius) / anchorRadius, 1.5);
}

interface OrbitEntry {
  radius: number;
  angle: number;
  periodDays: number;
  home: { radius: number; angle: number; periodDays: number };
}

export class OrbitSystem {
  readonly bodies: THREE.Mesh[] = [];
  private readonly state = new Map<THREE.Mesh, OrbitEntry>();

  register(mesh: THREE.Mesh, radius: number, angle: number, periodDays: number): void {
    this.bodies.push(mesh);
    this.state.set(mesh, {
      radius,
      angle,
      periodDays,
      home: { radius, angle, periodDays },
    });
  }

  get(mesh: THREE.Mesh): OrbitEntry | undefined {
    return this.state.get(mesh);
  }

  /** Retarget an orbit from a world-local ecliptic point (drag interaction). */
  setFromPoint(mesh: THREE.Mesh, p: THREE.Vector3, minR: number, maxR: number): void {
    const s = this.state.get(mesh);
    if (!s) return;
    s.radius = THREE.MathUtils.clamp(Math.hypot(p.x, p.z), minR, maxR);
    s.angle = Math.atan2(p.z, p.x);
    s.periodDays = keplerPeriodDays(s.radius, s.home.radius, s.home.periodDays);
  }

  /** Advance free bodies; grabbed ones are owned by the hand this frame. */
  update(days: number): void {
    for (const body of this.bodies) {
      const s = this.state.get(body);
      if (!s) continue;
      if (!body.userData.grabbed) {
        s.angle += ((Math.PI * 2 * days) / s.periodDays) % (Math.PI * 2);
      }
      body.position.set(Math.cos(s.angle) * s.radius, 0, Math.sin(s.angle) * s.radius);
    }
  }
}

interface DebrisSpec {
  radius: number;
  angle: number;
  speed: number; // rad/s at unit radius; scaled by r^-1.5 (Kepler look)
  tilt: number;
}

/**
 * GPU-cheap orbiting rubble: one InstancedMesh, matrices updated per frame.
 * Inner debris visibly outruns outer debris (Keplerian shear).
 */
export class OrbitingDebris {
  readonly mesh: THREE.InstancedMesh;
  private readonly specs: DebrisSpec[] = [];
  private readonly dummy = new THREE.Object3D();
  /** Spin multiplier (detonations spin the field up, then ease off). */
  spinBoost = 1;

  constructor(
    count: number,
    rMin: number,
    rMax: number,
    size: number,
    color: number,
    seed = 7,
  ) {
    const geo = new THREE.DodecahedronGeometry(size, 0);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.1 });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    let s = seed >>> 0;
    const rand = (): number => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 0; i < count; i++) {
      const radius = rMin + rand() * (rMax - rMin);
      this.specs.push({
        radius,
        angle: rand() * Math.PI * 2,
        speed: (0.5 + rand() * 0.8) / Math.pow(radius, 1.5),
        tilt: (rand() - 0.5) * 0.12,
      });
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.specs.length; i++) {
      const d = this.specs[i];
      d.angle += d.speed * this.spinBoost * dt;
      this.dummy.position.set(
        Math.cos(d.angle) * d.radius,
        Math.sin(d.angle * 2 + i) * d.tilt,
        Math.sin(d.angle) * d.radius,
      );
      this.dummy.rotation.set(i * 1.7, d.angle * 2, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
