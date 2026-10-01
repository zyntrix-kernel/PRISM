// Device awareness: pick sane defaults for whatever machine runs PRISM.
// Unknown exhibition hardware is the norm, so detection is conservative
// and interaction latency is prioritized while the camera is active.
import type { QualityTier } from './config';

export interface DeviceEnv {
  userAgent: string; hardwareConcurrency: number | undefined; deviceMemoryGB: number | undefined;
  maxTouchPoints: number; coarsePointer: boolean; screenWidth: number; screenHeight: number;
  gpuRenderer: string | null; prefersReducedMotion: boolean;
}
export interface DeviceInfo extends DeviceEnv {
  isMobile: boolean; isTablet: boolean; isWeakGpu: boolean; hasTouch: boolean; tier: QualityTier;
}
const WEAK_GPU_PATTERNS = /swiftshader|llvmpipe|software|basic render|warp|softpipe|virgl/i;
const TABLET_TOKEN = /ipad|tablet|playbook|silk/i;
export function classifyGpu(renderer: string | null): boolean { return !renderer ? false : WEAK_GPU_PATTERNS.test(renderer); }
export function detectTablet(env: { userAgent: string; maxTouchPoints: number; screenWidth: number; screenHeight: number }): boolean {
  const ua = env.userAgent.toLowerCase();
  if (env.maxTouchPoints <= 0) return false;
  if (Math.min(env.screenWidth, env.screenHeight) < 768) return false;
  return ua.includes('ipad') || (ua.includes('macintosh') && env.maxTouchPoints > 0) || (ua.includes('android') && !ua.includes('mobile')) || TABLET_TOKEN.test(ua);
}
export function isAndroidWebView(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes('android') && (ua.includes('wv') || ua.includes('version/4.0'));
}
export function recommendTier(env: { isMobile: boolean; isTablet: boolean; gpuRenderer: string | null; hardwareConcurrency?: number; deviceMemoryGB?: number; isWebView?: boolean }): QualityTier {
  // WebView has less rendering headroom than standalone Chrome. Reserve GPU
  // time for WebGL + camera compositing + MediaPipe rather than spending it on
  // excess scene pixels. This is especially important during hand interaction.
  if (env.isWebView) return 'low';
  if (env.isTablet) return 'medium';
  if (env.isMobile) return 'low';
  const cores = env.hardwareConcurrency ?? 8;
  const mem = env.deviceMemoryGB ?? 8;
  if (cores <= 1 || mem <= 2) return 'low';
  if (cores >= 4 && mem >= 8) return 'high';
  return 'medium';
}
export function isTabletDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { maxTouchPoints?: number };
  const ua = typeof nav.userAgent === 'string' ? nav.userAgent : '';
  const touchPoints = typeof nav.maxTouchPoints === 'number' ? nav.maxTouchPoints : 0;
  let sw = 0, sh = 0;
  try { if (typeof window !== 'undefined' && window.screen) { sw = window.screen.width || 0; sh = window.screen.height || 0; } } catch {}
  return detectTablet({ userAgent: ua, maxTouchPoints: touchPoints, screenWidth: sw, screenHeight: sh });
}
function readEnv(): DeviceEnv {
  const nav = (typeof navigator !== 'undefined' ? navigator : {}) as Record<string, unknown>;
  const ua = typeof nav.userAgent === 'string' ? nav.userAgent : '';
  const cores = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : undefined;
  const mem = typeof (nav as { deviceMemory?: unknown }).deviceMemory === 'number' ? (nav as { deviceMemory: number }).deviceMemory : undefined;
  const touchPoints = typeof nav.maxTouchPoints === 'number' ? nav.maxTouchPoints : 0;
  let coarse = false, reducedMotion = false, sw = 1920, sh = 1080;
  try {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      coarse = window.matchMedia('(pointer: coarse)').matches;
      reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    if (typeof window !== 'undefined' && window.screen) { sw = window.screen.width || sw; sh = window.screen.height || sh; }
  } catch {}
  return { userAgent: ua, hardwareConcurrency: cores, deviceMemoryGB: mem, maxTouchPoints: touchPoints, coarsePointer: coarse, screenWidth: sw, screenHeight: sh, gpuRenderer: readGpuRenderer(), prefersReducedMotion: reducedMotion };
}
function readGpuRenderer(): string | null {
  try {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas'); const gl = canvas.getContext('webgl') as WebGLRenderingContext | null;
    if (!gl) return null; const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return 'webgl-no-debug-info'; const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as unknown;
    return typeof renderer === 'string' ? renderer : 'webgl-unknown';
  } catch { return null; }
}
export function detectDevice(overrides: Partial<DeviceEnv> = {}): DeviceInfo {
  const env = { ...readEnv(), ...overrides }; const isTablet = detectTablet(env); const minDim = Math.min(env.screenWidth, env.screenHeight); const ua = env.userAgent.toLowerCase();
  const isPhone = !isTablet && (ua.includes('iphone') || (ua.includes('android') && ua.includes('mobile')) || (env.maxTouchPoints > 0 && minDim < 768));
  const isMobile = isTablet || isPhone || (env.coarsePointer && minDim < 768);
  const isWebView = isAndroidWebView();
  const isWeakGpu = classifyGpu(env.gpuRenderer) || isWebView;
  return { ...env, isMobile, isTablet, isWeakGpu, hasTouch: env.maxTouchPoints > 0 || env.coarsePointer, tier: recommendTier({ ...env, isMobile, isTablet, isWebView }) };
}
