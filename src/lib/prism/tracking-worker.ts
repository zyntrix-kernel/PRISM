import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { PrismConfig } from './config';

interface InitMessage { type: 'init' }
interface FrameMessage { type: 'frame'; frame: VideoFrame; timestampMs: number }
interface TrackMessage { type: 'track'; track: MediaStreamTrack }
interface StopTrackMessage { type: 'stop-track' }
type Message = InitMessage | FrameMessage | TrackMessage | StopTrackMessage;

type TrackProcessorCtor = new (options: { track: MediaStreamTrack; maxBufferSize?: number }) => {
  readable: ReadableStream<VideoFrame>;
  discardedFrames?: number;
};

let landmarker: HandLandmarker | null = null;

async function fetchModel(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { cache: 'force-cache', redirect: 'follow' });
  if (!response.ok) throw new Error(`Model fetch failed (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 1_000_000) throw new Error(`Invalid hand model payload (${bytes.byteLength} bytes)`);
  return bytes;
}

async function resolveModel(): Promise<{ bytes: Uint8Array; offline: boolean }> {
  // Static-export deployment has no server route. Keep this worker fully
  // client-side and fall back through the same public model mirrors.
  const urls = [
    PrismConfig.tracking.localModelUrl,
    PrismConfig.tracking.cdnModelUrl,
    PrismConfig.tracking.fallbackModelUrl,
  ];
  let lastError: unknown = null;
  for (const [index, url] of urls.entries()) {
    try {
      return { bytes: await fetchModel(url), offline: index === 0 };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function init(): Promise<void> {
  const wasmUrls = [PrismConfig.tracking.wasmUrl, PrismConfig.tracking.cdnWasmUrl]
    .filter((u, i, all) => u && all.indexOf(u) === i);
  let lastError: unknown = null;
  let model: { bytes: Uint8Array; offline: boolean };

  try {
    model = await resolveModel();
  } catch (err) {
    self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    return;
  }

  for (const wasmUrl of wasmUrls) {
    try {
      const vision = await FilesetResolver.forVisionTasks(wasmUrl);
      for (const delegate of ['GPU', 'CPU'] as const) {
        try {
          landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetBuffer: model.bytes, delegate },
            runningMode: 'VIDEO',
            numHands: PrismConfig.tracking.numHands,
            minHandDetectionConfidence: PrismConfig.tracking.minHandDetectionConfidence,
            minHandPresenceConfidence: PrismConfig.tracking.minHandPresenceConfidence,
            minTrackingConfidence: PrismConfig.tracking.minTrackingConfidence,
          });

          // Warm the delegate once before the camera starts feeding real
          // frames. This moves shader/kernel compilation out of the first
          // interaction gesture, where a cold GPU can otherwise feel like
          // camera latency.
          try {
            const warmCanvas = new OffscreenCanvas(2, 2);
            const warmCtx = warmCanvas.getContext('2d');
            if (warmCtx) {
              warmCtx.fillRect(0, 0, 2, 2);
              const warmBitmap = warmCanvas.transferToImageBitmap();
              try {
                landmarker.detectForVideo(warmBitmap, 1);
              } finally {
                warmBitmap.close();
              }
            }
          } catch {
            // Warm-up is opportunistic; the detector remains usable if a
            // browser does not permit ImageBitmap/OffscreenCanvas in the
            // worker's MediaPipe path.
          }

          self.postMessage({ type: 'ready', delegate, offline: model.offline });
          return;
        } catch (err) { lastError = err; }
      }
    } catch (err) { lastError = err; }
  }

  self.postMessage({ type: 'error', message: lastError instanceof Error ? lastError.message : String(lastError) });
}

let trackSession = 0;
let currentTrack: MediaStreamTrack | null = null;
let currentReaderCancel: (() => void) | null = null;
let currentWakeInference: (() => void) | null = null;

async function runTrack(track: MediaStreamTrack, session: number): Promise<void> {
  currentTrack = track;
  let reader: ReadableStreamDefaultReader<VideoFrame> | null = null;
  let latestFrame: VideoFrame | null = null;
  let latestVersion = 0;
  let consumedVersion = 0;
  let readerDone = false;
  let wakeInference: (() => void) | null = null;
  let clockOffsetMs: number | null = null;

  currentReaderCancel = () => { void reader?.cancel(); };
  currentWakeInference = () => { wakeInference?.(); wakeInference = null; };

  try {
    const Processor = (globalThis as typeof globalThis & {
      MediaStreamTrackProcessor?: TrackProcessorCtor;
    }).MediaStreamTrackProcessor;
    if (!Processor) {
      self.postMessage({ type: 'track-error', message: 'MediaStreamTrackProcessor unavailable in worker' });
      return;
    }

    const processor = new Processor({ track, maxBufferSize: 1 });
    reader = processor.readable.getReader();

    // Keep draining the camera while inference is running. The previous
    // sequential read -> infer loop could leave the single buffered frame
    // older than the newest camera sample. Here we always retain ONLY the
    // newest frame and close the replaced frame immediately.
    const drainCamera = async (): Promise<void> => {
      try {
        while (session === trackSession) {
          const next = await reader!.read();
          if (next.done) break;
          const frame = next.value;
          if (session !== trackSession) {
            frame.close();
            break;
          }
          const mediaMs = frame.timestamp / 1000;
          const nowMs = performance.now();
          const observedOffset = nowMs - mediaMs;
          clockOffsetMs = clockOffsetMs === null
            ? observedOffset
            : clockOffsetMs + (observedOffset - clockOffsetMs) * 0.02;

          if (latestFrame) latestFrame.close();
          latestFrame = frame;
          latestVersion += 1;
          wakeInference?.();
          wakeInference = null;
        }
      } finally {
        readerDone = true;
        wakeInference?.();
        wakeInference = null;
      }
    };

    const inferNewest = async (): Promise<void> => {
      while (session === trackSession) {
        if (consumedVersion === latestVersion) {
          if (readerDone) break;
          await new Promise<void>((resolve) => { wakeInference = resolve; });
          continue;
        }

        const frame = latestFrame;
        latestFrame = null;
        consumedVersion = latestVersion;
        if (!frame) continue;

        const started = performance.now();
        try {
          if (!landmarker) throw new Error('Tracking worker is not initialized');
          const result = landmarker.detectForVideo(frame, frame.timestamp / 1000);
          const mediaMs = frame.timestamp / 1000;
          const captureNowEstimate = mediaMs + (clockOffsetMs ?? (started - mediaMs));
          const captureAgeMs = Math.max(0, performance.now() - captureNowEstimate);
          const hands = (result.landmarks ?? []).map((landmarks, i) => ({
            landmarks: landmarks.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 })),
            handedness: result.handedness?.[i]?.[0]?.categoryName ?? 'Unknown',
            confidence: result.handedness?.[i]?.[0]?.score ?? 0,
          }));
          self.postMessage({
            type: 'result',
            hands,
            timestampMs: mediaMs,
            captureAgeMs,
            inferenceMs: performance.now() - started,
          });
        } catch (err) {
          self.postMessage({ type: 'pump-error', message: err instanceof Error ? err.message : String(err) });
        } finally {
          frame.close();
        }
      }
    };

    await Promise.all([drainCamera(), inferNewest()]);
  } catch (err) {
    self.postMessage({ type: 'pump-error', message: err instanceof Error ? err.message : String(err) });
  } finally {
    // The active reader/inference paths own their frames. Any frame observed
    // during shutdown is closed in the drain loop before exit.
    try { await reader?.cancel(); } catch {}
    reader = null;
    if (currentReaderCancel) currentReaderCancel = null;
    if (currentWakeInference) currentWakeInference = null;
    track.stop();
    if (currentTrack === track) currentTrack = null;
  }
}
self.onmessage = async (event: MessageEvent<Message>) => {
  const message = event.data;
  if (message.type === 'init') {
    await init();
    return;
  }

  if (message.type === 'track') {
    trackSession += 1;
    currentTrack?.stop();
    void runTrack(message.track, trackSession);
    return;
  }

  if (message.type === 'stop-track') {
    trackSession += 1;
    currentReaderCancel?.();
    currentWakeInference?.();
    currentTrack?.stop();
    currentTrack = null;
    return;
  }

  if (message.type === 'frame') {
    const frame = message.frame;
    const started = performance.now();
    try {
      if (!landmarker) throw new Error('Tracking worker is not initialized');
      const result = landmarker.detectForVideo(frame, message.timestampMs);
      const hands = (result.landmarks ?? []).map((landmarks, i) => ({
        landmarks: landmarks.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 })),
        handedness: result.handedness?.[i]?.[0]?.categoryName ?? 'Unknown',
        confidence: result.handedness?.[i]?.[0]?.score ?? 0,
      }));
      self.postMessage({
        type: 'result',
        hands,
        timestampMs: message.timestampMs,
        captureAgeMs: 0,
        inferenceMs: performance.now() - started,
      });
    } catch (err) {
      self.postMessage({ type: 'pump-error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      frame.close();
    }
  }
};
