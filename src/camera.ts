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
    throw new Error(
      `Camera unavailable: ${
        err instanceof Error ? err.message : String(err)
      }. You can still try the mouse fallback (move = point, hold = grab).`,
    );
  }

  video.srcObject = stream;
  video.muted = true;
  try {
    await withTimeout(
      video.play().catch(() => {
        /* autoplay policies vary; canplay listener below still resolves */
      }),
      8000,
      'Camera playback',
    );
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error(
      `Camera started but video never played (${err instanceof Error ? err.message : String(err)}).`,
    );
  }
  try {
    await withTimeout(
      new Promise<void>((resolve) => {
        if (video.readyState >= 2 && video.videoWidth > 0) {
          resolve();
          return;
        }
        const onCanPlay = (): void => {
          video.removeEventListener('canplay', onCanPlay);
          resolve();
        };
        video.addEventListener('canplay', onCanPlay);
      }),
      8000,
      'Camera first frame',
    );
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error(
      `Camera produced no frames (${err instanceof Error ? err.message : String(err)}).`,
    );
  }

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
