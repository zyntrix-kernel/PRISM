// BLOCK preset: voxel playground with gravity physics. Grab a cube, drag it
// anywhere, release to drop it — it falls under gravity, bounces, settles on
// the baseplate or on top of another cube, and slides with friction if you
// toss it. Stacking, momentum transfer, squash-and-stretch on impact, dust
// puffs, plus a few premium environment touches (shiny plate, AO vignette,
// per-cube glow rings).

import * as THREE from 'three';
import { disposeGroup, type BuilderCtx, type WorldAPI } from './types';

const VOXELS: Array<{ name: string; color: number; pos: [number, number, number] }> = [
  { name: 'Red voxel', color: 0xe04848, pos: [-1.8, 0.3, 0.6] },
  { name: 'Orange voxel', color: 0xe08a3a, pos: [-0.6, 0.3, 1.2] },
  { name: 'Gold voxel', color: 0xe8c84a, pos: [0.6, 0.3, 0.6] },
  { name: 'Green voxel', color: 0x58c858, pos: [1.8, 0.3, 1.2] },
  { name: 'Blue voxel', color: 0x4878e8, pos: [-1.2, 0.3, -1.2] },
  { name: 'Violet voxel', color: 0x9a5ce0, pos: [0, 0.3, -1.2] },
  { name: 'White voxel', color: 0xd8dce8, pos: [1.2, 0.3, -1.2] },
  { name: 'Cyan voxel', color: 0x48c8d8, pos: [0, 0.9, 0] },
];

// --- Physics constants (scene units = meters, seconds) -------------------
const CUBE = 0.6;            // cube edge length
const GROUND_Y = 0.3;        // center of a cube resting on the baseplate
const GRID = 0.6;            // snap grid (matches PrismConfig.interaction.gridSnap)
const GRAVITY = 9.8;        // m/s^2
const BOUNCE_DAMP = -0.3;   // vy multiplier on bounce (negative = rebound)
const MAX_BOUNCES = 2;      // stop bouncing after this many impacts
const SLIDE_FRICTION = 0.92; // per-frame horizontal damping at 60 fps
const REST_VEL = 0.04;       // below this magnitude → snap velocity to 0
const THROW_THRESHOLD = 1.2; // m/s; faster than this on release → toss it
const HISTORY_SAMPLES = 4;  // grab-position samples kept per cube
const DUST_COUNT = 64;       // pooled dust particles (one buffer for the world)
const DUST_LIFE = 0.3;      // 300 ms per spec

