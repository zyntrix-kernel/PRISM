import type { PresetId } from './presets/types';

// Central tunable constants for PRISM. All magic numbers live here so the
// interaction can be calibrated without hunting through module code.

export const PrismConfig = {
  tracking: {
    // Local override first (put hand_landmarker.task in public/models/ for
    // fully-offline use), otherwise fall back to the public CDN model.
    localModelUrl: './models/hand_landmarker.task',
    cdnModelUrl:
      'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    wasmUrl: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm',
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  },

  camera: {
    idealWidth: 1280,
    idealHeight: 720,
  },

  gestures: {
    // Pinch thresholds are normalized by hand size (wrist->middle-MCP), so
    // they work for adults, children, and varying camera distances.
    // Calibrated so a real thumb-index touch (~0.05-0.15) grabs, while
    // fingers held visibly apart (>0.32) never do. Live value shown in
    // the debug overlay for verification.
    pinchEnter: 0.22,
    pinchExit: 0.32,
    // Consecutive-frame debounce guards against single-frame flicker.
    pinchEnterFrames: 3,
    pinchExitFrames: 3,
    // A finger counts as extended when tip is clearly farther from the
    // wrist than its PIP joint.
    extendedRatio: 1.12,
  },

  interaction: {
    // One Euro adaptive pointer filter: heavy smoothing at rest (no jitter),
    // wide open during fast motion (no lag).
    pointerMinCutoff: 1.1,
    pointerBeta: 0.03,
    pointerDcutoff: 1.0,
    // Smoothing factor for grabbed-object motion (lower = floatier).
    grabSmoothing: 0.3,
    // Two-hand zoom sensitivity.
    zoomSpeed: 1.6,
    // Two-hand twist sensitivity (radians of scene rotation per radian).
    rotateSpeed: 1.0,
    worldScaleMin: 0.4,
    worldScaleMax: 3.0,
    // Voxel preset: drag snap grid (scene units).
    gridSnap: 0.6,
    // Grab assist: near-misses within this NDC radius snap to the body.
    hoverRadius: 0.07,
    // Hover must miss this many consecutive frames before un-highlighting.
    hoverMissFrames: 3,
    // After tracking loss, keep the cursor alive this long (ms) instead of
    // blinking out instantly.
    coastMs: 350,
  },

  cameraRig: {
    orbitSpeed: 0.0052, // radians per pixel of drag
    panSpeed: 0.004,
    zoomFactor: 0.0012, // exponential dolly per wheel delta
    minDistance: 4,
    maxDistance: 34,
    autoRotateSpeed: 0.22, // rad/s when auto-orbit is on (O key)
  },

  bloom: {
    strength: 0.85,
    radius: 0.55,
    threshold: 0.78,
  },

  preset: 'space' as PresetId,

  ai: {
    // FastVLM-0.5B via Transformers.js + WebGPU, in a Web Worker.
    // Off by default; enable with the AI button or ?ai=1.
    modelId: 'onnx-community/FastVLM-0.5B-ONNX',
    intervalMs: 3000,
    frameWidth: 448,
    maxTokens: 96,
  },

  quality: {
    high: { pixelRatio: 2.0 },
    medium: { pixelRatio: 1.5 },
    low: { pixelRatio: 1.0 },
  } as Record<string, { pixelRatio: number }>,
};

export type QualityTier = 'high' | 'medium' | 'low';
