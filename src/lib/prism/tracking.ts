// MediaPipe HandLandmarker wrapper.
//
// Performance architecture:
// detectForVideo() is synchronous inside the worker, never the render thread.
// Camera frames are sampled through requestVideoFrameCallback when available,
// with strict backpressure so PRISM never queues stale frames.

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { PrismConfig } from './config';
import { isTabletDevice } from './device';
import type { HandFrame, TrackedHand } from './types';

async function resolveModelUrl(): Promise<{ url: string; offline: boolean }> {
  try {
    const probe = await fetch(PrismConfig.tracking.localModelUrl, { method: 'HEAD' });
    const type = probe.headers.get('content-type') ?? '';
    const length = Number(probe.headers.get('content-length') ?? '0');
    if (probe.ok && !type.includes('text/html') && length > 1_000_000) {
      return { url: PrismConfig.tracking.localModelUrl, offline: true };
    }
  } catch {
    // CDN fallback.
  }
  return { url: PrismConfig.tracking.cdnModelUrl, offline: false };
}

type WorkerReady = { type: 'ready'; delegate: string; offline: boolean };
type WorkerError = { type: 'error' | 'pump-error'; message: string };
type WorkerResult = { type: 'result'; hands: TrackedHand[]; timestampMs: number; inferenceMs: number };
type WorkerMessage = WorkerReady | WorkerError | WorkerResult;

