// TEST preset: the original three-orb calibration rig. Free plane-drag,
// no orbits, no tricks — for tuning pinch and smoothing.

import * as THREE from 'three';
import { disposeGroup, type BuilderCtx, type WorldAPI } from './types';

const ORBS = [
  { name: 'Helios', color: 0x00c8ff, pos: new THREE.Vector3(-1.6, 0.3, 0) },
  { name: 'Prism Core', color: 0xb46bff, pos: new THREE.Vector3(0, 0, 0), big: true },
  { name: 'Sol', color: 0xffb347, pos: new THREE.Vector3(1.6, -0.3, 0) },
];

export function buildTest(ctx: BuilderCtx): WorldAPI {
  const { world } = ctx;
  const grabbables: THREE.Object3D[] = [];
  const geo = new THREE.SphereGeometry(0.42, 48, 32);
  let elapsed = 0;

  for (const def of ORBS) {
    const mat = new THREE.MeshStandardMaterial({
      color: def.color,
      emissive: def.color,
      emissiveIntensity: 0.25,
      roughness: 0.35,
      metalness: 0.1,
    });
    const orb = new THREE.Mesh(geo, mat);
    const scale = def.big ? 1.35 : 1.0;
    orb.scale.setScalar(scale);
    orb.position.copy(def.pos);
    orb.name = def.name;
    world.add(orb);
    grabbables.push(orb);
  }

  const grid = new THREE.GridHelper(12, 24, 0x0e3a4a, 0x0a1c2a);
  grid.position.y = -1.8;
  world.add(grid);

  return {
    grabbables,
    background: 0x04060d,
    view: { distance: 6, pitch: 0.12, yaw: 0 },
    update(dt: number): void {
      elapsed += dt;
      for (const orb of grabbables as THREE.Mesh[]) {
        if (orb.userData.grabbed) continue;
        orb.position.y += Math.sin(elapsed * 1.2 + orb.position.x * 1.7) * 0.0009;
        orb.rotation.y += dt * 0.25;
      }
    },
    bodyInfo(name: string | null): string | null {
      return name ? `${name} — test orb, pinch to grab` : null;
    },
    dispose(): void {
      disposeGroup(world);
    },
  };
}
