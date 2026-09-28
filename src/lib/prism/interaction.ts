// Interaction controller: turns gestures + pointer motion into scene action.
//
// Pipeline per frame:
//   landmarks (or mouse) -> smoothed pointer NDC -> raycast -> hover
//   pinch rising edge + hover -> grab (anchor plane + offset captured)
//   pinch held -> drag grabbed orb along the grab plane (smoothed)
//   pinch falling edge -> release
//   two simultaneous pinches -> world zoom + rotate
//
// All transient math uses preallocated temporaries (no hot-loop garbage).

import * as THREE from 'three';
import { PrismConfig } from './config';
import { GestureTracker, PinchCalibrator, TwoHandGesture, pinchRatio, type PoseKind } from './gestures';
import { AdaptivePointerFilter } from './pointer';
import { PRESET_ORDER } from './presets/types';
import { Vec3Smoother } from './smoothing';
import type { CursorMode, PrismScene } from './scene';
import type { HandFrame, Landmark, Point2D } from './types';

export type InputMode = 'hand' | 'mouse' | 'none';

const INDEX_TIP = 8;
const THUMB_TIP = 4;

function pinchPoint2D(landmarks: Landmark[]): Point2D {
  // Guard against short landmark arrays (MediaPipe can return partial hands
  // on low-quality cameras — INDEX_TIP=8, THUMB_TIP=4). Fall back to the
  // wrist (landmark 0, always present) if the tips are missing.
  const thumb = landmarks[THUMB_TIP] ?? landmarks[0];
  const index = landmarks[INDEX_TIP] ?? landmarks[0];
  if (!thumb || !index) return { x: 0.5, y: 0.5 };
  return {
    x: (thumb.x + index.x) / 2,
    y: (thumb.y + index.y) / 2,
  };
}

export class InteractionController {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2(0, 0);
  // The TARGET position from tracking (updated at 10fps). pointerNdc chases
  // this at the RENDER rate (60fps) via exponential lerp. This decouples
  // cursor smoothness from tracking rate — a 10fps camera produces a smooth
  // 60fps cursor instead of a jerky 10fps one.
  private readonly pointerTarget = new THREE.Vector2(0, 0);
  // Adaptive pointer: self-retunes to any camera on earth (5–120 fps),
  // outlier-gates spikes, and predicts ~2 frames ahead to hide latency.
  private readonly pointerFilter = new AdaptivePointerFilter({
    ...PrismConfig.interaction.pointerAdaptive,
  });
  private readonly grabSmoother = new Vec3Smoother(PrismConfig.interaction.grabSmoothing);
  private readonly trackers = [new GestureTracker(), new GestureTracker()];
  private readonly twoHand = new TwoHandGesture();

  // Grab state
  private grabbed: THREE.Mesh | null = null;
  private readonly grabPlane = new THREE.Plane();
  private readonly grabOffset = new THREE.Vector3();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpTarget = new THREE.Vector3();
  private readonly tmpNdcSample = { x: 0, y: 0, z: 0 };
  private readonly tmpSmoothed = { x: 0, y: 0, z: 0 };
  private readonly tmpNdc = new THREE.Vector2();
  private readonly tmpProj = new THREE.Vector3();
  /** Per-frame pick memo: hover, grab, and cursor share one raycast. */
  private frameCount = 0;
  private pickFrame = -1;
  private cachedPick: THREE.Mesh | null = null;
  // Orbit-drag temporaries: the pointer ray is converted into world-local
  // space so two-hand zoom/rotation doesn't skew the ecliptic plane.
  private readonly eclipticPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly tmpRay = new THREE.Ray();
  private readonly tmpMat = new THREE.Matrix4();
  private readonly tmpLocal = new THREE.Vector3();
  private orbitDragPrimed = false;

  // Two-hand incremental state
  private lastScaleRatio = 1;
  private lastAngleDelta = 0;
  private prevTwoHand = false;
  /** Self-tuning pinch thresholds for this user's hand and camera. */
  private readonly calibrator = new PinchCalibrator();
  /** Last tracking timestamp: resumed streams prime without a fake jump. */
  private lastTrackT = 0;
  // Stable hand identity: MediaPipe reorders hands frame-to-frame, so blindly
  // taking hands[0] teleports the pointer whenever hands cross or re-enter.
  // Wrists are matched by least movement (with a stickiness margin), and a
  // genuine jump (>0.25) snaps the pointer filter instead of streaking.
  private primaryFirst = true;
  private anchorA: { x: number; y: number } | null = null;
  private anchorB: { x: number; y: number } | null = null;
  private readonly lastRaw: { x: number; y: number } = { x: 0, y: 0 };

