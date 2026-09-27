// ATOM preset: an interactive Bohr model. Three shells (n = 1, 2, 3) with
// one electron each; grab an electron and drop it on another shell. Falling
// to a lower shell emits a photon BEAM labeled with its true wavelength
// (E = 13.6·(1/n² − 1/m²) eV, λ = 1240/E nm) — the interaction IS the lesson.
//
// Visual stack (premium "quantum lab" tier):
//  • Nucleus: Fibonacci-packed nucleons + 3-layer pulsing glow (core/halo/corona)
//  • Probability density cloud: Perlin-noise volumetric shell (QM visualization)
//  • Orbit rings: shader-driven glowing rings, brighter where the electron is
//  • Electrons: emissive spheres with comet-tail ribbon trails (alpha gradient)
//  • Photon emission: directional wavelength-colored beam + birth flash
//  • Background: ~250 drifting vacuum-fluctuation points (quantum foam)

import * as THREE from 'three';
import { NOISE_GLSL } from './noise_glsl';
import { makeLabel } from './labels';
import { OrbitSystem } from './orbits';
import { ParticlePool } from './particles';
import { disposeGroup, type BuilderCtx, type WorldAPI } from './types';

export interface Shell {
  n: number;
  radius: number;
  /** Orbital period in seconds (passed through the day-based orbit system). */
  period: number;
}

export const SHELLS: Shell[] = [
  { n: 1, radius: 1.6, period: 5 },
  { n: 2, radius: 2.7, period: 11 },
  { n: 3, radius: 4.0, period: 19 },
];

/** Nearest shell index for a dragged radius. */
export function shellOfRadius(radius: number): number {
  let best = 0;
  for (let i = 1; i < SHELLS.length; i++) {
    if (Math.abs(radius - SHELLS[i].radius) < Math.abs(radius - SHELLS[best].radius)) {
      best = i;
    }
  }
  return best;
}

/** Photon wavelength (nm) for a drop from shell nFrom to nTo (nFrom > nTo). */
export function photonNm(nFrom: number, nTo: number): number {
  const energyEV = 13.6 * (1 / (nTo * nTo) - 1 / (nFrom * nFrom));
  return 1240 / energyEV;
}

/** Human color name for the info panel. */
export function photonColorName(nm: number): string {
  if (nm < 380) return 'ultraviolet';
  if (nm < 450) return 'violet';
  if (nm < 495) return 'blue';
  if (nm < 570) return 'green';
  if (nm < 590) return 'yellow';
  if (nm < 620) return 'orange';
  if (nm < 750) return 'red';
  return 'infrared';
}

/**
 * CIE-style wavelength-to-RGB approximation (Bruton's algorithm). Maps a
 * visible-spectrum wavelength (380-780 nm) to an approximate sRGB color.
 * Out-of-range wavelengths (UV/IR) get a dim phantom tint so the beam is
 * still visible — these are invisible to the eye but we want to show that
 * something was emitted.
 */
export function wavelengthToRGB(nm: number): THREE.Color {
  let r = 0;
  let g = 0;
  let b = 0;
  if (nm >= 380 && nm < 440) {
    r = -(nm - 440) / (440 - 380);
    b = 1;
  } else if (nm >= 440 && nm < 490) {
    g = (nm - 440) / (490 - 440);
    b = 1;
  } else if (nm >= 490 && nm < 510) {
    g = 1;
    b = -(nm - 510) / (510 - 490);
  } else if (nm >= 510 && nm < 580) {
    r = (nm - 510) / (580 - 510);
    g = 1;
  } else if (nm >= 580 && nm < 645) {
    r = 1;
    g = -(nm - 645) / (645 - 580);
  } else if (nm >= 645 && nm <= 780) {
    r = 1;
  }
  // Intensity falloff near the visible edges (eye sensitivity)
  let factor = 1;
  if (nm >= 380 && nm < 420) {
    factor = 0.3 + (0.7 * (nm - 380)) / (420 - 380);
  } else if (nm > 700 && nm <= 780) {
    factor = 0.3 + (0.7 * (780 - nm)) / (780 - 700);
  }
  // Out-of-visible: dim phantom tint (UV → deep violet, IR → dim red)
  if (nm < 380) {
    r = 0.45;
    g = 0.05;
    b = 0.65;
    factor = 0.35;
  }
  if (nm > 780) {
    r = 0.55;
    g = 0.08;
    b = 0.08;
    factor = 0.35;
  }
  return new THREE.Color(
    Math.max(0, Math.min(1, r * factor)),
    Math.max(0, Math.min(1, g * factor)),
    Math.max(0, Math.min(1, b * factor)),
  );
}

