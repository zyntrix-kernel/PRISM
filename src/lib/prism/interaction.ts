// Interaction controller: turns gestures + pointer motion into scene action.
//
// Two-hand pinch: separation controls smooth camera dolly, hand-axis twist
// controls continuous world rotation. Gesture deltas are rate-limited and
// low-pass filtered so noisy MediaPipe samples cannot cause jumps.

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
  const thumb = landmarks[THUMB_TIP] ?? landmarks[0];
  const index = landmarks[INDEX_TIP] ?? landmarks[0];
  if (!thumb || !index) return { x: 0.5, y: 0.5 };
  return { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 };
}

export class InteractionController {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2(0, 0);
  private readonly pointerTarget = new THREE.Vector2(0, 0);
  private readonly pointerFilter = new AdaptivePointerFilter({ ...PrismConfig.interaction.pointerAdaptive });
  private readonly grabSmoother = new Vec3Smoother(PrismConfig.interaction.grabSmoothing);
  private readonly trackers = [new GestureTracker(), new GestureTracker()];
  private readonly twoHand = new TwoHandGesture();

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
  private readonly rayHits: THREE.Intersection[] = [];
  private lastHandFrameTimestamp = -1;
  private lastHandResultAt = 0;
  /** Estimated capture-to-display age from the tracker, in milliseconds. */
  private lastHandCaptureAgeMs = 0;
  private frameCount = 0;
  private pickFrame = -1;
  private cachedPick: THREE.Mesh | null = null;
  private pickDirty = true;
  private readonly eclipticPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly tmpRay = new THREE.Ray();
  private readonly tmpMat = new THREE.Matrix4();
  private readonly tmpLocal = new THREE.Vector3();
  private readonly groundPoint = { x: 0, z: 0 };
  private orbitDragPrimed = false;

  // Two-hand motion filter. These operate on per-sample deltas, so zoom and
  // rotation remain controllable even when camera FPS changes.
  private lastScaleRatio = 1;
  private lastAngleDelta = 0;
  private smoothZoomLog = 0;
  private smoothRotation = 0;
  private prevTwoHand = false;

  private readonly calibrator = new PinchCalibrator();
  private lastTrackT = 0;
  private primaryFirst = true;
  private anchorA: { x: number; y: number } | null = null;
  private anchorB: { x: number; y: number } | null = null;
  private readonly lastRaw = { x: 0, y: 0 };

  private mouseNdc: THREE.Vector2 | null = null;
  private mouseDown = false;
  private prevMouseDown = false;
  private orbitArmed = false;
  private panning = false;
  private readonly lastClient = { x: 0, y: 0 };
  private downClientX = 0;
  private downClientY = 0;
  private downTime = 0;
  private mouseClicked = false;
  private readonly activePointers = new Map<number, { x: number; y: number }>();
  private pinchMode = false;
  private lastPinchDist = 0;
  private cachedSecHand: { x: number; y: number } | null = null;
  private cachedSecHandAt = 0;
  private lastPinchMid = { x: 0, y: 0 };

  mode: InputMode = 'none';
  gesture: PoseKind = 'NONE';
  isPinching = false;
  actionHeld = false;
  actionPressed = false;
  actionReleased = false;
  tap = false;
  private tapStartTime = 0;
  private tapStartX = 0;
  private tapStartY = 0;
  private tapArmed = false;
  private prevActionHeld = false;
  spaceDown = false;
  pinchValue: number | null = null;
  cursorWorld: THREE.Vector3 | null = null;
  private readonly cursorWorldVec = new THREE.Vector3();
  private displayedHover: THREE.Mesh | null = null;
  private hoverMissMs = 0;
  private lastSeenAt = 0;
  hoveredName: string | null = null;
  grabbedName: string | null = null;
  twoHandActive = false;
  private readonly listenerAbort = new AbortController();