  // Mouse fallback + camera-control state
  private mouseNdc: THREE.Vector2 | null = null;
  private mouseDown = false;
  private prevMouseDown = false;
  /** True while the left button orbits the camera (pressed on empty space). */
  private orbitArmed = false;
  private panning = false;
  private readonly lastClient = { x: 0, y: 0 };
  // Click-vs-drag disambiguation: a quick press-release without dragging
  // counts as a CLICK (pin drop / button action), a real drag orbits.
  private downClientX = 0;
  private downClientY = 0;
  private downTime = 0;
  private mouseClicked = false;
  // Multi-touch: two active pointers switch to pinch-zoom + orbit.
  private readonly activePointers = new Map<number, { x: number; y: number }>();
  private pinchMode = false;
  private lastPinchDist = 0;
  // Cached secondary hand landmarks for two-hand coast. On a slow camera,
  // the second hand often drops out for 1-3 frames mid-gesture. We cache
  // its last position + timestamp so the zoom/rotate keeps working.
  private cachedSecHand: { x: number; y: number } | null = null;
  private cachedSecHandAt = 0;
  private lastPinchMid = { x: 0, y: 0 };

  // Debug snapshot (updated every frame, read by the overlay)
  mode: InputMode = 'none';
  gesture: PoseKind = 'NONE';
  isPinching = false;
  /** Unified action edges for worlds that consume raw input (drive preset). */
  actionHeld = false;
  actionPressed = false;
  actionReleased = false;
  /** TAP: a quick pinch (down + up within tapMaxMs, minimal drift). Fires on
   *  release — separate from actionPressed (which fires on pinch-down). This
   *  makes clicking UI / shooting feel instant: a quick pinch-tap is a tap,
   *  a held pinch is a grab. */
  tap = false;
  private tapStartTime = 0;
  private tapStartX = 0;
  private tapStartY = 0;
  private tapArmed = false;
  private prevActionHeld = false;
  /** Space key doubles as the brake pedal. */
  spaceDown = false;
  /** Raw scale-normalized thumb-index distance of the primary hand (null when no hand). */
  pinchValue: number | null = null;
  /** World-space cursor anchor (null when hidden): zoom-to-cursor target. */
  cursorWorld: THREE.Vector3 | null = null;
  private readonly cursorWorldVec = new THREE.Vector3();
  private displayedHover: THREE.Mesh | null = null;
  private hoverMissMs = 0;
  private lastSeenAt = 0;
  hoveredName: string | null = null;
  grabbedName: string | null = null;
  twoHandActive = false;

