// Unit + integration tests for the Bohr atom preset: shell snapping,
// photon wavelengths, and the drop-to-emit cycle through the real world.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildAtom, photonColorName, photonNm, shellOfRadius, SHELLS } from './atom';
import type { BuilderCtx, WorldAPI } from './types';
import type { PlanetTextureSet } from '../textures';

function makeCtx(): BuilderCtx {
  const tex = new THREE.Texture();
  return {
    world: new THREE.Group(),
    labelLayer: new THREE.Group(),
    glowTex: tex,
    shakeCamera: () => {},
    nebulaTex: tex,
    planetTex: {} as PlanetTextureSet,
    quality: 'medium' as const,
  };
}

describe('atom physics', () => {
  it('snaps radii to the nearest shell', () => {
    expect(shellOfRadius(1.0)).toBe(0);
    expect(shellOfRadius(2.0)).toBe(0); // |2-1.6| < |2-2.7|
    expect(shellOfRadius(2.3)).toBe(1);
    expect(shellOfRadius(9.9)).toBe(2);
    expect(SHELLS.length).toBe(3);
  });

  it('emits textbook wavelengths (Balmer-α 656 nm, Lyman-α 121.6 nm)', () => {
    expect(photonNm(3, 2)).toBeCloseTo(656, 0);
    expect(photonNm(2, 1)).toBeCloseTo(121.6, 0);
    expect(photonColorName(656)).toBe('red');
    expect(photonColorName(121.6)).toBe('ultraviolet');
  });
});

describe('atom world integration', () => {
  it('boots, orbits electrons, and emits on shell drop', () => {
    const ctx = makeCtx();
    const world: WorldAPI = buildAtom(ctx);
    expect(world.grabbables.length).toBeGreaterThan(0);
    const electrons = world.grabbables.filter(
      (o) => (o as THREE.Mesh).userData.orbitBody,
    ) as THREE.Mesh[];
    expect(electrons.length).toBe(3);

    // Let electrons orbit freely for a while: positions evolve, no throw.
    let t = 0;
    for (let i = 0; i < 120; i++) {
      t += 1 / 60;
      world.update?.(1 / 60, t);
    }

    // Lift electron 1 to n=3, release, then drop it back to n=1.
    const e1 = electrons[0];
    e1.userData.grabbed = true;
    world.setOrbitFromPoint?.(e1, new THREE.Vector3(4.0, 0, 0));
    e1.userData.grabbed = false;
    world.update?.(1 / 60, t + 1);
    expect(world.bodyInfo?.(e1.name)).not.toContain('nm'); // excitation: silent
    e1.userData.grabbed = true;
    world.setOrbitFromPoint?.(e1, new THREE.Vector3(1.6, 0, 0));
    e1.userData.grabbed = false;
    world.update?.(1 / 60, t + 2);
    const info = world.bodyInfo?.(e1.name) ?? '';
    expect(info).toContain('nm'); // emission recorded
    expect(world.bodyInfo?.(null)).toContain('nm'); // idle panel shows it too
  });

  it('detonates on core ram, then reforms the electron', () => {
    const ctx = makeCtx();
    const world: WorldAPI = buildAtom(ctx);
    const electrons = world.grabbables.filter(
      (o) => (o as THREE.Mesh).userData.orbitBody,
    ) as THREE.Mesh[];
    const e2 = electrons[1];
    // Aim the grabbed electron at the nucleus through the real drag path
    // (shell snapping keeps the body out — intent is read from the pointer).
    e2.userData.grabbed = true;
    let t = 0;
    for (let i = 0; i < 30; i++) {
      t += 1 / 60;
      world.setOrbitFromPoint?.(e2, new THREE.Vector3(0.2, 0, 0.1));
      world.update?.(1 / 60, t);
    }
    expect(e2.scale.x).toBeLessThan(0.1); // vaporized
    expect(world.bodyInfo?.(e2.name)).toContain('CORE BREACH');
    // Blast plays out (~2.6 s), then the electron reforms on its shell.
    for (let i = 0; i < 200; i++) {
      t += 1 / 60;
      world.update?.(1 / 60, t);
    }
    expect(e2.scale.x).toBe(1);
    expect(world.bodyInfo?.(e2.name)).not.toContain('CORE BREACH');
    expect(e2.userData.grabbed).toBe(false); // hand-off released cleanly
  });
});
