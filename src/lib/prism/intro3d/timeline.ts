// ─────────────────────────────────────────────────────────────────────────────
// PRISM · "FIRST LIGHT" — the ZYNASH LABS startup film.
// Deterministic act table + camera choreography, shared by the WebGL film
// engine (film.ts) and the DOM overlay (PrismCinematicIntro.tsx).
//
// Story grammar: ONE organism of light (the swarm) carries the whole film.
// Genesis → ZYNASH LABS → the prism disperses it into the sciences
// (optics / chemistry / mathematics) → implosion → PRISM → the team → handoff.
// Every transformation is caused by the same light, so it reads as one idea.
// ─────────────────────────────────────────────────────────────────────────────

/** Total film duration in seconds. */
export const TOTAL = 28.8;

/** Beat table — every schedule decision derives from these numbers. */
export const T = {
  // ACT I — GENESIS: void → singularity → slow-motion big bang
  BURST: 0.8,

  // ACT II — ZYNASH LABS: swarm condenses into the wordmark
  LABS_MORPH: 2.6,
  LABS_SWEEP: 4.35,
  LABS_SHATTER: 5.95,

  // ACT III-a — OPTICS: crystal prism + white beam → spectral fan
  OPTICS_IN: 6.15,
  BEAM_IGNITE: 6.85,
  SPECTRUM_BLOOM: 7.45,
  OPTICS_END: 9.1,

  // ACT III-b — CHEMISTRY: electron fog condenses into benzene
  CHEM_IN: 9.1,
  BENZENE_ASSEMBLE: 9.7,
  CHEM_END: 12.5,

  // ACT III-c — MATHEMATICS: live Lorenz integration + phyllotaxis bloom
  MATH_IN: 12.5,
  PHYLLO_BLOOM: 13.7,
  MATH_END: 15.05,

  // ACT IV — PRISM: everything implodes into the prism tip → flash → wordmark
  IMPLODE: 15.05,
  FLASH: 16.05,
  PRISM_MORPH: 16.25,
  LOCKUP: 17.1,
  PRISM_END: 19.9,

  // ACT V — TEAM: galaxy drift, credits one by one
  TEAM0: 19.9,
  MEMBER_DUR: 1.72,

  // ACT VI — HANDOFF: hyperflash into the app
  IMPLODE2: 26.75,
  HYPERFLASH: 27.65,
  END_FADE: 28.25,
} as const;

export const TEAM0 = T.TEAM0;
export const MEMBER_DUR = T.MEMBER_DUR;

export type ActId =
  | 'genesis'
  | 'labs'
  | 'optics'
  | 'chemistry'
  | 'mathematics'
  | 'prism'
  | 'team'
  | 'handoff';

/** Which act is playing at film-time `t`. Pure — used by engine and DOM. */
export function actAt(t: number): ActId {
  if (t < T.LABS_MORPH - 0.4) return 'genesis';
  if (t < T.LABS_SHATTER) return 'labs';
  if (t < T.OPTICS_END) return 'optics';
  if (t < T.CHEM_END) return 'chemistry';
  if (t < T.MATH_END) return 'mathematics';
  if (t < T.PRISM_END) return 'prism';
  if (t < T.IMPLODE2) return 'team';
  return 'handoff';
}

/** Science caption cards — shown by the DOM overlay, keyed by time. */
export interface Caption {
  readonly t0: number;
  readonly t1: number;
  readonly index: string;
  readonly field: string;
  readonly title: string;
  readonly formula: string;
  readonly detail: string;
}

export const CAPTIONS: readonly Caption[] = [
  {
    t0: T.BEAM_IGNITE + 0.25,
    t1: T.OPTICS_END - 0.15,
    index: '01',
    field: 'PHYSICS / OPTICS',
    title: 'Light becomes a spectrum.',
    formula: 'n(λ) = c / v(λ)',
    detail: 'Refraction · dispersion · caustics',
  },
  {
    t0: T.BENZENE_ASSEMBLE + 0.15,
    t1: T.CHEM_END - 0.1,
    index: '02',
    field: 'CHEMISTRY / MATTER',
    title: 'Matter becomes a system.',
    formula: 'C₆H₆ · ΔE = hν',
    detail: 'Bonds · resonance · energy states',
  },
  {
    t0: T.MATH_IN + 0.55,
    t1: T.MATH_END - 0.1,
    index: '03',
    field: 'MATHEMATICS / CHAOS',
    title: 'Chaos becomes form.',
    formula: 'σ=10 · ρ=28 · β=8/3',
    detail: 'Strange attractors · φ · emergence',
  },
];

/** Camera choreography — spherical rig keyframes, eased with smoothstep.
 *  r = orbit radius, az/el = azimuth/elevation (radians), fov = degrees. */
export interface CamKey {
  readonly t: number;
  readonly r: number;
  readonly az: number;
  readonly el: number;
  readonly lx: number;
  readonly ly: number;
  readonly lz: number;
  readonly fov: number;
  /** Handheld micro-shake amount (radians of az/el jitter). */
  readonly shake?: number;
}

