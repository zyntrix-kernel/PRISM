// Acceptance suite for the adaptive pointer: a 10 fps noisy feed must
// hold nearly still, steps must land quickly without flinging, spikes
// must die, and dropouts/gaps must hold — all deterministic (LCG noise).

import { describe, expect, it } from 'vitest';
import { AdaptivePointerFilter } from './pointer';

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const out = { x: 0, y: 0 };

function settle10fps(f: AdaptivePointerFilter, seconds: number, conf: number): void {
  // Prime the rate estimator with clean static frames first.
  const n = Math.round(seconds * 10);
  for (let i = 0; i < n; i++) f.update({ x: 0.2, y: -0.1 }, 100, conf, out);
}

describe('AdaptivePointerFilter', () => {
  it('learns the tracking rate', () => {
    const f = new AdaptivePointerFilter();
    settle10fps(f, 5, 0.9);
    expect(f.trackFps).toBeGreaterThan(8);
    expect(f.trackFps).toBeLessThan(13);
  });

  it('holds nearly still on a noisy 10 fps feed', () => {
    const f = new AdaptivePointerFilter();
    const rnd = lcg(7);
    settle10fps(f, 3, 0.5);
    // Shaky old camera: +/-8px on a 1000px-wide view, low confidence.
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < 20; i++) {
      const nx = 0.2 + (rnd() * 2 - 1) * 0.008;
      const ny = -0.1 + (rnd() * 2 - 1) * 0.008;
      f.update({ x: nx, y: ny }, 100, 0.5, out);
      minX = Math.min(minX, out.x);
      maxX = Math.max(maxX, out.x);
      minY = Math.min(minY, out.y);
      maxY = Math.max(maxY, out.y);
    }
    // Input swings 0.016 peak-to-peak per axis; output stays under 0.004.
    expect(maxX - minX).toBeLessThan(0.004);
    expect(maxY - minY).toBeLessThan(0.004);
  });

  it('lands a step quickly without overshoot fling', () => {
    const f = new AdaptivePointerFilter();
    settle10fps(f, 3, 0.9);
    let peak = -Infinity;
    let settleFrames = -1;
    for (let i = 0; i < 30; i++) {
      f.update({ x: 0.7, y: -0.1 }, 100, 0.9, out);
      peak = Math.max(peak, out.x);
      if (settleFrames < 0 && Math.abs(out.x - 0.7) < 0.05) settleFrames = i + 1;
    }
    expect(peak).toBeLessThan(0.7 + 0.1); // capped prediction, no fling
    expect(settleFrames).toBeGreaterThan(0);
    expect(settleFrames).toBeLessThanOrEqual(6); // <= 600 ms at 10 fps
  });

  it('eats a single-frame spike', () => {
    const f = new AdaptivePointerFilter();
    const rnd = lcg(21);
    for (let i = 0; i < 30; i++) {
      f.update({ x: 0.2 + (rnd() - 0.5) * 0.002, y: 0 }, 33, 0.9, out);
    }
    f.update({ x: 0.5, y: 0 }, 33, 0.4, out); // spike, low confidence
    expect(Math.abs(out.x - 0.2)).toBeLessThan(0.03);
    f.update({ x: 0.2, y: 0 }, 33, 0.9, out);
    expect(Math.abs(out.x - 0.2)).toBeLessThan(0.03);
  });

  it('tracks a fast flick live at 60 fps', () => {
    const f = new AdaptivePointerFilter();
    f.update({ x: 0, y: 0 }, 16.7, 0.95, out);
    for (let i = 0; i < 120; i++) f.update({ x: 0, y: 0 }, 16.7, 0.95, out);
    // 2 NDC/sec ramp for half a second.
    let err = 0;
    let n = 0;
    for (let i = 1; i <= 30; i++) {
      const target = i * (2 / 60);
      f.update({ x: target, y: 0 }, 16.7, 0.95, out);
      if (i > 10) {
        err += Math.abs(out.x - target);
        n++;
      }
    }
    expect(err / n).toBeLessThan(0.08); // mean lag under ~40 ms equivalent
  });

  it('holds exactly on stale re-reads and survives gaps', () => {
    const f = new AdaptivePointerFilter();
    settle10fps(f, 2, 0.9);
    f.update({ x: 0.3, y: 0.1 }, 100, 0.9, out);
    const hx = out.x;
    const hy = out.y;
    for (let i = 0; i < 12; i++) {
      f.update({ x: 0.3, y: 0.1 }, 0, 0.9, out); // render polls, no new frame
      expect(out.x).toBe(hx);
      expect(out.y).toBe(hy);
    }
    f.update({ x: 0.9, y: 0.1 }, 400, 0.9, out); // 400 ms dropout gap
    expect(out.x).toBeGreaterThan(hx); // honest catch-up toward the hand
    expect(out.x).toBeLessThanOrEqual(0.9 + 0.06); // but never past it + lead cap
  });
});
