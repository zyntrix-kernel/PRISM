// PRISM bootstrap: wires Camera -> MediaPipe -> Gestures -> Interaction ->
// Three.js scene, then runs the decoupled render/tracking loop.

import { describeMediaError, startCamera, type CameraHandle } from './camera';
import { PrismConfig, type QualityTier } from './config';
import { DebugOverlay } from './debug';
import { detectDevice } from './device';
import { InteractionController } from './interaction';
import { PRESET_LABELS, PRESET_ORDER, type PresetId } from './presets/types';
import { AiObserver, captureVideoFrame } from './ai/observer';
import { baseCoachHint } from './coach';
import { PerfGovernor } from './perf';
import { PrismScene } from './scene';
import { drawLandmarkOverlay, HandTracker } from './tracking';

function queryParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

async function main(): Promise<void> {
  const container = document.getElementById('scene-container') as HTMLElement;
  const video = document.getElementById('webcam') as HTMLVideoElement;
  const overlay = document.getElementById('landmark-overlay') as HTMLCanvasElement;
  const statusEl = document.getElementById('hud-status') as HTMLElement;
  const cameraBtn = document.getElementById('btn-camera') as HTMLButtonElement;
  const qualitySel = document.getElementById('sel-quality') as HTMLSelectElement;
  const presetSel = document.getElementById('sel-preset') as HTMLSelectElement;
  const debugBtn = document.getElementById('btn-debug') as HTMLButtonElement;
  const helpBtn = document.getElementById('btn-help') as HTMLButtonElement;
  const helpCard = document.getElementById('help') as HTMLElement;
  const helpClose = document.getElementById('btn-help-close') as HTMLButtonElement;
  const debugEl = document.getElementById('debug') as HTMLElement;
  const planetInfoEl = document.getElementById('planet-info') as HTMLElement;
  const easyBtn = document.getElementById('btn-easy') as HTMLButtonElement;
  const aiBtn = document.getElementById('btn-ai') as HTMLButtonElement;
  const paletteEl = document.getElementById('voxel-palette') as HTMLElement;
  const coachEl = document.getElementById('coach') as HTMLElement;
  const railEls = {
    cam: document.querySelector('#rail-cam'),
    hands: document.querySelector('#rail-hands'),
    gesture: document.querySelector('#rail-gesture'),
    fps: document.querySelector('#rail-fps'),
  } as Record<'cam' | 'hands' | 'gesture' | 'fps', HTMLElement | null>;

  /** Steering response curve: center deadzone, full lock before the edge. */
  const applySteerCurve = (nx: number): number => {
    const a = Math.abs(nx);
    if (a < 0.1) return 0;
    return Math.sign(nx) * Math.min(1, (a - 0.1) / 0.7);
  };

  const setStatus = (msg: string): void => {
    statusEl.textContent = msg;
  };

  const initialQuality = queryParam('quality');
  if (initialQuality === 'ultra' || initialQuality === 'high' || initialQuality === 'low' || initialQuality === 'medium') {
    qualitySel.value = initialQuality;
  } else {
    qualitySel.value = 'auto';
  }
  // Auto tier: unknown exhibition hardware gets a conservative default from
  // device signals; an explicit ?quality= or dropdown choice always wins.
  const device = detectDevice();
  const resolveQuality = (): QualityTier =>
    qualitySel.value === 'auto' ? device.tier : (qualitySel.value as QualityTier);
  const deviceLine = (): string =>
    `device ${device.isMobile ? 'mobile' : 'desktop'}${device.isWeakGpu ? ' · weak-gpu' : ''}${
      device.hasTouch && !device.isMobile ? ' · touch' : ''
    } · tier ${qualitySel.value === 'auto' ? `auto→${governor.tier}` : governor.tier}`;
  const requestedPreset = queryParam('preset') as PresetId | null;
  const initialPreset =
    requestedPreset && PRESET_ORDER.includes(requestedPreset) ? requestedPreset : PrismConfig.preset;
  presetSel.value = initialPreset;
  const debug = new DebugOverlay(debugEl, queryParam('debug') !== '0');
  debugBtn.classList.toggle('active', debug.isVisible);

  const scene = new PrismScene(container, resolveQuality(), initialPreset);
  const interaction = new InteractionController(scene);
  // Reduced-motion users get a whisper of impact shake instead of the quake.
  scene.rig.shakeScale = device.prefersReducedMotion ? 0.15 : 1;
  // FPS governor: steps quality down only while 'auto' is selected.
  const governor = new PerfGovernor(resolveQuality(), (tier) => {
    scene.applyQuality(tier);
    if (qualitySel.value === 'auto') setStatus(`Auto quality → ${tier} (protecting frame rate)`);
  });

  // AI observer: FastVLM watches the camera in a worker, debug readout only.
  // Lazily created worker — nothing downloads until the user opts in.
  const observer = new AiObserver({
    createWorker: () => new Worker(new URL('./ai/ai-worker.ts', import.meta.url), { type: 'module' }),
    modelId: PrismConfig.ai.modelId,
    intervalMs: PrismConfig.ai.intervalMs,
    maxTokens: PrismConfig.ai.maxTokens,
    getFrame: () => captureVideoFrame(video, PrismConfig.ai.frameWidth),
  });
  const syncAiButton = (): void => {
    aiBtn.classList.toggle('active', observer.isEnabled);
  };
  aiBtn.addEventListener('click', () => {
    observer.setEnabled(!observer.isEnabled);
    syncAiButton();
  });

  const loadPreset = (id: PresetId): void => {
    if (!PRESET_ORDER.includes(id)) return;
    interaction.onPresetChange();
    scene.loadPreset(id);
    syncPresetUI();
    setStatus(`Preset: ${presetSel.selectedOptions[0]?.textContent ?? id}. Point to explore.`);
  };
  presetSel.addEventListener('change', () => loadPreset(presetSel.value as PresetId));
  window.addEventListener('prism-preset', (e) => loadPreset((e as CustomEvent<PresetId>).detail));
  // X key: rebuild the current world fresh (the only scene reset).
  window.addEventListener('prism-reset-world', () => loadPreset(scene.currentPreset));

  const syncEasyLabel = (): void => {
    const w = scene.currentWorld;
    easyBtn.textContent = `Easy: ${w?.isEasyMode?.() ? 'ON' : 'OFF'}`;
  };
  /** Voxel block palette (only the voxel world provides one). */
  const refreshPalette = (): void => {
    const w = scene.currentWorld;
    const list = w?.blockPalette?.();
    paletteEl.innerHTML = '';
    if (!list) {
      paletteEl.classList.add('hidden');
      return;
    }
    paletteEl.classList.remove('hidden');
    const sel = w?.selectedBlock?.().index ?? 0;
    list.forEach((b, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.title = b.name;
      btn.textContent = b.name;
      btn.style.borderColor = b.color;
      if (i === sel) btn.classList.add('active');
      btn.addEventListener('click', () => {
        w?.selectBlock?.(i);
        refreshPalette();
      });
      paletteEl.appendChild(btn);
    });
  };
  window.addEventListener('prism-cycle', (e) => {
    const w = scene.currentWorld;
    if (!w?.cycleBlock) return;
    w.cycleBlock((e as CustomEvent<number>).detail >= 0 ? 1 : -1);
    refreshPalette();
  });
  /** Mirrors a user-triggered preset switch for the boot-loaded preset. */
  const syncPresetUI = (): void => {
    const id = scene.currentPreset;
    // Dropdown options are built from the registry (single source of truth).
    if (presetSel.options.length !== PRESET_ORDER.length) {
      presetSel.innerHTML = '';
      for (const pid of PRESET_ORDER) {
        const opt = document.createElement('option');
        opt.value = pid;
        opt.textContent = PRESET_LABELS[pid];
        presetSel.appendChild(opt);
      }
    }
    presetSel.value = id;
    easyBtn.classList.toggle('hidden', id !== 'drive');
    // Shareable link support: ?preset=drive&easy=1 boots into easy mode.
    if (id === 'drive' && queryParam('easy') === '1') {
      scene.currentWorld?.setEasyMode?.(true);
    }
    syncEasyLabel();
    refreshPalette();
  };
  const toggleEasy = (): void => {
    const w = scene.currentWorld;
    if (scene.currentPreset !== 'drive' || !w?.setEasyMode || !w?.isEasyMode) return;
    w.setEasyMode(!w.isEasyMode());
    syncEasyLabel();
  };
  easyBtn.addEventListener('click', toggleEasy);
  window.addEventListener('prism-easy', toggleEasy);
  syncPresetUI(); // the constructor boots the initial preset — sync UI to it
  if (queryParam('ai') === '1') {
    observer.setEnabled(true);
    syncAiButton();
  }
  const tracker = new HandTracker();
  const overlayCtx = overlay.getContext('2d');

  // Fixed overlay backing store; CSS scales it over the preview.
  overlay.width = 400;
  overlay.height = 225;

  let cameraHandle: CameraHandle | null = null;
  let cameraStarting = false;

  const enableCamera = async (): Promise<boolean> => {
    if (cameraHandle) return true;
    if (cameraStarting) return false;
    cameraStarting = true;
    cameraBtn.classList.add('active');
    cameraBtn.disabled = true; // busy state: double-taps can't stack requests
    try {
      setStatus('Requesting camera…');
      cameraHandle = await startCamera(video);
      video.classList.add('live');
      return true;
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
      cameraBtn.classList.remove('active');
      video.classList.remove('live');
      return false;
    } finally {
      cameraStarting = false;
      cameraBtn.disabled = false;
    }
  };

  // Model download starts only with a live feed: denied/unavailable cameras
  // skip ~19 MB of wasm+model traffic entirely instead of failing slowly.
  const ensureTracking = async (): Promise<void> => {
    if (!cameraHandle || tracker.isReady) return;
    await tracker.init(setStatus);
    tracker.start(video);
    const handle = cameraHandle;
    setStatus(`Tracking ${handle.width}×${handle.height} · point to move, pinch to grab.`);
  };

  const bootVision = async (): Promise<void> => {
    try {
      if (await enableCamera()) await ensureTracking();
    } catch (err) {
      console.error('[PRISM] vision stack failed:', err);
      setStatus(`Hand tracking unavailable (${describeMediaError(err)}). Mouse fallback active.`);
    }
  };

  cameraBtn.addEventListener('click', () => void bootVision());
  qualitySel.addEventListener('change', () => {
    const q = resolveQuality();
    scene.applyQuality(q);
    governor.rebase(q);
  });
  debugBtn.addEventListener('click', () => {
    debugBtn.classList.toggle('active', debug.toggle());
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'd' || e.key === 'D') debugBtn.classList.toggle('active', debug.toggle());
    if (e.key === 'h' || e.key === 'H') helpCard.classList.toggle('hidden');
  });
  helpBtn.addEventListener('click', () => helpCard.classList.toggle('hidden'));
  helpClose.addEventListener('click', () => helpCard.classList.add('hidden'));
  // First-run companion: three steps that tick off live as the user does
  // them. Replaces the old auto-opened help wall — guidance, not homework.
  const ONBOARD_KEY = 'prism:onboarded:v1';
  let onboarded = true;
  try {
    onboarded = window.localStorage.getItem(ONBOARD_KEY) === '1';
  } catch {
    /* private mode / no storage: never auto-open */
  }
  const onboardEl = document.getElementById('onboard') as HTMLElement;
  const onboardClose = document.getElementById('btn-onboard-close') as HTMLButtonElement;
  const onboardHelp = document.getElementById('btn-onboard-help') as HTMLButtonElement;
  const onboardCelebrate = onboardEl.querySelector('.celebrate');
  const onboardStep = (name: string): Element | null => onboardEl.querySelector(`[data-step="${name}"]`);
  let seenHand = false;
  let didGrab = false;
  let onboardCompleteAt = 0;
  const dismissOnboard = (): void => {
    onboardEl.classList.add('hidden');
    try {
      window.localStorage.setItem(ONBOARD_KEY, '1');
    } catch {
      /* ignore */
    }
  };
  onboardClose.addEventListener('click', dismissOnboard);
  onboardHelp.addEventListener('click', () => {
    dismissOnboard();
    helpCard.classList.remove('hidden');
  });
  if (!onboarded) onboardEl.classList.remove('hidden');
  const setStepDone = (name: string, done: boolean): void => {
    const el = onboardStep(name);
    if (el && el.classList.contains('done') !== done) {
      el.classList.toggle('done', done);
    }
  };
  const updateOnboard = (now: number, hands: number, grabbed: string | null): void => {
    if (onboardEl.classList.contains('hidden')) return;
    seenHand = seenHand || hands > 0;
    didGrab = didGrab || grabbed !== null;
    setStepDone('camera', !!cameraHandle);
    setStepDone('hand', seenHand);
    setStepDone('grab', didGrab);
    if (!onboardCompleteAt && cameraHandle && seenHand && didGrab) {
      onboardCompleteAt = now;
      onboardCelebrate?.classList.remove('hidden');
    }
    if (onboardCompleteAt && now - onboardCompleteAt > 2500) dismissOnboard();
  };

  window.addEventListener('resize', () => {
    scene.resize(container.clientWidth, container.clientHeight);
  });

  // Surface runtime faults in the HUD instead of dying silently.
  window.addEventListener('error', (e) => {
    setStatus(`Runtime fault: ${e.message} — mouse fallback still works; report this text.`);
  });

  // Render loop starts immediately and never blocks on camera/model work:
  // it consumes the latest tracker frame (null until tracking runs).
  let last = performance.now();
  let elapsed = 0;
  let renderFps = 60;
  let lastUiAt = 0;
  let lastCoachText = '\0'; // impossible sentinel: first hint always paints
  // Observer candidates only change on preset switch: never rebuild per frame.
  let cachedCandidates: string[] = [];
  let cachedCandidatePreset = '';
  // Ambient UI: system rail + contextual coach at 4 Hz with
  // change-detection (DOM writes only when text actually changes).
  const setRail = (key: 'cam' | 'hands' | 'gesture' | 'fps', state: string, text: string): void => {
    const item = railEls[key];
    if (!item) return;
    const dot = item.querySelector('.dot');
    const txt = item.querySelector('.txt');
    if (dot && dot.getAttribute('data-state') !== state) dot.setAttribute('data-state', state);
    if (txt && txt.textContent !== text) txt.textContent = text;
  };

  const updateRailAndCoach = (now: number): void => {
    const frame = tracker.getFrame();
    const frameAge = frame ? now - frame.timestampMs : Number.POSITIVE_INFINITY;
    if (!cameraHandle) {
      setRail('cam', 'off', 'Camera off');
    } else if (frameAge > 1500) {
      setRail('cam', 'warn', 'Camera stalled');
    } else {
      setRail('cam', 'on', 'Camera live');
    }
    const nHands = frame?.hands.length ?? 0;
    setRail('hands', nHands > 0 ? 'on' : 'off', nHands === 1 ? '1 hand' : `${nHands} hands`);
    setRail(
      'gesture',
      interaction.mode === 'none' ? 'off' : 'on',
      interaction.mode === 'none' ? '—' : interaction.gesture,
    );
    setRail('fps', renderFps >= 30 ? 'on' : 'warn', `${renderFps.toFixed(0)} fps`);

    const hint =
      scene.currentWorld?.coachHint?.() ??
      baseCoachHint({
        mode: interaction.mode,
        gesture: interaction.gesture,
        pinching: interaction.isPinching,
        hovered: interaction.hoveredName,
        grabbed: interaction.grabbedName,
        twoHand: interaction.twoHandActive,
        cameraOn: !!cameraHandle,
        preset: scene.currentPreset,
        touch: device.hasTouch,
      });
    const text = hint ?? '';
    if (text !== lastCoachText) {
      lastCoachText = text;
      if (hint) {
        coachEl.textContent = hint;
        coachEl.classList.remove('hidden');
      } else {
        coachEl.classList.add('hidden');
      }
    }
  };

  const tick = (now: number): void => {
    requestAnimationFrame(tick); // re-arm FIRST: one bad frame can never freeze the app
    try {
      // Debug-gated diagnostics: no snapshot strings while the overlay hides.
      const showDebug = debug.isVisible;
      const dt = Math.min(0.1, Math.max(1e-4, (now - last) / 1000));
      last = now;
      elapsed += dt;
      renderFps += (1 / dt - renderFps) * 0.05;

      const frame = tracker.getFrame();
      interaction.update(dt, frame);
      const world = scene.currentWorld;
      // FPS governor watches real frame times (auto mode only).
      if (qualitySel.value === 'auto') governor.update(dt);
      if (world && cachedCandidatePreset !== scene.currentPreset) {
        cachedCandidatePreset = scene.currentPreset;
        cachedCandidates = scene.grabbables
          .map((o) => o.name)
          .filter((n): n is string => n.length > 0);
      }
      // AI observer: one frame every few seconds, readout only (never drives).
      observer.tick(now, cachedCandidates, interaction.gesture);
      // Feed unified hand/mouse input to worlds that drive (drive preset).
      // Hands get an analog gas pedal from pinch closeness; mouse is binary.
      // Pinch = gas, release = coast, Space = brake. Nothing else.
      // (groundXZ only runs when a world actually consumes drive input.)
      if (world?.setDriveInput) {
        world.setDriveInput({
          steer: interaction.mode === 'none' ? 0 : applySteerCurve(interaction.pointerNX),
          throttle: interaction.actionHeld ? (interaction.mode === 'hand' ? interaction.pinchCloseness : 1) : 0,
          brake: interaction.spaceDown,
          actionPressed: interaction.actionPressed,
          ground: interaction.groundXZ(),
        });
      }
      // Tap/hold/release edges for worlds with their own targets (voxel).
      world?.setPointerAction?.(
        interaction.actionPressed,
        interaction.actionHeld,
        interaction.actionReleased,
      );
      scene.update(dt, elapsed);
      if (now - lastUiAt >= 250) {
        lastUiAt = now;
        updateRailAndCoach(now);
        updateOnboard(now, frame?.hands.length ?? 0, interaction.grabbedName);
      }
      if (overlayCtx) drawLandmarkOverlay(overlayCtx, frame);
      const info = scene.bodyInfo(interaction.grabbedName ?? interaction.hoveredName);
      if (info) {
        planetInfoEl.textContent = info;
        planetInfoEl.classList.remove('hidden');
      } else {
        planetInfoEl.classList.add('hidden');
      }
      debug.update(
        now,
        {
          renderFps,
          hands: frame?.hands.length ?? 0,
          confidence: frame?.hands[0]?.confidence ?? 0,
          // Debug-only strings snapshot: skip the work entirely when hidden.
          deviceLine: showDebug ? deviceLine() : '',
        },
        interaction,
        tracker,
        scene.drawCalls,
        scene.triangles,
        scene.grabbables.length,
        showDebug ? observer.snapshot() : null,
      );
      scene.render();
    } catch (err) {
      setStatus(
        `Frame fault (${err instanceof Error ? err.message : String(err)}) — continuing; report this text.`,
      );
      console.error('[PRISM] frame fault:', err);
    }
  };
  requestAnimationFrame(tick);

  // Camera first, model second: the render loop is already running and the
  // mouse works meanwhile; a dead camera skips the model download entirely.
  void bootVision();
}

void main();
