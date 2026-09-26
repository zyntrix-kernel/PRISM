// VOXEL preset: a Minecraft-like builder (not a clone — original procedural
// textures, own terrain, own hand-controls).
//
// Voxel technique adapted (with gratitude + notice in THIRD_PARTY_LICENSES.md)
// from the three.js manual "Voxel Geometry" series and the
// `webgl_interactive_voxelpainter` example (both MIT, © three.js authors):
// cell/chunk storage, culled-face atlas meshing, DDA ray traversal for
// picking, and neighbor-aware chunk rebuilds on edit. Everything else —
// terrain generation, atlas pixels, tap-place/hold-break hand mapping,
// palette, lighting — is original PRISM work.
//
// Hand mapping (point + pinch only): TAP pinch (<0.3 s) places the selected
// block on the targeted face; HOLDING the pinch breaks the block (~0.75 s,
// highlight reddens); sliding off cancels. Bedrock (y=0) is unbreakable.

import * as THREE from 'three';
import { disposeGroup, type BuilderCtx, type WorldAPI } from './types';

// ---- world layout ---------------------------------------------------------
export const CHUNK = 16;
export const WORLD_CHUNKS = 4; // 4x4 chunks = 64x64 footprint
export const WORLD_SIZE = CHUNK * WORLD_CHUNKS;
export const HEIGHT = 48;
const TAP_MAX_DT = 0.3;
const BREAK_HOLD = 0.75;
const REACH = 60;

// ---- blocks ---------------------------------------------------------------
export const AIR = 0;
export const GRASS = 1;
export const DIRT = 2;
export const STONE = 3;
export const WOOD = 4;
export const LEAVES = 5;
export const SAND = 6;
export const BEDROCK = 7;

export interface BlockDef {
  id: number;
  name: string;
  color: string; // palette UI swatch
  tiles: { side: number; top: number; bottom: number }; // atlas columns
}

const BLOCKS: BlockDef[] = [
  { id: GRASS, name: 'Grass', color: '#5fae3f', tiles: { side: 0, top: 0, bottom: 1 } },
  { id: DIRT, name: 'Dirt', color: '#8a5f3c', tiles: { side: 1, top: 1, bottom: 1 } },
  { id: STONE, name: 'Stone', color: '#8d8d94', tiles: { side: 2, top: 2, bottom: 2 } },
  { id: WOOD, name: 'Wood', color: '#6b4a2b', tiles: { side: 3, top: 3, bottom: 3 } },
  { id: LEAVES, name: 'Leaves', color: '#2f7d32', tiles: { side: 4, top: 4, bottom: 4 } },
  { id: SAND, name: 'Sand', color: '#e0d29a', tiles: { side: 5, top: 5, bottom: 5 } },
  { id: BEDROCK, name: 'Bedrock', color: '#3a3a40', tiles: { side: 6, top: 6, bottom: 6 } },
];

const BLOCK_BY_ID = new Map<number, BlockDef>(BLOCKS.map((b) => [b.id, b]));

// ---- deterministic noise (self-contained, seeded) --------------------------
function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 974634)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) % 100000) / 100000;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

