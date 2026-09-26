// SPACE preset, inner system: Keplerian solar system with procedural
// textures (High tier), fresnel atmospheres, asteroid belt, moon, comet,
// and a distant black hole on the edge of the sky.

import * as THREE from 'three';
import { buildBlackHole, type BlackHole } from './blackhole';
import { MAX_ORBIT_RADIUS, MIN_ORBIT_RADIUS, OrbitingDebris, OrbitSystem, TIME_DAYS_PER_SECOND } from './orbits';
import { ParticlePool } from './particles';
import { disposeGroup, type BuilderCtx, type WorldAPI } from './types';
import { makeLabel } from './labels';

interface PlanetSpec {
  name: string;
  radius: number;
  size: number;
  color: number;
  periodDays: number;
  facts: string;
  texKey?: 'mercury' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune';
  atmosphere?: number; // atmosphere tint (undefined = none)
  ring?: boolean;
}

const PLANETS: PlanetSpec[] = [
  { name: 'Mercury', radius: 1.5, size: 0.09, color: 0x9c8e82, periodDays: 88, facts: 'Swift planet · year 88 days', texKey: 'mercury' },
  { name: 'Venus', radius: 1.95, size: 0.15, color: 0xe8b06a, periodDays: 225, facts: 'Hottest planet · retrograde spin', texKey: 'venus', atmosphere: 0xf2d8a8 },
  { name: 'Earth', radius: 2.6, size: 0.16, color: 0x3f8cff, periodDays: 365.25, facts: '1 AU · the only known life', texKey: 'earth', atmosphere: 0x4da6ff },
  { name: 'Mars', radius: 3.15, size: 0.12, color: 0xe05a3a, periodDays: 687, facts: 'Year 687 days · Olympus Mons', texKey: 'mars' },
  { name: 'Jupiter', radius: 4.3, size: 0.46, color: 0xd8a05e, periodDays: 4333, facts: 'Giant · year 11.9 Earth years', texKey: 'jupiter', atmosphere: 0xd8a878 },
  { name: 'Saturn', radius: 5.45, size: 0.38, color: 0xe3cf9a, periodDays: 10759, facts: 'Ringed giant · year 29.5 years', texKey: 'saturn', atmosphere: 0xe0d0a0, ring: true },
  { name: 'Uranus', radius: 6.5, size: 0.28, color: 0x7fe3e0, periodDays: 30687, facts: 'Ice giant · rolls on its side', texKey: 'uranus', atmosphere: 0x7fe3e0 },
  { name: 'Neptune', radius: 7.45, size: 0.27, color: 0x4a6de0, periodDays: 60190, facts: 'Windiest world · year 165 years', texKey: 'neptune', atmosphere: 0x5a7df0 },
];

const ATMO_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const ATMO_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vView;
  uniform vec3 uColor;
  void main() {
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 3.0);
    gl_FragColor = vec4(uColor * rim * 1.8, rim);
  }
