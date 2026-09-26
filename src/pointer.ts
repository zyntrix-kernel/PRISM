// Adaptive hand pointer: makes a $20 webcam feel like a $200 tracker.
//
// Old cameras hurt in three compounding ways: low frame rate (100+ ms
// between samples, so every sample is stale), high per-sample noise (small
// sensors, bad light), and dropouts. A fixed filter can't serve both a
// 10 fps noisy feed and a 120 fps clean one, so this filter measures the
// feed online and retunes itself every frame:
//
//   1. Outlier gate — a hand cannot cross the screen in 30 ms; spikes get
//      slid back inside physical plausibility instead of whipping the ray.
//   2. Confidence blend — MediaPipe's handedness score weights each sample;
//      shaky low-confidence frames trust the motion model, clean frames
//      trust the sensor.
//   3. Rate-adaptive One Euro — cutoff follows measured tracking fps (heavy
//      at 10 fps, open at 120 fps) and eases further when measured jitter
//      runs hot.
//   4. Trend + capped prediction — a slow velocity estimate extrapolates up
//      to ~1.25 frames ahead to hide sensor latency, hard-capped in
//      distance so it can never fling the ray.
//
// Stale re-reads (dt 0) hold position: render rate never pumps the filter.
// All math is scalar, allocation-free in the hot path.

export interface PointerSample {
  x: number;
  y: number;
}

