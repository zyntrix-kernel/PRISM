
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass";
import { CAMERA_KEYS, FINALE, SHAPE_SCHEDULE, TOTAL, TEXT_T0, TEXT_T1, type ShapeId } from "./config";
import { genShape, genText, mulberry32, type Shape } from "./shapes";

const PI2 = Math.PI * 2;

const POST_VERTEX = /* glsl */ \`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
\`;

const POST_FRAGMENT = /* glsl */ \`
precision highp float;
uniform sampler2D tDiffuse;
uniform float amount;
uniform float time;
uniform float grain;
uniform float vignette;
varying vec2 vUv;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec2 centered = vUv - 0.5;
  float chroma = amount * dot(centered, centered) * 2.0;
  vec2 shift = centered * chroma;

  vec3 rgb;
  rgb.r = texture2D(tDiffuse, vUv + shift).r;
  rgb.g = texture2D(tDiffuse, vUv).g;
  rgb.b = texture2D(tDiffuse, vUv - shift).b;

  float n = hash21(vUv * 1920.0 + floor(time * 6.0)) - 0.5;
  rgb += n * grain;

  float d = length(centered * vec2(1.0, 0.92));
  float vig = 1.0 - smoothstep(0.33, 0.78, d) * vignette;

  gl_FragColor = vec4(rgb * vig, 1.0);
}
\`;

const PARTICLE_VERTEX = /* glsl */ \`
attribute float aSize;
attribute float aPhase;
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
varying float vPhase;

void main() {
  vPhase = aPhase;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float depthScale = 280.0 / max(40.0, -mvPosition.z);
  float pulse = 0.92 + 0.08 * sin(uTime * 1.3 + aPhase * 6.28318);
  gl_PointSize = aSize * uSize * uPixelRatio * depthScale * pulse;
  gl_Position = projectionMatrix * mvPosition;
}
\`;

const PARTICLE_FRAGMENT = /* glsl */ \`
precision highp float;
uniform float uOpacity;
varying float vPhase;

void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);
  float alpha = 1.0 - smoothstep(0.18, 0.50, d);
  alpha *= alpha;
  float inner = 1.0 - smoothstep(0.0, 0.28, d);
  vec3 particleColor = mix(vColor * 0.90, vec3(0.985, 0.995, 1.0), inner * 0.72);
  particleColor *= 0.92 + 0.08 * sin(vPhase * 14.0);
  gl_FragColor = vec4(particleColor, alpha * uOpacity);
}
\`;

type RuntimeShape = Shape & { id: ShapeId };

export class PrismParticleFilm {
  private readonly canvas: HTMLCanvasElement;
  private readonly reducedMotion: boolean;
  private readonly duration: number;

  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
  private renderer: THREE.WebGLRenderer | null = null;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private post: ShaderPass | null = null;

  private points: THREE.Points | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private position: THREE.BufferAttribute | null = null;
  private color: THREE.BufferAttribute | null = null;
  private material: THREE.ShaderMaterial | null = null;

  private shapes = new Map<ShapeId, Shape>();
  private currentShape: RuntimeShape | null = null;
  private morphFrom: Shape | null = null;
  private morphTo: Shape | null = null;

  private titlePoints: THREE.Points | null = null;
  private titleMaterial: THREE.ShaderMaterial | null = null;

  private ringA: THREE.LineLoop | null = null;
  private ringB: THREE.LineLoop | null = null;
  private beam: THREE.Line | null = null;
  private spectral: THREE.Line[] = [];

  private pointer = new THREE.Vector2();
  private targetPointer = new THREE.Vector2();

  private raf = 0;
  private startAt = 0;
  private lastAt = 0;
  private elapsed = 0;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, reducedMotion: boolean, duration: number) {
    this.canvas = canvas;
    this.reducedMotion = reducedMotion;
    this.duration = Math.max(9000, duration);
    this.setup();
  }

  get progress() {
    return this.startAt ? Math.min(1, Math.max(0, (performance.now() - this.startAt) / (this.duration * 1000))) : 0;
  }

  get time() {
    return this.startAt ? (performance.now() - this.startAt) / 1000 : 0;
  }

  start() {
    if (this.disposed || this.raf) return;
    this.startAt = performance.now();
    this.lastAt = this.startAt;
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
      const item = object as THREE.Mesh & {
        geometry?: THREE.BufferGeometry;
        material?: THREE.Material | THREE.Material[];
      };
      item.geometry?.dispose();
      if (Array.isArray(item.material)) item.material.forEach((m) => m.dispose());
      else item.material?.dispose();
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
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: false,
        alpha: false,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false,
        depth: true,
        stencil: false,
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.25 : 1.65));
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.12;

      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));

      this.bloom = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        1.28,
        0.58,
        0.82,
      );
      this.composer.addPass(this.bloom);

      this.post = new ShaderPass(
        new THREE.ShaderMaterial({
          uniforms: {
            tDiffuse: { value: null },
            amount: { value: 0 },
            time: { value: 0 },
            grain: { value: 0.0035 },
            vignette: { value: 0.28 },
          },
          vertexShader: POST_VERTEX,
          fragmentShader: POST_FRAGMENT,
        }),
      );
      this.composer.addPass(this.post);
      this.composer.addPass(new OutputPass());

      this.resize();
    } catch {
      this.renderer = null;
      this.composer = null;
    }

    this.buildParticles();
    this.buildTitle();
    this.buildOptics();

    window.addEventListener("resize", this.resize, { passive: true });
    window.addEventListener("pointermove", this.onPointer, { passive: true });
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  private buildParticles() {
    const n = this.reducedMotion || window.innerWidth < 760 ? 5000 : 9000;
    const rng = mulberry32(0x5a17);
    const originRng = mulberry32(0x6511);
    const ids: ShapeId[] = ["origin", "ribbon", "orbit", "prism", "implode"];

    for (const [index, id] of ids.entries()) {
      this.shapes.set(id, genShape(id, n, index === 0 ? originRng : rng));
    }

    const shape = this.shapes.get("origin")!;
    const geometry = new THREE.BufferGeometry();
    const position = new THREE.BufferAttribute(shape.pos.slice() as Float32Array, 3);
    const color = new THREE.BufferAttribute(shape.col.slice() as Float32Array, 3);

    const sizes = new Float32Array(n);
    const phases = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      sizes[i] = 0.6 + rng() * 1.7;
      phases[i] = rng();
    }
    geometry.setAttribute("position", position);
    geometry.setAttribute("color", color);
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 0.11 },
        uPixelRatio: { value: 1 },
        uOpacity: { value: 0 },
      },
      vertexShader: PARTICLE_VERTEX,
      fragmentShader: PARTICLE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const mesh = new THREE.Points(geometry, material);
    this.scene.add(mesh);

    this.geometry = geometry;
    this.position = position;
    this.color = color;
    this.material = material;
    this.points = mesh;
    this.currentShape = { id: "origin", ...shape };
  }

  private buildTitle() {
    const rng = mulberry32(0x9812);
    const titleShape = genText(7600, "PRISM", rng);
    if (!titleShape) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(titleShape.pos, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(titleShape.col, 3));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 0.10 },
        uPixelRatio: { value: 1 },
        uOpacity: { value: 0 },
      },
      vertexShader: PARTICLE_VERTEX,
      fragmentShader: PARTICLE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.titlePoints = new THREE.Points(geometry, material);
    this.titlePoints.position.z = -1.25;
    this.titlePoints.position.y = 0.02;
    this.scene.add(this.titlePoints);
    this.titleMaterial = material;
  }

  private buildOptics() {
    const ringGeometry = (radius: number, z: number) => {
      const geometry = new THREE.BufferGeometry();
      const points: number[] = [];
      for (let i = 0; i < 180; i++) {
        const a = (i / 180) * PI2;
        points.push(Math.cos(a) * radius, Math.sin(a) * radius * 0.62, z);
      }
      return new THREE.BufferAttribute(new Float32Array(points), 3);
    };

    const ringMaterial = () =>
      new THREE.LineBasicMaterial({
        color: "#9ddfff",
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

    this.ringA = new THREE.LineLoop(
      new THREE.BufferGeometry().setAttribute("position", ringGeometry(2.65, -0.3)),
      ringMaterial(),
    );
    this.ringB = new THREE.LineLoop(
      new THREE.BufferGeometry().setAttribute("position", ringGeometry(3.65, 0.3)),
      ringMaterial(),
    );
    this.scene.add(this.ringA, this.ringB);

    const beamGeo = new THREE.BufferGeometry();
    beamGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array([-9, 0.08, 0, 0.1, 0.08, 0]), 3),
    );
    this.beam = new THREE.Line(
      beamGeo,
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
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        "position",
        new THREE.BufferAttribute(
          new Float32Array([
            0, 0.08 + (index - 2) * 0.025, 0,
            0.65, 0.14 + (index - 2) * 0.075, 0,
            7.4, 0.48 + (index - 2) * 0.42, 0,
          ]),
          3,
        ),
      );
      const line = new THREE.Line(
        geo,
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
  }

  private readonly onPointer = (event: PointerEvent) => {
    this.targetPointer.x = event.clientX / Math.max(1, window.innerWidth) - 0.5;
    this.targetPointer.y = -(event.clientY / Math.max(1, window.innerHeight) - 0.5);
  };

  private readonly onVisibility = () => {
    this.lastAt = performance.now();
  };

  private readonly resize = () => {
    if (!this.renderer || !this.composer) return;
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    const dpr = Math.min(window.devicePixelRatio || 1, w < 760 ? 1.25 : 1.65);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);

    const output = this.titleMaterial?.uniforms.uPixelRatio;
    const particle = this.material?.uniforms.uPixelRatio;
    if (output) output.value = dpr;
    if (particle) particle.value = dpr;
  };

  private readonly tick = (now: number) => {
    if (this.disposed) return;

    const dt = Math.min(0.033, Math.max(0.001, (now - this.lastAt) / 1000));
    this.lastAt = now;
    this.elapsed = this.time;

    this.update(dt);

    try {
      this.composer?.render();
    } catch {
      this.renderer = null;
      this.composer = null;
    }

    if (this.progress < 1 && !this.disposed) this.raf = requestAnimationFrame(this.tick);
    else this.raf = 0;
  };

  private update(dt: number) {
    const t = Math.min(TOTAL, this.time);
    const p = Math.min(1, t / TOTAL);

    this.pointer.lerp(this.targetPointer, this.reducedMotion ? 0.18 : 0.055);
    this.updateCamera(t);
    this.updateShapes(t, dt);
    this.updateOptics(t);
    this.updateTitle(t);
    this.updatePost(t, p);
  }

  private updateCamera(t: number) {
    let a = CAMERA_KEYS[0];
    let b = CAMERA_KEYS[CAMERA_KEYS.length - 1];

    for (let i = 0; i < CAMERA_KEYS.length - 1; i++) {
      if (t >= CAMERA_KEYS[i].t && t < CAMERA_KEYS[i + 1].t) {
        a = CAMERA_KEYS[i];
        b = CAMERA_KEYS[i + 1];
        break;
      }
    }

    const alpha = Math.min(1, Math.max(0, (t - a.t) / Math.max(0.001, b.t - a.t)));
    const smooth = alpha * alpha * (3 - 2 * alpha);

    const az = THREE.MathUtils.lerp(a.az, b.az, smooth) + this.pointer.x * 0.035;
    const r = THREE.MathUtils.lerp(a.r, b.r, smooth);
    const h = THREE.MathUtils.lerp(a.h, b.h, smooth) + this.pointer.y * 0.04;

    this.camera.position.set(r * Math.cos(az), h, r * Math.sin(az));
    this.camera.lookAt(0, THREE.MathUtils.lerp(a.ly, b.ly, smooth), 0);
    this.camera.fov = THREE.MathUtils.lerp(a.fov, b.fov, smooth);
    this.camera.updateProjectionMatrix();
  }

  private updateShapes(t: number, dt: number) {
    const schedule =
      SHAPE_SCHEDULE.find((item) => t >= item.t0 && t < item.t1) ??
      (t >= FINALE.implode0 ? { id: "implode" as const, t0: FINALE.implode0, t1: FINALE.flash0 } : SHAPE_SCHEDULE[0]);

    const current = this.currentShape;
    if (!current) return;

    if (current.id !== schedule.id) {
      this.morphFrom = this.readCurrentShape();
      this.morphTo = this.shapes.get(schedule.id) ?? null;
      current.id = schedule.id;
    }

    if (this.morphFrom && this.morphTo) {
      const span = Math.max(0.001, schedule.t1 - schedule.t0);
      const u = Math.min(1, Math.max(0, (t - schedule.t0) / span));
      const e = u * u * (3 - 2 * u);
      this.writeInterpolated(this.morphFrom, this.morphTo, e);
      if (u >= 1) {
        this.morphFrom = null;
        this.morphTo = null;
      }
    }

    if (!this.position || !this.color || !this.material) return;

    const pos = this.position.array as Float32Array;
    const col = this.color.array as Float32Array;
    const amount = this.reducedMotion ? 0.008 : 0.020;
    const settle = t >= 10.9 ? 0.002 : amount;

    for (let i = 0; i < pos.length; i += 3) {
      const particle = i / 3;
      const phase = particle * 0.00071;
      const tangent = Math.sin(this.elapsed * 0.72 + phase) * settle * dt;
      pos[i] += tangent;
      pos[i + 1] += Math.cos(this.elapsed * 0.56 + phase * 1.7) * settle * dt;
      pos[i + 2] += Math.sin(this.elapsed * 0.41 + phase * 0.8) * settle * dt;
    }

    this.position.needsUpdate = true;
    this.color.needsUpdate = true;
    this.material.uniforms.uTime.value = this.elapsed;
    this.material.uniforms.uOpacity.value =
      THREE.MathUtils.smoothstep(Math.min(1, t / 0.72), 0, 1) *
      (1 - THREE.MathUtils.smoothstep(t, FINALE.flash0 - 0.35, FINALE.flash0 + 0.05));
  }

  private readCurrentShape(): Shape {
    const pos = (this.position?.array as Float32Array).slice() ?? new Float32Array();
    const col = (this.color?.array as Float32Array).slice() ?? new Float32Array();
    return { pos, col };
  }

  private writeInterpolated(a: Shape, b: Shape, t: number) {
    if (!this.position || !this.color) return;
    const p = this.position.array as Float32Array;
    const c = this.color.array as Float32Array;
    for (let i = 0; i < p.length; i++) p[i] = a.pos[i] + (b.pos[i] - a.pos[i]) * t;
    for (let i = 0; i < c.length; i++) c[i] = a.col[i] + (b.col[i] - a.col[i]) * t;
  }

  private updateOptics(t: number) {
    const reveal = THREE.MathUtils.smoothstep(t, 0.55, 1.55);
    const spectrum = THREE.MathUtils.smoothstep(t, 7.8, 9.25);
    const fade = 1 - THREE.MathUtils.smoothstep(t, 10.0, 11.4);
    const finale = THREE.MathUtils.smoothstep(t, FINALE.implode0, FINALE.flash0);

    if (this.beam) {
      (this.beam.material as THREE.LineBasicMaterial).opacity = reveal * 0.62 * fade;
      this.beam.position.x = -0.4 + THREE.MathUtils.smoothstep(t, 2.0, 4.4) * 0.36;
    }

    this.spectral.forEach((line, index) => {
      const mat = line.material as THREE.LineBasicMaterial;
      mat.opacity = spectrum * fade * (0.33 + index * 0.03);
      line.position.y = Math.sin(this.elapsed * 0.35 + index) * 0.012;
    });

    if (this.ringA && this.ringB) {
      const op = reveal * (0.08 + spectrum * 0.12) * (1 - finale);
      (this.ringA.material as THREE.LineBasicMaterial).opacity = op;
      (this.ringB.material as THREE.LineBasicMaterial).opacity = op * 0.58;
      this.ringA.rotation.z += 0.0014;
      this.ringB.rotation.z -= 0.0010;
    }

    if (this.points) {
      const scale = 0.9 + THREE.MathUtils.smoothstep(t, 6.4, 10.4) * 0.18;
      this.points.scale.setScalar(scale);
    }

    if (this.titlePoints) {
      this.titlePoints.position.z = THREE.MathUtils.lerp(-1.45, -0.25, THREE.MathUtils.smoothstep(t, TEXT_T0 - 0.35, TEXT_T0 + 0.65));
      this.titlePoints.scale.setScalar(0.86 + THREE.MathUtils.smoothstep(t, TEXT_T0, TEXT_T0 + 1.0) * 0.14);
    }
  }

  private updateTitle(t: number) {
    if (!this.titleMaterial) return;
    const inU = THREE.MathUtils.smoothstep(t, TEXT_T0, TEXT_T0 + 0.70);
    const outU = THREE.MathUtils.smoothstep(t, TEXT_T1 - 0.45, TEXT_T1 + 0.15);
    this.titleMaterial.uniforms.uTime.value = this.elapsed;
    this.titleMaterial.uniforms.uOpacity.value = inU * (1 - outU);
  }

  private updatePost(t: number, p: number) {
    if (!this.bloom || !this.post) return;
    const kick = THREE.MathUtils.smoothstep(t, 8.6, 9.5);
    const finale = THREE.MathUtils.smoothstep(t, FINALE.flash0 - 0.05, FINALE.flash1);
    this.bloom.strength = 0.96 + kick * 0.54 + finale * 1.7;
    this.post.material.uniforms.amount.value =
      (0.001 + kick * 0.006 + finale * 0.016) * (this.reducedMotion ? 0.35 : 1);
    this.post.material.uniforms.time.value = this.elapsed;
    this.post.material.uniforms.grain.value = this.reducedMotion ? 0 : 0.0032;
    this.post.material.uniforms.vignette.value = 0.28 + p * 0.05;
  }
}
