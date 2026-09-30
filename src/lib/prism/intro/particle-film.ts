import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass";
import { CAMERA_KEYS, FINALE, SHAPE_SCHEDULE, TOTAL, type ShapeId } from "./config";
import { genShape, genText, mulberry32, type Shape } from "./shapes";

const PI2 = Math.PI * 2;

type RuntimeShape = Shape & { id: ShapeId };

type OpticLine = THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => value * value * (3 - 2 * value);
const easeOut = (value: number) => 1 - Math.pow(1 - clamp01(value), 3);

function sampleCamera(time: number) {
  if (time <= CAMERA_KEYS[0].t) return CAMERA_KEYS[0];
  for (let i = 0; i < CAMERA_KEYS.length - 1; i++) {
    const a = CAMERA_KEYS[i];
    const b = CAMERA_KEYS[i + 1];
    if (time <= b.t) {
      const p = smooth((time - a.t) / Math.max(0.001, b.t - a.t));
      return {
        t: time,
        r: THREE.MathUtils.lerp(a.r, b.r, p),
        az: THREE.MathUtils.lerp(a.az, b.az, p),
        h: THREE.MathUtils.lerp(a.h, b.h, p),
        ly: THREE.MathUtils.lerp(a.ly, b.ly, p),
        fov: THREE.MathUtils.lerp(a.fov, b.fov, p),
      };
    }
  }
  return CAMERA_KEYS[CAMERA_KEYS.length - 1];
}

export class PrismParticleFilm {
  private readonly canvas: HTMLCanvasElement;
  private readonly reducedMotion: boolean;
  private readonly duration: number;

  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
  private renderer: THREE.WebGLRenderer | null = null;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;

  private points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> | null = null;
  private position: THREE.BufferAttribute | null = null;
  private color: THREE.BufferAttribute | null = null;
  private material: THREE.PointsMaterial | null = null;
  private particleCount = 0;

  private readonly shapes = new Map<ShapeId, Shape>();
  private currentShape: RuntimeShape | null = null;
  private morphFrom: Shape | null = null;
  private morphTo: Shape | null = null;

  private titlePoints: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> | null = null;
  private titleMaterial: THREE.PointsMaterial | null = null;

  private ringA: OpticLine | null = null;
  private ringB: OpticLine | null = null;
  private beam: OpticLine | null = null;
  private spectral: OpticLine[] = [];
  private prismCore: THREE.Mesh | null = null;
  private prismWire: THREE.LineSegments | null = null;

  private pointer = new THREE.Vector2();
  private targetPointer = new THREE.Vector2();
  private raf = 0;
  private startAt = 0;
  private elapsed = 0;
  private disposed = false;
  private wasHidden = false;

  constructor(canvas: HTMLCanvasElement, reducedMotion: boolean, duration: number) {
    this.canvas = canvas;
    this.reducedMotion = reducedMotion;
    this.duration = Math.max(9000, duration || TOTAL * 1000);
    this.setup();
  }

  get progress() {
    return this.startAt
      ? clamp01((performance.now() - this.startAt) / (this.duration * 1000))
      : 0;
  }

  get time() {
    return this.startAt ? (performance.now() - this.startAt) / 1000 : this.elapsed;
  }

