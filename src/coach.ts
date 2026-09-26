// Contextual coach: exactly one line telling the user what to do next.
// Pure function of observable state (unit-tested); worlds may override via
// WorldAPI.coachHint for preset-specific flows (drive easy mode, voxel).

export interface CoachState {
  mode: 'hand' | 'mouse' | 'none';
  gesture: string;
  pinching: boolean;
  hovered: string | null;
  grabbed: string | null;
  twoHand: boolean;
  cameraOn: boolean;
  preset: string;
  /** Touch-first device: verbs must say touch, never mouse. */
  touch: boolean;
}

/** Fallback hints per preset when nothing specific is happening. */
const IDLE_HINTS: Record<string, string> = {
  space: 'Point at a planet, pinch to grab it',
  blocks: 'Drag a block to move it',
  test: 'Pinch an orb to grab it',
  singularity: 'Drag a probe to a new orbit',
  atom: 'Drag an electron to another shell',
  voxel: 'Tap pinch = place · hold = break',
  drive: 'Pinch = gas · release = coast',
};

/**
 * Returns the current hint, or null to hide the pill. Priority order is
 * deliberate: tracking state beats everything (no input possible without
 * it), then active transforms, then grabs, then targets, then idle.
 */
export function baseCoachHint(s: CoachState): string | null {
  if (s.mode === 'none') {
    if (s.cameraOn) return 'Hand lost — show it to the camera';
    return s.touch ? 'Touch the scene to point, or enable the camera' : 'Move the mouse, or enable the camera';
  }
  if (s.twoHand) return 'Spread / pinch to zoom · twist to rotate';
  if (s.grabbed) return `Moving ${s.grabbed} — release to drop`;
  if (s.hovered && !s.pinching) {
    const verb = s.mode === 'mouse' ? 'Hold click to grab' : 'Pinch to grab';
    return `${verb} ${s.hovered}`;
  }
  return IDLE_HINTS[s.preset] ?? 'Point to explore';
}
