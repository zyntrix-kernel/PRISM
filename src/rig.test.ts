// Unit tests for impact shake: clamps, decays, and settles bit-exact.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraRig } from './scene';

function rigAndCamera(): { rig: CameraRig; cam: THREE.PerspectiveCamera } {
  const rig = new CameraRig();
  const cam = new THREE.PerspectiveCamera(55, 1, 0.1, 300);
  rig.update(0.016, cam);
  return { rig, cam };
}

describe('CameraRig shake', () => {
  it('clamps trauma to 0..1 and ignores negative kicks', () => {
    const { rig } = rigAndCamera();
    expect(rig.traumaLevel).toBe(0);
    rig.addShake(5);
    expect(rig.traumaLevel).toBe(1);
    rig.addShake(-2);
    expect(rig.traumaLevel).toBe(1);
  });

  it('perturbs while hot and settles bit-exact with zero drift', () => {
    const { rig, cam } = rigAndCamera();
    const rest = cam.position.clone();
    rig.addShake(0.8);
    rig.update(0.016, cam);
    expect(cam.position.distanceTo(rest)).toBeGreaterThan(1e-6);
    rig.update(30, cam); // long decay: trauma snaps exactly to 0
    expect(rig.traumaLevel).toBe(0);
    rig.update(0.016, cam); // one clean frame sheds the last shake offset
    const home = cam.position.clone();
    rig.update(0.016, cam);
    expect(cam.position.distanceTo(home)).toBe(0);
  });
});
