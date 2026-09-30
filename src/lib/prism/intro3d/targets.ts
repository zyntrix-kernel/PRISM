// ─────────────────────────────────────────────────────────────────────────────
// PRISM · "FIRST LIGHT" — particle target fields.
// Pure math + canvas sampling: every shape the swarm becomes during the film.
// All generators write into a preallocated Float32Array (N*3) — the hot path
// never allocates. Deterministic (seeded PRNG) so the film looks identical
// on every run, every machine.
// ─────────────────────────────────────────────────────────────────────────────

/** Mulberry32 — small, fast, deterministic. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box–Muller (uses the provided rng). */
function gauss(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Resolve the page's display font for canvas sampling (Geist via next/font,
 *  falling back through the same stack the DOM uses). Must run client-side. */
function displayFont(px: number): string {
  let family = 'system-ui, sans-serif';
  try {
    const fam = getComputedStyle(document.body).fontFamily;
    if (fam) family = fam;
  } catch {
    /* SSR / headless — keep fallback */
  }
  return `800 ${px}px ${family}`;
}

/**
 * Sample `count` points from rendered text — the swarm's typography engine.
 * Renders `text` to an offscreen canvas, reads alpha, and rejection-samples
 * filled pixels. Points are layered in 3 z-slices with edge bias, giving a
 * pseudo-extruded, luminous slab of particles.
 *
 * @param width target world width of the text block
 * @param depth total z jitter depth
 */
export function sampleTextPoints(
  text: string,
  count: number,
  width: number,
  depth: number,
  out: Float32Array,
  seed = 7,
): void {
  const rng = makeRng(seed);
  const cw = 1024;
  const ch = 256;
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    cloud(count, width * 0.4, out, seed);
    return;
  }

  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Fit the text: start big, shrink until it fits the canvas with padding.
  let px = 190;
  ctx.font = displayFont(px);
  let m = ctx.measureText(text);
  if (m.width > cw * 0.94) {
    px = Math.floor((px * cw * 0.94) / m.width);
    ctx.font = displayFont(px);
    m = ctx.measureText(text);
  }
  ctx.fillText(text, cw / 2, ch / 2);

  const img = ctx.getImageData(0, 0, cw, ch).data;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (img[(y * cw + x) * 4 + 3] > 120) {
        xs.push(x);
        ys.push(y);
      }
    }
  }
  if (xs.length === 0) {
    cloud(count, width * 0.4, out, seed);
    return;
  }

  const scale = width / cw;
  const textH = ch * scale;
  for (let i = 0; i < count; i++) {
    const pick = (rng() * xs.length) | 0;
    const x = xs[pick] + (rng() - 0.5) * 1.6;
    const y = ys[pick] + (rng() - 0.5) * 1.6;
    const layer = rng();
    const z = (layer - 0.5) * depth * (0.35 + 0.65 * layer * layer);
    out[i * 3] = (x - cw / 2) * scale + (rng() - 0.5) * 0.02;
    out[i * 3 + 1] = -(y - ch / 2) * scale;
    out[i * 3 + 2] = z;
  }
  void textH;
}

/** Primordial cloud — gaussian void nebula for the genesis act. */
export function cloud(count: number, radius: number, out: Float32Array, seed = 1): void {
  const rng = makeRng(seed);
  for (let i = 0; i < count; i++) {
    out[i * 3] = gauss(rng) * radius * 0.42;
    out[i * 3 + 1] = gauss(rng) * radius * 0.3;
    out[i * 3 + 2] = gauss(rng) * radius * 0.42;
  }
}

/** Distant star sphere — huge shell so the void never feels empty. */
export function starSphere(count: number, radius: number, out: Float32Array, seed = 2): void {
  const rng = makeRng(seed);
  for (let i = 0; i < count; i++) {
    const y = 1 - 2 * rng();
    const rr = Math.sqrt(Math.max(0, 1 - y * y));
    const th = rng() * Math.PI * 2;
    const d = radius * (0.82 + 0.35 * rng());
    out[i * 3] = Math.cos(th) * rr * d;
    out[i * 3 + 1] = y * d * 0.7;
    out[i * 3 + 2] = Math.sin(th) * rr * d;
  }
}