  start() {
    if (this.disposed || this.raf) return;
    this.startAt = performance.now() - this.elapsed * 1000;
    this.raf = requestAnimationFrame(this.tick);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;

    window.removeEventListener("resize", this.resize);
    window.removeEventListener("pointermove", this.onPointer);
    document.removeEventListener("visibilitychange", this.onVisibility);

    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh & {
        geometry?: THREE.BufferGeometry;
        material?: THREE.Material | THREE.Material[];
      };
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
      else mesh.material?.dispose();
    });

    this.composer?.dispose();
    this.renderer?.dispose();
    this.renderer = null;
    this.composer = null;
  }

  private setup() {
    this.scene.background = new THREE.Color("#01040a");
    this.camera.position.set(0, 0, 12);

    const hemi = new THREE.HemisphereLight("#d9f8ff", "#06101d", 0.8);
    const key = new THREE.PointLight("#8fe7ff", 26, 38, 2);
    key.position.set(-4, 2.4, 7);
    const rim = new THREE.PointLight("#6a73ff", 16, 30, 2);
    rim.position.set(4, -1.8, 3);
    this.scene.add(hemi, key, rim);

    try {
      const renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: false,
        alpha: false,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false,
        depth: true,
        stencil: false,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.25 : 1.65));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      this.renderer = renderer;

      this.composer = new EffectComposer(renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        this.reducedMotion ? 0.7 : 1.25,
        0.58,
        0.82,
      );
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    } catch {
      this.renderer = null;
      this.composer = null;
    }

    this.buildParticles();
    this.buildTitle();
    this.buildOptics();
    this.resize();

    window.addEventListener("resize", this.resize, { passive: true });
    window.addEventListener("pointermove", this.onPointer, { passive: true });
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  private buildParticles() {
    const count = this.reducedMotion || window.innerWidth < 760 ? 5000 : 9000;
    const rng = mulberry32(0x5a17);
    const originRng = mulberry32(0x6511);
    const ids: ShapeId[] = ["origin", "ribbon", "orbit", "prism", "implode"];

    ids.forEach((id, index) => {
      this.shapes.set(id, genShape(id, count, index === 0 ? originRng : rng));
    });

    const shape = this.shapes.get("origin");
    if (!shape) return;

    const geometry = new THREE.BufferGeometry();
    const position = new THREE.BufferAttribute(shape.pos.slice() as Float32Array, 3);
    const color = new THREE.BufferAttribute(shape.col.slice() as Float32Array, 3);
    geometry.setAttribute("position", position);
    geometry.setAttribute("color", color);

    const material = new THREE.PointsMaterial({
      size: this.reducedMotion ? 0.075 : 0.095,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    this.scene.add(points);

    this.particleCount = count;
    this.position = position;
    this.color = color;
    this.material = material;
    this.points = points;
    this.currentShape = { id: "origin", ...shape };
  }

  private buildTitle() {
    const titleShape = genText(7600, "PRISM", mulberry32(0x9812));
    if (!titleShape) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(titleShape.pos, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(titleShape.col, 3));

    const material = new THREE.PointsMaterial({
      size: 0.085,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    points.position.set(0, 0.02, -1.25);
    points.frustumCulled = false;
    this.scene.add(points);
    this.titlePoints = points;
    this.titleMaterial = material;
  }

  private buildOptics() {
    const makeRing = (radius: number, z: number) => {
      const points: number[] = [];
      for (let i = 0; i < 180; i++) {
        const angle = (i / 180) * PI2;
        points.push(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.62, z);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
      return new THREE.LineLoop(
        geometry,
        new THREE.LineBasicMaterial({
          color: "#9ddfff",
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
    };

    this.ringA = makeRing(2.65, -0.3);
    this.ringB = makeRing(3.65, 0.3);
    this.scene.add(this.ringA, this.ringB);

    const beamGeometry = new THREE.BufferGeometry();
    beamGeometry.setAttribute("position", new THREE.Float32BufferAttribute([-9, 0.08, 0, 0.1, 0.08, 0], 3));
    this.beam = new THREE.Line(
      beamGeometry,
      new THREE.LineBasicMaterial({
        color: "#f5fcff",
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.scene.add(this.beam);

    const spectrum = ["#82ddff", "#8cbfff", "#aaa6ff", "#cf99ff", "#f1b0dc"];
    spectrum.forEach((color, index) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          [
            0, 0.08 + (index - 2) * 0.025, 0,
            0.65, 0.14 + (index - 2) * 0.075, 0,
            7.4, 0.48 + (index - 2) * 0.42, 0,
          ],
          3,
        ),
      );
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      this.spectral.push(line);
      this.scene.add(line);
    });

    const prismGeometry = new THREE.OctahedronGeometry(1.25, 0);
    const prismMaterial = new THREE.MeshPhysicalMaterial({
      color: "#75dfff",
      emissive: "#1b74ff",
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0,
      roughness: 0.08,
      metalness: 0.1,
      transmission: 0.25,
      thickness: 0.35,
    });
    this.prismCore = new THREE.Mesh(prismGeometry, prismMaterial);
    this.prismCore.scale.setScalar(0.001);
    this.scene.add(this.prismCore);

    const wireGeometry = new THREE.EdgesGeometry(prismGeometry);
    this.prismWire = new THREE.LineSegments(
      wireGeometry,
      new THREE.LineBasicMaterial({
        color: "#dff9ff",
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.prismWire.scale.setScalar(0.001);
    this.scene.add(this.prismWire);
  }

  private readonly onPointer = (event: PointerEvent) => {
    this.targetPointer.x = event.clientX / Math.max(1, window.innerWidth) - 0.5;
    this.targetPointer.y = -(event.clientY / Math.max(1, window.innerHeight) - 0.5);
  };

  private readonly onVisibility = () => {
    this.wasHidden = document.hidden;
    if (!document.hidden && this.startAt) this.startAt = performance.now() - this.elapsed * 1000;
  };

  private readonly resize = () => {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer?.setSize(width, height, false);
    this.composer?.setSize(width, height);
    this.material && (this.material.size = width < 760 ? 0.075 : 0.095);
  };

  private readonly tick = (now: number) => {
    if (this.disposed) return;
    if (!this.wasHidden && this.startAt) this.elapsed = (now - this.startAt) / 1000;

    const time = Math.min(this.elapsed, this.duration / 1000);
    this.update(time);
    this.composer?.render();
    if (!this.composer) this.renderer?.render(this.scene, this.camera);

    if (time < this.duration / 1000) this.raf = requestAnimationFrame(this.tick);
    else this.raf = 0;
  };

  private update(time: number) {
    const camera = sampleCamera(time);
    const parallaxX = this.pointer.x * 0.55;
    const parallaxY = this.pointer.y * 0.32;
    this.pointer.lerp(this.targetPointer, 0.055);

    this.camera.fov = camera.fov;
    this.camera.position.set(
      Math.cos(camera.az) * camera.r + parallaxX,
      camera.h + parallaxY,
      Math.sin(camera.az) * camera.r,
    );
    this.camera.lookAt(parallaxX * 0.2, camera.ly, 0);
    this.camera.updateProjectionMatrix();

    this.updateMorph(time);
    this.updateOptics(time);
    this.updateTitle(time);

    if (this.bloom) {
      const finale = clamp01((time - FINALE.implode0) / Math.max(0.001, FINALE.flash0 - FINALE.implode0));
      this.bloom.strength = this.reducedMotion ? 0.7 : 1.05 + easeOut(finale) * 1.15;
    }
  }

  private updateMorph(time: number) {
    if (!this.position || !this.color || !this.material || !this.currentShape) return;

    const schedule = SHAPE_SCHEDULE.find((item) => time >= item.t0 && time < item.t1) ?? SHAPE_SCHEDULE[SHAPE_SCHEDULE.length - 1];
    const target = this.shapes.get(schedule.id);
    if (!target) return;

    if (this.currentShape.id !== schedule.id || this.morphTo !== target) {
      this.morphFrom = this.currentShape;
      this.morphTo = target;
      this.currentShape = { id: schedule.id, ...target };
    }

    const span = Math.max(0.001, schedule.t1 - schedule.t0);
    const p = smooth(clamp01((time - schedule.t0) / span));
    const from = this.morphFrom?.pos ?? target.pos;
    const to = this.morphTo?.pos ?? target.pos;
    const pos = this.position.array as Float32Array;
    const col = this.color.array as Float32Array;

    for (let i = 0; i < this.particleCount * 3; i++) {
      pos[i] = THREE.MathUtils.lerp(from[i], to[i], p);
      col[i] = THREE.MathUtils.lerp(from === to ? to[i] : from === this.morphFrom?.pos ? (this.morphFrom?.col[i] ?? to[i]) : to[i], to[i], p);
    }

    this.position.needsUpdate = true;
    this.color.needsUpdate = true;

    const entrance = easeOut(clamp01(time / 1.0));
    const finale = clamp01((time - FINALE.implode0) / Math.max(0.001, FINALE.flash0 - FINALE.implode0));
    this.material.opacity = Math.max(0, Math.min(1, entrance * (1 - finale * 0.82)));

    if (this.points) {
      this.points.rotation.y = time * 0.025 + this.pointer.x * 0.08;
      this.points.rotation.x = Math.sin(time * 0.18) * 0.025;
      this.points.scale.setScalar(1 + Math.sin(time * 0.8) * 0.012);
    }
  }

  private updateTitle(time: number) {
    if (!this.titlePoints || !this.titleMaterial) return;
    const appear = easeOut(clamp01((time - 9.9) / 1.15));
    const settle = 1 - clamp01((time - 13.55) / 0.75);
    const finale = clamp01((time - FINALE.implode0) / 2.0);
    this.titleMaterial.opacity = appear * Math.max(0, settle) * (1 - finale * 0.95);
    this.titlePoints.rotation.y = this.pointer.x * 0.05 + Math.sin(time * 0.22) * 0.02;
    this.titlePoints.rotation.x = this.pointer.y * 0.03;
    const scale = 0.92 + easeOut(appear) * 0.08 + Math.sin(time * 1.2) * 0.008;
    this.titlePoints.scale.setScalar(scale);
  }

  private updateOptics(time: number) {
    const science = clamp01((time - 3.2) / 5.0);
    const prism = clamp01((time - 7.7) / 2.0);
    const implode = clamp01((time - FINALE.implode0) / 1.8);
    const flash = clamp01((time - FINALE.flash0) / Math.max(0.001, FINALE.flash1 - FINALE.flash0));

    if (this.ringA && this.ringB) {
      this.ringA.material.opacity = 0.18 * science * (1 - implode);
      this.ringB.material.opacity = 0.11 * science * (1 - implode);
      this.ringA.rotation.z = time * 0.12;
      this.ringB.rotation.z = -time * 0.085;
      this.ringA.scale.setScalar(1 + Math.sin(time * 0.8) * 0.025);
      this.ringB.scale.setScalar(1 + Math.cos(time * 0.65) * 0.035);
    }

    if (this.beam) {
      this.beam.material.opacity = 0.16 * science + flash * 0.7;
      this.beam.scale.x = 0.45 + science * 0.55;
    }

    this.spectral.forEach((line, index) => {
      line.material.opacity = science * 0.08 + flash * 0.32;
      line.rotation.z = Math.sin(time * 0.25 + index) * 0.035;
    });

    if (this.prismCore && this.prismWire) {
      const scale = Math.max(0.001, easeOut(prism) * (1 - implode * 0.88));
      this.prismCore.scale.setScalar(scale * 1.05);
      this.prismWire.scale.setScalar(scale * 1.05);
      this.prismCore.rotation.x = time * 0.18;
      this.prismCore.rotation.y = time * 0.28;
      this.prismWire.rotation.copy(this.prismCore.rotation);
      const coreMaterial = this.prismCore.material as THREE.MeshPhysicalMaterial;
      const wireMaterial = this.prismWire.material as THREE.LineBasicMaterial;
      coreMaterial.opacity = prism * (1 - implode * 0.9) + flash * 0.35;
      wireMaterial.opacity = prism * 0.65 * (1 - implode) + flash * 0.7;
    }
  }
}
