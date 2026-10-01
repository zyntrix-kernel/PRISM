// MediaPipe HandLandmarker wrapper.
// Latency-first: tracking stays off the UI thread and never queues stale frames.

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
type WorkerError = { type: 'error' | 'pump-error' | 'track-error'; message: string };
type WorkerResult = { type: 'result'; hands: TrackedHand[]; timestampMs: number; captureAgeMs: number; inferenceMs: number };
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
  private workerOwnsTrack = false;
  private lastResultSignature = '';

  /** Called on the main thread only when a meaningfully changed result arrives. */
  onResult: (() => void) | null = null;

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
    // Only use main-thread tracking when the browser cannot run the worker
    // architecture at all. Never silently move inference onto the UI thread
    // after a runtime pump error, because that turns camera load into tab jank.
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
        if (message.type === 'ready') { window.clearTimeout(timeout); this.modelOffline = message.offline; this.delegateUsed = message.delegate; this.useWorker = true; resolve(); }
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
            this.landmarker = await HandLandmarker.createFromOptions(vision, { baseOptions: { modelAssetBuffer: model.bytes, delegate }, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: 0.25, minHandPresenceConfidence: 0.25, minTrackingConfidence: 0.25 });
            this.modelOffline = model.offline; this.delegateUsed = delegate; return;
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
    this.stop();
    this.video = video as VideoFrameVideo;
    this.running = true;
    this.latest = null;
    this.lastResultSignature = '';
    this.lastSubmittedAt = -Infinity;
    this.workerBusy = false;

    this.baseIntervalMs = isTabletDevice() ? 16 : 16;
    this.requestedIntervalMs = opts?.intervalMs != null ? Math.max(16, opts.intervalMs) : null;

    const sourceTrack = video.srcObject instanceof MediaStream
      ? video.srcObject.getVideoTracks()[0]
      : null;

    // Best path: transfer a CLONED camera track to the dedicated worker.
    // MediaStreamTrackProcessor then creates VideoFrames off the main thread
    // with a one-frame buffer, so the UI never waits for camera frame
    // extraction and stale frames are discarded instead of queued.
    if (this.useWorker && sourceTrack && typeof Worker !== 'undefined') {
      try {
        // MediaStreamTrackProcessor is worker-only in modern browsers, so do
        // not probe for it on the main thread. Send the cloned track and let
        // the worker decide whether its zero-copy processing path is available.
        const workerTrack = sourceTrack.clone();
        this.workerOwnsTrack = true;
        this.worker?.postMessage({ type: 'track', track: workerTrack }, [workerTrack]);
        return;
      } catch {
        this.workerOwnsTrack = false;
      }
    }

    // Compatibility path for browsers without worker-side
    // MediaStreamTrackProcessor.
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
      schedule();
      return;
    }

    const loop = (): void => {
      if (!this.running) return;
      this.pump(performance.now());
      this.loopHandle = window.setTimeout(loop, 16) as unknown as number;
    };
    this.loopHandle = window.setTimeout(loop, 16) as unknown as number;
  }

  stop(): void {
    this.running = false;
    clearTimeout(this.loopHandle);
    this.loopHandle = 0;
    if (this.videoFrameCallbackHandle && this.video?.cancelVideoFrameCallback) {
      this.video.cancelVideoFrameCallback(this.videoFrameCallbackHandle);
    }
    this.videoFrameCallbackHandle = 0;
    if (this.workerOwnsTrack && this.worker) {
      this.worker.postMessage({ type: 'stop-track' });
    }
    this.workerOwnsTrack = false;
    this.workerBusy = false;
    this.requestedIntervalMs = null;
    this.latest = null;
    this.lastResultSignature = '';
    this.video = null;
  }

  dispose(): void { this.stop(); this.worker?.terminate(); this.worker = null; this.useWorker = false; this.workerInitPromise = null; this.landmarker?.close(); this.landmarker = null; }
  getFrame(): HandFrame | null { return this.latest; }
  get trackingFps(): number { return this.detectionCount < 2 || this.detectionTotalMs <= 0 ? 0 : (this.detectionCount / this.detectionTotalMs) * 1000; }
  get averageInferenceMs(): number { return this.detectionCount === 0 ? 0 : this.detectionTotalMs / this.detectionCount; }

  private pump(timestampHint: number): void {
    const video = this.video;
    if (!video || video.readyState < 2 || video.videoWidth === 0) return;
    if (this.useWorker && this.worker) {
      // Back-pressure is intentional: never queue VideoFrames. The UI always
      // waits for the newest completed inference rather than processing stale
      // camera history, which is the main source of perceived hand lag.
      if (this.workerBusy) return;
      try {
        const frame = new VideoFrame(video);
        this.workerBusy = true; this.lastSubmittedAt = performance.now();
        this.worker.postMessage({ type: 'frame', frame, timestampMs: timestampHint }, [frame]);
      } catch (err) { this.workerBusy = false; this.pumpErrorCount += 1; this.lastPumpError = err instanceof Error ? err.message : String(err); }
      return;
    }
    if (!this.landmarker) return;
    const now = performance.now(); const t0 = now;
    try {
      const result = this.landmarker.detectForVideo(video, now);
      this.acceptResult((result.landmarks ?? []).map((landmarks, i) => ({ landmarks: landmarks.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 })), handedness: result.handedness?.[i]?.[0]?.categoryName ?? 'Unknown', confidence: result.handedness?.[i]?.[0]?.score ?? 0 })), now, performance.now() - t0, performance.now() - now);
    } catch (err) { this.pumpErrorCount += 1; this.lastPumpError = err instanceof Error ? err.message : String(err); }
  }

  private handleWorkerMessage(message: WorkerMessage): void {
    if (message.type === 'result') {
      if (!this.running) return;
      this.workerBusy = false;
      this.pumpErrorCount = 0;
      this.acceptResult(message.hands, message.timestampMs, message.inferenceMs, message.captureAgeMs);
      return;
    }

    if (message.type === 'track-error') {
      // Worker loaded correctly but cannot consume MediaStreamTrackProcessor
      // on this browser. Fall back to the older VideoFrame worker path, still
      // keeping MediaPipe inference off the UI thread.
      this.workerOwnsTrack = false;
      const video = this.video;
      if (this.running && video && video.requestVideoFrameCallback && typeof VideoFrame !== 'undefined') {
        const schedule = (): void => {
          if (!this.running || !this.video || !video.requestVideoFrameCallback) return;
          this.videoFrameCallbackHandle = video.requestVideoFrameCallback((now) => {
            if (!this.running) return;
            if (now - this.lastSubmittedAt >= this.getTargetIntervalMs()) this.pump(now);
            schedule();
          });
        };
        schedule();
      }
      this.pumpErrorCount += 1;
      this.lastPumpError = message.message;
      return;
    }

    if (message.type === 'pump-error') {
      this.workerBusy = false;
      this.pumpErrorCount += 1;
      this.lastPumpError = message.message;
    }
  }

  private getTargetIntervalMs(): number { return this.requestedIntervalMs !== null ? this.requestedIntervalMs : this.baseIntervalMs; }

  private acceptResult(hands: TrackedHand[], timestampMs: number, inferenceMs: number, captureAgeMs = 0): void {
    this.detectionCount += 1;
    this.detectionTotalMs += inferenceMs;
    if (this.detectionCount > 30) {
      this.detectionCount = Math.floor(this.detectionCount / 2);
      this.detectionTotalMs /= 2;
    }

    this.latest = { hands, timestampMs, captureAgeMs: Math.max(0, captureAgeMs) };
    if (!this.latest) return;

    // Landmarks are compact enough to compare on the main thread. A sub-pixel
    // threshold suppresses duplicate/noise-only results so the renderer is
    // not woken for frames that produce no visible interaction change.
    let signature = String(hands.length);
    for (const hand of hands) {
      for (const p of hand.landmarks) {
        signature += ',' + Math.round(p.x * 2000);
        signature += ',' + Math.round(p.y * 2000);
        signature += ',' + Math.round(p.z * 1000);
      }
    }
    if (signature === this.lastResultSignature) return;
    this.lastResultSignature = signature;
    this.onResult?.();
  }
}