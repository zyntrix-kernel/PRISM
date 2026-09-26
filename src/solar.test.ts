// Unit tests for the M6 Keplerian orbit math: dragging a planet to a new
// radius must rescale its year as T² ∝ r³ (period ratio = radius ratio^1.5).

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  EARTH_ORBIT_RADIUS,
  EARTH_PERIOD_DAYS,
  keplerPeriodDays,
} from './presets/orbits';
import { buildSolar } from './presets/solar';
import type { BuilderCtx, WorldAPI } from './presets/types';
import type { PlanetTextureSet } from './textures';

describe('keplerPeriodDays', () => {
  it('returns the Earth year at the Earth anchor', () => {
    expect(keplerPeriodDays(EARTH_ORBIT_RADIUS)).toBeCloseTo(EARTH_PERIOD_DAYS, 8);
  });

  it('scales as r^1.5 (doubling radius multiplies the year by 2√2)', () => {
    expect(keplerPeriodDays(EARTH_ORBIT_RADIUS * 2) / EARTH_PERIOD_DAYS).toBeCloseTo(
      2 * Math.SQRT2,
      5,
    );
  });

  it('shrinks the year when a planet is dragged inward', () => {
    expect(keplerPeriodDays(EARTH_ORBIT_RADIUS / 2)).toBeLessThan(EARTH_PERIOD_DAYS);
  });

  it('supports per-planet anchors (Mercury home orbit = 88 days)', () => {
    const mercuryRadius = 1.5;
    expect(keplerPeriodDays(mercuryRadius, mercuryRadius, 88)).toBeCloseTo(88, 8);
    // Dragged 2x outward, Mercury's year grows by 2√2 — Kepler's third law.
    expect(keplerPeriodDays(mercuryRadius * 2, mercuryRadius, 88)).toBeCloseTo(
      88 * 2 * Math.SQRT2,
      5,
    );
  });

  it('never returns NaN for degenerate radii', () => {
    expect(keplerPeriodDays(0)).not.toBeNaN();
    expect(keplerPeriodDays(-3)).not.toBeNaN();
  });
});

describe('solar sun-crash integration', () => {
  it('vaporizes a sun-diving planet, then reforms it at home', () => {
    const tex = new THREE.Texture();
    const ctx: BuilderCtx = {
      world: new THREE.Group(),
      labelLayer: new THREE.Group(),
      glowTex: tex,
      nebulaTex: tex,
      planetTex: {} as PlanetTextureSet,
      shakeCamera: () => {},
      quality: 'medium' as const,
    };
    const world: WorldAPI = buildSolar(ctx);
    const mercury = world.grabbables.find((o) => o.name === 'Mercury') as THREE.Mesh;
    expect(mercury).toBeDefined();
    // Hold Mercury sunward (clamped r 1.3 < trigger 1.35) past the 0.6 s fuse.
    mercury.userData.grabbed = true;
    world.setOrbitFromPoint?.(mercury, new THREE.Vector3(0.5, 0, 0));
    let t = 0;
    for (let i = 0; i < 60; i++) {
      t += 1 / 60;
      world.update?.(1 / 60, t);
    }
    expect(mercury.scale.x).toBeLessThan(0.1); // vaporized
    expect(world.bodyInfo?.('Mercury')).toContain('vaporized');
    // Released: the 4 s reform timer runs, then Mercury is whole again.
    // (Its home 1.5 sits outside the fuse zone, so parking never triggers.)
    mercury.userData.grabbed = false;
    for (let i = 0; i < 300; i++) {
      t += 1 / 60;
      world.update?.(1 / 60, t);
    }
    expect(mercury.scale.x).toBe(1); // reformed
    expect(world.bodyInfo?.('Mercury')).not.toContain('vaporized');
  });
});
