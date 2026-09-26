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

  /** Loads wasm + model. Must be called before start(). */
  async init(onProgress: (msg: string) => void): Promise<void> {
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

  /** Begins the detection loop over a playing video element. */
  start(video: HTMLVideoElement): void {
    if (!this.landmarker) throw new Error('HandTracker.start() called before init().');
    this.video = video;
    this.running = true;
    this.lastFrameAt = performance.now();
    const loop = (): void => {
      if (!this.running) return;
      this.pump();
      this.loopHandle = requestAnimationFrame(loop);
    };
    this.loopHandle = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
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
    if (video.readyState < 2 || video.videoWidth === 0) return;
    // Skip frames the video element hasn't refreshed: no wasted inference.
    if (video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;

    const now = performance.now();
    const dt = now - this.lastFrameAt;
    this.lastFrameAt = now;

    const t0 = performance.now();
    let result;
    try {
      result = this.landmarker.detectForVideo(video, now);
    } catch (err) {
      // Count, don't just swallow: a permanently failing delegate used to
      // look exactly like "no hands" with zero diagnostics.
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
    const color = handIndex === 0 ? '#00f0ff' : '#7CFF6b';
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
