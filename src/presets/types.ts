// Preset system contracts: every PRISM world (solar system, voxel pit,
// black hole, test rig) implements WorldAPI so the interaction controller,
// camera rig, and HUD work unchanged across presets.

import * as THREE from 'three';
import type { PlanetTextureSet } from '../textures';

export type PresetId = 'space' | 'blocks' | 'test' | 'singularity' | 'drive' | 'atom' | 'voxel';

export const PRESET_ORDER: PresetId[] = ['space', 'blocks', 'test', 'singularity', 'drive', 'atom', 'voxel'];

export const PRESET_LABELS: Record<PresetId, string> = {
  space: 'Space',
  blocks: 'Block game',
  test: 'Test',
  singularity: 'Black hole',
  drive: 'Drive',
  atom: 'Atom',
  voxel: 'Voxel',
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
  /** Shared starfield visible (default true; daylight worlds hide it). */
  stars?: boolean;
  /** Camera framing on preset load. */
  view: WorldView;
  /** Advance the world simulation (called every frame). */
  update(dt: number, elapsed: number): void;
  /** Optional: orbit retargeting (solar system, black-hole probes). */
  setOrbitFromPoint?(mesh: THREE.Mesh, localPoint: THREE.Vector3): void;
  /** Optional: one-line HUD science info. */
  bodyInfo?(name: string | null): string | null;
  /** Optional: per-frame driving input (drive preset). */
  setDriveInput?(frame: DriveFrameInput): void;
  /** Optional: easy point-and-go mode (drive preset). */
  setEasyMode?(on: boolean): void;
  isEasyMode?(): boolean;
  /**
   * Optional: pointer tracking for worlds that pick their own targets
   * (voxel preset raycasts voxels itself instead of object raycasting).
   */
  updatePointer?(ndcX: number, ndcY: number, camera: THREE.PerspectiveCamera): void;
  /** Optional: true when the pointer is over world content (voxel ground). */
  capturesPointer?(): boolean;
  /** Optional: 3D focus point for the shared cursor. */
  pointerFocus?(out: THREE.Vector3): boolean;
  /** Optional: tap/hold/release action edges (voxel place/break). */
  setPointerAction?(pressed: boolean, held: boolean, released: boolean): void;
  /** Optional: block palette (voxel preset). */
  blockPalette?(): Array<{ name: string; color: string }>;
  selectBlock?(index: number): void;
  cycleBlock?(dir: 1 | -1): void;
  selectedBlock?(): { index: number; name: string; color: string };
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
