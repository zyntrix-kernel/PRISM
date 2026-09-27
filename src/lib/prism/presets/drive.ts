// DRIVE preset: premium neon arcade racer — Synthwave × F-Zero × Apple polish.
//
// Two driving modes:
// - MANUAL: screen-relative steering (pointer right = nose goes right on
//   screen), pinch-hold = gas, release = coast, Space = brake. A pinch
//   rising-edge (actionPressed) fires a 2-second BOOST (1.5× speed).
// - EASY (point-and-go): point at the ground, pinch once to drop a pin,
//   pinch again to send the car (pure-pursuit autopilot), pinch once more
//   to cancel. A ghost marker previews where the pin will land.
//
// Physics convention (single, unit-tested): forward = (sin h, 0, cos h),
// heading increases screen-clockwise from above, steer > 0 = screen right.
// Reverse automatically counter-steers, like a real car.

import * as THREE from 'three';
import { disposeGroup, type BuilderCtx, type DriveFrameInput, type WorldAPI } from './types';
import { ParticlePool } from './particles';
import { makeLabel } from './labels';

// ── Track shape (ellipse) ────────────────────────────────────────────────
const TRACK_A = 9;
const TRACK_B = 6;
const ARENA_RADIUS = 16;

// ── Physics ─────────────────────────────────────────────────────────────
const ACCEL = 9;
const BRAKE_DECEL = 18;
const DRAG = 0.9;
const ROLLING = 1.2;
const VMAX = 14;
const VMIN = -4;
const STEER_RATE = 0.16;

// ── Boost: 1.5× speed for 2s, 4s cooldown ────────────────────────────────
const BOOST_MULT = 1.5;
const BOOST_DURATION = 2.0;
const BOOST_COOLDOWN = 4.0;

// ── Synthwave palette ───────────────────────────────────────────────────
const COL_CYAN = 0x00f0ff;
const COL_MAGENTA = 0xff2fd6;
const COL_AMBER = 0xffb347;
const COL_BODY = 0xff4d2e;
const COL_TAIL = 0xff2233;
const COL_HEADLIGHT = 0xfff6d8;
const COL_GLASS = 0x0a1424;
const COL_RUBBER = 0x14161c;
const COL_RIM = 0xb8c4d4;

export interface CarState {
  x: number;
  z: number;
  heading: number;
  speed: number;
}

export interface DriveControl {
  /** -1 (screen left) .. +1 (screen right). */
  steer: number;
  /** Gas pedal 0..1 (analog for hands, binary for mouse/keys). */
  throttle: number;
  brake: boolean;
}