  constructor(private readonly prism: PrismScene) {
    // Mouse fallback: moving over the canvas points, holding grabs.
    // Pressing on EMPTY space orbits the camera instead of grabbing.
    const el = prism.renderer.domElement;
    el.style.pointerEvents = 'auto';
    el.addEventListener('pointermove', (e) => {
      if (this.activePointers.has(e.pointerId)) {
        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      // Two-finger gesture owns the frame: pinch = dolly, drift = orbit.
      if (this.pinchMode && this.activePointers.size >= 2) {
        const [a, b] = [...this.activePointers.values()];
        const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        prism.rig.dolly(this.lastPinchDist / dist);
        prism.rig.orbitBy(mid.x - this.lastPinchMid.x, mid.y - this.lastPinchMid.y);
        this.lastPinchDist = dist;
        this.lastPinchMid = mid;
        this.lastClient.x = e.clientX;
        this.lastClient.y = e.clientY;
        return;
      }
      const dx = e.clientX - this.lastClient.x;
      const dy = e.clientY - this.lastClient.y;
      this.lastClient.x = e.clientX;
      this.lastClient.y = e.clientY;
      if (this.mouseDown && this.orbitArmed) {
        prism.rig.orbitBy(dx, dy); // camera orbits, pointer stays frozen
        return;
      }
      if (this.panning) {
        prism.rig.panBy(dx, dy, prism.camera);
        return;
      }
      const rect = el.getBoundingClientRect();
      this.mouseNdc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
    });
    el.addEventListener('pointerdown', (e) => {
      this.lastClient.x = e.clientX;
      this.lastClient.y = e.clientY;
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // Second simultaneous pointer: switch to pinch-zoom, drop any grab
      // (the camera is moving, so a held object would swim).
      if (this.activePointers.size === 2) {
        const [a, b] = [...this.activePointers.values()];
        this.lastPinchDist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        this.lastPinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        this.pinchMode = true;
        this.mouseDown = false;
        this.orbitArmed = false;
        this.panning = false;
        if (this.grabbed) this.release();
        return;
      }
      const primary = e.button === 0 || e.pointerType === 'touch' || e.pointerType === 'pen';
      if (primary && !this.pinchMode) {
        this.mouseDown = true;
        this.downClientX = e.clientX;
        this.downClientY = e.clientY;
        this.downTime = performance.now();
        // Decide immediately: body under cursor → grab mode, else orbit mode.
        const rect = el.getBoundingClientRect();
        this.tmpNdc.set(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        this.raycaster.setFromCamera(this.tmpNdc, prism.camera);
        this.orbitArmed =
          this.raycaster.intersectObjects(prism.grabbables, false).length === 0 &&
          !prism.capturesPointer();
      } else if (e.button === 2) {
        this.panning = true;
      }
    });
    const endPointer = (e: PointerEvent | { pointerId: number; clientX?: number; clientY?: number }): void => {
      this.activePointers.delete(e.pointerId);
      if (this.activePointers.size < 2) this.pinchMode = false;
      // Click (not drag) on empty space = action pulse for worlds like drive.
      const up = e as PointerEvent;
      if (this.orbitArmed && typeof up?.clientX === 'number') {
        const moved = Math.hypot(up.clientX - this.downClientX, up.clientY - this.downClientY);
        if (moved < 6 && performance.now() - this.downTime < 400) {
          this.mouseClicked = true;
        }
      }
      this.mouseDown = false;
      this.orbitArmed = false;
      this.panning = false;
    };
    window.addEventListener('pointerup', endPointer);
    window.addEventListener('pointercancel', endPointer);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        prism.rig.dolly(Math.exp(e.deltaY * PrismConfig.cameraRig.zoomFactor));
        // Zoom toward the cursor, not the screen center: keeps the thing
        // you are looking at under the pointer while dollying.
        if (this.cursorWorld) {
          prism.rig.target.lerp(this.cursorWorld, 0.12);
          prism.rig.target.x = THREE.MathUtils.clamp(prism.rig.target.x, -10, 10);
          prism.rig.target.y = THREE.MathUtils.clamp(prism.rig.target.y, -6, 6);
          prism.rig.target.z = THREE.MathUtils.clamp(prism.rig.target.z, -10, 10);
        }
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
      const step = 26;
      switch (e.key) {
        case 'ArrowLeft': prism.rig.orbitBy(-step, 0); break;
        case 'ArrowRight': prism.rig.orbitBy(step, 0); break;
        case 'ArrowUp': prism.rig.orbitBy(0, -step); break;
        case 'ArrowDown': prism.rig.orbitBy(0, step); break;
        case '+': case '=': prism.rig.dolly(0.9); break;
        case '-': case '_': prism.rig.dolly(1.1); break;
        case 'r': case 'R': prism.rig.resetToHome(); break;
        case 'x': case 'X':
          window.dispatchEvent(new CustomEvent('prism-reset-world'));
          break;
        case 't': case 'T': prism.rig.setView('top'); break;
        case 'f': case 'F': prism.rig.setView('edge'); break;
        case 'v': case 'V': prism.rig.setView('overview'); break;
        case 'o': case 'O': prism.rig.autoRotate = !prism.rig.autoRotate; break;
        case 'e': case 'E':
          window.dispatchEvent(new CustomEvent('prism-easy'));
          window.dispatchEvent(new CustomEvent('prism-cycle', { detail: 1 }));
          break;
        case 'q': case 'Q':
          window.dispatchEvent(new CustomEvent('prism-cycle', { detail: -1 }));
          break;
        case 'b': case 'B':
          // Detonate the singularity (cinematic blackhole sequence).
          window.dispatchEvent(new CustomEvent('prism-detonate'));
          break;
        case ' ': this.spaceDown = true; e.preventDefault(); break;
        case '1': case '2': case '3': case '4': case '5':
        case '6': case '7': case '8': case '9': {
          const id = PRESET_ORDER[Number(e.key) - 1];
          if (id) window.dispatchEvent(new CustomEvent('prism-preset', { detail: id }));
          break;
        }
        case '0': {
          const id = PRESET_ORDER[9]; // nebula
          if (id) window.dispatchEvent(new CustomEvent('prism-preset', { detail: id }));
          break;
        }
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === ' ') this.spaceDown = false;
    });
  }

  /** Called when the world preset changes: drop stale grabs and camera drags. */
  onPresetChange(): void {
    this.release();
    this.twoHand.reset();
    this.trackers[0].reset();
    this.trackers[1].reset();
    this.twoHandActive = false;
    this.prevTwoHand = false;
    this.mouseDown = false;
    this.orbitArmed = false;
    this.panning = false;
    this.orbitDragPrimed = false;
    this.actionHeld = false;
    this.actionPressed = false;
    this.actionReleased = false;
    this.tap = false;
    this.tapArmed = false;
    this.prevActionHeld = false;
    this.mouseClicked = false;
    this.spaceDown = false;
    this.displayedHover = null;
    this.hoverMissMs = 0;
    this.cursorWorld = null;
    this.activePointers.clear();
    this.pinchMode = false;
    this.primaryFirst = true;
    this.anchorA = null;
    this.anchorB = null;
    this.lastRaw.x = 0;
    this.lastRaw.y = 0;
    this.calibrator.reset();
  }

  /** Smoothed pointer NDC x (-1 left .. +1 right): steering axis. */
  get pointerNX(): number {
    return this.pointerNdc.x;
  }

