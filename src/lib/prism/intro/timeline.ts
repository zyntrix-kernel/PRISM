import type {
  IntroMemberIndex,
  IntroScene,
  IntroTimelineCue,
} from "./types";

export interface IntroPhase {
  readonly id: IntroScene;
  readonly start: number;
  readonly end: number;
}

export const INTRO_PHASES: readonly IntroPhase[] = [
  { id: "boot", start: 0, end: 850 },
  { id: "physics", start: 850, end: 3000 },
  { id: "chemistry", start: 3000, end: 5250 },
  { id: "mathematics", start: 5250, end: 7500 },
  { id: "synthesis", start: 7500, end: 9250 },
  { id: "labs", start: 9250, end: 10400 },
  { id: "prism", start: 10400, end: 11800 },
  { id: "team", start: 11800, end: 14800 },
  { id: "launch", start: 14800, end: 15800 },
  { id: "complete", start: 15800, end: 16000 },
];

export const TOTAL_TIMELINE_MS = 16000;

export const INTRO_CUES: readonly IntroTimelineCue[] = [
  { id: "boot.begin", at: 0, scene: "boot", member: -1 },
  { id: "physics.ignite", at: 850, scene: "physics", member: -1 },
  { id: "chemistry.form", at: 3000, scene: "chemistry", member: -1 },
  { id: "math.unfold", at: 5250, scene: "mathematics", member: -1 },
  { id: "synthesis.begin", at: 7500, scene: "synthesis", member: -1 },
  { id: "labs.reveal", at: 9250, scene: "labs", member: -1 },
  { id: "prism.reveal", at: 10400, scene: "prism", member: -1 },
  { id: "team.tanay", at: 11800, scene: "team", member: 0 },
  { id: "team.ashwin", at: 12550, scene: "team", member: 1 },
  { id: "team.debroop", at: 13300, scene: "team", member: 2 },
  { id: "team.maaz", at: 14050, scene: "team", member: 3 },
  { id: "launch.collapse", at: 14800, scene: "launch", member: 3 },
  { id: "complete", at: 15800, scene: "complete", member: 3 },
];

export function resolveScene(
  elapsedMs: number,
): { scene: IntroScene; member: IntroMemberIndex } {
  if (elapsedMs < 850) return { scene: "boot", member: -1 };
  if (elapsedMs < 3000) return { scene: "physics", member: -1 };
  if (elapsedMs < 5250) return { scene: "chemistry", member: -1 };
  if (elapsedMs < 7500) return { scene: "mathematics", member: -1 };
  if (elapsedMs < 9250) return { scene: "synthesis", member: -1 };
  if (elapsedMs < 10400) return { scene: "labs", member: -1 };
  if (elapsedMs < 11800) return { scene: "prism", member: -1 };

  if (elapsedMs < 14800) {
    if (elapsedMs < 12550) return { scene: "team", member: 0 };
    if (elapsedMs < 13300) return { scene: "team", member: 1 };
    if (elapsedMs < 14050) return { scene: "team", member: 2 };
    return { scene: "team", member: 3 };
  }

  if (elapsedMs < 15800) return { scene: "launch", member: 3 };
  return { scene: "complete", member: 3 };
}

export function phaseProgress(elapsedMs: number): number {
  const phase = getPhase(elapsedMs);
  return Math.min(
    1,
    Math.max(
      0,
      (elapsedMs - phase.start) / Math.max(1, phase.end - phase.start),
    ),
  );
}

export function getPhase(elapsedMs: number): IntroPhase {
  for (const phase of INTRO_PHASES) {
    if (elapsedMs >= phase.start && elapsedMs < phase.end) {
      return phase;
    }
  }

  return INTRO_PHASES[INTRO_PHASES.length - 1];
}
