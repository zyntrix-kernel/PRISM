export const PRISM_EXPERIENCE = {
  identity: {
    product: "PRISM",
    studio: "ZYNASH LABS",
    descriptor: "Projected Reality Interaction & Spatial Manipulation",
  },
  performance: {
    mobileCameraWidth: 640,
    mobileCameraHeight: 480,
    mobileInferenceMs: 180,
    tabletInferenceMs: 110,
    maxInteractiveParticles: 1800,
    hiddenScenePause: true,
  },
  motion: {
    spring: { stiffness: 170, damping: 24, mass: 0.9 },
    micro: { stiffness: 300, damping: 28, mass: 0.55 },
    cinematic: { stiffness: 90, damping: 22, mass: 1.1 },
  },
  materials: {
    surface: "rgba(9, 18, 31, .62)",
    elevated: "rgba(15, 29, 48, .78)",
    hairline: "rgba(198, 231, 255, .16)",
    glow: "rgba(83, 196, 255, .22)",
  },
} as const;

export type PrismExperience = typeof PRISM_EXPERIENCE;
