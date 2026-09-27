// Webcam acquisition with graceful errors. Kept separate from tracking so
// camera failures (no device, permission denied) surface as friendly UI
// messages instead of silent tracking loss.

import { PrismConfig } from './config';

export interface CameraHandle {
  stream: MediaStream;
  width: number;
  height: number;
  stop(): void;
}

/**
 * Human-readable form for getUserMedia/play/model-load rejections.
 * Duck-types instead of instanceof: rejections cross realms and library
 * boundaries (DOMException, ProgressEvent, wrapped errors), where class
 * checks silently fail and String() yields "[object Event]".
 */
export function describeMediaError(err: unknown): string {
  if (typeof err === 'string' && err) return err;
  if (err && typeof err === 'object') {
    const rec = err as Record<string, unknown>;
    if (typeof rec.message === 'string' && rec.message) return rec.message;
    if (typeof rec.type === 'string') return `media event '${rec.type}' with no details`;
  }
  if (err instanceof Error && err.message) return err.message;
  try {
    const json = JSON.stringify(err);
    if (json && json !== '{}') return json;
  } catch {
    /* unserializable (circular refs): fall through to the safe label */
  }
  return typeof err === 'object' && err !== null ? 'unknown error (unserializable)' : String(err);
}

/** Rejects if the promise doesn't settle within ms (hung camera drivers exist). */
function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Requests the webcam and attaches it to the given video element. */
export async function startCamera(video: HTMLVideoElement): Promise<CameraHandle> {
  if (!('mediaDevices' in navigator) || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser does not support camera access (mediaDevices API missing).');
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: PrismConfig.camera.idealWidth },
        height: { ideal: PrismConfig.camera.idealHeight },
        facingMode: 'user',
      },
      audio: false,
    });
  } catch (err) {
    // Permission denial gets actionable guidance (the #1 expo failure);
    // everything else keeps the generic fallback path.
    const name = (err as { name?: unknown })?.name;
    const hint =
      name === 'NotAllowedError' || name === 'SecurityError'
        ? 'Camera blocked: click the camera icon in the address bar, choose Allow, then press Enable camera again. Until then the mouse works fully.'
        : 'You can still try the mouse fallback (move = point, hold = grab).';
    throw new Error(`Camera unavailable: ${describeMediaError(err)}. ${hint}`);
  }

  // CRITICAL: set all autoplay-required properties BEFORE assigning the stream.
  // If these are set after srcObject, some browsers fire canplay/loadeddata
  // events before the properties take effect, causing the readyState check
  // to fail and the camera to appear "unavailable" even when permission is granted.
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.srcObject = stream;

  // Try to play — this returns a promise that can reject due to autoplay
  // policy, but since we set muted=true, it should succeed. Don't timeout
  // on play() itself; just catch and continue to the readyState poll below.
  try {
    await video.play().catch(() => {
      /* autoplay rejection — the polling loop below will still detect
         frames once the browser decides to start playback */
    });
  } catch {
    /* fall through to polling */
  }

  // Poll for readyState instead of relying on a single canplay event.
  // The canplay event can fire BEFORE we attach the listener (race condition),
  // or never fire on some browsers/drivers. Polling is reliable.
  const pollStart = performance.now();
  const POLL_TIMEOUT_MS = 12_000; // 12s — generous for slow camera init
  const POLL_INTERVAL_MS = 50;
  await new Promise<void>((resolve, reject) => {
    const check = (): void => {
      if (video.readyState >= 2 && video.videoWidth > 0) {
        resolve();
        return;
      }
      if (performance.now() - pollStart > POLL_TIMEOUT_MS) {
        reject(new Error(`Camera stream started but no frames arrived within ${POLL_TIMEOUT_MS / 1000}s (readyState=${video.readyState}, videoWidth=${video.videoWidth}).`));
        return;
      }
      setTimeout(check, POLL_INTERVAL_MS);
    };
    check();
  }).catch((err) => {
    stream.getTracks().forEach((t) => t.stop());
    throw err instanceof Error ? err : new Error(String(err));
  });

  const track = stream.getVideoTracks()[0];
  const settings = track?.getSettings();
  return {
    stream,
    width: settings?.width ?? video.videoWidth,
    height: settings?.height ?? video.videoHeight,
    stop() {
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
}
