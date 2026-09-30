// PRISM application bootstrap, rewritten for the Next.js mount.
//
// Wires Camera -> MediaPipe -> Gestures -> Interaction -> Three.js scene,
// then runs the decoupled render/tracking loop. Owns its DOM subtree and
// exposes a tiny reactive API (subscribe) so the React shell can mirror
// live state without re-rendering on every animation frame.

import { describeMediaError, startCamera, type CameraHandle } from './camera';
import { PrismConfig, type QualityTier } from './config';
import { DebugOverlay } from './debug';
import { detectDevice, type DeviceInfo } from './device';
import { InteractionController } from './interaction';
import { PRESET_LABELS, PRESET_ORDER, type PresetId } from './presets/types';
import { AiObserver, captureVideoFrame } from './ai/observer';
import { baseCoachHint } from './coach';
import { PerfGovernor } from './perf';
import { PrismScene } from './scene';
import { drawLandmarkOverlay, HandTracker } from './tracking';

export interface PrismElements {
  container: HTMLElement;
  video: HTMLVideoElement;
  overlay: HTMLCanvasElement;
  status: HTMLElement;
  cameraBtn: HTMLButtonElement;
  qualitySel: HTMLSelectElement;
  presetSel: HTMLSelectElement;
  debugBtn: HTMLButtonElement;
  helpBtn: HTMLButtonElement;
  helpCard: HTMLElement;
  helpClose: HTMLButtonElement;
  debugEl: HTMLElement;
  planetInfo: HTMLElement;
  easyBtn: HTMLButtonElement;
  aiBtn: HTMLButtonElement;
  palette: HTMLElement;
  coach: HTMLElement;
  rail: Record<'cam' | 'hands' | 'gesture' | 'fps', HTMLElement | null>;
  onboard: HTMLElement;
  onboardClose: HTMLButtonElement;
  onboardHelp: HTMLButtonElement;
}

export interface PrismState {
  status: string;
  cameraOn: boolean;
  cameraStarting: boolean;
  preset: PresetId;
  quality: string;
  easyMode: boolean;
  debugVisible: boolean;
  aiEnabled: boolean;
  inputMode: 'hand' | 'mouse' | 'none';
  focusedName: string | null;
  grabbedName: string | null;
  pinchPercent: number;
  twoHandActive: boolean;
  presentationMode: boolean;
  rail: { cam: string; hands: string; gesture: string; fps: string };
  fpsHistory: number[];
  coach: string | null;
  planetInfo: string | null;
  palette: Array<{ name: string; color: string; active: boolean }> | null;
  onboardVisible: boolean;
  onboardSteps: { camera: boolean; hand: boolean; grab: boolean };
  onboardComplete: boolean;
}

export type PrismStateListener = (state: PrismState) => void;

function queryParam(name: string): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
}

function applySteerCurve(nx: number): number {
  const a = Math.abs(nx);
  if (a < 0.1) return 0;
  return Math.sign(nx) * Math.min(1, (a - 0.1) / 0.7);
}

export class PrismApp {
  private readonly el: PrismElements;
  private readonly scene: PrismScene;
  private readonly interaction: InteractionController;
  private readonly tracker = new HandTracker();
  private readonly governor: PerfGovernor;
  private readonly observer: AiObserver;
  private readonly debug: DebugOverlay;
  private readonly device: DeviceInfo;
  private readonly overlayCtx: CanvasRenderingContext2D | null;

  private cameraHandle: CameraHandle | null = null;
  private cameraStarting = false;
  private rafHandle = 0;
  private disposed = false;
  private last = 0;
  private elapsed = 0;
  private renderFps = 60;
  private fpsHistory: number[] = [];
  private lastUiAt = 0;
  private lastCoachText = '\0';
  private cachedCandidates: string[] = [];
  private cachedCandidatePreset = '';
  private _lastInfoName: string | null = null;
  private _overlayDirty = false;
  private lastOverlayFrameTimestamp = -1;
  private readonly ONBOARD_KEY = 'prism:onboarded:v1';
  private onboardVisible = false;
  private seenHand = false;
  private didGrab = false;
  private onboardCompleteAt = 0;
  private listeners = new Set<PrismStateListener>();
  private lastStateStr = '';
  private presentationMode = false;

