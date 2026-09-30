export type Easing = (t: number) => number;

export const clamp01 = (t: number): number =>
  Math.min(1, Math.max(0, t));

export const lerp = (
  a: number,
  b: number,
  t: number,
): number => a + (b - a) * t;

export const inverseLerp = (
  a: number,
  b: number,
  value: number,
): number => {
  if (a === b) return 0;
  return clamp01((value - a) / (b - a));
};

export const smoothstep = (t: number): number => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

export const smootherstep = (t: number): number => {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

export const easeOutCubic: Easing = (t) => {
  const x = 1 - clamp01(t);
  return 1 - x * x * x;
};

export const easeInCubic: Easing = (t) => {
  const x = clamp01(t);
  return x * x * x;
};

export const easeInOutCubic: Easing = (t) => {
  const x = clamp01(t);
  return x < 0.5
    ? 4 * x * x * x
    : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

export const easeOutQuart: Easing = (t) => {
  const x = 1 - clamp01(t);
  return 1 - x * x * x * x;
};

export const easeOutQuint: Easing = (t) => {
  const x = 1 - clamp01(t);
  return 1 - x * x * x * x * x;
};

export const easeInQuint: Easing = (t) => {
  const x = clamp01(t);
  return x * x * x * x * x;
};

export const easeOutExpo: Easing = (t) => {
  const x = clamp01(t);
  return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
};

export const easeInExpo: Easing = (t) => {
  const x = clamp01(t);
  return x <= 0 ? 0 : Math.pow(2, 10 * (x - 1));
};

export const easeOutBack: Easing = (t) => {
  const x = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return (
    1 +
    c3 * Math.pow(x - 1, 3) +
    c1 * Math.pow(x - 1, 2)
  );
};

export const easeInOutBack: Easing = (t) => {
  const x = clamp01(t);
  const c1 = 1.70158;
  const c2 = c1 * 1.525;
  return x < 0.5
    ? (Math.pow(2 * x, 2) *
        ((c2 + 1) * 2 * x - c2)) /
        2
    : (Math.pow(2 * x - 2, 2) *
        ((c2 + 1) * (x * 2 - 2) + c2) +
        2) /
        2;
};

export const damp = (
  current: number,
  target: number,
  lambda: number,
  dt: number,
): number =>
  current +
  (target - current) *
    (1 - Math.exp(-lambda * Math.max(dt, 0)));

export const remap01 = (
  value: number,
  fromA: number,
  fromB: number,
): number =>
  clamp01((value - fromA) / (fromB - fromA));

export const pulse = (
  time: number,
  frequency: number,
  phase = 0,
): number =>
  0.5 +
  0.5 *
    Math.sin(
      time * frequency * Math.PI * 2 + phase,
    );

export const bell = (t: number): number =>
  Math.sin(Math.PI * clamp01(t));

export const softPulse = (
  t: number,
  frequency = 1,
): number => {
  const x = pulse(t, frequency);
  return smoothstep(x);
};
