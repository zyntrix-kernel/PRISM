// Unit tests for the One Euro adaptive pointer filter.

import { describe, expect, it } from 'vitest';
import { OneEuroSmoother } from './smoothing';

const DT = 1 / 60;

function runConstant(steps = 300): { x: number; y: number; z: number } {
  const f = new OneEuroSmoother(1.1, 0.03, 1.0);
  const out = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < steps; i++) f.update({ x: 1, y: -0.5, z: 0.25 }, DT, out);
  return out;
}

describe('OneEuroSmoother', () => {
  it('converges to a constant signal (jitter dies out)', () => {
    const out = runConstant();
    expect(out.x).toBeCloseTo(1, 3);
    expect(out.y).toBeCloseTo(-0.5, 3);
    expect(out.z).toBeCloseTo(0.25, 3);
  });

  it('tracks a sudden step quickly (fast motion stays responsive)', () => {
    const f = new OneEuroSmoother(1.1, 0.5, 1.0);
    const out = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 30; i++) f.update({ x: 0, y: 0, z: 0 }, DT, out);
    for (let i = 0; i < 30; i++) f.update({ x: 1, y: 0, z: 0 }, DT, out);
    // High beta opens the filter during fast motion: must be most of the way there.
    expect(out.x).toBeGreaterThan(0.85);
  });

  it('moves monotonically toward a step (no oscillation)', () => {
    const f = new OneEuroSmoother(1.1, 0.03, 1.0);
    const out = { x: 0, y: 0, z: 0 };
    let prev = 0;
    for (let i = 0; i < 120; i++) {
      f.update({ x: 1, y: 0, z: 0 }, DT, out);
      expect(out.x).toBeGreaterThanOrEqual(prev);
      prev = out.x;
    }
  });

  it('survives degenerate dt without NaN', () => {
    const f = new OneEuroSmoother();
    const out = { x: 0, y: 0, z: 0 };
    f.update({ x: 1, y: 1, z: 1 }, 0, out);
    f.update({ x: 1, y: 1, z: 1 }, -5, out);
    expect(out.x).not.toBeNaN();
    expect(out.y).not.toBeNaN();
    expect(out.z).not.toBeNaN();
  });

  it('reset snaps to the sample', () => {
    const f = new OneEuroSmoother();
    const out = { x: 0, y: 0, z: 0 };
    f.update({ x: 5, y: 5, z: 5 }, DT, out);
    f.reset({ x: 1, y: 2, z: 3 });
    f.update({ x: 1, y: 2, z: 3 }, DT, out);
    expect(out.x).toBeCloseTo(1, 6);
    expect(out.y).toBeCloseTo(2, 6);
    expect(out.z).toBeCloseTo(3, 6);
  });
});