  constructor(elements: PrismElements) {
    this.el = elements;
    const { container, video, overlay, statusEl: _s, presetSel, qualitySel, debugEl } = elements;
    void _s;
    this.overlayCtx = overlay.getContext('2d');
    overlay.width = 400;
    overlay.height = 225;
    const initialQuality = queryParam('quality');
    if (initialQuality === 'ultra' || initialQuality === 'high' || initialQuality === 'low' || initialQuality === 'medium') qualitySel.value = initialQuality;
    else qualitySel.value = 'auto';
    this.device = detectDevice();
    const resolveQuality = (): QualityTier => qualitySel.value === 'auto' ? this.device.tier : (qualitySel.value as QualityTier);
    const requestedPreset = queryParam('preset') as PresetId | null;
    const initialPreset = requestedPreset && PRESET_ORDER.includes(requestedPreset) ? requestedPreset : PrismConfig.preset;
    presetSel.value = initialPreset;
    this.debug = new DebugOverlay(debugEl, queryParam('debug') === '1');
    elements.debugBtn.classList.toggle('active', this.debug.isVisible);
    this.scene = new PrismScene(container, resolveQuality(), initialPreset);
    this.interaction = new InteractionController(this.scene);
    this.scene.rig.shakeScale = this.device.prefersReducedMotion ? 0.15 : 1;
    this.governor = new PerfGovernor(resolveQuality(), (tier) => {
      this.scene.applyQuality(tier);
      if (qualitySel.value === 'auto') this.setStatus(`Auto quality → ${tier} (protecting frame rate)`);
    });
    this.observer = new AiObserver({
      createWorker: () => new Worker(new URL('./ai/ai-worker.ts', import.meta.url), { type: 'module' }),
      modelId: PrismConfig.ai.modelId,
      intervalMs: PrismConfig.ai.intervalMs,
      maxTokens: PrismConfig.ai.maxTokens,
      getFrame: () => captureVideoFrame(video, PrismConfig.ai.frameWidth),
    });
    this.bindUI();
    this.syncPresetUI();
    if (queryParam('ai') === '1') { this.observer.setEnabled(true); this.syncAiButton(); }
    void this.preloadModel();
    this.emit();
  }

  private async preloadModel(): Promise<void> {
    try { await this.tracker.init((m) => this.setStatus(m)); } catch { /* retry on camera enable */ }
  }

  subscribe(fn: PrismStateListener): () => void { this.listeners.add(fn); fn(this.snapshot()); return () => this.listeners.delete(fn); }
  setPreset(id: PresetId): void { const prev = this.scene.currentPreset; this.loadPreset(id); if (prev !== id) this.toast(`Switched to ${PRESET_LABELS[id]}`, 'success'); }
  setQuality(value: string): void { this.el.qualitySel.value = value; const q = this.el.qualitySel.value === 'auto' ? this.device.tier : (this.el.qualitySel.value as QualityTier); this.scene.applyQuality(q); this.governor.rebase(q); this.toast(`Quality set to ${value}`, 'info'); this.emit(); }
  toggleDebug(): boolean { const v = this.debug.toggle(); this.el.debugBtn.classList.toggle('active', v); this.toast(v ? 'Debug overlay on' : 'Debug overlay off', 'info'); this.emit(); return v; }
  toggleAi(): void { this.observer.setEnabled(!this.observer.isEnabled); this.syncAiButton(); this.toast(this.observer.isEnabled ? 'AI observer enabled' : 'AI observer disabled', 'info'); this.emit(); }
  togglePresentation(): boolean { this.presentationMode = !this.presentationMode; this.toast(this.presentationMode ? 'Presentation mode' : 'Instrument controls restored', 'info'); this.emit(); return this.presentationMode; }
  toggleEasy(): void { const w = this.scene.currentWorld; if (this.scene.currentPreset !== 'drive' || !w?.setEasyMode || !w?.isEasyMode) return; w.setEasyMode(!w.isEasyMode()); this.syncEasyLabel(); this.emit(); }
  enableCamera(): void { void this.bootVision(); }
  toggleHelp(): void { this.el.helpCard.classList.toggle('hidden'); }
  dismissOnboard(): void { this.el.onboard.classList.add('hidden'); this.onboardVisible=false; try { window.localStorage.setItem(this.ONBOARD_KEY,'1'); } catch {} this.emit(); }
  start(): void { if (this.rafHandle) return; this.last=performance.now(); this.rafHandle=requestAnimationFrame(this.tick); }
  dispose(): void { this.disposed=true; if(this.rafHandle) cancelAnimationFrame(this.rafHandle); this.rafHandle=0; this.tracker.stop(); this.cameraHandle?.stop(); this.observer.setEnabled(false); this.scene.dispose(); this.listeners.clear(); }