/**
 * OPTICS act — the light story: a white beam striking the prism face,
 * a spectral fan leaving the other side, and ambient dispersion dust.
 * Prism sits at origin; beam comes in from -x, spectrum fans out toward +x.
 */
export function prismLight(
  count: number,
  out: Float32Array,
  tint: Float32Array,
  seed = 11,
): void {
  const rng = makeRng(seed);
  const n = count;
  const beamN = Math.floor(n * 0.3);
  const specN = Math.floor(n * 0.42);
  const dustN = n - beamN - specN;

  // Beam: cylinder from (-6.2, 0, 0) to the prism entry face (-1.05, 0, 0).
  for (let i = 0; i < beamN; i++) {
    const t = rng();
    const x = -6.2 + t * (6.2 - 1.02);
    const spread = 0.05 + 0.05 * (1 - t);
    out[i * 3] = x;
    out[i * 3 + 1] = gauss(rng) * spread;
    out[i * 3 + 2] = gauss(rng) * spread;
    tint[i * 3] = 1.0;
    tint[i * 3 + 1] = 1.0;
    tint[i * 3 + 2] = 1.0;
  }

  // Spectrum fan: 7 sheets leaving the prism's right face, fanning in y,
  // each a ribbon of points along +x with slight z wobble.
  const colors = SPECTRUM_RGB;
  for (let i = 0; i < specN; i++) {
    const k = i % 7;
    const band = (k - 3) / 3; // -1..1
    const t = Math.pow(rng(), 0.72); // denser near prism
    const x = 1.02 + t * 7.6;
    const y = band * (0.25 + t * 2.55) + gauss(rng) * 0.035;
    const z = gauss(rng) * (0.05 + 0.1 * t);
    const j = beamN + i;
    out[j * 3] = x;
    out[j * 3 + 1] = y;
    out[j * 3 + 2] = z;
    const c = colors[k];
    const fade = 1 - 0.35 * t;
    tint[j * 3] = c[0] * fade;
    tint[j * 3 + 1] = c[1] * fade;
    tint[j * 3 + 2] = c[2] * fade;
  }

  // Dispersion dust: sparse halo around the whole light path.
  for (let i = 0; i < dustN; i++) {
    const j = beamN + specN + i;
    out[j * 3] = -6 + rng() * 16;
    out[j * 3 + 1] = gauss(rng) * 1.9;
    out[j * 3 + 2] = gauss(rng) * 2.6;
    const k = i % 7;
    const c = colors[k];
    const dim = 0.28 + 0.3 * rng();
    tint[j * 3] = c[0] * dim;
    tint[j * 3 + 1] = c[1] * dim;
    tint[j * 3 + 2] = c[2] * dim;
  }
}

const SPECTRUM_RGB: readonly [number, number, number][] = [
  [0.62, 0.36, 1.0],
  [0.36, 0.55, 1.0],
  [0.2, 0.85, 1.0],
  [0.3, 1.0, 0.85],
  [0.65, 1.0, 0.45],
  [1.0, 0.8, 0.35],
  [1.0, 0.45, 0.5],
];

/**
 * CHEMISTRY act — benzene C₆H₆: six carbons in a ring (alternating double
 * bonds), six hydrogens, bond cylinders, and a delocalized π-electron halo.
 * Ring lies in the xy-plane, tilted slightly for cinematic depth.
 */
