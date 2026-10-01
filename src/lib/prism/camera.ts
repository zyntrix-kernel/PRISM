// Webcam acquisition with performance-aware constraints and graceful errors.

import { PrismConfig } from './config';

export interface CameraHandle {
  stream: MediaStream;
  width: number;
  height: number;
  stop(): void;
}

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
    // Ignore unserializable errors.
  }
  return typeof err === 'object' && err !== null ? 'unknown error (unserializable)' : String(err);
}

/** Requests the webcam with a deliberately bounded capture workload. */
export async function startCamera(video: HTMLVideoElement): Promise<CameraHandle> {
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    throw new Error('Camera requires HTTPS (or localhost).');
  }
  if (!('mediaDevices' in navigator) || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser does not support camera access.');
  }

  let stream: MediaStream;
  try {
    // DO NOT ask the phone for its native 1080p/4K camera stream. Hand
    // landmarking only needs a modest image and the previous unconstrained
    // request allowed phones to feed far more pixels than PRISM could use.
    // Ideal/max constraints let the browser choose a supported mode while
    // putting a hard ceiling on the camera workload.
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'user' },
        width: { ideal: PrismConfig.camera.idealWidth, max: PrismConfig.camera.maxWidth },
        height: { ideal: PrismConfig.camera.idealHeight, max: PrismConfig.camera.maxHeight },
        aspectRatio: { ideal: 4 / 3 },
        frameRate: { ideal: PrismConfig.camera.maxFrameRate, max: PrismConfig.camera.maxFrameRate },
      },
      audio: false,
    });
  } catch (err) {
    const name = (err as { name?: unknown })?.name;
    const hint =
      name === 'NotAllowedError' || name === 'SecurityError'
        ? 'Camera blocked. Allow camera access and try again.'
        : name === 'NotFoundError' || name === 'DevicesNotFoundError'
          ? 'No camera found. Mouse control is still available.'
          : name === 'NotReadableError' || name === 'TrackStartError'
            ? 'Camera is in use by another app. Close it and try again.'
            : 'Mouse fallback remains available.';
    throw new Error(`${describeMediaError(err)} [${name ?? 'unknown'}]. ${hint}`);
  }

  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.srcObject = stream;
  const videoTrack = stream.getVideoTracks()[0];
  if (videoTrack && 'contentHint' in videoTrack) {
    try { videoTrack.contentHint = 'motion'; } catch { /* optional browser hint */ }
  }

  try {
    await video.play();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 120));
    try {
      await video.play();
    } catch {
      // Some WebViews resolve playback asynchronously after the stream starts.
    }
  }

  const pollStart = performance.now();
  const POLL_TIMEOUT_MS = 15_000;
  const POLL_INTERVAL_MS = 50;
  await new Promise<void>((resolve, reject) => {
    const check = (): void => {
      if (video.readyState >= 2 && video.videoWidth > 0) {
        resolve();
        return;
      }
      const track = stream.getVideoTracks()[0];
      const elapsed = performance.now() - pollStart;
      if (track?.readyState === 'live' && elapsed > 3000 && video.readyState >= 1) {
        resolve();
        return;
      }
      if (elapsed > POLL_TIMEOUT_MS) {
        reject(new Error(`Camera stream started but no frames arrived within ${POLL_TIMEOUT_MS / 1000}s.`));
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
