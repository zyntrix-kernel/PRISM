// PrismScene shell: renderer, camera rig, bloom composer, hand cursor,
// preset loading. World content lives in src/presets/* behind WorldAPI.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { PrismConfig, type QualityTier } from './config';
import { pinchRingScale, setEmissiveBoost } from './highlight';
import { buildAtom } from './presets/atom';
import { buildBlocks } from './presets/blocks';
import { buildDrive } from './presets/drive';
import { buildSingularity } from './presets/singularity';
import { buildVoxel } from './presets/voxel';
import { buildSolar } from './presets/solar';
import { buildTest } from './presets/test';
import {
  disposeGroup,
  type PresetId,
  type WorldAPI,
  type WorldBuilder,
  type WorldView,
} from './presets/types';
import { buildGlowTexture, buildNebulaTexture, buildPlanetTextures, type PlanetTextureSet } from './textures';

export type CursorMode = 'hidden' | 'point' | 'hover' | 'pinch' | 'grab';

const BUILDERS: Record<PresetId, WorldBuilder> = {
  space: buildSolar,
  blocks: buildBlocks,
  test: buildTest,
  singularity: buildSingularity,
  drive: buildDrive,
  atom: buildAtom,
  voxel: buildVoxel,
};

/** Orbit/pan/zoom camera rig (mouse, touch-drag, wheel, arrow keys). */
export class CameraRig {
  readonly target = new THREE.Vector3();
  yaw = 0;
  pitch = 0.4;
  distance = 13;
  autoRotate = false;
  private readonly home = { yaw: 0, pitch: 0.4, distance: 13, target: new THREE.Vector3() };
  private readonly tmpOffset = new THREE.Vector3();

  setHome(view: WorldView): void {
    this.home.yaw = view.yaw;
    this.home.pitch = view.pitch;
    this.home.distance = view.distance;
    this.home.target.set(0, 0, 0);
    this.resetToHome();
  }

  resetToHome(): void {
    this.yaw = this.home.yaw;
    this.pitch = this.home.pitch;
    this.distance = this.home.distance;
    this.target.copy(this.home.target);
  }

  orbitBy(dxPixels: number, dyPixels: number): void {
    const s = PrismConfig.cameraRig.orbitSpeed;
    this.yaw -= dxPixels * s;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dyPixels * s, 0.03, 1.52);
  }

  dolly(factor: number): void {
    const c = PrismConfig.cameraRig;
    this.distance = THREE.MathUtils.clamp(this.distance * factor, c.minDistance, c.maxDistance);
  }

  panBy(dxPixels: number, dyPixels: number, camera: THREE.Camera): void {
    const scale = (this.distance * PrismConfig.cameraRig.panSpeed) / 10;
    const right = this.tmpOffset.setFromMatrixColumn(camera.matrix, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
    this.target.addScaledVector(right, -dxPixels * scale).addScaledVector(up, dyPixels * scale);
    this.target.y = THREE.MathUtils.clamp(this.target.y, -6, 6);
  }

  setView(name: 'overview' | 'top' | 'edge'): void {
    if (name === 'top') {
      this.pitch = 1.5;
      this.yaw = 0;
    } else if (name === 'edge') {
      this.pitch = 0.06;
    } else {
      this.resetToHome();
    }
  }

  update(dt: number, camera: THREE.PerspectiveCamera): void {
    if (this.autoRotate) this.yaw += dt * PrismConfig.cameraRig.autoRotateSpeed;
    const cp = Math.cos(this.pitch);
    camera.position.set(
      this.target.x + this.distance * cp * Math.sin(this.yaw),
      this.target.y + this.distance * Math.sin(this.pitch),
      this.target.z + this.distance * cp * Math.cos(this.yaw),
    );
    camera.lookAt(this.target);
  }
}

