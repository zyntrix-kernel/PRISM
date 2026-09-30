import type { PresetId } from './presets/types';

// Central tunable constants for PRISM. Performance-sensitive values live here
// so the exhibition build can be tuned without hunting through the renderer.
export const PrismConfig = {
  tracking: {
    localModelUrl: './models/hand_landmarker.task',
    cdnModelUrl: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    wasmUrl: './wasm',
    cdnWasmUrl: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm',
    // Two hands are required for PRISM's two-hand transforms. Vision sampling
    // is intentionally much slower than display rendering and now runs in a
    // worker on supported browsers.
    numHands: 2,
    minHandDetectionConfidence: 0.3,
    minHandPresenceConfidence: 0.3,
    minTrackingConfidence: 0.3,
    intervalMs: 100,
    tabletIntervalMs: 66,
  },

  camera: {
    // Hard camera ceiling. The hand model does not benefit enough from a
    // phone's 1080p/4K stream to justify the additional capture bandwidth.
    idealWidth: 640,
    idealHeight: 480,
    maxWidth: 640,
    maxHeight: 480,
    maxFrameRate: 30,
  },

  gestures: {
    pinchEnter: 0.36,
    pinchExit: 0.55,
    pinchMinFrames: 1,
    pinchEnterMs: 0,
    pinchExitMs: 150,
    extendedRatio: 1.10,
  },

  interaction: {
    pointerAdaptive: {
      maxSpeed: 4.0,
      slowCutoff: 0.35,
      fastCutoff: 3.0,
      betaBase: 0.07,
      betaRate: 0.06,
      maxLeadSec: 0.10,
      maxLeadDist: 0.040,
    },
    grabSmoothing: 0.72,
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
    // Mobile is deliberately capped below native DPR. The camera experience
    // is a realtime interaction product, so stable frame time beats drawing
    // millions of extra pixels that the eye cannot use during motion.
    ultra: { pixelRatio: 1.75 },
    high: { pixelRatio: 1.5 },
    medium: { pixelRatio: 1.15 },
    low: { pixelRatio: 0.85 },
  } as Record<string, { pixelRatio: number }>,
};

export type QualityTier = 'ultra' | 'high' | 'medium' | 'low';
