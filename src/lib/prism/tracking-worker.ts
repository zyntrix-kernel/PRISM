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

async function runTrack(track: MediaStreamTrack, session: number): Promise<void> {
  currentTrack = track;
  try {
    const Processor = (globalThis as typeof globalThis & {
      MediaStreamTrackProcessor?: TrackProcessorCtor;
    }).MediaStreamTrackProcessor;
    if (!Processor) {
      self.postMessage({ type: 'pump-error', message: 'MediaStreamTrackProcessor unavailable in worker' });
      return;
    }

    // One-frame buffer is critical for interaction: when inference is slower
    // than the camera, the processor discards old frames rather than building
    // a latency queue. The next read is therefore as fresh as the platform
    // can provide.
    const processor = new Processor({ track, maxBufferSize: 1 });
    const reader = processor.readable.getReader();

    try {
      while (session === trackSession) {
        const next = await reader.read();
        if (next.done || session !== trackSession) break;
        const frame = next.value;
        const started = performance.now();
        try {
          if (!landmarker) throw new Error('Tracking worker is not initialized');
          const result = landmarker.detectForVideo(frame, frame.timestamp / 1000);
          const hands = (result.landmarks ?? []).map((landmarks, i) => ({
            landmarks: landmarks.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 })),
            handedness: result.handedness?.[i]?.[0]?.categoryName ?? 'Unknown',
            confidence: result.handedness?.[i]?.[0]?.score ?? 0,
          }));
          self.postMessage({
            type: 'result',
            hands,
            // VideoFrame.timestamp is microseconds; convert to milliseconds
            // so the main-thread interaction clock uses the actual capture
            // timeline rather than worker completion time.
            timestampMs: frame.timestamp / 1000,
            inferenceMs: performance.now() - started,
          });
        } catch (err) {
          self.postMessage({ type: 'pump-error', message: err instanceof Error ? err.message : String(err) });
        } finally {
          frame.close();
        }
      }
      reader.releaseLock();
    } catch (err) {
      self.postMessage({ type: 'pump-error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      track.stop();
      if (currentTrack === track) currentTrack = null;
    }
  } catch (err) {
    track.stop();
    if (currentTrack === track) currentTrack = null;
    self.postMessage({ type: 'pump-error', message: err instanceof Error ? err.message : String(err) });
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
      self.postMessage({ type: 'result', hands, timestampMs: message.timestampMs, inferenceMs: performance.now() - started });
    } catch (err) {
      self.postMessage({ type: 'pump-error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      frame.close();
    }
  }
};