export class PrismScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly rig = new CameraRig();
  /** Everything zoomable/rotatable by two-hand gestures lives under this. */
  readonly world = new THREE.Group();
  readonly labelLayer = new THREE.Group();
  readonly cursor: THREE.Mesh;
  private api: WorldAPI | null = null;
  private presetId: PresetId = 'space';
  private quality: QualityTier = 'medium';
  private readonly cursorMat: THREE.MeshBasicMaterial;
  private readonly cursorRing: THREE.Mesh;
  private readonly cursorRingMat: THREE.MeshBasicMaterial;
  private readonly ringCyan = new THREE.Color(0x00f0ff);
  private readonly ringMagenta = new THREE.Color(0xff5ce1);
  private readonly rayLine: THREE.Line;
  private readonly rayPositions: Float32Array;
  private readonly nebula: THREE.Mesh;
  private stars!: THREE.Points; // built by buildStarfield() in the constructor
  private readonly composer: EffectComposer;
  private readonly glowTex: THREE.Texture;
  private readonly nebulaTex: THREE.Texture;
  private readonly planetTex: PlanetTextureSet;
  private readonly tmpVec = new THREE.Vector3();
  private hovered: THREE.Object3D | null = null;

  constructor(container: HTMLElement, quality: QualityTier, preset: PresetId) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.applyPixelRatio();
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x04060d);
    this.scene.fog = new THREE.Fog(0x04060d, 20, 70);

    this.camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      300,
    );
    this.camera.position.set(0, 4.6, 12);

    this.scene.add(new THREE.AmbientLight(0xbfd4ff, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(3, 5, 4);
    this.scene.add(key);

    // Shared resources (built once; worlds must never dispose these).
    this.glowTex = buildGlowTexture();
    this.nebulaTex = buildNebulaTexture();
    this.planetTex = buildPlanetTextures();
    this.buildStarfield();

    this.nebula = new THREE.Mesh(
      new THREE.SphereGeometry(120, 32, 24),
      new THREE.MeshBasicMaterial({ map: this.nebulaTex, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    this.nebula.visible = false;
    this.scene.add(this.nebula);

    // Hand cursor + pointer ray.
    this.cursorMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.95 });
    this.cursor = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), this.cursorMat);
    this.cursor.visible = false;
    this.scene.add(this.cursor);

    // Pinch progress ring: wide/faint when open, cinching onto the cursor
    // as the pinch closes. Billboards toward the camera every frame.
    this.cursorRingMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    this.cursorRing = new THREE.Mesh(new THREE.RingGeometry(0.13, 0.16, 40), this.cursorRingMat);
    this.cursorRing.visible = false;
    this.cursorRing.renderOrder = 5;
    this.scene.add(this.cursorRing);

    this.rayPositions = new Float32Array(6);
    const rayGeo = new THREE.BufferGeometry();
    rayGeo.setAttribute('position', new THREE.BufferAttribute(this.rayPositions, 3));
    this.rayLine = new THREE.Line(
      rayGeo,
      new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.35 }),
    );
    this.rayLine.visible = false;
    this.rayLine.frustumCulled = false;
    this.scene.add(this.rayLine);

    this.scene.add(this.world);
    this.scene.add(this.labelLayer);

    // Bloom composer (High tier only; direct render otherwise).
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      PrismConfig.bloom.strength,
      PrismConfig.bloom.radius,
      PrismConfig.bloom.threshold,
    );
    this.composer.addPass(bloom);
    this.composer.addPass(new OutputPass());

    this.loadPreset(preset);
  }

  // ---- presets ----------------------------------------------------------

  get currentPreset(): PresetId {
    return this.presetId;
  }

  get currentWorld(): WorldAPI | null {
    return this.api;
  }

  /** Forward the smoothed pointer to worlds that pick their own targets. */
  trackPointer(ndcX: number, ndcY: number): void {
    this.api?.updatePointer?.(ndcX, ndcY, this.camera);
  }

  /** True when the pointer is over world-owned content (voxel ground). */
  capturesPointer(): boolean {
    return this.api?.capturesPointer?.() ?? false;
  }

  /** 3D focus point from world-owned picking (shared cursor placement). */
  pointerFocus(out: THREE.Vector3): boolean {
    return this.api?.pointerFocus?.(out) ?? false;
  }

  get grabbables(): THREE.Object3D[] {
    return this.api?.grabbables ?? [];
  }

  loadPreset(id: PresetId): void {
    if (this.api) {
      this.api.dispose();
      this.world.clear();
      this.labelLayer.clear();
    }
    this.presetId = id;
    // Two-hand transform must not leak between worlds.
    this.world.scale.setScalar(1);
    this.world.rotation.set(0, 0, 0);
    this.world.position.set(0, 0, 0);
    const builder = BUILDERS[id];
    this.api = builder({ world: this.world, labelLayer: this.labelLayer, glowTex: this.glowTex, nebulaTex: this.nebulaTex, planetTex: this.planetTex });
    const bg = this.api.background;
    if (bg === 'nebula') {
      this.scene.background = null;
      this.nebula.visible = true;
    } else {
      this.nebula.visible = false;
      this.scene.background = new THREE.Color(bg);
    }
    this.stars.visible = this.api.stars ?? true;
    this.rig.setHome(this.api.view);
    this.setHover(null);
    this.applyTextureMaps();
  }

  setOrbitFromPoint(mesh: THREE.Mesh, localPoint: THREE.Vector3): void {
    this.api?.setOrbitFromPoint?.(mesh, localPoint);
  }

  bodyInfo(name: string | null): string | null {
    return this.api?.bodyInfo?.(name) ?? null;
  }

  // ---- quality ----------------------------------------------------------

  private applyPixelRatio(): void {
    const ratio = PrismConfig.quality[this.quality]?.pixelRatio ?? 1.5;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ratio));
    this.composer?.setPixelRatio(Math.min(window.devicePixelRatio || 1, ratio));
  }

  /** High tier gets procedural planet maps; lower tiers use flat colors. */
  private applyTextureMaps(): void {
    const on = this.quality === 'high';
    this.world.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      const mat = mesh.material as (THREE.MeshStandardMaterial | THREE.MeshBasicMaterial) | undefined;
      const texMap = mat?.userData.texMap as THREE.Texture | undefined;
      if (mat && texMap) {
        mat.map = on ? texMap : null;
        mat.needsUpdate = true;
      }
    });
  }

  applyQuality(tier: QualityTier): void {
    this.quality = tier;
    this.applyPixelRatio();
    this.applyTextureMaps();
  }

  // ---- frame ------------------------------------------------------------

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
  }

  private buildStarfield(): void {
    const count = 1400;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 60 + Math.random() * 60;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.stars = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xaac4ff, size: 0.5, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.scene.add(this.stars);
  }

  /** Highlight the hovered body; previous hover is always restored. */
  setHover(mesh: THREE.Object3D | null): void {
    if (this.hovered === mesh) return;
    if (this.hovered) {
      setEmissiveBoost(this.hovered, this.hovered.userData.grabbed ? 0.9 : null);
    }
    this.hovered = mesh;
    if (this.hovered) setEmissiveBoost(this.hovered, 0.85);
  }

  markGrabbed(mesh: THREE.Object3D | null): void {
    for (const obj of this.grabbables) {
      obj.userData.grabbed = obj === mesh;
      if (obj !== this.hovered) {
        setEmissiveBoost(obj, obj === mesh ? 0.9 : null);
      }
    }
  }

  /** Move the 3D cursor to a world position and recolor by mode. */
  setCursor(worldPos: THREE.Vector3 | null, mode: CursorMode, sizeScale = 1, closeness = 0): void {
    if (!worldPos) {
      this.cursor.visible = false;
      this.cursorRing.visible = false;
      this.rayLine.visible = false;
      return;
    }
    this.cursor.visible = true;
    this.cursor.position.copy(worldPos);
    this.cursor.scale.setScalar(sizeScale);
    // Progress ring cinches from wide/faint to tight/bright with the pinch.
    const c = Math.min(1, Math.max(0, closeness));
    this.cursorRing.visible = true;
    this.cursorRing.position.copy(worldPos);
    this.cursorRing.lookAt(this.camera.position);
    this.cursorRing.scale.setScalar(pinchRingScale(c));
    this.cursorRingMat.opacity = 0.22 + 0.68 * c;
    this.cursorRingMat.color.copy(this.ringCyan).lerp(this.ringMagenta, c);
    const colors: Record<CursorMode, number> = {
      hidden: 0x00f0ff,
      point: 0x00f0ff,
      hover: 0x7cff6b,
      pinch: 0xff5ce1,
      grab: 0xffb347,
    };
    this.cursorMat.color.setHex(colors[mode]);
    (this.rayLine.material as THREE.LineBasicMaterial).color.setHex(colors[mode]);

    this.tmpVec.copy(worldPos).sub(this.camera.position).normalize();
    this.rayPositions[0] = this.camera.position.x;
    this.rayPositions[1] = this.camera.position.y;
    this.rayPositions[2] = this.camera.position.z;
    this.rayPositions[3] = worldPos.x + this.tmpVec.x * 10;
    this.rayPositions[4] = worldPos.y + this.tmpVec.y * 10;
    this.rayPositions[5] = worldPos.z + this.tmpVec.z * 10;
    (this.rayLine.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.rayLine.visible = true;
  }

  update(dt: number, elapsed: number): void {
    this.rig.update(dt, this.camera);
    this.api?.update(dt, elapsed);
    this.cursor.rotation.y += dt * 2.2;
  }

  render(): void {
    if (this.quality === 'high') {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  get drawCalls(): number {
    return this.renderer.info.render.calls;
  }

  get triangles(): number {
    return this.renderer.info.render.triangles;
  }

  dispose(): void {
    disposeGroup(this.world);
    disposeGroup(this.labelLayer);
    this.renderer.dispose();
  }
}