export function benzene(count: number, out: Float32Array, tint: Float32Array, seed = 23): void {
  const rng = makeRng(seed);
  const RC = 1.62; // carbon ring radius
  const RH = 2.62; // hydrogen radius
  const cAtom = Math.floor(count * 0.3);
  const hAtom = Math.floor(count * 0.1);
  const bonds = Math.floor(count * 0.26);
  const piCloud = count - cAtom - hAtom - bonds;

  const tilt = 0.32; // ring tilt around x for camera interest
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);
  const place = (x: number, y: number, z: number, j: number): void => {
    out[j * 3] = x;
    out[j * 3 + 1] = y * cosT - z * sinT;
    out[j * 3 + 2] = y * sinT + z * cosT;
  };

  // Carbons
  for (let i = 0; i < cAtom; i++) {
    const c = i % 6;
    const a = (c / 6) * Math.PI * 2 + Math.PI / 6;
    const cx = Math.cos(a) * RC;
    const cy = Math.sin(a) * RC;
    // shell distribution biased outward for a glass-sphere look
    const u = rng();
    const r = 0.34 * (0.75 + 0.25 * Math.pow(u, 0.4));
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(1 - 2 * rng());
    const j = i;
    place(
      cx + r * Math.sin(ph) * Math.cos(th),
      cy + r * Math.sin(ph) * Math.sin(th),
      r * Math.cos(ph),
      j,
    );
    const bright = 0.75 + 0.45 * (1 - u);
    tint[j * 3] = 0.5 * bright;
    tint[j * 3 + 1] = 0.82 * bright;
    tint[j * 3 + 2] = 1.15 * bright;
  }

  // Hydrogens
  for (let i = 0; i < hAtom; i++) {
    const c = i % 6;
    const a = (c / 6) * Math.PI * 2 + Math.PI / 6;
    const u = rng();
    const r = 0.2 * (0.72 + 0.28 * Math.pow(u, 0.4));
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(1 - 2 * rng());
    const j = cAtom + i;
    place(
      Math.cos(a) * RH + r * Math.sin(ph) * Math.cos(th),
      Math.sin(a) * RH + r * Math.sin(ph) * Math.sin(th),
      r * Math.cos(ph),
      j,
    );
    const bright = 0.7 + 0.5 * (1 - u);
    tint[j * 3] = 0.92 * bright;
    tint[j * 3 + 1] = 0.97 * bright;
    tint[j * 3 + 2] = 1.05 * bright;
  }

  // Bonds — alternating double bonds: 6 inner pairs + 6 singles
  for (let i = 0; i < bonds; i++) {
    const c = i % 6;
    const a0 = (c / 6) * Math.PI * 2 + Math.PI / 6;
    const a1 = a0 + (Math.PI * 2) / 6;
    const dbl = c % 2 === 0;
    const off = dbl ? (rng() < 0.5 ? 0.13 : -0.13) : 0;
    const t = rng();
    const ax = Math.cos(a0) * RC;
    const ay = Math.sin(a0) * RC;
    const bx = Math.cos(a1) * RC;
    const by = Math.sin(a1) * RC;
    // perpendicular offset in-plane for double-bond pairing
    const nx = -(by - ay);
    const ny = bx - ax;
    const nl = Math.hypot(nx, ny) || 1;
    const j = cAtom + hAtom + i;
    const r = 0.055 * (0.6 + rng());
    place(
      ax + (bx - ax) * t + (nx / nl) * off + gauss(rng) * r,
      ay + (by - ay) * t + (ny / nl) * off + gauss(rng) * r,
      gauss(rng) * r,
      j,
    );
    tint[j * 3] = 0.35;
    tint[j * 3 + 1] = 0.75;
    tint[j * 3 + 2] = 1.0;
  }

  // π-electron cloud — torus haze above/below the ring plane
  for (let i = 0; i < piCloud; i++) {
    const a = rng() * Math.PI * 2;
    const rr = RC * (0.8 + 0.5 * rng());
    const zz = gauss(rng) * 0.34;
    const j = cAtom + hAtom + bonds + i;
    place(Math.cos(a) * rr, Math.sin(a) * rr, zz, j);
    const dim = 0.1 + 0.3 * rng();
    tint[j * 3] = 0.45 * dim * 2.2;
    tint[j * 3 + 1] = 0.8 * dim * 2.2;
    tint[j * 3 + 2] = 1.1 * dim * 2.2;
  }
}

/**
 * MATHEMATICS act — the Lorenz attractor (σ=10, ρ=28, β=8/3), integrated
 * with RK4, resampled into a smooth ribbon, plus a golden-angle phyllotaxis
 * shell blooming around it (Fibonacci sphere, 137.507°).
 */
