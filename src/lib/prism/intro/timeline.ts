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
  { id: "physics", start: 900, end: 3300 },
  { id: "chemistry", start: 3300, end: 5800 },
  { id: "mathematics", start: 5800, end: 8500 },
  { id: "information", start: 8500, end: 10000 },
  { id: "synthesis", start: 10000, end: 11900 },
  { id: "labs", start: 11900, end: 13200 },
  { id: "prism", start: 13200, end: 14700 },
  { id: "team", start: 14700, end: 18100 },
  { id: "launch", start: 18100, end: 19000 },
  { id: "complete", start: 19000, end: 19200 },
];

export const TOTAL_TIMELINE_MS = 19200;

export const INTRO_CUES: readonly IntroTimelineCue[] = [
  { id: "boot.signal", at: 0, scene: "boot", member: -1 },
  { id: "physics.ignite", at: 900, scene: "physics", member: -1 },
  { id: "chemistry.form", at: 3300, scene: "chemistry", member: -1 },
  { id: "math.unfold", at: 5800, scene: "mathematics", member: -1 },
  { id: "information.link", at: 8500, scene: "information", member: -1 },
  { id: "synthesis.begin", at: 10000, scene: "synthesis", member: -1 },
  { id: "labs.reveal", at: 11900, scene: "labs", member: -1 },
  { id: "prism.reveal", at: 13200, scene: "prism", member: -1 },
  { id: "team.tanay", at: 14700, scene: "team", member: 0 },
  { id: "team.ashwin", at: 15550, scene: "team", member: 1 },
  { id: "team.debroop", at: 16400, scene: "team", member: 2 },
  { id: "team.maaz", at: 17250, scene: "team", member: 3 },
  { id: "launch.collapse", at: 18100, scene: "launch", member: 3 },
  { id: "complete", at: 19000, scene: "complete", member: 3 },
];

export function resolveScene(
  elapsedMs: number,
): { scene: IntroScene; member: IntroMemberIndex } {
  if (elapsedMs < 900) return { scene: "boot", member: -1 };
  if (elapsedMs < 3300) return { scene: "physics", member: -1 };
  if (elapsedMs < 5800) return { scene: "chemistry", member: -1 };
  if (elapsedMs < 8500) return { scene: "mathematics", member: -1 };
  if (elapsedMs < 10000) return { scene: "information", member: -1 };
  if (elapsedMs < 11900) return { scene: "synthesis", member: -1 };
  if (elapsedMs < 13200) return { scene: "labs", member: -1 };
  if (elapsedMs < 14700) return { scene: "prism", member: -1 };

  if (elapsedMs < 18100) {
    if (elapsedMs < 15550) return { scene: "team", member: 0 };
    if (elapsedMs < 16400) return { scene: "team", member: 1 };
    if (elapsedMs < 17250) return { scene: "team", member: 2 };
    return { scene: "team", member: 3 };
  }

  if (elapsedMs < 19000) return { scene: "launch", member: 3 };
  return { scene: "complete", member: 3 };
}

export function getPhase(elapsedMs: number): IntroPhase {
  for (const phase of INTRO_PHASES) {
    if (elapsedMs >= phase.start && elapsedMs < phase.end) return phase;
  }
  return INTRO_PHASES[INTRO_PHASES.length - 1];
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