  /** Smoothed pointer NDC (read-only view for overlays). */
  get pointerNDC(): THREE.Vector2 {
    return this.pointerNdc;
  }

  /** Analog gas pedal: 0 at the exit threshold, 1 at full touch. */
  get pinchCloseness(): number {
    if (this.pinchValue === null) return 0;
    const g = PrismConfig.gestures;
    return THREE.MathUtils.clamp(
      (g.pinchExit - this.pinchValue) / (g.pinchExit - g.pinchEnter),
      0,
      1,
    );
  }

  /**
   * World-local ground point (y=0) under the current pointer ray.
   * Returns null when tracking/mouse is idle or the ray is parallel.
   */
  groundXZ(): { x: number; z: number } | null {
    if (this.mode === 'none') return null;
    this.tmpMat.copy(this.prism.world.matrixWorld).invert();
    this.tmpRay.copy(this.raycaster.ray).applyMatrix4(this.tmpMat);
    if (!this.tmpRay.intersectPlane(this.eclipticPlane, this.tmpLocal)) return null;
    return { x: this.tmpLocal.x, z: this.tmpLocal.z };
  }

  /** Landmark x is unmirrored camera space; the selfie view needs a flip. */
  private toNdc(lm: Landmark): { x: number; y: number } {
    return { x: 1 - lm.x * 2, y: -(lm.y * 2 - 1) };
  }

  update(dt: number, frame: HandFrame | null): void {
    const dtMs = dt * 1000;
    this.frameCount += 1;
    const hasHands = !!frame && frame.hands.length > 0;

    if (hasHands && frame) {
      this.mode = 'hand';
      this.updateFromHands(dt, dtMs, frame);
    } else if (this.mouseNdc) {
      this.mode = 'mouse';
      this.updateFromMouse(dt);
    } else {
      this.mode = 'none';
      this.gesture = 'NONE';
      this.isPinching = false;
      this.pinchValue = null;
      this.prevTwoHand = false;
      // Keep a latched grab only while its hand exists; a lost hand drops it.
      if (this.grabbed) this.release();
      this.twoHand.reset();
      this.twoHandActive = false;
      // Let stale per-hand state decay so re-entry starts clean.
      this.trackers[0].update(null, dtMs);
      this.trackers[1].update(null, dtMs);
      // Tracking clock restarts on resume: no fake time jump into the latch.
      this.lastTrackT = 0;
      // Coast: keep the last cursor/hover briefly instead of blinking out.
      if (performance.now() - this.lastSeenAt > PrismConfig.interaction.coastMs) {
        this.hoverMissMs = PrismConfig.interaction.hoverClearMs;
        this.applyHover(null, 0);
        this.prism.setCursor(null, 'hidden');
        this.cursorWorld = null;
      }
    }

    // ── RENDER-RATE POINTER SMOOTHING (triple-pass for ultra-premium feel) ──
    // The tracking loop sets pointerTarget at 10fps. The render loop runs at
    // 60fps. Chase the target with a TRIPLE exponential lerp so the cursor
    // moves buttery-smooth at 60fps even when tracking is at 10fps.
    //
    // The triple-pass cascades 3 exponential filters, each at a different
    // rate. This produces a critically-damped response — fast initial
    // movement toward the target, then smooth settle. No jitter, no lag.
    if (this.mode === 'hand') {
      // Pass 1: fast initial chase (rate 25 = ~34% per frame)
      const d1 = 1 - Math.exp(-25 * dt);
      // Pass 2: medium smoothing (rate 10 = ~15% per frame)
      const d2 = 1 - Math.exp(-10 * dt);
      // Pass 3: slow settle (rate 5 = ~8% per frame)
      const d3 = 1 - Math.exp(-5 * dt);
      // Combined: the product gives a critically-damped response.
      const combined = d1 * d2 * d3;
      this.pointerNdc.x += (this.pointerTarget.x - this.pointerNdc.x) * combined;
      this.pointerNdc.y += (this.pointerTarget.y - this.pointerNdc.y) * combined;
    }

    // Unified action edges (hand pinch or non-orbit mouse hold / click).
    const held =
      this.mode === 'hand'
        ? this.isPinching
        : this.mode === 'mouse'
          ? this.mouseDown && !this.orbitArmed
          : false;
    this.actionPressed = (held && !this.prevActionHeld) || this.mouseClicked;
    this.actionReleased = !held && this.prevActionHeld;
    this.actionHeld = held;

    // ── TAP DETECTION ──────────────────────────────────────────────────
    // A tap = quick pinch down + up within tapMaxMs, with minimal drift.
    // Fires on RELEASE (not press) so we know it was quick. This is
    // separate from actionPressed (grab) so worlds can distinguish:
    //   - tap (quick) → shoot / click UI / place block
    //   - held (grab) → drag / grab object
    this.tap = false;
    const nowMs = performance.now();
    if (this.actionPressed && this.mode === 'hand') {
      // Pinch just started — arm the tap, record start time + position.
      this.tapArmed = true;
      this.tapStartTime = nowMs;
      this.tapStartX = this.pointerNX;
      this.tapStartY = this.pointerNY;
    }
    if (this.actionReleased) {
      if (this.tapArmed) {
        const dur = nowMs - this.tapStartTime;
        const dx = this.pointerNX - this.tapStartX;
        const dy = this.pointerNY - this.tapStartY;
        const drift = Math.hypot(dx, dy);
        const cfg = PrismConfig.interaction;
        const maxMs = cfg.tapMaxMs ?? 350;
        const maxMove = cfg.tapMaxMove ?? 0.04;
        if (dur <= maxMs && drift <= maxMove) {
          this.tap = true;
        }
      }
      this.tapArmed = false;
    }
    // Mouse click also counts as a tap (for parity).
    if (this.mouseClicked) this.tap = true;

    this.prevActionHeld = held;
    this.mouseClicked = false;
  }

