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
    //
    // TUNED FOR FORGIVING + STICKY GRABS:
    // - enter 0.30: fingers just need to be moderately close (not touching).
    //   Easier to trigger, especially at camera angles where depth is unclear.
    // - exit 0.48: wide hysteresis — once grabbed, small finger jitter won't
    //   release. The user must clearly open their hand to let go.
    // - minFrames 1 + enterMs 20: instant trigger (was 2 frames / 50ms — laggy).
    // - exitMs 120: must hold open for 120ms to release (stickier, no flicker).
    // Live value shown in the debug overlay for verification.
    pinchEnter: 0.30,
    pinchExit: 0.48,
    pinchMinFrames: 1,
    pinchEnterMs: 20,
    pinchExitMs: 120,
    // A finger counts as extended when tip is clearly farther from the
    // wrist than its PIP joint.
    extendedRatio: 1.12,
  },

  interaction: {
    // Adaptive hand pointer (see pointer.ts): the filter measures tracking
    // fps + undirected noise online and retunes itself, so a 10 fps noisy
    // feed holds still while a 120 fps clean feed stays wide open.
    pointerAdaptive: {
      maxSpeed: 3.5, // fastest plausible fingertip travel, NDC/sec
      slowCutoff: 0.42, // rest smoothing at very low tracking rates
      fastCutoff: 2.8, // rest smoothing at 60+ fps tracking
      betaBase: 0.09, // speed-opening base (lively fast motion)
      betaRate: 0.08, // extra opening that fades out on slow cameras
      maxLeadSec: 0.12, // latency-hiding prediction horizon cap
      maxLeadDist: 0.05, // prediction travel cap (can never fling)
    },
    // Smoothing factor for grabbed-object motion (higher = tighter follow,
    // more responsive to hand movement). Was 0.3 (floaty/disconnected);
    // bumped to 0.55 so grabbed objects feel glued to the fingertip.
    grabSmoothing: 0.55,
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
    // Hover must miss this long before un-highlighting (rate-independent).
    hoverClearMs: 120,
    // After tracking loss, keep the cursor alive this long (ms) instead of
    // blinking out instantly.
    coastMs: 350,
  },

  cameraRig: {
    orbitSpeed: 0.0052, // radians per pixel of drag
    panSpeed: 0.004,
    zoomFactor: 0.0012, // exponential dolly per wheel delta
    minDistance: 4,
    maxDistance: 120,
    autoRotateSpeed: 0.22, // rad/s when auto-orbit is on (O key)
    // Performance: the rig update is cheap but the renderer is the bottleneck.
    // These are just camera constants; perf is controlled by quality tiers.
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