export const CAMERA: readonly CamKey[] = [
  // GENESIS — far, slow drift while the void breathes
  { t: 0.0, r: 30.0, az: 0.55, el: 0.16, lx: 0, ly: 0, lz: 0, fov: 44, shake: 0.0012 },
  { t: 2.6, r: 23.0, az: 0.18, el: 0.09, lx: 0, ly: 0, lz: 0, fov: 42, shake: 0.0012 },
  // LABS — decisive macro push into the wordmark
  { t: 4.5, r: 13.4, az: -0.12, el: 0.03, lx: 0, ly: 0, lz: 0, fov: 38, shake: 0.0022 },
  { t: 5.95, r: 11.8, az: -0.02, el: 0.0, lx: 0, ly: 0, lz: 0, fov: 36, shake: 0.0022 },
  // OPTICS — pull back wide, then a precise orbital arc around the prism
  { t: 6.5, r: 10.5, az: 0.85, el: 0.22, lx: 0.4, ly: 0, lz: 0, fov: 40, shake: 0.0016 },
  { t: 8.3, r: 8.2, az: 1.85, el: 0.1, lx: 1.2, ly: 0.1, lz: 0, fov: 38, shake: 0.0016 },
  { t: 9.1, r: 7.6, az: 2.25, el: 0.06, lx: 1.4, ly: 0.1, lz: 0, fov: 38, shake: 0.0016 },
  // CHEMISTRY — dive through the bond plane, slow interior orbit
  { t: 10.0, r: 8.6, az: 3.15, el: 0.42, lx: 0, ly: 0, lz: 0, fov: 40, shake: 0.0014 },
  { t: 11.6, r: 6.6, az: 4.0, el: 0.18, lx: 0, ly: 0, lz: 0, fov: 38, shake: 0.0014 },
  { t: 12.5, r: 6.2, az: 4.45, el: 0.1, lx: 0, ly: 0, lz: 0, fov: 38, shake: 0.0014 },
  // MATHEMATICS — wide establishing, then accelerating dive along the attractor
  { t: 13.2, r: 9.0, az: 5.2, el: 0.5, lx: 0, ly: -0.4, lz: 0, fov: 40, shake: 0.0018 },
  { t: 14.6, r: 6.4, az: 6.1, el: 0.22, lx: 0, ly: -0.4, lz: 0, fov: 36, shake: 0.0026 },
  { t: 15.05, r: 5.6, az: 6.45, el: 0.12, lx: 0, ly: -0.3, lz: 0, fov: 34, shake: 0.0026 },
  // IMPLODE + FLASH — violent pull-back, whip to face the prism
  { t: 16.05, r: 7.4, az: 6.9, el: 0.08, lx: 0, ly: 0, lz: 0, fov: 46, shake: 0.02 },
  // PRISM wordmark — perfectly stable hero lock-off
  { t: 16.7, r: 11.6, az: 7.02, el: 0.02, lx: 0, ly: 0, lz: 0, fov: 38, shake: 0.0008 },
  { t: 19.9, r: 11.0, az: 6.88, el: 0.02, lx: 0, ly: 0, lz: 0, fov: 37, shake: 0.0008 },
  // TEAM — slow majestic galaxy drift
  { t: 21.5, r: 15.0, az: 7.6, el: 0.5, lx: 0, ly: 0, lz: 0, fov: 42, shake: 0.001 },
  { t: 25.2, r: 13.0, az: 8.55, el: 0.38, lx: 0, ly: 0, lz: 0, fov: 42, shake: 0.001 },
  { t: 26.75, r: 11.5, az: 9.0, el: 0.3, lx: 0, ly: 0, lz: 0, fov: 42, shake: 0.001 },
  // HANDOFF — rush into the light
  { t: 27.65, r: 5.2, az: 9.25, el: 0.18, lx: 0, ly: 0, lz: 0, fov: 50, shake: 0.004 },
  { t: 28.8, r: 1.8, az: 9.35, el: 0.1, lx: 0, ly: 0, lz: 0, fov: 58, shake: 0.004 },
] as const;

/** Team credits — DOM-owned typography (never baked into the WebGL layer). */
export const TEAM = [
  { name: 'Tanay Bhandari', handle: 'Zyntrix.krnl.sys', role: 'LEAD' },
  { name: 'Ashwin Nagaranjan Ramnath', handle: 'Ash Collector', role: '' },
  { name: 'Debroop Mojumder', handle: 'distortus_rexx', role: '' },
  { name: 'Maaz Mozzam', handle: 'Unknown', role: '' },
] as const;

export type Member = (typeof TEAM)[number];

/** Which credit is visible at film-time `t` (-1 = none). Pure. */
export function memberAt(t: number): number {
  if (t < TEAM0 || t >= TEAM0 + MEMBER_DUR * TEAM.length) return -1;
  return Math.min(TEAM.length - 1, Math.floor((t - TEAM0) / MEMBER_DUR));
}

/** Spectral palette (wavelength-ish RGB approximation, restrained ice-blue bias). */
export const SPECTRUM: readonly [number, number, number][] = [
  [0.62, 0.36, 1.0], // violet
  [0.36, 0.55, 1.0], // blue
  [0.2, 0.85, 1.0], // cyan
  [0.3, 1.0, 0.85], // teal
  [0.65, 1.0, 0.45], // green
  [1.0, 0.8, 0.35], // gold
  [1.0, 0.45, 0.5], // rose
];

/** Helper: normalized window ramp — 0 before [a,b], smooth 0→1→0 inside. */
export function window01(t: number, a: number, b: number, fadeIn = 0.25, fadeOut = 0.25): number {
  if (t <= a || t >= b) return 0;
  const inRamp = Math.min(1, (t - a) / fadeIn);
  const outRamp = Math.min(1, (b - t) / fadeOut);
  return Math.min(inRamp, outRamp);
}

/** Deterministic 1D pseudo-noise for camera shake / flicker. */
export function flicker(t: number, seed = 0): number {
  return (
    Math.sin(t * 7.13 + seed * 12.9) * 0.5 +
    Math.sin(t * 13.7 + seed * 78.2) * 0.3 +
    Math.sin(t * 23.1 + seed * 37.7) * 0.2
  );
}