  // ---- hand input -------------------------------------------------------

  private updateFromHands(dt: number, dtMs: number, frame: HandFrame): void {
    const hands = frame.hands;
    // Tracking-clock delta (NOT render dt): at 10 fps frames arrive 100 ms
    // apart, and the pinch latch + pointer filter must see true time or
    // slow cameras feel either twitchy or dead. Crucially, repeated polls
    // of the SAME stale frame contribute ZERO (first sighting advances the
    // clock; re-reads don't), so render rate never inflates tracking time.
    // First frame after tracking loss primes with zero: no fake jump.
    let trackDtMs = 0;
    if (this.lastTrackT > 0 && frame.timestampMs > this.lastTrackT) {
      trackDtMs = Math.min(frame.timestampMs - this.lastTrackT, 500);
    }
    this.lastTrackT = frame.timestampMs;

    // Stable hand identity: MediaPipe reorders hands frame-to-frame, so
    // blindly taking hands[0] teleports the pointer whenever hands cross,
    // leave, or re-enter. Match by least wrist movement with a stickiness
    // margin; a genuine jump snaps the filter instead of streaking.
    const wrists = hands.map((h) => h.landmarks[0]);
    const wristDist = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
      Math.hypot(a.x - b.x, a.y - b.y);
    let primaryHand = hands[0];
    let secondaryHand: (typeof hands)[number] | null = null;
    if (hands.length > 1 && this.anchorA) {
      const d0A = wristDist(wrists[0], this.anchorA);
      const d1A = wristDist(wrists[1], this.anchorA);
      const d0B = this.anchorB ? wristDist(wrists[0], this.anchorB) : 0;
      const d1B = this.anchorB ? wristDist(wrists[1], this.anchorB) : 0;
      const costX = d0A + d1B;
      const costY = d1A + d0B;
      // Hysteresis margin: keep the current assignment unless the swap is
      // decisively better — kills flicker when wrists pass each other.
      const takeX = this.primaryFirst ? costX <= costY + 0.04 : costX + 0.04 < costY;
      primaryHand = takeX ? hands[0] : hands[1];
      secondaryHand = takeX ? hands[1] : hands[0];
      this.primaryFirst = takeX;
    } else {
      if (hands.length > 1) secondaryHand = hands[1];
      this.primaryFirst = true;
    }
    const jumped = this.anchorA !== null && wristDist(primaryHand.landmarks[0], this.anchorA) > 0.25;
    this.anchorA = { x: primaryHand.landmarks[0].x, y: primaryHand.landmarks[0].y };
    this.anchorB = secondaryHand
      ? { x: secondaryHand.landmarks[0].x, y: secondaryHand.landmarks[0].y }
      : null;

    this.trackers[0].update(primaryHand.landmarks, trackDtMs);
    this.trackers[1].update(secondaryHand ? secondaryHand.landmarks : null, trackDtMs);
    const prime = this.trackers[0];
    this.gesture = prime.pose;
    this.isPinching = prime.pinch.isPinching;
    this.pinchValue = pinchRatio(primaryHand.landmarks);
    // Feed the self-calibration with clearly-open hands (never pinches).
    this.calibrator.observe(
      this.pinchValue,
      prime.pose === 'POINT' || prime.pose === 'OPEN_PALM',
    );

    // Smoothed pointer from the primary index fingertip.
    // Guard: if landmarks are short (partial hand from a low-quality camera),
    // fall back to the wrist (landmark 0, always present).
    const tip = primaryHand.landmarks[INDEX_TIP] ?? primaryHand.landmarks[0];
    if (!tip) return; // degenerate frame — skip this update entirely
    const raw = this.toNdc(tip);
    if (jumped) {
      // True discontinuity (re-entry elsewhere): snap honestly. Slewing
      // toward stale data is what "teleport streaks" are made of.
      this.tmpNdcSample.x = raw.x;
      this.tmpNdcSample.y = raw.y;
      this.pointerFilter.reset(this.tmpNdcSample);
      this.lastRaw.x = raw.x;
      this.lastRaw.y = raw.y;
    } else {
      // Adaptive micro-deadzone: sub-pixel tremor never enters the filter.
      // It breathes with measured noise (old cameras get a wider floor)
      // and vanishes the moment the hand genuinely moves.
      const dead =
        this.pointerFilter.pointerSpeed < 0.3
          ? 0.0015 + Math.min(this.pointerFilter.noisePerSample * 0.3, 0.004)
          : 0;
      if (dead > 0 && Math.hypot(raw.x - this.lastRaw.x, raw.y - this.lastRaw.y) < dead) {
        raw.x = this.lastRaw.x;
        raw.y = this.lastRaw.y;
      }
      this.lastRaw.x = raw.x;
      this.lastRaw.y = raw.y;
    }
    this.tmpNdcSample.x = raw.x;
    this.tmpNdcSample.y = raw.y;
    // Tracking-clock step (NOT render dt) + sensor confidence: the filter
    // stays honest whether frames arrive at 10 Hz or 120 Hz, clean or noisy.
    this.pointerFilter.update(this.tmpNdcSample, trackDtMs, primaryHand.confidence, this.tmpSmoothed);
    // Set the TARGET — pointerNdc will chase this at render rate (below).
    this.pointerTarget.set(this.tmpSmoothed.x, this.tmpSmoothed.y);

    // Two-hand transform takes precedence over single-hand dragging.
    // COAST for slow cameras: the second hand often drops out for 1-3 frames.
    // Cache its last pinch point + use it for up to 500ms so the zoom/rotate
    // keeps working through brief tracking gaps.
    const primeP = prime.pinch.isPinching;
    const secP = this.trackers[1].pinch.isPinching;
    const now = performance.now();
    // Always work with Point2D (pinch point), never the raw TrackedHand —
    // the TwoHandGesture.update expects {x, y} not a hand object.
    const primePoint = pinchPoint2D(primaryHand.landmarks);
    if (secondaryHand) {
      this.cachedSecHand = pinchPoint2D(secondaryHand);
      this.cachedSecHandAt = now;
    }
    const secCoastAlive = this.cachedSecHand && (now - this.cachedSecHandAt < 500);
    const secPoint = secondaryHand
      ? this.cachedSecHand  // fresh — just cached above
      : (secCoastAlive ? this.cachedSecHand : null);
    const bothPinching = primeP && secP && secPoint !== null;
    if (bothPinching && secPoint) {
      // Fresh baseline on entry: stale ratios from a previous gesture would
      // otherwise teleport the world scale on the first frame.
      if (!this.prevTwoHand) {
        this.lastScaleRatio = 1;
        this.lastAngleDelta = 0;
      }
      this.prevTwoHand = true;
      const delta = this.twoHand.update(primePoint, secPoint);
      this.twoHandActive = true;
      if (delta) this.applyTwoHandDelta(delta.scaleRatio, delta.angleDelta);
      if (this.grabbed) this.release(); // two-hand mode owns the world, not an orb
      this.applyHover(null, dtMs);
      this.updateCursor();
      return;
    }
    // If we were in two-hand mode but lost it, reset the two-hand baseline
    // so the next entry doesn't jump.
    if (this.prevTwoHand && !bothPinching) {
      this.twoHand.reset();
    }
    this.prevTwoHand = false;
    this.twoHand.reset();
    this.twoHandActive = false;

    this.raycaster.setFromCamera(this.pointerNdc, this.prism.camera);
    this.prism.trackPointer(this.pointerNdc.x, this.pointerNdc.y);

    // Rising edge: grab whatever is hovered.
    const hovered = this.pick();
    if (prime.pinch.isPinching) {
      if (!this.grabbed && hovered) this.grab(hovered);
      if (this.grabbed) this.drag(dt);
    } else if (this.grabbed) {
      this.release();
    }

    this.applyHover(hovered, dtMs);
    this.grabbedName = this.grabbed?.name ?? null;
    this.lastSeenAt = performance.now();
    this.updateCursor();
  }

