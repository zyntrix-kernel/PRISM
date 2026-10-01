import type { PresetId } from './presets/types';

// Central tunable constants for PRISM. Keep runtime-tuned values mutable: the
// gesture calibrator adapts thresholds per user/camera during a session.
export const PrismConfig = {
  tracking: {
    localModelUrl: './models/hand_landmarker.task',
    // Same-origin proxy is the primary network path. It avoids browser/network
    // restrictions that can block direct requests to Google's model host.
    modelProxyUrl: '/api/hand-model',
    cdnModelUrl: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    fallbackModelUrl: 'https://huggingface.co/Leo-TX/mediapipe-hand/resolve/main/hand_landmarker.task?download=true',
    wasmUrl: './wasm',
    cdnWasmUrl: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm',
    numHands: 2,
    minHandDetectionConfidence: 0.3,
    minHandPresenceConfidence: 0.3,
    minTrackingConfidence: 0.3,
    intervalMs: 30,
    tabletIntervalMs: 30,
  },
  camera: {
    idealWidth: 640, idealHeight: 480, maxWidth: 640, maxHeight: 480, maxFrameRate: 30,
    tabletIdealWidth: 640, tabletIdealHeight: 480,
  },
  gestures: {
    pinchEnter: 0.36, pinchExit: 0.55, pinchMinFrames: 1, pinchEnterMs: 0, pinchExitMs: 90, extendedRatio: 1.10,
  },
  interaction: {
    pointerAdaptive: { maxSpeed: 7.5, slowCutoff: 2.5, fastCutoff: 18, betaBase: 0.32, betaRate: 0.18, maxLeadSec: 0.035, maxLeadDist: 0.028 },
    grabSmoothing: 0.56, tabletGrabSmoothing: 0.48, tabletOrbitSpeed: 0.0038, tabletPanSpeed: 0.0030, tabletZoomSpeed: 2.2,
    zoomSpeed: 2.5, rotateSpeed: 0.6, worldScaleMin: 0.4, worldScaleMax: 3.0, gridSnap: 0.6, hoverRadius: 0.12,
    hoverClearMs: 150, coastMs: 500, tapMaxMs: 700, tapMaxMove: 0.08,
  },
  cameraRig: { orbitSpeed: 0.0045, panSpeed: 0.0035, zoomFactor: 0.0012, minDistance: 2, maxDistance: 200, autoRotateSpeed: 0.15 },
  bloom: { strength: 0.75, radius: 0.5, threshold: 0.85 },
  preset: 'space' as PresetId,
  models: {
    hand: { backend: 'mediapipe', precision: 'float16', hands: 2, maxInferenceFps: 30 },
    vision: { modelId: 'onnx-community/FastVLM-0.5B-ONNX', intervalMs: 3000, frameWidth: 448, maxTokens: 96 },
  },
  audio: { sfxEnabledByDefault: true, masterGain: 0.9 },
  ai: { modelId: 'onnx-community/FastVLM-0.5B-ONNX', intervalMs: 3000, frameWidth: 448, maxTokens: 96 },
  quality: {
    ultra: { pixelRatio: 1.75 }, high: { pixelRatio: 1.5 }, medium: { pixelRatio: 1.15 }, low: { pixelRatio: 0.85 }, tablet: { pixelRatio: 1.35 },
  } as Record<string, { pixelRatio: number }>,
};

export type QualityTier = 'ultra' | 'high' | 'medium' | 'low';
