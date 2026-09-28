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
    // Pinch thresholds are normalized by hand size (wrist->middle-MCP), so
    // they work for adults, children, and varying camera distances.
    //
    // PREMIUM TUNING: forgiving + sticky + smooth.
    // - enter 0.40: fingers just need to be moderately close. Easier than
    //   a real pinch — reduces missed grabs on low-quality cameras.
    // - exit 0.62: very sticky. Once grabbed, the user must clearly open
    //   their hand. No accidental releases from finger jitter.
    // - minFrames 1 + enterMs 0: instant latch on the FIRST pinch frame.
    // - exitMs 250: must sustain "open" for 250ms — filters all glitches.
    pinchEnter: 0.40,
    pinchExit: 0.62,
    pinchMinFrames: 1,
    pinchEnterMs: 0,
    pinchExitMs: 250,
    extendedRatio: 1.10, // slightly more forgiving finger extension
  },

  interaction: {
    // Adaptive hand pointer: the filter measures tracking fps + undirected
    // noise online and retunes itself. Premium tuning = HEAVY smoothing.
    pointerAdaptive: {
      maxSpeed: 3.0,       // was 3.5 — slightly tighter gate
      slowCutoff: 0.10,    // ULTRA-HEAVY rest smoothing (kills all idle jitter)
      fastCutoff: 1.2,     // heavy at high fps too
      betaBase: 0.03,      // minimal speed-opening (no twitchiness)
      betaRate: 0.02,      // minimal extra opening
      maxLeadSec: 0.06,    // very short prediction (no overshoot)
      maxLeadDist: 0.018,  // very tight cap (no fling)
    },
    // Grabbed-object follow: higher = tighter (glued to fingertip).
    // 0.65 = responsive but still smooth (not robotic).
    grabSmoothing: 0.65,
    // Two-hand zoom: strong + smooth.
    zoomSpeed: 2.5,
    // Two-hand twist: gentle, prevents accidental rotation during zoom.
    rotateSpeed: 0.6,
    worldScaleMin: 0.4,
    worldScaleMax: 3.0,
    gridSnap: 0.6,
    // Grab assist: wider = easier to lock onto bodies.
    hoverRadius: 0.12,   // was 0.09 — even easier to grab
    hoverClearMs: 150,   // was 120 — hold hover a bit longer
    // After tracking loss, keep the cursor alive longer for smooth re-entry.
    coastMs: 500,        // was 350 — smoother re-entry
    // TAP DETECTION: generous for slow cameras.
    tapMaxMs: 700,       // was 600 — even more forgiving
    tapMaxMove: 0.08,    // was 0.06 — allows more drift
  },

  cameraRig: {
    // PREMIUM: slightly slower orbit for more controlled, cinematic feel.
    orbitSpeed: 0.0040,  // was 0.0052 — smoother orbit
    panSpeed: 0.003,     // was 0.004 — smoother pan
    zoomFactor: 0.0012,
    minDistance: 2,
    maxDistance: 200,
    // Slightly slower auto-rotate for a more cinematic drift.
    autoRotateSpeed: 0.15,  // was 0.22 — gentler
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