  private setStatus(msg:string,full?:string):void{const textEl=this.el.status.querySelector('.prism-status-text')??this.el.status;textEl.textContent=msg;this.el.status.title=full??msg;this.emit();}
  private toast(message:string,kind:'success'|'info'|'warn'='info'):void{if(typeof window!=='undefined'&&typeof window.__prismToast==='function')window.__prismToast({message,kind});}
  private syncAiButton():void{this.el.aiBtn.classList.toggle('active',this.observer.isEnabled);}

  private bindUI():void{
    const {qualitySel,presetSel,debugBtn,helpBtn,helpClose,easyBtn,aiBtn,cameraBtn,onboardClose,onboardHelp}=this.el;
    presetSel.addEventListener('change',()=>this.loadPreset(presetSel.value as PresetId));
    window.addEventListener('prism-preset',(e)=>this.loadPreset((e as CustomEvent<PresetId>).detail,true));
    window.addEventListener('prism-reset-world',()=>this.loadPreset(this.scene.currentPreset,false,true));
    window.addEventListener('prism-easy',()=>this.toggleEasy());
    window.addEventListener('prism-presentation',()=>this.togglePresentation());
    window.addEventListener('prism-cycle',(e)=>{const w=this.scene.currentWorld;if(!w?.cycleBlock)return;w.cycleBlock((e as CustomEvent<number>).detail>=0?1:-1);this.refreshPalette();});
    easyBtn.addEventListener('click',()=>this.toggleEasy());
    aiBtn.addEventListener('click',()=>this.toggleAi());
    cameraBtn.addEventListener('click',()=>void this.bootVision());
    qualitySel.addEventListener('change',()=>this.setQuality(qualitySel.value));
    debugBtn.addEventListener('click',()=>this.toggleDebug());
    helpBtn.addEventListener('click',()=>this.toggleHelp());
    helpClose.addEventListener('click',()=>this.el.helpCard.classList.add('hidden'));
    onboardClose.addEventListener('click',()=>this.dismissOnboard());
    onboardHelp.addEventListener('click',()=>{this.dismissOnboard();this.el.helpCard.classList.remove('hidden');});
    window.addEventListener('keydown',(e)=>{if(e.key==='d'||e.key==='D')this.toggleDebug();if(e.key==='h'||e.key==='H')this.toggleHelp();if(e.key==='p'||e.key==='P')this.togglePresentation();});
    window.addEventListener('resize',()=>{const c=this.el.container;this.scene.resize(c.clientWidth,c.clientHeight);});
    window.addEventListener('error',(e)=>{this.setStatus('Runtime fault — mouse still works',`Runtime fault: ${e.message} — mouse fallback still works; report this text.`);});
    try{this.onboardVisible=window.localStorage.getItem(this.ONBOARD_KEY)!=='1';}catch{this.onboardVisible=true;}
    if(this.onboardVisible)this.el.onboard.classList.remove('hidden');else this.el.onboard.classList.add('hidden');
  }

