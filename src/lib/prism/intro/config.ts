
export const TOTAL = 15.2;

export type ShapeId =
  | "origin"
  | "ribbon"
  | "orbit"
  | "prism"
  | "implode";

export type CameraKey = {
  t: number;
  r: number;
  az: number;
  h: number;
  ly: number;
  fov: number;
};

export const CAMERA_KEYS: readonly CameraKey[] = [
  { t: 0.0, r: 14.0, az: 2.35, h: 0.25, ly: 0.0, fov: 42 },
  { t: 2.0, r: 10.5, az: 2.00, h: 0.15, ly: 0.05, fov: 41 },
  { t: 4.2, r: 8.6, az: 1.30, h: 0.10, ly: 0.0, fov: 40 },
  { t: 6.8, r: 7.0, az: 0.55, h: 0.28, ly: 0.10, fov: 38 },
  { t: 9.1, r: 5.3, az: 0.22, h: 0.15, ly: 0.12, fov: 37 },
  { t: 11.0, r: 4.2, az: -0.12, h: 0.06, ly: 0.10, fov: 36 },
  { t: 12.8, r: 3.5, az: -0.45, h: 0.0, ly: 0.0, fov: 35 },
  { t: 14.35, r: 2.7, az: -0.66, h: -0.03, ly: 0.0, fov: 34 },
  { t: 15.2, r: 1.9, az: -0.72, h: 0.0, ly: 0.0, fov: 33 },
];

export const SHAPE_SCHEDULE: readonly { id: ShapeId; t0: number; t1: number }[] = [
  { id: "origin", t0: 0.0, t1: 1.2 },
  { id: "ribbon", t0: 1.2, t1: 4.6 },
  { id: "orbit", t0: 4.6, t1: 7.5 },
  { id: "prism", t0: 7.5, t1: 11.15 },
  { id: "origin", t0: 11.15, t1: 12.6 },
];

export const FINALE = {
  implode0: 12.6,
  flash0: 14.48,
  flash1: 14.92,
  end: TOTAL,
} as const;

export const TEAM = [
  { name: "Tanay Bhandari", handle: "Zyntrix.krnl.sys", role: "Lead" },
  { name: "Ashwin Nagaranjan Ramnath", handle: "Ash Collector", role: "" },
  { name: "Debroop Mojumder", handle: "distortus_rexx", role: "" },
  { name: "Maaz Mozzam", handle: "Unknown", role: "" },
] as const;

export type Member = (typeof TEAM)[number];

export const MEMBER_T0 = 11.65;
export const MEMBER_DUR = 0.78;
export const TEXT_T0 = 8.95;
export const TEXT_T1 = 11.65;