// ── Shader sources ────────────────────────────────────────────────────────

/** Electron ribbon trail: per-vertex alpha gradient (bright head → faint tail). */
const TRAIL_VERT = /* glsl */ `
  attribute float aAlpha;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const TRAIL_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(uColor, vAlpha);
  }
`;

/** Orbit ring: soft additive glow with a brighter spot at the electron's angle. */
const RING_VERT = /* glsl */ `
  varying float vAngle;
  void main() {
    vAngle = atan(position.y, position.x);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const RING_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uElectronAngle;
  uniform float uTime;
  varying float vAngle;
  void main() {
    float da = vAngle - uElectronAngle;
    // Bright spot centered on the electron, falloff to the opposite side
    float lead = pow(0.5 + 0.5 * cos(da), 3.0);
    // Gentle shimmer for "alive" feel
    float pulse = 0.7 + 0.3 * sin(uTime * 1.4 + vAngle * 4.0);
    float intensity = (0.4 + 0.6 * lead) * pulse;
    gl_FragColor = vec4(uColor * intensity, 0.85 * intensity);
  }
`;

/** Probability density cloud: Perlin-noise-modulated volumetric shell. */
const CLOUD_VERT = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  void main() {
    vLocal = position;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const CLOUD_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vLocal;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;

  ${NOISE_GLSL}

  void main() {
    // Sample animated 3D Perlin noise on the sphere surface — volumetric smoke
    vec3 p = normalize(vLocal) * 1.7;
    float n1 = cnoise(p + vec3(0.0, uTime * 0.13, 0.0));
    float n2 = cnoise(p * 2.1 + vec3(uTime * 0.19, 0.0, uTime * 0.07));
    float density = 0.5 + 0.5 * (n1 * 0.6 + n2 * 0.4);
    density = pow(density, 1.8);

    // Fresnel rim glow (more visible at grazing angles)
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fres = pow(1.0 - max(0.0, dot(viewDir, vWorldNormal)), 2.0);

    vec3 col = mix(uColorA, uColorB, density);
    float alpha = density * 0.22 + fres * 0.08;
    gl_FragColor = vec4(col, alpha);
  }
`;

// ── Electron ribbon trail (per electron) ──────────────────────────────────
const TRAIL_LEN = 40;

class ElectronTrail {
  readonly line: THREE.Line;
  private readonly positions: Float32Array;
  private readonly alphas: Float32Array;
  private readonly geom: THREE.BufferGeometry;
  private readonly lastPos = new THREE.Vector3();
  private initialized = false;

  constructor(color: THREE.Color) {
    this.positions = new Float32Array(TRAIL_LEN * 3);
    this.alphas = new Float32Array(TRAIL_LEN);
    // Alpha gradient: oldest (idx 0) = 0, newest (idx N-1) = 1, with an ease
    // so the head is brightest and the tail fades smoothly.
    for (let i = 0; i < TRAIL_LEN; i++) {
      const t = i / (TRAIL_LEN - 1);
      this.alphas[i] = Math.pow(t, 1.8);
    }
    this.geom = new THREE.BufferGeometry();
    this.geom.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geom.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: TRAIL_VERT,
      fragmentShader: TRAIL_FRAG,
      uniforms: { uColor: { value: color.clone() } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.line = new THREE.Line(this.geom, mat);
    this.line.frustumCulled = false; // trail moves every frame — never cull
  }

  /** Reset all trail points to `pos` (used on first push and on teleport). */
  reset(pos: THREE.Vector3): void {
    for (let i = 0; i < TRAIL_LEN; i++) {
      this.positions[i * 3] = pos.x;
      this.positions[i * 3 + 1] = pos.y;
      this.positions[i * 3 + 2] = pos.z;
    }
    this.geom.attributes.position.needsUpdate = true;
    this.lastPos.copy(pos);
    this.initialized = true;
  }

  /** Push the latest electron position into the trail ring buffer. */
  push(pos: THREE.Vector3): void {
    if (!this.initialized) {
      this.reset(pos);
      return;
    }
    // If we jumped far (grab/teleport/reform), reset to avoid a stray line.
    if (this.lastPos.distanceToSquared(pos) > 4.0) {
      this.reset(pos);
      return;
    }
    // Shift positions back by one slot: positions[0..N-2] = positions[1..N-1]
    this.positions.copyWithin(0, 3, TRAIL_LEN * 3);
    // Write the new head at the last index
    const li = (TRAIL_LEN - 1) * 3;
    this.positions[li] = pos.x;
    this.positions[li + 1] = pos.y;
    this.positions[li + 2] = pos.z;
    this.geom.attributes.position.needsUpdate = true;
    this.lastPos.copy(pos);
  }

  setVisible(v: boolean): void {
    this.line.visible = v;
  }

  dispose(): void {
    this.geom.dispose();
    (this.line.material as THREE.Material).dispose();
  }
}

// ── Photon beam pool ──────────────────────────────────────────────────────
interface PhotonBeam {
  mesh: THREE.Mesh;
  flash: THREE.Sprite;
  active: boolean;
  t: number;
  ttl: number;
  origin: THREE.Vector3;
  dir: THREE.Vector3;
  length: number;
  speed: number;
}

const BEAM_POOL_SIZE = 8;

// ── Builder ────────────────────────────────────────────────────────────────

export function buildAtom(ctx: BuilderCtx): WorldAPI {
  const { world, labelLayer, glowTex, shakeCamera, quality } = ctx;
  const useShader = quality !== 'low';
  const grabbables: THREE.Object3D[] = [];
  const orbits = new OrbitSystem();
  const facts = new Map<string, string>();
  const labels: THREE.Sprite[] = [];
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const tmpAxis = new THREE.Vector3();
  const upY = new THREE.Vector3(0, 1, 0);
  const beamQuat = new THREE.Quaternion();
  // Last settled shell per electron: dropping below it emits a photon.
  const lastShell = new Map<THREE.Mesh, number>();
  let lastEmission: string | null = null;

  // ── Nucleus: Fibonacci-packed nucleons ─────────────────────────────────
  const nucleus = new THREE.Group();
  const nucleonGeo = new THREE.SphereGeometry(0.16, 16, 12);
  const protonMat = new THREE.MeshStandardMaterial({
    color: 0xe04848, emissive: 0xe04848, emissiveIntensity: 0.6,
    roughness: 0.45, metalness: 0.15,
  });
  const neutronMat = new THREE.MeshStandardMaterial({
    color: 0xd8dce8, emissive: 0x8a8a9a, emissiveIntensity: 0.35,
    roughness: 0.55, metalness: 0.1,
  });

  const PROTONS = 4;
  const NEUTRONS = 4;
  const totalNucleons = PROTONS + NEUTRONS;
  const clusterRadius = 0.35;
  const phi = Math.PI * (3 - Math.sqrt(5)); // golden angle

  const nucleonPositions: THREE.Vector3[] = [];
  for (let i = 0; i < totalNucleons; i++) {
    const y = 1 - (i / (totalNucleons - 1)) * 2;
    const radiusAtY = Math.sqrt(1 - y * y);
    const theta = phi * i;
    const x = Math.cos(theta) * radiusAtY;
    const z = Math.sin(theta) * radiusAtY;
    nucleonPositions.push(new THREE.Vector3(x, y, z).multiplyScalar(clusterRadius));
  }
  const types: Array<'P' | 'N'> = [];
  for (let i = 0; i < PROTONS; i++) types.push('P');
  for (let i = 0; i < NEUTRONS; i++) types.push('N');
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }
  nucleonPositions.forEach((pos, i) => {
    const nucleon = new THREE.Mesh(nucleonGeo, types[i] === 'P' ? protonMat : neutronMat);
    nucleon.position.copy(pos);
    nucleus.add(nucleon);
  });

  // ── Pulsing nucleus glow: 3 layers, different frequencies ──────────────
  // Inner core (warm orange, small, bright) · 0.8 Hz
  const glowCore = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex, color: 0xff8a3c, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  glowCore.scale.set(1.6, 1.6, 1);
  nucleus.add(glowCore);
  // Middle halo (warm pink, medium) · 1.2 Hz
  const glowHalo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex, color: 0xff5c8a, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  glowHalo.scale.set(2.8, 2.8, 1);
  nucleus.add(glowHalo);
  // Outer corona (cool red-pink, large, faint) · 0.5 Hz
  const glowCorona = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex, color: 0xb84a7a, transparent: true, opacity: 0.25,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  glowCorona.scale.set(4.4, 4.4, 1);
  nucleus.add(glowCorona);

  nucleus.name = 'Nucleus';
  nucleus.userData.grabbable = false;
  world.add(nucleus);
  grabbables.push(nucleus);
  facts.set('Nucleus', 'Protons + neutrons · 99.97% of atomic mass');

  // ── Probability density cloud (High/Ultra only — quantum visualization) ─
  let cloudMat: THREE.ShaderMaterial | null = null;
  let cloud: THREE.Mesh | null = null;
  if (useShader) {
    cloudMat = new THREE.ShaderMaterial({
      vertexShader: CLOUD_VERT,
      fragmentShader: CLOUD_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uColorA: { value: new THREE.Color(0x4af0ff) }, // cyan
        uColorB: { value: new THREE.Color(0x9a5cff) }, // purple
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    cloud = new THREE.Mesh(new THREE.SphereGeometry(0.95, 48, 32), cloudMat);
    cloud.renderOrder = -1; // draw first so the nucleus shines through
    world.add(cloud);
  }

  // ── Shells + electrons with golden-angle 3D orientations ──────────────
  const electronGeo = new THREE.SphereGeometry(0.13, 20, 14);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const shellGroups: THREE.Group[] = [];
  const trails: ElectronTrail[] = [];
  const ringMats: THREE.ShaderMaterial[] = [];

  SHELLS.forEach((shell, si) => {
    const shellGroup = new THREE.Group();
    if (si === 0) shellGroup.rotation.set(Math.PI / 2, 0, 0);
    else if (si === 1) shellGroup.rotation.set(0, 0, 0);
    else if (si === 2) shellGroup.rotation.set(Math.PI / 4, Math.PI / 4, 0);
    else {
      const angle = (si - 2) * goldenAngle;
      shellGroup.rotation.set(angle, angle * 0.5, angle * 0.25);
    }
    shellGroup.updateMatrix(); // ensure quaternion is computed from Euler
    shellGroups.push(shellGroup);
    world.add(shellGroup);

    // Glowing orbit ring with shader (brighter where the electron is)
    const ringMat = new THREE.ShaderMaterial({
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      uniforms: {
        uColor: { value: new THREE.Color(0x00f0ff) },
        uElectronAngle: { value: 0 },
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    ringMats.push(ringMat);
    const orbitRing = new THREE.Mesh(
      // Slightly thicker than the old 0.02 torus for a more present glow,
      // additive blending keeps it from looking gaudy.
      new THREE.TorusGeometry(shell.radius, 0.035, 10, 96),
      ringMat,
    );
    orbitRing.rotation.x = Math.PI / 2; // rotate XY → XZ to match orbit plane
    shellGroup.add(orbitRing);

    const label = makeLabel(`n=${shell.n}`, 0.8);
    labelLayer.add(label);
    labels.push(label);

    const mat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff, emissive: 0x00f0ff, emissiveIntensity: 1.1,
      roughness: 0.25, metalness: 0.2,
    });
    const electron = new THREE.Mesh(electronGeo, mat);
    electron.name = `Electron n=${shell.n}`;
    electron.userData.orbitBody = true;
    electron.userData.homeShell = si;
    electron.userData.shellQuat = shellGroup.quaternion.clone();
    const angle = (si / SHELLS.length) * Math.PI * 2 + 0.4;
    world.add(electron);
    grabbables.push(electron);
    orbits.register(electron, shell.radius, angle, shell.period);
    lastShell.set(electron, si);
    facts.set(electron.name, 'Electron · drag it to another shell');

    // Ribbon trail (one per electron; cheap shader, always on)
    const trail = new ElectronTrail(new THREE.Color(0x00f0ff));
    world.add(trail.line);
    trails.push(trail);
  });

  // ── Photon beam pool (reusable directional beams + birth flashes) ───────
  const beamGeo = new THREE.CylinderGeometry(0.025, 0.006, 1.0, 8, 1, true);
  const beams: PhotonBeam[] = [];
  for (let i = 0; i < BEAM_POOL_SIZE; i++) {
    const bm = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(beamGeo, bm);
    mesh.visible = false;
    mesh.frustumCulled = false;
    world.add(mesh);
    const flash = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex, color: 0xffffff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    flash.visible = false;
    world.add(flash);
    beams.push({
      mesh, flash, active: false, t: 0, ttl: 1.5,
      origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 1, 0),
      length: 1.4, speed: 3.5,
    });
  }

  function spawnBeam(origin: THREE.Vector3, dir: THREE.Vector3, color: THREE.Color): void {
    const beam = beams.find((b) => !b.active);
    if (!beam) return;
    beam.active = true;
    beam.t = 0;
    beam.origin.copy(origin);
    beam.dir.copy(dir).normalize();
    (beam.mesh.material as THREE.MeshBasicMaterial).color.copy(color);
    (beam.flash.material as THREE.SpriteMaterial).color.copy(color);
    beam.mesh.visible = true;
    beam.flash.visible = true;
  }

  // ── Core-breach kit: shockwave ring + debris burst (preserved feature) ─
  const flash = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex, color: 0xfff2c8, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  flash.visible = false;
  world.add(flash);
  let flashT = 1e9;

  const shock = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 1.0, 64),
    new THREE.MeshBasicMaterial({
      color: 0xffd9ec, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  shock.rotation.x = -Math.PI / 2;
  shock.visible = false;
  world.add(shock);
  const debris = new ParticlePool(220, 0xffd9ec, 0.12);
  world.add(debris.points);
  let blast: { t: number; electron: THREE.Mesh } | null = null;
  let aimR = Number.POSITIVE_INFINITY;
  let ramDwell = 0;

  // ── Background vacuum fluctuations (quantum foam) ──────────────────────
  const VAC_COUNT = quality === 'ultra' ? 300 : quality === 'high' ? 240 : 160;
  const vacPos = new Float32Array(VAC_COUNT * 3);
  const vacBase = new Float32Array(VAC_COUNT * 3);
  const vacPhase = new Float32Array(VAC_COUNT);
  for (let i = 0; i < VAC_COUNT; i++) {
    // Spherical shell distribution in a generous volume around the atom
    const r = 4 + Math.random() * 6;
    const theta = Math.random() * Math.PI * 2;
    const u = Math.random() * 2 - 1;
    const s = Math.sqrt(1 - u * u);
    const x = r * s * Math.cos(theta);
    const y = r * u * 0.7;
    const z = r * s * Math.sin(theta);
    vacPos[i * 3] = x;
    vacPos[i * 3 + 1] = y;
    vacPos[i * 3 + 2] = z;
    vacBase[i * 3] = x;
    vacBase[i * 3 + 1] = y;
    vacBase[i * 3 + 2] = z;
    vacPhase[i] = Math.random() * Math.PI * 2;
  }
  const vacGeo = new THREE.BufferGeometry();
  vacGeo.setAttribute('position', new THREE.BufferAttribute(vacPos, 3));
  const vacMat = new THREE.PointsMaterial({
    color: 0xaaccff, size: 0.05, transparent: true, opacity: 0.2,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const vacuum = new THREE.Points(vacGeo, vacMat);
  vacuum.frustumCulled = false;
  world.add(vacuum);

  const shellName = (mesh: THREE.Mesh): string => {
    const s = orbits.get(mesh);
    return s ? `n=${SHELLS[shellOfRadius(s.radius)].n}` : '';
  };

  return {
    grabbables,
    background: 0x05070f,
    view: { distance: 9.5, pitch: 0.5, yaw: 0.4 },
    update(dt: number, elapsed: number): void {
      orbits.update(dt); // periods registered in seconds

      // Apply shell 3D orientation to un-grabbed electrons. The orbit system
      // places electrons in flat XZ; each shell's stored quaternion tilts the
      // orbit into 3D space (preserves length, so radius is unchanged).
      for (const body of orbits.bodies) {
        if (body.userData.grabbed) continue;
        const quat = body.userData.shellQuat as THREE.Quaternion | undefined;
        if (quat) {
          tmp.copy(body.position).applyQuaternion(quat);
          body.position.copy(tmp);
        }
      }

      // Core-breach ram detector (pointer-based: shells snap the body to
      // r ≥ 1.6, so the only "into the nucleus" signal is the raw pointer).
      const rammer = orbits.bodies.find((b) => b.userData.grabbed);
      if (!blast) {
        if (rammer && aimR < 1.0) {
          ramDwell += dt;
        } else {
          ramDwell = 0;
        }
        if (rammer && ramDwell >= 0.4) {
          const electron = rammer;
          blast = { t: 0, electron };
          electron.scale.setScalar(0.01); // vaporized (stays pickable-safe)
          electron.userData.grabbed = false; // hand off: interaction releases clean
          flashT = 1e9;
          flash.visible = true;
          flash.position.set(0, 0, 0);
          shock.visible = true;
          nucleus.visible = false;
          if (cloud) cloud.visible = false;
          // Hide trails + orbit rings + active beams during detonation
          for (const t of trails) t.setVisible(false);
          for (const b of beams) {
            b.active = false;
            b.mesh.visible = false;
            b.flash.visible = false;
          }
          for (let i = 0; i < 130; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 2.5 + Math.random() * 4.5;
            debris.spawn(
              (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4,
              Math.cos(a) * sp, 1.5 + Math.random() * 2.5, Math.sin(a) * sp,
            );
          }
          shakeCamera(0.7);
          lastEmission = 'CORE BREACH — atomic blast!';
        }
      } else {
        blast.t += dt;
        const t = blast.t;
        const flashMat = flash.material as THREE.SpriteMaterial;
        flashMat.opacity = Math.max(0, 1 - t / 1.2);
        const fsc = 1 + t * 6;
        flash.scale.set(fsc, fsc, 1);
        const shockMat = shock.material as THREE.MeshBasicMaterial;
        shockMat.opacity = Math.max(0, 0.9 * (1 - t / 1.4));
        const ssc = 1 + t * 6.5;
        shock.scale.set(ssc, ssc, 1);
        if (t > 2.6) {
          // Reform: electron back on its home shell, nucleus restored.
          const s = orbits.get(blast.electron);
          if (s) {
            const hs = SHELLS[(blast.electron.userData.homeShell as number) ?? 0] ?? SHELLS[0];
            s.radius = hs.radius;
            s.periodDays = hs.period;
          }
          blast.electron.scale.setScalar(1);
          nucleus.visible = true;
          if (cloud) cloud.visible = true;
          for (const t2 of trails) t2.setVisible(true);
          flash.visible = false;
          shock.visible = false;
          blast = null;
        }
      }
      debris.update(dt);

      // Per-electron: spin, ring shader uniforms, emission check, trail push
      for (let i = 0; i < orbits.bodies.length; i++) {
        const electron = orbits.bodies[i];
        electron.rotation.y += dt * 3;
        const s = orbits.get(electron);

        // Drive the orbit-ring shader (electron angle + time)
        if (s && ringMats[i]) {
          ringMats[i].uniforms.uElectronAngle.value = s.angle;
          ringMats[i].uniforms.uTime.value = elapsed;
        }

        // Emission check: settled shell dropped below the last recorded one.
        // Suppressed during a blast (chaos, not physics).
        if (!blast && s && !electron.userData.grabbed) {
          const now = shellOfRadius(s.radius);
          const prev = lastShell.get(electron) ?? now;
          if (now < prev) {
            const nm = photonNm(SHELLS[prev].n, SHELLS[now].n);
            const color = wavelengthToRGB(nm);
            lastEmission = `Photon ${nm.toFixed(0)} nm (${photonColorName(nm)})`;
            electron.getWorldPosition(tmp);
            // Direction: radial outward from nucleus, with random perpendicular
            // tilt (±~0.5 rad cone) so multiple emissions don't overlap exactly.
            tmp2.copy(tmp).normalize();
            tmpAxis.set(
              Math.random() - 0.5,
              Math.random() - 0.5,
              Math.random() - 0.5,
            ).normalize();
            tmp2.applyAxisAngle(tmpAxis, (Math.random() - 0.5) * 1.0);
            spawnBeam(tmp, tmp2, color);
            // Photon birth flash (kept at emission point; fades over 0.8s)
            flash.position.copy(tmp);
            (flash.material as THREE.SpriteMaterial).color.copy(color);
            flashT = 0;
            facts.set(electron.name, `Electron · just emitted ${nm.toFixed(0)} nm`);
          }
          lastShell.set(electron, now);
        }

        // Push the trail position (skipped during blast — trails are hidden)
        if (!blast) {
          electron.getWorldPosition(tmp);
          trails[i].push(tmp);
        }
      }

      // Update active photon beams (travel outward + fade over ttl)
      for (const beam of beams) {
        if (!beam.active) continue;
        beam.t += dt;
        const k = beam.t / beam.ttl;
        if (k >= 1) {
          beam.active = false;
          beam.mesh.visible = false;
          beam.flash.visible = false;
          continue;
        }
        // Beam length grows slightly as the photon "travels"
        const length = beam.length * (1 + k * 0.6);
        const travel = beam.speed * beam.t;
        // Orient the cylinder along dir (Y axis → dir)
        beamQuat.setFromUnitVectors(upY, beam.dir);
        beam.mesh.quaternion.copy(beamQuat);
        beam.mesh.scale.set(1, length, 1);
        // Position the cylinder so its tail is at origin + dir*travel
        beam.mesh.position.copy(beam.origin).addScaledVector(beam.dir, travel + length * 0.5);
        // Fade: bright at birth, dim at end
        const beamOpacity = (1 - k) * 0.9;
        (beam.mesh.material as THREE.MeshBasicMaterial).opacity = beamOpacity;
        // Birth flash sprite: quick bright pop that fades fast
        const flashK = Math.min(1, beam.t / 0.4);
        const flashOpacity = (1 - flashK) * 0.95;
        const fScale = 0.6 + flashK * 1.8;
        beam.flash.position.copy(beam.origin);
        beam.flash.scale.set(fScale, fScale, 1);
        (beam.flash.material as THREE.SpriteMaterial).opacity = flashOpacity;
      }

      // Photon-birth flash (kept compatible with old flash sprite — it serves
      // both the emission birth-pop and the core-breach detonation flash).
      if (!blast && flashT < 0.8) {
        flashT += dt;
        const k = Math.min(1, flashT / 0.8);
        flash.visible = true;
        (flash.material as THREE.SpriteMaterial).opacity = 0.9 * (1 - k);
        const sc = 0.6 + k * 2.4;
        flash.scale.set(sc, sc, 1);
      } else if (!blast) {
        flash.visible = false;
      }

      // ── Nucleus 3-layer glow pulse (different frequencies) ────────────
      const p1 = 0.5 + 0.5 * Math.sin(elapsed * 0.8 * Math.PI * 2);
      const p2 = 0.5 + 0.5 * Math.sin(elapsed * 1.2 * Math.PI * 2 + 1.0);
      const p3 = 0.5 + 0.5 * Math.sin(elapsed * 0.5 * Math.PI * 2 + 2.0);
      (glowCore.material as THREE.SpriteMaterial).opacity = 0.55 + p1 * 0.3;
      const sc1 = 1.5 + p1 * 0.3;
      glowCore.scale.set(sc1, sc1, 1);
      (glowHalo.material as THREE.SpriteMaterial).opacity = 0.3 + p2 * 0.25;
      const sc2 = 2.7 + p2 * 0.4;
      glowHalo.scale.set(sc2, sc2, 1);
      (glowCorona.material as THREE.SpriteMaterial).opacity = 0.18 + p3 * 0.15;
      const sc3 = 4.2 + p3 * 0.6;
      glowCorona.scale.set(sc3, sc3, 1);

      // Cloud shader time
      if (cloudMat) cloudMat.uniforms.uTime.value = elapsed;

      // Nucleus slow spin
      nucleus.rotation.y += dt * 0.3;

      // Vacuum drift (cheap CPU sinusoid; additive; frustumCulled = false)
      const vacArr = vacGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < VAC_COUNT; i++) {
        const ph = vacPhase[i];
        vacArr[i * 3] = vacBase[i * 3] + Math.sin(elapsed * 0.15 + ph) * 0.35;
        vacArr[i * 3 + 1] = vacBase[i * 3 + 1] + Math.cos(elapsed * 0.18 + ph * 1.3) * 0.25;
        vacArr[i * 3 + 2] = vacBase[i * 3 + 2] + Math.sin(elapsed * 0.12 + ph * 0.7) * 0.35;
      }
      vacGeo.attributes.position.needsUpdate = true;
      vacuum.rotation.y += dt * 0.02;

      // Labels follow electrons
      for (let i = 0; i < orbits.bodies.length; i++) {
        const body = orbits.bodies[i];
        body.getWorldPosition(tmp);
        labels[i].position.set(tmp.x, tmp.y + 0.45, tmp.z);
      }
    },
    setOrbitFromPoint(mesh: THREE.Mesh, localPoint: THREE.Vector3): void {
      // Magnetic shells: snap live to the nearest shell while dragging.
      // The raw pointer radius feeds the core-breach ram detector.
      aimR = Math.hypot(localPoint.x, localPoint.z);
      const s = orbits.get(mesh);
      if (!s) return;
      const snapped = SHELLS[shellOfRadius(Math.hypot(localPoint.x, localPoint.z))];
      s.radius = snapped.radius;
      s.angle = Math.atan2(localPoint.z, localPoint.x);
      s.periodDays = snapped.period;
    },
    bodyInfo(name: string | null): string | null {
      if (blast) return 'CORE BREACH — atomic blast! Ram an electron home to rebuild.';
      if (!name) return lastEmission ? `Atom (Bohr model) · last event: ${lastEmission}` : null;
      const factsLine = facts.get(name);
      if (!factsLine) return null;
      if (name.startsWith('Electron')) {
        const body = orbits.bodies.find((b) => b.name === name);
        const extra = body ? ` · shell ${shellName(body)}` : '';
        return `${name} — ${factsLine}${extra}`;
      }
      return `${name} — ${factsLine}`;
    },
    dispose(): void {
      // Trails hold their own geometry/material; dispose explicitly then let
      // disposeGroup sweep the rest (meshes, sprites, beams, cloud, vacuum).
      for (const t of trails) t.dispose();
      disposeGroup(world);
      disposeGroup(labelLayer);
    },
  };
}