  private syncEasyLabel():void{const w=this.scene.currentWorld;this.el.easyBtn.textContent=`Easy: ${w?.isEasyMode?.()?'ON':'OFF'}`;}
  private refreshPalette():void{const w=this.scene.currentWorld;const list=w?.blockPalette?.();const palette=this.el.palette;palette.innerHTML='';if(!list){palette.classList.add('hidden');return;}palette.classList.remove('hidden');const sel=w?.selectedBlock?.().index??0;list.forEach((b,i)=>{const btn=document.createElement('button');btn.type='button';btn.title=b.name;btn.textContent=b.name;btn.style.borderColor=b.color;if(i===sel)btn.classList.add('active');btn.addEventListener('click',()=>{w?.selectBlock?.(i);this.refreshPalette();});palette.appendChild(btn);});}
  private syncPresetUI():void{const id=this.scene.currentPreset;const {presetSel,easyBtn}=this.el;if(presetSel.options.length!==PRESET_ORDER.length){presetSel.innerHTML='';for(const pid of PRESET_ORDER){const opt=document.createElement('option');opt.value=pid;opt.textContent=PRESET_LABELS[pid];presetSel.appendChild(opt);}}presetSel.value=id;easyBtn.classList.toggle('hidden',id!=='drive');if(id==='drive'&&queryParam('easy')==='1')this.scene.currentWorld?.setEasyMode?.(true);this.syncEasyLabel();this.refreshPalette();}
  private loadPreset(id:PresetId,viaKeyboard=false,force=false):void{if(!PRESET_ORDER.includes(id))return;if(!force&&id===this.scene.currentPreset)return;this.interaction.onPresetChange();this.scene.loadPreset(id);this.syncPresetUI();this.setStatus(`Preset: ${PRESET_LABELS[id]}. Point to explore.`);if(viaKeyboard)this.toast(`Switched to ${PRESET_LABELS[id]}`,'success');if(force)this.toast('World rebuilt','info');}

  private async bootVision():Promise<void>{try{if(await this.enableCamera())await this.ensureTracking();}catch(err){console.error('[PRISM] vision stack failed:',err);const full=`Hand tracking unavailable (${describeMediaError(err)}). Mouse fallback active.`;this.setStatus('Hand tracking unavailable — mouse active',full);}}
  private async enableCamera():Promise<boolean>{if(this.cameraHandle)return true;if(this.cameraStarting)return false;this.cameraStarting=true;const {cameraBtn,video}=this.el;cameraBtn.classList.add('active');cameraBtn.disabled=true;try{this.setStatus('Requesting camera…');this.cameraHandle=await startCamera(video);video.classList.add('live');this.toast('Camera enabled — hand tracking active','success');this.setStatus('Camera ready — starting hand tracking…');return true;}catch(err){const full=err instanceof Error?err.message:String(err);this.setStatus('Mouse mode',full);this.toast(`Camera unavailable: ${full.substring(0,120)}`,'warn');cameraBtn.classList.remove('active');video.classList.remove('live');return false;}finally{this.cameraStarting=false;cameraBtn.disabled=false;this.emit();}}
  private async ensureTracking():Promise<void>{if(!this.cameraHandle)return;if(this.tracker.isTracking)return;if(!this.tracker.isReady){this.setStatus('Loading hand-tracking model…');try{await this.tracker.init((m)=>this.setStatus(m));}catch(err){const full=err instanceof Error?err.message:String(err);this.setStatus('Tracking unavailable — mouse active',full);this.toast(`Tracking init failed: ${full.substring(0,100)}`,'warn');return;}}if(!this.tracker.isReady)return;this.tracker.start(this.el.video);const handle=this.cameraHandle;this.setStatus(`Tracking ${handle.width}×${handle.height} · point to move, pinch to grab.`);}

