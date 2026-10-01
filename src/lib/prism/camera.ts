// Webcam acquisition with performance-aware constraints and graceful errors.

import { PrismConfig } from './config';
import { isAndroidWebView, isTabletDevice } from './device';

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
  } catch {}
  return typeof err === 'object' && err !== null ? 'unknown error (unserializable)' : String(err);
}

/** Requests the webcam with a deliberately bounded capture workload. */
export async function startCamera(video: HTMLVideoElement): Promise<CameraHandle> {
  if (typeof window !== 'undefined' && window.isSecureContext === false) throw new Error('Camera requires HTTPS (or localhost).');
  if (!('mediaDevices' in navigator) || !navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not support camera access.');

  const android = isAndroidWebView();
  const tablet = isTabletDevice();
  const targetWidth = android ? Math.min(PrismConfig.camera.idealWidth, 360) : PrismConfig.camera.idealWidth;
  const targetHeight = android ? Math.min(PrismConfig.camera.idealHeight, 270) : PrismConfig.camera.idealHeight;
  const targetFps = android ? 24 : (tablet ? PrismConfig.camera.tabletMaxFrameRate : PrismConfig.camera.maxFrameRate);

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'user' },
        width: { ideal: targetWidth, max: targetWidth },
        height: { ideal: targetHeight, max: targetHeight },
        aspectRatio: { ideal: 4 / 3 },
        frameRate: { ideal: targetFps, max: targetFps },
      },
      audio: false,
    });
  } catch (err) {
    const name = (err as { name?: unknown })?.name;
    const hint = name === 'NotAllowedError' || name === 'SecurityError'
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
    try { videoTrack.contentHint = 'motion'; } catch {}
  }

  try { await video.play(); }
  catch {
    await new Promise((resolve) => setTimeout(resolve, 120));
    try { await video.play(); } catch {}
  }

  const pollStart = performance.now();
  const POLL_TIMEOUT_MS = 15_000;
  const POLL_INTERVAL_MS = 50;
  await new Promise<void>((resolve, reject) => {
    const check = (): void => {
      if (video.readyState >= 2 && video.videoWidth > 0) return resolve();
      const track = stream.getVideoTracks()[0];
      const elapsed = performance.now() - pollStart;
      if (track?.readyState === 'live' && elapsed > 3000 && video.readyState >= 1) return resolve();
      if (elapsed > POLL_TIMEOUT_MS) return reject(new Error(`Camera stream started but no frames arrived within ${POLL_TIMEOUT_MS / 1000}s.`));
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
    stop() { stream.getTracks().forEach((t) => t.stop()); video.srcObject = null; },
  };
}
