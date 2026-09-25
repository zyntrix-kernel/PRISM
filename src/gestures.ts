// Geometric gesture recognition over MediaPipe hand landmarks.
//
// Design notes:
// - All thresholds are normalized by hand size (wrist -> middle-MCP distance)
//   so gestures work across users and camera distances.
// - Pinch uses hysteresis (separate enter/exit thresholds) plus a
//   consecutive-frame debounce, which kills single-frame flicker without ML.
// - Pure functions (dist, pinchRatio, classifyPose) are unit-tested in
//   gestures.test.ts; only the stateful PinchState/GestureTracker hold time.

import { PrismConfig } from './config';
import type { Landmark, Point2D } from './types';

export type PoseKind = 'PINCH' | 'POINT' | 'OPEN_PALM' | 'FIST' | 'NONE';

// MediaPipe hand landmark indices.
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_PIP = 6;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const MIDDLE_PIP = 10;
const MIDDLE_TIP = 12;
const RING_PIP = 14;
const RING_TIP = 16;
const PINKY_PIP = 18;
const PINKY_TIP = 20;

export function dist3(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Hand size in normalized units; guards against degenerate input. */
export function handScale(landmarks: Landmark[]): number {
  if (landmarks.length < MIDDLE_MCP + 1) return 1e-6;
  return Math.max(1e-6, dist3(landmarks[WRIST], landmarks[MIDDLE_MCP]));
}

/** Thumb-tip to index-tip distance, normalized by hand size. */
export function pinchRatio(landmarks: Landmark[]): number {
  if (landmarks.length < INDEX_TIP + 1) return Number.POSITIVE_INFINITY;
  return dist3(landmarks[THUMB_TIP], landmarks[INDEX_TIP]) / handScale(landmarks);
}

/** Raw (non-debounced) pinch test using the strict enter threshold. */
export function detectPinchRaw(landmarks: Landmark[]): boolean {
  return pinchRatio(landmarks) <= PrismConfig.gestures.pinchEnter;
}

function isExtended(landmarks: Landmark[], tip: number, pip: number): boolean {
  const ratio = PrismConfig.gestures.extendedRatio;
  return (
    dist3(landmarks[tip], landmarks[WRIST]) >
    dist3(landmarks[pip], landmarks[WRIST]) * ratio
  );
}

/** Stateless pose classification (no hysteresis — see PinchState). */
export function classifyPose(landmarks: Landmark[]): PoseKind {
  if (landmarks.length < PINKY_TIP + 1) return 'NONE';
  if (detectPinchRaw(landmarks)) return 'PINCH';

  const index = isExtended(landmarks, INDEX_TIP, INDEX_PIP);
  const middle = isExtended(landmarks, MIDDLE_TIP, MIDDLE_PIP);
  const ring = isExtended(landmarks, RING_TIP, RING_PIP);
  const pinky = isExtended(landmarks, PINKY_TIP, PINKY_PIP);

  if (index && middle && ring && pinky) return 'OPEN_PALM';
  if (index && !middle && !ring && !pinky) return 'POINT';
  if (!index && !middle && !ring && !pinky) return 'FIST';
  return 'NONE';
}

/**
 * Debounced pinch latch with hysteresis: enters on the strict threshold
 * after N consecutive frames, exits past the looser threshold after M
 * consecutive frames. Prevents grab flicker during noisy tracking.
 */
export class PinchState {
  private pinching = false;
  private run = 0;

  update(rawPinch: boolean): boolean {
    if (!this.pinching) {
      if (rawPinch) {
        this.run += 1;
        if (this.run >= PrismConfig.gestures.pinchEnterFrames) {
          this.pinching = true;
          this.run = 0;
        }
      } else {
        this.run = 0;
      }
    } else {
      // While pinching, use the looser exit threshold via pinchRatio check
      // done by the caller: pass `stillPinching` computed with pinchExit.
      if (rawPinch) {
        this.run = 0;
      } else {
        this.run += 1;
        if (this.run >= PrismConfig.gestures.pinchExitFrames) {
          this.pinching = false;
          this.run = 0;
        }
      }
    }
    return this.pinching;
  }

  /** Convenience: feeds landmarks directly, applying the exit threshold while latched. */
  updateFromLandmarks(landmarks: Landmark[]): boolean {
    if (!this.pinching) return this.update(detectPinchRaw(landmarks));
    const stillPinching = pinchRatio(landmarks) <= PrismConfig.gestures.pinchExit;
    return this.update(stillPinching);
  }

  reset(): void {
    this.pinching = false;
    this.run = 0;
  }

  get isPinching(): boolean {
    return this.pinching;
  }
}

const clampNum = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Self-calibrating pinch thresholds. Every hand and camera reads a different
 * "open" distance, so fixed thresholds are always wrong for someone. The
 * calibrator watches clearly-open hands (pointing or open palm — never
 * pinching frames) and eases the enter/exit thresholds toward that user's
 * own geometry, hard-clamped to sane bounds. Writes go straight into the
 * central config so every consumer (latch, gas pedal, debug) stays in sync.
 */
export class PinchCalibrator {
  private baseline = 1.0;
  private openSamples = 0;

  reset(): void {
    this.baseline = 1.0;
    this.openSamples = 0;
  }

  get openBaseline(): number {
    return this.baseline;
  }

  /** Feed the live ratio; only openly-open frames move the baseline. */
  observe(ratio: number, handIsOpen: boolean): void {
    if (!handIsOpen || !Number.isFinite(ratio) || ratio <= 0.3 || ratio >= 2.0) return;
    this.baseline += (ratio - this.baseline) * 0.03;
    this.openSamples += 1;
    // Warmup: a stray frame must never yank the thresholds. Only publish
    // after enough open samples to trust the baseline.
    if (this.openSamples < 30) return;
    const enter = clampNum(this.baseline * 0.35, 0.12, 0.26);
    const exit = clampNum(this.baseline * 0.5, 0.2, 0.38);
    const g = PrismConfig.gestures;
    if (Math.abs(g.pinchEnter - enter) > 0.004) g.pinchEnter = enter;
    if (Math.abs(g.pinchExit - exit) > 0.004) g.pinchExit = exit;
  }
}

/** Per-hand gesture state: pose + debounced pinch. Point + pinch is the
 *  entire hand vocabulary — everything else was cut for determinism. */
export class GestureTracker {  readonly pinch = new PinchState();
  pose: PoseKind = 'NONE';

  update(landmarks: Landmark[] | null, dtMs: number): void {
    void dtMs;
    if (!landmarks) {
      this.pinch.reset();
      this.pose = 'NONE';
      return;
    }
    this.pinch.updateFromLandmarks(landmarks);
    // A latched pinch overrides the raw pose so grab survives finger noise.
    this.pose = this.pinch.isPinching ? 'PINCH' : classifyPose(landmarks);
  }
}

export interface TwoHandDelta {
  /** Multiplicative scale factor since the two-hand gesture began (1 = unchanged). */
  scaleRatio: number;
  /** Signed rotation (radians) of the hand-to-hand axis since gesture began. */
  angleDelta: number;
}

/**
 * Two-hand transform gesture: while both hands pinch, hand separation maps
 * to zoom and axis twist maps to rotation. Baseline is captured on entry so
 * deltas are drift-free.
 */
export class TwoHandGesture {
  private active = false;
  private baseDistance = 0;
  private baseAngle = 0;

  get isActive(): boolean {
    return this.active;
  }

  /**
   * @param a first pinch point (normalized image coords) or null
   * @param b second pinch point or null
   */
  update(a: Point2D | null, b: Point2D | null): TwoHandDelta | null {
    if (!a || !b) {
      this.active = false;
      return null;
    }
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    if (!this.active) {
      this.active = true;
      this.baseDistance = Math.max(1e-6, distance);
      this.baseAngle = angle;
      return { scaleRatio: 1, angleDelta: 0 };
    }
    return {
      scaleRatio: distance / this.baseDistance,
      angleDelta: angle - this.baseAngle,
    };
  }

  reset(): void {
    this.active = false;
  }
}