export function wrapPi(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** One arcade-physics step (mutates state). Pure math: fully unit-tested. */
export function stepCar(s: CarState, input: DriveControl, dt: number, maxSpeed = VMAX): void {
  if (input.brake) {
    const stop = Math.sign(s.speed) * BRAKE_DECEL * dt;
    s.speed = Math.abs(stop) > Math.abs(s.speed) ? 0 : s.speed - stop;
  } else {
    const thr = THREE.MathUtils.clamp(input.throttle, 0, 1);
    if (thr > 0) s.speed += thr * ACCEL * dt;
  }
  // Drag + rolling resistance always apply.
  s.speed -= s.speed * DRAG * dt;
  const roll = Math.sign(s.speed) * ROLLING * dt;
  s.speed = Math.abs(roll) > Math.abs(s.speed) ? 0 : s.speed - roll;
  s.speed = THREE.MathUtils.clamp(s.speed, VMIN, maxSpeed);
  // Screen-relative steering (invert in reverse, like a real car).
  s.heading += input.steer * s.speed * STEER_RATE * dt;
  s.x += Math.sin(s.heading) * s.speed * dt;
  s.z += Math.cos(s.heading) * s.speed * dt;
}

/** Elliptical track angle of a ground point (for lap counting). */
export function trackAngle(x: number, z: number): number {
  return Math.atan2(z / TRACK_B, x / TRACK_A);
}

/** Lap counter: counts forward wraps past the start line (phi = 0). */
export class LapTracker {
  laps = 0;
  lastLapTime = 0;
  lapStart = 0;
  private unwrapped = 0;
  private base = 0;
  private prevPhi = 0;
  private traveled = 0;
  private initialized = false;

  reset(now: number): void {
    this.laps = 0;
    this.lastLapTime = 0;
    this.lapStart = now;
    this.traveled = 0;
    this.initialized = false;
  }

  update(x: number, z: number, now: number): void {
    const phi = trackAngle(x, z);
    if (!this.initialized) {
      this.prevPhi = phi;
      this.base = phi;
      this.unwrapped = phi;
      this.initialized = true;
      return;
    }
    const d = wrapPi(phi - this.prevPhi);
    this.prevPhi = phi;
    this.unwrapped += d;
    this.traveled += Math.abs(d);
    const crossed = Math.floor((this.unwrapped - this.base) / (Math.PI * 2) + 1e-9);
    // The travel guard stops start-line straddling from farming laps.
    if (crossed > this.laps && this.traveled > Math.PI * 1.5) {
      this.laps = crossed;
      this.lastLapTime = now - this.lapStart;
      this.lapStart = now;
      this.traveled = 0;
    }
  }

  currentLapTime(now: number): number {
    return now - this.lapStart;
  }
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

// ── Procedural textures ─────────────────────────────────────────────────

/** Procedural skyscraper facade: dark glass + emissive window grid. */
function makeWindowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#05060c';
  g.fillRect(0, 0, 128, 256);
  // Window grid; per-cell random brightness + color (cyan/magenta/amber).
  const cols = 8;
  const rows = 16;
  const cw = 128 / cols;
  const ch = 256 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (Math.random() < 0.35) continue; // dark windows
      const roll = Math.random();
      let col = '#fff6d8';
      if (roll < 0.33) col = '#00f0ff';
      else if (roll < 0.66) col = '#ff2fd6';
      else if (roll < 0.8) col = '#ffb347';
      g.fillStyle = col;
      const pad = 2;
      g.globalAlpha = 0.55 + Math.random() * 0.45;
      g.fillRect(c * cw + pad, r * ch + pad, cw - pad * 2, ch - pad * 2);
    }
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Radial speed-line streaks texture (for the boost overlay sprite). */
function makeSpeedStreakTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d')!;
  // Transparent center → white radial streaks at edges.
  g.clearRect(0, 0, 256, 256);
  const cx = 128;
  const cy = 128;
  g.lineCap = 'round';
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const r0 = 80 + Math.random() * 20;
    const r1 = 128;
    const alpha = 0.25 + Math.random() * 0.5;
    g.strokeStyle = `rgba(180, 220, 255, ${alpha.toFixed(2)})`;
    g.lineWidth = 1 + Math.random() * 2;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Aurora ribbon texture — soft horizontal neon band. */
function makeAuroraTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(0,240,255,0)');
  grad.addColorStop(0.4, 'rgba(0,240,255,0.55)');
  grad.addColorStop(0.6, 'rgba(255,47,214,0.55)');
  grad.addColorStop(1, 'rgba(255,47,214,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── Track sample helper ─────────────────────────────────────────────────
/** Sample a point on the ellipse at parametric t (0..2π), outward normal n. */
function ellipsePoint(a: number, b: number, t: number, out: THREE.Vector3): void {
  out.set(Math.cos(t) * a, 0, Math.sin(t) * b);
}

export function buildDrive(ctx: BuilderCtx): WorldAPI {
  const { world, glowTex, nebulaTex, quality } = ctx;
  const isHigh = quality === 'high' || quality === 'ultra';
  const isUltra = quality === 'ultra';
  const useHeavy = quality !== 'low'; // medium+ shows the premium visuals

  const grabbables: THREE.Object3D[] = [];
  const car: CarState = { x: TRACK_A, z: 0, heading: 0, speed: 0 };
  const laps = new LapTracker();
  let elapsed = 0;
  let easy = false;
  let selected: { x: number; z: number } | null = null;
  let driving = false;
  let input: DriveFrameInput = { steer: 0, throttle: 0, brake: false, actionPressed: false, ground: null };
  let lastSteer = 0;
  let brakingNow = false;

  // Boost state.
  let boostActive = false;
  let boostTimer = 0;
  let cooldownTimer = 0;
  let prevActionPressed = false;
  // boostCharge: 1 when ready, drains to 0 while boosting, refills while cooling.
  let boostCharge = 1;

  // Own-textures that disposeGroup won't reach (emissiveMap etc.) — disposed manually.
  const ownedTextures: THREE.Texture[] = [];

  // ══════════════════════════════════════════════════════════════════════
  //  GROUND: pulsing neon grid shader (synthwave infinite floor)
  // ══════════════════════════════════════════════════════════════════════
  const gridUniforms = {
    uTime: { value: 0 },
    uSpeed: { value: 0 }, // 0..1
    uBoost: { value: 0 }, // 0..1
    uColorA: { value: new THREE.Color(COL_CYAN) },
    uColorB: { value: new THREE.Color(COL_MAGENTA) },
  };
  const groundMat = new THREE.ShaderMaterial({
    uniforms: gridUniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vWorldPos;
      uniform float uTime;
      uniform float uSpeed;
      uniform float uBoost;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      void main() {
        // World-space grid lines.
        vec2 p = vWorldPos.xz;
        vec2 g = abs(fract(p * 0.5) - 0.5) / fwidth(p * 0.5);
        float line = 1.0 - min(min(g.x, g.y), 1.0);
        // Major lines (every 4 units) brighter.
        vec2 major = abs(fract(p * 0.125) - 0.5) / fwidth(p * 0.125);
        float majorLine = 1.0 - min(min(major.x, major.y), 1.0);
        // Distance fade (track sits inside ~16-unit radius).
        float r = length(p);
        float fade = smoothstep(28.0, 6.0, r);
        // Color: cyan at low speed, shifts to magenta at high speed + boost.
        vec3 col = mix(uColorA, uColorB, clamp(uSpeed * 0.6 + uBoost * 0.6, 0.0, 1.0));
        // Pulse outward wave.
        float wave = 0.5 + 0.5 * sin(r * 0.6 - uTime * 2.0);
        float intensity = line * 0.55 + majorLine * 0.7;
        intensity *= (0.7 + 0.3 * wave);
        // Boost: brighten globally.
        intensity += uBoost * 0.25 * fade;
        vec3 base = vec3(0.02, 0.03, 0.06);
        vec3 out_col = base + col * intensity * fade;
        gl_FragColor = vec4(out_col, 1.0);
      }
    `,
  });
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(32, 64),
    groundMat,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  world.add(ground);

  // ══════════════════════════════════════════════════════════════════════
  //  NEON TRACK EDGES (additive glowing strips)
  // ══════════════════════════════════════════════════════════════════════
  const railGeo = new THREE.BufferGeometry();
  const RAIL_SEG = 160;
  const railInnerA = TRACK_A - 0.9;
  const railInnerB = TRACK_B - 0.9;
  const railOuterA = TRACK_A + 0.9;
  const railOuterB = TRACK_B + 0.9;
  const innerPos: number[] = [];
  const outerPos: number[] = [];
  for (let i = 0; i <= RAIL_SEG; i++) {
    const t = (i / RAIL_SEG) * Math.PI * 2;
    innerPos.push(Math.cos(t) * railInnerA, 0.05, Math.sin(t) * railInnerB);
    outerPos.push(Math.cos(t) * railOuterA, 0.05, Math.sin(t) * railOuterB);
  }
  railGeo.setAttribute('position', new THREE.Float32BufferAttribute(innerPos, 3));
  const railInner = new THREE.Line(
    railGeo,
    new THREE.LineBasicMaterial({ color: COL_CYAN, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  world.add(railInner);
  const railGeo2 = new THREE.BufferGeometry();
  railGeo2.setAttribute('position', new THREE.Float32BufferAttribute(outerPos, 3));
  const railOuter = new THREE.Line(
    railGeo2,
    new THREE.LineBasicMaterial({ color: COL_MAGENTA, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  world.add(railOuter);

  // Roadway surface (dark, slightly reflective band between the rails).
  const roadShape = new THREE.Shape();
  const roadHole = new THREE.Path();
  for (let i = 0; i <= RAIL_SEG; i++) {
    const t = (i / RAIL_SEG) * Math.PI * 2;
    const x = Math.cos(t) * railOuterA;
    const z = Math.sin(t) * railOuterB;
    if (i === 0) roadShape.moveTo(x, z); else roadShape.lineTo(x, z);
  }
  for (let i = 0; i <= RAIL_SEG; i++) {
    const t = (i / RAIL_SEG) * Math.PI * 2;
    const x = Math.cos(t) * railInnerA;
    const z = Math.sin(t) * railInnerB;
    if (i === 0) roadHole.moveTo(x, z); else roadHole.lineTo(x, z);
  }
  roadShape.holes.push(roadHole);
  const road = new THREE.Mesh(
    new THREE.ShapeGeometry(roadShape),
    new THREE.MeshStandardMaterial({ color: 0x0a0d18, roughness: 0.35, metalness: 0.5, emissive: 0x101828, emissiveIntensity: 0.2 }),
  );
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.01;
  world.add(road);

  // ══════════════════════════════════════════════════════════════════════
  //  START LINE + GANTRY
  // ══════════════════════════════════════════════════════════════════════
  const startLine = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xf2f5ff, transparent: true, opacity: 0.85 }),
  );
  startLine.rotation.x = -Math.PI / 2;
  startLine.position.set(TRACK_A, 0.03, 0);
  world.add(startLine);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.5, metalness: 0.4, emissive: COL_CYAN, emissiveIntensity: 0.6 });
  for (const dz of [-1.4, 1.4]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.4, 12), postMat);
    post.position.set(TRACK_A, 1.2, dz);
    world.add(post);
  }
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.55, 3.1),
    new THREE.MeshStandardMaterial({ color: 0x101828, roughness: 0.4, metalness: 0.6, emissive: COL_MAGENTA, emissiveIntensity: 0.35 }),
  );
  banner.position.set(TRACK_A, 2.4, 0);
  world.add(banner);

  // ══════════════════════════════════════════════════════════════════════
  //  ROADSIDE: neon pylons + arches + floating rings + alternating lights
  // ══════════════════════════════════════════════════════════════════════
  const pylonGeo = new THREE.CylinderGeometry(0.05, 0.08, 1.6, 8);
  const trackLights: THREE.PointLight[] = [];

  // Arch + pylon count around the loop (gated by quality).
  const archCount = useHeavy ? (isUltra ? 8 : 6) : 4;
  const archStep = (Math.PI * 2) / archCount;
  for (let i = 0; i < archCount; i++) {
    const t = i * archStep;
    const cx = Math.cos(t) * (TRACK_A + 1.2);
    const cz = Math.sin(t) * (TRACK_B + 1.2);
    // Arch (torus standing up, oriented along track tangent).
    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.06, 8, 32, Math.PI),
      new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? COL_CYAN : COL_MAGENTA,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    arch.position.set(cx, 1.6, cz);
    // Orient the half-torus arc above the roadway, opening downward.
    arch.rotation.y = -t + Math.PI / 2;
    arch.rotation.z = 0;
    world.add(arch);
    // Pylon pair flanking the arch.
    for (const side of [-1, 1]) {
      const px = cx + Math.cos(t + Math.PI / 2) * side * 1.4;
      const pz = cz + Math.sin(t + Math.PI / 2) * side * 1.4;
      const pylon = new THREE.Mesh(pylonGeo, new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? COL_CYAN : COL_MAGENTA,
        transparent: true, opacity: 0.85,
      }));
      pylon.position.set(px, 0.8, pz);
      world.add(pylon);
    }
    // Track point light (alternating color) — only on high+ to limit cost.
    if (isHigh) {
      const tl = new THREE.PointLight(i % 2 === 0 ? COL_CYAN : COL_MAGENTA, 1.6, 6.5, 2);
      tl.position.set(cx, 1.8, cz);
      world.add(tl);
      trackLights.push(tl);
    }
  }

  // Floating neon rings to drive through — distributed inside the ellipse.
  const ringCount = useHeavy ? 6 : 3;
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < ringCount; i++) {
    const t = (i / ringCount) * Math.PI * 2 + 0.3;
    const rr = 0.6; // ring radius
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(rr, 0.045, 8, 28),
      new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? COL_CYAN : COL_AMBER,
        transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    const cx = Math.cos(t) * TRACK_A;
    const cz = Math.sin(t) * TRACK_B;
    ring.position.set(cx, 1.4, cz);
    ring.rotation.y = t + Math.PI / 2;
    world.add(ring);
    rings.push(ring);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  DISTANT CITY: skyscrapers with emissive window texture
  // ══════════════════════════════════════════════════════════════════════
  const buildingTex = makeWindowTexture();
  ownedTextures.push(buildingTex);
  const BUILDING_COUNT = useHeavy ? (isUltra ? 60 : 40) : 24;
  const buildings: THREE.Mesh[] = [];
  const buildingBaseGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < BUILDING_COUNT; i++) {
    const t = (i / BUILDING_COUNT) * Math.PI * 2 + Math.random() * 0.1;
    const radius = 22 + Math.random() * 14;
    const bx = Math.cos(t) * radius;
    const bz = Math.sin(t) * radius * 0.7;
    const w = 1.2 + Math.random() * 1.6;
    const h = 3 + Math.random() * 9;
    const d = 1.2 + Math.random() * 1.6;
    // Per-building texture clone with random repeat so windows don't tile identically.
    const tex = buildingTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, Math.round(w)), Math.max(2, Math.round(h * 0.6)));
    ownedTextures.push(tex);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0a0e1a,
      roughness: 0.6,
      metalness: 0.4,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 1.4,
    });
    const b = new THREE.Mesh(buildingBaseGeo, mat);
    b.scale.set(w, h, d);
    b.position.set(bx, h * 0.5, bz);
    b.rotation.y = Math.random() * Math.PI;
    world.add(b);
    buildings.push(b);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  SKY: aurora ribbons + ambient haze (starfield is shared/global)
  // ══════════════════════════════════════════════════════════════════════
  const auroraTex = makeAuroraTexture();
  ownedTextures.push(auroraTex);
  const auroras: THREE.Sprite[] = [];
  if (useHeavy) {
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: auroraTex,
        color: 0xffffff,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      sp.position.set(
        (Math.random() - 0.5) * 60,
        12 + Math.random() * 8,
        (Math.random() - 0.5) * 60,
      );
      sp.scale.set(24 + Math.random() * 12, 4 + Math.random() * 3, 1);
      world.add(sp);
      auroras.push(sp);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  //  CAR: premium procedural model
  // ══════════════════════════════════════════════════════════════════════
  const carGroup = new THREE.Group();
  // Hover-pivot: bob & lean apply to this inner group; carGroup stays at
  // the car's track position so wheels stay planted visually.
  const carHover = new THREE.Group();
  carGroup.add(carHover);

  // Lower chassis (beveled look via two stacked boxes — wide base + tapered top).
  const bodyMat = new THREE.MeshStandardMaterial({
    color: COL_BODY,
    emissive: COL_BODY,
    emissiveIntensity: 0.18,
    roughness: 0.3,
    metalness: 0.6,
  });
  const chassisLower = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.22, 1.95), bodyMat);
  chassisLower.position.y = 0.42;
  carHover.add(chassisLower);
  // Upper body — slightly tapered (narrower), gives the bevel silhouette.
  const chassisUpper = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.18, 1.75), bodyMat);
  chassisUpper.position.y = 0.62;
  carHover.add(chassisUpper);
  // Hood slope (front wedge).
  const hood = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.6), bodyMat);
  hood.position.set(0, 0.72, 0.55);
  hood.rotation.x = -0.08;
  carHover.add(hood);

  // Cabin (dark glass) — slightly tapered trapezoid (approx with a scaled box).
  const cabinMat = new THREE.MeshStandardMaterial({
    color: COL_GLASS,
    roughness: 0.1,
    metalness: 0.9,
    emissive: 0x0a1424,
    emissiveIntensity: 0.15,
  });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.28, 0.9), cabinMat);
  cabin.position.set(0, 0.85, -0.1);
  // Taper the roof line by scaling top vertices inward — approximated by a
  // slightly smaller overlay box on top of the cabin.
  carHover.add(cabin);
  const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 0.7), cabinMat);
  cabinRoof.position.set(0, 0.99, -0.1);
  carHover.add(cabinRoof);

  // Spoiler: thin box on two thin supports at the rear.
  const spoilerMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.4, metalness: 0.7 });
  for (const dx of [-0.32, 0.32]) {
    const sup = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.05), spoilerMat);
    sup.position.set(dx, 0.7, -0.92);
    carHover.add(sup);
  }
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.05, 0.22), spoilerMat);
  wing.position.set(0, 0.82, -0.92);
  carHover.add(wing);

  // Wheels: cylinder rubber + torus rim + hub disk. Front pair steers.
  const wheelGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.18, 20);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: COL_RUBBER, roughness: 0.85, metalness: 0.1 });
  const rimGeo = new THREE.TorusGeometry(0.13, 0.025, 8, 18);
  const rimMat = new THREE.MeshStandardMaterial({ color: COL_RIM, roughness: 0.25, metalness: 0.95, emissive: 0x223344, emissiveIntensity: 0.2 });
  const hubGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8);
  hubGeo.rotateZ(Math.PI / 2);
  const hubMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.3, metalness: 0.9 });

  const wheels: THREE.Mesh[] = [];
  const frontPivots: THREE.Group[] = [];
  const wheeldefs: Array<[number, number, boolean]> = [
    [-0.5, 0.62, true], [0.5, 0.62, true],
    [-0.5, -0.62, false], [0.5, -0.62, false],
  ];
  for (const [dx, dz, front] of wheeldefs) {
    const pivot = new THREE.Group();
    pivot.position.set(dx, 0.21, dz);
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    pivot.add(wheel);
    // Rim ring on the outer face.
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.x = dx > 0 ? 0.09 : -0.09;
    rim.rotation.y = Math.PI / 2;
    pivot.add(rim);
    // Hub disk.
    const hub = new THREE.Mesh(hubGeo, hubMat);
    pivot.add(hub);
    carHover.add(pivot);
    wheels.push(wheel);
    if (front) frontPivots.push(pivot);
  }

  // Headlights: 2 bright emissive spheres + small glow sprites.
  const headlightMat = new THREE.MeshBasicMaterial({ color: COL_HEADLIGHT });
  const headlights: THREE.Mesh[] = [];
  for (const dx of [-0.28, 0.28]) {
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), headlightMat);
    hl.position.set(dx, 0.7, 0.99);
    carHover.add(hl);
    headlights.push(hl);
    const hlGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex,
      color: COL_HEADLIGHT,
      transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    hlGlow.scale.set(0.5, 0.5, 1);
    hlGlow.position.copy(hl.position);
    carHover.add(hlGlow);
  }
  // Forward headlight cone (SpotLight). Only on high+ (spotlights are costly).
  let headSpot: THREE.SpotLight | null = null;
  if (isHigh) {
    headSpot = new THREE.SpotLight(0xfff6d8, 2.2, 14, Math.PI / 7, 0.4, 1.5);
    headSpot.position.set(0, 0.7, 1.0);
    headSpot.target.position.set(0, 0.0, 6.0);
    carHover.add(headSpot);
    carHover.add(headSpot.target);
  }

  // Taillights: 2 red emissive spheres; brighten when braking.
  const tailMat = new THREE.MeshBasicMaterial({ color: COL_TAIL });
  const tails: THREE.Mesh[] = [];
  for (const dx of [-0.28, 0.28]) {
    const tl = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), tailMat);
    tl.position.set(dx, 0.7, -0.99);
    carHover.add(tl);
    tails.push(tl);
    const tlGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex,
      color: COL_TAIL,
      transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    tlGlow.scale.set(0.45, 0.45, 1);
    tlGlow.position.copy(tl.position);
    carHover.add(tlGlow);
  }

  // Underglow: additive sprite below + PointLight casting on the road.
  const underSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex,
    color: COL_CYAN,
    transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  underSprite.scale.set(2.8, 1.6, 1);
  underSprite.position.y = 0.06;
  carHover.add(underSprite);
  // Underglow PointLight — illuminates the road beneath the car.
  const underLight = new THREE.PointLight(COL_CYAN, 1.2, 4.5, 2);
  underLight.position.set(0, 0.4, 0);
  carHover.add(underLight);

  carGroup.name = 'Streetglow GT';
  carGroup.userData.grabbable = false; // pinch is the gas pedal, not a grab
  world.add(carGroup);
  grabbables.push(carGroup);

  // ══════════════════════════════════════════════════════════════════════
  //  MOTION-BLUR GHOSTS: 3 transparent car-body copies trailing behind.
  // ══════════════════════════════════════════════════════════════════════
  const ghosts: THREE.Mesh[] = [];
  const ghostTrail: Array<{ x: number; z: number; h: number }> = [];
  if (useHeavy) {
    const ghostMat = (opacity: number) => new THREE.MeshBasicMaterial({
      color: COL_BODY,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.32, 1.9), ghostMat(0.18 - i * 0.05));
      g.position.y = 0.42;
      world.add(g);
      ghosts.push(g);
      ghostTrail.push({ x: car.x, z: car.z, h: car.heading });
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  //  HELICOPTER SPOTLIGHT: follows the car from above.
  // ══════════════════════════════════════════════════════════════════════
  let heliSpot: THREE.SpotLight | null = null;
  if (isHigh) {
    heliSpot = new THREE.SpotLight(0xffffff, 3.0, 18, Math.PI / 9, 0.5, 1.5);
    heliSpot.position.set(car.x, 9, car.z);
    heliSpot.target.position.set(car.x, 0, car.z);
    world.add(heliSpot);
    world.add(heliSpot.target);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  SPEED-LINE PARTICLES (additive trail behind the car at high speed)
  // ══════════════════════════════════════════════════════════════════════
  const speedLines = new ParticlePool(180, 0xbfe6ff, 0.28, -0.1, 0.3);
  {
    const m = speedLines.points.material as THREE.PointsMaterial;
    m.transparent = true;
    m.blending = THREE.AdditiveBlending;
    m.opacity = 0.7;
  }
  world.add(speedLines.points);

  // Boost-overlay sprite: speed-streak sprite attached to the car (in screen space-ish).
  const streakTex = makeSpeedStreakTexture();
  ownedTextures.push(streakTex);
  const boostOverlay = new THREE.Sprite(new THREE.SpriteMaterial({
    map: streakTex,
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false, // always render on top
  }));
  boostOverlay.scale.set(8, 8, 1);
  boostOverlay.position.set(0, 3, 0);
  // Note: overlay is added to world (not carHover) so it can sit at a fixed
  // camera-relative offset; updated each frame to follow the car.
  world.add(boostOverlay);

  // ══════════════════════════════════════════════════════════════════════
  //  TIRE SMOKE pool (existing mechanic, now with extra density on boost)
  // ══════════════════════════════════════════════════════════════════════
  const smoke = new ParticlePool(280, 0xb8c4d4, 0.4);
  world.add(smoke.points);

  // ══════════════════════════════════════════════════════════════════════
  //  HUD: floating speed label + boost meter bar + lap counter sprite
  // ══════════════════════════════════════════════════════════════════════
  const speedLabel = makeLabel('KM/H', 0.9);
  speedLabel.position.set(0, 1.6, 0);
  carHover.add(speedLabel);

  // Boost meter: a thin plane whose scale.x and color reflect boostCharge.
  const boostMeterBg = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, 0.08),
    new THREE.MeshBasicMaterial({ color: 0x223344, transparent: true, opacity: 0.6, depthWrite: false }),
  );
  boostMeterBg.position.set(0, 1.4, 0);
  carHover.add(boostMeterBg);
  const boostMeterFill = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, 0.08),
    new THREE.MeshBasicMaterial({ color: COL_MAGENTA, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  boostMeterFill.position.set(0, 1.4, 0);
  boostMeterFill.geometry.translate(0.5, 0, 0); // anchor at left edge so scale.x grows rightward
  carHover.add(boostMeterFill);

  // Lap counter sprite (regenerated when laps change).
  let lapLabelLast = -1;
  const lapLabel = makeLabel('LAP 1', 0.8);
  lapLabel.position.set(0, 1.9, 0);
  carHover.add(lapLabel);
  const regenerateLapLabel = (n: number): void => {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const g = canvas.getContext('2d');
    if (!g) return;
    g.font = 'bold 32px "Segoe UI", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = 'rgba(255,47,214,0.9)';
    g.shadowBlur = 10;
    g.fillStyle = '#ffd8f0';
    g.fillText(`LAP ${n + 1}`, 128, 32);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const old = (lapLabel.material as THREE.SpriteMaterial).map;
    (lapLabel.material as THREE.SpriteMaterial).map = tex;
    lapLabel.material.userData.ownMap = true;
    if (old) old.dispose();
  };

  // ══════════════════════════════════════════════════════════════════════
  //  EASY-MODE MARKERS: ghost preview + locked pin (unchanged)
  // ══════════════════════════════════════════════════════════════════════
  const ghost = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.45, 32),
    new THREE.MeshBasicMaterial({ color: COL_CYAN, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
  );
  ghost.rotation.x = -Math.PI / 2;
  ghost.visible = false;
  world.add(ghost);
  const pin = new THREE.Mesh(
    new THREE.RingGeometry(0.35, 0.55, 32),
    new THREE.MeshBasicMaterial({ color: COL_AMBER, transparent: true, opacity: 0.95, side: THREE.DoubleSide }),
  );
  pin.rotation.x = -Math.PI / 2;
  pin.visible = false;
  world.add(pin);

  // ══════════════════════════════════════════════════════════════════════
  //  UPDATE
  // ══════════════════════════════════════════════════════════════════════
  const facts = 'Streetglow GT · pinch = gas · release to coast · Space = brake · pinch-tap = BOOST';

  const triggerBoost = (): void => {
    if (boostActive || cooldownTimer > 0) return;
    boostActive = true;
    boostTimer = BOOST_DURATION;
  };

  const update = (dt: number): void => {
    // Sanitize: a NaN anywhere must degrade to a parked car, never poison
    // the simulation (NaN headings would silently strand every mesh).
    if (!Number.isFinite(input.steer)) input.steer = 0;
    if (
      !Number.isFinite(car.x) ||
      !Number.isFinite(car.z) ||
      !Number.isFinite(car.heading) ||
      !Number.isFinite(car.speed)
    ) {
      car.x = TRACK_A;
      car.z = 0;
      car.heading = 0;
      car.speed = 0;
    }

    // ── Boost logic ──────────────────────────────────────────────────
    // Boost fires on a quick pinch-TAP (down + up within 350ms) — distinct
    // from a held pinch (which is the gas pedal). This lets the user tap
    // to boost while holding gas, without conflicting. Falls back to
    // actionPressed for mouse users (who don't have tap).
    if (!easy && (input.tap || (input.actionPressed && !prevActionPressed))) triggerBoost();
    prevActionPressed = input.actionPressed;
    if (boostActive) {
      boostTimer -= dt;
      if (boostTimer <= 0) {
        boostActive = false;
        boostTimer = 0;
        cooldownTimer = BOOST_COOLDOWN;
      }
    } else if (cooldownTimer > 0) {
      cooldownTimer = Math.max(0, cooldownTimer - dt);
    }
    // Charge display: 1 = ready, drains to 0 over the boost duration, refills over cooldown.
    if (boostActive) boostCharge = Math.max(0, boostTimer / BOOST_DURATION);
    else if (cooldownTimer > 0) boostCharge = 1 - cooldownTimer / BOOST_COOLDOWN;
    else boostCharge = 1;
    const maxSpeedNow = boostActive ? VMAX * BOOST_MULT : VMAX;

    if (easy) {
      // Pinch-state machine: drop pin → launch → cancel.
      if (input.actionPressed) {
        if (!selected && input.ground) {
          selected = { ...input.ground };
        } else if (selected && !driving) {
          driving = true;
        } else if (driving) {
          driving = false;
          selected = null;
        }
      }
      if (driving && selected) {
        const dx = selected.x - car.x;
        const dz = selected.z - car.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.9) {
          driving = false;
          selected = null;
        } else {
          const desired = Math.atan2(dx, dz);
          const err = wrapPi(desired - car.heading);
          if (Math.abs(err) > 0.45) {
            car.heading += Math.sign(err) * 1.9 * dt;
            car.speed += (0 - car.speed) * Math.min(1, 3 * dt);
          } else {
            const steer = THREE.MathUtils.clamp(err * 2.2, -1, 1);
            const targetSpeed = THREE.MathUtils.clamp((dist - 0.5) * 2.0, 0, 10);
            const go = car.speed < targetSpeed;
            lastSteer = steer;
            brakingNow = !go && car.speed > targetSpeed + 0.5;
            stepCar(car, { steer, throttle: go ? 1 : 0, brake: brakingNow }, dt, maxSpeedNow);
          }
        }
      } else {
        stepCar(car, { steer: 0, throttle: 0, brake: true }, dt, maxSpeedNow);
      }
      ghost.visible = !selected && !!input.ground;
      if (input.ground) ghost.position.set(input.ground.x, 0.03, input.ground.z);
      pin.visible = !!selected;
      if (selected) {
        const pulse = 1 + 0.12 * Math.sin(elapsed * 6);
        pin.scale.set(pulse, pulse, 1);
        pin.position.set(selected.x, 0.03, selected.z);
      }
    } else {
      selected = null;
      driving = false;
      ghost.visible = false;
      pin.visible = false;
      const offTrack =
        Math.abs(Math.hypot(car.x / TRACK_A, car.z / TRACK_B) - 1) > 0.32;
      lastSteer = input.steer;
      brakingNow = input.brake;
      stepCar(car, input, dt, offTrack ? 6 : maxSpeedNow);
      if (offTrack) car.speed -= car.speed * 2.2 * dt; // grass drag
    }

    // ── Tire smoke on slides and hard stops (visual only, pooled) ────
    const hardCorner = Math.abs(lastSteer) > 0.45 && Math.abs(car.speed) > 7;
    const hardBrake = brakingNow && Math.abs(car.speed) > 8;
    if (hardCorner || hardBrake || (boostActive && Math.abs(car.speed) > 10)) {
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      for (const side of [-0.5, 0.5]) {
        smoke.spawn(
          car.x - fx * 0.9 + fz * side,
          0.15,
          car.z - fz * 0.9 - fx * side,
          -fx * car.speed * 0.12 + (Math.random() - 0.5),
          0.9,
          -fz * car.speed * 0.12 + (Math.random() - 0.5),
        );
      }
    }
    smoke.update(dt);

    // ── Speed-line trail (high speed / boost) ──────────────────────
    const speedNorm = Math.min(1, Math.abs(car.speed) / VMAX);
    const spawnRate = (boostActive ? 6 : 3) * speedNorm;
    if (spawnRate > 0.05) {
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      const n = Math.min(4, Math.floor(spawnRate + Math.random()));
      for (let i = 0; i < n; i++) {
        const side = (Math.random() - 0.5) * 1.2;
        speedLines.spawn(
          car.x - fx * 1.0 + fz * side,
          0.4 + Math.random() * 0.6,
          car.z - fz * 1.0 - fx * side,
          -fx * (2 + Math.random() * 2),
          -0.2,
          -fz * (2 + Math.random() * 2),
        );
      }
    }
    speedLines.update(dt);

    // ── Motion-blur ghost trail (lag 1/2/3 frames behind the car) ──
    if (ghosts.length > 0) {
      // Shift the trail: ghost[2] ← ghost[1] ← ghost[0] ← current.
      ghostTrail[2] = ghostTrail[1];
      ghostTrail[1] = ghostTrail[0];
      ghostTrail[0] = { x: car.x, z: car.z, h: car.heading };
      for (let i = 0; i < ghosts.length; i++) {
        const g = ghosts[i];
        const t = ghostTrail[i + 1] ?? ghostTrail[0];
        g.position.set(t.x, 0.42, t.z);
        g.rotation.y = t.h;
        const op = (0.18 - i * 0.05) * (boostActive ? 1.8 : speedNorm > 0.7 ? 1.2 : 0.4);
        (g.material as THREE.MeshBasicMaterial).opacity = Math.max(0, op);
      }
    }

    // Arena clamp.
    const rr = Math.hypot(car.x, car.z);
    if (rr > ARENA_RADIUS) {
      car.x *= ARENA_RADIUS / rr;
      car.z *= ARENA_RADIUS / rr;
      car.speed *= 0.6;
    }

    elapsed += dt;
    laps.update(car.x, car.z, elapsed);

    // ── Sync car pose + hover bob + lean + brake squat ─────────────
    carGroup.position.set(car.x, 0, car.z);
    carGroup.rotation.y = car.heading;
    // Hover bob: subtle 2.5px sine.
    const bob = Math.sin(elapsed * 4.2) * 0.025;
    carHover.position.y = bob;
    // Lean into the turn (rotation around the forward axis).
    const targetLean = -lastSteer * 0.12;
    carHover.rotation.z += (targetLean - carHover.rotation.z) * Math.min(1, dt * 8);
    // Brake squat: rear dips when braking hard.
    const targetSquat = brakingNow && Math.abs(car.speed) > 4 ? 0.04 : 0;
    carHover.rotation.x += (targetSquat - carHover.rotation.x) * Math.min(1, dt * 8);
    // Boost: pitch the nose slightly down (acceleration squat).
    const targetBoost = boostActive ? -0.025 : 0;
    carHover.rotation.x += (targetBoost - carHover.rotation.x) * Math.min(1, dt * 6);
    // Wheels: rolling rotation + front steering.
    for (const w of wheels) w.rotation.x += (car.speed * dt) / 0.21;
    for (const f of frontPivots) f.rotation.y = input.steer * 0.45;
    // Taillights brighten when braking.
    tailMat.color.setHex(brakingNow ? 0xff5566 : COL_TAIL);

    // ── Boost visual: underglow intensifies, overlay fades in ──────
    const underOpacity = boostActive ? 0.95 : 0.55;
    (underSprite.material as THREE.SpriteMaterial).opacity += (underOpacity - (underSprite.material as THREE.SpriteMaterial).opacity) * Math.min(1, dt * 6);
    underLight.intensity = boostActive ? 2.4 : 1.2;
    // Boost overlay sprite: fade in with speed.
    const overlayTarget = boostActive ? 0.5 : speedNorm > 0.85 ? 0.2 : 0;
    (boostOverlay.material as THREE.SpriteMaterial).opacity += (overlayTarget - (boostOverlay.material as THREE.SpriteMaterial).opacity) * Math.min(1, dt * 5);
    boostOverlay.position.set(car.x, 3, car.z);
    boostOverlay.scale.setScalar(8 + speedNorm * 2);

    // ── Helicopter spotlight follows the car ───────────────────────
    if (heliSpot) {
      heliSpot.position.set(car.x, 9, car.z);
      heliSpot.target.position.set(car.x, 0, car.z);
      heliSpot.target.updateMatrixWorld();
      // Sweep side-to-side for a "searching" feel.
      heliSpot.position.x += Math.sin(elapsed * 0.8) * 1.5;
    }

    // ── Track lights: subtle pulse, brighter when the car is near ──
    for (let i = 0; i < trackLights.length; i++) {
      const tl = trackLights[i];
      const phase = elapsed * 1.4 + i * 0.7;
      const pulse = 1.2 + Math.sin(phase) * 0.4;
      const tx = tl.position.x;
      const tz = tl.position.z;
      const distToCar = Math.hypot(tx - car.x, tz - car.z);
      const proximity = Math.max(0, 1 - distToCar / 5);
      tl.intensity = pulse + proximity * 2.5;
    }

    // ── Rings: spin + fade when the car is close (drive-through feel)
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      r.rotation.z += dt * 1.5;
      const dist = Math.hypot(r.position.x - car.x, r.position.z - car.z);
      const close = dist < 1.5;
      const mat = r.material as THREE.MeshBasicMaterial;
      const targetOp = close ? 0.3 : 0.9;
      mat.opacity += (targetOp - mat.opacity) * Math.min(1, dt * 6);
      if (close) r.scale.setScalar(1 + (1 - dist / 1.5) * 0.15);
      else r.scale.setScalar(1);
    }

    // ── Aurora drift ────────────────────────────────────────────────
    for (let i = 0; i < auroras.length; i++) {
      const a = auroras[i];
      a.position.x += dt * (0.3 + i * 0.05);
      if (a.position.x > 35) a.position.x = -35;
      (a.material as THREE.SpriteMaterial).opacity = 0.4 + Math.sin(elapsed * 0.5 + i) * 0.15;
    }

    // ── Grid shader uniforms ────────────────────────────────────────
    gridUniforms.uTime.value = elapsed;
    gridUniforms.uSpeed.value = speedNorm;
    gridUniforms.uBoost.value = boostActive ? 1 : 0;

    // ── HUD: boost meter fill + lap label regen ─────────────────────
    boostMeterFill.scale.x = Math.max(0.001, boostCharge);
    (boostMeterFill.material as THREE.MeshBasicMaterial).color.setHex(
      boostActive ? COL_CYAN : cooldownTimer > 0 ? 0x445566 : COL_MAGENTA,
    );
    if (laps.laps !== lapLabelLast) {
      lapLabelLast = laps.laps;
      regenerateLapLabel(laps.laps);
    }

    // ── Headlight spot: aim forward in the car's heading ────────────
    if (headSpot) {
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      headSpot.target.position.set(fx * 6, 0, fz * 6);
      headSpot.target.updateMatrixWorld();
    }
  };

  return {
    grabbables,
    background: 0x05070f,
    stars: true,
    view: { distance: 13, pitch: 0.95, yaw: 0 },
    setDriveInput(frame: DriveFrameInput): void {
      input = frame;
    },
    setEasyMode(on: boolean): void {
      easy = on;
      if (!on) {
        selected = null;
        driving = false;
      }
    },
    isEasyMode(): boolean {
      return easy;
    },
    coachHint(): string | null {
      if (!easy) return 'Pinch-hold = gas · pinch-tap = BOOST · Space = brake';
      if (driving) return 'Autopilot flying — pinch to STOP';
      if (selected) return 'Pin locked — pinch again to GO';
      return 'Point at the ground, pinch to drop a pin';
    },
    update,
    bodyInfo(): string | null {
      const kmh = Math.round(Math.abs(car.speed) * 7.2);
      const lapLine = `Lap ${laps.laps + 1} · ${formatTime(laps.currentLapTime(elapsed))}` +
        (laps.lastLapTime > 0 ? ` · last ${formatTime(laps.lastLapTime)}` : '');
      const boostLine = boostActive ? ' · BOOST' : cooldownTimer > 0 ? ' · cooling' : ' · boost ready';
      if (easy) {
        const hint = driving ? 'pinch to STOP' : selected ? 'pinch again to GO' : 'point + pinch to drop a pin';
        return `Drive · EASY · ${kmh} km/h · ${lapLine} · ${hint}`;
      }
      return `Drive — ${kmh} km/h · ${lapLine}${boostLine} · ${facts}`;
    },
    dispose(): void {
      // Dispose the per-building cloned textures (emissiveMap etc.) that
      // disposeGroup's map-only disposal would otherwise leak.
      for (const t of ownedTextures) t.dispose();
      // Also dispose the lap label's regenerated CanvasTexture (not in ownedTextures).
      const lapMap = (lapLabel.material as THREE.SpriteMaterial).map;
      if (lapMap) lapMap.dispose();
      disposeGroup(world);
    },
  };
}
