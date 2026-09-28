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
    // Detection-loop throttle. detectForVideo is SYNCHRONOUS and blocks
    // the main thread, so we cap the inference rate to leave the render
    // loop (rAF) headroom between detections.
    //   intervalMs       — 10fps (100ms): safe default for low-end PCs
    //                      where inference alone can take 80–150ms.
    //   tabletIntervalMs — 15fps (66ms): tablets (iPad Pro, Galaxy Tab S,
    //                      Surface) have faster CPUs than low-end PCs and
    //                      comfortably absorb the extra 5fps of inference.
    //                      HandTracker picks the right one via detectTablet().
    intervalMs: 100,
    tabletIntervalMs: 66,
  },

  camera: {
    // ADVISORY ONLY. startCamera() deliberately does NOT request a specific
    // resolution — asking for 320x240 caused "Camera unavailable" on
    // laptops whose webcams don't support that exact mode. The browser
    // picks its native resolution (usually 640x480 on laptops, 1280x720 on
    // tablets, 1920x1080 on phones) and the tracking throttle above keeps
    // inference cost bounded regardless. These fields are kept only as
    // documentation of the intended target resolutions per device class:
    //   - low-end PCs:  320x240 (browser usually delivers 640x480 anyway)
    //   - tablets:      640x480 (native, crisp for hand landmarking)
    //   - phones:       1280x720+ (cropped by the model internally)
    idealWidth: 640,
    idealHeight: 480,
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
    // Pixel-ratio caps per tier. `applyPixelRatio()` clamps
    // `window.devicePixelRatio` to these values — a 3x-retina tablet
    // rendering at full DPR would shred the GPU, so we cap.
    //
    // Tablet routing: detectTablet() (device.ts) maps iPads, Android
    // tablets, and iPadOS-13+-as-Mac to the `high` tier. Their GPUs
    // outclass low-end exhibition PCs and run PRISM at 60–120fps, so
    // they get premium shaders + bloom + MSAA. Phones still get `low`.
    ultra: { pixelRatio: 1.75 },
    // high: 1.5 → 1.75. Tablets have crisp high-DPI screens (iPad = 2x+,
    // Galaxy Tab S = 2.5x+); capping at 1.5 looked soft. 1.75 keeps
    // edges sharp under bloom + AA without overloading the fill rate.
    high: { pixelRatio: 1.75 },
    // medium: 1.25 → 1.5. Mid GPUs (modern integrated graphics, M1
    // MacBook Air baseline) handle 1.5x comfortably; 1.25 was leaving
    // sharpness on the table for no measurable FPS gain.
    medium: { pixelRatio: 1.5 },
    low: { pixelRatio: 1.0 },
  } as Record<string, { pixelRatio: number }>,
};

export type QualityTier = 'ultra' | 'high' | 'medium' | 'low';
