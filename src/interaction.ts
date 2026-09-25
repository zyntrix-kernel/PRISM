// Interaction controller: turns gestures + pointer motion into scene action.
//
// Pipeline per frame:
//   landmarks (or mouse) -> smoothed pointer NDC -> raycast -> hover
//   pinch rising edge + hover -> grab (anchor plane + offset captured)
//   pinch held -> drag grabbed orb along the grab plane (smoothed)
//   pinch falling edge -> release
//   two simultaneous pinches -> world zoom + rotate
//   sustained open palm -> scene reset
//
// All transient math uses preallocated temporaries (no hot-loop garbage).

import * as THREE from 'three';
import { PrismConfig } from './config';
import { GestureTracker, PinchCalibrator, TwoHandGesture, pinchRatio, type PoseKind } from './gestures';
import { PRESET_ORDER } from './presets/types';
import { OneEuroSmoother, Vec3Smoother } from './smoothing';
import type { CursorMode, PrismScene } from './scene';
import type { HandFrame, Landmark, Point2D } from './types';

export type InputMode = 'hand' | 'mouse' | 'none';

const INDEX_TIP = 8;
const THUMB_TIP = 4;

function pinchPoint2D(landmarks: Landmark[]): Point2D {
  return {
    x: (landmarks[THUMB_TIP].x + landmarks[INDEX_TIP].x) / 2,
    y: (landmarks[THUMB_TIP].y + landmarks[INDEX_TIP].y) / 2,
  };
}

export class InteractionController {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2(0, 0);
  private readonly pointerSmoother = new OneEuroSmoother(
    PrismConfig.interaction.pointerMinCutoff,
    PrismConfig.interaction.pointerBeta,
    PrismConfig.interaction.pointerDcutoff,
  );
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
  private lastPinchMid = { x: 0, y: 0 };

  // Debug snapshot (updated every frame, read by the overlay)
  mode: InputMode = 'none';
  gesture: PoseKind = 'NONE';
  isPinching = false;
  /** Unified action edges for worlds that consume raw input (drive preset). */
  actionHeld = false;
  actionPressed = false;
  actionReleased = false;
  private prevActionHeld = false;
  /** Space key doubles as the brake pedal. */
  spaceDown = false;
  /** Raw scale-normalized thumb-index distance of the primary hand (null when no hand). */
  pinchValue: number | null = null;
  /** World-space cursor anchor (null when hidden): zoom-to-cursor target. */
  cursorWorld: THREE.Vector3 | null = null;
  private readonly cursorWorldVec = new THREE.Vector3();
  private displayedHover: THREE.Mesh | null = null;
  private hoverMiss = 0;
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
        this.orbitArmed = this.raycaster.intersectObjects(prism.grabbables, false).length === 0;
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
        case 't': case 'T': prism.rig.setView('top'); break;
        case 'f': case 'F': prism.rig.setView('edge'); break;
        case 'v': case 'V': prism.rig.setView('overview'); break;
        case 'o': case 'O': prism.rig.autoRotate = !prism.rig.autoRotate; break;
        case 'e': case 'E':
          window.dispatchEvent(new CustomEvent('prism-easy'));
          break;
        case ' ': this.spaceDown = true; e.preventDefault(); break;
        case '1': case '2': case '3': case '4': case '5': case '6': {
          const id = PRESET_ORDER[Number(e.key) - 1];
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
    this.twoHandActive = false;
    this.prevTwoHand = false;
    this.mouseDown = false;
    this.orbitArmed = false;
    this.panning = false;
    this.orbitDragPrimed = false;
    this.actionHeld = false;
    this.actionPressed = false;
    this.actionReleased = false;
    this.prevActionHeld = false;
    this.mouseClicked = false;
    this.spaceDown = false;
    this.displayedHover = null;
    this.hoverMiss = 0;
    this.cursorWorld = null;
    this.activePointers.clear();
    this.pinchMode = false;
    this.calibrator.reset();
  }

  /** Smoothed pointer NDC x (-1 left .. +1 right): steering axis. */
  get pointerNX(): number {
    return this.pointerNdc.x;
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
      // Coast: keep the last cursor/hover briefly instead of blinking out.
      if (performance.now() - this.lastSeenAt > PrismConfig.interaction.coastMs) {
        this.hoverMiss = PrismConfig.interaction.hoverMissFrames;
        this.applyHover(null);
        this.prism.setCursor(null, 'hidden');
        this.cursorWorld = null;
      }
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
    this.prevActionHeld = held;
    this.mouseClicked = false;
  }

  // ---- hand input -------------------------------------------------------

