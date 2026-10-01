import type { PresetId } from './presets/types';

export const PrismConfig = {
  tracking: {
    localModelUrl: './models/hand_landmarker.task',
    cdnModelUrl: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    fallbackModelUrl: 'https://huggingface.co/Leo-TX/mediapipe-hand/resolve/main/hand_landmarker.task?download=true',
    wasmUrl: './wasm',
    cdnWasmUrl: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm',
    numHands: 2,
    minHandDetectionConfidence: 0.25,
    minHandPresenceConfidence: 0.25,
    minTrackingConfidence: 0.25,
    intervalMs: 16,
    tabletIntervalMs: 16,
  },
  camera: {
    idealWidth: 480, idealHeight: 360, maxWidth: 480, maxHeight: 360, maxFrameRate: 60,
    tabletIdealWidth: 480, tabletIdealHeight: 360,
  },
  gestures: {
    pinchEnter: 0.36, pinchExit: 0.55, pinchMinFrames: 1, pinchEnterMs: 0, pinchExitMs: 90, extendedRatio: 1.10,
  },
  interaction: {
    pointerAdaptive: { maxSpeed: 14, slowCutoff: 18, fastCutoff: 60, betaBase: 0.55, betaRate: 0.85, maxLeadSec: 0.06, maxLeadDist: 0.07 },
    grabSmoothing: 0.56, tabletGrabSmoothing: 0.48, tabletOrbitSpeed: 0.0038, tabletPanSpeed: 0.0030, tabletZoomSpeed: 2.2,
    zoomSpeed: 2.5, rotateSpeed: 0.6, worldScaleMin: 0.4, worldScaleMax: 3.0, gridSnap: 0.6, hoverRadius: 0.12,
    hoverClearMs: 150, coastMs: 500, tapMaxMs: 700, tapMaxMove: 0.08,
  },
  cameraRig: { orbitSpeed: 0.0045, panSpeed: 0.0035, zoomFactor: 0.0012, minDistance: 2, maxDistance: 200, autoRotateSpeed: 0.15 },
  bloom: { strength: 0.75, radius: 0.5, threshold: 0.85 },
  preset: 'space' as PresetId,
  models: {
    hand: { backend: 'mediapipe', precision: 'float16', hands: 2, maxInferenceFps: 60 },
    vision: { modelId: 'onnx-community/FastVLM-0.5B-ONNX', intervalMs: 3000, frameWidth: 448, maxTokens: 96 },
  },
  audio: { sfxEnabledByDefault: true, masterGain: 0.9 },
  ai: { modelId: 'onnx-community/FastVLM-0.5B-ONNX', intervalMs: 3000, frameWidth: 448, maxTokens: 96 },
  quality: {
    ultra: { pixelRatio: 1.5 }, high: { pixelRatio: 1.25 }, medium: { pixelRatio: 1.0 }, low: { pixelRatio: 0.75 }, tablet: { pixelRatio: 1.0 },
  } as Record<string, { pixelRatio: number }>,
};

export type QualityTier = 'ultra' | 'high' | 'medium' | 'low';
