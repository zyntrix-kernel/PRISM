
import * as THREE from "three";

const VERTEX_SHADER = /* glsl */ \`
precision highp float;

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
\`;

const FRAGMENT_SHADER = /* glsl */ \`
precision highp float;

uniform float uTime;
uniform float uProgress;
uniform float uAspect;
uniform vec2 uPointer;
uniform float uReducedMotion;

varying vec2 vUv;

#define PI 3.14159265359

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));

  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amp = 0.5;

  for (int i = 0; i < 4; i++) {
    value += noise(p) * amp;
    p = p * 2.02 + 11.7;
    amp *= 0.5;
  }

  return value;
}

float segmentDistance(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);
  return length(p - (a + ab * h));
}

float segmentGlow(vec2 p, vec2 a, vec2 b, float width) {
  float d = segmentDistance(p, a, b);
  return exp(-(d * d) / max(width * width, 0.000001));
}

float cross2(vec2 a, vec2 b) {
  return a.x * b.y - a.y * b.x;
}

float triangleInside(vec2 p, vec2 a, vec2 b, vec2 c) {
  float s1 = cross2(b - a, p - a);
  float s2 = cross2(c - b, p - b);
  float s3 = cross2(a - c, p - c);

  float positive = step(0.0, s1) * step(0.0, s2) * step(0.0, s3);
  float negative = step(0.0, -s1) * step(0.0, -s2) * step(0.0, -s3);

  return max(positive, negative);
}

float triangleDistance(vec2 p, vec2 a, vec2 b, vec2 c) {
  return min(
    segmentDistance(p, a, b),
    min(segmentDistance(p, b, c), segmentDistance(p, c, a))
  );
}

vec3 spectralColor(int index) {
  if (index == 0) return vec3(0.33, 0.82, 1.00);
  if (index == 1) return vec3(0.43, 0.73, 1.00);
  if (index == 2) return vec3(0.61, 0.62, 1.00);
  if (index == 3) return vec3(0.80, 0.54, 1.00);
  return vec3(1.00, 0.70, 0.90);
}

void main() {
  float reduced = clamp(uReducedMotion, 0.0, 1.0);
  float p = clamp(uProgress, 0.0, 1.0);
  float t = uTime * mix(1.0, 0.32, reduced);

  vec2 screen = (vUv - 0.5) * vec2(uAspect, 1.0);
  float responsive = min(1.0, max(0.54, uAspect / 1.08));
  vec2 q = screen - vec2(0.035 + uPointer.x * 0.025, 0.02 - uPointer.y * 0.018);

  float reveal = smoothstep(0.015, 0.235, p);
  float split = smoothstep(0.23, 0.49, p);
  float approach = smoothstep(0.48, 0.72, p);
  float title = smoothstep(0.515, 0.665, p);
  float titleFade = smoothstep(0.73, 0.845, p);
  float credits = smoothstep(0.73, 0.92, p);
  float exit = smoothstep(0.945, 1.0, p);

  float breath = 0.5 + 0.5 * sin(t * 0.55);
  vec2 atmospherePoint = q * 0.88 + vec2(uPointer.x * 0.08, uPointer.y * -0.05);

  float cloud = fbm(atmospherePoint * 1.45 + vec2(t * 0.008, -t * 0.004));
  float cloudLight = smoothstep(0.42, 0.78, cloud);

  vec3 color = vec3(0.0015, 0.0035, 0.010);
  color += vec3(0.004, 0.010, 0.025) * exp(-dot(q - vec2(0.18, 0.05), q - vec2(0.18, 0.05)) * 0.36);
  color += vec3(0.008, 0.018, 0.034) * cloudLight * (0.35 + 0.15 * breath);

  float edgeFade = smoothstep(1.55, 0.42, length(screen * vec2(0.62, 0.95)));
  color *= mix(0.28, 1.0, edgeFade);

  vec2 A = vec2(0.06, -0.69) * vec2(responsive, 1.0);
  vec2 B = vec2(-0.62, 0.46) * vec2(responsive, 1.0);
  vec2 C = vec2(0.72, 0.46) * vec2(responsive, 1.0);

  A += vec2(approach * 0.025, approach * 0.01);
  B += vec2(approach * 0.025, approach * 0.01);
  C += vec2(approach * 0.025, approach * 0.01);

  float inside = triangleInside(q, A, B, C);
  float triEdgeDistance = triangleDistance(q, A, B, C);

  float glassEdge = 1.0 - smoothstep(0.0, 0.035, triEdgeDistance);
  float innerEdge = 1.0 - smoothstep(0.0, 0.10, triEdgeDistance);

  float internalNoise = fbm(q * 4.1 + vec2(t * 0.022, -t * 0.015));
  float glassBody = inside * (0.022 + 0.034 * internalNoise) * (0.45 + reveal * 0.8);

  float sweepPosition = -0.7 + split * 1.55 + sin(t * 0.35) * 0.05;
  float sweepDistance = abs((q.x + q.y * 0.42) - sweepPosition);
  float glassSweep = exp(-(sweepDistance * sweepDistance) / 0.0028) * inside;
  glassSweep *= (0.10 + 0.26 * reveal);

  color += vec3(0.09, 0.19, 0.24) * glassBody;
  color += vec3(0.45, 0.84, 1.00) * glassEdge * (0.08 + 0.17 * reveal);
  color += vec3(0.55, 0.86, 1.00) * glassSweep;

  float inputReach = smoothstep(0.06, 0.33, p);
  float inputTail = smoothstep(0.12, 0.27, p);
  vec2 beamStart = vec2(-1.35, 0.035);
  vec2 beamEnd = vec2(-0.08 + inputTail * 0.22, 0.035);
  float inputBeam = segmentGlow(q, beamStart, mix(beamStart, beamEnd, inputReach), 0.0065);
  inputBeam *= (1.0 - smoothstep(0.42, 0.58, p) * 0.94);
  color += vec3(0.86, 0.97, 1.00) * inputBeam * 0.55;

  float impact = exp(-dot(q - vec2(-0.04, 0.035), q - vec2(-0.04, 0.035)) * 90.0);
  impact *= smoothstep(0.12, 0.36, p) * (1.0 - smoothstep(0.42, 0.66, p) * 0.55);
  color += vec3(0.42, 0.78, 1.00) * impact * 0.28;

  for (int i = 0; i < 5; i++) {
    float index = float(i) - 2.0;
    float startY = 0.04 + index * 0.022;
    float endY = 0.23 + index * 0.095;
    float xEnd = 1.55 + abs(index) * 0.18;

    float localX = q.x;
    float curve = (localX - 0.28) * (localX - 0.28) * 0.018 * index;
    float rayY = startY + (endY - startY) * smoothstep(0.12, xEnd, localX) + curve;

    float ray = exp(-pow((q.y - rayY) / 0.0075, 2.0));
    float extent = smoothstep(0.20, 0.34, q.x) * (1.0 - smoothstep(xEnd - 0.08, xEnd, q.x));
    float temporal = smoothstep(0.22 + abs(index) * 0.014, 0.49 + abs(index) * 0.014, p);
    float rayFade = (1.0 - smoothstep(0.56, 0.84, p));
    vec3 rayColor = spectralColor(i);

    color += rayColor * ray * extent * temporal * rayFade * (0.28 + 0.08 * reveal);
  }

  float causticX = q.x - 0.58;
  float caustic = exp(-dot(vec2(causticX, q.y - 0.16), vec2(causticX, q.y - 0.16)) * 10.5);
  caustic *= split * (1.0 - titleFade * 0.7);
  caustic *= 0.35 + 0.15 * sin(t * 1.1 + q.y * 8.0);
  color += vec3(0.28, 0.45, 0.86) * caustic * 0.20;

  float halo = exp(-length(q) * 3.4) * (0.22 + 0.24 * approach);
  halo *= 0.45 + 0.55 * split;
  color += vec3(0.06, 0.22, 0.38) * halo;

  float shimmer = exp(-pow((q.y + q.x * 0.20 - 0.38 - 0.09 * sin(t * 0.22)) / 0.025, 2.0));
  shimmer *= inside * (0.04 + 0.10 * approach);
  color += vec3(0.70, 0.90, 1.00) * shimmer;

  float grain = hash21(vUv * vec2(1920.0, 1080.0) + floor(t * 7.0));
  color += (grain - 0.5) * 0.0085;

  float titleBloom = exp(-length(q) * 4.6) * title * (1.0 - titleFade * 0.8);
  color += vec3(0.05, 0.18, 0.28) * titleBloom;

  float exitFlash = exp(-length(q) * 5.0) * smoothstep(0.95, 0.985, p);
  exitFlash *= 2.4;
  color += vec3(0.82, 0.95, 1.0) * exitFlash;

  color *= 1.0 - exit * 0.14;
  color = pow(max(color, 0.0), vec3(0.92));

  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
\`;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
};

export class PrismOpeningFilm {
  private readonly canvas: HTMLCanvasElement;
  private readonly reducedMotion: boolean;
  private readonly duration: number;

  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 30);
  private readonly pointer = new THREE.Vector2();
  private readonly targetPointer = new THREE.Vector2();

  private renderer: THREE.WebGLRenderer | null = null;
  private shader: THREE.ShaderMaterial | null = null;
  private prismGroup: THREE.Group | null = null;
  private prism: THREE.Mesh | null = null;
  private prismEdges: THREE.LineSegments | null = null;
  private keyLight: THREE.PointLight | null = null;
  private rimLight: THREE.PointLight | null = null;
  private quad: THREE.Mesh | null = null;
  private environment: THREE.Texture | null = null;

  private raf = 0;
  private startAt = 0;
  private lastAt = 0;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, reducedMotion: boolean, duration: number) {
    this.canvas = canvas;
    this.reducedMotion = reducedMotion;
    this.duration = Math.max(9000, duration);
    this.setup();
  }

  get progress() {
    return this.startAt
      ? clamp01((performance.now() - this.startAt) / this.duration)
      : 0;
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
      const renderable = object as THREE.Mesh & {
        geometry?: THREE.BufferGeometry;
        material?: THREE.Material | THREE.Material[];
      };

      renderable.geometry?.dispose();

      if (Array.isArray(renderable.material)) {
        renderable.material.forEach((material) => material.dispose());
      } else {
        renderable.material?.dispose();
      }
    });

    this.renderer?.dispose();
    this.renderer = null;

    this.environment?.dispose();
    this.environment = null;
    this.scene.environment = null;
  }

  private setup() {
    this.camera.position.z = 6.4;

    const backgroundGeometry = new THREE.PlaneGeometry(2, 2);
    this.shader = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uAspect: { value: 1 },
        uPointer: { value: new THREE.Vector2() },
        uReducedMotion: { value: this.reducedMotion ? 1 : 0 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });

    this.quad = new THREE.Mesh(backgroundGeometry, this.shader);
    this.quad.position.z = -3;
    this.scene.add(this.quad);

    this.prismGroup = new THREE.Group();
    this.prismGroup.position.set(0.02, 0.01, 0.08);

    const geometry = new THREE.CylinderGeometry(0.92, 0.92, 0.22, 3, 1, false);
    geometry.rotateY(Math.PI / 6);

    const material = new THREE.MeshPhysicalMaterial({
      color: "#dff8ff",
      transmission: 0.96,
      thickness: 1.45,
      roughness: 0.075,
      metalness: 0,
      ior: 1.52,
      transmission: 0.96,
      transparent: false,
      opacity: 1,
      dispersion: 0.06,
      clearcoat: 0.92,
      clearcoatRoughness: 0.07,
      envMapIntensity: 1.05,
      attenuationColor: new THREE.Color("#4fb8ee"),
      attenuationDistance: 3.6,
      depthWrite: false,
    });

    this.prism = new THREE.Mesh(geometry, material);
    this.prismGroup.add(this.prism);

    this.prismEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 1),
      new THREE.LineBasicMaterial({
        color: "#dff9ff",
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
      }),
    );
    this.prismGroup.add(this.prismEdges);

    this.keyLight = new THREE.PointLight("#93e9ff", 0, 6, 2);
    this.keyLight.position.set(-2.0, 1.0, 2.2);

    this.rimLight = new THREE.PointLight("#6c8dff", 0, 7, 2);
    this.rimLight.position.set(2.4, -1.2, 1.6);

    this.scene.add(this.prismGroup, this.keyLight, this.rimLight);

    this.environment = this.buildEnvironment();
    this.scene.environment = this.environment;

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: false,
        antialias: false,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false,
        depth: true,
        stencil: false,
      });

      this.renderer.setClearColor(0x000000, 1);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 0.96;
      this.renderer.transmissionResolutionScale = 0.72;

      this.resize();
    } catch {
      this.renderer = null;
    }

    window.addEventListener("resize", this.resize, { passive: true });
    window.addEventListener("pointermove", this.onPointer, { passive: true });
    document.addEventListener("visibilitychange", this.onVisibility);

    this.resize();
  }

  private buildEnvironment() {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;

    const context = canvas.getContext("2d");
    if (!context) {
      return new THREE.Texture();
    }

    const base = context.createLinearGradient(0, 0, 0, canvas.height);
    base.addColorStop(0, "#030914");
    base.addColorStop(0.48, "#061626");
    base.addColorStop(1, "#01030a");
    context.fillStyle = base;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const glows = [
      { x: 88, y: 72, radius: 155, color: "rgba(92, 218, 255, 0.26)" },
      { x: 398, y: 96, radius: 190, color: "rgba(100, 119, 255, 0.20)" },
      { x: 260, y: 218, radius: 150, color: "rgba(41, 104, 174, 0.18)" },
    ];

    for (const glow of glows) {
      const gradient = context.createRadialGradient(
        glow.x,
        glow.y,
        0,
        glow.x,
        glow.y,
        glow.radius,
      );
      gradient.addColorStop(0, glow.color);
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  private readonly onPointer = (event: PointerEvent) => {
    this.targetPointer.x = clamp01(event.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
    this.targetPointer.y = -(clamp01(event.clientY / Math.max(1, window.innerHeight)) * 2 - 1);
  };

  private readonly onVisibility = () => {
    this.lastAt = performance.now();
  };

  private readonly resize = () => {
    if (!this.renderer) return;

    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const aspect = width / height;

    this.camera.left = -aspect;
    this.camera.right = aspect;
    this.camera.top = 1;
    this.camera.bottom = -1;
    this.camera.updateProjectionMatrix();

    const cap = width < 760 ? 1.2 : 1.5;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    this.renderer.setSize(width, height, false);

    if (this.shader) {
      this.shader.uniforms.uAspect.value = aspect;
    }

    if (this.quad) {
      this.quad.scale.set(aspect, 1, 1);
    }

    if (this.prismGroup) {
      const responsive = Math.min(1, Math.max(0.62, aspect / 1.08));
      this.prismGroup.scale.set(0.82 * responsive, 0.82, 0.82);
    }
  };

  private readonly tick = (now: number) => {
    if (this.disposed) return;

    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastAt) / 1000));
    this.lastAt = now;

    const progress = this.progress;
    this.update(progress, dt);

    if (this.renderer) {
      try {
        this.renderer.render(this.scene, this.camera);
      } catch {
        this.renderer = null;
      }
    }

    if (progress < 1 && !this.disposed) {
      this.raf = requestAnimationFrame(this.tick);
    } else {
      this.raf = 0;
    }
  };

  private update(progress: number, dt: number) {
    if (this.shader) {
      this.shader.uniforms.uTime.value += dt;
      this.shader.uniforms.uProgress.value = progress;
      this.shader.uniforms.uPointer.value.lerp(
        this.targetPointer,
        this.reducedMotion ? 0.22 : 0.055,
      );
    }

    this.pointer.lerp(this.targetPointer, this.reducedMotion ? 0.22 : 0.055);

    const reveal = smooth((progress - 0.02) / 0.20);
    const split = smooth((progress - 0.22) / 0.26);
    const approach = smooth((progress - 0.48) / 0.24);
    const title = smooth((progress - 0.52) / 0.14);
    const exit = smooth((progress - 0.94) / 0.06);

    if (this.prismGroup) {
      this.prismGroup.position.x = 0.02 + this.pointer.x * 0.055;
      this.prismGroup.position.y = 0.01 + this.pointer.y * 0.028 - approach * 0.025;
      this.prismGroup.position.z = 0.04 + approach * 0.08;

      const scale = 0.78 + reveal * 0.22 + approach * 0.26;
      this.prismGroup.scale.multiplyScalar(1);
      const responsive = Math.min(1, Math.max(0.62, this.currentAspect / 1.08));
      this.prismGroup.scale.set(scale * 0.82 * responsive, scale * 0.82, scale * 0.82);

      this.prismGroup.rotation.x = 0.08 + this.pointer.y * -0.08 + split * 0.07;
      this.prismGroup.rotation.y = 0.34 + this.pointer.x * 0.12 + split * 0.32 + approach * 0.24;
      this.prismGroup.rotation.z = -0.11 + split * 0.06;
    }

    if (this.prism) {
      const material = this.prism.material as THREE.MeshPhysicalMaterial;
      material.transmission = 0.90 + reveal * 0.10;
      material.dispersion = 0.01 + split * 0.08;
      material.envMapIntensity = 0.65 + split * 0.42;
    }

    if (this.prismEdges) {
      const material = this.prismEdges.material as THREE.LineBasicMaterial;
      material.opacity = 0.04 + reveal * 0.34 + split * 0.12;
    }

    if (this.keyLight) {
      this.keyLight.intensity =
        reveal * 45 +
        split * 22 +
        title * 8 +
        (Math.sin(progress * PI_SAFE * 7.0) * 2.0 + 2.0);
    }

    if (this.rimLight) {
      this.rimLight.intensity = split * 24 + approach * 20 + exit * 8;
    }

    if (this.shader) {
      this.shader.uniforms.uProgress.value = progress;
    }
  }

  private get currentAspect() {
    return Math.max(0.5, window.innerWidth / Math.max(1, window.innerHeight));
  }
}

const PI_SAFE = Math.PI;
