// Preset system contracts: every PRISM world (solar system, voxel pit,
// black hole, test rig) implements WorldAPI so the interaction controller,
// camera rig, and HUD work unchanged across presets.

import * as THREE from 'three';
import type { PlanetTextureSet } from '../textures';

export type PresetId = 'space' | 'blocks' | 'test' | 'singularity' | 'drive' | 'atom';

export const PRESET_ORDER: PresetId[] = ['space', 'blocks', 'test', 'singularity', 'drive', 'atom'];

export const PRESET_LABELS: Record<PresetId, string> = {
  space: 'Space',
  blocks: 'Block game',
  test: 'Test',
  singularity: 'Black hole',
  drive: 'Drive',
  atom: 'Atom',
};

/** Per-preset camera framing applied on load. */
export interface WorldView {
  distance: number;
  pitch: number;
  yaw: number;
}

/** Shared build resources (built once, never disposed by worlds). */
export interface BuilderCtx {
  /** Fresh group for world content (two-hand zoom/rotate applies here). */
  world: THREE.Group;
  /** Scene-root group for labels (never scaled by two-hand gestures). */
  labelLayer: THREE.Group;
  glowTex: THREE.Texture;
  nebulaTex: THREE.Texture;
  planetTex: PlanetTextureSet;
}

export interface WorldAPI {
  /** Raycast targets for hover/grab. */
  grabbables: THREE.Object3D[];
  /** Backdrop: nebula sphere or flat color. */
  background: 'nebula' | number;
  /** Camera framing on preset load. */
  view: WorldView;
  update(dt: number, elapsed: number): void;
  reset(): void;
  /** Optional: orbit retargeting (solar system, black-hole probes). */
  setOrbitFromPoint?(mesh: THREE.Mesh, localPoint: THREE.Vector3): void;
  /** Optional: one-line HUD science info. */
  bodyInfo?(name: string | null): string | null;
  /** Optional: per-frame driving input (drive preset). */
  setDriveInput?(frame: DriveFrameInput): void;
  /** Optional: easy point-and-go mode (drive preset). */
  setEasyMode?(on: boolean): void;
  isEasyMode?(): boolean;
  /** Dispose per-world geometries/materials (never shared ctx textures). */
  dispose(): void;
}

export type WorldBuilder = (ctx: BuilderCtx) => WorldAPI;

/** Per-frame input for the drive preset (unified hand + mouse actions). */
export interface DriveFrameInput {
  /** -1 (screen left) .. +1 (screen right). */
  steer: number;
  /** Gas pedal 0..1 (analog for hands, binary for mouse/keys). */
  throttle: number;
  brake: boolean;
  /** Rising edge of pinch / click (easy-mode pin drop). */
  actionPressed: boolean;
  /** World-local ground point under the pointer (null if none). */
  ground: { x: number; z: number } | null;
}

/** Frees all geometries/materials under a group (shared textures survive). */
export function disposeGroup(root: THREE.Object3D): void {  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) {
      mat.forEach((m) => disposeMaterial(m));
    } else if (mat) {
      disposeMaterial(mat);
    }
  });
}

function disposeMaterial(m: THREE.Material): void {
  const withMap = m as THREE.Material & { map?: THREE.Texture | null; userData?: { ownMap?: boolean } };
  if (withMap.map && withMap.userData?.ownMap) withMap.map.dispose();
  m.dispose();
}