  constructor(private readonly prism: PrismScene) {
    const el = prism.renderer.domElement;
    const signal = this.listenerAbort.signal;
    el.style.pointerEvents = 'auto';
    el.addEventListener('pointermove', (e) => {
      if (this.activePointers.has(e.pointerId)) this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinchMode && this.activePointers.size >= 2) {
        const [a, b] = [...this.activePointers.values()];
        const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        prism.rig.dolly(this.lastPinchDist / dist);
        prism.rig.orbitBy(mid.x - this.lastPinchMid.x, mid.y - this.lastPinchMid.y);
        this.lastPinchDist = dist;
        this.lastPinchMid = mid;
        this.lastClient.x = e.clientX; this.lastClient.y = e.clientY; return;
      }
      const dx = e.clientX - this.lastClient.x; const dy = e.clientY - this.lastClient.y;
      this.lastClient.x = e.clientX; this.lastClient.y = e.clientY;
      if (this.mouseDown && this.orbitArmed) { prism.rig.orbitBy(dx, dy); return; }
      if (this.panning) { prism.rig.panBy(dx, dy, prism.camera); return; }
      const rect = el.getBoundingClientRect();
      if (!this.mouseNdc) this.mouseNdc = new THREE.Vector2();
      this.mouseNdc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    }, { signal });
    el.addEventListener('pointerdown', (e) => {
      this.lastClient.x = e.clientX; this.lastClient.y = e.clientY;
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.activePointers.size === 2) {
        const [a, b] = [...this.activePointers.values()];
        this.lastPinchDist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        this.lastPinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        this.pinchMode = true; this.mouseDown = false; this.orbitArmed = false; this.panning = false;
        if (this.grabbed) this.release(); return;
      }
      const primary = e.button === 0 || e.pointerType === 'touch' || e.pointerType === 'pen';
      if (primary && !this.pinchMode) {
        this.mouseDown = true; this.downClientX = e.clientX; this.downClientY = e.clientY; this.downTime = performance.now();
        this.orbitArmed = false; this.panning = e.button === 2;
      }
    }, { signal });
    el.addEventListener('pointerup', (e) => {
      this.activePointers.delete(e.pointerId);
      if (this.pinchMode && this.activePointers.size < 2) { this.pinchMode = false; this.lastPinchDist = 0; }
      if (this.activePointers.size === 0) { this.mouseDown = false; this.orbitArmed = false; this.panning = false; }
    }, { signal });
    el.addEventListener('pointercancel', (e) => { this.activePointers.delete(e.pointerId); if (this.activePointers.size < 2) this.pinchMode = false; }, { signal });
    el.addEventListener('wheel', (e) => { e.preventDefault(); prism.rig.dolly(Math.exp(e.deltaY * 0.0015)); }, { passive: false, signal });
    window.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'r': case 'R': prism.rig.autoRotate = !prism.rig.autoRotate; break;
        case '0': { const id = PRESET_ORDER[9]; if (id) window.dispatchEvent(new CustomEvent('prism-preset', { detail: id })); break; }
        case ' ': this.spaceDown = true; e.preventDefault(); break;
      }
    }, { signal });
    window.addEventListener('keyup', (e) => { if (e.key === ' ') this.spaceDown = false; }, { signal });
  }

  dispose(): void { this.listenerAbort.abort(); this.activePointers.clear(); this.release(); this.twoHand.reset(); this.cursorWorld = null; this.mouseNdc = null; this.mouseDown = false; this.orbitArmed = false; this.panning = false; }

  onPresetChange(): void {
    this.release(); this.twoHand.reset(); this.trackers[0].reset(); this.trackers[1].reset();
    this.twoHandActive = false; this.prevTwoHand = false; this.lastScaleRatio = 1; this.lastAngleDelta = 0; this.smoothZoomLog = 0; this.smoothRotation = 0;
    this.mouseDown = false; this.orbitArmed = false; this.panning = false; this.orbitDragPrimed = false;
    this.actionHeld = false; this.actionPressed = false; this.actionReleased = false; this.tap = false; this.tapArmed = false; this.prevActionHeld = false; this.mouseClicked = false; this.spaceDown = false;
    this.displayedHover = null; this.hoverMissMs = 0; this.cursorWorld = null; this.activePointers.clear(); this.pinchMode = false; this.primaryFirst = true;
    this.anchorA = null; this.anchorB = null; this.lastRaw.x = 0; this.lastRaw.y = 0; this.lastHandFrameTimestamp = -1; this.lastHandResultAt = 0; this.calibrator.reset();
  }

  get pointerNX(): number { return this.pointerNdc.x; }
  get pointerSpeed(): number { return this.pointerFilter.pointerSpeed; }
  get pointerNDC(): THREE.Vector2 { return this.pointerNdc; }
  get pinchCloseness(): number { if (this.pinchValue === null) return 0; const g = PrismConfig.gestures; return THREE.MathUtils.clamp((g.pinchExit - this.pinchValue) / (g.pinchExit - g.pinchEnter), 0, 1); }

  groundXZ(): { x: number; z: number } | null {
    if (this.mode === 'none') return null;
    this.tmpMat.copy(this.prism.world.matrixWorld).invert(); this.tmpRay.copy(this.raycaster.ray).applyMatrix4(this.tmpMat);
    if (!this.tmpRay.intersectPlane(this.eclipticPlane, this.tmpLocal)) return null;
    this.groundPoint.x = this.tmpLocal.x; this.groundPoint.z = this.tmpLocal.z; return this.groundPoint;
  }

  private toNdc(lm: Landmark): { x: number; y: number } {
    const visibleHeight = (4 / 3) / (16 / 9); const visibleTop = (1 - visibleHeight) * 0.5;
    const x = Math.max(0, Math.min(1, lm.x)); const y = Math.max(0, Math.min(1, (lm.y - visibleTop) / visibleHeight));
    return { x: 1 - x * 2, y: -(y * 2 - 1) };
  }

  update(dt: number, frame: HandFrame | null): void {
    const dtMs = dt * 1000; this.frameCount += 1; const hasHands = !!frame && frame.hands.length > 0;
    if (hasHands && frame) { this.mode = 'hand'; this.updateFromHands(dt, dtMs, frame); }
    else if (this.mouseNdc) { this.mode = 'mouse'; this.updateFromMouse(dt); }
    else {
      this.mode = 'none'; this.gesture = 'NONE'; this.isPinching = false; this.pinchValue = null; this.prevTwoHand = false;
      if (this.grabbed) this.release(); this.twoHand.reset(); this.twoHandActive = false; this.trackers[0].update(null, dtMs); this.trackers[1].update(null, dtMs); this.lastTrackT = 0; this.lastHandFrameTimestamp = -1;
      if (performance.now() - this.lastSeenAt > PrismConfig.interaction.coastMs) { this.hoverMissMs = PrismConfig.interaction.hoverClearMs; this.applyHover(null, 0); this.prism.setCursor(null, 'hidden'); this.cursorWorld = null; }
    }
    const held = this.mode === 'hand' ? this.isPinching : this.mode === 'mouse' ? this.mouseDown && !this.orbitArmed : false;
    this.actionPressed = (held && !this.prevActionHeld) || this.mouseClicked; this.actionReleased = !held && this.prevActionHeld; this.actionHeld = held;
    this.tap = false; const nowMs = performance.now();
    if (this.actionPressed && this.mode === 'hand') { this.tapArmed = true; this.tapStartTime = nowMs; this.tapStartX = this.pointerNdc.x; this.tapStartY = this.pointerNdc.y; }
    if (this.actionReleased) { if (this.tapArmed) { const dur = nowMs - this.tapStartTime; const dx = this.pointerNdc.x - this.tapStartX; const dy = this.pointerNdc.y - this.tapStartY; const drift = Math.hypot(dx, dy); const cfg = PrismConfig.interaction; if (dur <= (cfg.tapMaxMs ?? 350) && drift <= (cfg.tapMaxMove ?? 0.04)) this.tap = true; } this.tapArmed = false; }
    if (this.mouseClicked) this.tap = true;
    this.prevActionHeld = held; this.mouseClicked = false;
  }

  private advanceHandPointer(_dt: number): void {
    const age = this.lastHandResultAt > 0 ? Math.min(Math.max((performance.now() - this.lastHandResultAt) / 1000, 0), 0.08) : 0;
    const predictedX = this.pointerTarget.x + this.pointerFilter.velocityX * age; const predictedY = this.pointerTarget.y + this.pointerFilter.velocityY * age;
    const dx = predictedX - this.pointerTarget.x; const dy = predictedY - this.pointerTarget.y; const extra = Math.hypot(dx, dy); const maxExtra = 0.07; const k = extra > maxExtra ? maxExtra / extra : 1;
    this.pointerNdc.set(THREE.MathUtils.clamp(this.pointerTarget.x + dx * k, -1, 1), THREE.MathUtils.clamp(this.pointerTarget.y + dy * k, -1, 1));
  }

  private updateFromHands(dt: number, dtMs: number, frame: HandFrame): void {
    if (frame.timestampMs === this.lastHandFrameTimestamp) { this.advanceHandPointer(dt); this.raycaster.setFromCamera(this.pointerNdc, this.prism.camera); if (this.grabbed) this.drag(dt); this.lastSeenAt = performance.now(); this.updateCursor(); return; }
    this.lastHandFrameTimestamp = frame.timestampMs;
    const hands = frame.hands;
    let trackDtMs = 0; if (this.lastTrackT > 0 && frame.timestampMs > this.lastTrackT) trackDtMs = Math.min(frame.timestampMs - this.lastTrackT, 500); this.lastTrackT = frame.timestampMs;
    const wrists = hands.map((h) => h.landmarks[0]);
    const wristDist = (a: {x:number;y:number}, b:{x:number;y:number}) => Math.hypot(a.x-b.x,a.y-b.y);
    let primaryHand = hands[0]; let secondaryHand: (typeof hands)[number] | null = null;
    if (hands.length > 1 && this.anchorA) {
      const d0A=wristDist(wrists[0],this.anchorA), d1A=wristDist(wrists[1],this.anchorA), d0B=this.anchorB?wristDist(wrists[0],this.anchorB):0, d1B=this.anchorB?wristDist(wrists[1],this.anchorB):0;
      const costX=d0A+d1B, costY=d1A+d0B; const takeX=this.primaryFirst?costX<=costY+0.04:costX+0.04<costY;
      primaryHand=takeX?hands[0]:hands[1]; secondaryHand=takeX?hands[1]:hands[0]; this.primaryFirst=takeX;
    } else { if(hands.length>1) secondaryHand=hands[1]; this.primaryFirst=true; }
    const jumped=this.anchorA!==null&&wristDist(primaryHand.landmarks[0],this.anchorA)>0.25;
    this.anchorA={x:primaryHand.landmarks[0].x,y:primaryHand.landmarks[0].y}; this.anchorB=secondaryHand?{x:secondaryHand.landmarks[0].x,y:secondaryHand.landmarks[0].y}:null;
    this.trackers[0].update(primaryHand.landmarks,trackDtMs); this.trackers[1].update(secondaryHand?secondaryHand.landmarks:null,trackDtMs);
    const prime=this.trackers[0]; this.gesture=prime.pose; this.isPinching=prime.pinch.isPinching; this.pinchValue=pinchRatio(primaryHand.landmarks); this.calibrator.observe(this.pinchValue,prime.pose==='POINT'||prime.pose==='OPEN_PALM');
    const tip=primaryHand.landmarks[INDEX_TIP]??primaryHand.landmarks[0]; if(!tip)return;
    const raw=this.toNdc(tip);
    if(jumped){this.tmpNdcSample.x=raw.x;this.tmpNdcSample.y=raw.y;this.pointerFilter.reset(this.tmpNdcSample);this.pointerTarget.set(raw.x,raw.y);this.pointerNdc.set(raw.x,raw.y);this.lastRaw.x=raw.x;this.lastRaw.y=raw.y;}
    else {const dead=this.pointerFilter.pointerSpeed<0.3?0.00025+Math.min(this.pointerFilter.noisePerSample*0.06,0.001):0;if(dead>0&&Math.hypot(raw.x-this.lastRaw.x,raw.y-this.lastRaw.y)<dead){raw.x=this.lastRaw.x;raw.y=this.lastRaw.y;}this.lastRaw.x=raw.x;this.lastRaw.y=raw.y;}
    this.tmpNdcSample.x=raw.x;this.tmpNdcSample.y=raw.y;this.pointerFilter.update(this.tmpNdcSample,trackDtMs,primaryHand.confidence,this.tmpSmoothed);this.pointerTarget.set(raw.x,raw.y);this.pickDirty=true;this.lastHandResultAt=frame.timestampMs;this.advanceHandPointer(dt);
    this.prism.trackPointer(this.pointerNdc.x,this.pointerNdc.y);this.raycaster.setFromCamera(this.pointerNdc,this.prism.camera);this.cachedPick=this.pick();this.pickDirty=false;

    const primeP=prime.pinch.isPinching, secP=this.trackers[1].pinch.isPinching, now=performance.now();
    const primePoint=pinchPoint2D(primaryHand.landmarks);
    if(secondaryHand){this.cachedSecHand=pinchPoint2D(secondaryHand.landmarks);this.cachedSecHandAt=now;}
    const secAlive=this.cachedSecHand&&(now-this.cachedSecHandAt<500); const secPoint=secondaryHand?this.cachedSecHand:(secAlive?this.cachedSecHand:null);
    const bothPinching=primeP&&secP&&secPoint!==null;
    if(bothPinching&&secPoint){
      if(!this.prevTwoHand){this.lastScaleRatio=1;this.lastAngleDelta=0;this.smoothZoomLog=0;this.smoothRotation=0;}
      this.prevTwoHand=true; const delta=this.twoHand.update(primePoint,secPoint); this.twoHandActive=true;
      if(delta)this.applyTwoHandDelta(delta.scaleRatio,delta.angleDelta);
      if(this.grabbed)this.release(); this.applyHover(null,dtMs); this.updateCursor(); return;
    }
    if(this.prevTwoHand)this.twoHand.reset(); this.prevTwoHand=false; this.twoHand.reset(); this.twoHandActive=false;
    this.raycaster.setFromCamera(this.pointerNdc,this.prism.camera); this.prism.trackPointer(this.pointerNdc.x,this.pointerNdc.y);
    const hovered=this.pick();
    if(prime.pinch.isPinching){if(!this.grabbed&&hovered)this.grab(hovered);if(this.grabbed)this.drag(dt);}else if(this.grabbed)this.release();
    this.applyHover(hovered,dtMs);this.grabbedName=this.grabbed?.name??null;this.lastSeenAt=performance.now();this.updateCursor();
  }

  private updateFromMouse(dt:number):void{
    const ndc=this.mouseNdc;if(!ndc)return;
    if(this.mouseDown&&this.orbitArmed){this.raycaster.setFromCamera(this.pointerNdc,this.prism.camera);this.gesture='NONE';this.isPinching=false;this.prevTwoHand=false;if(this.grabbed)this.release();this.applyHover(null,dt*1000);this.lastSeenAt=performance.now();this.updateCursor();this.prevMouseDown=this.mouseDown;return;}
    this.tmpNdcSample.x=ndc.x;this.tmpNdcSample.y=ndc.y;this.pointerFilter.update(this.tmpNdcSample,dt*1000,1,this.tmpSmoothed);this.pointerTarget.set(this.tmpSmoothed.x,this.tmpSmoothed.y);this.pointerNdc.set(this.tmpSmoothed.x,this.tmpSmoothed.y);this.raycaster.setFromCamera(this.pointerNdc,this.prism.camera);this.prism.trackPointer(this.pointerNdc.x,this.pointerNdc.y);
    const hovered=this.pick();const pinching=this.mouseDown;this.gesture=pinching?'PINCH':hovered?'POINT':'NONE';this.isPinching=pinching;this.pinchValue=null;
    if(pinching&&!this.prevMouseDown){if(!this.grabbed&&hovered&&!this.orbitArmed)this.grab(hovered);}if(pinching&&this.grabbed)this.drag(dt);if(!pinching&&this.grabbed)this.release();this.prevMouseDown=this.mouseDown;this.applyHover(hovered,dt*1000);this.grabbedName=this.grabbed?.name??null;this.lastSeenAt=performance.now();this.updateCursor();
  }

  private pick():THREE.Mesh|null{
    if(!this.pickDirty&&this.cachedPick!==null)return this.cachedPick;
    if(this.pickFrame===this.frameCount)return this.cachedPick;
    this.pickFrame=this.frameCount;this.rayHits.length=0;const hits=this.raycaster.intersectObjects(this.prism.grabbables,false,this.rayHits);const direct=(hits[0]?.object as THREE.Mesh|undefined)??null;
    if(direct){this.cachedPick=direct;return direct;}
    let best:THREE.Mesh|null=null;let bestD=PrismConfig.interaction.hoverRadius;
    for(const obj of this.prism.grabbables){const mesh=obj as THREE.Mesh;mesh.getWorldPosition(this.tmpProj).project(this.prism.camera);if(this.tmpProj.z>1)continue;const d=Math.hypot(this.tmpProj.x-this.pointerNdc.x,this.tmpProj.y-this.pointerNdc.y);if(d<bestD){bestD=d;best=mesh;}}
    this.cachedPick=best;return best;
  }

  private applyHover(candidate:THREE.Mesh|null,dtMs:number):void{const target=this.grabbed??candidate;if(target){this.hoverMissMs=0;this.displayedHover=target;this.prism.setHover(target);}else{this.hoverMissMs+=dtMs;if(this.hoverMissMs>=PrismConfig.interaction.hoverClearMs){this.displayedHover=null;this.prism.setHover(null);}}this.hoveredName=this.displayedHover?.name??null;}

  private grab(mesh:THREE.Mesh):void{if(mesh.userData.grabbable===false)return;this.grabbed=mesh;this.orbitDragPrimed=false;const hit=this.raycaster.intersectObject(mesh,false)[0];const anchor=hit?hit.point:mesh.position;this.tmpA.copy(this.prism.camera.position).sub(anchor).normalize();this.grabPlane.setFromNormalAndCoplanarPoint(this.tmpA,anchor);this.grabOffset.copy(mesh.position).sub(anchor);this.grabSmoother.reset(mesh.position);this.prism.markGrabbed(mesh);}
  private drag(dt:number):void{if(!this.grabbed)return;if(this.grabbed.userData.orbitBody){this.tmpMat.copy(this.prism.world.matrixWorld).invert();this.tmpRay.copy(this.raycaster.ray).applyMatrix4(this.tmpMat);if(this.tmpRay.intersectPlane(this.eclipticPlane,this.tmpLocal)){if(!this.orbitDragPrimed){this.grabSmoother.reset(this.tmpLocal);this.orbitDragPrimed=true;}this.grabSmoother.update(this.tmpLocal,dt,this.tmpTarget);this.prism.setOrbitFromPoint(this.grabbed,this.tmpTarget);}return;}if(this.raycaster.ray.intersectPlane(this.grabPlane,this.tmpB)){this.tmpTarget.copy(this.tmpB).add(this.grabOffset);this.tmpTarget.x=THREE.MathUtils.clamp(this.tmpTarget.x,-4,4);this.tmpTarget.y=THREE.MathUtils.clamp(this.tmpTarget.y,-2.5,2.5);this.tmpTarget.z=THREE.MathUtils.clamp(this.tmpTarget.z,-2.5,2.5);this.grabSmoother.update(this.tmpTarget,dt,this.grabbed.position);}}
  private release():void{const mesh=this.grabbed;if(mesh?.userData.gridSnap){const g=PrismConfig.interaction.gridSnap;mesh.position.set(Math.round(mesh.position.x/g)*g,Math.max(g/2,Math.round(mesh.position.y/g)*g),Math.round(mesh.position.z/g)*g);}this.grabbed=null;this.prism.markGrabbed(null);this.grabbedName=null;}

  private applyTwoHandDelta(scaleRatio:number,angleDelta:number):void{
    const cfg=PrismConfig.interaction;
    // Work in logarithmic zoom space. This makes a 2cm hand tremor near the
    // camera behave similarly to a 2cm movement farther away, while clamping
    // per-sample change prevents a noisy frame from causing a jump.
    const last=Math.max(1e-6,this.lastScaleRatio);
    const rawLog=THREE.MathUtils.clamp(Math.log(Math.max(0.65,Math.min(1.35,scaleRatio/last))),-0.10,0.10);
    const zoomAlpha=0.42;
    this.smoothZoomLog=THREE.MathUtils.lerp(this.smoothZoomLog,rawLog,zoomAlpha);
    const zoomResponse=cfg.zoomSpeed*0.42;
    this.prism.rig.dolly(Math.exp(-this.smoothZoomLog*zoomResponse));

    // Angle is unwrapped by TwoHandGesture. Filter the incremental rotation
    // and amplify slightly so a deliberate twist visibly rotates the scene.
    const rawRot=THREE.MathUtils.clamp(angleDelta-this.lastAngleDelta,-0.12,0.12);
    const rotationAlpha=0.48;
    this.smoothRotation=THREE.MathUtils.lerp(this.smoothRotation,rawRot,rotationAlpha);
    this.prism.world.rotation.y += this.smoothRotation*(cfg.rotateSpeed*1.55);

    this.lastScaleRatio=scaleRatio;
    this.lastAngleDelta=angleDelta;
  }

  private updateCursor():void{
    const closeness=this.mode==='hand'?this.pinchCloseness:this.mouseDown?1:0;
    if(!this.grabbed&&!this.hoveredName&&this.prism.pointerFocus(this.tmpB)){this.cursorWorldVec.copy(this.tmpB);this.cursorWorld=this.cursorWorldVec;this.prism.setCursor(this.tmpB,'hover',1.25,closeness);return;}
    const focus=this.grabbed??(this.hoveredName?this.pick():null);const depth=focus?this.tmpA.copy(focus.position).sub(this.prism.camera.position).length():this.prism.camera.position.length();this.tmpB.copy(this.raycaster.ray.direction).multiplyScalar(depth).add(this.raycaster.ray.origin);this.cursorWorldVec.copy(this.tmpB);this.cursorWorld=this.cursorWorldVec;
    let mode:CursorMode='point';let boost=1;if(this.grabbed){mode='grab';boost=1.35;}else if(this.hoveredName){mode='hover';boost=1.2;}else if(this.isPinching){mode='pinch';boost=1.1;}this.prism.setCursor(this.tmpB,mode,boost,closeness);
  }
}
