// NEBULA preset: a volumetric procedural nebula with flowing particle clouds.
// Colors shift over time (teal → magenta → gold). Particles drift in a
// noise-driven flow field, creating organic, living cloud structures.

import * as THREE from 'three';
import { disposeGroup, type BuilderCtx, type WorldAPI } from './types';

export function buildNebula(ctx: BuilderCtx): WorldAPI {
  const { world, quality } = ctx;
  const grabbables: THREE.Object3D[] = [];

  const COUNT = quality === 'ultra' ? 8000 : quality === 'high' ? 4000 : 2000;

  // ── Particle cloud (the nebula body) ─────────────────────────────────
  const pos = new Float32Array(COUNT * 3);
  const col = new Float32Array(COUNT * 3);
  const basePos = new Float32Array(COUNT * 3); // for flow animation
  const flowSeed = new Float32Array(COUNT); // per-particle phase offset

  for (let i = 0; i < COUNT; i++) {
    // Distribute in a 3D blob (cloud shape, not a sphere)
    const r = Math.pow(Math.random(), 0.5) * 8;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    // Add some elongation (nebulae aren't spherical)
    const x = r * Math.sin(phi) * Math.cos(theta) * 1.2;
    const y = r * Math.cos(phi) * 0.6;
    const z = r * Math.sin(phi) * Math.sin(theta) * 1.2;

    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    basePos[i * 3] = x;
    basePos[i * 3 + 1] = y;
    basePos[i * 3 + 2] = z;
    flowSeed[i] = Math.random() * Math.PI * 2;

    // Color: varies by distance from center (hotter = bluer, cooler = redder)
    const distNorm = r / 8;
    const c = new THREE.Color();
    if (distNorm < 0.3) c.setHSL(0.55, 0.8, 0.6); // blue-white core
    else if (distNorm < 0.6) c.setHSL(0.85, 0.7, 0.5); // magenta mid
    else c.setHSL(0.08, 0.7, 0.45); // gold edges

    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const mat = new THREE.PointsMaterial({
    size: quality === 'ultra' ? 0.08 : quality === 'high' ? 0.12 : 0.18,
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const cloud = new THREE.Points(geo, mat);
  world.add(cloud);

  // ── Background stars (denser for nebula context) ───────────────────
  const STAR_COUNT = quality === 'ultra' ? 600 : 300;
  const starPos = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 60;
    starPos[i * 3 + 1] = (Math.random() - 0.5) * 60;
    starPos[i * 3 + 2] = (Math.random() - 0.5) * 60;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat2 = new THREE.PointsMaterial({
    color: 0xaaccff, size: 0.08, transparent: true, opacity: 0.5, depthWrite: false,
  });
  const bgStars = new THREE.Points(starGeo, starMat2);
  world.add(bgStars);

  // ── Central bright core (glow sprite) ──────────────────────────────
  const coreSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      color: 0x88ddff, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  coreSprite.scale.set(3, 3, 1);
  world.add(coreSprite);

  return {
    grabbables,
    background: 0x020308,
    view: { distance: 16, pitch: 0.2, yaw: 0 },
    update(dt: number, elapsed: number): void {
      // Flow field: particles drift in a smooth noise-like pattern
      const positions = geo.attributes.position.array as Float32Array;
      for (let i = 0; i < COUNT; i++) {
        const seed = flowSeed[i];
        const fx = Math.sin(elapsed * 0.3 + seed) * 0.3;
        const fy = Math.cos(elapsed * 0.25 + seed * 1.3) * 0.2;
        const fz = Math.sin(elapsed * 0.2 + seed * 0.7) * 0.3;

        positions[i * 3] = basePos[i * 3] + fx;
        positions[i * 3 + 1] = basePos[i * 3 + 1] + fy;
        positions[i * 3 + 2] = basePos[i * 3 + 2] + fz;
      }
      geo.attributes.position.needsUpdate = true;

      // Color shift over time (slow hue rotation)
      const hueShift = elapsed * 0.02;
      const colors = geo.attributes.color.array as Float32Array;
      for (let i = 0; i < COUNT; i++) {
        const dist = Math.hypot(basePos[i * 3], basePos[i * 3 + 1], basePos[i * 3 + 2]) / 8;
        const c = new THREE.Color();
        const h = (0.55 + dist * 0.3 + hueShift) % 1;
        c.setHSL(h, 0.7, 0.5);
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }
      geo.attributes.color.needsUpdate = true;

      // Slow rotation
      cloud.rotation.y += dt * 0.05;
      bgStars.rotation.y -= dt * 0.02;

      // Core pulse
      const pulse = 3 + Math.sin(elapsed * 0.8) * 0.5;
      coreSprite.scale.set(pulse, pulse, 1);
      (coreSprite.material as THREE.SpriteMaterial).opacity = 0.25 + Math.sin(elapsed * 0.8) * 0.08;
    },
    coachHint() { return 'A living nebula — colors shift and particles flow'; },
    dispose() { disposeGroup(world); },
  };
}
