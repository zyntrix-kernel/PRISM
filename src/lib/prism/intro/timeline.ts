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
  { id: "boot", start: 0, end: 900 },
  { id: "field", start: 900, end: 2200 },
  { id: "crystallize", start: 2200, end: 3500 },
  { id: "labs", start: 3500, end: 5000 },
  { id: "prism", start: 5000, end: 6250 },
  { id: "definition", start: 6250, end: 7700 },
  { id: "team", start: 7700, end: 10950 },
  { id: "launch", start: 10950, end: 12550 },
  { id: "complete", start: 12550, end: 13200 },
];

export const INTRO_CUES: readonly IntroTimelineCue[] = [
  { id: "boot.begin", at: 0, scene: "boot", member: -1 },
  { id: "field.awaken", at: 900, scene: "field", member: -1 },
  { id: "crystal.form", at: 2200, scene: "crystallize", member: -1 },
  { id: "labs.reveal", at: 3500, scene: "labs", member: -1 },
  { id: "prism.reveal", at: 5000, scene: "prism", member: -1 },
  { id: "definition.reveal", at: 6250, scene: "definition", member: -1 },
  { id: "team.tanay", at: 7700, scene: "team", member: 0 },
  { id: "team.ashwin", at: 8880, scene: "team", member: 1 },
  { id: "team.debroop", at: 9940, scene: "team", member: 2 },
  { id: "launch.collapse", at: 10950, scene: "launch", member: 2 },
  { id: "complete", at: 12550, scene: "complete", member: 2 },
];

export function resolveScene(
  elapsedMs: number,
): { scene: IntroScene; member: IntroMemberIndex } {
  const t = elapsedMs;

  if (t < 900) return { scene: "boot", member: -1 };
  if (t < 2200) return { scene: "field", member: -1 };
  if (t < 3500) return { scene: "crystallize", member: -1 };
  if (t < 5000) return { scene: "labs", member: -1 };
  if (t < 6250) return { scene: "prism", member: -1 };
  if (t < 7700) return { scene: "definition", member: -1 };
  if (t < 10950) {
    if (t < 8880) return { scene: "team", member: 0 };
    if (t < 9940) return { scene: "team", member: 1 };
    return { scene: "team", member: 2 };
  }
  if (t < 12550) return { scene: "launch", member: 2 };
  return { scene: "complete", member: 2 };
}

export function phaseProgress(
  elapsedMs: number,
): number {
  const phase = getPhase(elapsedMs);
  return Math.min(
    1,
    Math.max(
      0,
      (elapsedMs - phase.start) /
        Math.max(1, phase.end - phase.start),
    ),
  );
}

export function getPhase(
  elapsedMs: number,
): IntroPhase {
  for (const phase of INTRO_PHASES) {
    if (
      elapsedMs >= phase.start &&
      elapsedMs < phase.end
    ) {
      return phase;
    }
  }

  return INTRO_PHASES[INTRO_PHASES.length - 1];
}
