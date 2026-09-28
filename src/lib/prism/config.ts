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
    // TUNED FOR LOW-QUALITY CAMERAS (5-10 fps):
    // - enter 0.38: VERY forgiving. Fingers just need to be somewhat close.
    //   On a 10fps camera, the pinch frame might be the only one captured —
    //   a tight threshold would miss it entirely.
    // - exit 0.58: VERY sticky. Once grabbed, even large finger separation
    //   won't release (slow cameras have jerky landmark data — a momentary
    //   "open" reading shouldn't drop the grab).
    // - minFrames 1 + enterMs 0: instant latch on the FIRST pinch frame.
    //   On a slow camera, you can't afford to wait for a 2nd confirmation
    //   frame — it might never come.
    // - exitMs 200: must see "open" for 200ms sustained to release. This
    //   filters out single-frame landmark glitches on slow cameras.
    // Live value shown in the debug overlay for verification.
    pinchEnter: 0.38,
    pinchExit: 0.58,
    pinchMinFrames: 1,
    pinchEnterMs: 0,
    pinchExitMs: 200,
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
      slowCutoff: 0.15, // HEAVY rest smoothing (was 0.25 — still jittery on bad cams)
      fastCutoff: 1.5,  // heavier at high fps (was 2.2)
      betaBase: 0.04,   // less speed-opening (was 0.06)
      betaRate: 0.03,   // less extra opening (was 0.05)
      maxLeadSec: 0.08, // shorter prediction (was 0.10 — led to overshoot)
      maxLeadDist: 0.025, // tighter cap (was 0.035)
    },
    // Smoothing factor for grabbed-object motion (higher = tighter follow,
    // more responsive to hand movement). Was 0.3 (floaty/disconnected);
    // bumped to 0.55 so grabbed objects feel glued to the fingertip.
    grabSmoothing: 0.55,
    // Two-hand zoom sensitivity. Lower = more hand movement needed = finer
    // control. 1.0 maps 1:1 (hands double apart = camera half the distance).
    zoomSpeed: 1.0,
    // Two-hand twist sensitivity (radians of scene rotation per radian).
    rotateSpeed: 0.8,
    worldScaleMin: 0.4,
    worldScaleMax: 3.0,
    // Voxel preset: drag snap grid (scene units).
    gridSnap: 0.6,
    // Grab assist: near-misses within this NDC radius snap to the body.
    hoverRadius: 0.09, // wider (was 0.07) — easier to lock onto bodies
    // Hover must miss this long before un-highlighting (rate-independent).
    hoverClearMs: 120,
    // After tracking loss, keep the cursor alive this long (ms) instead of
    // blinking out instantly.
    coastMs: 350,
    // TAP DETECTION: a quick pinch (down + up within tapMaxMs) fires a
    // 'tap' action — separate from grab. This makes clicking UI / shooting
    // feel instant without needing to hold the pinch.
    // On a slow 10fps camera, a "quick" pinch might span 300-500ms of wall
    // time (even if the physical pinch was fast) because frames are sparse.
    // tapMaxMs 600 + tapMaxMove 0.06 accommodate this.
    tapMaxMs: 600, // pinch must release within 600ms to count as a tap
    tapMaxMove: 0.06, // pinch point can drift up to 6% of screen (slow cam jitter)
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
