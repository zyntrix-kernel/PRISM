// PrismScene shell: renderer, camera rig, bloom composer, hand cursor,
// preset loading. World content lives in src/presets/* behind WorldAPI.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
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
import { buildGunGame } from './presets/gun';
import { buildSupernova } from './presets/supernova';
import { buildNebula } from './presets/nebula';
import {
  disposeGroup,
  type PresetId,
  type WorldAPI,
  type WorldBuilder,
  type WorldView,
} from './presets/types';
import { buildGlowTexture, buildNebulaTexture, buildPlanetTextures, type PlanetTextureSet } from './textures';

export type CursorMode = 'hidden' | 'point' | 'hover' | 'pinch' | 'grab';

// ─────────────────────────────────────────────────────────────────────────────
// Premium shader-driven starfield.
// Each star has its own brightness, twinkle phase/frequency, and stellar
// classification color (blue / white / yellow-white / orange / red).
// Vertex shader does perspective size attenuation; fragment shader renders
// a soft circular point with smooth falloff + bright core.
// ─────────────────────────────────────────────────────────────────────────────
const STAR_VERTEX = /* glsl */ `
  attribute float aBrightness;
  attribute float aPhase;
  attribute float aFreq;
  attribute vec3 aColor;

  uniform float uTime;
  uniform float uPixelRatio;

  varying float vBrightness;
  varying vec3 vColor;

  void main() {
    vColor = aColor;
    // Twinkle: base brightness modulated by a per-star sinusoid.
    // Range stays in [0.4, 1.0] of base brightness — never fully extinguished.
    float twinkle = 0.7 + 0.3 * sin(uTime * aFreq + aPhase);
    vBrightness = aBrightness * twinkle;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Size attenuation: closer stars render larger. Brighter stars render
    // larger too — twinkling visibly grows the point as it peaks.
    float baseSize = 1.6 + aBrightness * 4.2;
    float dist = max(1.0, -mvPosition.z);
    gl_PointSize = baseSize * uPixelRatio * (240.0 / dist);
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  varying float vBrightness;
  varying vec3 vColor;

  void main() {
    // gl_PointCoord is [0,1] across the point sprite. Center it.
    vec2 uv = gl_PointCoord - 0.5;
    float dist = length(uv);
    if (dist > 0.5) discard;

    // Soft circular falloff + a brighter tight core for stellar sparkle.
    float falloff = smoothstep(0.5, 0.0, dist);
    float core = smoothstep(0.28, 0.0, dist);
    vec3 col = vColor * vBrightness * (0.55 + 0.6 * core);
    float alpha = falloff * clamp(vBrightness, 0.0, 1.0);

    gl_FragColor = vec4(col, alpha);
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Chromatic aberration + vignette (single combined pass — cheap).
// CA: radial RGB channel offset, zero at center, max ~1.5px at corners.
// Vignette: smooth radial darkening, center = full, corners = ~0.75.
// ─────────────────────────────────────────────────────────────────────────────
const CA_VIGNETTE_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uIntensity: { value: 0.4 },
    uVignette: { value: 0.25 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uIntensity;
    uniform float uVignette;
    varying vec2 vUv;

    void main() {
      vec2 uv = vUv;
      vec2 offset = uv - vec2(0.5);
      float dist = length(offset);

      // Radial falloff: dist^2 so center is clean, edges ramp up.
      float caAmt = uIntensity * 0.012 * dist * dist;
      vec3 color;
      if (caAmt > 1e-6) {
        vec2 dir = offset / max(dist, 1e-5);
        // R shifted outward toward corner; B shifted inward toward center.
        color.r = texture2D(tDiffuse, uv - dir * caAmt).r;
        color.g = texture2D(tDiffuse, uv).g;
        color.b = texture2D(tDiffuse, uv + dir * caAmt).b;
      } else {
        color = texture2D(tDiffuse, uv).rgb;
      }

      // Soft cinematic vignette. Center stays at 1.0, corners ~0.75.
      float vignette = 1.0 - uVignette * dist * dist;
      color *= vignette;

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

// ─────────────────────────────────────────────────────────────────────────────
// Film grain: animated hash-based noise overlay. VERY subtle — adds organic
// texture like Apple's HDR pipeline. Operates per-pixel; high/ultra only.
// ─────────────────────────────────────────────────────────────────────────────
const FILM_GRAIN_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uAmount: { value: 0.04 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uAmount;
    varying vec2 vUv;

    // Cheap hash-based noise: deterministic per cell, fully GPU-side.
    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    void main() {
      vec3 color = texture2D(tDiffuse, vUv).rgb;
      // Animated grain — changes every frame, varies spatially per pixel.
      float noise = hash(vUv * uResolution + uTime * 53.0);
      // Subtle modulation (±0.02 in linear). Apple-HDR-style texture.
      color += (noise - 0.5) * uAmount;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

const BUILDERS: Record<PresetId, WorldBuilder> = {
  space: buildSolar,
  blocks: buildBlocks,
  test: buildTest,
  singularity: buildSingularity,
  drive: buildDrive,
  atom: buildAtom,
  voxel: buildVoxel,
  gun: buildGunGame,
  supernova: buildSupernova,
  nebula: buildNebula,
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
  private readonly tmpUp = new THREE.Vector3();

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
    const up = this.tmpUp.setFromMatrixColumn(camera.matrix, 1);
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

  /** Impact shake 0..1 (decays exponentially, squared falloff settles soft). */
  private trauma = 0;
  /** Accessibility gate: reduced-motion users get a whisper of shake. */
  shakeScale = 1;

  addShake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + Math.max(0, amount));
  }

  get traumaLevel(): number {
    return this.trauma;
  }

  update(dt: number, camera: THREE.PerspectiveCamera): void {
    if (this.autoRotate) this.yaw += dt * PrismConfig.cameraRig.autoRotateSpeed;
    // NATURAL STEADICAM: rate 10 = ~15% per frame at 60fps. Responsive enough
    // to feel direct, with just enough inertia for smooth motion. Was 8
    // (slightly laggy on orbit stop).
    const cp = Math.cos(this.pitch);
    const targetX = this.target.x + this.distance * cp * Math.sin(this.yaw);
    const targetY = this.target.y + this.distance * Math.sin(this.pitch);
    const targetZ = this.target.z + this.distance * cp * Math.cos(this.yaw);
    const damp = 1 - Math.exp(-dt * 10);
    camera.position.x += (targetX - camera.position.x) * damp;
    camera.position.y += (targetY - camera.position.y) * damp;
    camera.position.z += (targetZ - camera.position.z) * damp;
    if (this.trauma > 0) {
      const s = this.trauma * this.trauma * 0.4 * this.shakeScale;
      camera.position.x += (Math.random() - 0.5) * 2 * s;
      camera.position.y += (Math.random() - 0.5) * 2 * s;
      camera.position.z += (Math.random() - 0.5) * 2 * s;
      this.trauma *= Math.exp(-dt * 2.2);
      if (this.trauma <= 0.003) this.trauma = 0;
    }
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
  private readonly ringCyan = new THREE.Color(0x9adcff);
  private readonly ringMagenta = new THREE.Color(0xffa8d8);
  private readonly rayLine: THREE.Line;
  private readonly rayPositions: Float32Array;
  private readonly nebula: THREE.Mesh;
  private stars!: THREE.Points; // built by buildStarfield() in the constructor
  private starMat!: THREE.ShaderMaterial;
  private readonly composer: EffectComposer;
  private readonly caPass: ShaderPass;
  // grainPass removed (animated hash noise read as TV static over the scene).
  private readonly glowTex: THREE.Texture;
  private readonly nebulaTex: THREE.Texture;
  private readonly planetTex: PlanetTextureSet;
  private readonly tmpVec = new THREE.Vector3();
  private hovered: THREE.Object3D | null = null;

  constructor(container: HTMLElement, quality: QualityTier, preset: PresetId) {
    this.quality = quality;
    // Performance: request high-performance GPU adapter explicitly. This forces
    // the browser to use the discrete GPU on dual-GPU machines (common on laptops).
    // Use antialias only on high/ultra (MSAA is expensive; pixelRatio covers it on lower tiers).
    // failIfMajorPerformanceCaveat:false so the renderer still initializes on
    // software-rasterizers (SwiftShader/llvmpipe) and on tablets whose driver
    // occasionally reports a "major performance caveat". Without this, WebGL
    // context creation would throw on those devices and the whole app would
    // crash on first paint — the FPS governor is the proper backstop instead.
    const useAA = quality === 'high' || quality === 'ultra';
    this.renderer = new THREE.WebGLRenderer({
      antialias: useAA,
      powerPreference: 'high-performance',
      stencil: false,
      failIfMajorPerformanceCaveat: false,
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    // Performance: disable shadow maps (not used; saves allocation + render pass).
    this.renderer.shadowMap.enabled = false;
    this.applyPixelRatio();
    container.appendChild(this.renderer.domElement);
    // Screen readers get a labeled image role instead of a silent canvas.
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Interactive 3D scene. Move the mouse to point, hold to grab, or enable the camera for hand control. Press H for all controls.',
    );

    this.scene.background = new THREE.Color(0x04060d);
    this.scene.fog = new THREE.Fog(0x04060d, 20, 70);

    this.camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      300,
    );
    this.camera.position.set(0, 4.6, 12);

    // Multi-light setup (inspired by sanderblue/solar-system-threejs, Apache 2.0):
    // OPTIMIZED: reduced from 4 directional lights to 2 (key + fill) — each
    // light adds a full render pass for every MeshStandardMaterial. 2 lights
    // + ambient covers all angles with half the cost.
    this.scene.add(new THREE.AmbientLight(0xbfd4ff, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 0.8);
    key.position.set(3, 5, 4);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x8899bb, 0.3);
    fill.position.set(-3, 2, -4);
    this.scene.add(fill);

    // Shared resources (built once; worlds must never dispose these).
    this.glowTex = buildGlowTexture();
    this.nebulaTex = buildNebulaTexture();
    this.planetTex = buildPlanetTextures();
    this.buildStarfield();

    this.nebula = new THREE.Mesh(
      new THREE.SphereGeometry(120, 24, 16),
      new THREE.MeshBasicMaterial({ map: this.nebulaTex, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    this.nebula.visible = false;
    this.scene.add(this.nebula);

    // Hand cursor + pointer ray.
    this.cursorMat = new THREE.MeshBasicMaterial({ color: 0x9adcff, transparent: true, opacity: 0.95 });
    this.cursor = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), this.cursorMat);
    this.cursor.visible = false;
    this.scene.add(this.cursor);

    // Pinch progress ring: wide/faint when open, cinching onto the cursor
    // as the pinch closes. Billboards toward the camera every frame.
    this.cursorRingMat = new THREE.MeshBasicMaterial({
      color: 0x9adcff,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    this.cursorRing = new THREE.Mesh(new THREE.RingGeometry(0.13, 0.16, 24), this.cursorRingMat);
    this.cursorRing.visible = false;
    this.cursorRing.renderOrder = 5;
    this.scene.add(this.cursorRing);

    this.rayPositions = new Float32Array(6);
    const rayGeo = new THREE.BufferGeometry();
    rayGeo.setAttribute('position', new THREE.BufferAttribute(this.rayPositions, 3));
    this.rayLine = new THREE.Line(
      rayGeo,
      new THREE.LineBasicMaterial({ color: 0x9adcff, transparent: true, opacity: 0.35 }),
    );
    this.rayLine.visible = false;
    this.rayLine.frustumCulled = false;
    this.scene.add(this.rayLine);

    this.scene.add(this.world);
    this.scene.add(this.labelLayer);

    // Post-processing composer. Pass order is critical for the cinematic look:
    //   RenderPass → UnrealBloomPass → ChromaticAberration+Vignette → FilmGrain → OutputPass
    // Bloom lifts emissive bodies; CA + vignette add cinematic depth; grain
    // adds organic texture; OutputPass applies tone mapping + color space.
    // All passes are always constructed (cheap to instantiate); only
    // composer.render() is gated by quality tier in render().
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      PrismConfig.bloom.strength,
      PrismConfig.bloom.radius,
      PrismConfig.bloom.threshold,
    );
    this.composer.addPass(bloom);
    this.caPass = new ShaderPass(CA_VIGNETTE_SHADER);
    this.composer.addPass(this.caPass);
    this.composer.addPass(new OutputPass());
    // NOTE: the FILM_GRAIN_SHADER pass was removed — its per-pixel hash noise
    // animated every frame and read as 'TV static covering the whole 3D scene'
    // even at uAmount = 0.04. Not premium; just noisy. The vignette in CA_VIGNETTE
    // is enough cinematic depth.

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
    this.api = builder({
      world: this.world,
      labelLayer: this.labelLayer,
      glowTex: this.glowTex,
      nebulaTex: this.nebulaTex,
      planetTex: this.planetTex,
      shakeCamera: (amount: number) => this.shakeCamera(amount),
      quality: this.quality,
    });
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

  /** Rattle the camera (impacts, detonations). Worlds call, rig owns decay. */
  shakeCamera(amount: number): void {
    this.rig.addShake(amount);
  }

  // ---- quality ----------------------------------------------------------

  private applyPixelRatio(): void {
    const ratio = PrismConfig.quality[this.quality]?.pixelRatio ?? 1.5;
    const pr = Math.min(window.devicePixelRatio || 1, ratio);
    this.renderer.setPixelRatio(pr);
    this.composer?.setPixelRatio(pr);
    // Star point-size scales with framebuffer pixel ratio; keep the uniform
    // in sync so stars stay a consistent visual size across DPR changes.
    if (this.starMat) this.starMat.uniforms.uPixelRatio.value = pr;
  }

  /** High+ tier gets procedural planet maps; low/med use flat colors. */
  private applyTextureMaps(): void {
    const on = this.quality === 'high' || this.quality === 'ultra';
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
    // Quality changes are live. Reduce point count via drawRange instead of
    // rebuilding the starfield, preserving its deterministic spatial layout.
    this.updateStarDensity(tier);
  }

  // ---- frame ------------------------------------------------------------

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
  }

  /**
   * Premium shader-driven starfield. Each star carries per-vertex attributes
   * (brightness, twinkle phase/freq, stellar-class color) feeding a custom
   * ShaderMaterial. Count scales with quality tier. Always rendered (every
   * tier) — the shader is essentially free; the cost is the point count.
   */
  private buildStarfield(): void {
    const tier = this.quality;
    // Star counts per tier. Lowered `medium` from 600 → 400 (and `low`
    // 400 → 300) to save GPU on integrated graphics — each star is a
    // point sprite with an additive blend, and 600 additive points on a
    // medium-tier integrated GPU was a measurable fill-rate tax. Tablets
    // run at `high` (1000 stars) where their GPUs eat it for breakfast.
    const count = this.starBudget.ultra;
    const positions = new Float32Array(count * 3);
    const brightness = new Float32Array(count);
    const phase = new Float32Array(count);
    const freq = new Float32Array(count);
    const color = new Float32Array(count * 3);

    // Stellar classification distribution (approximate, tuned for visual
    // variety rather than astrophysical accuracy):
    //   ~15% blue (hot O/B), 20% white (A), 30% yellow-white (F/G),
    //   25% orange (K), 10% red (M).
    const classes: Array<{ weight: number; rgb: [number, number, number] }> = [
      { weight: 0.15, rgb: [0.62, 0.72, 1.0] }, // blue
      { weight: 0.2, rgb: [1.0, 1.0, 1.0] }, // white
      { weight: 0.3, rgb: [1.0, 0.97, 0.85] }, // yellow-white
      { weight: 0.25, rgb: [1.0, 0.78, 0.55] }, // orange
      { weight: 0.1, rgb: [1.0, 0.55, 0.42] }, // red
    ];

    for (let i = 0; i < count; i++) {
      // Spherical shell distribution: stars sit on a 60–120 unit sphere so
      // they're always behind world geometry but inside the far plane (300).
      const r = 60 + Math.random() * 60;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      // Brightness in [0.3, 1.0] — biases toward dim stars (looks more
      // realistic; few bright, many faint).
      brightness[i] = 0.3 + Math.random() * 0.7;
      phase[i] = Math.random() * Math.PI * 2;
      // Twinkle frequency 0.5–3.0 Hz (slow drift to fast shimmer).
      freq[i] = 0.5 + Math.random() * 2.5;

      // Weighted random pick of stellar class.
      const roll = Math.random();
      let acc = 0;
      let chosen = classes[2]; // default yellow-white
      for (const c of classes) {
        acc += c.weight;
        if (roll <= acc) {
          chosen = c;
          break;
        }
      }
      color[i * 3] = chosen.rgb[0];
      color[i * 3 + 1] = chosen.rgb[1];
      color[i * 3 + 2] = chosen.rgb[2];
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aBrightness', new THREE.BufferAttribute(brightness, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aFreq', new THREE.BufferAttribute(freq, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));

    this.starMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: this.renderer.getPixelRatio() },
      },
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      transparent: true,
      depthWrite: false,
      // Additive: stars never darken what's behind them, they only brighten —
      // so overlapping stars sum into a believable bright cluster.
      blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(geo, this.starMat);
    this.updateStarDensity(tier);
    this.scene.add(this.stars);
  }

  private updateStarDensity(tier: QualityTier): void {
    const visible = this.starBudget[tier];
    this.stars.geometry.setDrawRange(0, visible);
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
      hidden: 0x9adcff,
      point: 0x9adcff,
      hover: 0xa8ffc9,
      pinch: 0xffa8d8,
      grab: 0xffd2a8,
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
    // Honor cinematic camera override from worlds (e.g. blackhole detonation).
    const cam = this.api?.cinematicCamera;
    if (cam) {
      this.rig.yaw = cam.yaw;
      this.rig.pitch = cam.pitch;
      this.rig.distance = cam.distance;
    }
    this.rig.update(dt, this.camera);
    this.api?.update(dt, elapsed);
    this.cursor.rotation.y += dt * 2.2;
    // Drive per-frame shader uniforms. Starfield twinkle needs elapsed time
    // (seconds, monotonically increasing). Runs on every tier.
    this.starMat.uniforms.uTime.value = elapsed;
  }

  render(): void {
    if (this.quality === 'high' || this.quality === 'ultra') {
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
    // Free starfield GPU resources (geometry attributes + shader program).
    this.stars?.geometry.dispose();
    this.starMat?.dispose();
    // Free the fullscreen-quad shader materials backing the post passes.
    (this.caPass?.material as THREE.ShaderMaterial | undefined)?.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
  }
}
