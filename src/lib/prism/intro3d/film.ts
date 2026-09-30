// ─────────────────────────────────────────────────────────────────────────────
// PRISM · "FIRST LIGHT" — the WebGL film engine.
// Imperative Three.js, matching PRISM's engine philosophy: one class owns
// renderer + composer + timeline; React only mounts a canvas and reads time.
//
// The Swarm — a single additive Points cloud — is the protagonist. It morphs
// through precomputed target fields (genesis cloud → ZYNASH LABS → the prism
// light story → benzene → Lorenz/phyllotaxis → implosion → PRISM → galaxy →
// handoff implosion) while a keyframed spherical camera rig and a custom
// grade pass (CA + anamorphic streak + vignette + grain + flash) carry the
// cinematography. Hero meshes (crystal, beam, spectral fan, benzene, ribbon)
// share the stage when a shape needs physical solidity.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import {
  GRADE_SHADER,
  makeBeamMaterial,
  makeCrystalMaterial,
  makeSwarmMaterial,
  STAR_FRAGMENT,
  STAR_VERTEX,
} from './shaders';
import {
  ambient,
  benzene,
  cloud,
  galaxy,
  implode,
  lorenzPhyllo,
  lorenzPolyline,
  makeRng,
  prismLight,
  sampleTextPoints,
  starSphere,
} from './targets';
import { CAMERA, T, TOTAL, window01, flicker } from './timeline';

export type FilmQuality = 'ultra' | 'high' | 'medium' | 'low';

const COUNTS: Record<FilmQuality, number> = {
  ultra: 170000,
  high: 125000,
  medium: 82000,
  low: 46000,
};

/** Morph beat table — the act scheduler picks the latest entry ≤ t. */
interface MorphBeat {
  key: string;
  t0: number;
  dur: number;
  stagger: number;
  turb: number;
  turbFreq: number;
  swirl: number;
  spiral: number;
  drift: number;
  size: number;
  alpha: number;
  white?: boolean;
}

const MORPHS: MorphBeat[] = [
  { key: 'genesis', t0: 0.35, dur: 2.2, stagger: 0.5, turb: 0.55, turbFreq: 0.32, swirl: 0, spiral: 0, drift: 0.05, size: 1.5, alpha: 0.3 },
  { key: 'labs', t0: T.LABS_MORPH, dur: 1.7, stagger: 0.46, turb: 0.055, turbFreq: 0.7, swirl: 0, spiral: 0, drift: 0.018, size: 1.3, alpha: 0.5, white: true },
  { key: 'optics', t0: T.LABS_SHATTER, dur: 1.15, stagger: 0.4, turb: 0.2, turbFreq: 0.5, swirl: 0, spiral: 0, drift: 0.03, size: 1.12, alpha: 0.4 },
  { key: 'chemistry', t0: T.CHEM_IN, dur: 1.25, stagger: 0.42, turb: 0.09, turbFreq: 0.6, swirl: 0, spiral: 0, drift: 0.024, size: 1.28, alpha: 0.46 },
  { key: 'mathematics', t0: T.MATH_IN, dur: 1.35, stagger: 0.44, turb: 0.13, turbFreq: 0.55, swirl: 0, spiral: 0, drift: 0.026, size: 1.24, alpha: 0.46 },
  { key: 'implode', t0: T.IMPLODE, dur: 0.95, stagger: 0.3, turb: 0.34, turbFreq: 0.8, swirl: 0, spiral: 1.7, drift: 0.04, size: 1.7, alpha: 0.55, white: true },
  { key: 'prism', t0: T.PRISM_MORPH, dur: 1.35, stagger: 0.5, turb: 0.045, turbFreq: 0.7, swirl: 0, spiral: 0, drift: 0.016, size: 1.45, alpha: 0.52, white: true },
  { key: 'team', t0: T.PRISM_END, dur: 2.3, stagger: 0.52, turb: 0.09, turbFreq: 0.45, swirl: 0.16, spiral: 0, drift: 0.03, size: 1.05, alpha: 0.55 },
  { key: 'handoff', t0: T.IMPLODE2, dur: 1.55, stagger: 0.36, turb: 0.3, turbFreq: 0.85, swirl: 0, spiral: 2.5, drift: 0.05, size: 1.85, alpha: 0.6, white: true },
];

export interface FilmOptions {
  quality?: FilmQuality;
  reduced?: boolean;
}

