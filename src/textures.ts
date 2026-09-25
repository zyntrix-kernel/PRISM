// Procedural planet textures: seeded value-noise painted onto canvases.
//
// Why procedural instead of downloaded NASA textures:
// - zero network dependency (works offline, exhibition-safe),
// - zero licensing questions (100% original pixels),
// - generated once (~100 ms total), then free forever.
// High quality tier maps these onto the planets; lower tiers use flat
// colors for speed.

import * as THREE from 'three';

/** Deterministic RNG so every run paints the same planets. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type PixelFn = (u: number, v: number, rand: () => number) => [number, number, number];

function paintCanvas(w: number, h: number, seed: number, fn: PixelFn): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const img = ctx.createImageData(w, h);
  const rand = mulberry32(seed);
  // Pre-roll so u/v loops stay deterministic regardless of call order.
  const jitter = new Float32Array(w * h);
  for (let i = 0; i < jitter.length; i++) jitter[i] = rand();
  let p = 0;
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    for (let x = 0; x < w; x++, p++) {
      // Wrap u so the texture has no visible seam at the date line.
      const u = x / w;
      const [r, g, b] = fn(u, v, () => jitter[p]);
      const o = p * 4;
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Smooth grid noise with seamless horizontal wrapping. */
function makeNoise2D(seed: number, cells: number): (u: number, v: number) => number {
  const rand = mulberry32(seed);
  const perm = new Float32Array(cells * cells);
  for (let i = 0; i < perm.length; i++) perm[i] = rand();
  const at = (ix: number, iy: number): number => {
    const cx = ((ix % cells) + cells) % cells; // wrap longitude
    const cy = Math.min(cells - 1, Math.max(0, iy)); // clamp latitude
    return perm[cy * cells + cx];
  };
  return (u: number, v: number) => {
    const x = u * cells;
    const y = v * cells;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(ix, iy);
    const b = at(ix + 1, iy);
    const c = at(ix, iy + 1);
    const d = at(ix + 1, iy + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

/** Fractal Brownian motion from stacked noise octaves (doubling wrap cells). */
function fbm(seed: number, u: number, v: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let cells = 4;
  for (let o = 0; o < octaves; o++) {
    sum += amp * makeNoise2D(seed + o * 101, cells)(u, v);
    amp *= 0.5;
    cells *= 2;
  }
  return sum;
}

function toTex(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface PlanetTextureSet {
  mercury: THREE.CanvasTexture;
  venus: THREE.CanvasTexture;
  earth: THREE.CanvasTexture;
  mars: THREE.CanvasTexture;
  jupiter: THREE.CanvasTexture;
  saturn: THREE.CanvasTexture;
  uranus: THREE.CanvasTexture;
  neptune: THREE.CanvasTexture;
  moon: THREE.CanvasTexture;
  sun: THREE.CanvasTexture;
}

function rocky(base: [number, number, number], dark: [number, number, number], seed: number): PixelFn {
  return (u, v) => {
    const n = fbm(seed, u, v, 4);
    const blotch = fbm(seed + 7, u * 2, v * 2, 3);
    const t = Math.min(1, Math.max(0, (n - 0.35) * 2.2 + (blotch - 0.5) * 0.5));
    // Sparse bright crater specks.
    const crater = blotch > 0.78 ? 26 : 0;
    return [
      base[0] + (dark[0] - base[0]) * t + crater,
      base[1] + (dark[1] - base[1]) * t + crater,
      base[2] + (dark[2] - base[2]) * t + crater,
    ];
  };
}

function gasGiant(
  bands: Array<[number, number, number]>,
  seed: number,
  spot?: { u: number; v: number; r: number; color: [number, number, number] },
): PixelFn {
  return (u, v) => {
    const warp = (fbm(seed, u, v, 4) - 0.5) * 0.16;
    const bandPos = (v + warp) * bands.length;
    const i0 = Math.min(bands.length - 1, Math.max(0, Math.floor(bandPos)));
    const i1 = Math.min(bands.length - 1, i0 + 1);
    const f = bandPos - Math.floor(bandPos);
    const s = f * f * (3 - 2 * f);
    const turbulence = (fbm(seed + 31, u * 3, v * 6, 3) - 0.5) * 22;
    let r = bands[i0][0] + (bands[i1][0] - bands[i0][0]) * s + turbulence;
    let g = bands[i0][1] + (bands[i1][1] - bands[i0][1]) * s + turbulence;
    let b = bands[i0][2] + (bands[i1][2] - bands[i0][2]) * s + turbulence;
    if (spot) {
      // Elliptical storm with soft edge (longitude wraps).
      let du = Math.abs(u - spot.u);
      du = Math.min(du, 1 - du);
      const d = Math.hypot((du * 2.2) / spot.r, (v - spot.v) / (spot.r * 0.6));
      if (d < 1) {
        const k = (1 - d * d) * 0.85;
        r += (spot.color[0] - r) * k;
        g += (spot.color[1] - g) * k;
        b += (spot.color[2] - b) * k;
      }
    }
    return [r, g, b];
  };
}

const W = 256;
const H = 128;

export function buildPlanetTextures(): PlanetTextureSet {
  const jupiterBands: Array<[number, number, number]> = [
    [198, 166, 130], [226, 208, 176], [176, 132, 96], [232, 214, 182],
    [200, 160, 118], [236, 220, 190], [188, 148, 110], [224, 200, 168],
  ];
  const saturnBands: Array<[number, number, number]> = [
    [216, 198, 160], [232, 218, 186], [206, 188, 150], [228, 214, 182],
    [212, 194, 156], [226, 212, 180],
  ];
  return {
    mercury: toTex(paintCanvas(W, H, 11, rocky([150, 138, 126], [88, 80, 74], 11))),
    venus: toTex(
      paintCanvas(W, H, 22, (u, v) => {
        const n = fbm(22, u, v, 4);
        const t = 200 + (n - 0.5) * 44;
        return [t, t * 0.82, t * 0.58];
      }),
    ),
    earth: toTex(
      paintCanvas(W, H, 33, (u, v) => {
        const land = fbm(33, u, v, 5);
        const detail = fbm(77, u * 2, v * 2, 3);
        const ice = Math.abs(v - 0.5) * 2; // 0 equator → 1 poles
        if (ice > 0.86 - detail * 0.06) return [235, 242, 248]; // ice caps
        if (land > 0.52) {
          const green = land > 0.62;
          const shade = 0.85 + detail * 0.3;
          return green
            ? [52 * shade, 118 * shade, 52 * shade]
            : [168 * shade, 148 * shade, 104 * shade];
        }
        const shade = 0.9 + detail * 0.2; // ocean depth variation
        return [28 * shade, 78 * shade, 158 * shade];
      }),
    ),
    mars: toTex(
      paintCanvas(W, H, 44, (u, v) => {
        const n = fbm(44, u, v, 4);
        const t = 0.75 + n * 0.5;
        const ice = Math.abs(v - 0.5) * 2;
        if (ice > 0.93) return [238, 232, 226]; // polar cap
        return [198 * t, 96 * t, 58 * t];
      }),
    ),
    jupiter: toTex(
      paintCanvas(W, H, 55, gasGiant(jupiterBands, 55, { u: 0.68, v: 0.62, r: 0.09, color: [196, 92, 60] })),
    ),
    saturn: toTex(paintCanvas(W, H, 66, gasGiant(saturnBands, 66))),
    uranus: toTex(
      paintCanvas(W, H, 77, (u, v) => {
        const n = fbm(77, u, v, 3);
        const t = 0.92 + (n - 0.5) * 0.12;
        return [146 * t, 216 * t, 214 * t];
      }),
    ),
    neptune: toTex(
      paintCanvas(W, H, 88, (u, v) => {
        const n = fbm(88, u, v, 4);
        const warp = (n - 0.5) * 0.1;
        const band = 0.9 + Math.sin((v + warp) * 18) * 0.08 + (n - 0.5) * 0.2;
        return [58 * band, 92 * band, 205 * band];
      }),
    ),
    moon: toTex(paintCanvas(128, 64, 99, rocky([168, 168, 172], [110, 110, 116], 99))),
    sun: toTex(
      paintCanvas(W, H, 111, (u, v) => {
        const granulation = fbm(111, u * 2, v * 2, 4);
        const t = 0.85 + granulation * 0.3;
        return [255 * t, 178 * t, 92 * t];
      }),
    ),
  };
}

/** Soft radial glow sprite (sun corona, comet head, photon ring helpers). */
export function buildGlowTexture(inner = 'rgba(255,240,210,1)', outer = 'rgba(255,140,40,0)'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, inner);
    g.addColorStop(0.35, inner.replace(',1)', ',0.55)'));
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  return toTex(c);
}

/** Deep-space nebula backdrop (equireness-ish gradient + drifting clouds). */
export function buildNebulaTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#03040c';
    ctx.fillRect(0, 0, 512, 256);
    const rand = mulberry32(2026);
    const clouds: Array<[number, number, number, string]> = [
      [0.22, 0.38, 90, 'rgba(88,40,160,0.5)'],
      [0.7, 0.6, 110, 'rgba(20,90,140,0.5)'],
      [0.48, 0.3, 70, 'rgba(150,40,110,0.4)'],
      [0.85, 0.25, 60, 'rgba(30,60,180,0.45)'],
      [0.1, 0.75, 70, 'rgba(10,80,120,0.4)'],
    ];
    for (const [u, v, r, color] of clouds) {
      const g = ctx.createRadialGradient(u * 512, v * 256, 4, u * 512, v * 256, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 512, 256);
    }
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 350; i++) {
      const a = 0.25 + rand() * 0.75;
      ctx.globalAlpha = a * 0.8;
      ctx.fillRect(rand() * 512, rand() * 256, 1, 1);
    }
    ctx.globalAlpha = 1;
  }
  return toTex(c);
}
