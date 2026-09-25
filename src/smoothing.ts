// Lightweight smoothing primitives. Hand landmarks are noisy frame-to-frame,
// so every hand-driven value passes through one of these before touching the
// scene. Exponential smoothing is used instead of windowed averaging because
// it needs no allocations and has a single intuitive tuning parameter.

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Frame-rate independent exponential smoothing factor. */
export function dampFactor(smoothing: number, dtSeconds: number): number {
  const clamped = Math.min(0.999, Math.max(0.001, smoothing));
  // Convert a per-frame-at-60fps factor into a dt-independent alpha.
  return 1 - Math.pow(1 - clamped, dtSeconds * 60);
}

/** Smooths a scalar stream toward incoming samples. */
export class ScalarSmoother {
  private value: number;
  private initialized = false;

  constructor(
    private smoothing: number,
    initialValue = 0,
  ) {
    this.value = initialValue;
  }

  reset(value: number): void {
    this.value = value;
    this.initialized = true;
  }

  update(sample: number, dtSeconds: number): number {
    if (!this.initialized) {
      this.value = sample;
      this.initialized = true;
      return this.value;
    }
    const alpha = dampFactor(this.smoothing, dtSeconds);
    this.value += (sample - this.value) * alpha;
    return this.value;
  }

  get current(): number {
    return this.value;
  }
}

/** Smooths a 3D stream (pointer positions, drag targets) without allocations
 *  in the hot loop: callers pass a reusable target object. */
export class Vec3Smoother {  private x = 0;
  private y = 0;
  private z = 0;
  private initialized = false;

  constructor(private smoothing: number) {}

  reset(sample: Vec3Like): void {
    this.x = sample.x;
    this.y = sample.y;
    this.z = sample.z;
    this.initialized = true;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  update<T extends Vec3Like>(sample: Vec3Like, dtSeconds: number, out: T): T {    if (!this.initialized) {
      this.reset(sample);
    }
    const alpha = dampFactor(this.smoothing, dtSeconds);
    this.x += (sample.x - this.x) * alpha;
    this.y += (sample.y - this.y) * alpha;
    this.z += (sample.z - this.z) * alpha;
    out.x = this.x;
    out.y = this.y;
    out.z = this.z;
    return out;
  }
}

/**
 * One Euro adaptive filter for 3D streams (the hand pointer).
 * Idea: smooth heavily when the signal moves slowly (kills jitter), open
 * up when it moves fast (kills lag). Cutoff = minCutoff + beta * speed.
 */
export class OneEuroSmoother {
  private x = 0;
  private y = 0;
  private z = 0;
  private dx = 0;
  private dy = 0;
  private dz = 0;
  private initialized = false;

  constructor(
    private minCutoff = 1.0,
    private beta = 0.03,
    private dcutoff = 1.0,
  ) {}

  private static alpha(cutoff: number, dt: number): number {
    const te = 2 * Math.PI * cutoff * Math.max(1e-4, dt);
    return te / (te + 1);
  }

  reset(sample: Vec3Like): void {
    this.x = sample.x;
    this.y = sample.y;
    this.z = sample.z;
    this.dx = 0;
    this.dy = 0;
    this.dz = 0;
    this.initialized = true;
  }

  update<T extends Vec3Like>(sample: Vec3Like, dtSeconds: number, out: T): T {
    const dt = Math.max(1e-4, dtSeconds);
    if (!this.initialized) {
      this.reset(sample);
      out.x = sample.x;
      out.y = sample.y;
      out.z = sample.z;
      return out;
    }
    // Smooth the derivative (signal velocity) first.
    const aD = OneEuroSmoother.alpha(this.dcutoff, dt);
    this.dx += ((sample.x - this.x) / dt - this.dx) * aD;
    this.dy += ((sample.y - this.y) / dt - this.dy) * aD;
    this.dz += ((sample.z - this.z) / dt - this.dz) * aD;
    // Per-axis adaptive cutoff from the axis speed.
    const ax = OneEuroSmoother.alpha(this.minCutoff + this.beta * Math.abs(this.dx), dt);
    const ay = OneEuroSmoother.alpha(this.minCutoff + this.beta * Math.abs(this.dy), dt);
    const az = OneEuroSmoother.alpha(this.minCutoff + this.beta * Math.abs(this.dz), dt);
    this.x += (sample.x - this.x) * ax;
    this.y += (sample.y - this.y) * ay;
    this.z += (sample.z - this.z) * az;
    out.x = this.x;
    out.y = this.y;
    out.z = this.z;
    return out;
  }
}
