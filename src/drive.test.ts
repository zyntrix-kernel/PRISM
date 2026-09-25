// Unit tests for the arcade car physics: steering sign convention,
// throttle/brake behavior, and lap counting.

import { describe, expect, it } from 'vitest';
import { LapTracker, stepCar, trackAngle, wrapPi, type CarState } from './presets/drive';

const DT = 1 / 60;

function freshCar(): CarState {
  return { x: 9, z: 0, heading: 0, speed: 0 };
}

describe('wrapPi', () => {
  it('wraps to [-π, π]', () => {
    expect(wrapPi(Math.PI + 0.5)).toBeCloseTo(-Math.PI + 0.5, 8);
    expect(wrapPi(-Math.PI - 0.5)).toBeCloseTo(Math.PI - 0.5, 8);
    expect(wrapPi(0.3)).toBeCloseTo(0.3, 8);
  });
});

describe('stepCar', () => {
  it('accelerates while throttling and coasts to a stop otherwise', () => {
    const c = freshCar();
    for (let i = 0; i < 60; i++) stepCar(c, { steer: 0, throttle: 1, brake: false }, DT);
    expect(c.speed).toBeGreaterThan(3);
    const v = c.speed;
    for (let i = 0; i < 3600; i++) stepCar(c, { steer: 0, throttle: 0, brake: false }, DT);
    expect(c.speed).toBeLessThan(v * 0.05);
  });

  it('brakes hard to exactly zero (no reverse creep)', () => {
    const c = freshCar();
    c.speed = 10;
    for (let i = 0; i < 240; i++) stepCar(c, { steer: 0, throttle: 0, brake: true }, DT);
    expect(c.speed).toBe(0);
  });

  it('steers screen-right when pointing right (heading grows from +Z)', () => {
    const c = freshCar();
    c.speed = 10;
    stepCar(c, { steer: 1, throttle: 0, brake: false }, 0.5);
    // Nose rotates from +Z toward +X: x increases, z decreases.
    expect(c.x).toBeGreaterThan(9);
    expect(c.heading).toBeGreaterThan(0);
  });

  it('steers symmetrically to the left', () => {
    const a = freshCar();
    const b = freshCar();
    a.speed = 10;
    b.speed = 10;
    stepCar(a, { steer: 1, throttle: 0, brake: false }, 0.5);
    stepCar(b, { steer: -1, throttle: 0, brake: false }, 0.5);
    expect(a.heading).toBeCloseTo(-b.heading, 8);
  });

  it('counter-steers in reverse like a real car', () => {
    const c = freshCar();
    c.speed = -5;
    stepCar(c, { steer: 1, throttle: 0, brake: false }, 0.5);
    expect(c.heading).toBeLessThan(0);
  });

  it('treats the gas pedal as analog (half throttle, half pace)', () => {
    const full = freshCar();
    const half = freshCar();
    for (let i = 0; i < 120; i++) {
      stepCar(full, { steer: 0, throttle: 1, brake: false }, DT);
      stepCar(half, { steer: 0, throttle: 0.5, brake: false }, DT);
    }
    expect(half.speed).toBeGreaterThan(0);
    expect(half.speed).toBeLessThan(full.speed);
  });

  it('clamps speed to the given max (off-track slowdown)', () => {
    const c = freshCar();
    for (let i = 0; i < 600; i++) stepCar(c, { steer: 0, throttle: 1, brake: false }, DT, 6);
    expect(c.speed).toBeLessThanOrEqual(6.01);
  });
});

describe('trackAngle', () => {
  it('is 0 at the start line and π/2 at the top of the ellipse', () => {
    expect(trackAngle(9, 0)).toBeCloseTo(0, 8);
    expect(trackAngle(0, 6)).toBeCloseTo(Math.PI / 2, 8);
  });
});

describe('LapTracker', () => {
  it('counts a full forward lap and ignores line straddling', () => {
    const laps = new LapTracker();
    laps.reset(0);
    let now = 0;
    // Drive a full ellipse forward in small steps (ending just past the line,
    // as a real frame update would).
    for (let i = 0; i <= 205; i++) {
      const phi = (i / 200) * Math.PI * 2;
      now += 0.2;
      laps.update(Math.cos(phi) * 9, Math.sin(phi) * 6, now);
    }
    expect(laps.laps).toBe(1);
    // The lap completed when the angle first wrapped (i=200 → t=40.2s).
    expect(laps.lastLapTime).toBeCloseTo(40.2, 0);
    // Jitter back and forth across the line: no extra lap.
    for (let i = 0; i < 40; i++) {
      now += 0.1;
      laps.update(9 + (i % 2 === 0 ? 0.05 : -0.05), 0.01, now);
    }
    expect(laps.laps).toBe(1);
  });

  it('does not count backward driving as laps', () => {
    const laps = new LapTracker();
    laps.reset(0);
    let now = 0;
    for (let i = 0; i <= 200; i++) {
      const phi = -(i / 200) * Math.PI * 2;
      now += 0.2;
      laps.update(Math.cos(phi) * 9, Math.sin(phi) * 6, now);
    }
    expect(laps.laps).toBe(0);
  });
});
