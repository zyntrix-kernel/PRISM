// Unit tests for the contextual coach: one hint per state, priority order.

import { describe, expect, it } from 'vitest';
import { baseCoachHint, type CoachState } from './coach';

function state(over: Partial<CoachState> = {}): CoachState {
  return {
    mode: 'hand',
    gesture: 'POINT',
    pinching: false,
    hovered: null,
    grabbed: null,
    twoHand: false,
    cameraOn: true,
    preset: 'space',
    touch: false,
    ...over,
  };
}

describe('baseCoachHint', () => {
  it('guides input-less states first', () => {
    expect(baseCoachHint(state({ mode: 'none', cameraOn: false }))).toContain('mouse');
    expect(baseCoachHint(state({ mode: 'none', cameraOn: false, touch: true }))).toContain('Touch');
    expect(baseCoachHint(state({ mode: 'none', cameraOn: true }))).toContain('Hand lost');
  });

  it('narrates transforms and grabs', () => {
    expect(baseCoachHint(state({ twoHand: true }))).toContain('zoom');
    expect(baseCoachHint(state({ grabbed: 'Earth' }))).toContain('Earth');
  });

  it('offers the grab on hover, verb-matched to input', () => {
    expect(baseCoachHint(state({ hovered: 'Mars' }))).toBe('Pinch to grab Mars');
    expect(baseCoachHint(state({ hovered: 'Mars', mode: 'mouse' }))).toBe('Hold click to grab Mars');
  });

  it('falls back to per-preset idle lines', () => {
    expect(baseCoachHint(state({ preset: 'voxel' }))).toContain('Tap');
    expect(baseCoachHint(state({ preset: 'drive' }))).toContain('gas');
    expect(baseCoachHint(state({ preset: 'unknown' }))).toBe('Point to explore');
  });
});
