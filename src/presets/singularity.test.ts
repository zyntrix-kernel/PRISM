// Integration test for the supermassive detonation: a probe held inside
// r 2.6 fuses the blast, the galaxy flies apart, then reforms at home.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildSingularity } from './singularity';
import type { BuilderCtx, WorldAPI } from './types';
import type { PlanetTextureSet } from '../textures';

function makeCtx(): BuilderCtx {
  const tex = new THREE.Texture();
  return {
    world: new THREE.Group(),
    labelLayer: new THREE.Group(),
    glowTex: tex,
    nebulaTex: tex,
    planetTex: {} as PlanetTextureSet,
    shakeCamera: () => {},
    quality: 'medium' as const,
  };
}

describe('singularity detonation integration', () => {
  it('goes extreme, flings the system, then reforms', () => {
    const ctx = makeCtx();
    const world: WorldAPI = buildSingularity(ctx);
    const probes = world.grabbables.filter(
      (o) => (o as THREE.Mesh).userData.orbitBody,
    ) as THREE.Mesh[];
    expect(probes.length).toBe(3);

    // Ram Probe I inside the fuse radius and hold past the 0.5 s fuse.
    // (Fuse is 0.5 s: the first ~30 frames only charge it.)
    const p1 = probes[0];
    p1.userData.grabbed = true;
    world.setOrbitFromPoint?.(p1, new THREE.Vector3(2.45, 0, 0));
    let t = 0;
    for (let i = 0; i < 60; i++) {
      t += 1 / 60;
      world.update?.(1 / 60, t);
    }
    expect(world.bodyInfo?.('Probe I')).toContain('DETONATION');
    expect(ctx.world.scale.x).toBeLessThan(0.95); // pulled back wide shot

    // Let the full ~9 s cinematic play out: detonation + galaxy reveal + explosion + reset.
    for (let i = 0; i < 560; i++) {
      t += 1 / 60;
      world.update?.(1 / 60, t);
    }
    expect(ctx.world.scale.x).toBe(1);
    expect(world.bodyInfo?.('Probe I')).not.toContain('DETONATION');
    const home = p1.position.length();
    expect(home).toBeGreaterThan(2.5); // back near its 3.1 home orbit
    expect(home).toBeLessThan(4.0);
  });
});
