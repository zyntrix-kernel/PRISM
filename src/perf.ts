// FPS governor: the backstop that keeps PRISM smooth on unknown hardware.
// Detection picks the starting tier; this watches actual frame times and
// steps quality DOWN when the machine can't hold ~28 fps. Never steps up
// on its own (avoids oscillation) — the user can always raise it manually.

import type { QualityTier } from './config';

const ORDER: QualityTier[] = ['low', 'medium', 'high'];

export class PerfGovernor {
  private ema = 60;
  private lowTime = 0;
  private appliedTier: QualityTier;

  constructor(
    initial: QualityTier,
    private readonly onTier: (tier: QualityTier) => void,
    private readonly floorFps = 28,
    private readonly holdSeconds = 2.5,
  ) {
    this.appliedTier = initial;
  }

  get tier(): QualityTier {
    return this.appliedTier;
  }

  /** Re-anchor after a manual quality change (resets all timers). */
  rebase(tier: QualityTier): void {
    this.appliedTier = tier;
    this.lowTime = 0;
    this.ema = 60;
  }

  /** Feed every rendered frame; returns the active tier. */
  update(dtSeconds: number): QualityTier {
    if (dtSeconds > 0) {
      const fps = 1 / dtSeconds;
      this.ema += (fps - this.ema) * 0.06;
    }
    if (this.ema < this.floorFps) {
      this.lowTime += dtSeconds;
    } else {
      this.lowTime = 0;
    }
    const idx = ORDER.indexOf(this.appliedTier);
    if (this.lowTime >= this.holdSeconds && idx > 0) {
      this.appliedTier = ORDER[idx - 1];
      this.lowTime = 0;
      // Snap the average to the floor so a second step needs fresh evidence.
      this.ema = this.floorFps;
      this.onTier(this.appliedTier);
    }
    return this.appliedTier;
  }
}
