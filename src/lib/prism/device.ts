// Device awareness: pick sane defaults for whatever machine runs PRISM.
// Unknown exhibition hardware is the norm, so detection is conservative
// (weak signals force Low) and every probe is wrapped — detection itself
// must never throw, even in headless/test environments.

import type { QualityTier } from './config';

export interface DeviceEnv {
  userAgent: string;
  hardwareConcurrency: number | undefined;
  deviceMemoryGB: number | undefined;
  maxTouchPoints: number;
  coarsePointer: boolean;
  screenWidth: number;
  screenHeight: number;
  gpuRenderer: string | null;
  prefersReducedMotion: boolean;
}

export interface DeviceInfo extends DeviceEnv {
  /** Any non-desktop touch device (phone OR tablet). Kept for UI labels. */
  isMobile: boolean;
  /** Tablet specifically (large touchscreen — iPad, Android tablet, etc).
   *  Tablets get the `high` tier by default: their GPUs outclass low-end
   *  exhibition PCs and they run at 60–120fps natively. */
  isTablet: boolean;
  isWeakGpu: boolean;
  hasTouch: boolean;
  /** Recommended render tier (explicit ?quality= still wins). */
  tier: QualityTier;
}

const WEAK_GPU_PATTERNS = /swiftshader|llvmpipe|software|basic render|warp|softpipe|virgl/i;
// UA tokens that announce a tablet form-factor (in addition to the
// iPad/Android-tablet logic in detectTablet). "Silk" = Kindle Fire;
// "PlayBook" = BlackBerry tablet. Most Android tablets simply send an
// Android UA *without* the "Mobile" token that phones always include.
const TABLET_TOKEN = /ipad|tablet|playbook|silk/i;

export function classifyGpu(renderer: string | null): boolean {
  if (!renderer) return false; // unknown ≠ weak; FPS governor is the backstop
  return WEAK_GPU_PATTERNS.test(renderer);
}

/** Tablet detection — exported so the tracking loop can pick a faster
 *  throttle without re-running the full device probe.
 *
 *  A device is a tablet when it has a touchscreen AND a large screen
 *  (>= 768px on its short side) AND its UA looks tablet-y (iPad,
 *  Android-without-Mobile, or iPadOS-13+-as-Mac). Touchscreen laptops
 *  with a fine pointer (maxTouchPoints usually 1–10 but pointer:fine)
 *  stay classified as desktops because the UA lacks the tablet tokens
 *  and they typically report `pointer: fine`. */
export function detectTablet(env: {
  userAgent: string;
  maxTouchPoints: number;
  screenWidth: number;
  screenHeight: number;
}): boolean {
  const ua = env.userAgent.toLowerCase();
  // No touch → not a tablet. (Touchscreen laptops have maxTouchPoints>0 too,
  // but their UA lacks tablet tokens, so they fall through to "desktop".)
  if (env.maxTouchPoints <= 0) return false;
  const minDim = Math.min(env.screenWidth, env.screenHeight);
  if (minDim < 768) return false; // phone-sized screen
  // iPad: explicit UA, OR iPadOS 13+ which reports as "Macintosh" + touch
  // (the only Macs with a touchscreen are iPads).
  const isIpad = ua.includes('ipad') || (ua.includes('macintosh') && env.maxTouchPoints > 0);
  // Android tablet: Android UA without "mobile" (phones always include it).
  const isAndroidTablet = ua.includes('android') && !ua.includes('mobile');
  // Other tablet tokens (PlayBook, Silk, generic "tablet" UA).
  const hasTabletToken = TABLET_TOKEN.test(ua);
  return isIpad || isAndroidTablet || hasTabletToken;
}

export function recommendTier(env: {
  isMobile: boolean;
  isTablet: boolean;
  gpuRenderer: string | null;
  hardwareConcurrency?: number | undefined;
  deviceMemoryGB?: number | undefined;
}): QualityTier {
  // Tablets: fast mobile GPUs (iPad Pro, Galaxy Tab S, Surface) routinely
  // outclass low-end exhibition PCs and run PRISM at 60–120fps. Give them
  // `high` (premium shaders + bloom + antialias) instead of `low`.
  if (env.isTablet) return 'high';
  // Phones stay low: small screens + thermal-constrained GPUs can't hold
  // the post-processing chain at interactive framerates.
  if (env.isMobile) return 'low';
  // NOTE: weak GPUs (SwiftShader, llvmpipe) no longer force 'low'.
  // They get 'medium' so premium shaders + post-processing render on
  // first paint. The FPS governor downgrades to 'low' if the frame rate
  // actually drops — initial visual quality wins over conservative gating.
  const cores = env.hardwareConcurrency ?? 8;
  const mem = env.deviceMemoryGB ?? 8;
  if (cores <= 1 || mem <= 2) return 'low';
  if (cores >= 4 && mem >= 8) return 'high';
  return 'medium';
}