export function lorenzPhyllo(
  count: number,
  out: Float32Array,
  tint: Float32Array,
  seed = 47,
): void {
  const rng = makeRng(seed);
  const phylloN = Math.floor(count * 0.22);
  const lorenzN = count - phylloN;

  // Integrate the attractor once — 20k RK4 steps, warm-up discarded.
  const STEPS = 22000;
  const WARM = 800;
  const dt = 0.004;
  let x = 0.1;
  let y = 0;
  let z = 0;
  const pts = new Float32Array(STEPS * 3);
  const sigma = 10;
  const rho = 28;
  const beta = 8 / 3;
  const deriv = (px: number, py: number, pz: number): Vec3 => ({
    x: sigma * (py - px),
    y: px * (rho - pz) - py,
    z: px * py - beta * pz,
  });
  for (let s = 0; s < STEPS + WARM; s++) {
    const k1 = deriv(x, y, z);
    const k2 = deriv(x + (dt / 2) * k1.x, y + (dt / 2) * k1.y, z + (dt / 2) * k1.z);
    const k3 = deriv(x + (dt / 2) * k2.x, y + (dt / 2) * k2.y, z + (dt / 2) * k2.z);
    const k4 = deriv(x + dt * k3.x, y + dt * k3.y, z + dt * k3.z);
    x += (dt / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x);
    y += (dt / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y);
    z += (dt / 6) * (k1.z + 2 * k2.z + 2 * k3.z + k4.z);
    if (s >= WARM) {
      const w = s - WARM;
      pts[w * 3] = x;
      pts[w * 3 + 1] = y;
      pts[w * 3 + 2] = z;
    }
  }

  // Attractor spans ~±20 x, ~±27 z, 1..48 y. Scale & center to world.
  const S = 0.155;
  for (let i = 0; i < lorenzN; i++) {
    // index jitter keeps the ribbon dense but organic
    const pick = Math.min(STEPS - 1, (rng() * STEPS) | 0);
    const jx = (rng() - 0.5) * 0.05;
    const jy = (rng() - 0.5) * 0.05;
    const jz = (rng() - 0.5) * 0.05;
    out[i * 3] = pts[pick * 3] * S + jx;
    out[i * 3 + 1] = (pts[pick * 3 + 2] - 25) * S + 0.6 + jy; // z→y (butterfly up)
    out[i * 3 + 2] = pts[pick * 3 + 1] * S + jz; // y→z
    // heat-mapped tint along the wing: fast loops get hot ice-white
    const heat = 0.5 + 0.5 * Math.sin(pick * 0.0009);
    tint[i * 3] = 0.4 + 0.5 * heat;
    tint[i * 3 + 1] = 0.75 + 0.25 * heat;
    tint[i * 3 + 2] = 1.05 + 0.2 * heat;
  }

  // Phyllotaxis — Fibonacci sphere, golden angle, blooming around the attractor
  const GA = Math.PI * (3 - Math.sqrt(5)); // ≈ 2.39996 golden angle
  const R = 3.55;
  for (let i = 0; i < phylloN; i++) {
    const frac = (i + 0.5) / phylloN;
    const yy = 1 - 2 * frac;
    const rr = Math.sqrt(Math.max(0, 1 - yy * yy));
    const th = GA * i;
    const j = lorenzN + i;
    const shell = R * (0.985 + 0.03 * rng());
    out[j * 3] = Math.cos(th) * rr * shell;
    out[j * 3 + 1] = yy * shell * 0.86;
    out[j * 3 + 2] = Math.sin(th) * rr * shell;
    const dim = 0.16 + 0.22 * rng();
    tint[j * 3] = 0.35 * dim * 2.4;
    tint[j * 3 + 1] = 0.7 * dim * 2.4;
    tint[j * 3 + 2] = 1.0 * dim * 2.4;
  }
}

/** Raw attractor polyline for the live "drawing" ribbon (world space). */
export function lorenzPolyline(maxPoints: number): { data: Float32Array; used: number } {
  const stride = Math.max(1, Math.floor(22000 / maxPoints));
  const data = new Float32Array(maxPoints * 3);
  const S = 0.155;
  // Re-run the same deterministic integration, subsampled.
  let x = 0.1;
  let y = 0;
  let z = 0;
  const sigma = 10;
  const rho = 28;
  const beta = 8 / 3;
  const dt = 0.004;
  const deriv = (px: number, py: number, pz: number): Vec3 => ({
    x: sigma * (py - px),
    y: px * (rho - pz) - py,
    z: px * py - beta * pz,
  });
  let used = 0;
  for (let s = 0; s < 22000 + 800 && used < maxPoints; s++) {
    const k1 = deriv(x, y, z);
    const k2 = deriv(x + (dt / 2) * k1.x, y + (dt / 2) * k1.y, z + (dt / 2) * k1.z);
    const k3 = deriv(x + (dt / 2) * k2.x, y + (dt / 2) * k2.y, z + (dt / 2) * k2.z);
    const k4 = deriv(x + dt * k3.x, y + dt * k3.y, z + dt * k3.z);
    x += (dt / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x);
    y += (dt / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y);
    z += (dt / 6) * (k1.z + 2 * k2.z + 2 * k3.z + k4.z);
    if (s >= 800 && s % stride === 0) {
      data[used * 3] = x * S;
      data[used * 3 + 1] = (z - 25) * S + 0.6;
      data[used * 3 + 2] = y * S;
      used++;
    }
  }
  return { data, used };
}

