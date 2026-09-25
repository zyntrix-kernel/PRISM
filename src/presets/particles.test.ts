// Unit tests for the pooled particle system.

import { describe, expect, it } from 'vitest';
import { ParticlePool } from './particles';

describe('ParticlePool', () => {
  it('spawns and fades particles over their TTL', () => {
    const pool = new ParticlePool(8, 0xffffff, 0.4, 1.2, 1.0);
    expect(pool.aliveCount).toBe(0);
    pool.spawn(0, 0, 0, 0, 1, 0);
    pool.spawn(1, 0, 0, 0, 1, 0);
    expect(pool.aliveCount).toBe(2);
    pool.update(0.5);
    expect(pool.aliveCount).toBe(2);
    pool.update(0.6);
    expect(pool.aliveCount).toBe(0);
  });

  it('recycles the oldest slot when over capacity (never grows)', () => {
    const pool = new ParticlePool(4, 0xffffff, 0.4);
    for (let i = 0; i < 10; i++) pool.spawn(i, 0, 0, 0, 0, 0);
    expect(pool.aliveCount).toBe(4);
    expect(pool.capacity).toBe(4);
  });

  it('rises (buoyancy) while alive', () => {
    const pool = new ParticlePool(4, 0xffffff, 0.4, 2.0, 5.0);
    pool.spawn(0, 0, 0, 0, 0, 0);
    pool.update(1.0);
    const y = (pool.points.geometry.getAttribute('position') as { getY(i: number): number }).getY(0);
    expect(y).toBeGreaterThan(0);
  });
});