/** Convenience: tablet check straight from the live navigator/window.
 *  Lightweight — does NOT probe WebGL (unlike detectDevice), so it's safe
 *  to call from hot paths like HandTracker.start(). Returns false in
 *  headless/test environments where navigator/window are absent. */
export function isTabletDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { maxTouchPoints?: number };
  const ua = typeof nav.userAgent === 'string' ? nav.userAgent : '';
  const touchPoints = typeof nav.maxTouchPoints === 'number' ? nav.maxTouchPoints : 0;
  let sw = 0;
  let sh = 0;
  try {
    if (typeof window !== 'undefined' && window.screen) {
      sw = window.screen.width || 0;
      sh = window.screen.height || 0;
    }
  } catch {
    /* headless/test: leave zero → detectTablet returns false (minDim<768) */
  }
  return detectTablet({ userAgent: ua, maxTouchPoints: touchPoints, screenWidth: sw, screenHeight: sh });
}

function readEnv(): DeviceEnv {
  const nav = (typeof navigator !== 'undefined' ? navigator : {}) as Record<string, unknown>;
  const ua = typeof nav.userAgent === 'string' ? nav.userAgent : '';
  const cores = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : undefined;
  const mem = typeof (nav as { deviceMemory?: unknown }).deviceMemory === 'number'
    ? (nav as { deviceMemory: number }).deviceMemory
    : undefined;
  const touchPoints = typeof nav.maxTouchPoints === 'number' ? nav.maxTouchPoints : 0;
  let coarse = false;
  let reducedMotion = false;
  let sw = 1920;
  let sh = 1080;
  try {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      coarse = window.matchMedia('(pointer: coarse)').matches;
      reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    if (typeof window !== 'undefined' && window.screen) {
      sw = window.screen.width || sw;
      sh = window.screen.height || sh;
    }
  } catch {
    /* headless/test: keep defaults */
  }
  return {
    userAgent: ua,
    hardwareConcurrency: cores,
    deviceMemoryGB: mem,
    maxTouchPoints: touchPoints,
    coarsePointer: coarse,
    screenWidth: sw,
    screenHeight: sh,
    gpuRenderer: readGpuRenderer(),
    prefersReducedMotion: reducedMotion,
  };
}

function readGpuRenderer(): string | null {
  try {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') as WebGLRenderingContext | null;
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return 'webgl-no-debug-info';
    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as unknown;
    return typeof renderer === 'string' ? renderer : 'webgl-unknown';
  } catch {
    return null;
  }
}

/** Full device picture (injectable env keeps this unit-testable). */
export function detectDevice(overrides: Partial<DeviceEnv> = {}): DeviceInfo {
  const env = { ...readEnv(), ...overrides };
  const isTablet = detectTablet(env);
  // A phone is a small touchscreen device with a phone UA (iPhone, or
  // Android-with-Mobile). Touchscreen laptops stay non-mobile because they
  // have fine pointers and desktop UAs. Tablets are handled above and
  // counted as mobile-class too (so the UI label says "mobile"/"tablet").
  const minDim = Math.min(env.screenWidth, env.screenHeight);
  const ua = env.userAgent.toLowerCase();
  const isPhone =
    !isTablet &&
    (ua.includes('iphone') ||
      (ua.includes('android') && ua.includes('mobile')) ||
      (env.maxTouchPoints > 0 && minDim < 768));
  const isMobile = isTablet || isPhone || (env.coarsePointer && minDim < 768);
  const isWeakGpu = classifyGpu(env.gpuRenderer);
  return {
    ...env,
    isMobile,
    isTablet,
    isWeakGpu,
    hasTouch: env.maxTouchPoints > 0 || env.coarsePointer,
    tier: recommendTier({ ...env, isMobile, isTablet }),
  };
}