  private readonly tick=(now:number):void=>{
    if(this.disposed)return;
    this.rafHandle=requestAnimationFrame(this.tick);
    if(typeof document!=='undefined'&&document.hidden)return;
    try{
      const showDebug=this.debug.isVisible;
      const dt=Math.min(.1,Math.max(1e-4,(now-this.last)/1000));this.last=now;this.elapsed+=dt;this.renderFps+=(1/dt-this.renderFps)*.05;
      const frame=this.tracker.getFrame();this.interaction.update(dt,frame);const world=this.scene.currentWorld;
      if(this.el.qualitySel.value==='auto')this.governor.update(dt);
      if(world&&this.cachedCandidatePreset!==this.scene.currentPreset){this.cachedCandidatePreset=this.scene.currentPreset;this.cachedCandidates=this.scene.grabbables.map(o=>o.name).filter((n):n is string=>n.length>0);}
      if(this.observer.isEnabled)this.observer.tick(now,this.cachedCandidates,this.interaction.gesture);
      if(world?.setDriveInput){world.setDriveInput({steer:this.interaction.mode==='none'?0:applySteerCurve(this.interaction.pointerNX),throttle:this.interaction.actionHeld?(this.interaction.mode==='hand'?this.interaction.pinchCloseness:1):0,brake:this.interaction.spaceDown,actionPressed:this.interaction.actionPressed,tap:this.interaction.tap,ground:this.interaction.groundXZ()});}
      world?.setPointerAction?.(this.interaction.actionPressed,this.interaction.actionHeld,this.interaction.actionReleased,this.interaction.tap);
      this.scene.update(dt,this.elapsed);
      if(now-this.lastUiAt>=250){this.lastUiAt=now;this.updateRailAndCoach(now);this.updateOnboard(now,frame?.hands.length??0,this.interaction.grabbedName);}
      if(this.overlayCtx&&frame&&frame.hands.length>0){
        // Tracking runs slower than rendering. Redraw the 2D landmarks only
        // when a fresh tracking frame arrives instead of repainting the
        // overlay at the render rate.
        if(frame.timestampMs!==this.lastOverlayFrameTimestamp){
          drawLandmarkOverlay(this.overlayCtx,frame);
          this.lastOverlayFrameTimestamp=frame.timestampMs;
          this._overlayDirty=true;
        }
      }else if(this.overlayCtx&&this._overlayDirty){
        this.overlayCtx.clearRect(0,0,this.overlayCtx.canvas.width,this.overlayCtx.canvas.height);
        this.lastOverlayFrameTimestamp=-1;
        this._overlayDirty=false;
      }
      const infoName=this.interaction.grabbedName??this.interaction.hoveredName;if(infoName!==this._lastInfoName){this._lastInfoName=infoName;const info=this.scene.bodyInfo(infoName);if(info){this.el.planetInfo.textContent=info;this.el.planetInfo.classList.remove('hidden');}else this.el.planetInfo.classList.add('hidden');}
      this.debug.update(now,{renderFps:this.renderFps,hands:frame?.hands.length??0,confidence:frame?.hands[0]?.confidence??0,deviceLine:showDebug?this.deviceLine():''},this.interaction,this.tracker,this.scene.drawCalls,this.scene.triangles,this.scene.grabbables.length,showDebug?this.observer.snapshot():null);
      this.scene.render();
    }catch(err){const full=`Frame fault (${err instanceof Error?err.message:String(err)}) — continuing; report this text.`;this.setStatus('Frame fault — continuing',full);console.error('[PRISM] frame fault:',err);}
  };

