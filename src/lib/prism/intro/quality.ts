import type {
  IntroQuality,
  IntroQualityProfile,
  IntroQualityState,
} from "./types";

const PROFILES: Record<
  Exclude<IntroQuality, "auto">,
  IntroQualityProfile
> = {
  ultra: {
    pixelRatio: 1.5,
    starCount: 3200,
    dustCount: 900,
    lineCount: 42,
    bloomStrength: 1.22,
    bloomRadius: 0.68,
    bloomThreshold: 0.54,
    postFx: true,
    motionScale: 1,
  },
  high: {
    pixelRatio: 1.35,
    starCount: 2200,
    dustCount: 650,
    lineCount: 34,
    bloomStrength: 1.04,
    bloomRadius: 0.58,
    bloomThreshold: 0.62,
    postFx: true,
    motionScale: 1,
  },
  medium: {
    pixelRatio: 1.15,
    starCount: 1450,
    dustCount: 420,
    lineCount: 26,
    bloomStrength: 0.86,
    bloomRadius: 0.48,
    bloomThreshold: 0.7,
    postFx: true,
    motionScale: 0.92,
  },
  low: {
    pixelRatio: 1,
    starCount: 760,
    dustCount: 180,
    lineCount: 16,
    bloomStrength: 0.62,
    bloomRadius: 0.4,
    bloomThreshold: 0.8,
    postFx: false,
    motionScale: 0.78,
  },
};

export function chooseIntroTier(
  requested: IntroQuality,
  reducedMotion: boolean,
): Exclude<IntroQuality, "auto"> {
  if (requested !== "auto") return requested;
  if (reducedMotion) return "low";

  try {
    const cores =
      navigator.hardwareConcurrency || 8;

    const memory =
      typeof (navigator as Navigator & { deviceMemory?: number })
        .deviceMemory === "number"
        ? (
            navigator as Navigator & {
              deviceMemory?: number;
            }
          ).deviceMemory ?? 8
        : 8;

    const touch =
      navigator.maxTouchPoints > 0;

    const area =
      window.innerWidth *
      window.innerHeight;

    if (
      touch &&
      area >= 1800 * 1000 &&
      cores >= 8 &&
      memory >= 8
    ) {
      return "high";
    }

    if (
      cores >= 12 &&
      memory >= 16 &&
      area >= 2000 * 1100
    ) {
      return "ultra";
    }

    if (
      cores >= 6 &&
      memory >= 8
    ) {
      return "high";
    }

    if (
      cores >= 4 &&
      memory >= 4
    ) {
      return "medium";
    }
  } catch {
    /* Conservative fallback. */
  }

  return "medium";
}

export function createQualityState(
  requested: IntroQuality,
  reducedMotion: boolean,
): IntroQualityState {
  const actualTier =
    chooseIntroTier(
      requested,
      reducedMotion,
    );

  const dpr =
    Math.min(
      window.devicePixelRatio || 1,
      PROFILES[actualTier].pixelRatio,
    );

  return {
    profile: PROFILES[actualTier],
    actualTier,
    fps: 60,
    dpr,
  };
}

export function downgradeQuality(
  state: IntroQualityState,
): IntroQualityState {
  const order: Array<
    Exclude<IntroQuality, "auto">
  > = [
    "ultra",
    "high",
    "medium",
    "low",
  ];

  const index =
    order.indexOf(
      state.actualTier,
    );

  const next =
    order[
      Math.min(
        order.length - 1,
        index + 1,
      )
    ];

  return {
    ...state,
    actualTier: next,
    profile: PROFILES[next],
    dpr: Math.min(
      state.dpr,
      PROFILES[next].pixelRatio,
    ),
  };
}

export function qualityLabel(
  state: IntroQualityState,
): string {
  return (
    state.actualTier.toUpperCase() +
    " / " +
    Math.round(state.fps) +
    " FPS"
  );
}
