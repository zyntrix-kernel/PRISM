// Unit tests for the geometric gesture engine. Synthetic landmarks use a
// canonical hand: wrist at (0.5, 0.9), middle-MCP at (0.5, 0.55), so the
// hand scale is exactly 0.35 and pinch ratios are easy to reason about.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PrismConfig } from './config';
import {
  classifyPose,
  GestureTracker,
  PinchCalibrator,
  PinchState,
  pinchRatio,
  TwoHandGesture,
} from './gestures';
import type { Landmark } from './types';

const WRIST: Landmark = { x: 0.5, y: 0.9, z: 0 };
const MIDDLE_MCP: Landmark = { x: 0.5, y: 0.55, z: 0 };

/** Builds 21 landmarks; default pose is a curled fist. */
function makeHand(overrides: Partial<Record<number, Landmark>> = {}): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.7, z: 0 }));
  lm[0] = { ...WRIST };
  // Thumb (1-4): curled default
  lm[1] = { x: 0.46, y: 0.8, z: 0 };
  lm[2] = { x: 0.42, y: 0.74, z: 0 };
  lm[3] = { x: 0.4, y: 0.68, z: 0 };
  lm[4] = { x: 0.38, y: 0.64, z: 0 };
  // Index (5-8): curled default
  lm[5] = { x: 0.54, y: 0.62, z: 0 };
  lm[6] = { x: 0.55, y: 0.55, z: 0 };
  lm[7] = { x: 0.55, y: 0.6, z: 0 };
  lm[8] = { x: 0.55, y: 0.62, z: 0 };
  // Middle (9-12): curled default
  lm[9] = { ...MIDDLE_MCP };
  lm[10] = { x: 0.5, y: 0.55, z: 0 };
  lm[11] = { x: 0.5, y: 0.6, z: 0 };
  lm[12] = { x: 0.5, y: 0.62, z: 0 };
  // Ring (13-16): curled default
  lm[13] = { x: 0.46, y: 0.62, z: 0 };
  lm[14] = { x: 0.45, y: 0.55, z: 0 };
  lm[15] = { x: 0.45, y: 0.6, z: 0 };
  lm[16] = { x: 0.45, y: 0.62, z: 0 };
  // Pinky (17-20): curled default
  lm[17] = { x: 0.42, y: 0.62, z: 0 };
  lm[18] = { x: 0.41, y: 0.55, z: 0 };
  lm[19] = { x: 0.41, y: 0.6, z: 0 };
  lm[20] = { x: 0.41, y: 0.62, z: 0 };
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined) lm[Number(k)] = v;
  }
  return lm;
}

function openPalm(): Landmark[] {
  return makeHand({
    4: { x: 0.3, y: 0.55, z: 0 },
    6: { x: 0.55, y: 0.45, z: 0 },
    8: { x: 0.56, y: 0.15, z: 0 },
    10: { x: 0.5, y: 0.45, z: 0 },
    12: { x: 0.5, y: 0.12, z: 0 },
    14: { x: 0.45, y: 0.45, z: 0 },
    16: { x: 0.44, y: 0.14, z: 0 },
    18: { x: 0.4, y: 0.46, z: 0 },
    20: { x: 0.39, y: 0.16, z: 0 },
  });
}

describe('pinchRatio', () => {
  it('is near zero when thumb and index touch', () => {
    const lm = makeHand({
      4: { x: 0.45, y: 0.5, z: 0 },
      8: { x: 0.47, y: 0.5, z: 0 },
    });
    expect(pinchRatio(lm)).toBeLessThan(PrismConfig.gestures.pinchEnter);
  });

  it('is large for an open hand', () => {
    expect(pinchRatio(openPalm())).toBeGreaterThan(PrismConfig.gestures.pinchExit);
  });

  it('handles degenerate input without NaN', () => {
    expect(classifyPose([])).toBe('NONE');
    expect(pinchRatio([])).not.toBeNaN();
  });
});

describe('classifyPose', () => {
  it('detects PINCH', () => {
    const lm = makeHand({
      4: { x: 0.45, y: 0.5, z: 0 },
      8: { x: 0.47, y: 0.5, z: 0 },
    });
    expect(classifyPose(lm)).toBe('PINCH');
  });

  it('detects POINT (index only)', () => {
    const lm = makeHand({
      4: { x: 0.3, y: 0.6, z: 0 },
      8: { x: 0.55, y: 0.15, z: 0 },
    });
    expect(classifyPose(lm)).toBe('POINT');
  });

  it('detects OPEN_PALM', () => {
    expect(classifyPose(openPalm())).toBe('OPEN_PALM');
  });

  it('detects FIST for curled defaults', () => {
    expect(classifyPose(makeHand())).toBe('FIST');
  });
});

