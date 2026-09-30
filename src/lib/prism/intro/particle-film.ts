import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { TOTAL } from "./config";

const TAU = Math.PI * 2;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (v: number) => v * v * (3 - 2 * v);
const smoother = (v: number) => v * v * v * (v * (v * 6 - 15) + 10);

function make4DVertices(size = 1.7) {
  const vertices: THREE.Vector4[] = [];
  for (let i = 0; i < 16; i++) {
    vertices.push(new THREE.Vector4(
      (i & 1) ? size : -size,
      (i & 2) ? size : -size,
      (i & 4) ? size : -size,
      (i & 8) ? size : -size,
    ));
  }
  return vertices;
}

function make4DEdges(vertices: THREE.Vector4[]) {
  const edges: Array<[number, number]> = [];
  for (let i = 0; i < vertices.length; i++) {
    for (let bit = 0; bit < 4; bit++) {
      const j = i ^ (1 << bit);
      if (i < j) edges.push([i, j]);
    }
  }
  return edges;
}

function project4D(v: THREE.Vector4, time: number) {
  const a = time * 0.42;
  const b = time * 0.31;
  const ca = Math.cos(a), sa = Math.sin(a);
  const cb = Math.cos(b), sb = Math.sin(b);

  let x = v.x * ca - v.w * sa;
  let w = v.x * sa + v.w * ca;
  let y = v.y * cb - v.z * sb;
  let z = v.y * sb + v.z * cb;
  const perspective4 = 3.9 / Math.max(0.35, 4.8 - w);
  x *= perspective4;
  y *= perspective4;
  z *= perspective4;
  return new THREE.Vector3(x, y, z);
}

export class PrismParticleFilm {
  private readonly canvas: HTMLCanvasElement;
  private readonly reducedMotion: boolean;
  private readonly duration: number;

  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
  private renderer: THREE.WebGLRenderer | null = null;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;