/**
 * TEAM act — a dreamy spiral galaxy: 3 log-spiral arms with gaussian
 * thickness, a dense bulge, and a sparse halo. Differential rotation in the
 * shader shears the arms over time (ω ∝ 1/r — Keplerian flavour).
 */
export function galaxy(count: number, out: Float32Array, tint: Float32Array, seed = 91): void {
  const rng = makeRng(seed);
  const ARMS = 3;
  const armN = Math.floor(count * 0.68);
  const bulgeN = Math.floor(count * 0.2);
  const haloN = count - armN - bulgeN;
  const PITCH = 0.28; // rad per unit log radius
  const R0 = 0.55;

  for (let i = 0; i < armN; i++) {
    const arm = i % ARMS;
    const t = Math.pow(rng(), 0.62);
    const r = R0 + t * 8.2;
    const base = Math.log(r / R0) / PITCH + (arm / ARMS) * Math.PI * 2;
    const spread = 0.16 + 0.5 * t;
    const th = base + gauss(rng) * spread;
    const thickness = 0.32 * (1 - t * 0.72);
    out[i * 3] = Math.cos(th) * r + gauss(rng) * 0.12;
    out[i * 3 + 1] = gauss(rng) * thickness;
    out[i * 3 + 2] = Math.sin(th) * r + gauss(rng) * 0.12;
    // inner arms hotter (star-forming cores), outer arms ice-blue
    const hot = Math.pow(1 - t, 1.6);
    tint[i * 3] = 0.5 + 0.5 * hot;
    tint[i * 3 + 1] = 0.72 + 0.22 * hot;
    tint[i * 3 + 2] = 1.0 + 0.25 * (1 - t);
  }
  for (let i = 0; i < bulgeN; i++) {
    const j = armN + i;
    const r = Math.pow(rng(), 1.7) * 1.7;
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(1 - 2 * rng());
    out[j * 3] = r * Math.sin(ph) * Math.cos(th);
    out[j * 3 + 1] = r * Math.cos(ph) * 0.62;
    out[j * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    const hot = 1 - r / 1.7;
    tint[j * 3] = 1.0;
    tint[j * 3 + 1] = 0.88 + 0.1 * hot;
    tint[j * 3 + 2] = 0.85 + 0.3 * hot;
  }
  for (let i = 0; i < haloN; i++) {
    const j = armN + bulgeN + i;
    const r = 4 + Math.pow(rng(), 0.8) * 9;
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(1 - 2 * rng());
    out[j * 3] = r * Math.sin(ph) * Math.cos(th);
    out[j * 3 + 1] = r * Math.cos(ph) * 0.5;
    out[j * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    const dim = 0.05 + 0.12 * rng();
    tint[j * 3] = 0.55 * dim * 2.4;
    tint[j * 3 + 1] = 0.75 * dim * 2.4;
    tint[j * 3 + 2] = 1.1 * dim * 2.4;
  }
}

/** Implosion — everything collapses into a needle-point of light. */
export function implode(count: number, out: Float32Array, seed = 131): void {
  const rng = makeRng(seed);
  for (let i = 0; i < count; i++) {
    const r = Math.pow(rng(), 3.2) * 0.35;
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(1 - 2 * rng());
    out[i * 3] = r * Math.sin(ph) * Math.cos(th);
    out[i * 3 + 1] = r * Math.cos(ph);
    out[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
}

/** Ambient dust — used behind hero meshes when the swarm plays support. */
export function ambient(count: number, out: Float32Array, seed = 211): void {
  const rng = makeRng(seed);
  for (let i = 0; i < count; i++) {
    out[i * 3] = gauss(rng) * 9;
    out[i * 3 + 1] = gauss(rng) * 5.5;
    out[i * 3 + 2] = gauss(rng) * 9;
  }
}