export function valueNoise2(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  const ux = smooth(fx);
  const uz = smooth(fz);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export function terrainHeight(x: number, z: number, seed: number): number {
  const base = valueNoise2(x * 0.045, z * 0.045, seed);
  const detail = valueNoise2(x * 0.13 + 7.3, z * 0.13 + 3.1, seed + 5);
  return Math.min(
    HEIGHT - 18,
    Math.max(2, Math.floor(9 + base * 14 + detail * 3)),
  );
}

// ---- texture atlas (original pixels, DataTexture: no DOM needed) -----------
export const TILE = 16;
export const ATLAS_COLS = 7; // one column per block type
export const ATLAS_ROWS = 3; // 0 = side, 1 = top, 2 = bottom

type Painter = (u: number, v: number) => [number, number, number];

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function speckle(base: [number, number, number], amount: number, seed: number): Painter {
  const rand = mulberry(seed);
  const cache = new Map<number, number>();
  return (u, v) => {
    const key = u * 64 + v;
    let n = cache.get(key);
    if (n === undefined) {
      n = (rand() - 0.5) * 2 * amount;
      cache.set(key, n);
    }
    return [base[0] + n, base[1] + n, base[2] + n];
  };
}

const TILE_PAINTERS: Painter[] = [
  speckle([95, 174, 63], 22, 11), // 0 grass side (grassy dirt)
  speckle([121, 90, 60], 20, 12), // 1 dirt
  speckle([141, 141, 148], 14, 13), // 2 stone
  speckle([107, 74, 43], 16, 14), // 3 wood
  speckle([47, 125, 50], 30, 15), // 4 leaves
  speckle([224, 210, 154], 12, 16), // 5 sand
  speckle([58, 58, 64], 26, 17), // 6 bedrock
];

export function buildAtlasPixels(): Uint8Array {
  const w = ATLAS_COLS * TILE;
  const h = ATLAS_ROWS * TILE;
  const px = new Uint8Array(w * h * 4);
  for (let col = 0; col < ATLAS_COLS; col++) {
    const paint = TILE_PAINTERS[col];
    for (let row = 0; row < ATLAS_ROWS; row++) {
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const [r, g, b] = paint(x, y);
          // Pre-flipped: buffer row 0 is the texture bottom (flipY-safe).
          const by = h - 1 - (row * TILE + y);
          const o = (by * w + (col * TILE + x)) * 4;
          px[o] = Math.max(0, Math.min(255, r));
          px[o + 1] = Math.max(0, Math.min(255, g));
          px[o + 2] = Math.max(0, Math.min(255, b));
          px[o + 3] = 255;
        }
      }
    }
  }
  // Grass side gets a green top strip ( utile texture cue ).
  for (let x = 0; x < TILE; x++) {
    for (let y = 0; y < 4; y++) {
      const by = h - 1 - y; // canvas-top rows of the side tile
      const o = (by * w + x) * 4;
      px[o] = 95;
      px[o + 1] = 174;
      px[o + 2] = 63;
    }
  }
  return px;
}