  // ---- mouse fallback ----------------------------------------------------

  private updateFromMouse(dt: number): void {
    const ndc = this.mouseNdc;
    if (!ndc) return;
    // Camera-orbit drag: re-aim the frozen pointer ray, skip grab logic.
    if (this.mouseDown && this.orbitArmed) {
      this.raycaster.setFromCamera(this.pointerNdc, this.prism.camera);
      this.gesture = 'NONE';
      this.isPinching = false;
      this.prevTwoHand = false;
      if (this.grabbed) this.release();
      this.applyHover(null, dt * 1000);
      this.lastSeenAt = performance.now();
      this.updateCursor();
      this.prevMouseDown = this.mouseDown;
      return;
    }
    this.tmpNdcSample.x = ndc.x;
    this.tmpNdcSample.y = ndc.y;
    // Mouse rides the same adaptive filter at full confidence: at 60+ Hz
    // render polling it stays wide open, and its spike gate still eats
    // single-frame glitches (alt-tab jumps, resolution snaps).
    this.pointerFilter.update(this.tmpNdcSample, dt * 1000, 1, this.tmpSmoothed);
    // Mouse: set target directly (mouse is already 60fps, no need for the
    // render-rate chase — but keeping it consistent with the hand path).
    this.pointerTarget.set(this.tmpSmoothed.x, this.tmpSmoothed.y);
    this.pointerNdc.set(this.tmpSmoothed.x, this.tmpSmoothed.y);
    this.raycaster.setFromCamera(this.pointerNdc, this.prism.camera);
    this.prism.trackPointer(this.pointerNdc.x, this.pointerNdc.y);

    const hovered = this.pick();
    const pinching = this.mouseDown;
    this.gesture = pinching ? 'PINCH' : hovered ? 'POINT' : 'NONE';
    this.isPinching = pinching;
    this.pinchValue = null;

    if (pinching && !this.prevMouseDown) {
      if (!this.grabbed && hovered && !this.orbitArmed) this.grab(hovered);
    }
    if (pinching && this.grabbed) this.drag(dt);
    if (!pinching && this.grabbed) this.release();
    this.prevMouseDown = this.mouseDown;

    this.applyHover(hovered, dt * 1000);
    this.grabbedName = this.grabbed?.name ?? null;
    this.lastSeenAt = performance.now();
    this.updateCursor();
  }

