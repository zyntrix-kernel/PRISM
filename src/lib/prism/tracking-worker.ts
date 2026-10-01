import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { PrismConfig } from './config';

interface InitMessage { type: 'init' }
interface FrameMessage { type: 'frame'; frame: VideoFrame; timestampMs: number }
type Message = InitMessage | FrameMessage;

let landmarker: HandLandmarker | null = null;

async function resolveModelUrls(): Promise<{ urls: string[]; offline: boolean }> {
  try {
    const probe = await fetch(PrismConfig.tracking.localModelUrl, { method: 'HEAD' });
    const type = probe.headers.get('content-type') ?? '';
    const length = Number(probe.headers.get('content-length') ?? '0');
    if (probe.ok && !type.includes('text/html') && length > 1_000_000) {
      return { urls: [PrismConfig.tracking.localModelUrl], offline: true };
    }
  } catch {
    // Continue to resilient remote sources.
  }
  return {
    urls: [PrismConfig.tracking.cdnModelUrl, PrismConfig.tracking.fallbackModelUrl],
    offline: false,
  };
}

async function init(): Promise<void> {
  const wasmUrls = [PrismConfig.tracking.wasmUrl, PrismConfig.tracking.cdnWasmUrl].filter((u, i, all) => u && all.indexOf(u) === i);
  let lastError: unknown = null;
  const { urls: modelUrls, offline } = await resolveModelUrls();

  for (const wasmUrl of wasmUrls) {
    try {
      const vision = await FilesetResolver.forVisionTasks(wasmUrl);
      for (const modelUrl of modelUrls) {
        for (const delegate of ['GPU', 'CPU'] as const) {
          try {
            landmarker = await HandLandmarker.createFromOptions(vision, {
              baseOptions: { modelAssetPath: modelUrl, delegate },
              runningMode: 'VIDEO',
              numHands: PrismConfig.tracking.numHands,
              minHandDetectionConfidence: PrismConfig.tracking.minHandDetectionConfidence,
              minHandPresenceConfidence: PrismConfig.tracking.minHandPresenceConfidence,
              minTrackingConfidence: PrismConfig.tracking.minTrackingConfidence,
            });
            self.postMessage({ type: 'ready', delegate, offline });
            return;
          } catch (err) { lastError = err; }
        }
      }
    } catch (err) { lastError = err; }
  }

  self.postMessage({ type: 'error', message: lastError instanceof Error ? lastError.message : String(lastError) });
}

self.onmessage = async (event: MessageEvent<Message>) => {
  const message = event.data;
  if (message.type === 'init') {
    await init();
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