export function buildAtlasTexture(): THREE.DataTexture {
  const tex = new THREE.DataTexture(
    buildAtlasPixels(),
    ATLAS_COLS * TILE,
    ATLAS_ROWS * TILE,
  );
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ---- face table (winding/UV conventions after the three.js manual) ---------
interface FaceDef {
  dir: [number, number, number];
  row: 0 | 1 | 2; // atlas row: side, top, bottom
  shade: number;
  corners: Array<{ pos: [number, number, number]; uv: [number, number] }>;
}

const FACES: FaceDef[] = [
  {
    dir: [-1, 0, 0], row: 0, shade: 0.8,
    corners: [
      { pos: [0, 1, 0], uv: [0, 1] }, { pos: [0, 0, 0], uv: [0, 0] },
      { pos: [0, 1, 1], uv: [1, 1] }, { pos: [0, 0, 1], uv: [1, 0] },
    ],
  },
  {
    dir: [1, 0, 0], row: 0, shade: 0.8,
    corners: [
      { pos: [1, 1, 1], uv: [0, 1] }, { pos: [1, 0, 1], uv: [0, 0] },
      { pos: [1, 1, 0], uv: [1, 1] }, { pos: [1, 0, 0], uv: [1, 0] },
    ],
  },
  {
    dir: [0, -1, 0], row: 2, shade: 0.5,
    corners: [
      { pos: [1, 0, 1], uv: [1, 0] }, { pos: [0, 0, 1], uv: [0, 0] },
      { pos: [1, 0, 0], uv: [1, 1] }, { pos: [0, 0, 0], uv: [0, 1] },
    ],
  },
  {
    dir: [0, 1, 0], row: 1, shade: 1.0,
    corners: [
      { pos: [0, 1, 1], uv: [1, 1] }, { pos: [1, 1, 1], uv: [0, 1] },
      { pos: [0, 1, 0], uv: [1, 0] }, { pos: [1, 1, 0], uv: [0, 0] },
    ],
  },
  {
    dir: [0, 0, -1], row: 0, shade: 0.7,
    corners: [
      { pos: [1, 0, 0], uv: [0, 0] }, { pos: [0, 0, 0], uv: [1, 0] },
      { pos: [1, 1, 0], uv: [0, 1] }, { pos: [0, 1, 0], uv: [1, 1] },
    ],
  },
  {
    dir: [0, 0, 1], row: 0, shade: 0.7,
    corners: [
      { pos: [0, 0, 1], uv: [0, 0] }, { pos: [1, 0, 1], uv: [1, 0] },
      { pos: [0, 1, 1], uv: [0, 1] }, { pos: [1, 1, 1], uv: [1, 1] },
    ],
  },
];

// ---- voxel store ------------------------------------------------------------
export type GetBlock = (x: number, y: number, z: number) => number;

export class VoxelStore {
  private readonly chunks = new Map<string, Uint8Array>();
  readonly seed: number;

  constructor(seed = 1337) {
    this.seed = seed;
  }

  static key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  private chunkAt(cx: number, cz: number): Uint8Array | undefined {
    return this.chunks.get(VoxelStore.key(cx, cz));
  }

  ensureChunk(cx: number, cz: number): Uint8Array {
    let c = this.chunkAt(cx, cz);
    if (!c) {
      c = new Uint8Array(CHUNK * HEIGHT * CHUNK);
      this.chunks.set(VoxelStore.key(cx, cz), c);
    }
    return c;
  }

  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && x < WORLD_SIZE && z >= 0 && z < WORLD_SIZE && y >= 0 && y < HEIGHT;
  }

  get(x: number, y: number, z: number): number {
    if (y < 0) return BEDROCK; // sealed floor
    if (!this.inBounds(x, y, z)) return AIR;
    const c = this.chunkAt(Math.floor(x / CHUNK), Math.floor(z / CHUNK));
    if (!c) return AIR;
    const lx = x - Math.floor(x / CHUNK) * CHUNK;
    const lz = z - Math.floor(z / CHUNK) * CHUNK;
    return c[(y * CHUNK + lz) * CHUNK + lx];
  }

  set(x: number, y: number, z: number, v: number): boolean {
    if (!this.inBounds(x, y, z) || y === 0) return false; // bedrock unbreakable
    const c = this.ensureChunk(Math.floor(x / CHUNK), Math.floor(z / CHUNK));
    const lx = x - Math.floor(x / CHUNK) * CHUNK;
    const lz = z - Math.floor(z / CHUNK) * CHUNK;
    c[(y * CHUNK + lz) * CHUNK + lx] = v;
    return true;
  }

  generate(): void {
    for (let cx = 0; cx < WORLD_CHUNKS; cx++) {
      for (let cz = 0; cz < WORLD_CHUNKS; cz++) {
        this.ensureChunk(cx, cz);
      }
    }
    // Terrain spans centered coordinates (-32..32) so the camera target
    // (origin), two-hand pivot, and orbit framing all sit in the middle.
    const off = WORLD_SIZE / 2;
    for (let x = 0; x < WORLD_SIZE; x++) {
      for (let z = 0; z < WORLD_SIZE; z++) {
        const wx = x - off;
        const wz = z - off;
        const h = terrainHeight(wx, wz, this.seed);
        const beach = h <= 11;
        for (let y = 0; y < h; y++) {
          let v: number = STONE;
          if (y === 0) v = BEDROCK;
          else if (y === h - 1) v = beach ? SAND : GRASS;
          else if (y >= h - 4) v = beach ? SAND : DIRT;
          this.setRaw(x, y, z, v);
        }
        // Sparse trees on grass.
        if (!beach && h > 8 && h < 24 && hash2(wx, wz, 99) < 0.012) {
          for (let t = 1; t <= 4; t++) this.setRaw(x, h - 1 + t, z, WOOD);
          for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
              for (let dy = 0; dy <= 1; dy++) {
                if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
                const lx = x + dx;
                const lz = z + dz;
                const ly = h + 2 + dy;
                if (this.inBounds(lx, ly, lz) && this.get(lx, ly, lz) === AIR) {
                  this.setRaw(lx, ly, lz, LEAVES);
                }
              }
            }
          }
          this.setRaw(x, h + 4, z, LEAVES);
        }
      }
    }
  }

  /** Raw write bypassing the bedrock rule (generation only). */
  private setRaw(x: number, y: number, z: number, v: number): void {
    if (!this.inBounds(x, y, z)) return;
    const c = this.ensureChunk(Math.floor(x / CHUNK), Math.floor(z / CHUNK));
    const lx = x - Math.floor(x / CHUNK) * CHUNK;
    const lz = z - Math.floor(z / CHUNK) * CHUNK;
    c[(y * CHUNK + lz) * CHUNK + lx] = v;
  }
}

