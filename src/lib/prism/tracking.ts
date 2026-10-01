// MediaPipe HandLandmarker wrapper.
// Latency-first: never queue stale frames and never deliberately slow the tracker.

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { PrismConfig } from './config';
import { isTabletDevice } from './device';
import type { HandFrame, TrackedHand } from './types';

async function fetchModel(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { cache: 'force-cache', redirect: 'follow' });
  if (!response.ok) throw new Error(`Model fetch failed (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 1_000_000) throw new Error(`Invalid hand model payload (${bytes.byteLength} bytes)`);
  return bytes;
}

async function resolveModel(): Promise<{ bytes: Uint8Array; offline: boolean }> {
  const urls = [PrismConfig.tracking.localModelUrl, PrismConfig.tracking.cdnModelUrl, PrismConfig.tracking.fallbackModelUrl];
  let lastError: unknown = null;
  for (const [index, url] of urls.entries()) {
    try { return { bytes: await fetchModel(url), offline: index === 0 }; }
    catch (err) { lastError = err; }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

type WorkerReady = { type: 'ready'; delegate: string; offline: boolean };
type WorkerError = { type: 'error' | 'pump-error'; message: string };
type WorkerResult = { type: 'result'; hands: TrackedHand[]; timestampMs: number; inferenceMs: number };
type WorkerMessage = WorkerReady | WorkerError | WorkerResult;
type VideoFrameCallback = (now: number, metadata: VideoFrameCallbackMetadata) => void;
type VideoFrameVideo = HTMLVideoElement & { requestVideoFrameCallback?: (callback: VideoFrameCallback) => number; cancelVideoFrameCallback?: (handle: number) => void };

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
  private baseIntervalMs = 16;
  private workerFailureCount = 0;
  private mainThreadFallbackStarted = false;

  modelOffline = false;
  delegateUsed = 'GPU';
  pumpErrorCount = 0;
  lastPumpError = '';

  async init(onProgress: (msg: string) => void): Promise<void> {
    if (this.landmarker || this.useWorker) return;
    if (this.workerInitPromise) return this.workerInitPromise;
    const canUseVideoFrameWorker = typeof Worker !== 'undefined' && typeof VideoFrame !== 'undefined';
    if (canUseVideoFrameWorker) {
      this.workerInitPromise = this.initWorker(onProgress);
      try { await this.workerInitPromise; return; }
      catch { this.worker?.terminate(); this.worker = null; this.workerInitPromise = null; }
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
        if (message.type === 'ready') { window.clearTimeout(timeout); this.modelOffline = message.offline; this.delegateUsed = message.delegate; this.useWorker = true; this.workerFailureCount = 0; resolve(); }
        else if (message.type === 'error') { window.clearTimeout(timeout); reject(new Error(message.message)); }
      };
      worker.onerror = (event) => { window.clearTimeout(timeout); reject(new Error(event.message || 'Tracking worker failed to initialize')); };
      worker.postMessage({ type: 'init' });
    });
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => this.handleWorkerMessage(event.data);
  }

  private async initMainThread(onProgress: (msg: string) => void): Promise<void> {
    onProgress('Loading vision runtime…');
    const wasmUrls = [PrismConfig.tracking.wasmUrl, PrismConfig.tracking.cdnWasmUrl].filter((u, i, all) => u && all.indexOf(u) === i);
    const model = await resolveModel();
    let lastError: unknown = null;
    for (const wasmUrl of wasmUrls) {
      try {
        const vision = await FilesetResolver.forVisionTasks(wasmUrl);
        for (const delegate of ['GPU', 'CPU'] as const) {
          try {
            onProgress(`Loading hand model (${model.offline ? 'local' : 'network fallback'}, ${delegate})…`);
            this.landmarker = await HandLandmarker.createFromOptions(vision, { baseOptions: { modelAssetBuffer: model.bytes, delegate }, runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: 0.25, minHandPresenceConfidence: 0.25, minTrackingConfidence: 0.25 });
            this.modelOffline = model.offline; this.delegateUsed = delegate; this.mainThreadFallbackStarted = false; return;
          } catch (err) { lastError = err; }
        }
      } catch (err) { lastError = err; }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  get isReady(): boolean { return this.landmarker !== null || this.useWorker; }
  get isTracking(): boolean { return this.running; }

  start(video: HTMLVideoElement, opts?: { intervalMs?: number }): void {
    if (!this.isReady) throw new Error('HandTracker.start() called before init().');
    this.stop(); this.video = video as VideoFrameVideo; this.running = true; this.lastSubmittedAt = -Infinity; this.workerFailureCount = 0;
    const defaultInterval = isTabletDevice() ? 16 : 16;
    this.baseIntervalMs = defaultInterval;
    this.requestedIntervalMs = opts?.intervalMs != null ? Math.max(16, opts.intervalMs) : null;
    const videoWithCallback = this.video;
    if (this.useWorker && videoWithCallback.requestVideoFrameCallback && typeof VideoFrame !== 'undefined') {
      const schedule = (): void => {
        if (!this.running || !this.video || !videoWithCallback.requestVideoFrameCallback) return;
        this.videoFrameCallbackHandle = videoWithCallback.requestVideoFrameCallback((now) => {
          if (!this.running) return;
          if (now - this.lastSubmittedAt >= this.getTargetIntervalMs()) this.pump(now);
          schedule();
        });
      };
      schedule(); return;
    }
    const loop = (): void => { if (!this.running) return; this.pump(performance.now()); this.loopHandle = window.setTimeout(loop, 16) as unknown as number; };
    this.loopHandle = window.setTimeout(loop, 16) as unknown as number;
  }

  stop(): void {
    this.running = false; clearTimeout(this.loopHandle); this.loopHandle = 0;
    if (this.videoFrameCallbackHandle && this.video?.cancelVideoFrameCallback) this.video.cancelVideoFrameCallback(this.videoFrameCallbackHandle);
    this.videoFrameCallbackHandle = 0; this.workerBusy = false; this.requestedIntervalMs = null; this.video = null;
  }

  dispose(): void { this.stop(); this.worker?.terminate(); this.worker = null; this.useWorker = false; this.workerInitPromise = null; this.landmarker?.close(); this.landmarker = null; }
  getFrame(): HandFrame | null { return this.latest; }
  get trackingFps(): number { return this.detectionCount < 2 || this.detectionTotalMs <= 0 ? 0 : (this.detectionCount / this.detectionTotalMs) * 1000; }
  get averageInferenceMs(): number { return this.detectionCount === 0 ? 0 : this.detectionTotalMs / this.detectionCount; }

  private pump(timestampHint: number): void {
    const video = this.video;
    if (!video || video.readyState < 2 || video.videoWidth === 0) return;
    if (this.useWorker && this.worker) {
      if (this.workerBusy) return;
      try {
        const frame = new VideoFrame(video);
        this.workerBusy = true; this.lastSubmittedAt = performance.now();
        this.worker.postMessage({ type: 'frame', frame, timestampMs: timestampHint }, [frame]);
      } catch (err) { this.workerBusy = false; this.pumpErrorCount += 1; this.lastPumpError = err instanceof Error ? err.message : String(err); void this.fallbackFromWorker(); }
      return;
    }
    if (!this.landmarker) return;
    const now = performance.now(); const t0 = now;
    try {
      const result = this.landmarker.detectForVideo(video, now);
      this.acceptResult((result.landmarks ?? []).map((landmarks, i) => ({ landmarks: landmarks.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 })), handedness: result.handedness?.[i]?.[0]?.categoryName ?? 'Unknown', confidence: result.handedness?.[i]?.[0]?.score ?? 0 })), now, performance.now() - t0);
    } catch (err) { this.pumpErrorCount += 1; this.lastPumpError = err instanceof Error ? err.message : String(err); }
  }

  private handleWorkerMessage(message: WorkerMessage): void {
    if (message.type === 'result') { this.workerBusy = false; this.workerFailureCount = 0; this.pumpErrorCount = 0; this.acceptResult(message.hands, message.timestampMs, message.inferenceMs); }
    else if (message.type === 'pump-error') { this.workerBusy = false; this.pumpErrorCount += 1; this.workerFailureCount += 1; this.lastPumpError = message.message; if (this.workerFailureCount >= 3) void this.fallbackFromWorker(); }
  }

  private async fallbackFromWorker(): Promise<void> {
    if (this.mainThreadFallbackStarted || !this.running) return;
    this.mainThreadFallbackStarted = true; const video = this.video;
    this.worker?.terminate(); this.worker = null; this.useWorker = false; this.workerBusy = false; this.workerInitPromise = null;
    if (!video) { this.mainThreadFallbackStarted = false; return; }
    try { await this.initMainThread(() => undefined); if (this.running && this.video === video) this.start(video); }
    catch (err) { this.lastPumpError = err instanceof Error ? err.message : String(err); this.mainThreadFallbackStarted = false; }
  }

  private getTargetIntervalMs(): number {
    if (this.requestedIntervalMs !== null) return this.requestedIntervalMs;
    return 16;
  }

  private acceptResult(hands: TrackedHand[], timestampMs: number, inferenceMs: number): void {
    this.detectionCount += 1; this.detectionTotalMs += inferenceMs;
    if (this.detectionCount > 30) { this.detectionCount = Math.floor(this.detectionCount / 2); this.detectionTotalMs /= 2; }
    this.latest = { hands, timestampMs };
  }
}
