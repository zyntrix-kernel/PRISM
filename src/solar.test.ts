// Unit tests for the M6 Keplerian orbit math: dragging a planet to a new
// radius must rescale its year as T² ∝ r³ (period ratio = radius ratio^1.5).

import { describe, expect, it } from 'vitest';
import {
  EARTH_ORBIT_RADIUS,
  EARTH_PERIOD_DAYS,
  keplerPeriodDays,
} from './presets/orbits';

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