// ---- culled meshing (pure data in, pure data out) ---------------------------
export interface ChunkGeometry {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

export function buildChunkGeometry(get: GetBlock, cx: number, cz: number): ChunkGeometry {
  const atlasW = ATLAS_COLS * TILE;
  const atlasH = ATLAS_ROWS * TILE;
  const geo: ChunkGeometry = { positions: [], normals: [], uvs: [], colors: [], indices: [] };
  const baseX = cx * CHUNK;
  const baseZ = cz * CHUNK;
  for (let y = 0; y < HEIGHT; y++) {
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const voxel = get(baseX + x, y, baseZ + z);
        if (voxel === AIR) continue;
        const def = BLOCK_BY_ID.get(voxel) ?? BLOCK_BY_ID.get(STONE);
        const tiles = def?.tiles ?? { side: 2, top: 2, bottom: 2 };
        for (const face of FACES) {
          const nx = baseX + x + face.dir[0];
          const ny = y + face.dir[1];
          const nz = baseZ + z + face.dir[2];
          if (get(nx, ny, nz) !== AIR) continue; // hidden face: culled
          const col = face.row === 1 ? tiles.top : face.row === 2 ? tiles.bottom : tiles.side;
          const ndx = geo.positions.length / 3;
          for (const corner of face.corners) {
            geo.positions.push(x + corner.pos[0], y + corner.pos[1], z + corner.pos[2]);
            geo.normals.push(face.dir[0], face.dir[1], face.dir[2]);
            geo.uvs.push(
              ((col + corner.uv[0]) * TILE) / atlasW,
              1 - ((face.row + 1 - corner.uv[1]) * TILE) / atlasH,
            );
            geo.colors.push(face.shade, face.shade, face.shade);
          }
          geo.indices.push(ndx, ndx + 1, ndx + 2, ndx + 2, ndx + 1, ndx + 3);
        }
      }
    }
  }
  return geo;
}

// ---- DDA ray traversal (Amanatides & Woo, adapted from the manual) ---------
export interface RayHit {
  cell: [number, number, number];
  normal: [number, number, number];
  dist: number;
  point: [number, number, number];
}

export function traceVoxelRay(
  get: GetBlock,
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  maxDist: number,
): RayHit | null {
  let ix = Math.floor(ox);
  let iy = Math.floor(oy);
  let iz = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const txDelta = dx !== 0 ? Math.abs(1 / dx) : Number.POSITIVE_INFINITY;
  const tyDelta = dy !== 0 ? Math.abs(1 / dy) : Number.POSITIVE_INFINITY;
  const tzDelta = dz !== 0 ? Math.abs(1 / dz) : Number.POSITIVE_INFINITY;
  const xDist = stepX > 0 ? ix + 1 - ox : ox - ix;
  const yDist = stepY > 0 ? iy + 1 - oy : oy - iy;
  const zDist = stepZ > 0 ? iz + 1 - oz : oz - iz;
  let txMax = txDelta !== Number.POSITIVE_INFINITY ? txDelta * xDist : Number.POSITIVE_INFINITY;
  let tyMax = tyDelta !== Number.POSITIVE_INFINITY ? tyDelta * yDist : Number.POSITIVE_INFINITY;
  let tzMax = tzDelta !== Number.POSITIVE_INFINITY ? tzDelta * zDist : Number.POSITIVE_INFINITY;
  let t = 0;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < 256; i++) {
    if (txMax < tyMax && txMax < tzMax) {
      ix += stepX;
      t = txMax;
      txMax += txDelta;
      nx = -stepX; ny = 0; nz = 0;
    } else if (tyMax < tzMax) {
      iy += stepY;
      t = tyMax;
      tyMax += tyDelta;
      nx = 0; ny = -stepY; nz = 0;
    } else {
      iz += stepZ;
      t = tzMax;
      tzMax += tzDelta;
      nx = 0; ny = 0; nz = -stepZ;
    }
    if (t > maxDist) return null;
    if (get(ix, iy, iz) !== AIR) {
      return {
        cell: [ix, iy, iz],
        normal: [nx, ny, nz],
        dist: t,
        point: [ox + dx * t, oy + dy * t, oz + dz * t],
      };
    }
  }
  return null;
}