  // ---- shared mechanics ---------------------------------------------------

  private pick(): THREE.Mesh | null {
    if (this.pickFrame === this.frameCount) return this.cachedPick;
    this.pickFrame = this.frameCount;
    const hits = this.raycaster.intersectObjects(this.prism.grabbables, false);
    const direct = (hits[0]?.object as THREE.Mesh | undefined) ?? null;
    if (direct) {
      this.cachedPick = direct;
      return direct;
    }
    // Grab assist: a near-miss within a small screen radius snaps to the
    // nearest body center (tiny Mercury would otherwise be unhittable).
    let best: THREE.Mesh | null = null;
    let bestD = PrismConfig.interaction.hoverRadius;
    for (const obj of this.prism.grabbables) {
      const mesh = obj as THREE.Mesh;
      mesh.getWorldPosition(this.tmpProj).project(this.prism.camera);
      if (this.tmpProj.z > 1) continue; // behind the camera
      const d = Math.hypot(this.tmpProj.x - this.pointerNdc.x, this.tmpProj.y - this.pointerNdc.y);
      if (d < bestD) {
        bestD = d;
        best = mesh;
      }
    }
    this.cachedPick = best;
    return best;
  }

  /**
   * Hover with flicker guard: highlights switch instantly, but clearing
   * waits out a time window (not frames) so edge-grazing never strobes at
   * any render rate.
   */
  private applyHover(candidate: THREE.Mesh | null, dtMs: number): void {
    const target = this.grabbed ?? candidate;
    if (target) {
      this.hoverMissMs = 0;
      this.displayedHover = target;
      this.prism.setHover(target);
    } else {
      this.hoverMissMs += dtMs;
      if (this.hoverMissMs >= PrismConfig.interaction.hoverClearMs) {
        this.displayedHover = null;
        this.prism.setHover(null);
      }
    }
    this.hoveredName = this.displayedHover?.name ?? null;
  }

  private grab(mesh: THREE.Mesh): void {
    // Info-only bodies (e.g. the sun) highlight but cannot be grabbed.
    if (mesh.userData.grabbable === false) return;
    this.grabbed = mesh;
    this.orbitDragPrimed = false;
    // Anchor plane: perpendicular to the view ray through the hit point, so
    // lateral hand motion drags along the screen and depth stays stable.
    const hit = this.raycaster.intersectObject(mesh, false)[0];
    const anchor = hit ? hit.point : mesh.position;
    this.tmpA.copy(this.prism.camera.position).sub(anchor).normalize();
    this.grabPlane.setFromNormalAndCoplanarPoint(this.tmpA, anchor);
    this.grabOffset.copy(mesh.position).sub(anchor);
    this.grabSmoother.reset(mesh.position);
    this.prism.markGrabbed(mesh);
  }

