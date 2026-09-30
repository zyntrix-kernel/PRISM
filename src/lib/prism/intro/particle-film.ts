import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { CAMERA_KEYS, FINALE, SHAPE_SCHEDULE, TOTAL, type ShapeId } from "./config";
import { genShape, genText, mulberry32, type Shape } from "./shapes";

const PI2 = Math.PI * 2;

const POST_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const POST_FRAGMENT = /* glsl */ `
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
`;

const PARTICLE_VERTEX = /* glsl */ `
attribute float aSize;
attribute float aPhase;
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
varying float vPhase;
varying vec3 vColor;

void main() {
  vPhase = aPhase;
  vColor = color;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float depthScale = 280.0 / max(40.0, -mvPosition.z);
  float pulse = 0.92 + 0.08 * sin(uTime * 1.3 + aPhase * 6.28318);
  gl_PointSize = aSize * uSize * uPixelRatio * depthScale * pulse;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const PARTICLE_FRAGMENT = /* glsl */ `
precision highp float;
uniform float uOpacity;
varying float vPhase;
varying vec3 vColor;

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
`;

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
      vertexColors: true,
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
      vertexColors: true,
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
    if (document.hidden) {
      this.lastAt = performance.now();
    } else {
      this.lastAt = performance.now();
    }
  };

  private readonly resize = () => {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer?.setSize(width, height, false);
    this.renderer?.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 760 ? 1.25 : 1.65));
    this.composer?.setSize(width, height);

    const pixelRatio = Math.min(window.devicePixelRatio || 1, width < 760 ? 1.25 : 1.65);
    this.material?.uniforms.uPixelRatio && (this.material.uniforms.uPixelRatio.value = pixelRatio);
    this.titleMaterial?.uniforms.uPixelRatio && (this.titleMaterial.uniforms.uPixelRatio.value = pixelRatio);
  };

  private readonly tick = (now: number) => {
    if (this.disposed) return;
    const dt = Math.min(0.05, Math.max(0, (now - this.lastAt) / 1000));
    this.lastAt = now;
    this.elapsed += dt;

    const t = this.time;
    this.update(t, dt);
    this.raf = requestAnimationFrame(this.tick);
  };

  private update(t: number, dt: number) {
    const active = SHAPE_SCHEDULE.find((item) => t >= item.t0 && t < item.t1);
    if (active && (!this.currentShape || this.currentShape.id !== active.id)) {
      const next = this.shapes.get(active.id);
      if (next) {
        this.morphFrom = this.currentShape;
        this.morphTo = next;
        this.currentShape = { id: active.id, ...next };
      }
    }

    if (this.pointer.distanceTo(this.targetPointer) > 0.0001) {
      const smoothing = 1 - Math.pow(0.001, dt);
      this.pointer.lerp(this.targetPointer, smoothing);
    }

    const cam = this.sampleCamera(t);
    this.camera.position.set(
      Math.sin(cam.az) * cam.r + this.pointer.x * 0.35,
      cam.h + this.pointer.y * 0.22,
      Math.cos(cam.az) * cam.r,
    );
    this.camera.lookAt(this.pointer.x * 0.08, cam.ly + this.pointer.y * 0.05, 0);
    this.camera.fov = cam.fov;
    this.camera.updateProjectionMatrix();

    const morph = this.morphFrom && this.morphTo ? this.morphAmount(t, active) : 1;
    if (this.position && this.color && this.morphFrom && this.morphTo) {
      const from = this.morphFrom.pos;
      const to = this.morphTo.pos;
      const fromCol = this.morphFrom.col;
      const toCol = this.morphTo.col;
      for (let i = 0; i < this.position.count; i++) {
        const k = i * 3;
        this.position.array[k] = THREE.MathUtils.lerp(from[k], to[k], morph);
        this.position.array[k + 1] = THREE.MathUtils.lerp(from[k + 1], to[k + 1], morph);
        this.position.array[k + 2] = THREE.MathUtils.lerp(from[k + 2], to[k + 2], morph);
        this.color.array[k] = THREE.MathUtils.lerp(fromCol[k], toCol[k], morph);
        this.color.array[k + 1] = THREE.MathUtils.lerp(fromCol[k + 1], toCol[k + 1], morph);
        this.color.array[k + 2] = THREE.MathUtils.lerp(fromCol[k + 2], toCol[k + 2], morph);
      }
      this.position.needsUpdate = true;
      this.color.needsUpdate = true;
    }

    const pulse = 0.5 + 0.5 * Math.sin(t * 2.1);
    if (this.material) {
      this.material.uniforms.uTime.value = t;
      this.material.uniforms.uOpacity.value = THREE.MathUtils.smoothstep(Math.min(1, t / 0.8), 0, 1);
      this.material.uniforms.uSize.value = 0.105 + pulse * 0.012;
    }

    if (this.titleMaterial) {
      this.titleMaterial.uniforms.uTime.value = t;
      this.titleMaterial.uniforms.uOpacity.value = THREE.MathUtils.smoothstep((t - 9.8) / 1.0, 0, 1) * (1 - THREE.MathUtils.smoothstep((t - 13.2) / 0.8, 0, 1));
    }

    this.updateOptics(t);
    this.updatePost(t);
    this.composer?.render();
  }

  private updateOptics(t: number) {
    const optical = THREE.MathUtils.smoothstep(Math.min(1, Math.max(0, (t - 4.2) / 1.2)), 0, 1) * (1 - THREE.MathUtils.smoothstep(Math.min(1, Math.max(0, (t - 13.2) / 1.5)), 0, 1));
    if (this.ringA) {
      this.ringA.rotation.z = t * 0.18;
      (this.ringA.material as THREE.LineBasicMaterial).opacity = optical * 0.28;
    }
    if (this.ringB) {
      this.ringB.rotation.z = -t * 0.11;
      (this.ringB.material as THREE.LineBasicMaterial).opacity = optical * 0.16;
    }
    if (this.beam) {
      (this.beam.material as THREE.LineBasicMaterial).opacity = THREE.MathUtils.smoothstep(Math.min(1, Math.max(0, (t - 5.8) / 0.8)), 0, 1) * (1 - THREE.MathUtils.smoothstep(Math.min(1, Math.max(0, (t - 7.4) / 0.5)), 0, 1)) * 0.75;
    }
    this.spectral.forEach((line, index) => {
      (line.material as THREE.LineBasicMaterial).opacity = THREE.MathUtils.smoothstep(Math.min(1, Math.max(0, (t - 6.0) / 0.7)), 0, 1) * (1 - THREE.MathUtils.smoothstep(Math.min(1, Math.max(0, (t - 8.4) / 0.7)), 0, 1)) * (0.12 + index * 0.018);
    });
  }

  private updatePost(t: number) {
    if (!this.post) return;
    const material = this.post.material as THREE.ShaderMaterial;
    material.uniforms.time.value = t;
    material.uniforms.amount.value = THREE.MathUtils.smoothstep(Math.min(1, Math.max(0, (t - 14.8) / 2.8)), 0, 1) * 0.0025;
    material.uniforms.vignette.value = 0.28 + 0.06 * Math.sin(t * 0.7);
  }

  private sampleCamera(t: number) {
    if (t <= CAMERA_KEYS[0].t) return CAMERA_KEYS[0];
    for (let i = 1; i < CAMERA_KEYS.length; i++) {
      const a = CAMERA_KEYS[i - 1];
      const b = CAMERA_KEYS[i];
      if (t <= b.t) {
        const p = THREE.MathUtils.smoothstep((t - a.t) / (b.t - a.t), 0, 1);
        return {
          t,
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

  private morphAmount(t: number, active: { id: ShapeId; t0: number; t1: number } | undefined) {
    if (!active) return 1;
    const span = Math.max(0.001, active.t1 - active.t0);
    return THREE.MathUtils.smootherstep(Math.min(1, Math.max(0, (t - active.t0) / Math.min(1.2, span))), 0, 1);
  }
}
