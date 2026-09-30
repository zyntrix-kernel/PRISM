
import * as THREE from "three";
import type { ShapeId } from "./config";

export type Shape = {
  pos: Float32Array;
  col: Float32Array;
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const hsl = (h: number, s: number, l: number) => {
  const c = new THREE.Color().setHSL((h % 1 + 1) % 1, s, l);
  return [c.r, c.g, c.b] as const;
};

const set = (
  pos: Float32Array,
  col: Float32Array,
  i: number,
  x: number,
  y: number,
  z: number,
  rgb: readonly [number, number, number],
) => {
  const p = i * 3;
  pos[p] = x;
  pos[p + 1] = y;
  pos[p + 2] = z;
  col[p] = rgb[0];
  col[p + 1] = rgb[1];
  col[p + 2] = rgb[2];
};

export function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function genOrigin(n: number): Shape {
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const rng = mulberry32(0x101);
  for (let i = 0; i < n; i++) {
    const r = Math.pow(rng(), 2.7) * 0.62;
    const u = rng() * 2 - 1;
    const a = rng() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    set(pos, col, i, Math.cos(a) * s * r, u * r, Math.sin(a) * s * r, hsl(0.54 + i % 17 * 0.002, 0.55, 0.72));
  }
  return { pos, col };
}

export function genRibbon(n: number, rng: () => number): Shape {
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const palette = [0.53, 0.57, 0.63, 0.73, 0.82];

  for (let i = 0; i < n; i++) {
    const u = i / Math.max(1, n - 1);
    const theta = u * Math.PI * 8.5 + rng() * 0.1;
    const radius = 1.45 + 0.55 * Math.sin(theta * 0.37);
    const width = (rng() - 0.5) * 1.15;
    const x = Math.cos(theta) * radius;
    const z = Math.sin(theta) * radius;
    const y = width + Math.sin(theta * 0.55) * 0.22;
    const rgb = hsl(palette[i % palette.length] + rng() * 0.025, 0.62, 0.66 + rng() * 0.16);
    set(pos, col, i, x, y, z, rgb);
  }

  return { pos, col };
}

export function genOrbit(n: number, rng: () => number): Shape {
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);

  for (let i = 0; i < n; i++) {
    const band = i % 5;
    const a = rng() * Math.PI * 2;
    const ring = 1.2 + band * 0.34 + (rng() - 0.5) * 0.08;
    const tilt = (band - 2) * 0.23;
    const x0 = Math.cos(a) * ring;
    const y0 = Math.sin(a) * ring;
    const z0 = (rng() - 0.5) * 0.18;
    const y = y0 * Math.cos(tilt) - z0 * Math.sin(tilt);
    const z = y0 * Math.sin(tilt) + z0 * Math.cos(tilt);
    const x = x0 + (rng() - 0.5) * 0.08;
    const rgb = hsl(0.54 + band * 0.055 + rng() * 0.02, 0.64, 0.62 + rng() * 0.19);
    set(pos, col, i, x, y * 0.55, z, rgb);
  }

  return { pos, col };
}

export function genPrism(n: number, rng: () => number): Shape {
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);

  const a = new THREE.Vector3(-1.35, -1.05, 0);
  const b = new THREE.Vector3(-1.35, 1.05, 0);
  const c = new THREE.Vector3(1.32, 0, 0);

  for (let i = 0; i < n; i++) {
    const edge = i % 3;
    let p: THREE.Vector3;
    if (edge === 0) p = a.clone().lerp(b, rng());
    else if (edge === 1) p = b.clone().lerp(c, rng());
    else p = c.clone().lerp(a, rng());

    const depth = (rng() - 0.5) * 1.18;
    const fill = Math.pow(rng(), 1.8);
    p.x *= 0.72 + fill * 0.28;
    p.y *= 0.72 + fill * 0.28;
    p.z += depth;

    const hue = 0.53 + fill * 0.23 + (edge === 1 ? 0.16 : 0);
    set(pos, col, i, p.x, p.y, p.z, hsl(hue, 0.68, 0.66 + rng() * 0.20));
  }

  return { pos, col };
}

export function genImplode(n: number): Shape {
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = i * 2.3999632297;
    const r = 0.045 + Math.pow(i / Math.max(1, n - 1), 1.7) * 0.11;
    set(pos, col, i, Math.cos(a) * r, Math.sin(a) * r * 0.8, Math.sin(a * 0.7) * r, hsl(0.55 + (i % 7) * 0.02, 0.48, 0.68));
  }
  return { pos, col };
}

export function genText(n: number, text: string, rng: () => number): Shape | null {
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 260;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.font = "700 190px Arial, Helvetica, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const occupied: Array<[number, number]> = [];

  for (let y = 0; y < canvas.height; y += 4) {
    for (let x = 0; x < canvas.width; x += 4) {
      if (image[(y * canvas.width + x) * 4 + 3] > 20) {
        occupied.push([x, y]);
      }
    }
  }

  if (!occupied.length) return null;

  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);

  for (let i = 0; i < n; i++) {
    const sample = occupied[(i * 17 + Math.floor(rng() * occupied.length)) % occupied.length];
    const x = (sample[0] / canvas.width - 0.5) * 7.1;
    const y = -(sample[1] / canvas.height - 0.5) * 1.55;
    const z = (rng() - 0.5) * 0.11;
    set(pos, col, i, x, y, z, hsl(0.54 + rng() * 0.09, 0.22, 0.78 + rng() * 0.16));
  }

  return { pos, col };
}

export function genShape(id: ShapeId, n: number, rng: () => number): Shape {
  switch (id) {
    case "origin":
      return genOrigin(n);
    case "ribbon":
      return genRibbon(n, rng);
    case "orbit":
      return genOrbit(n, rng);
    case "prism":
      return genPrism(n, rng);
    case "implode":
      return genImplode(n);
  }
}

export function mixShape(a: Shape, b: Shape, t: number): Shape {
  const u = clamp01(t);
  const e = u * u * (3 - 2 * u);
  const pos = new Float32Array(a.pos.length);
  const col = new Float32Array(a.col.length);

  for (let i = 0; i < pos.length; i++) pos[i] = a.pos[i] + (b.pos[i] - a.pos[i]) * e;
  for (let i = 0; i < col.length; i++) col[i] = a.col[i] + (b.col[i] - a.col[i]) * e;

  return { pos, col };
}