  private updateFromHands(dt: number, dtMs: number, frame: HandFrame): void {
    const hands = frame.hands;
    this.trackers[0].update(hands[0]?.landmarks ?? null, dtMs);
    this.trackers[1].update(hands[1]?.landmarks ?? null, dtMs);
    const primary = this.trackers[0];
    this.gesture = primary.pose;
    this.isPinching = primary.pinch.isPinching;
    this.pinchValue = pinchRatio(hands[0].landmarks);
    // Feed the self-calibration with clearly-open hands (never pinches).
    this.calibrator.observe(
      this.pinchValue,
      primary.pose === 'POINT' || primary.pose === 'OPEN_PALM',
    );

    // Smoothed pointer from the primary index fingertip.
    const tip = hands[0].landmarks[INDEX_TIP];
    const raw = this.toNdc(tip);
    this.tmpNdcSample.x = raw.x;
    this.tmpNdcSample.y = raw.y;
    this.tmpNdcSample.z = 0;
    this.pointerSmoother.update(this.tmpNdcSample, dt, this.tmpSmoothed);
    this.pointerNdc.set(this.tmpSmoothed.x, this.tmpSmoothed.y);

    // Two-hand transform takes precedence over single-hand dragging.
    const bothPinching = primary.pinch.isPinching && this.trackers[1].pinch.isPinching && hands.length > 1;
    if (bothPinching) {
      // Fresh baseline on entry: stale ratios from a previous gesture would
      // otherwise teleport the world scale on the first frame.
      if (!this.prevTwoHand) {
        this.lastScaleRatio = 1;
        this.lastAngleDelta = 0;
      }
      this.prevTwoHand = true;
      const delta = this.twoHand.update(pinchPoint2D(hands[0].landmarks), pinchPoint2D(hands[1].landmarks));
      this.twoHandActive = true;
      if (delta) this.applyTwoHandDelta(delta.scaleRatio, delta.angleDelta);
      if (this.grabbed) this.release(); // two-hand mode owns the world, not an orb
      this.applyHover(null);
      this.updateCursor();
      return;
    }
    this.prevTwoHand = false;
    this.twoHand.reset();
    this.twoHandActive = false;

    this.raycaster.setFromCamera(this.pointerNdc, this.prism.camera);

    // Rising edge: grab whatever is hovered.
    const hovered = this.pick();
    if (primary.pinch.isPinching) {
      if (!this.grabbed && hovered) this.grab(hovered);
      if (this.grabbed) this.drag(dt);
    } else if (this.grabbed) {
      this.release();
    }

    this.applyHover(hovered);
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
      this.applyHover(null);
      this.lastSeenAt = performance.now();
      this.updateCursor();
      this.prevMouseDown = this.mouseDown;
      return;
    }
    this.tmpNdcSample.x = ndc.x;
    this.tmpNdcSample.y = ndc.y;
    this.tmpNdcSample.z = 0;
    this.pointerSmoother.update(this.tmpNdcSample, dt, this.tmpSmoothed);
    this.pointerNdc.set(this.tmpSmoothed.x, this.tmpSmoothed.y);
    this.raycaster.setFromCamera(this.pointerNdc, this.prism.camera);

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

    this.applyHover(hovered);
    this.grabbedName = this.grabbed?.name ?? null;
    this.lastSeenAt = performance.now();
    this.updateCursor();
  }

  // ---- shared mechanics ---------------------------------------------------

  private pick(): THREE.Mesh | null {
    const hits = this.raycaster.intersectObjects(this.prism.grabbables, false);
    const direct = (hits[0]?.object as THREE.Mesh | undefined) ?? null;
    if (direct) return direct;
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
    return best;
  }

  /**
   * Hover with flicker guard: highlights switch instantly, but clearing
   * waits out a few missed frames so edge-grazing never strobes.
   */
  private applyHover(candidate: THREE.Mesh | null): void {
    const target = this.grabbed ?? candidate;
    if (target) {
      this.hoverMiss = 0;
      this.displayedHover = target;
      this.prism.setHover(target);
    } else if (++this.hoverMiss >= PrismConfig.interaction.hoverMissFrames) {
      this.displayedHover = null;
      this.prism.setHover(null);
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
    // Incremental application avoids compounding error from a stale baseline.
    const step = scaleRatio / Math.max(1e-6, this.lastScaleRatio);
    const target = THREE.MathUtils.clamp(
      this.prism.world.scale.x * Math.pow(step, cfg.zoomSpeed),
      cfg.worldScaleMin,
      cfg.worldScaleMax,
    );
    this.prism.world.scale.setScalar(target);
    this.prism.world.rotation.y += (angleDelta - this.lastAngleDelta) * cfg.rotateSpeed;
    this.lastScaleRatio = scaleRatio;
    this.lastAngleDelta = angleDelta;
  }

  private updateCursor(): void {
    // Project the smoothed pointer ray onto a plane facing the camera at the
    // hovered/grabbed depth (or z=0) to place the 3D cursor.
    const focus = this.grabbed ?? (this.hoveredName ? this.pick() : null);
    const depth = focus
      ? this.tmpA.copy(focus.position).sub(this.prism.camera.position).length()
      : this.prism.camera.position.length();
    this.tmpB.copy(this.raycaster.ray.direction).multiplyScalar(depth).add(this.raycaster.ray.origin);
    this.cursorWorldVec.copy(this.tmpB);
    this.cursorWorld = this.cursorWorldVec;
    const closeness =
      this.mode === 'hand' ? this.pinchCloseness : this.mouseDown ? 1 : 0;
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