export class PrismIntroFilm {
  /** Current film time (seconds). Drives the DOM overlay. */
  private t = 0;
  private started = false;
  private disposed = false;
  private readonly still: boolean;
  private readonly canvas: HTMLCanvasElement;
  private readonly count: number;
  private readonly quality: FilmQuality;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer!: EffectComposer;
  private grade!: ShaderPass;
  private bloom: UnrealBloomPass | null = null;

  private swarm!: THREE.Points;
  private swarmMat = makeSwarmMaterial(1);
  private fromArr!: Float32Array;
  private toArr!: Float32Array;
  private tintAttr!: THREE.BufferAttribute;

  private crystal!: THREE.Mesh;
  private crystalMat = makeCrystalMaterial();
  private beam!: THREE.Mesh;
  private beamMat = makeBeamMaterial();
  private fan: THREE.Mesh[] = [];
  private benzeneGroup = new THREE.Group();
  private benzeneParts: { obj: THREE.Object3D; t0: number }[] = [];
  private phyllo!: THREE.LineSegments;
  private ribbon!: THREE.Line;
  private ribbonPos!: Float32Array;
  private ribbonUsed = 0;
  private head!: THREE.Points;
  private stars!: THREE.Points;
  private starMat!: THREE.ShaderMaterial;
  private haze: THREE.Sprite[] = [];
  private sweep!: THREE.Mesh;
  private emitter!: THREE.Sprite;

  private clock = new THREE.Clock();
  private raf = 0;
  private currentMorph = '';
  private degradeStage = 0;
  private degraded = false;
  private frameAccum = 0;
  private frameCount = 0;

  private onBeforeRender: ((t: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, opts: FilmOptions = {}) {
    this.canvas = canvas;
    this.still = opts.reduced ?? false;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch {
      throw new Error('PRISM intro: WebGL unavailable');
    }
    this.renderer = renderer;
    renderer.setClearColor(new THREE.Color('#010409'), 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    this.quality = opts.quality ?? 'high';
    this.count = COUNTS[this.quality];
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality === 'low' ? 1.25 : 1.6);
    renderer.setPixelRatio(dpr);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
    this.camera.position.set(0, 2, 26);

    this.build();
    this.buildComposer(dpr);

    // seed morph state
    this.currentMorph = '';
    this.applyMorphAt(0.0001);
    this.resize();

    if (this.still) this.t = 4.9; // frozen hero frame for reduced motion
  }

  /** Called every frame with current time — used by the DOM overlay. */
  setBeforeRender(cb: (t: number) => void): void {
    this.onBeforeRender = cb;
  }

  get time(): number {
    return this.t;
  }

  get progress(): number {
    return Math.min(1, this.t / TOTAL);
  }

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.clock.start();
    const loop = (): void => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Jump to the handoff sequence (skip button / Esc). */
  skip(): void {
    if (this.still) {
      this.t = T.END_FADE;
      return;
    }
    this.t = Math.max(this.t, T.IMPLODE2);
    this.applyMorphAt(this.t);
  }

  /** Introspection for the ?debug hook — morph state + live target bounds. */
  debugState(): Record<string, unknown> {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < this.count; i++) {
      if (this.toArr[i * 3] < minX) minX = this.toArr[i * 3];
      if (this.toArr[i * 3] > maxX) maxX = this.toArr[i * 3];
      if (this.toArr[i * 3 + 1] < minY) minY = this.toArr[i * 3 + 1];
      if (this.toArr[i * 3 + 1] > maxY) maxY = this.toArr[i * 3 + 1];
      if (this.toArr[i * 3 + 2] < minZ) minZ = this.toArr[i * 3 + 2];
      if (this.toArr[i * 3 + 2] > maxZ) maxZ = this.toArr[i * 3 + 2];
    }
    const u = this.swarmMat.uniforms;
    return {
      morph: this.currentMorph,
      t: Number(this.t.toFixed(2)),
      morphT0: u.uMorphT0.value,
      morphDur: u.uMorphDur.value,
      uBurst: u.uBurst.value,
      camera: {
        pos: this.camera.position.toArray().map((v) => Number(v.toFixed(2))),
        fov: Number(this.camera.fov.toFixed(1)),
        aspect: Number(this.camera.aspect.toFixed(3)),
      },
      rendererSize: this.renderer.getSize(new THREE.Vector2()).toArray(),
      targetBounds: { minX, maxX, minY, maxY, minZ, maxZ },
      count: this.count,
      drawRange: this.swarm.geometry.drawRange,
    };
  }