export function buildBlocks(ctx: BuilderCtx): WorldAPI {
  const { world, glowTex } = ctx;
  const grabbables: THREE.Object3D[] = [];
  const cubes: THREE.Mesh[] = [];

  // === Baseplate (slightly shiny) =========================================
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(6, 0.4, 6),
    new THREE.MeshStandardMaterial({
      color: 0x182838,
      roughness: 0.5,
      metalness: 0.3,
    }),
  );
  plate.position.y = -0.2;
  plate.name = 'Baseplate';
  plate.userData.grabbable = false;
  world.add(plate);
  grabbables.push(plate);

  // === AO vignette on the baseplate (darker near edges) ==================
  // A transparent black plane sitting just above the plate; alpha is 0 at
  // the center and rises toward the rim, giving a soft ambient-occlusion
  // feel without postprocessing.
  const AO_SIZE = 64;
  const aoData = new Uint8Array(AO_SIZE * AO_SIZE * 4);
  for (let y = 0; y < AO_SIZE; y++) {
    for (let x = 0; x < AO_SIZE; x++) {
      const dx = (x / (AO_SIZE - 1)) * 2 - 1;
      const dz = (y / (AO_SIZE - 1)) * 2 - 1;
      const r = Math.min(1, Math.sqrt(dx * dx + dz * dz));
      // Quadratic ramp: alpha 0 at center, ~0.7 at the rim.
      const alpha = Math.floor(Math.min(1, r * r * 1.4) * 180);
      const i = (y * AO_SIZE + x) * 4;
      aoData[i] = 0;
      aoData[i + 1] = 0;
      aoData[i + 2] = 0;
      aoData[i + 3] = alpha;
    }
  }
  const aoTex = new THREE.DataTexture(aoData, AO_SIZE, AO_SIZE, THREE.RGBAFormat);
  aoTex.needsUpdate = true;
  const aoMat = new THREE.MeshBasicMaterial({
    map: aoTex,
    transparent: true,
    depthWrite: false,
  });
  aoMat.userData.ownMap = true; // freed with the world on preset switch
  const aoPlane = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), aoMat);
  aoPlane.rotation.x = -Math.PI / 2;
  aoPlane.position.y = 0.0015;
  world.add(aoPlane);

  // === Stud grid (toy-brick studs, slightly shinier) =====================
  const studGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.08, 12);
  const studMat = new THREE.MeshStandardMaterial({
    color: 0x24384e,
    roughness: 0.55,
    metalness: 0.2,
  });
  const studs = new THREE.InstancedMesh(studGeo, studMat, 100);
  const dummy = new THREE.Object3D();
  let si = 0;
  for (let ix = 0; ix < 10; ix++) {
    for (let iz = 0; iz < 10; iz++) {
      dummy.position.set(-2.7 + ix * 0.6, 0.04, -2.7 + iz * 0.6);
      dummy.updateMatrix();
      studs.setMatrixAt(si++, dummy.matrix);
    }
  }
  world.add(studs);

  // === Shared cube geometry (glossy top face via multi-material) =========
  const geo = new THREE.BoxGeometry(CUBE, CUBE, CUBE);

  // === Dust puff particle pool (one Points for the whole world) ==========
  // Additive Points: vertex-color encodes a per-particle grey dust tint,
  // and we fade each particle by scaling its color toward black as life
  // decays (additive: black = invisible, so no per-particle alpha needed).
  const dustPos = new Float32Array(DUST_COUNT * 3);
  const dustCol = new Float32Array(DUST_COUNT * 3);
  const dustBaseCol = new Float32Array(DUST_COUNT * 3); // full-intensity tint
  const dustLife = new Float32Array(DUST_COUNT);
  const dustVel = new Float32Array(DUST_COUNT * 3);
  for (let i = 0; i < DUST_COUNT; i++) {
    dustPos[i * 3] = 999; // hide by default
    dustLife[i] = 0;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 3));
  const dustMat = new THREE.PointsMaterial({
    size: 0.2,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
    map: glowTex,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  world.add(dust);
  let dustCursor = 0;

  /** Spawn 4 dust puffs around a landing point, tinted by the block color. */
  const spawnDust = (x: number, y: number, z: number, tint: THREE.Color): void => {
    for (let n = 0; n < 4; n++) {
      const i = dustCursor;
      dustCursor = (dustCursor + 1) % DUST_COUNT;
      const ang = (n / 4) * Math.PI * 2 + Math.random() * 0.6;
      const r = 0.32 + Math.random() * 0.12; // just outside the cube edge (0.3)
      dustPos[i * 3] = x + Math.cos(ang) * r;
      dustPos[i * 3 + 1] = y + 0.04;
      dustPos[i * 3 + 2] = z + Math.sin(ang) * r;
      // Outward + slight upward drift
      dustVel[i * 3] = Math.cos(ang) * 0.55;
      dustVel[i * 3 + 1] = 0.4 + Math.random() * 0.3;
      dustVel[i * 3 + 2] = Math.sin(ang) * 0.55;
      // Grey dust with a faint tint of the block color
      const grey = 0.55 + Math.random() * 0.15;
      dustBaseCol[i * 3] = grey * (0.7 + tint.r * 0.5);
      dustBaseCol[i * 3 + 1] = grey * (0.7 + tint.g * 0.5);
      dustBaseCol[i * 3 + 2] = grey * (0.7 + tint.b * 0.5);
      dustCol[i * 3] = dustBaseCol[i * 3];
      dustCol[i * 3 + 1] = dustBaseCol[i * 3 + 1];
      dustCol[i * 3 + 2] = dustBaseCol[i * 3 + 2];
      dustLife[i] = DUST_LIFE;
    }
    dustGeo.attributes.position.needsUpdate = true;
    dustGeo.attributes.color.needsUpdate = true;
  };

  // === Cubes (multi-material: glossy top, matte sides/bottom) ============
  for (const v of VOXELS) {
    const sideMat = new THREE.MeshStandardMaterial({
      color: v.color,
      emissive: v.color,
      emissiveIntensity: 0.18,
      roughness: 0.55,
      metalness: 0.05,
    });
    const topMat = new THREE.MeshStandardMaterial({
      color: v.color,
      emissive: v.color,
      emissiveIntensity: 0.32,
      roughness: 0.22,
      metalness: 0.45,
    });
    // BoxGeometry face order: +X, -X, +Y (top), -Y (bottom), +Z, -Z
    const cube = new THREE.Mesh(geo, [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
    cube.name = v.name;
    cube.position.set(...v.pos);

    const tint = new THREE.Color(v.color);

    // Glow ring under the cube: thin additive sprite at y≈0.01, matches the
    // block color so the cubes look like they emit light into the baseplate.
    const ring = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: v.color,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    ring.scale.set(0.95, 0.95, 0.95);
    ring.position.set(v.pos[0], 0.011, v.pos[2]);
    world.add(ring);

    cube.userData.gridSnap = true;
    cube.userData.vy = 0;
    cube.userData.vx = 0;
    cube.userData.vz = 0;
    cube.userData.bounces = 0;
    // The cyan cube at [0, 0.9, 0] is intentionally floating — let it fall.
    cube.userData.settled = v.pos[1] === GROUND_Y;
    cube.userData.prevGrabbed = false;
    cube.userData.squashT = 0;
    cube.userData.tint = tint;
    cube.userData.glowRing = ring;
    cube.userData.history = new Float32Array(HISTORY_SAMPLES * 4); // x,y,z,t per sample
    cube.userData.historyLen = 0;

    world.add(cube);
    grabbables.push(cube);
    cubes.push(cube);
  }

  // === Helpers ============================================================

  /**
   * Returns the highest resting Y for `cube` given the current positions of
   * the other (non-grabbed) cubes: either the baseplate (y=0.3) or the top
   * of another cube whose XZ footprint overlaps this one. Only cubes
   * strictly BELOW this cube are considered as supports.
   */
  const restYFor = (cube: THREE.Mesh): number => {
    let restY = GROUND_Y;
    for (const other of cubes) {
      if (other === cube) continue;
      if (other.userData.grabbed) continue; // grabbed cubes move; ignore
      const dx = Math.abs(cube.position.x - other.position.x);
      const dz = Math.abs(cube.position.z - other.position.z);
      if (dx < CUBE && dz < CUBE && other.position.y < cube.position.y - 0.01) {
        const top = other.position.y + CUBE;
        if (top > restY) restY = top;
      }
    }
    return restY;
  };

  /**
   * Resolve same-level XZ overlap between `cube` and any other cube: push
   * `cube` back to non-overlap and transfer half its slide momentum to the
   * other (a simple impulse). Only fires when the cube is roughly on the
   * ground (small vy) so falling cubes pass through stacks cleanly.
   */
  const resolveSlideCollision = (cube: THREE.Mesh): void => {
    for (const other of cubes) {
      if (other === cube) continue;
      if (other.userData.grabbed) continue;
      const dx = cube.position.x - other.position.x;
      const dz = cube.position.z - other.position.z;
      const dy = Math.abs(cube.position.y - other.position.y);
      if (Math.abs(dx) < CUBE && Math.abs(dz) < CUBE && dy < 0.15) {
        const overlapX = CUBE - Math.abs(dx);
        const overlapZ = CUBE - Math.abs(dz);
        if (overlapX < overlapZ) {
          const sign = dx === 0 ? 1 : Math.sign(dx);
          cube.position.x = other.position.x + sign * CUBE;
          if (other.userData.settled) {
            other.userData.settled = false;
            other.userData.vx = cube.userData.vx * 0.5;
          }
          cube.userData.vx *= 0.3;
        } else {
          const sign = dz === 0 ? 1 : Math.sign(dz);
          cube.position.z = other.position.z + sign * CUBE;
          if (other.userData.settled) {
            other.userData.settled = false;
            other.userData.vz = cube.userData.vz * 0.5;
          }
          cube.userData.vz *= 0.3;
        }
      }
    }
  };

  /**
   * Push `cube`'s current position + `elapsed` into its grab-velocity ring
   * buffer (used to estimate release velocity for throws).
   */
  const pushHistory = (cube: THREE.Mesh, elapsed: number): void => {
    const buf = cube.userData.history as Float32Array;
    const len = cube.userData.historyLen as number;
    if (len < HISTORY_SAMPLES) {
      const off = len * 4;
      buf[off] = cube.position.x;
      buf[off + 1] = cube.position.y;
      buf[off + 2] = cube.position.z;
      buf[off + 3] = elapsed;
      cube.userData.historyLen = len + 1;
    } else {
      // Shift left by one sample (cheap for N=4)
      buf.copyWithin(0, 4, HISTORY_SAMPLES * 4);
      const off = (HISTORY_SAMPLES - 1) * 4;
      buf[off] = cube.position.x;
      buf[off + 1] = cube.position.y;
      buf[off + 2] = cube.position.z;
      buf[off + 3] = elapsed;
    }
  };

  /**
   * Estimate the recent horizontal hand velocity for `cube` (units/sec).
   * Uses the oldest vs newest sample to smooth out per-frame jitter.
   */
  const estimateVelocity = (cube: THREE.Mesh): { vx: number; vz: number } => {
    const buf = cube.userData.history as Float32Array;
    const len = cube.userData.historyLen as number;
    if (len < 2) return { vx: 0, vz: 0 };
    const newest = (len - 1) * 4;
    const oldest = 0;
    const dt = buf[newest + 3] - buf[oldest + 3];
    if (dt < 1e-3) return { vx: 0, vz: 0 };
    return {
      vx: (buf[newest] - buf[oldest]) / dt,
      vz: (buf[newest + 2] - buf[oldest + 2]) / dt,
    };
  };

  // === WorldAPI ===========================================================
  return {
    grabbables,
    background: 0x0a0d18,
    view: { distance: 8.5, pitch: 0.62, yaw: 0.5 },
    update(dt: number, elapsed: number): void {
      // Cap dt so a long frame (tab switch, GC) doesn't teleport cubes
      // through the floor.
      const step = Math.min(dt, 1 / 30);
      const friction = Math.pow(SLIDE_FRICTION, step * 60);

      // --- Per-cube physics ---
      for (const cube of cubes) {
        const grabbed = !!cube.userData.grabbed;
        const justReleased = cube.userData.prevGrabbed && !grabbed;

        // Detect release: estimate throw velocity from position history.
        if (justReleased) {
          const { vx, vz } = estimateVelocity(cube);
          const speed = Math.hypot(vx, vz);
          if (speed > THROW_THRESHOLD) {
            cube.userData.vx = vx;
            cube.userData.vz = vz;
          }
          cube.userData.vy = 0;
          cube.userData.bounces = 0;
          cube.userData.settled = false;
          cube.userData.historyLen = 0;
        }

        if (grabbed) {
          // Track position for next release's velocity estimate.
          pushHistory(cube, elapsed);
          // Glow ring follows the cube's XZ; fades with lift height.
          const ring = cube.userData.glowRing as THREE.Sprite;
          ring.position.x = cube.position.x;
          ring.position.z = cube.position.z;
          const liftG = Math.max(0, cube.position.y - GROUND_Y);
          (ring.material as THREE.SpriteMaterial).opacity = Math.max(0.08, 0.55 - liftG * 0.18);
          ring.scale.setScalar(0.95 + liftG * 0.05);
          cube.userData.prevGrabbed = true;
          continue;
        }

        // Already at rest? Skip the physics tick to avoid the gravity
        // "dip-and-snap" oscillation. Still update the glow ring.
        if (cube.userData.settled) {
          const ring = cube.userData.glowRing as THREE.Sprite;
          ring.position.x = cube.position.x;
          ring.position.z = cube.position.z;
          (ring.material as THREE.SpriteMaterial).opacity = 0.55;
          ring.scale.setScalar(0.95);
          cube.userData.prevGrabbed = false;
          continue;
        }

        // --- Physics tick (free body) ---
        // Gravity
        cube.userData.vy -= GRAVITY * step;

        // Integrate position (simple Euler)
        cube.position.x += cube.userData.vx * step;
        cube.position.y += cube.userData.vy * step;
        cube.position.z += cube.userData.vz * step;

        // Vertical collision: platform or top of another cube.
        const restY = restYFor(cube);
        if (cube.position.y < restY) {
          cube.position.y = restY;
          if (cube.userData.vy < -0.4) {
            // Hard enough impact: dust, squash, bounce.
            spawnDust(
              cube.position.x,
              restY - CUBE / 2,
              cube.position.z,
              cube.userData.tint as THREE.Color,
            );
            cube.userData.squashT = 1;
            if (cube.userData.bounces < MAX_BOUNCES) {
              cube.userData.vy *= BOUNCE_DAMP; // rebound: vy * -0.3
              cube.userData.bounces++;
            } else {
              cube.userData.vy = 0;
              cube.userData.bounces = 0;
            }
          } else {
            cube.userData.vy = 0;
            cube.userData.bounces = 0;
          }
        }

        // Friction + slide-collision: only when settled on the rest surface
        // AND not still bouncing hard.
        if (Math.abs(cube.position.y - restY) < 0.05 && Math.abs(cube.userData.vy) < 0.5) {
          cube.userData.vx *= friction;
          cube.userData.vz *= friction;
          if (Math.abs(cube.userData.vx) < REST_VEL) cube.userData.vx = 0;
          if (Math.abs(cube.userData.vz) < REST_VEL) cube.userData.vz = 0;
          resolveSlideCollision(cube);
        }

        // Settle: snap XZ to grid when fully at rest.
        const speed = Math.hypot(cube.userData.vx, cube.userData.vy, cube.userData.vz);
        if (speed < REST_VEL && Math.abs(cube.position.y - restY) < 0.01) {
          cube.position.x = Math.round(cube.position.x / GRID) * GRID;
          cube.position.z = Math.round(cube.position.z / GRID) * GRID;
          cube.position.y = restY;
          cube.userData.vx = 0;
          cube.userData.vy = 0;
          cube.userData.vz = 0;
          cube.userData.bounces = 0;
          cube.userData.settled = true;
        }

        // Glow ring: follow XZ, fade with lift above the rest surface.
        const ring = cube.userData.glowRing as THREE.Sprite;
        ring.position.x = cube.position.x;
        ring.position.z = cube.position.z;
        const lift = Math.max(0, cube.position.y - restY);
        (ring.material as THREE.SpriteMaterial).opacity = Math.max(0.08, 0.55 - lift * 0.18);
        ring.scale.setScalar(0.95 + lift * 0.05);

        cube.userData.prevGrabbed = false;
      }

      // --- Squash spring-back (runs every frame, regardless of state) ---
      for (const cube of cubes) {
        if (cube.userData.squashT > 0) {
          cube.userData.squashT -= step / 0.1; // 100 ms spring-back
          if (cube.userData.squashT < 0) cube.userData.squashT = 0;
          // Ease-out sine: full squash at impact (t=1), restored at t=0.
          const k = Math.sin(cube.userData.squashT * Math.PI * 0.5);
          cube.scale.set(1 + 0.07 * k, 1 - 0.15 * k, 1 + 0.07 * k);
        } else if (cube.scale.y !== 1) {
          cube.scale.set(1, 1, 1);
        }
      }

      // --- Dust update ---
      let needsPos = false;
      let needsCol = false;
      for (let i = 0; i < DUST_COUNT; i++) {
        if (dustLife[i] <= 0) continue;
        dustLife[i] -= step;
        if (dustLife[i] <= 0) {
          dustPos[i * 3] = 999; // park off-screen
          needsPos = true;
          continue;
        }
        dustPos[i * 3] += dustVel[i * 3] * step;
        dustPos[i * 3 + 1] += dustVel[i * 3 + 1] * step;
        dustPos[i * 3 + 2] += dustVel[i * 3 + 2] * step;
        // Drag
        dustVel[i * 3] *= 1 - step * 1.2;
        dustVel[i * 3 + 1] *= 1 - step * 1.5;
        dustVel[i * 3 + 2] *= 1 - step * 1.2;
        // Fade color toward black (additive: black = invisible)
        const frac = dustLife[i] / DUST_LIFE;
        dustCol[i * 3] = dustBaseCol[i * 3] * frac;
        dustCol[i * 3 + 1] = dustBaseCol[i * 3 + 1] * frac;
        dustCol[i * 3 + 2] = dustBaseCol[i * 3 + 2] * frac;
        needsPos = true;
        needsCol = true;
      }
      if (needsPos) dustGeo.attributes.position.needsUpdate = true;
      if (needsCol) dustGeo.attributes.color.needsUpdate = true;
    },

    bodyInfo(name: string | null): string | null {
      if (!name) return null;
      if (name === 'Baseplate') return 'Baseplate — build your tower here';
      return `${name} — drag it, release to drop`;
    },

    dispose(): void {
      disposeGroup(world);
    },
  };
}
