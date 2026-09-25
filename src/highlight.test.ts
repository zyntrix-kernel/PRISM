// Regression tests for group-safe highlight: the drive preset's car is a
// Group (no .material), which used to throw
// "Cannot use 'in' operator to search for 'emissiveIntensity' in undefined".

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { pinchRingScale, setEmissiveBoost } from './highlight';

function standard(color: number, intensity: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity });
}

describe('setEmissiveBoost', () => {
  it('boosts and restores a single mesh to its own base', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), standard(0xff0000, 0.35));
    setEmissiveBoost(mesh, 0.9);
    expect((mesh.material as THREE.MeshStandardMaterial).emissiveIntensity).toBe(0.9);
    setEmissiveBoost(mesh, null);
    expect((mesh.material as THREE.MeshStandardMaterial).emissiveIntensity).toBeCloseTo(0.35, 8);
  });

  it('boosts every emissive descendant of a Group without throwing', () => {
    const group = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), standard(0xff0000, 0.35));
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x00ff00 }), // no emissive: skipped
    );
    const nested = new THREE.Group();
    const c = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), standard(0x0000ff, 0.6));
    nested.add(c);
    group.add(a, b, nested);
    expect(() => setEmissiveBoost(group, 0.9)).not.toThrow();
    expect((a.material as THREE.MeshStandardMaterial).emissiveIntensity).toBe(0.9);
    expect((c.material as THREE.MeshStandardMaterial).emissiveIntensity).toBe(0.9);
    expect(() => setEmissiveBoost(group, null)).not.toThrow();
    // Each material restores its OWN base (not a hardcoded value).
    expect((a.material as THREE.MeshStandardMaterial).emissiveIntensity).toBeCloseTo(0.35, 8);
    expect((c.material as THREE.MeshStandardMaterial).emissiveIntensity).toBeCloseTo(0.6, 8);
  });

  it('ignores null and empty groups', () => {
    expect(() => setEmissiveBoost(null, 0.9)).not.toThrow();
    expect(() => setEmissiveBoost(new THREE.Group(), 0.9)).not.toThrow();
  });
});

describe('pinchRingScale', () => {
  it('is wide open at rest and cinched at full touch', () => {
    expect(pinchRingScale(0)).toBeCloseTo(2.6, 8);
    expect(pinchRingScale(1)).toBeCloseTo(1, 8);
  });

  it('shrinks monotonically and clamps outside 0..1', () => {
    expect(pinchRingScale(0.5)).toBeGreaterThan(pinchRingScale(0.9));
    expect(pinchRingScale(-2)).toBe(pinchRingScale(0));
    expect(pinchRingScale(5)).toBe(pinchRingScale(1));
  });
});