type VideoFrameCallback = (now: number, metadata: VideoFrameCallbackMetadata) => void;
type VideoFrameVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: VideoFrameCallback) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private latest: HandFrame | null = null;
  private running = false;
  private loopHandle = 0;
  private video: VideoFrameVideo | null = null;
  private worker: Worker | null = null;
  private workerBusy = false;
  private workerInitPromise: Promise<void> | null = null;
  private useWorker = false;
  private detectionCount = 0;
  private detectionTotalMs = 0;
  private lastSubmittedAt = -Infinity;
  private videoFrameCallbackHandle = 0;
  private requestedIntervalMs: number | null = null;
  private baseIntervalMs = 180;

  modelOffline = false;
  delegateUsed = 'GPU';
  pumpErrorCount = 0;
  lastPumpError = '';

  async init(onProgress: (msg: string) => void): Promise<void> {
    if (this.landmarker || this.useWorker) return;
    if (this.workerInitPromise) return this.workerInitPromise;

    if (typeof Worker !== 'undefined') {
      this.workerInitPromise = this.initWorker(onProgress);
      try {
        await this.workerInitPromise;
        return;
      } catch {
        this.worker?.terminate();
        this.worker = null;
        this.workerInitPromise = null;
      }
    }

    await this.initMainThread(onProgress);
  }

  private async initWorker(onProgress: (msg: string) => void): Promise<void> {
    onProgress('Loading vision runtime off-thread…');
    const worker = new Worker(new URL('./tracking-worker.ts', import.meta.url), { type: 'module' });
    this.worker = worker;

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Tracking worker initialization timed out')), 20_000);
      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const message = event.data;
        if (message.type === 'ready') {
          window.clearTimeout(timeout);
          this.modelOffline = message.offline;
          this.delegateUsed = message.delegate;
          this.useWorker = true;
          resolve();
        } else if (message.type === 'error') {
          window.clearTimeout(timeout);
          reject(new Error(message.message));
        }
      };
      worker.onerror = (event) => {
        window.clearTimeout(timeout);
        reject(new Error(event.message || 'Tracking worker failed to initialize'));
      };
      worker.postMessage({ type: 'init' });
    });

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => this.handleWorkerMessage(event.data);
  }

  private async initMainThread(onProgress: (msg: string) => void): Promise<void> {
    onProgress('Loading vision runtime…');
    const wasmUrls = [PrismConfig.tracking.wasmUrl, PrismConfig.tracking.cdnWasmUrl].filter(
      (u, i, all) => u && all.indexOf(u) === i,
    );
    let lastError: unknown = null;

    for (const wasmUrl of wasmUrls) {
      try {
        const vision = await FilesetResolver.forVisionTasks(wasmUrl);
        const { url, offline } = await resolveModelUrl();
        for (const delegate of ['GPU', 'CPU'] as const) {
          try {
            onProgress(`Loading hand model (${offline ? 'local' : 'CDN'}, ${delegate})…`);
            this.landmarker = await HandLandmarker.createFromOptions(vision, {
              baseOptions: { modelAssetPath: url, delegate },
              runningMode: 'VIDEO',
              numHands: PrismConfig.tracking.numHands,
              minHandDetectionConfidence: PrismConfig.tracking.minHandDetectionConfidence,
              minHandPresenceConfidence: PrismConfig.tracking.minHandPresenceConfidence,
              minTrackingConfidence: PrismConfig.tracking.minTrackingConfidence,
            });
            this.modelOffline = offline;
            this.delegateUsed = delegate;
            return;
          } catch (err) {
            lastError = err;
          }
        }
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  get isReady(): boolean {
    return this.landmarker !== null || this.useWorker;
  }

  get isTracking(): boolean {
    return this.running;
  }

  start(video: HTMLVideoElement, opts?: { intervalMs?: number }): void {
    if (!this.isReady) throw new Error('HandTracker.start() called before init().');
    this.stop();
    this.video = video as VideoFrameVideo;
    this.running = true;
    this.lastSubmittedAt = -Infinity;

    // Vision is input sampling, not display rendering. Phones sample more
    // slowly than the renderer; worker backpressure keeps stale frames out.
    const defaultInterval = isTabletDevice() ? 100 : 180;
    this.baseIntervalMs = Math.max(80, defaultInterval);
    this.requestedIntervalMs = opts?.intervalMs != null ? Math.max(80, opts.intervalMs) : null;
    const videoWithCallback = this.video;

    if (this.useWorker && videoWithCallback.requestVideoFrameCallback) {
      const schedule = (): void => {
        if (!this.running || !this.video || !videoWithCallback.requestVideoFrameCallback) return;
        this.videoFrameCallbackHandle = videoWithCallback.requestVideoFrameCallback((now) => {
          if (!this.running) return;
          if (now - this.lastSubmittedAt >= this.getTargetIntervalMs()) this.pump(now);
          schedule();
        });
      };
      schedule();
      return;
    }

    const loop = (): void => {
      if (!this.running) return;
      this.pump(performance.now());
      this.loopHandle = window.setTimeout(loop, this.getTargetIntervalMs()) as unknown as number;
    };
    this.loopHandle = window.setTimeout(loop, targetInterval) as unknown as number;
  }

  stop(): void {
    this.running = false;
    clearTimeout(this.loopHandle);
    this.loopHandle = 0;
    if (this.videoFrameCallbackHandle && this.video?.cancelVideoFrameCallback) {
      this.video.cancelVideoFrameCallback(this.videoFrameCallbackHandle);
    }
    this.videoFrameCallbackHandle = 0;
    this.workerBusy = false;
    this.requestedIntervalMs = null;
    this.video = null;
  }

  dispose(): void {
    this.stop();
    this.worker?.terminate();
    this.worker = null;
    this.useWorker = false;
    this.workerInitPromise = null;
    this.landmarker?.close();
    this.landmarker = null;
  }

  getFrame(): HandFrame | null {
    return this.latest;
  }

  get trackingFps(): number {
    if (this.detectionCount < 2 || this.detectionTotalMs <= 0) return 0;
    return (this.detectionCount / this.detectionTotalMs) * 1000;
  }

  get averageInferenceMs(): number {
    if (this.detectionCount === 0) return 0;
    return this.detectionTotalMs / this.detectionCount;
  }

  private pump(timestampHint: number): void {
    const video = this.video;
    if (!video || video.readyState < 1) return;
    if (video.videoWidth === 0 && video.readyState < 2) return;

    if (this.useWorker && this.worker) {
      // Never allocate/copy a camera frame if the worker is still processing.
      if (this.workerBusy) return;
      try {
        if (typeof VideoFrame === 'undefined') throw new Error('VideoFrame API unavailable');
        const frame = new VideoFrame(video);
        this.workerBusy = true;
        this.lastSubmittedAt = performance.now();
        this.worker.postMessage({ type: 'frame', frame, timestampMs: timestampHint }, [frame]);
      } catch (err) {
        this.workerBusy = false;
        this.pumpErrorCount += 1;
        this.lastPumpError = err instanceof Error ? err.message : String(err);
      }
      return;
    }

    if (!this.landmarker) return;
    const now = performance.now();
    const t0 = now;
    try {
      const result = this.landmarker.detectForVideo(video, now);
      const elapsed = performance.now() - t0;
      this.acceptResult(
        (result.landmarks ?? []).map((landmarks, i) => ({
          landmarks: landmarks.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 })),
          handedness: result.handedness?.[i]?.[0]?.categoryName ?? 'Unknown',
          confidence: result.handedness?.[i]?.[0]?.score ?? 0,
        })),
        now,
        elapsed,
      );
    } catch (err) {
      this.pumpErrorCount += 1;
      this.lastPumpError = err instanceof Error ? err.message : String(err);
    }
  }

  private handleWorkerMessage(message: WorkerMessage): void {
    if (message.type === 'result') {
      this.workerBusy = false;
      this.pumpErrorCount = 0;
      this.acceptResult(message.hands, message.timestampMs, message.inferenceMs);
    } else if (message.type === 'pump-error') {
      this.workerBusy = false;
      this.pumpErrorCount += 1;
      this.lastPumpError = message.message;
    }
  }

  /**
   * Tracking is a shared-performance budget, not a fixed FPS target.
   * When MediaPipe inference becomes expensive, increase the sampling interval
   * before it can compete with the renderer. Fast devices naturally settle
   * back toward the base interval.
   */
  private getTargetIntervalMs(): number {
    if (this.requestedIntervalMs !== null) return this.requestedIntervalMs;
    const inference = this.averageInferenceMs;
    const pressure = inference > 45 ? (inference - 45) * 1.4 : 0;
    return Math.max(80, Math.min(260, this.baseIntervalMs + pressure));
  }

  private acceptResult(hands: TrackedHand[], timestampMs: number, inferenceMs: number): void {
    this.detectionCount += 1;
    this.detectionTotalMs += inferenceMs;
    if (this.detectionCount > 30) {
      this.detectionCount = Math.floor(this.detectionCount / 2);
      this.detectionTotalMs /= 2;
    }
    this.latest = { hands, timestampMs };
  }
}

const SKELETON: Array<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

export function drawLandmarkOverlay(ctx: CanvasRenderingContext2D, frame: HandFrame | null): void {
  const canvas = ctx.canvas;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!frame) return;

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