  private particles: THREE.Points | null = null;
  private particleMaterial: THREE.PointsMaterial | null = null;
  private field: THREE.LineSegments | null = null;
  private fieldMaterial: THREE.LineBasicMaterial | null = null;
  private tesseract: THREE.LineSegments | null = null;
  private tesseractMaterial: THREE.LineBasicMaterial | null = null;
  private prism: THREE.Mesh | null = null;
  private prismEdges: THREE.LineSegments | null = null;
  private molecule: THREE.Group | null = null;
  private spectralRays: THREE.Line[] = [];
  private rings: THREE.LineLoop[] = [];
  private core: THREE.Mesh | null = null;

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
    this.duration = Math.max(12000, duration || TOTAL * 1000);
    this.setup();
  }

  get progress() {
    return this.startAt ? clamp((performance.now() - this.startAt) / (this.duration * 1000)) : 0;
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
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("pointermove", this.onPointer);
    this.scene.traverse((object) => {
      const item = object as THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
      item.geometry?.dispose();
      if (Array.isArray(item.material)) item.material.forEach((m) => m.dispose());
      else item.material?.dispose();
    });
    this.composer?.dispose();
    this.renderer?.dispose();
  }

  private setup() {
    this.scene.background = new THREE.Color("#01050c");
    this.camera.position.set(0, 0.2, 15);

    const ambient = new THREE.HemisphereLight("#dff9ff", "#020711", 1.1);
    const key = new THREE.PointLight("#8deaff", 38, 42, 2);
    key.position.set(-5, 4, 7);
    const rim = new THREE.PointLight("#777cff", 30, 36, 2);
    rim.position.set(5, -2, 2);
    this.scene.add(ambient, key, rim);

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        powerPreference: "high-performance",
        alpha: false,
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.25 : 1.8));
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.12;

      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.15, 0.55, 0.7);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    } catch {
      this.renderer = null;
    }

    this.buildParticleField();
    this.buildForceField();
    this.buildMolecule();
    this.buildPrism();
    this.build4D();
    this.buildRings();
    this.buildRays();
    this.buildCore();

    window.addEventListener("resize", this.resize, { passive: true });
    window.addEventListener("pointermove", this.onPointer, { passive: true });
    this.resize();
  }

  private buildParticleField() {
    const count = this.reducedMotion ? 1800 : window.innerWidth < 760 ? 3800 : 7000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    let state = 0x9e3779b9;
    const random = () => {
      state = Math.imul(state ^ (state >>> 16), 2246822507);
      state = Math.imul(state ^ (state >>> 13), 3266489909);
      return ((state ^ (state >>> 16)) >>> 0) / 4294967296;
    };

    for (let i = 0; i < count; i++) {
      const r = 2.2 + Math.pow(random(), 0.35) * 7.5;
      const theta = random() * TAU;
      const phi = Math.acos(random() * 2 - 1);
      const swirl = Math.sin(phi * 4 + r * 0.65) * 0.32;
      const p = i * 3;
      positions[p] = Math.sin(phi) * Math.cos(theta) * r + swirl;
      positions[p + 1] = Math.cos(phi) * r;
      positions[p + 2] = Math.sin(phi) * Math.sin(theta) * r;
      const hue = 0.52 + random() * 0.18;
      const c = new THREE.Color().setHSL(hue, 0.78, 0.62 + random() * 0.22);
      colors[p] = c.r;
      colors[p + 1] = c.g;
      colors[p + 2] = c.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: this.reducedMotion ? 0.018 : 0.025,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.particles = new THREE.Points(geometry, material);
    this.particleMaterial = material;
    this.scene.add(this.particles);
  }

  private buildForceField() {
    const segments = this.reducedMotion ? 260 : 520;
    const positions = new Float32Array(segments * 6);
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * TAU;
      const radius = 2.8 + (i % 13) * 0.22;
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      const p = i * 6;
      positions[p] = x;
      positions[p + 1] = Math.sin(a * 3) * 0.6;
      positions[p + 2] = z;
      positions[p + 3] = x * 0.86 - Math.sin(a) * 0.42;
      positions[p + 4] = positions[p + 1] + Math.cos(a * 2) * 0.2;
      positions[p + 5] = z * 0.86 + Math.cos(a) * 0.42;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: "#5bdcff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending });
    this.field = new THREE.LineSegments(geometry, material);
    this.fieldMaterial = material;
    this.scene.add(this.field);
  }

  private buildMolecule() {
    const group = new THREE.Group();
    const atoms = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1.05, 0.25, 0.15),
      new THREE.Vector3(-1.0, 0.32, -0.1),
      new THREE.Vector3(0.2, 0.9, 0.45),
      new THREE.Vector3(0.15, -0.85, -0.35),
    ];
    const atomColors = ["#dffcff", "#66dfff", "#88aaff", "#e4a7ff", "#7fffe0"];
    atoms.forEach((position, index) => {
      const atom = new THREE.Mesh(
        new THREE.SphereGeometry(index === 0 ? 0.38 : 0.23, 24, 24),
        new THREE.MeshStandardMaterial({ color: atomColors[index], emissive: atomColors[index], emissiveIntensity: 1.2, roughness: 0.18, metalness: 0.2 }),
      );
      atom.position.copy(position);
      group.add(atom);
    });
    for (let i = 1; i < atoms.length; i++) {
      const a = atoms[0];
      const b = atoms[i];
      const delta = b.clone().sub(a);
      const length = delta.length();
      const bond = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, length, 10),
        new THREE.MeshBasicMaterial({ color: "#9beeff", transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending }),
      );
      bond.position.copy(a).add(b).multiplyScalar(0.5);
      bond.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
      group.add(bond);
    }
    group.scale.setScalar(1.1);
    group.visible = false;
    this.molecule = group;
    this.scene.add(group);
  }

  private buildPrism() {
    const geometry = new THREE.CylinderGeometry(1.55, 1.55, 3.2, 3, 1, false);
    geometry.rotateZ(Math.PI / 2);
    const material = new THREE.MeshPhysicalMaterial({
      color: "#bfeeff",
      transparent: true,
      opacity: 0.16,
      transmission: 0.82,
      roughness: 0.08,
      metalness: 0.05,
      thickness: 0.6,
      ior: 1.46,
      side: THREE.DoubleSide,
      emissive: "#205d88",
      emissiveIntensity: 0.45,
    });
    this.prism = new THREE.Mesh(geometry, material);
    this.prism.rotation.y = Math.PI / 2;
    this.prism.scale.set(1, 1.2, 1);
    this.prism.visible = false;
    this.scene.add(this.prism);

    const edge = new THREE.EdgesGeometry(geometry);
    const edgeMaterial = new THREE.LineBasicMaterial({ color: "#dffcff", transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
    this.prismEdges = new THREE.LineSegments(edge, edgeMaterial);
    this.prismEdges.rotation.copy(this.prism.rotation);
    this.prismEdges.scale.copy(this.prism.scale);
    this.prismEdges.visible = false;
    this.scene.add(this.prismEdges);
  }

  private build4D() {
    const vertices = make4DVertices();
    const edges = make4DEdges(vertices);
    const positions = new Float32Array(edges.length * 6);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: "#b2eaff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending });
    this.tesseract = new THREE.LineSegments(geometry, material);
    this.tesseractMaterial = material;
    this.tesseract.userData.vertices = vertices;
    this.tesseract.userData.edges = edges;
    this.scene.add(this.tesseract);
  }

  private buildRings() {
    for (let i = 0; i < 4; i++) {
      const points: THREE.Vector3[] = [];
      const radius = 2.2 + i * 0.55;
      for (let j = 0; j < 128; j++) {
        const a = (j / 128) * TAU;
        points.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius * 0.35, 0));
      }
      const ring = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: i % 2 ? "#8c9fff" : "#6ce9ff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending }),
      );
      this.rings.push(ring);
      this.scene.add(ring);
    }
  }

  private buildRays() {
    for (let i = 0; i < 7; i++) {
      const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-8, (i - 3) * 0.16, 0), new THREE.Vector3(0, (i - 3) * 0.06, 0), new THREE.Vector3(8, (i - 3) * 0.48, 0)]);
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: new THREE.Color().setHSL(0.52 + i * 0.035, 0.8, 0.68), transparent: true, opacity: 0, blending: THREE.AdditiveBlending }));
      this.spectralRays.push(line);
      this.scene.add(line);
    }
  }

  private buildCore() {
    const material = new THREE.MeshBasicMaterial({ color: "#effdff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending });
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 2), material);
    this.scene.add(this.core);
  }

  private readonly onPointer = (event: PointerEvent) => {
    this.targetPointer.x = event.clientX / Math.max(1, window.innerWidth) - 0.5;
    this.targetPointer.y = -(event.clientY / Math.max(1, window.innerHeight) - 0.5);
  };

  private readonly resize = () => {
    if (!this.renderer) return;
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.composer?.setSize(width, height);
  };

  private readonly tick = (now: number) => {
    if (this.disposed) return;
    const delta = Math.min(0.05, Math.max(0, (now - this.lastAt) / 1000));
    this.lastAt = now;
    this.elapsed += delta;
    this.pointer.lerp(this.targetPointer, 1 - Math.exp(-delta * 7));
    this.updateScene(this.elapsed);
    if (this.renderer && this.composer) this.composer.render();
    else if (this.renderer) this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.tick);
  };

  private updateScene(t: number) {
    const end = this.duration / 1000;
    const p = clamp(t / end);
    const science = clamp(t / 11);
    const moleculeIn = smooth(clamp((t - 4.5) / 2.0));
    const fourDIn = smooth(clamp((t - 7.4) / 2.0));
    const prismIn = smooth(clamp((t - 10.5) / 2.0));
    const prismOut = 1 - smooth(clamp((t - 15.2) / 2.0));
    const finale = smooth(clamp((t - 19) / 3.0));

    const orbit = t * 0.18;
    this.camera.position.set(
      Math.sin(orbit * 0.42) * (12 - science * 5) + this.pointer.x * 1.0,
      0.5 + Math.sin(t * 0.22) * 0.35 + this.pointer.y * 0.7,
      Math.cos(orbit * 0.42) * (12 - science * 5),
    );
    this.camera.lookAt(this.pointer.x * 0.4, this.pointer.y * 0.25, 0);
    this.camera.fov = 44 - science * 9 - finale * 6;
    this.camera.updateProjectionMatrix();

    if (this.particles && this.particleMaterial) {
      this.particles.rotation.y = t * 0.055;
      this.particles.rotation.x = Math.sin(t * 0.13) * 0.07;
      this.particles.position.x = this.pointer.x * 0.35;
      this.particles.position.y = this.pointer.y * 0.25;
      this.particleMaterial.opacity = 0.08 + science * 0.5 - finale * 0.45;
      this.particleMaterial.size = 0.018 + fourDIn * 0.018;
    }

    if (this.field && this.fieldMaterial) {
      this.field.rotation.y = -t * 0.12;
      this.field.rotation.x = Math.sin(t * 0.3) * 0.18;
      this.fieldMaterial.opacity = smooth(clamp((t - 1.0) / 2.0)) * (1 - finale * 0.8) * 0.42;
    }

    if (this.molecule) {
      this.molecule.visible = moleculeIn > 0.01 && t < 8.1;
      this.molecule.scale.setScalar(0.3 + moleculeIn * 1.05);
      this.molecule.rotation.y = t * 0.7;
      this.molecule.rotation.x = Math.sin(t * 0.5) * 0.25;
      this.molecule.position.z = -0.6;
    }

    if (this.tesseract && this.tesseractMaterial) {
      this.tesseract.visible = fourDIn > 0.01 && t < 12.8;
      const vertices = this.tesseract.userData.vertices as THREE.Vector4[];
      const edges = this.tesseract.userData.edges as Array<[number, number]>;
      const array = (this.tesseract.geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
      for (let i = 0; i < edges.length; i++) {
        const a = project4D(vertices[edges[i][0]], t);
        const b = project4D(vertices[edges[i][1]], t);
        const p = i * 6;
        array[p] = a.x; array[p + 1] = a.y; array[p + 2] = a.z;
        array[p + 3] = b.x; array[p + 4] = b.y; array[p + 5] = b.z;
      }
      (this.tesseract.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      this.tesseract.scale.setScalar(0.65 + fourDIn * 0.75);
      this.tesseract.rotation.y = t * 0.15;
      this.tesseractMaterial.opacity = fourDIn * (1 - prismIn * 0.85) * 0.75;
    }

    if (this.prism && this.prismEdges) {
      const visible = prismIn * prismOut;
      this.prism.visible = visible > 0.01;
      this.prismEdges.visible = this.prism.visible;
      this.prism.scale.setScalar(0.4 + visible * 0.9);
      this.prism.rotation.x = t * 0.25;
      this.prism.rotation.y = t * 0.4;
      this.prism.position.z = -0.3;
      this.prismEdges.rotation.copy(this.prism.rotation);
      this.prismEdges.position.copy(this.prism.position);
      this.prismEdges.scale.copy(this.prism.scale);
      (this.prism.material as THREE.MeshPhysicalMaterial).opacity = 0.05 + visible * 0.25;
      (this.prismEdges.material as THREE.LineBasicMaterial).opacity = visible * 0.95;
    }

    this.rings.forEach((ring, index) => {
      const m = ring.material as THREE.LineBasicMaterial;
      const phase = t - index * 0.17;
      ring.rotation.z = phase * (index % 2 ? -0.12 : 0.16);
      ring.rotation.x = Math.sin(phase * 0.3) * 0.15;
      m.opacity = prismIn * prismOut * (0.1 + index * 0.035);
    });

    this.spectralRays.forEach((ray, index) => {
      const m = ray.material as THREE.LineBasicMaterial;
      const x = Math.sin(t * 0.7 + index) * 0.2;
      ray.position.x = x;
      ray.position.y = Math.sin(t * 0.35 + index * 0.4) * 0.12;
      m.opacity = prismIn * prismOut * (0.035 + index * 0.009);
    });

    if (this.core) {
      const m = this.core.material as THREE.MeshBasicMaterial;
      m.opacity = (smooth(clamp((t - 1.5) / 2)) * (1 - finale)) + finale * 0.95;
      this.core.scale.setScalar(0.8 + Math.sin(t * 3.0) * 0.15 + finale * 2.2);
      this.core.rotation.x = t * 0.7;
      this.core.rotation.y = t * 0.9;
    }

    if (this.bloom) {
      this.bloom.strength = 0.8 + Math.sin(t * 0.8) * 0.12 + finale * 1.4;
      this.bloom.radius = 0.5 + finale * 0.25;
    }

    if (t > 12.8 && t < 15.5 && this.prism) {
      const beam = smooth(clamp((t - 12.8) / 0.7));
      this.prism.rotation.y += beam * 0.02;
    }

    void p;
  }
}