// ---- the world --------------------------------------------------------------
export function buildVoxel(ctx: BuilderCtx): WorldAPI {
  const { world, glowTex } = ctx;
  void glowTex;
  const store = new VoxelStore(1337);
  store.generate();

  const atlas = buildAtlasTexture();
  const material = new THREE.MeshLambertMaterial({ map: atlas });
  material.userData.ownMap = true; // freed with the world on preset switch
  const meshes = new Map<string, THREE.Mesh>();

  const rebuildChunk = (cx: number, cz: number): void => {
    if (cx < 0 || cz < 0 || cx >= WORLD_CHUNKS || cz >= WORLD_CHUNKS) return;
    const key = VoxelStore.key(cx, cz);
    let mesh = meshes.get(key);
    const data = buildChunkGeometry(store.get.bind(store), cx, cz);
    if (data.indices.length === 0) {
      if (mesh) {
        world.remove(mesh);
        mesh.geometry.dispose();
        meshes.delete(key);
      }
      return;
    }
    const geo = mesh ? mesh.geometry : new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.positions), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(data.normals), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(data.uvs), 2));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(data.colors), 3));
    geo.setIndex(data.indices);
    geo.computeBoundingSphere();
    if (!mesh) {
      mesh = new THREE.Mesh(geo, material);
      mesh.name = `chunk-${key}`;
      // Centered: array 0..63 renders at world -32..+32 (camera target = origin).
      mesh.position.set(cx * CHUNK - WORLD_SIZE / 2, 0, cz * CHUNK - WORLD_SIZE / 2);
      world.add(mesh);
      meshes.set(key, mesh);
    } else {
      mesh.geometry.dispose();
      mesh.geometry = geo;
    }
  };

  // Array space (0..63) vs world-local space (-32..32): converts either way.
  const HALF = WORLD_SIZE / 2;
  const getW: GetBlock = (x, y, z) => store.get(Math.round(x) + HALF, y, Math.round(z) + HALF);
  const setW = (x: number, y: number, z: number, v: number): boolean =>
    store.set(Math.round(x) + HALF, y, Math.round(z) + HALF, v);

  const rebuildAround = (x: number, z: number): void => {
    // World-local coords → array-space chunk math.
    const lx = x + HALF;
    const lz = z + HALF;
    const cx = Math.floor(lx / CHUNK);
    const cz = Math.floor(lz / CHUNK);
    rebuildChunk(cx, cz);
    if (lx - cx * CHUNK === 0) rebuildChunk(cx - 1, cz);
    if (lx - cx * CHUNK === CHUNK - 1) rebuildChunk(cx + 1, cz);
    if (lz - cz * CHUNK === 0) rebuildChunk(cx, cz - 1);
    if (lz - cz * CHUNK === CHUNK - 1) rebuildChunk(cx, cz + 1);
  };

  for (let cx = 0; cx < WORLD_CHUNKS; cx++) {
    for (let cz = 0; cz < WORLD_CHUNKS; cz++) rebuildChunk(cx, cz);
  }

  // Target highlight (white → red as the break charges).
  const highlight = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
  );
  highlight.visible = false;
  world.add(highlight);
  const hlWhite = new THREE.Color(0xffffff);
  const hlRed = new THREE.Color(0xff2a2a);

  // Tap/hold state + pointer ray (fed by the interaction controller).
  let selected = 0; // index into PLACEABLE
  let ndc: { x: number; y: number } | null = null;
  let cam: THREE.PerspectiveCamera | null = null;
  let target: RayHit | null = null;
  let anchor: RayHit | null = null;
  let pressT = 0;
  let progress = 0;
  let pressEdge = false;
  let holdNow = false;
  let releaseEdge = false;
  let elapsed = 0;
  const tmpOrigin = new THREE.Vector3();
  const tmpNdc = new THREE.Vector3();
  const tmpRay = new THREE.Ray();
  const tmpMat = new THREE.Matrix4();
  const tmpWorld = new THREE.Vector3();
  const tmpHl = new THREE.Vector3();

  const raycast = (): RayHit | null => {
    if (!ndc || !cam) return null;
    tmpOrigin.setFromMatrixPosition(cam.matrixWorld);
    tmpNdc.set(ndc.x, ndc.y, 0.5).unproject(cam);
    tmpRay.origin.copy(tmpOrigin);
    tmpRay.direction.copy(tmpNdc).sub(tmpOrigin).normalize();
    // Into world-local space so two-hand zoom/rotate never skews picking.
    tmpMat.copy(world.matrixWorld).invert();
    tmpRay.applyMatrix4(tmpMat);
    const o = tmpRay.origin;
    const d = tmpRay.direction;
    const hit = traceVoxelRay(getW, o.x, o.y, o.z, d.x, d.y, d.z, REACH);
    if (!hit) return null;
    // Hit point back to scene space for the shared cursor.
    tmpWorld.set(hit.point[0], hit.point[1], hit.point[2]).applyMatrix4(world.matrixWorld);
    hit.point = [tmpWorld.x, tmpWorld.y, tmpWorld.z];
    return hit;
  };

  const sameCell = (a: RayHit, b: RayHit): boolean =>
    a.cell[0] === b.cell[0] && a.cell[1] === b.cell[1] && a.cell[2] === b.cell[2];

  const PLACEABLE = [GRASS, DIRT, STONE, WOOD, LEAVES, SAND];

  return {
    grabbables: [], // voxel picking bypasses raycast-objects (DDA instead)
    background: 0x87b5e0,
    stars: false, // daylight world: starfield would read as dirt specks
    view: { distance: 42, pitch: 0.85, yaw: 0.6 },
    updatePointer(nx: number, ny: number, camera: THREE.PerspectiveCamera): void {
      ndc = { x: nx, y: ny };
      cam = camera;
      target = raycast();
    },
    capturesPointer(): boolean {
      return target !== null;
    },
    pointerFocus(out: THREE.Vector3): boolean {
      if (!target) return false;
      out.set(target.point[0], target.point[1], target.point[2]);
      return true;
    },
    setPointerAction(pressed: boolean, held: boolean, released: boolean): void {
      pressEdge = pressed;
      holdNow = held;
      releaseEdge = released;
    },
    selectBlock(index: number): void {
      selected = ((index % PLACEABLE.length) + PLACEABLE.length) % PLACEABLE.length;
    },
    cycleBlock(dir: 1 | -1): void {
      this.selectBlock?.(selected + dir);
    },
    selectedBlock(): { index: number; name: string; color: string } {
      const def = BLOCK_BY_ID.get(PLACEABLE[selected]);
      return { index: selected, name: def?.name ?? '?', color: def?.color ?? '#fff' };
    },
    blockPalette(): Array<{ name: string; color: string }> {
      return PLACEABLE.map((id) => {
        const def = BLOCK_BY_ID.get(id);
        return { name: def?.name ?? '?', color: def?.color ?? '#fff' };
      });
    },
    update(dt: number, elapsedSec: number): void {
      void dt;
      elapsed = elapsedSec;
      // TAP = place on the anchor face; HOLD = break with charge; slide = cancel.
      if (pressEdge) {
        pressT = elapsed;
        anchor = target;
        progress = 0;
      }
      if (holdNow && anchor) {
        if (!target || !sameCell(target, anchor)) {
          anchor = null; // slid off mid-hold: cancel the break
          progress = 0;
        } else {
          progress = (elapsed - pressT) / BREAK_HOLD;
          if (progress >= 1) {
            const [bx, by, bz] = anchor.cell;
            if (setW(bx, by, bz, AIR)) rebuildAround(bx, bz);
            anchor = null;
            progress = 0;
          }
        }
      }
      if (releaseEdge) {
        if (anchor && elapsed - pressT < TAP_MAX_DT) {
          const [bx, by, bz] = anchor.cell;
          const [nx, ny, nz] = anchor.normal;
          const px = bx + nx;
          const py = by + ny;
          const pz = bz + nz;
          if (py >= 1 && py < HEIGHT - 1 && getW(px, py, pz) === AIR) {
            if (setW(px, py, pz, PLACEABLE[selected])) rebuildAround(px, pz);
          }
        }
        anchor = null;
        progress = 0;
      }
      pressEdge = false;
      releaseEdge = false;
      // Highlight follows the anchor while charging, else the live target.
      // Smoothed (snap on teleports) so low tracking rates glide, not jump.
      const show = anchor ?? target;
      highlight.visible = !!show;
      if (show) {
        tmpHl.set(show.cell[0] + 0.5, show.cell[1] + 0.5, show.cell[2] + 0.5);
        if (highlight.position.distanceToSquared(tmpHl) > 4) {
          highlight.position.copy(tmpHl);
        } else {
          highlight.position.lerp(tmpHl, 1 - Math.exp(-dt * 20));
        }
        (highlight.material as THREE.LineBasicMaterial).color.copy(hlWhite).lerp(hlRed, Math.min(1, progress));
      }
    },
    bodyInfo(): string | null {
      const def = BLOCK_BY_ID.get(PLACEABLE[selected]);
      return `Voxel — ${def?.name ?? '?'} · tap pinch = place · hold = break · Q/E block`;
    },
    dispose(): void {
      disposeGroup(world);
    },
  };
}
