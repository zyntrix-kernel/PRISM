// BLOCK preset: voxel playground. Grab cubes, drag them anywhere, release
// to snap onto the 0.6-unit grid and stack towers on the baseplate.

import * as THREE from 'three';
import { disposeGroup, type BuilderCtx, type WorldAPI } from './types';

const VOXELS: Array<{ name: string; color: number; pos: [number, number, number] }> = [
  { name: 'Red voxel', color: 0xe04848, pos: [-1.8, 0.3, 0.6] },
  { name: 'Orange voxel', color: 0xe08a3a, pos: [-0.6, 0.3, 1.2] },
  { name: 'Gold voxel', color: 0xe8c84a, pos: [0.6, 0.3, 0.6] },
  { name: 'Green voxel', color: 0x58c858, pos: [1.8, 0.3, 1.2] },
  { name: 'Blue voxel', color: 0x4878e8, pos: [-1.2, 0.3, -1.2] },
  { name: 'Violet voxel', color: 0x9a5ce0, pos: [0, 0.3, -1.2] },
  { name: 'White voxel', color: 0xd8dce8, pos: [1.2, 0.3, -1.2] },
  { name: 'Cyan voxel', color: 0x48c8d8, pos: [0, 0.9, 0] },
];

export function buildBlocks(ctx: BuilderCtx): WorldAPI {
  const { world } = ctx;
  const grabbables: THREE.Object3D[] = [];
  const homes = new Map<THREE.Mesh, THREE.Vector3>();
  const geo = new THREE.BoxGeometry(0.6, 0.6, 0.6);

  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(6, 0.4, 6),
    new THREE.MeshStandardMaterial({ color: 0x182838, roughness: 0.9 }),
  );
  plate.position.y = -0.2;
  plate.name = 'Baseplate';
  plate.userData.grabbable = false;
  world.add(plate);
  grabbables.push(plate);

  // Stud grid for the toy-brick read.
  const studGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.08, 12);
  const studMat = new THREE.MeshStandardMaterial({ color: 0x24384e, roughness: 0.9 });
  const studs = new THREE.InstancedMesh(studGeo, studMat, 100);
  const dummy = new THREE.Object3D();
  let si = 0;
  for (let ix = 0; ix < 10; ix++) {
    for (let iz = 0; iz < 10; iz++) {
      dummy.position.set(-2.7 + ix * 0.6, 0.04, -2.7 + iz * 0.6);
      dummy.updateMatrix();
      studs.setMatrixAt(si++, dummy.matrix);
    }
  }
  world.add(studs);

  for (const v of VOXELS) {
    const mat = new THREE.MeshStandardMaterial({
      color: v.color,
      emissive: v.color,
      emissiveIntensity: 0.25,
      roughness: 0.5,
    });
    const cube = new THREE.Mesh(geo, mat);
    cube.name = v.name;
    cube.position.set(...v.pos);
    cube.userData.gridSnap = true;
    world.add(cube);
    grabbables.push(cube);
    homes.set(cube, cube.position.clone());
  }

  return {
    grabbables,
    background: 0x0a0d18,
    view: { distance: 8.5, pitch: 0.62, yaw: 0.5 },
    update(): void {
      // Static world: cubes rest exactly where left (stacking friendly).
    },
    reset(): void {
      for (const [cube, home] of homes) cube.position.copy(home);
    },
    bodyInfo(name: string | null): string | null {
      if (!name) return null;
      if (name === 'Baseplate') return 'Baseplate — build your tower here';
      return `${name} — drag it, release to snap`;
    },
    dispose(): void {
      disposeGroup(world);
    },
  };
}
