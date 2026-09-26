// Unit + integration tests for the voxel preset: deterministic terrain,
// culled meshing, DDA picking, atlas bounds, and the tap-place/hold-break
// cycle through the real world (headless-safe: DataTexture atlas, no DOM).

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  AIR,
  BEDROCK,
  buildAtlasPixels,
  buildAtlasTexture,
  buildChunkGeometry,
  buildVoxel,
  GRASS,
  HEIGHT,
  STONE,
  terrainHeight,
  traceVoxelRay,
  VoxelStore,
  WORLD_SIZE,
  type GetBlock,
} from './voxel';
import type { BuilderCtx, WorldAPI } from './types';
import type { PlanetTextureSet } from '../textures';

function makeCtx(): BuilderCtx {
  const tex = new THREE.Texture();
  return {
    world: new THREE.Group(),
    labelLayer: new THREE.Group(),
    glowTex: tex,
    nebulaTex: tex,
    planetTex: {} as PlanetTextureSet,
  };
}

describe('terrain generation', () => {
  it('is deterministic per seed and bounded', () => {
    const a = terrainHeight(10, 20, 1337);
    const b = terrainHeight(10, 20, 1337);
    expect(a).toBe(b);
    expect(terrainHeight(10, 20, 999)).not.toBe(a);
    for (let x = 0; x < WORLD_SIZE; x += 7) {
      for (let z = 0; z < WORLD_SIZE; z += 7) {
        const h = terrainHeight(x, z, 1337);
        expect(h).toBeGreaterThanOrEqual(2);
        expect(h).toBeLessThan(HEIGHT - 17);
      }
    }
  });

  it('lays bedrock, stone, dirt, grass in order', () => {
    const store = new VoxelStore(1337);
    store.generate();
    // Find a grass column and verify the strata below it.
    // (Generation samples centered coords: array [x,z] holds terrain (x-32, z-32).)
    let checked = 0;
    for (let x = 0; x < WORLD_SIZE && checked < 5; x += 3) {
      for (let z = 0; z < WORLD_SIZE && checked < 5; z += 3) {
        const h = terrainHeight(x - 32, z - 32, 1337);
        if (h <= 11 || h >= 24) continue; // skip beaches/trees for a clean column
        expect(store.get(x, 0, z)).toBe(BEDROCK);
        expect(store.get(x, h - 1, z)).toBe(GRASS);
        expect(store.get(x, h, z)).toBe(AIR);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('refuses bedrock edits and out-of-bounds writes', () => {
    const store = new VoxelStore(1);
    store.generate();
    expect(store.set(5, 0, 5, AIR)).toBe(false);
    expect(store.get(5, 0, 5)).toBe(BEDROCK);
    expect(store.set(-1, 5, 5, STONE)).toBe(false);
    expect(store.set(5, HEIGHT, 5, STONE)).toBe(false);
    expect(store.get(5, -3, 5)).toBe(BEDROCK); // sealed floor reads solid
  });
});

describe('culled meshing', () => {
  // Single chunk world with one floating cube: exactly 6 faces.
  const singleCube: GetBlock = (x, y, z) => (x === 2 && y === 3 && z === 2 ? STONE : AIR);

  it('emits 6 faces for an isolated cube, 0 for a buried one', () => {
    const one = buildChunkGeometry(singleCube, 0, 0);
    expect(one.indices.length).toBe(36);
    expect(one.positions.length).toBe(24 * 3);
    expect(one.normals.length).toBe(24 * 3);
    expect(one.uvs.length).toBe(24 * 2);
    expect(one.colors.length).toBe(24 * 3);
    const buried: GetBlock = () => STONE;
    const none = buildChunkGeometry(buried, 0, 0);
    expect(none.indices.length).toBe(0);
  });

  it('shares faces between adjacent cubes (10 faces, not 12)', () => {    const pair: GetBlock = (x, y, z) =>
      (x === 2 && y === 3 && (z === 2 || z === 3) ? STONE : AIR);
    const geo = buildChunkGeometry(pair, 0, 0);
    expect(geo.indices.length).toBe(10 * 6);
  });

  it('keeps every UV inside its own atlas tile', () => {
    const geo = buildChunkGeometry(singleCube, 0, 0);
    // Stone column = 2 of 7, tile 16px of 112px wide atlas.
    const uMin = (2 * 16) / 112;
    const uMax = (3 * 16) / 112;
    for (let i = 0; i < geo.uvs.length; i += 2) {
      expect(geo.uvs[i]).toBeGreaterThanOrEqual(uMin - 1e-6);
      expect(geo.uvs[i]).toBeLessThanOrEqual(uMax + 1e-6);
      expect(geo.uvs[i + 1]).toBeGreaterThanOrEqual(0);
      expect(geo.uvs[i + 1]).toBeLessThanOrEqual(1);
    }
  });

  it('shades top faces brightest, bottom dimmest', () => {
    const geo = buildChunkGeometry(singleCube, 0, 0);
    // 6 faces × 4 verts; face order: -x, +x, -y, +y, -z, +z.
    const shadeOf = (face: number): number => geo.colors[face * 4 * 3];
    expect(shadeOf(3)).toBe(1.0); // top
    expect(shadeOf(2)).toBe(0.5); // bottom
    expect(shadeOf(0)).toBeGreaterThan(shadeOf(2));
  });

  it('places faces at absolute voxel coordinates (never flattened)', () => {
    // Regression: once dropped loop y/z, collapsing the world into ribbons.
    const geo = buildChunkGeometry(singleCube, 0, 0); // cube at (2,3,2)
    const xs = new Set<number>();
    const ys = new Set<number>();
    const zs = new Set<number>();
    for (let i = 0; i < geo.positions.length; i += 3) {
      xs.add(geo.positions[i]);
      ys.add(geo.positions[i + 1]);
      zs.add(geo.positions[i + 2]);
    }
    expect([...xs].sort((a, b) => a - b)).toEqual([2, 3]);
    expect([...ys].sort((a, b) => a - b)).toEqual([3, 4]);
    expect([...zs].sort((a, b) => a - b)).toEqual([2, 3]);
  });
});

describe('DDA ray traversal', () => {
  // Flat slab: y 0..4 solid across x/z 0..9.
  const slab: GetBlock = (x, y, z) =>
    x >= 0 && x < 10 && z >= 0 && z < 10 && y >= 0 && y <= 4 ? STONE : AIR;

  it('hits the top face pointing down', () => {
    const hit = traceVoxelRay(slab, 5.5, 12, 5.5, 0, -1, 0, 40);
    expect(hit).not.toBeNull();
    expect(hit!.cell).toEqual([5, 4, 5]);
    expect(hit!.normal).toEqual([0, 1, 0]);
  });

  it('hits side faces with the right normal', () => {
    const hit = traceVoxelRay(slab, -4, 2, 5.5, 1, 0, 0, 40);
    expect(hit).not.toBeNull();
    expect(hit!.cell).toEqual([0, 2, 5]);
    expect(hit!.normal).toEqual([-1, 0, 0]);
  });

  it('hits the underside pointing up', () => {
    const hit = traceVoxelRay(slab, 5.5, -4, 5.5, 0, 1, 0, 40);
    expect(hit).not.toBeNull();
    expect(hit!.cell).toEqual([5, 0, 5]);
    expect(hit!.normal).toEqual([0, -1, 0]);
  });

  it('misses the void', () => {
    expect(traceVoxelRay(slab, 50, 50, 50, 0, 1, 0, 40)).toBeNull();
    expect(traceVoxelRay(slab, 5.5, 12, 5.5, 0, 1, 0, 40)).toBeNull(); // pointing away
  });
});

describe('atlas pixels', () => {
  it('fills the full atlas with non-uniform texels', () => {
    const px = buildAtlasPixels();
    expect(px.length).toBe(7 * 16 * 3 * 16 * 4);
    let min = 255;
    let max = 0;
    for (let i = 0; i < px.length; i += 4) {
      min = Math.min(min, px[i], px[i + 1], px[i + 2]);
      max = Math.max(max, px[i], px[i + 1], px[i + 2]);
    }
    expect(max - min).toBeGreaterThan(60); // real texture variety, not flat
    const tex = buildAtlasTexture();
    expect(tex.image.width).toBe(7 * 16);
    expect(tex.magFilter).toBe(THREE.NearestFilter);
  });
});

describe('voxel world integration', () => {
  function boot(): { world: WorldAPI; ctx: BuilderCtx } {
    const ctx = makeCtx();
    return { world: buildVoxel(ctx), ctx };
  }

  it('boots with chunk meshes and answers picking contracts', () => {
    const { world, ctx } = boot();
    expect(world.grabbables.length).toBe(0); // DDA picking, not raycast list
    expect(world.background).not.toBe('nebula');
    const meshes = ctx.world.children.filter((o) => o.type === 'Mesh');
    expect(meshes.length).toBe(16); // 4x4 chunks
    // Fresh world with no pointer: nothing captured, no focus.
    expect(world.capturesPointer?.()).toBe(false);
    const out = new THREE.Vector3();
    expect(world.pointerFocus?.(out)).toBe(false);
    expect(world.bodyInfo?.(null)).toContain('Voxel');
  });

  it('tap places, hold breaks, slide cancels (observable mesh deltas)', () => {
    const { world, ctx } = boot();
    // Camera staring straight down at column (20, 20).
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 300);
    camera.position.set(20.5, 40, 20.5);
    camera.lookAt(20.5, 0, 20.5);
    camera.updateMatrixWorld(true);
    let t = 0;
    const poke = (): void => {
      t += 1 / 60;
      world.updatePointer?.(0, 0, camera);
      world.update?.(1 / 60, t);
    };
    const indexCount = (): number => {
      let n = 0;
      ctx.world.traverse((o: THREE.Object3D) => {
        const mesh = o as THREE.Mesh;
        const idx = mesh.geometry?.getIndex?.();
        if (idx) n += idx.count;
      });
      return n;
    };
    world.selectBlock?.(1); // dirt
    const before = indexCount();
    expect(before).toBeGreaterThan(0);

    // TAP: press + release within 0.3 s → a block appears (faces added).
    poke();
    world.setPointerAction?.(true, true, false);
    poke();
    world.setPointerAction?.(false, false, true);
    poke();
    expect(indexCount()).toBeGreaterThan(before);

    // HOLD: keep holding past 0.75 s → the dirt breaks, mesh identical again.
    poke();
    world.setPointerAction?.(true, true, false);
    for (let i = 0; i < 60; i++) {
      poke();
      world.setPointerAction?.(false, true, false);
    }
    world.setPointerAction?.(false, false, true);
    poke();
    expect(indexCount()).toBe(before);

    // SLIDE: press, look away, release → nothing changes.
    poke();
    world.setPointerAction?.(true, true, false);
    poke();
    world.updatePointer?.(0.9, 0.9, camera); // empty sky
    world.update?.(1 / 60, t + 0.05);
    world.setPointerAction?.(false, false, true);
    poke();
    expect(indexCount()).toBe(before);
  });
});