  private drag(dt: number): void {
    if (!this.grabbed) return;
    // Orbit bodies slide within the ecliptic plane (retargeting their orbit);
    // free bodies drag along the anchored camera-facing plane.
    if (this.grabbed.userData.orbitBody) {
      this.tmpMat.copy(this.prism.world.matrixWorld).invert();
      this.tmpRay.copy(this.raycaster.ray).applyMatrix4(this.tmpMat);
      if (this.tmpRay.intersectPlane(this.eclipticPlane, this.tmpLocal)) {
        // Prime the smoother in world-local space on the first drag frame
        // (it was reset in world space at grab time — different frame).
        if (!this.orbitDragPrimed) {
          this.grabSmoother.reset(this.tmpLocal);
          this.orbitDragPrimed = true;
        }
        this.grabSmoother.update(this.tmpLocal, dt, this.tmpTarget);
        this.prism.setOrbitFromPoint(this.grabbed, this.tmpTarget);
      }
      return;
    }
    // Intersect the pointer ray with the anchored grab plane.
    if (this.raycaster.ray.intersectPlane(this.grabPlane, this.tmpB)) {
      this.tmpTarget.copy(this.tmpB).add(this.grabOffset);
      // Clamp to a comfortable interaction volume.
      this.tmpTarget.x = THREE.MathUtils.clamp(this.tmpTarget.x, -4, 4);
      this.tmpTarget.y = THREE.MathUtils.clamp(this.tmpTarget.y, -2.5, 2.5);
      this.tmpTarget.z = THREE.MathUtils.clamp(this.tmpTarget.z, -2.5, 2.5);
      this.grabSmoother.update(this.tmpTarget, dt, this.grabbed.position);
    }
  }

  private release(): void {
    const mesh = this.grabbed;
    // Voxel preset: snap onto the build grid on release (stackable towers).
    if (mesh?.userData.gridSnap) {
      const g = PrismConfig.interaction.gridSnap;
      mesh.position.set(
        Math.round(mesh.position.x / g) * g,
        Math.max(g / 2, Math.round(mesh.position.y / g) * g),
        Math.round(mesh.position.z / g) * g,
      );
    }
    this.grabbed = null;
    this.prism.markGrabbed(null);
    this.grabbedName = null;
  }

  private applyTwoHandDelta(scaleRatio: number, angleDelta: number): void {
    const cfg = PrismConfig.interaction;
    // NATURAL ZOOM: move the CAMERA (dolly), not scale the world.
    // Scaling world.scale feels unnatural — objects inflate/deflate in place
    // and clip through the camera. Dollying the camera distance feels like
    // flying through space — the natural "pinch to zoom" metaphor.
    //
    // scaleRatio > 1 = hands moved apart = zoom IN (camera closer)
    // scaleRatio < 1 = hands moved together = zoom OUT (camera further)
    const step = scaleRatio / Math.max(1e-6, this.lastScaleRatio);
    // Invert: hands apart (step > 1) should bring camera CLOSER (dolly in).
    // dolly(factor) multiplies distance by factor, so factor < 1 = closer.
    const dollyFactor = 1 / Math.max(1e-6, Math.pow(step, cfg.zoomSpeed));
    this.prism.rig.dolly(dollyFactor);

    // Rotation: smoothed. The angle delta is incremental. Apply with
    // heavy damping for premium feel — no snappy rotation jumps.
    const rotDelta = (angleDelta - this.lastAngleDelta) * cfg.rotateSpeed;
    this.prism.world.rotation.y += rotDelta * 0.15;  // was 0.3 — gentler, smoother
    this.lastScaleRatio = scaleRatio;
    this.lastAngleDelta = angleDelta;
  }

  private updateCursor(): void {
    const closeness =
      this.mode === 'hand' ? this.pinchCloseness : this.mouseDown ? 1 : 0;
    // World-owned target (voxel picking): ride the hit point directly.
    // (scene.setCursor stretches the pointer ray through the point itself.)
    if (!this.grabbed && !this.hoveredName && this.prism.pointerFocus(this.tmpB)) {
      this.cursorWorldVec.copy(this.tmpB);
      this.cursorWorld = this.cursorWorldVec;
      this.prism.setCursor(this.tmpB, 'hover', 1.25, closeness);
      return;
    }
    // Project the smoothed pointer ray onto a plane facing the camera at the
    // hovered/grabbed depth (or z=0) to place the 3D cursor.
    const focus = this.grabbed ?? (this.hoveredName ? this.pick() : null);
    const depth = focus
      ? this.tmpA.copy(focus.position).sub(this.prism.camera.position).length()
      : this.prism.camera.position.length();
    this.tmpB.copy(this.raycaster.ray.direction).multiplyScalar(depth).add(this.raycaster.ray.origin);
    this.cursorWorldVec.copy(this.tmpB);
    this.cursorWorld = this.cursorWorldVec;
    let mode: CursorMode = 'point';
    let boost = 1;
    if (this.grabbed) {
      mode = 'grab';
      boost = 1.5;
    } else if (this.isPinching) {
      mode = 'pinch';
      boost = 1.4;
    } else if (this.hoveredName) {
      mode = 'hover';
      boost = 1.25;
    } else if (this.mode === 'hand' && this.pinchValue !== null) {
      // Pinch-proximity affordance: the cursor swells as the pinch closes,
      // teaching the grab threshold without a tutorial.
      boost = 1 + 0.6 * this.pinchCloseness;
    }
    this.prism.setCursor(this.tmpB, mode, boost, closeness);
  }
}