export interface AdaptivePointerOpts {
  /** Fastest plausible fingertip travel, NDC units/sec. */
  maxSpeed?: number;
  /** One Euro rest cutoff at very low tracking rates. */
  slowCutoff?: number;
  /** One Euro rest cutoff at 60+ fps tracking. */
  fastCutoff?: number;
  /** Speed-opening base (more = livelier fast motion). */
  betaBase?: number;
  /** Extra speed-opening that fades out on slow cameras. */
  betaRate?: number;
  /** Prediction horizon cap, seconds. */
  maxLeadSec?: number;
  /** Prediction travel cap, NDC units. */
  maxLeadDist?: number;
}

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

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
  private ox = 0; // last emitted output (stale frames re-emit exactly this)
  private oy = 0;
  private vx = 0; // One Euro signal velocity (fast)
  private vy = 0;
  private tx = 0; // trend velocity for prediction (slow)
  private ty = 0;
  private px = 0; // previous raw sample
  private py = 0;
  private rate = 30; // measured tracking fps (EMA)
  // Undirected-noise estimator: consistent motion cancels in the signed
  // EMA but accumulates in the magnitude EMA; their ratio separates hand
  // tremor (random walk) from deliberate travel (persistent heading).
  private jx = 0;
  private jy = 0;
  private jm = 0;
  private jitter = 0; // undirected noise, NDC/sec (EMA)
  private speed = 0; // filtered pointer speed, NDC/sec

  constructor(opts: AdaptivePointerOpts = {}) {
    this.maxSpeed = opts.maxSpeed ?? 3.5;
    this.slowCutoff = opts.slowCutoff ?? 0.42;
    this.fastCutoff = opts.fastCutoff ?? 2.8;
    this.betaBase = opts.betaBase ?? 0.09;
    this.betaRate = opts.betaRate ?? 0.08;
    this.maxLeadSec = opts.maxLeadSec ?? 0.12;
    this.maxLeadDist = opts.maxLeadDist ?? 0.05;
  }

  /** Measured tracking rate (Hz). Drives every adaptive tuning. */
  get trackFps(): number {
    return this.rate;
  }

  /** Measured input noise (NDC/sec). Feeds the adaptive deadzone. */
  get jitterLevel(): number {
    return this.jitter;
  }

  /** Undirected noise per sample (NDC). Rest tremor, minus real travel. */
  get noisePerSample(): number {
    return this.jm * (1 - this.directedness());
  }

  private directedness(): number {
    const mag = Math.hypot(this.jx, this.jy);
    return mag / (this.jm + 1e-9) > 1 ? 1 : mag / (this.jm + 1e-9);
  }

  /** Filtered pointer speed (NDC/sec). */
  get pointerSpeed(): number {
    return this.speed;
  }

  get isInitialized(): boolean {
    return this.init;
  }

  reset(sample: PointerSample): void {
    this.fx = sample.x;
    this.fy = sample.y;
    this.ox = sample.x;
    this.oy = sample.y;
    this.vx = 0;
    this.vy = 0;
    this.tx = 0;
    this.ty = 0;
    this.px = sample.x;
    this.py = sample.y;
    this.speed = 0;
    this.init = true;
  }

  update<T extends PointerSample>(
    sample: PointerSample,
    dtMs: number,
    confidence: number,
    out: T,
  ): T {
    if (!this.init) {
      this.reset(sample);
      out.x = sample.x;
      out.y = sample.y;
      return out;
    }
    if (!(dtMs > 0)) {
      // Stale re-read or resumed stream with no time: re-emit the last
      // output bit-exact. The render loop may poll at 120 Hz while the
      // camera delivers 10 Hz — those polls must not pump velocity, decay
      // confidence, smear motion, or even drop the prediction lead.
      out.x = this.ox;
      out.y = this.oy;
      return out;
    }
    const dt = clamp(dtMs / 1000, 1 / 240, 0.5);
    const conf = clamp(confidence, 0, 1);

    // Online feed measurement: rate + undirected-noise estimate retune
    // the filter below. Deliberate travel must NOT count as noise.
    this.rate += (1 / dt - this.rate) * 0.08;
    const rawDx = sample.x - this.px;
    const rawDy = sample.y - this.py;
    const rawDist = Math.hypot(rawDx, rawDy);
    const oldPx = this.px;
    const oldPy = this.py;
    this.jx += (rawDx - this.jx) * 0.1;
    this.jy += (rawDy - this.jy) * 0.1;
    this.jm += (rawDist - this.jm) * 0.1;
    this.jitter = this.noisePerSample * Math.max(this.rate, 1);
    this.px = sample.x;
    this.py = sample.y;

    // Stage 1 — outlier gate. Genuine fast flicks still pass when the
    // sensor is confident (wider gate); low-confidence spikes get slid
    // back to the edge of plausibility instead of teleporting the ray.
    let gx = sample.x;
    let gy = sample.y;
    let spiked = false;
    const allow = this.maxSpeed * dt * (conf > 0.75 ? 1.6 : 1.0);
    if (rawDist > allow && allow > 1e-9) {
      const k = allow / rawDist;
      gx = oldPx + rawDx * k;
      gy = oldPy + rawDy * k;
      spiked = true;
    }

    // Stage 2 — confidence blend against the one-step motion reference.
    // Low-confidence frames lean on where the hand was heading; clean
    // frames pass through nearly untouched.
    const refX = this.fx + this.tx * dt;
    const refY = this.fy + this.ty * dt;
    const w = 0.35 + 0.65 * conf;
    const ex = refX + (gx - refX) * w;
    const ey = refY + (gy - refY) * w;

    // Stage 3 — rate-adaptive One Euro. Slow feeds smooth hard (each
    // sample is precious and noisy); fast feeds stay open and lively.
    // Measured jitter pushes the rest cutoff down further.
    const r01 = clamp((this.rate - 5) / 55, 0, 1);
    let rest = this.slowCutoff + (this.fastCutoff - this.slowCutoff) * Math.pow(r01, 1.5);
    rest /= 1 + Math.min(this.noisePerSample * 150, 2.5) * 1.2;
    rest = Math.max(0.1, rest);
    const beta = this.betaBase + this.betaRate * r01;
    const dcut = 0.6 + 1.2 * r01;

    const aD = euroAlpha(dcut, dt);
    this.vx += ((ex - this.fx) / dt - this.vx) * aD;
    this.vy += ((ey - this.fy) / dt - this.vy) * aD;
    const ax = euroAlpha(rest + beta * Math.abs(this.vx), dt);
    const ay = euroAlpha(rest + beta * Math.abs(this.vy), dt);
    const prevFx = this.fx;
    const prevFy = this.fy;
    this.fx += (ex - this.fx) * ax;
    this.fy += (ey - this.fy) * ay;

    // Stage 4 — slow trend velocity for prediction (immune to spikes: a
    // gated frame contributes at most `allow` worth of motion).
    const aV = euroAlpha(2.2, dt);
    const tvx = (this.fx - prevFx) / dt;
    const tvy = (this.fy - prevFy) / dt;
    this.tx += (tvx - this.tx) * aV;
    this.ty += (tvy - this.ty) * aV;
    this.speed += (Math.hypot(tvx, tvy) - this.speed) * aV;

    // Stage 5 — capped prediction. Hides ~1 frame of sensor latency on
    // slow cameras; the hard distance cap means it can never fling the
    // ray. Skipped on spikes, gaps, and near-zero confidence.
    let ox = this.fx;
    let oy = this.fy;
    if (!spiked && conf >= 0.35 && dtMs <= 200 && this.speed > 1e-4) {
      const lead = Math.min(2.0 / Math.max(this.rate, 5), this.maxLeadSec);
      let lx = this.tx * lead;
      let ly = this.ty * lead;
      const ld = Math.hypot(lx, ly);
      if (ld > this.maxLeadDist && ld > 1e-9) {
        const k = this.maxLeadDist / ld;
        lx *= k;
        ly *= k;
      }
      ox += lx;
      oy += ly;
    }
    out.x = ox;
    out.y = oy;
    this.ox = ox;
    this.oy = oy;
    return out;
  }
}
