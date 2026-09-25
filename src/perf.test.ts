// Unit tests for the FPS governor: steps down on sustained slow frames,
// ignores blips, never steps up, floors at Low.

import { describe, expect, it } from 'vitest';
import { PerfGovernor } from './perf';

describe('PerfGovernor', () => {
  it('steps down high → medium → low under sustained 20 fps', () => {
    const seen: string[] = [];
    const g = new PerfGovernor('high', (t) => seen.push(t));
    for (let i = 0; i < 200; i++) g.update(1 / 20);
    expect(g.tier).toBe('low');
    expect(seen).toEqual(['medium', 'low']);
  });

  it('ignores brief dips below the floor', () => {
    const seen: string[] = [];
    const g = new PerfGovernor('high', (t) => seen.push(t));
    for (let i = 0; i < 30; i++) g.update(1 / 20); // 1.5 s < 2.5 s hold
    expect(g.tier).toBe('high');
    expect(seen).toEqual([]);
  });

  it('never steps up and never drops below low', () => {
    const seen: string[] = [];
    const g = new PerfGovernor('low', (t) => seen.push(t));
    for (let i = 0; i < 600; i++) g.update(1 / 20);
    for (let i = 0; i < 600; i++) g.update(1 / 120);
    expect(g.tier).toBe('low');
    expect(seen).toEqual([]);
  });

  it('rebases cleanly after a manual quality change', () => {
    const seen: string[] = [];
    const g = new PerfGovernor('low', (t) => seen.push(t));
    g.rebase('high');
    expect(g.tier).toBe('high');
    for (let i = 0; i < 200; i++) g.update(1 / 20);
    expect(seen).toEqual(['medium', 'low']);
  });
});
