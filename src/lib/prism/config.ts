import type { PresetId } from './presets/types';

// Central tunable constants for PRISM. All magic numbers live here so the
// interaction can be calibrated without hunting through module code.

export const PrismConfig = {
  tracking: {
    // Fully offline-capable: the wasm runtime and model ship in
    // public/wasm and public/models (via `npm run vendor:offline`).
    // Every local URL has a CDN fallback so a missing vendor step degrades
    // to online mode instead of killing hand tracking outright.
    localModelUrl: './models/hand_landmarker.task',
    cdnModelUrl:
      'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    wasmUrl: './wasm',
    cdnWasmUrl: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm',
    // numHands 2: we need 2 hands for zoom/rotate gestures. MediaPipe
    // inference with 2 hands takes 200-300ms — too slow for 60fps. The
    // tracking loop is throttled to 10fps (100ms interval) so each
    // detection has plenty of CPU time and the render loop stays smooth.
    numHands: 2,
    // LOWERED confidence thresholds for low-quality cameras.
    minHandDetectionConfidence: 0.3,
    minHandPresenceConfidence: 0.3,
    minTrackingConfidence: 0.3,
  },

  camera: {
    // 320x240: MINIMAL resolution to keep MediaPipe inference fast.
    // 2-hand inference at 640x480 = ~150ms; at 320x240 = ~80ms.
    // The render loop needs <16ms per frame to stay at 60fps, so every
    // millisecond of inference saved matters. 320x240 is enough for hand
    // tracking — MediaPipe's model was trained on low-res input anyway.
    idealWidth: 320,
    idealHeight: 240,
  },

  gestures: {
    // NATURAL FEEL: responsive + forgiving + sticky.
    // - enter 0.36: fingers moderately close (easier than a real pinch)
    // - exit 0.55: sticky enough to survive jitter, releases when you open
    // - exitMs 150: quick release (250 felt delayed)
    pinchEnter: 0.36,
    pinchExit: 0.55,
    pinchMinFrames: 1,
    pinchEnterMs: 0,
    pinchExitMs: 150,
    extendedRatio: 1.10,
  },

  interaction: {
    // NATURAL POINTER: the cursor should feel like a direct extension of
    // the hand — 1:1 mapping with just enough smoothing to kill jitter.
    pointerAdaptive: {
      maxSpeed: 4.0,       // wider gate — allow fast flicks
      slowCutoff: 0.35,    // lighter rest smoothing (was 0.20 — too heavy, felt disconnected)
      fastCutoff: 3.0,     // responsive at high fps (was 2.0 — too heavy)
      betaBase: 0.07,      // more speed-opening (was 0.05 — felt sluggish on fast moves)
      betaRate: 0.06,      // more extra opening
      maxLeadSec: 0.10,    // more prediction (was 0.08 — felt disconnected on slow cams)
      maxLeadDist: 0.040,  // wider cap (was 0.030 — too tight)
    },
    // Grabbed objects: tight follow, glued to fingertip.
    // 0.72 = very responsive (was 0.65 — slightly floaty)
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
    // NATURAL ORBIT: responsive but smooth. Rate 10 = steadicam with
    // slight inertia (was 8 — slightly laggy on orbit stop).
    orbitSpeed: 0.0045,  // was 0.0040 — slightly snappier
    panSpeed: 0.0035,   // was 0.003 — slightly snappier
    zoomFactor: 0.0012,
    minDistance: 2,
    maxDistance: 200,
    autoRotateSpeed: 0.15,
  },

  bloom: {
    // Premium cinematic bloom — tuned down so bright presets (singularity
    // black hole, supernova) stay readable instead of washing out to white.
    // Threshold raised so only the truly bright pixels (sun core, photon
    // ring, jet cores) catch the glow; mid-tone emissive bodies stay crisp.
    strength: 0.75,
    radius: 0.5,
    threshold: 0.85,
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
    ultra: { pixelRatio: 1.75 },
    high: { pixelRatio: 1.5 },
    medium: { pixelRatio: 1.25 },
    low: { pixelRatio: 1.0 },
  } as Record<string, { pixelRatio: number }>,
};

export type QualityTier = 'ultra' | 'high' | 'medium' | 'low';