  resize(): void {
    if (this.disposed) return;
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer.setSize(w, h);
    if (this.bloom) this.bloom.setSize(w / 2, h / 2);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = (mesh as unknown as { material?: THREE.Material | THREE.Material[] }).material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) mat.dispose();
    });
    this.composer.dispose();
    this.renderer.dispose();
  }

  // ── construction ──────────────────────────────────────────────────────────

  private build(): void {
    const n = this.count;

    // The Swarm — ping-pong morph buffers
    this.fromArr = new Float32Array(n * 3);
    this.toArr = new Float32Array(n * 3);
    const rand = new Float32Array(n * 4);
    const tint = new Float32Array(n * 3);
    const rng = makeRng(2024);
    for (let i = 0; i < n; i++) {
      rand[i * 4] = rng();
      rand[i * 4 + 1] = rng();
      rand[i * 4 + 2] = rng();
      rand[i * 4 + 3] = rng();
      tint[i * 3] = 1;
      tint[i * 3 + 1] = 1;
      tint[i * 3 + 2] = 1;
    }
    // genesis starting point: a needle of light
    for (let i = 0; i < n; i++) {
      const r = Math.pow(rng(), 3) * 0.1;
      const th = rng() * Math.PI * 2;
      const ph = Math.acos(1 - 2 * rng());
      this.fromArr[i * 3] = r * Math.sin(ph) * Math.cos(th);
      this.fromArr[i * 3 + 1] = r * Math.cos(ph);
      this.fromArr[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    cloud(n, 16, this.toArr, 3);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aFrom', new THREE.BufferAttribute(this.fromArr, 3));
    geo.setAttribute('aTo', new THREE.BufferAttribute(this.toArr, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
    this.tintAttr = new THREE.BufferAttribute(tint, 3);
    geo.setAttribute('aTint', this.tintAttr);
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    // position buffer is unused by the shader but three requires it — mirror aTo
    posAttr.array.set(this.toArr);

    this.swarmMat = makeSwarmMaterial(this.renderer.getPixelRatio());
    this.swarm = new THREE.Points(geo, this.swarmMat);
    this.swarm.frustumCulled = false;
    this.scene.add(this.swarm);

    // Starfield shell
    {
      const sn = this.quality === 'low' ? 420 : 950;
      const sp = new Float32Array(sn * 3);
      const sph = new Float32Array(sn);
      const ss = new Float32Array(sn);
      const sc = new Float32Array(sn * 3);
      starSphere(sn, 46, sp, 5);
      const rng2 = makeRng(6);
      for (let i = 0; i < sn; i++) {
        sph[i] = rng2();
        ss[i] = 1.1 + rng2() * 2.4;
        const warm = rng2();
        sc[i * 3] = 0.72 + warm * 0.28;
        sc[i * 3 + 1] = 0.82 + warm * 0.14;
        sc[i * 3 + 2] = 1.0;
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      sg.setAttribute('aPhase', new THREE.BufferAttribute(sph, 1));
      sg.setAttribute('aSize', new THREE.BufferAttribute(ss, 1));
      sg.setAttribute('aColor', new THREE.BufferAttribute(sc, 3));
      this.starMat = new THREE.ShaderMaterial({
        vertexShader: STAR_VERTEX,
        fragmentShader: STAR_FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uPixelRatio: { value: this.renderer.getPixelRatio() },
          uAlpha: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      this.stars = new THREE.Points(sg, this.starMat);
      this.stars.frustumCulled = false;
      this.scene.add(this.stars);
    }

    // Crystal prism — 3-sided cylinder = triangular prism, vertex up
    {
      const cg = new THREE.CylinderGeometry(1.18, 1.18, 2.1, 3, 1);
      this.crystal = new THREE.Mesh(cg, this.crystalMat);
      this.crystal.rotation.x = Math.PI / 2; // axis → z (depth)
      this.crystal.rotation.z = Math.PI / 2; // flat face toward beam
      this.crystal.rotation.y = 0.12;
      this.crystal.scale.setScalar(0.001);
      this.crystal.visible = false;
      this.scene.add(this.crystal);
    }

    // Beam — white light into the prism
    {
      const len = 5.2;
      const bg = new THREE.CylinderGeometry(0.085, 0.085, len, 20, 1, true);
      this.beam = new THREE.Mesh(bg, this.beamMat);
      this.beam.rotation.z = Math.PI / 2;
      this.beam.position.set(-1.05 - len / 2, 0, 0);
      this.beam.visible = false;
      this.scene.add(this.beam);

      const tex = glowTexture();
      this.emitter = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: tex,
          color: new THREE.Color('#eaf6ff'),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          opacity: 0,
        }),
      );
      this.emitter.scale.setScalar(1.4);
      this.emitter.position.set(-6.25, 0, 0);
      this.scene.add(this.emitter);
    }

    // Spectral fan — 7 ribbons leaving the prism
    {
      const SPECTRUM_COLORS = ['#9e6bff', '#5c8bff', '#33d6ff', '#4dffd9', '#a6ff73', '#ffcc59', '#ff7380'];
      for (let k = 0; k < 7; k++) {
        const len = 7.4;
        const mat = makeBeamMaterial();
        mat.uniforms.uColor.value = new THREE.Color(SPECTRUM_COLORS[k]);
        mat.uniforms.uIntensity.value = 0;
        const fg = new THREE.PlaneGeometry(0.09, len, 1, 1);
        // orient: plane's long axis (y) will be rotated to lie along +x after fan rotation
        const mesh = new THREE.Mesh(fg, mat);
        mesh.visible = false;
        this.fan.push(mesh);
        this.scene.add(mesh);
      }
    }

    // Benzene — real geometry, assembled piece by piece
    {
      const atomMat = this.crystalMat;
      const RC = 1.62;
      const RH = 2.62;
      const tilt = 0.32;
      this.benzeneGroup.rotation.x = tilt;
      this.benzeneGroup.visible = false;
      this.scene.add(this.benzeneGroup);

      for (let c = 0; c < 6; c++) {
        const a = (c / 6) * Math.PI * 2 + Math.PI / 6;
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.34, 28, 28), atomMat);
        m.position.set(Math.cos(a) * RC, Math.sin(a) * RC, 0);
        m.scale.setScalar(0.001);
        this.benzeneGroup.add(m);
        this.benzeneParts.push({ obj: m, t0: c * 0.05 });
      }
      for (let c = 0; c < 6; c++) {
        const a = (c / 6) * Math.PI * 2 + Math.PI / 6;
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 22, 22), atomMat);
        m.position.set(Math.cos(a) * RH, Math.sin(a) * RH, 0);
        m.scale.setScalar(0.001);
        this.benzeneGroup.add(m);
        this.benzeneParts.push({ obj: m, t0: 0.3 + c * 0.05 });
      }
      for (let c = 0; c < 6; c++) {
        const a0 = (c / 6) * Math.PI * 2 + Math.PI / 6;
        const a1 = a0 + (Math.PI * 2) / 6;
        const dbl = c % 2 === 0;
        const offsets = dbl ? [0.13, -0.13] : [0];
        for (const off of offsets) {
          const ax = Math.cos(a0) * RC;
          const ay = Math.sin(a0) * RC;
          const bx = Math.cos(a1) * RC;
          const by = Math.sin(a1) * RC;
          const nx = -(by - ay);
          const ny = bx - ax;
          const nl = Math.hypot(nx, ny) || 1;
          const bond = new THREE.Mesh(
            new THREE.CylinderGeometry(0.055, 0.055, RC, 10, 1),
            new THREE.MeshBasicMaterial({
              color: new THREE.Color('#59b8ff'),
              transparent: true,
              opacity: 0.85,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            }),
          );
          bond.position.set((ax + bx) / 2 + (nx / nl) * off, (ay + by) / 2 + (ny / nl) * off, 0);
          bond.rotation.z = Math.atan2(by - ay, bx - ax) - Math.PI / 2;
          bond.scale.set(0.001, 0.001, 0.001);
          this.benzeneGroup.add(bond);
          this.benzeneParts.push({ obj: bond, t0: 0.55 + c * 0.06 });
        }
      }
      // π electron torus rings
      const torusMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color('#7fd0ff'),
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      for (const zz of [0.4, -0.4]) {
        const tor = new THREE.Mesh(new THREE.TorusGeometry(RC * 0.96, 0.014, 8, 120), torusMat);
        tor.position.z = zz;
        tor.scale.setScalar(0.001);
        this.benzeneGroup.add(tor);
        this.benzeneParts.push({ obj: tor, t0: 0.9 });
      }
    }

    // Phyllotaxis shell — golden-angle wireframe bloom
    {
      const wire = new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(3.55, 2));
      this.phyllo = new THREE.LineSegments(
        wire,
        new THREE.LineBasicMaterial({
          color: new THREE.Color('#4da3ff'),
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      this.phyllo.visible = false;
      this.scene.add(this.phyllo);
    }

    // Lorenz ribbon — the attractor drawing itself live
    {
      const MAX = 5200;
      this.ribbonPos = new Float32Array(MAX * 3);
      const { data, used } = lorenzPolyline(MAX);
      this.ribbonPos.set(data.subarray(0, used * 3));
      this.ribbonUsed = used;
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.BufferAttribute(this.ribbonPos, 3));
      rg.setDrawRange(0, 0);
      this.ribbon = new THREE.Line(
        rg,
        new THREE.LineBasicMaterial({
          color: new THREE.Color('#bfe9ff'),
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      this.ribbon.visible = false;
      this.ribbon.frustumCulled = false;
      this.scene.add(this.ribbon);

      // head glow — the photon tracing the chaos path
      const hg = new THREE.BufferGeometry();
      hg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
      this.head = new THREE.Points(
        hg,
        new THREE.PointsMaterial({
          color: new THREE.Color('#ffffff'),
          size: 0.5,
          sizeAttenuation: true,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      this.head.visible = false;
      this.scene.add(this.head);
    }

    // Light sweep blade — anamorphic wipe across the wordmarks
    {
      const sg = new THREE.PlaneGeometry(0.5, 7.5);
      const sm = new THREE.MeshBasicMaterial({
        color: new THREE.Color('#dff2ff'),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.sweep = new THREE.Mesh(sg, sm);
      this.sweep.visible = false;
      this.scene.add(this.sweep);
    }

    // Dreamy haze — huge soft sprites for depth
    {
      const tex = glowTexture();
      const cfgs: [number, number, number, number, number][] = [
        [-9, 3, -14, 34, 0.1],
        [10, -4, -18, 42, 0.08],
        [0, 0, -24, 55, 0.07],
      ];
      for (const [x, y, z, s, o] of cfgs) {
        const sp = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: tex,
            color: new THREE.Color('#1b4a8f'),
            transparent: true,
            opacity: o,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        sp.position.set(x, y, z);
        sp.scale.setScalar(s);
        this.haze.push(sp);
        this.scene.add(sp);
      }
    }
  }

  private buildComposer(dpr: number): void {
    const size = new THREE.Vector2();
    this.renderer.getSize(size);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    if (this.quality !== 'low') {
      this.bloom = new UnrealBloomPass(size, 0.85, 0.55, 0.32);
      this.composer.addPass(this.bloom);
    }

    this.grade = new ShaderPass(GRADE_SHADER);
    this.grade.uniforms.uAber.value = this.quality === 'low' ? 0.3 : 0.55;
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    void dpr;
  }

  // ── morph scheduling ──────────────────────────────────────────────────────

  private applyMorphAt(t: number): void {
    let beat: MorphBeat = MORPHS[0];
    for (const m of MORPHS) {
      if (t >= m.t0) beat = m;
      else break;
    }
    if (beat.key === this.currentMorph) return;
    this.currentMorph = beat.key;

    const n = this.count;
    // previous target becomes the new origin
    (this.fromArr as Float32Array).set(this.toArr);

    switch (beat.key) {
      case 'genesis':
        cloud(n, 16, this.toArr, 3);
        break;
      case 'labs':
        sampleTextPoints('ZYNASH LABS', n, 15.4, 1.0, this.toArr, 7);
        break;
      case 'optics':
        prismLight(n, this.toArr, this.tintAttr.array as Float32Array, 11);
        break;
      case 'chemistry':
        benzene(n, this.toArr, this.tintAttr.array as Float32Array, 23);
        break;
      case 'mathematics':
        lorenzPhyllo(n, this.toArr, this.tintAttr.array as Float32Array, 47);
        break;
      case 'implode':
      case 'handoff':
        implode(n, this.toArr, 131);
        break;
      case 'prism':
        sampleTextPoints('PRISM', n, 15.6, 1.15, this.toArr, 9);
        break;
      case 'team':
        galaxy(n, this.toArr, this.tintAttr.array as Float32Array, 91);
        break;
    }

    if (beat.white) {
      const arr = this.tintAttr.array as Float32Array;
      for (let i = 0; i < n; i++) {
        arr[i * 3] = 1;
        arr[i * 3 + 1] = 1;
        arr[i * 3 + 2] = 1;
      }
    }

    const geo = this.swarm.geometry;
    (geo.getAttribute('aFrom') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('aTo') as THREE.BufferAttribute).needsUpdate = true;
    this.tintAttr.needsUpdate = true;

    this.swarmMat.uniforms.uMorphT0.value = beat.t0;
    this.swarmMat.uniforms.uMorphDur.value = beat.dur;
    this.swarmMat.uniforms.uStagger.value = beat.stagger;
    this.swarmMat.uniforms.uTurb.value = beat.turb;
    this.swarmMat.uniforms.uTurbFreq.value = beat.turbFreq;
    this.swarmMat.uniforms.uSwirl.value = beat.swirl;
    this.swarmMat.uniforms.uSpiral.value = beat.spiral;
    this.swarmMat.uniforms.uDrift.value = beat.drift;
    this.swarmMat.uniforms.uSize.value = beat.size;
    this.swarmMat.uniforms.uAlpha.value = beat.alpha;
  }

  // ── per-frame act choreography (all idempotent from t) ────────────────────

  private updateActs(t: number): void {
    const u = this.swarmMat.uniforms;

    // genesis burst expansion → relax before the wordmark forms
    u.uBurst.value = window01(t, T.BURST, T.LABS_MORPH + 0.4, 0.9, 0.8) * 0.9;

    // stars: hidden in genesis/labs (void), on from optics onward
    this.starMat.uniforms.uAlpha.value =
      0.55 * window01(t, T.OPTICS_IN - 0.4, TOTAL, 1.2, 1.0) +
      0.2 * window01(t, T.PRISM_END, T.IMPLODE2, 2.0, 1.0);

    // crystal choreography
    const crystalIn = window01(t, T.OPTICS_IN, T.IMPLODE, 0.55, 0.35);
    this.crystal.visible = crystalIn > 0.001;
    if (this.crystal.visible) {
      // assemble with overshoot, then hold; drifts aside during chem/math
      const grow = Math.min(1, (t - T.OPTICS_IN) / 0.55);
      const back = 1 + 2.2 * Math.pow(grow - 1, 3) + 1.2 * Math.pow(grow - 1, 2);
      let px = 0;
      let py = 0;
      let pz = 0;
      const chemShift = window01(t, T.CHEM_IN - 0.3, T.CHEM_IN + 1.2, 0.8, 0.4);
      px += chemShift * -3.6;
      py += chemShift * 0.5;
      pz += chemShift * -1.2;
      const mathShift = window01(t, T.MATH_IN - 0.2, T.MATH_IN + 1.1, 0.8, 0.4);
      px += mathShift * -0.9;
      py += mathShift * -1.0;
      pz += mathShift * -0.5;
      const scale = back * (1 - 0.12 * chemShift);
      this.crystal.position.set(px, py, pz);
      this.crystal.scale.setScalar(Math.max(0.001, scale));
      this.crystal.rotation.z = Math.PI / 2 + Math.sin(t * 0.6) * 0.05 + chemShift * 0.4;
      this.crystalMat.uniforms.uTime.value = t;
      this.crystalMat.uniforms.uOpacity.value = 0.66 * crystalIn;
    }

    // beam ignite → absorbed at optics end
    const beamI = window01(t, T.BEAM_IGNITE, T.OPTICS_END + 0.35, 0.5, 0.55);
    this.beam.visible = beamI > 0.001;
    this.beamMat.uniforms.uTime.value = t;
    this.beamMat.uniforms.uIntensity.value = beamI * 1.25;
    (this.emitter.material as THREE.SpriteMaterial).opacity =
      beamI * (0.65 + 0.25 * Math.sin(t * 7.3));

    // spectral fan bloom
    const fanI = window01(t, T.SPECTRUM_BLOOM, T.OPTICS_END, 0.7, 0.5);
    for (let k = 0; k < 7; k++) {
      const mesh = this.fan[k];
      const mat = mesh.material as THREE.ShaderMaterial;
      mat.uniforms.uTime.value = t;
      const stagger = k * 0.045;
      const local = window01(t + stagger, T.SPECTRUM_BLOOM, T.OPTICS_END, 0.55, 0.42);
      const band = (k - 3) / 3;
      const angle = band * 0.15;
      const len = 7.4;
      // ribbon grows out of the prism face along its fanned direction
      mesh.visible = local > 0.001;
      if (mesh.visible) {
        mesh.rotation.z = angle; // rotate around z fans it vertically
        mesh.position.set(
          1.02 + Math.cos(angle) * (len / 2) * local + 0.06,
          Math.sin(angle) * (len / 2) * local,
          0,
        );
        mesh.scale.set(1, Math.max(0.001, local), 1);
        mat.uniforms.uIntensity.value = local * (0.5 + 0.28 * Math.sin(t * 5.1 + k));
      }
    }

    // benzene assembly
    const chemOn = t >= T.CHEM_IN - 0.2 && t < T.CHEM_END + 0.4;
    this.benzeneGroup.visible = chemOn;
    if (chemOn) {
      this.benzeneGroup.rotation.y = (t - T.CHEM_IN) * 0.24;
      for (const part of this.benzeneParts) {
        const p = Math.min(1, Math.max(0, (t - (T.BENZENE_ASSEMBLE + part.t0)) / 0.45));
        const e = 1 - Math.pow(1 - p, 3);
        const pop = 1 + 0.18 * Math.sin(p * Math.PI);
        part.obj.scale.setScalar(Math.max(0.001, e * pop));
      }
    }

    // phyllotaxis bloom + slow spin
    const phylloI = window01(t, T.PHYLLO_BLOOM, T.MATH_END, 0.8, 0.5);
    this.phyllo.visible = phylloI > 0.001;
    if (this.phyllo.visible) {
      (this.phyllo.material as THREE.LineBasicMaterial).opacity = phylloI * 0.3;
      this.phyllo.rotation.y = t * 0.16;
      this.phyllo.position.y = 0.6;
    }

    // lorenz ribbon draw
    const mathOn = t >= T.MATH_IN && t < T.MATH_END + 0.35;
    this.ribbon.visible = mathOn;
    this.head.visible = mathOn;
    if (mathOn) {
      const prog = Math.min(1, (t - T.MATH_IN) / (T.MATH_END - T.MATH_IN - 0.35));
      const shown = Math.max(2, Math.floor(this.ribbonUsed * prog));
      const rg = this.ribbon.geometry;
      rg.setDrawRange(0, shown);
      const headIdx = Math.min(this.ribbonUsed - 1, shown - 1);
      const hp = (this.head.geometry.getAttribute('position') as THREE.BufferAttribute)
        .array as Float32Array;
      hp[0] = this.ribbonPos[headIdx * 3];
      hp[1] = this.ribbonPos[headIdx * 3 + 1];
      hp[2] = this.ribbonPos[headIdx * 3 + 2];
      (this.head.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (this.ribbon.material as THREE.LineBasicMaterial).opacity = 0.95 * Math.min(1, (T.MATH_END + 0.35 - t) / 0.3);
    }

    // wordmark sweep blade
    const sweepT = t >= T.LABS_SWEEP && t <= T.LABS_SWEEP + 0.75;
    const sweepT2 = t >= T.LOCKUP + 0.25 && t <= T.LOCKUP + 1.0;
    this.sweep.visible = sweepT || sweepT2;
    if (this.sweep.visible) {
      const st = sweepT ? (t - T.LABS_SWEEP) / 0.75 : (t - (T.LOCKUP + 0.25)) / 0.75;
      const x = -8.5 + st * 17;
      const sm = this.sweep.material as THREE.MeshBasicMaterial;
      sm.opacity = 0.85 * Math.sin(Math.min(1, Math.max(0, st)) * Math.PI);
      this.sweep.position.set(x, sweepT ? 0 : 0, sweepT ? 0 : 0.4);
      this.sweep.scale.set(1, sweepT ? 1 : 1.35, 1);
    }

    // haze breathing
    for (let i = 0; i < this.haze.length; i++) {
      const sp = this.haze[i];
      const boost = t > T.PRISM_END ? 0.06 : 0;
      (sp.material as THREE.SpriteMaterial).opacity =
        (0.06 + boost) * (1 + 0.3 * Math.sin(t * 0.4 + i * 2.1));
      sp.material.rotation = t * 0.01 * (i % 2 === 0 ? 1 : -1);
    }

    // grade bus — flashes, blue washes, end fade
    const gu = this.grade.uniforms;
    const flash1 = Math.max(0, 1 - Math.abs(t - T.FLASH) / 0.42);
    const flash2 = Math.max(0, 1 - Math.abs(t - T.HYPERFLASH) / 0.5);
    gu.uFlash.value = Math.min(1, flash1 * 0.85 + flash2 * 1.0);
    gu.uBlueFlash.value =
      0.05 * window01(t, T.PRISM_MORPH, T.PRISM_END, 0.8, 1.0) +
      0.3 * window01(t, T.TEAM0, T.IMPLODE2, 2.5, 1.0) +
      0.55 * window01(t, T.END_FADE, TOTAL + 1, 0.5, 2.0);
    gu.uFade.value = window01(t, T.END_FADE, TOTAL, 0.45, 0.55) * 0.96;
    gu.uTime.value = t;
    // CA punch on flash
    gu.uAber.value = (this.quality === 'low' ? 0.3 : 0.55) + flash1 * 1.4 + flash2 * 1.6;

    // bloom breathes with the acts
    if (this.bloom) {
      const base = 0.8;
      const labsGlow = 0.3 * window01(t, T.LABS_MORPH + 1.2, T.LABS_SHATTER, 0.8, 0.6);
      const flashGlow = 0.6 * Math.max(flash1, flash2);
      this.bloom.strength = base + labsGlow + flashGlow;
    }
  }

  private updateCamera(t: number): void {
    const keys = CAMERA;
    let k0 = keys[0];
    let k1 = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) {
      if (t >= keys[i].t && t <= keys[i + 1].t) {
        k0 = keys[i];
        k1 = keys[i + 1];
        break;
      }
    }
    if (t < keys[0].t) {
      k0 = k1 = keys[0];
    } else if (t > keys[keys.length - 1].t) {
      k0 = k1 = keys[keys.length - 1];
    }
    const span = Math.max(0.0001, k1.t - k0.t);
    let p = Math.min(1, Math.max(0, (t - k0.t) / span));
    p = p * p * (3 - 2 * p); // smoothstep
    const lerp = (a: number, b: number): number => a + (b - a) * p;

    const shakeA = lerp(k0.shake ?? 0, k1.shake ?? 0);
    const az = lerp(k0.az, k1.az) + flicker(t, 1) * shakeA + Math.sin(t * 0.43) * 0.006;
    const el = lerp(k0.el, k1.el) + flicker(t, 2) * shakeA + Math.sin(t * 0.31) * 0.004;
    const r = lerp(k0.r, k1.r);

    const lx = lerp(k0.lx, k1.lx);
    const ly = lerp(k0.ly, k1.ly);
    const lz = lerp(k0.lz, k1.lz);

    this.camera.position.set(
      lx + r * Math.cos(el) * Math.cos(az),
      ly + r * Math.sin(el),
      lz + r * Math.cos(el) * Math.sin(az),
    );
    this.camera.lookAt(lx, ly, lz);

    const fov = lerp(k0.fov, k1.fov) + flicker(t, 3) * 0.4;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private degradeIfNeeded(dt: number): void {
    if (this.degradeStage >= 3) return;
    this.frameAccum += dt;
    this.frameCount++;
    if (this.frameCount >= 45) {
      const avg = this.frameAccum / this.frameCount;
      this.frameAccum = 0;
      this.frameCount = 0;
      if (avg > 0.034) {
        this.degradeStage++;
        // shed particles in half-steps; soften bloom; keep the film alive
        const frac = this.degradeStage === 1 ? 0.55 : 0.3;
        this.swarm.geometry.setDrawRange(0, Math.floor(this.count * frac));
        if (this.degradeStage >= 2 && this.bloom) {
          this.bloom.strength = Math.min(this.bloom.strength, 0.5);
          this.bloom.radius = 0.35;
        }
        if (this.degradeStage >= 3 && this.bloom) {
          this.bloom.strength = 0;
        }
        this.degraded = true;
      }
    }
  }

  private frame(): void {
    const dt = Math.min(0.1, this.clock.getDelta());
    if (!this.still) {
      this.t += dt;
      if (this.t >= TOTAL) this.t = TOTAL;
      this.applyMorphAt(this.t);
    }
    const t = this.t;

    const u = this.swarmMat.uniforms;
    u.uTime.value = t;
    this.starMat.uniforms.uTime.value = t;
    this.beamMat.uniforms.uTime.value = t;
    this.crystalMat.uniforms.uTime.value = t;

    this.updateActs(t);
    this.updateCamera(t);
    this.degradeIfNeeded(dt);

    if (this.onBeforeRender) this.onBeforeRender(t);
    this.composer.render();
  }
}

/** Shared soft-glow sprite texture (radial gradient, generated once). */
let glowTex: THREE.Texture | null = null;
function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = s;
  cv.height = s;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  glowTex = tex;
  return tex;
}
