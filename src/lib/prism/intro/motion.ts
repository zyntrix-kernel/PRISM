/**
 * PRISM motion language.
 *
 * Tuned from the vendored LottieFiles motion-design guidance:
 * premium personality, decelerating entrances, accelerating exits,
 * deliberate staging, and restrained ambient motion.
 */

export const PRISM_MOTION = {
  signatureBezier: [0.2, 0, 0, 1] as const,
  dramaticBezier: [0.05, 0.7, 0.1, 1] as const,
  exitBezier: [0.3, 0, 1, 1] as const,
  durations: {
    quick: 180,
    standard: 420,
    dramatic: 820,
  },
  choreography: {
    dramaticStagger: 140,
    microStagger: 28,
    ambientScale: 0.22,
  },
  material: {
    glass: { durationScale: 0.9, overshoot: 0 },
    fluid: { durationScale: 1.5, overshoot: 0.05 },
    rigid: { durationScale: 1.2, overshoot: 0 },
  },
} as const;

export function dramaticEaseOut(value:number):number {
  const x=Math.min(1,Math.max(0,value));
  const inv=1-x;
  return 1-inv*inv*inv;
}

export function emphasizedEaseOut(value:number):number {
  const x=Math.min(1,Math.max(0,value));
  const inv=1-x;
  return 1-inv*inv*inv*inv;
}

/** Three-layer motion budget: primary hero, secondary support, ambient field. */
export function motionLayers(primary:number):{
  primary:number;
  secondary:number;
  ambient:number;
}{
  const p=Math.min(1,Math.max(0,primary));
  return {
    primary:p,
    secondary:p*0.46,
    ambient:p*PRISM_MOTION.choreography.ambientScale,
  };
}

/**
 * Keeps a reveal inside the motion-design 1/3 distance rule by introducing
 * a midpoint keyframe rather than traversing the whole screen in one jump.
 */
export function stagedTravel(value:number):number {
  const x=Math.min(1,Math.max(0,value));
  if(x<0.5){
    const local=x*2;
    return emphasizedEaseOut(local)*0.5;
  }
  const local=(x-0.5)*2;
  return 0.5+dramaticEaseOut(local)*0.5;
}