describe('PinchState', () => {
  // Time-based latch: minimum frames (noise rejection) AND minimum held
  // time (rate invariance). Steps use exact ms to avoid float edge cases.
  it('latches after minimum frames AND hold time', () => {
    const s = new PinchState();
    expect(s.update(true, 25)).toBe(false); // 1 frame: not yet
    expect(s.update(true, 25)).toBe(true); // 2 frames, 50 ms: latched
  });

  it('resets the entry run on a gap frame', () => {
    const s = new PinchState();
    expect(s.update(true, 25)).toBe(false);
    expect(s.update(false, 25)).toBe(false);
    expect(s.update(true, 25)).toBe(false);
    expect(s.update(true, 25)).toBe(true);
  });

  it('latches within 2 frames at slow tracking rates too (rate invariance)', () => {
    const s = new PinchState();
    expect(s.update(true, 100)).toBe(false); // 10 fps: first frame
    expect(s.update(true, 100)).toBe(true); // 200 ms held: latched
  });

  it('ignores a lone slow spike (frame-count floor holds)', () => {
    const s = new PinchState();
    expect(s.update(true, 200)).toBe(false); // 200 ms but a single frame
    expect(s.update(false, 200)).toBe(false);
    expect(s.isPinching).toBe(false);
  });

  it('uses hysteresis: holds between enter and exit thresholds', () => {
    const s = new PinchState();
    const pinched = makeHand({
      4: { x: 0.45, y: 0.5, z: 0 },
      8: { x: 0.47, y: 0.5, z: 0 },
    });
    // Between thresholds: dist 0.095 / scale 0.35 ≈ 0.27 (enter 0.22, exit 0.32)
    const middle = makeHand({
      4: { x: 0.45, y: 0.5, z: 0 },
      8: { x: 0.545, y: 0.5, z: 0 },
    });
    expect(pinchRatio(middle)).toBeGreaterThan(PrismConfig.gestures.pinchEnter);
    expect(pinchRatio(middle)).toBeLessThan(PrismConfig.gestures.pinchExit);

    for (let i = 0; i < 2; i++) s.updateFromLandmarks(pinched, 25);
    expect(s.isPinching).toBe(true);
    s.updateFromLandmarks(middle, 25); // single mid-zone frame must not release
    expect(s.isPinching).toBe(true);
  });

  it('releases after sustained exit-threshold frames', () => {
    const s = new PinchState();
    const wide = openPalm();
    for (let i = 0; i < 2; i++) s.update(true, 25);
    expect(s.isPinching).toBe(true);
    s.updateFromLandmarks(wide, 25);
    expect(s.isPinching).toBe(true);
    s.updateFromLandmarks(wide, 25);
    expect(s.isPinching).toBe(false);
  });
});

describe('GestureTracker', () => {
  it('reports a latched PINCH pose and clears on tracking loss', () => {
    const t = new GestureTracker();
    const pinched = makeHand({
      4: { x: 0.45, y: 0.5, z: 0 },
      8: { x: 0.47, y: 0.5, z: 0 },
    });
    for (let i = 0; i < 2; i++) t.update(pinched, 25);
    expect(t.pose).toBe('PINCH');
    t.update(null, 16);
    expect(t.pose).toBe('NONE');
    expect(t.pinch.isPinching).toBe(false);
  });
});

describe('TwoHandGesture', () => {
  it('returns null without two pinch points', () => {
    const g = new TwoHandGesture();
    expect(g.update(null, null)).toBeNull();
    expect(g.isActive).toBe(false);
  });

  it('captures a baseline then reports zoom and twist deltas', () => {
    const g = new TwoHandGesture();
    const a = { x: 0.3, y: 0.5 };
    const b = { x: 0.7, y: 0.5 };
    expect(g.update(a, b)).toEqual({ scaleRatio: 1, angleDelta: 0 });
    const wider = g.update(a, { x: 0.9, y: 0.5 });
    expect(wider!.scaleRatio).toBeCloseTo(1.5, 5);
    const twisted = g.update(a, { x: 0.7, y: 0.7 });
    expect(twisted!.angleDelta).not.toBeCloseTo(0, 5);
  });
});

describe('PinchCalibrator', () => {
  const ENTER0 = PrismConfig.gestures.pinchEnter;
  const EXIT0 = PrismConfig.gestures.pinchExit;

  beforeEach(() => {
    PrismConfig.gestures.pinchEnter = ENTER0;
    PrismConfig.gestures.pinchExit = EXIT0;
  });

  afterEach(() => {
    // Calibration writes the shared config: never leak between tests.
    PrismConfig.gestures.pinchEnter = ENTER0;
    PrismConfig.gestures.pinchExit = EXIT0;
  });

  it('eases thresholds toward a wide-open hand', () => {
    const c = new PinchCalibrator();
    for (let i = 0; i < 300; i++) c.observe(1.2, true);
    // Baseline 1.2 → enter 0.26 (clamped), exit 0.38 (clamped).
    expect(PrismConfig.gestures.pinchEnter).toBeCloseTo(0.26, 2);
    expect(PrismConfig.gestures.pinchExit).toBeCloseTo(0.38, 2);
  });

  it('tightens thresholds for a narrow hand', () => {
    const c = new PinchCalibrator();
    for (let i = 0; i < 300; i++) c.observe(0.5, true);
    expect(PrismConfig.gestures.pinchEnter).toBeCloseTo(0.175, 2);
    expect(PrismConfig.gestures.pinchExit).toBeCloseTo(0.25, 2);
  });

  it('ignores pinching frames and garbage', () => {
    const c = new PinchCalibrator();
    for (let i = 0; i < 300; i++) c.observe(0.08, false); // pinching: not open
    expect(PrismConfig.gestures.pinchEnter).toBe(ENTER0);
    c.observe(NaN, true);
    c.observe(0.1, true); // below band
    c.observe(5, true); // above band
    expect(PrismConfig.gestures.pinchEnter).toBe(ENTER0);
  });

  it('needs a warmup before publishing (one stray frame moves nothing)', () => {
    const c = new PinchCalibrator();
    for (let i = 0; i < 29; i++) c.observe(1.2, true);
    expect(PrismConfig.gestures.pinchEnter).toBe(ENTER0);
    c.observe(1.2, true);
    expect(PrismConfig.gestures.pinchEnter).not.toBe(ENTER0);
  });
});
