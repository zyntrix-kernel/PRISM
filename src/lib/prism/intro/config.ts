export const TOTAL = 24;

export type ShapeId = "origin" | "ribbon" | "orbit" | "prism" | "implode";

export type CameraKey = {
  t: number;
  r: number;
  az: number;
  h: number;
  ly: number;
  fov: number;
};

export const CAMERA_KEYS: readonly CameraKey[] = [
  { t: 0, r: 16, az: 2.6, h: 1.2, ly: 0, fov: 44 },
  { t: 3, r: 10, az: 1.7, h: 0.4, ly: 0, fov: 42 },
  { t: 7, r: 7, az: 0.7, h: 0.1, ly: 0.1, fov: 39 },
  { t: 11, r: 5.6, az: -0.25, h: 0.2, ly: 0, fov: 37 },
  { t: 15, r: 4.5, az: -0.7, h: 0, ly: 0, fov: 36 },
  { t: 19, r: 5.2, az: 0.25, h: 0.1, ly: 0, fov: 39 },
  { t: 22, r: 3.4, az: -0.15, h: 0, ly: 0, fov: 34 },
  { t: 24, r: 2.4, az: -0.05, h: 0, ly: 0, fov: 32 },
];

export const SHAPE_SCHEDULE: readonly { id: ShapeId; t0: number; t1: number }[] = [
  { id: "origin", t0: 0, t1: 3 },
  { id: "ribbon", t0: 3, t1: 7 },
  { id: "orbit", t0: 7, t1: 11 },
  { id: "prism", t0: 11, t1: 16 },
  { id: "implode", t0: 19, t1: 22 },
];

export const FINALE = { implode0: 19, flash0: 22.5, flash1: 23.5, end: TOTAL } as const;

export const TEAM = [
  { name: "Tanay Bhandari", handle: "Zyntrix.krnl.sys", role: "LEAD" },
  { name: "Ashwin Nagaranjan Ramnath", handle: "Ash Collector", role: "" },
  { name: "Debroop Mojumder", handle: "distortus_rexx", role: "" },
  { name: "Maaz Mozzam", handle: "Unknown", role: "" },
] as const;

export type Member = (typeof TEAM)[number];
export const MEMBER_T0 = 19.6;
export const MEMBER_DUR = 0.95;
export const TEXT_T0 = 15.4;
export const TEXT_T1 = 19.1;