`;

function makeAtmosphere(size: number, color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(size * 1.22, 32, 24),
    new THREE.ShaderMaterial({
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_FRAG,
      uniforms: { uColor: { value: new THREE.Color(color) } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  return mesh;
}

export function buildSolar(ctx: BuilderCtx): WorldAPI {
  const { world, labelLayer, shakeCamera } = ctx;
  const grabbables: THREE.Object3D[] = [];
  const orbits = new OrbitSystem();
  const facts = new Map<string, string>();
  const labels: THREE.Sprite[] = [];
  const tmp = new THREE.Vector3();
  let hole: BlackHole | null = null;

  // Sun: info-only, textured + double corona on High.
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffc766 });
  sunMat.userData.texMap = ctx.planetTex.sun;
  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.85, 48, 32), sunMat);
  sun.name = 'Sol';
  sun.userData.grabbable = false;
  world.add(sun);
  grabbables.push(sun);
  facts.set('Sol', 'G2V star · 99.86% of system mass');
  for (const [scale, opacity] of [[3.2, 0.85], [5.2, 0.35]] as Array<[number, number]>) {
    const corona = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: ctx.glowTex,
        color: 0xffa64d,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    corona.scale.set(scale, scale, 1);
    sun.add(corona);
  }

  PLANETS.forEach((spec, i) => {
    const mat = new THREE.MeshStandardMaterial({
      color: spec.color,
      emissive: spec.color,
      emissiveIntensity: 0.25,
      roughness: 0.7,
      metalness: 0.05,
    });
    if (spec.texKey) mat.userData.texMap = ctx.planetTex[spec.texKey];
    const planet = new THREE.Mesh(new THREE.SphereGeometry(spec.size, 40, 28), mat);
    planet.name = spec.name;
    planet.userData.orbitBody = true;
    const angle = (i / PLANETS.length) * Math.PI * 2 + 0.6;
    world.add(planet);
    grabbables.push(planet);
    orbits.register(planet, spec.radius, angle, spec.periodDays);
    facts.set(spec.name, spec.facts);

    if (spec.atmosphere !== undefined) {
      planet.add(makeAtmosphere(spec.size, spec.atmosphere));
    }
    if (spec.ring) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(spec.size * 1.3, spec.size * 2.1, 48),
        new THREE.MeshBasicMaterial({
          color: 0xd9c49a,
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2 + 0.25;
      planet.add(ring);
    }

    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 96; k++) {
      const a = (k / 96) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * spec.radius, 0, Math.sin(a) * spec.radius));
    }
    world.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x1c4a5e, transparent: true, opacity: 0.6 }),
      ),
    );
    const label = makeLabel(spec.name);
    labelLayer.add(label);
    labels.push(label);
  });

  // Earth's moon (decor, follows Earth).
  const earth = orbits.bodies.find((b) => b.name === 'Earth');
  const moonMat = new THREE.MeshStandardMaterial({ color: 0xb8b8bc, roughness: 0.95 });
  moonMat.userData.texMap = ctx.planetTex.moon;
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), moonMat);
  world.add(moon);
  let moonAngle = 1.2;

  // Asteroid belt between Mars and Jupiter (single instanced draw call).
  const belt = new OrbitingDebris(350, 3.55, 4.05, 0.035, 0x8a7a68, 42);
  world.add(belt.mesh);

  // Halleyesque comet on a stretched ellipse.
  const cometMat = new THREE.MeshStandardMaterial({ color: 0xcfe8ff, roughness: 0.6 });
  const comet = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), cometMat);
  const cometGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: ctx.glowTex,
      color: 0x9fd8ff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  cometGlow.scale.set(0.9, 0.9, 1);
  comet.add(cometGlow);
  world.add(comet);
  let cometAngle = 0.4;
  const COMET_A = 8.2;
  const COMET_E = 0.68;

  // Distant black hole on the edge of the sky (hover info only).
  hole = buildBlackHole({ horizon: 0.85, diskInner: 1.5, diskOuter: 3.1, diskSpeed: 0.7 }, ctx.glowTex);
  hole.group.position.set(-17, 3.5, -11);
  world.add(hole.group);
  const holeHit = new THREE.Mesh(
    new THREE.SphereGeometry(2.6, 12, 8),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  holeHit.name = 'M87* analogue';
  holeHit.userData.grabbable = false;
  holeHit.position.copy(hole.group.position);
  world.add(holeHit);
  grabbables.push(holeHit);
  facts.set('M87* analogue', 'Supermassive black hole · 6.5B suns (decor, out of reach)');

  const grid = new THREE.GridHelper(26, 40, 0x0e3a4a, 0x0a1c2a);
  grid.position.y = -3;
  world.add(grid);

  // Sun-crash kit: ramming a grabbed planet sunward (< 1.35 held 0.6 s)
  // vaporizes it — flash, debris, shake, then it reforms at home.
  const impactFlash = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: ctx.glowTex, color: 0xfff2c8, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  impactFlash.visible = false;
  world.add(impactFlash);
  let impactT = 1e9;
  const impactDebris = new ParticlePool(160, 0xffb347, 0.09);
  world.add(impactDebris.points);
  const vaporized = new Map<THREE.Mesh, number>(); // planet → respawn countdown

  return {
    grabbables,
    background: 'nebula',
    view: { distance: 13.5, pitch: 0.42, yaw: 0 },
    update(dt: number, elapsed: number): void {
      orbits.update(dt * TIME_DAYS_PER_SECOND);
      for (const planet of orbits.bodies) planet.rotation.y += dt * 0.4;
      sun.rotation.y += dt * 0.05;
      belt.update(dt);
      hole?.update(dt, elapsed);
      impactDebris.update(dt);
      // Sun dives: a grabbed planet pushed inside r 1.35 charges 0.6 s, then
      // vaporizes (shrinks, flashes, scatters) and reforms at home in 4 s.
      // Mercury's home (1.5) is safely outside the trigger zone.
      for (const planet of orbits.bodies) {
        const st = orbits.get(planet);
        if (!st) continue;
        const left = vaporized.get(planet);
        if (left !== undefined) {
          const rest = left - dt;
          if (rest <= 0) {
            vaporized.delete(planet);
            st.radius = st.home.radius;
            st.periodDays = st.home.periodDays;
            planet.scale.setScalar(planet.userData.homeScale as number);
          } else {
            vaporized.set(planet, rest);
          }
          continue;
        }
        if (planet.userData.grabbed && st.radius < 1.35) {
          const charge = (planet.userData.diveT as number | undefined ?? 0) + dt;
          planet.userData.diveT = charge;
          if (charge >= 0.6) {
            planet.userData.diveT = 0;
            planet.userData.homeScale = planet.scale.x;
            planet.scale.setScalar(0.01);
            planet.getWorldPosition(tmp);
            impactFlash.position.copy(tmp);
            impactFlash.visible = true;
            impactT = 0;
            for (let i = 0; i < 90; i++) {
              const a = Math.random() * Math.PI * 2;
              const sp = 2 + Math.random() * 4;
              impactDebris.spawn(
                tmp.x, tmp.y, tmp.z,
                Math.cos(a) * sp, 1 + Math.random() * 2, Math.sin(a) * sp,
              );
            }
            shakeCamera(0.5);
            vaporized.set(planet, 4.0);
          }
        } else {
          planet.userData.diveT = 0;
        }
      }
      if (impactT < 1.0) {
        impactT += dt;
        const k = Math.min(1, impactT / 1.0);
        impactFlash.visible = true;
        (impactFlash.material as THREE.SpriteMaterial).opacity = 0.95 * (1 - k);
        const sc = 1.5 + k * 5;
        impactFlash.scale.set(sc, sc, 1);
      } else {
        impactFlash.visible = false;
      }
      if (earth) {
        moonAngle += ((dt * TIME_DAYS_PER_SECOND * Math.PI * 2) / 27.3) % (Math.PI * 2);
        moon.position.set(
          earth.position.x + Math.cos(moonAngle) * 0.34,
          Math.sin(moonAngle * 2) * 0.05,
          earth.position.z + Math.sin(moonAngle) * 0.34,
        );
      }
      // Comet: constant angular momentum (fast near the sun, lazy far out).
      const r = (COMET_A * (1 - COMET_E * COMET_E)) / (1 + COMET_E * Math.cos(cometAngle));
      cometAngle += (dt * 2.6) / (r * r);
      comet.position.set(Math.cos(cometAngle) * r, 0.4 * Math.sin(cometAngle * 2), Math.sin(cometAngle) * r);
      const tailBoost = THREE.MathUtils.clamp(2.2 - r * 0.22, 0.5, 1.6);
      cometGlow.scale.set(0.9 * tailBoost, 0.9 * tailBoost, 1);
      for (let i = 0; i < orbits.bodies.length; i++) {
        const body = orbits.bodies[i];
        body.getWorldPosition(tmp);
        const size = (body.geometry as THREE.SphereGeometry).parameters.radius;
        labels[i].position.set(tmp.x, tmp.y + size + 0.3, tmp.z);
      }
    },
    setOrbitFromPoint(mesh: THREE.Mesh, localPoint: THREE.Vector3): void {
      orbits.setFromPoint(mesh, localPoint, MIN_ORBIT_RADIUS, MAX_ORBIT_RADIUS);
    },
    bodyInfo(name: string | null): string | null {
      if (!name) return null;
      const f = facts.get(name);
      if (!f) return null;
      const body = orbits.bodies.find((b) => b.name === name);
      if (body) {
        if (vaporized.has(body)) {
          const left = vaporized.get(body) ?? 0;
          return `${name} — vaporized in the sun! Reforming in ${left.toFixed(1)} s…`;
        }
        const s = orbits.get(body);
        if (s) return `${name} — ${f} · r ${s.radius.toFixed(2)} · year ${s.periodDays.toFixed(0)} d`;
      }
      return `${name} — ${f}`;
    },
    dispose(): void {
      disposeGroup(world);
      disposeGroup(labelLayer);
    },
  };
}
