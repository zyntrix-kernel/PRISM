import type { PresetId } from './presets/types';

// Central tunable constants for PRISM. Performance-sensitive values live here
// so the exhibition build can be tuned without hunting through the renderer.
// This configuration is intentionally mutable: gesture calibration adapts the
// pinch thresholds at runtime, so a deep `as const` would make a real feature
// fight the type system.
export const PrismConfig = {
  tracking: {
    localModelUrl: './models/hand_landmarker.task',
    cdnModelUrl: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    wasmUrl: './wasm',
    cdnWasmUrl: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm',
    numHands: 2,
    minHandDetectionConfidence: 0.3,
    minHandPresenceConfidence: 0.3,
    minTrackingConfidence: 0.3,
    intervalMs: 45,
    tabletIntervalMs: 40,
  },

  camera: {
    idealWidth: 640,
    idealHeight: 480,
    maxWidth: 640,
    maxHeight: 480,
    maxFrameRate: 30,
    tabletIdealWidth: 768,
    tabletIdealHeight: 576,
  },

  gestures: {
    pinchEnter: 0.36,
    pinchExit: 0.55,
    pinchMinFrames: 1,
    pinchEnterMs: 0,
    pinchExitMs: 90,
    extendedRatio: 1.10,
  },

  interaction: {
    pointerAdaptive: {
      maxSpeed: 4.0,
      slowCutoff: 0.42,
      fastCutoff: 3.4,
      betaBase: 0.08,
      betaRate: 0.07,
      maxLeadSec: 0.12,
      maxLeadDist: 0.055,
    },
    grabSmoothing: 0.56,
    tabletGrabSmoothing: 0.48,
    tabletOrbitSpeed: 0.0038,
    tabletPanSpeed: 0.0030,
    tabletZoomSpeed: 2.2,
    zoomSpeed: 2.5,
    rotateSpeed: 0.6,
    worldScaleMin: 0.4,
    worldScaleMax: 3.0,
    gridSnap: 0.6,
    hoverRadius: 0.12,
    hoverClearMs: 150,
    coastMs: 500,
    tapMaxMs: 700,
    tapMaxMove: 0.08,
  },

  cameraRig: {
    orbitSpeed: 0.0045,
    panSpeed: 0.0035,
    zoomFactor: 0.0012,
    minDistance: 2,
    maxDistance: 200,
    autoRotateSpeed: 0.15,
  },

  bloom: {
    strength: 0.75,
    radius: 0.5,
    threshold: 0.85,
  },

  preset: 'space' as PresetId,

  ai: {
    modelId: 'onnx-community/FastVLM-0.5B-ONNX',
    intervalMs: 3000,
    frameWidth: 448,
    maxTokens: 96,
  },

  quality: {
    ultra: { pixelRatio: 1.75 },
    high: { pixelRatio: 1.5 },
    medium: { pixelRatio: 1.15 },
    low: { pixelRatio: 0.85 },
    tablet: { pixelRatio: 1.35 },
  } as Record<string, { pixelRatio: number }>,
};

export type QualityTier = 'ultra' | 'high' | 'medium' | 'low';