  private deviceLine():string{const d=this.device;return `device ${d.isMobile?'mobile':'desktop'}${d.isWeakGpu?' · weak-gpu':''}${d.hasTouch&&!d.isMobile?' · touch':''} · tier ${this.el.qualitySel.value==='auto'?`auto→${this.governor.tier}`:this.governor.tier}`;}
  private setRail(key:'cam'|'hands'|'gesture'|'fps',state:string,text:string):void{const item=this.el.rail[key];if(!item)return;const dot=item.querySelector('.dot');const txt=item.querySelector('.txt');if(dot&&dot.getAttribute('data-state')!==state)dot.setAttribute('data-state',state);if(txt&&txt.textContent!==text)txt.textContent=text;}
  private updateRailAndCoach(now:number):void{const frame=this.tracker.getFrame();const frameAge=frame?now-frame.timestampMs:Number.POSITIVE_INFINITY;if(!this.cameraHandle)this.setRail('cam','off','Camera off');else if(frameAge>1500)this.setRail('cam','warn','Camera stalled');else this.setRail('cam','on','Camera live');const nHands=frame?.hands.length??0;this.setRail('hands',nHands>0?'on':'off',nHands===1?'1 hand':`${nHands} hands`);this.setRail('gesture',this.interaction.mode==='none'?'off':'on',this.interaction.mode==='none'?'—':this.interaction.gesture);this.setRail('fps',this.renderFps>=30?'on':'warn',`${this.renderFps.toFixed(0)} fps`);this.fpsHistory.push(this.renderFps);if(this.fpsHistory.length>40)this.fpsHistory.shift();const hint=this.scene.currentWorld?.coachHint?.()??baseCoachHint({mode:this.interaction.mode,gesture:this.interaction.gesture,pinching:this.interaction.isPinching,hovered:this.interaction.hoveredName,grabbed:this.interaction.grabbedName,twoHand:this.interaction.twoHandActive,cameraOn:!!this.cameraHandle,preset:this.scene.currentPreset,touch:this.device.hasTouch});const text=hint??'';if(text!==this.lastCoachText){this.lastCoachText=text;if(hint){this.el.coach.textContent=hint;this.el.coach.classList.remove('hidden');}else this.el.coach.classList.add('hidden');}this.emit();}
  private setStepDone(name:string,done:boolean):void{const el=this.el.onboard.querySelector(`[data-step="${name}"]`);if(el&&el.classList.contains('done')!==done)el.classList.toggle('done',done);}
  private updateOnboard(_now:number,hands:number,grabbed:string|null):void{if(!this.onboardVisible)return;if(this.cameraHandle)this.setStepDone('camera',true);if(hands>0){this.seenHand=true;this.setStepDone('hand',true);}if(grabbed){this.didGrab=true;this.setStepDone('grab',true);}if(this.seenHand&&this.didGrab&&!this.onboardCompleteAt)this.onboardCompleteAt=performance.now();if(this.onboardCompleteAt&&performance.now()-this.onboardCompleteAt>900)this.dismissOnboard();}
  private emit():void{const s=this.snapshot();const str=JSON.stringify(s);if(str===this.lastStateStr)return;this.lastStateStr=str;for(const fn of this.listeners)fn(s);}
  private snapshot():PrismState{return{
status:this.el.status.textContent??'',
cameraOn:!!this.cameraHandle,
cameraStarting:this.cameraStarting,
preset:this.scene.currentPreset,
quality:this.governor.tier,
easyMode:!!this.scene.currentWorld?.isEasyMode?.(),
debugVisible:this.debug.isVisible,
aiEnabled:this.observer.isEnabled,
inputMode:this.interaction.mode,
focusedName:this.interaction.grabbedName??this.interaction.hoveredName,
grabbedName:this.interaction.grabbedName,
pinchPercent:Math.round(this.interaction.pinchCloseness*100),
 twoHandActive:this.interaction.twoHandActive,
presentationMode:this.presentationMode,
rail:{cam:this.el.rail.cam?.textContent??'',hands:this.el.rail.hands?.textContent??'',gesture:this.el.rail.gesture?.textContent??'',fps:this.el.rail.fps?.textContent??''},
fpsHistory:[...this.fpsHistory],
coach:this.el.coach.textContent||null,
planetInfo:this.el.planetInfo.textContent||null,
palette:this.scene.currentWorld?.blockPalette?.()?.map((b,i)=>({name:b.name,color:b.color,active:i===(this.scene.currentWorld?.selectedBlock?.().index??-1)}))??null,
onboardVisible:this.onboardVisible,
onboardSteps:{camera:this.cameraHandle!==null,hand:this.seenHand,grab:this.didGrab},
onboardComplete:!!this.onboardCompleteAt
};}
}
