// MediaPipe HandLandmarker wrapper (via @mediapipe/tasks-vision).
//
// The tracker runs inference on its own cadence and stores only the latest
// HandFrame. The render loop consumes getFrame() without ever blocking on
// inference, satisfying the PLAN.md requirement that rendering never waits
// for camera inference.

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { PrismConfig } from './config';
import type { HandFrame, TrackedHand } from './types';

async function resolveModelUrl(): Promise<{ url: string; offline: boolean }> {
  // Prefer a locally bundled model (public/models/) for offline use.
  // NOTE: dev servers / static hosts often return the index.html SPA
  // fallback with status 200 for unknown paths, so a bare `ok` check is
  // not enough — reject HTML responses and tiny payloads.
  try {
    const probe = await fetch(PrismConfig.tracking.localModelUrl, { method: 'HEAD' });
    const type = probe.headers.get('content-type') ?? '';
    const length = Number(probe.headers.get('content-length') ?? '0');
    if (probe.ok && !type.includes('text/html') && length > 1_000_000) {
      return { url: PrismConfig.tracking.localModelUrl, offline: true };
    }
  } catch {
    /* fall through to CDN */
  }
  return { url: PrismConfig.tracking.cdnModelUrl, offline: false };
}

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private latest: HandFrame | null = null;
  private lastVideoTime = -1;
  private detectionCount = 0;
  private detectionTotalMs = 0;
  private running = false;
  private loopHandle = 0;
  private video: HTMLVideoElement | null = null;
  private lastFrameAt = 0;
  modelOffline = false;
  delegateUsed = 'GPU';
  /** Consecutive detectForVideo failures (surfaced in debug; never silent). */
  pumpErrorCount = 0;
  lastPumpError = '';

  /** Loads wasm + model. Must be called before start().
   *  IDEMPOTENT: if already loaded (or currently loading), returns the
   *  existing promise instead of starting a duplicate load. This prevents
   *  the preload + ensureTracking race that caused "stuck on starting hand
   *  tracking" (two concurrent init() calls deadlocking). */
  private initPromise: Promise<void> | null = null;
  async init(onProgress: (msg: string) => void): Promise<void> {
    // Already loaded? Skip.
    if (this.landmarker) return;
    // Currently loading? Return the existing promise (don't start a 2nd load).
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInit(onProgress);
    try {
      await this.initPromise;
    } finally {
      // Keep the promise so concurrent callers can await it, but allow
      // a retry if init failed (landmarker is still null).
      if (!this.landmarker) this.initPromise = null;
    }
  }

  private async doInit(onProgress: (msg: string) => void): Promise<void> {
    onProgress('Loading vision runtime…');
    const wasmUrls = [PrismConfig.tracking.wasmUrl, PrismConfig.tracking.cdnWasmUrl].filter(
      (u, i, all) => u && all.indexOf(u) === i,
    );
    let lastError: unknown = null;
    for (const wasmUrl of wasmUrls) {
      try {
        await this.initWithWasm(wasmUrl, onProgress);
        lastError = null;
        break;
      } catch (err) {
        lastError = err; // e.g. unvendored public/wasm → try the CDN next
      }
    }
    if (!this.landmarker) throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async initWithWasm(wasmUrl: string, onProgress: (msg: string) => void): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(wasmUrl);
    const { url, offline } = await resolveModelUrl();
    this.modelOffline = offline;
    // GPU first for speed; fall back to CPU for headless browsers, VMs, and
    // weak exhibition hardware where the GPU delegate cannot initialize.
    let lastError: unknown = null;
    for (const delegate of ['GPU', 'CPU'] as const) {
      try {
        onProgress(
          `Loading hand model (${offline ? 'local' : 'CDN'}, ${delegate})…`,
        );
        this.landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: url, delegate },
          runningMode: 'VIDEO',
          numHands: PrismConfig.tracking.numHands,
          minHandDetectionConfidence: PrismConfig.tracking.minHandDetectionConfidence,
          minHandPresenceConfidence: PrismConfig.tracking.minHandPresenceConfidence,
          minTrackingConfidence: PrismConfig.tracking.minTrackingConfidence,
        });
        this.delegateUsed = delegate;
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (!this.landmarker) throw lastError;
  }

  get isReady(): boolean {
    return this.landmarker !== null;
  }

  /** True when the detection loop is actively running (start() called,
   *  stop() not yet called). Distinct from isReady (model loaded). */
  get isTracking(): boolean {
    return this.running;
  }

  /** Begins the detection loop over a playing video element.
   *  HEAVY THROTTLE: runs at most 10fps (every 100ms) to leave maximum CPU
   *  for the render loop. MediaPipe's detectForVideo is SYNCHRONOUS and
   *  blocks the main thread — with 2 hands it takes 200-300ms. At 10fps
   *  tracking, there's a 100ms gap between detections for rendering.
   *  The pointer filter + pinch coast smooth between samples, so 10fps
   *  tracking feels smooth to the user (no visible stutter).
   *
   *  CRITICAL: this is setTimeout-based (NOT rAF) because detectForVideo
   *  blocks the main thread. If it ran in rAF, the render loop would freeze
   *  for the duration of each inference call. setTimeout lets the render
   *  loop (rAF) run between detections. */
  start(video: HTMLVideoElement): void {
    if (!this.landmarker) throw new Error('HandTracker.start() called before init().');
    this.video = video;
    this.running = true;
    this.lastFrameAt = performance.now();
    const TARGET_INTERVAL_MS = 100; // 10fps max detection rate
    const loop = (): void => {
      if (!this.running) return;
      const t0 = performance.now();
      this.pump();
      const elapsed = performance.now() - t0;
      // Wait the remaining time to hit 10fps. If inference took longer than
      // 100ms, run immediately (wait=0) — the render loop got time during
      // the setTimeout yield between detections.
      const wait = Math.max(0, TARGET_INTERVAL_MS - elapsed);
      this.loopHandle = window.setTimeout(loop, wait) as unknown as number;
    };
    this.loopHandle = window.setTimeout(loop, TARGET_INTERVAL_MS) as unknown as number;
  }

  stop(): void {
    this.running = false;
    clearTimeout(this.loopHandle);
    cancelAnimationFrame(this.loopHandle);
    this.video = null;
  }

  /** Latest frame (or null if tracking never produced one / was lost). */
  getFrame(): HandFrame | null {
    return this.latest;
  }

  /** Detections per second over recent history (0 when idle). */
  get trackingFps(): number {
    if (this.detectionCount < 2 || this.detectionTotalMs <= 0) return 0;
    return (this.detectionCount / this.detectionTotalMs) * 1000;
  }

  get averageInferenceMs(): number {
    if (this.detectionCount === 0) return 0;
    return this.detectionTotalMs / this.detectionCount;
  }

  private pump(): void {
    const video = this.video;
    if (!video || !this.landmarker) return;
    // Accept readyState >= 1 (HAVE_METADATA) — some preview environments
    // never reach readyState 2 but the stream is live and MediaPipe can
    // still read frames.
    if (video.readyState < 1) return;
    if (video.videoWidth === 0 && video.readyState < 2) return;

    // NOTE: we DO NOT gate on video.currentTime — in many preview/iframe
    // environments, the video element's currentTime never advances (the
    // stream is live but the element isn't "playing" in the DOM sense).
    // The old check `if (video.currentTime === this.lastVideoTime) return`
    // caused detection to NEVER run (currentTime stayed at 0 forever).
    // Instead, we run detection every pump cycle. The 10fps throttle on
    // the loop already prevents wasted inference.

    const now = performance.now();
    const dt = now - this.lastFrameAt;
    this.lastFrameAt = now;

    const t0 = performance.now();
    let result;
    try {
      result = this.landmarker.detectForVideo(video, now);
    } catch (err) {
      this.pumpErrorCount += 1;
      this.lastPumpError = err instanceof Error ? err.message : String(err);
      return;
    }
    this.pumpErrorCount = 0;
    const elapsed = performance.now() - t0;

    // Rolling average over the last ~30 detections.
    this.detectionCount += 1;
    this.detectionTotalMs += elapsed;
    if (this.detectionCount > 30) {
      this.detectionCount = Math.floor(this.detectionCount / 2);
      this.detectionTotalMs /= 2;
    }

    // ADAPTIVE: if inference is consistently > 150ms (slow camera/CPU),
    // log it. The debug overlay shows this so the user can see WHY the
    // tracking is at 10fps. Future: could dynamically drop numHands here.
    if (elapsed > 150 && this.detectionCount % 10 === 0) {
      this.lastPumpError = `slow inference: ${elapsed.toFixed(0)}ms (2-hand detection)`;
    }

    const hands: TrackedHand[] = (result.landmarks ?? []).map((landmarks, i) => ({
      landmarks: landmarks.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 })),
      handedness: result.handedness?.[i]?.[0]?.categoryName ?? 'Unknown',
      confidence: result.handedness?.[i]?.[0]?.score ?? 0,
    }));
    this.latest = { hands, timestampMs: now };
    void dt;
  }
}

/** Draws hand skeletons onto a 2D canvas sized to the preview element. */
const SKELETON: Array<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

export function drawLandmarkOverlay(
  ctx: CanvasRenderingContext2D,
  frame: HandFrame | null,
): void {
  const canvas = ctx.canvas;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!frame) return;

  // Note: the canvas element itself is CSS-mirrored, so raw coords are correct.
  frame.hands.forEach((hand, handIndex) => {
    const color = handIndex === 0 ? '#9adcff' : '#a8ffc9';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.fillStyle = color;
    for (const [a, b] of SKELETON) {
      const p = hand.landmarks[a];
      const q = hand.landmarks[b];
      ctx.beginPath();
      ctx.moveTo(p.x * canvas.width, p.y * canvas.height);
      ctx.lineTo(q.x * canvas.width, q.y * canvas.height);
      ctx.stroke();
    }
    hand.landmarks.forEach((p, i) => {
      const r = i === 4 || i === 8 ? 4 : 2.5;
      ctx.beginPath();
      ctx.arc(p.x * canvas.width, p.y * canvas.height, r, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}
