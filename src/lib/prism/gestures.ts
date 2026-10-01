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

function dist3(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function handScale(landmarks: Landmark[]): number {
  if (landmarks.length < MIDDLE_MCP + 1) return 1e-6;
  return Math.max(1e-6, dist3(landmarks[WRIST], landmarks[MIDDLE_MCP]));
}

export function pinchRatio(landmarks: Landmark[]): number {
  if (landmarks.length < INDEX_TIP + 1) return Number.POSITIVE_INFINITY;
  return dist3(landmarks[THUMB_TIP], landmarks[INDEX_TIP]) / handScale(landmarks);
}

function detectPinchRaw(landmarks: Landmark[]): boolean {
  return pinchRatio(landmarks) <= PrismConfig.gestures.pinchEnter;
}

function isExtended(landmarks: Landmark[], tip: number, pip: number): boolean {
  const ratio = PrismConfig.gestures.extendedRatio;
  return dist3(landmarks[tip], landmarks[WRIST]) > dist3(landmarks[pip], landmarks[WRIST]) * ratio;
}

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

export class PinchState {
  private pinching = false;
  private runFrames = 0;
  private runMs = 0;

  update(rawPinch: boolean, dtMs: number): boolean {
    const cfg = PrismConfig.gestures;
    const dt = Math.min(Math.max(0, dtMs), 250);
    if (!this.pinching) {
      if (rawPinch) {
        this.runFrames += 1;
        this.runMs += dt;
        if (this.runFrames >= cfg.pinchMinFrames && this.runMs >= cfg.pinchEnterMs) {
          this.pinching = true;
          this.runFrames = 0;
          this.runMs = 0;
        }
      } else { this.runFrames = 0; this.runMs = 0; }
    } else {
      if (rawPinch) { this.runFrames = 0; this.runMs = 0; }
      else {
        this.runFrames += 1;
        this.runMs += dt;
        if (this.runFrames >= cfg.pinchMinFrames && this.runMs >= cfg.pinchExitMs) {
          this.pinching = false;
          this.runFrames = 0;
          this.runMs = 0;
        }
      }
    }
    return this.pinching;
  }

  updateFromLandmarks(landmarks: Landmark[], dtMs = 16.7): boolean {
    if (!this.pinching) return this.update(detectPinchRaw(landmarks), dtMs);
    return this.update(pinchRatio(landmarks) <= PrismConfig.gestures.pinchExit, dtMs);
  }

  reset(): void { this.pinching = false; this.runFrames = 0; this.runMs = 0; }
  get isPinching(): boolean { return this.pinching; }
}

const clampNum = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export class PinchCalibrator {
  private baseline = 1.0;
  private openSamples = 0;
  reset(): void { this.baseline = 1.0; this.openSamples = 0; }
  get openBaseline(): number { return this.baseline; }
  observe(ratio: number, handIsOpen: boolean): void {
    if (!handIsOpen || !Number.isFinite(ratio) || ratio <= 0.3 || ratio >= 2.0) return;
    this.baseline += (ratio - this.baseline) * 0.04;
    this.openSamples += 1;
    if (this.openSamples < 10) return;
    const enter = clampNum(this.baseline * 0.45, 0.25, 0.45);
    const exit = clampNum(this.baseline * 0.68, 0.42, 0.65);
    const g = PrismConfig.gestures;
    if (Math.abs(g.pinchEnter - enter) > 0.004) g.pinchEnter = enter;
    if (Math.abs(g.pinchExit - exit) > 0.004) g.pinchExit = exit;
  }
}

const PINCH_COAST_MS = 400;

export class GestureTracker {
  readonly pinch = new PinchState();
  pose: PoseKind = 'NONE';
  private lastLandmarkAt = 0;
  private wasPinching = false;
  update(landmarks: Landmark[] | null, dtMs: number): void {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!landmarks) {
      if (this.wasPinching && now - this.lastLandmarkAt < PINCH_COAST_MS) this.pose = 'PINCH';
      else { this.pinch.reset(); this.wasPinching = false; this.pose = 'NONE'; }
      return;
    }
    this.lastLandmarkAt = now;
    this.pinch.updateFromLandmarks(landmarks, dtMs);
    this.wasPinching = this.pinch.isPinching;
    this.pose = this.pinch.isPinching ? 'PINCH' : classifyPose(landmarks);
  }
  reset(): void { this.pinch.reset(); this.wasPinching = false; this.lastLandmarkAt = 0; this.pose = 'NONE'; }
}

export interface TwoHandDelta {
  /** Multiplicative scale factor from gesture entry. */
  scaleRatio: number;
  /** Signed, continuously unwrapped rotation from gesture entry. */
  angleDelta: number;
}

/** Two-hand pinch transform: separation controls zoom, axis angle controls rotation. */
export class TwoHandGesture {
  private active = false;
  private baseDistance = 0;
  private baseAngle = 0;
  private previousAngle = 0;

  get isActive(): boolean { return this.active; }

  update(a: Point2D | null, b: Point2D | null): TwoHandDelta | null {
    if (!a || !b) { this.active = false; return null; }
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.hypot(dx, dy);
    const rawAngle = Math.atan2(dy, dx);
    if (!this.active) {
      this.active = true;
      this.baseDistance = Math.max(1e-6, distance);
      this.baseAngle = rawAngle;
      this.previousAngle = rawAngle;
      return { scaleRatio: 1, angleDelta: 0 };
    }

    // Unwrap across +/-PI so a hand-axis crossing the boundary never causes
    // a giant reverse rotation jump.
    let stepAngle = rawAngle - this.previousAngle;
    if (stepAngle > Math.PI) stepAngle -= Math.PI * 2;
    else if (stepAngle < -Math.PI) stepAngle += Math.PI * 2;
    this.previousAngle += stepAngle;

    return {
      scaleRatio: distance / this.baseDistance,
      angleDelta: this.previousAngle - this.baseAngle,
    };
  }

  reset(): void { this.active = false; this.baseDistance = 0; this.baseAngle = 0; this.previousAngle = 0; }
}
