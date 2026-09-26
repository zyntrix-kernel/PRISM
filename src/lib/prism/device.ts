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
  isMobile: boolean;
  isWeakGpu: boolean;
  hasTouch: boolean;
  /** Recommended render tier (explicit ?quality= still wins). */
  tier: QualityTier;
}

const WEAK_GPU_PATTERNS = /swiftshader|llvmpipe|software|basic render|warp|softpipe|virgl/i;
const MOBILE_UA = /android|iphone|ipad|ipod|mobile|tablet/i;

export function classifyGpu(renderer: string | null): boolean {
  if (!renderer) return false; // unknown ≠ weak; FPS governor is the backstop
  return WEAK_GPU_PATTERNS.test(renderer);
}

export function recommendTier(env: {
  isMobile: boolean;
  gpuRenderer: string | null;
  hardwareConcurrency?: number | undefined;
  deviceMemoryGB?: number | undefined;
}): QualityTier {
  if (env.isMobile) return 'low';
  if (classifyGpu(env.gpuRenderer)) return 'low';
  const cores = env.hardwareConcurrency ?? 8;
  const mem = env.deviceMemoryGB ?? 8;
  if (cores <= 4 || mem <= 4) return 'low';
  if (cores >= 8 && mem >= 8) return 'high';
  return 'medium';
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
  const isMobile =
    MOBILE_UA.test(env.userAgent) || env.coarsePointer || Math.min(env.screenWidth, env.screenHeight) < 500;
  const isWeakGpu = classifyGpu(env.gpuRenderer);
  return {
    ...env,
    isMobile,
    isWeakGpu,
    hasTouch: env.maxTouchPoints > 0 || env.coarsePointer,
    tier: recommendTier({ ...env, isMobile }),
  };
}
