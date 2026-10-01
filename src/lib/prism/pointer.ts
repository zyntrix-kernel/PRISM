// Adaptive hand pointer: low-latency filtering for camera-driven interaction.
// The filter keeps sensor noise under control without making the pointer feel
// like it is dragging behind the fingertip.

export interface PointerSample { x: number; y: number; }

export interface AdaptivePointerOpts {
  maxSpeed?: number;
  slowCutoff?: number;
  fastCutoff?: number;
  betaBase?: number;
  betaRate?: number;
  maxLeadSec?: number;
  maxLeadDist?: number;
}

const clamp = (v: number, lo: number, hi: number): number => v < lo ? lo : v > hi ? hi : v;

function euroAlpha(cutoff: number, dt: number): number {
  const te = 2 * Math.PI * cutoff * Math.max(1e-4, dt);
  return te / (te + 1);
}

export class AdaptivePointerFilter {
  private readonly maxSpeed: number;
  private readonly slowCutoff: number;
  private readonly fastCutoff: number;
  private readonly betaBase: number;
  private readonly betaRate: number;
  private readonly maxLeadSec: number;
  private readonly maxLeadDist: number;

  private init = false;
  private fx = 0;
  private fy = 0;
  private ox = 0;
  private oy = 0;
  private vx = 0;
  private vy = 0;
  private tx = 0;
  private ty = 0;
  private px = 0;
  private py = 0;
  private rate = 30;
  private jx = 0;
  private jy = 0;
  private jm = 0;
  private jitter = 0;
  private speed = 0;

  constructor(opts: AdaptivePointerOpts = {}) {
    this.maxSpeed = opts.maxSpeed ?? 12;
    this.slowCutoff = opts.slowCutoff ?? 16;
    this.fastCutoff = opts.fastCutoff ?? 48;
    this.betaBase = opts.betaBase ?? 0.48;
    this.betaRate = opts.betaRate ?? 0.70;
    this.maxLeadSec = opts.maxLeadSec ?? 0.045;
    this.maxLeadDist = opts.maxLeadDist ?? 0.055;
  }

  get trackFps(): number { return this.rate; }
  get jitterLevel(): number { return this.jitter; }
  get noisePerSample(): number { return this.jm * (1 - this.directedness()); }
  private directedness(): number {
    const mag = Math.hypot(this.jx, this.jy);
    return mag / (this.jm + 1e-9) > 1 ? 1 : mag / (this.jm + 1e-9);
  }
  get pointerSpeed(): number { return this.speed; }
  get isInitialized(): boolean { return this.init; }

  // Use the fast signal for render prediction. The old implementation exposed
  // the deliberately slow trend here, which made the cursor react late even
  // after the filter itself had already detected the direction of travel.
  get velocityX(): number { return this.vx; }
  get velocityY(): number { return this.vy; }

  reset(sample: PointerSample): void {
    this.fx = sample.x; this.fy = sample.y;
    this.ox = sample.x; this.oy = sample.y;
    this.vx = 0; this.vy = 0; this.tx = 0; this.ty = 0;
    this.px = sample.x; this.py = sample.y;
    this.speed = 0; this.init = true;
  }

  update<T extends PointerSample>(sample: PointerSample, dtMs: number, confidence: number, out: T): T {
    if (!this.init) {
      this.reset(sample); out.x = sample.x; out.y = sample.y; return out;
    }
    if (!(dtMs > 0)) {
      out.x = this.ox; out.y = this.oy; return out;
    }

    const dt = clamp(dtMs / 1000, 1 / 240, 0.5);
    const conf = clamp(confidence, 0, 1);
    this.rate += (1 / dt - this.rate) * 0.10;

    const rawDx = sample.x - this.px;
    const rawDy = sample.y - this.py;
    const rawDist = Math.hypot(rawDx, rawDy);
    const oldPx = this.px;
    const oldPy = this.py;
    this.jx += (rawDx - this.jx) * 0.1;
    this.jy += (rawDy - this.jy) * 0.1;
    this.jm += (rawDist - this.jm) * 0.1;
    this.jitter = this.noisePerSample * Math.max(this.rate, 1);
    this.px = sample.x; this.py = sample.y;

    let gx = sample.x;
    let gy = sample.y;
    let spiked = false;
    const allow = this.maxSpeed * dt * (conf > 0.75 ? 1.7 : 1.05);
    if (rawDist > allow && allow > 1e-9) {
      const k = allow / rawDist;
      gx = oldPx + rawDx * k;
      gy = oldPy + rawDy * k;
      spiked = true;
    }

    const refX = this.fx + this.tx * dt;
    const refY = this.fy + this.ty * dt;
    const w = 0.985 + 0.015 * conf;
    const ex = refX + (gx - refX) * w;
    const ey = refY + (gy - refY) * w;

    const r01 = clamp((this.rate - 5) / 55, 0, 1);
    let rest = this.slowCutoff + (this.fastCutoff - this.slowCutoff) * Math.pow(r01, 1.25);
    rest /= 1 + Math.min(this.noisePerSample * 60, 0.8) * 0.08;
    rest = Math.max(10, rest);
    const beta = this.betaBase + this.betaRate * r01;
    const dcut = 4 + 5 * r01;

    const aD = euroAlpha(dcut, dt);
    this.vx += ((ex - this.fx) / dt - this.vx) * aD;
    this.vy += ((ey - this.fy) / dt - this.vy) * aD;
    const ax = euroAlpha(rest + beta * Math.abs(this.vx), dt);
    const ay = euroAlpha(rest + beta * Math.abs(this.vy), dt);
    const prevFx = this.fx;
    const prevFy = this.fy;
    this.fx += (ex - this.fx) * ax;
    this.fy += (ey - this.fy) * ay;

    const aV = euroAlpha(8.0, dt);
    const tvx = (this.fx - prevFx) / dt;
    const tvy = (this.fy - prevFy) / dt;
    this.tx += (tvx - this.tx) * aV;
    this.ty += (tvy - this.ty) * aV;
    this.speed += (Math.hypot(tvx, tvy) - this.speed) * aV;

    let ox = this.fx;
    let oy = this.fy;
    if (!spiked && conf >= 0.30 && dtMs <= 200 && this.speed > 1e-4) {
      const lead = Math.min(1 / Math.max(this.rate, 5), this.maxLeadSec);
      let lx = this.vx * lead;
      let ly = this.vy * lead;
      const ld = Math.hypot(lx, ly);
      if (ld > this.maxLeadDist && ld > 1e-9) {
        const k = this.maxLeadDist / ld;
        lx *= k; ly *= k;
      }
      ox += lx; oy += ly;
    }
    out.x = ox; out.y = oy;
    this.ox = ox; this.oy = oy;
    return out;
  }
}
