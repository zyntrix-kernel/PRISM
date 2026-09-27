// Procedural black hole: event horizon, temperature-ramped accretion disk
// using real blackbody radiation colors (ported from vlwkaos/threejs-blackhole),
// Perlin noise turbulence (ported from ggwzrd/threejs-galaxy), photon ring,
// glow, and relativistic jets — upgraded with Doppler beaming, gravitational
// lensing distortion shell, Einstein/photon-sphere rings, lensed disk arc,
// multi-layer relativistic jets with knots, and pulsing lensing flares.
//
// Attribution:
// - Blackbody temp_to_color: https://github.com/vlwkaos/threejs-blackhole (ISC)
// - Perlin noise: https://github.com/ggwzrd/threejs-galaxy (MIT)

import * as THREE from 'three';
import { NOISE_GLSL } from './noise_glsl';

export interface BlackHoleOpts {
  /** Event-horizon radius (scene units). */
  horizon: number;
  diskInner: number; // inner disk edge (units of horizon)
  diskOuter: number; // outer disk edge (units of horizon)
  diskSpeed?: number;
  jets?: boolean;
}

export interface BlackHole {
  group: THREE.Group;
  update(dt: number, elapsed: number): void;
  /** EXTREME mode: spin up, brighten, flare jets, destabilize the hole. */
  setExtreme(on: boolean): void;
  /** Current extreme state (0 = calm, 1 = maximum). */
  extremeLevel: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. ACCRETION DISK — vertex shader (Keplerian warp + gravitational lensing lift)
// ─────────────────────────────────────────────────────────────────────────────
// The disk is rendered as a RingGeometry in the local XY plane, then rotated
// -π/2 around X so local +Z becomes world +Y. Lifting inner-edge vertices
// along local +Z therefore lifts them ABOVE the disk plane in world space,
// producing the iconic Interstellar "disk wraps over the top" silhouette
// (the inner edge on the FAR side from the camera gets bent up and over).
// ─────────────────────────────────────────────────────────────────────────────
const DISK_VERT = /* glsl */ `
  varying vec2 vLocal;
  varying vec3 vWorldPos;
  uniform float uWarp;
  uniform float uInner;
  uniform float uHorizon;
  uniform float uLensing;
  uniform vec3 uDiskCenter;

  void main() {
    vLocal = position.xy;
    float r = length(vLocal);

    // Warp the disk vertices during extreme mode — the disk buckles.
    float warpAmt = uWarp * sin(r * 3.0 + uWarp * 8.0) * 0.15;
    vec3 pos = position;
    pos.z += warpAmt * r;

    // Gravitational-lensing lift: bend the inner-edge vertices upward
    // (local +Z → world +Y after the disk's -π/2 X rotation). More lift on
    // vertices on the FAR side from the camera → the far side appears to
    // wrap over the top of the black hole.
    vec4 wp = modelMatrix * vec4(pos, 1.0);
    vec3 toCam = normalize(cameraPosition - wp.xyz);
    vec3 radial = normalize(wp.xyz - uDiskCenter);
    float farSide = smoothstep(0.25, -0.35, dot(radial, toCam));
    float innerMask = smoothstep(uInner * 1.25, uInner * 0.92, r);
    pos.z += innerMask * farSide * uLensing * uHorizon * 0.6;

    vec4 worldP = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldP.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldP;
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// 2. ACCRETION DISK — fragment shader (blackbody + Perlin turbulence + Doppler)
// ─────────────────────────────────────────────────────────────────────────────
// Doppler beaming: the disk rotates with swirl = uTime * (2.4 / (0.35 + t));
// the linear velocity at angle `ang` is tangent to the circle. In disk-LOCAL
// XY space the tangent is vec3(-sin(ang), cos(ang), 0). The disk is rotated
// -π/2 around X, so local (x,y,z) → world (x, z, -y); the tangent's world
// form is therefore vec3(-sin(ang), 0, -cos(ang)) * speed. Material with a
// velocity component toward the camera is APPROACHING → blue-shifted +
// brightened; receding material is red-shifted + dimmed (M87*/Sgr A* look).
// ─────────────────────────────────────────────────────────────────────────────
const DISK_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vLocal;
  varying vec3 vWorldPos;
  uniform float uTime;
  uniform float uInner;
  uniform float uOuter;
  uniform float uBoost;
  uniform float uWarp;
  uniform float uDoppler;

  ${NOISE_GLSL}

  void main() {
    float r = length(vLocal);
    float t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
    float ang = atan(vLocal.y, vLocal.x);

    // Keplerian swirl: inner material laps the outer material.
    float speedMul = 1.0 + uWarp * 4.0;
    float swirl = uTime * (2.4 / (0.35 + t)) * speedMul;

    // Perlin-noise turbulence (more organic than hash-based streaks).
    float streaks = cnoise(vec3(ang * 2.5 + swirl, t * 7.0 - uTime * 0.2, 0.0));
    streaks = 0.55 + 0.45 * streaks;
    float fine = cnoise(vec3(ang * 7.0 - swirl * 0.7, t * 16.0, uTime * 0.1));
    float brightness = streaks * (0.8 + 0.2 * fine);

    // ── DOPPLER BEAMING ─────────────────────────────────────────────────
    float speed = (2.4 / (0.35 + t)) * speedMul;
    vec3 velWorld = vec3(-sin(ang), 0.0, -cos(ang)) * speed;
    vec3 toCam = normalize(cameraPosition - vWorldPos);
    float dop = dot(normalize(velWorld), toCam); // [-1, +1]
    // Beaming: 1.6 (fully approaching) → 0.6 (fully receding) at uDoppler=1.
    float beaming = mix(1.0, 1.1 + 0.5 * dop, uDoppler);
    brightness *= beaming;
    // Doppler color shift: approaching → hotter (bluer), receding → cooler (redder).
    float tempShift = mix(0.0, dop * 6500.0, uDoppler);

    // Real blackbody temperature color (from vlwkaos/threejs-blackhole).
    // Temperature falls off with radius: inner = hottest, outer = coolest.
    float temp = mix(40000.0, 3000.0, smoothstep(0.0, 1.0, t));
    temp *= (1.0 + uWarp * 0.5); // extreme mode = hotter
    temp += tempShift;
    vec3 col = temp_to_color(temp);

    // Super-heated inner rim (Einstein-ring glow).
    float rimWidth = 0.18 + uWarp * 0.12;
    col += vec3(0.9, 0.85, 0.7) * pow(1.0 - smoothstep(0.0, rimWidth, t), 2.0);

    float alpha = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.75, 1.0, t));
    gl_FragColor = vec4(col * brightness * 1.7 * uBoost, alpha * 0.92);
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// 3. LENSING DISTORTION SHELL — fake refraction of background stars.
//    Transparent sphere ~4× horizon. Fragment shader samples a procedural
//    starfield by view direction and bends the sampled direction tangentially
//    near the photon sphere, producing stretched star arcs + a bright
//    Einstein ring at b ≈ uPhotonR.
// ─────────────────────────────────────────────────────────────────────────────
const LENS_VERT = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const LENS_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vWorldPos;
  uniform vec3 uCenter;
  uniform float uHorizon;
  uniform float uPhotonR;
  uniform float uTime;
  uniform float uExtreme;

  float hash31(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 toFrag = vWorldPos - cameraPosition;
    vec3 toCenter = uCenter - cameraPosition;
    float dCenter = max(length(toCenter), 0.0001);
    float dFrag = max(length(toFrag), 0.0001);
    vec3 viewDir = toFrag / dFrag;
    vec3 toCenterN = toCenter / dCenter;

    // Impact parameter: perpendicular distance from camera→center line to
    // the ray through this fragment.
    float b = length(cross(viewDir, toCenter)) / dCenter;

    // Deflection peaks just outside the photon sphere (where the Einstein
    // ring forms); falls off rapidly with distance.
    float nearPhoton = exp(-pow((b - uPhotonR) / (uPhotonR * 0.35), 2.0));

    // Tangential stretch: bend the sampled background direction along the
    // radial direction (perpendicular to view), so stars near the photon
    // sphere appear stretched into arcs.
    vec3 radial = normalize(viewDir - toCenterN * dot(viewDir, toCenterN));
    vec3 starDir = normalize(viewDir + radial * nearPhoton * 0.45);

    // Procedural starfield — hash-based points on the sphere of directions.
    vec3 cell = floor(starDir * 70.0);
    float h = hash31(cell);
    float star = smoothstep(0.988, 0.996, h);
    float twk = 0.7 + 0.3 * sin(uTime * 2.5 + h * 60.0);
    vec3 starColor = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.94, 0.86), fract(h * 13.0));

    // Bright Einstein ring at b ≈ uPhotonR.
    float dr = abs(b - uPhotonR);
    float ring = exp(-dr * 22.0 / uPhotonR) * (0.45 + uExtreme * 0.55);
    vec3 ringColor = vec3(1.0, 0.92, 0.74);

    // Stars dimmed near the photon sphere (light is bent into the ring),
    // and faded out beyond a thin annulus around the photon sphere.
    float starAlpha = star * twk * (1.0 - nearPhoton * 0.85);
    float falloff = smoothstep(uPhotonR * 1.9, uPhotonR * 1.0, b);
    starAlpha *= falloff;

    vec3 col = starColor * starAlpha + ringColor * ring;
    float alpha = max(starAlpha, ring);
    alpha *= falloff;

    gl_FragColor = vec4(col, alpha);
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// 4. RELATIVISTIC JETS — vertex (Perlin wobble) + fragment (color gradient).
//    Two cones per direction: bright blue-white CORE + fainter magenta SHEATH.
//    Color goes blue-white (base) → magenta/pink (tip) for synchrotron look.
//    Visible "knots" travel along ±Y during extreme mode (handled in update()).
// ─────────────────────────────────────────────────────────────────────────────
const JET_VERT = /* glsl */ `
  varying float vY;
  uniform float uTime;
  uniform float uWobble;
  uniform float uHorizon;

  ${NOISE_GLSL}

  void main() {
    vec3 pos = position;
    vY = position.y;
    // Perlin-noise tangential displacement (synchrotron turbulence).
    float n = cnoise(vec3(pos.x * 2.5, pos.y * 0.45 - uTime * 0.6, pos.z * 2.5));
    float disp = uWobble * uHorizon * 0.35 * n;
    pos.x += disp;
    pos.z += disp;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const JET_FRAG = /* glsl */ `
  precision highp float;
  varying float vY;
  uniform vec3 uBaseColor;
  uniform vec3 uTipColor;
  uniform float uJetHeight;
  uniform float uBoost;

  void main() {
    float t = clamp((vY + uJetHeight * 0.5) / uJetHeight, 0.0, 1.0);
    vec3 col = mix(uBaseColor, uTipColor, t);
    // Brighter at the base, fading toward the tip.
    float alpha = (0.16 + 0.20 * (1.0 - t)) * uBoost;
    gl_FragColor = vec4(col, alpha);
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// 5. PHOTON-RING SHADER — sharp bright ring that shimmers during extreme mode.
// ─────────────────────────────────────────────────────────────────────────────
const RING_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RING_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uExtreme;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uShimmer;

  ${NOISE_GLSL}

  void main() {
    // Shimmer: noise-modulated opacity breaks up the ring during extreme mode.
    float n = cnoise(vec3(vUv.x * 18.0, uTime * 0.8, 0.0));
    float shimmer = 1.0 + uShimmer * n * 0.6;
    gl_FragColor = vec4(uColor, uOpacity * shimmer);
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS — procedural ring textures (Einstein-ring sprite + lensing flares).
// ─────────────────────────────────────────────────────────────────────────────
function buildRingTexture(inner: number, outer: number, color: string): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (ctx) {
    const cx = size / 2;
    const cy = size / 2;
    const grad = ctx.createRadialGradient(cx, cy, inner * size * 0.5, cx, cy, outer * size * 0.5);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.45, color);
    grad.addColorStop(0.55, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildBlackHole — assembles the full visual stack.
// ─────────────────────────────────────────────────────────────────────────────
export function buildBlackHole(opts: BlackHoleOpts, glowTex: THREE.Texture): BlackHole {
  const { horizon } = opts;
  const inner = opts.diskInner * horizon;
  const outer = opts.diskOuter * horizon;
  const photonR = horizon * 1.32;
  const group = new THREE.Group();

  // ── 1. Event horizon: pure black sphere (scales during extreme mode) ──
  const hole = new THREE.Mesh(
    new THREE.SphereGeometry(horizon, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000 }),
  );
  group.add(hole);

  // ── 2. Accretion disk — Keplerian swirl + Doppler beaming + lensing lift ──
  const diskMat = new THREE.ShaderMaterial({
    vertexShader: DISK_VERT,
    fragmentShader: DISK_FRAG,
    uniforms: {
      uTime: { value: Math.random() * 100 },
      uInner: { value: inner },
      uOuter: { value: outer },
      uBoost: { value: 1 },
      uWarp: { value: 0 },
      uHorizon: { value: horizon },
      uLensing: { value: 0.55 },
      uDoppler: { value: 0.45 },
      uDiskCenter: { value: new THREE.Vector3(0, 0, 0) },
    },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const disk = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 128, 8), diskMat);
  disk.rotation.x = -Math.PI / 2;
  group.add(disk);

  // ── 3. Lensing arc above the hole (Interstellar "wraps over the top") ──
  // Thin half-torus in the local XY plane (curves through +Y), positioned
  // slightly above the disk plane. Brightened + wobbled during extreme mode.
  // Reinforces the vertex-shader lensing lift on the disk's far side.
  const arc = new THREE.Mesh(
    new THREE.TorusGeometry(horizon * 1.45, horizon * 0.045, 8, 64, Math.PI),
    new THREE.MeshBasicMaterial({
      color: 0xffd698,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  arc.position.y = horizon * 0.45;
  group.add(arc);

  // ── 4. Lensing distortion shell (fake star refraction + Einstein ring) ──
  // Larger sphere — fragments sample a procedural starfield by view ray,
  // bent near the photon sphere to fake gravitational lensing of background
  // stars. Additive, depthTest false so it overlays the scene cleanly.
  const lensShellMat = new THREE.ShaderMaterial({
    vertexShader: LENS_VERT,
    fragmentShader: LENS_FRAG,
    uniforms: {
      uCenter: { value: new THREE.Vector3(0, 0, 0) },
      uHorizon: { value: horizon },
      uPhotonR: { value: photonR },
      uTime: { value: 0 },
      uExtreme: { value: 0 },
    },
    transparent: true,
    side: THREE.FrontSide,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const lensShell = new THREE.Mesh(new THREE.SphereGeometry(horizon * 4, 32, 24), lensShellMat);
  lensShell.frustumCulled = false; // group may move; shell always relevant
  group.add(lensShell);

  // ── 5. Photon ring (Einstein ring proper) — sharper, brighter, shimmering ──
  const photonRingMat = new THREE.ShaderMaterial({
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uExtreme: { value: 0 },
      uColor: { value: new THREE.Color(0xffe6b8) },
      uOpacity: { value: 0.95 },
      uShimmer: { value: 0 },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const photonRing = new THREE.Mesh(
    new THREE.TorusGeometry(photonR, horizon * 0.025, 8, 96),
    photonRingMat,
  );
  photonRing.rotation.x = Math.PI / 2;
  group.add(photonRing);

  // ── 6. Inner ISCO photon sub-ring (innermost stable orbit) ──
  const iscoRing = new THREE.Mesh(
    new THREE.TorusGeometry(horizon * 1.18, horizon * 0.012, 6, 96),
    new THREE.MeshBasicMaterial({
      color: 0xfff2cc,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  iscoRing.rotation.x = Math.PI / 2;
  group.add(iscoRing);

  // ── 7. Billboard Einstein-ring glow sprite (always faces camera) ──
  const einsteinRingTex = buildRingTexture(0.46, 0.54, 'rgba(255, 230, 180, 0.85)');
  const einsteinRing = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: einsteinRingTex,
      color: 0xfff0d0,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    }),
  );
  einsteinRing.scale.set(horizon * 3.4, horizon * 3.4, 1);
  group.add(einsteinRing);

  // ── 8. Halo glow sprite (existing) — grows dramatically during extreme ──
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xff9a4d,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  glow.scale.set(horizon * 8, horizon * 8, 1);
  group.add(glow);

  // ── 9. Relativistic jets — core cone + sheath cone + traveling knots ──
  const jetHeight = horizon * 7;
  const jetCoreMat = new THREE.ShaderMaterial({
    vertexShader: JET_VERT,
    fragmentShader: JET_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uWobble: { value: 0.4 },
      uHorizon: { value: horizon },
      uJetHeight: { value: jetHeight },
      uBaseColor: { value: new THREE.Color(0xc8e8ff) }, // blue-white base
      uTipColor: { value: new THREE.Color(0xff4dc4) }, // magenta tip
      uBoost: { value: 1 },
    },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const jetSheathMat = new THREE.ShaderMaterial({
    vertexShader: JET_VERT,
    fragmentShader: JET_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uWobble: { value: 0.6 },
      uHorizon: { value: horizon },
      uJetHeight: { value: jetHeight },
      uBaseColor: { value: new THREE.Color(0x9a6bff) }, // magenta-purple sheath
      uTipColor: { value: new THREE.Color(0xff7ad0) },
      uBoost: { value: 1 },
    },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const jets: THREE.Mesh[] = [];
  const jetGlows: THREE.Sprite[] = [];
  const jetKnots: THREE.Sprite[][] = []; // [signIndex][knotIndex]
  if (opts.jets !== false) {
    for (const sign of [1, -1]) {
      // Bright core cone (smaller radius).
      const core = new THREE.Mesh(
        new THREE.ConeGeometry(horizon * 0.28, jetHeight, 12, 1, true),
        jetCoreMat,
      );
      core.position.y = sign * jetHeight * 0.5;
      if (sign < 0) core.rotation.z = Math.PI;
      group.add(core);
      jets.push(core);

      // Fainter magenta sheath cone (larger radius, behind core).
      const sheath = new THREE.Mesh(
        new THREE.ConeGeometry(horizon * 0.5, jetHeight, 12, 1, true),
        jetSheathMat,
      );
      sheath.position.y = sign * jetHeight * 0.5;
      if (sign < 0) sheath.rotation.z = Math.PI;
      group.add(sheath);
      jets.push(sheath);

      // Tip glow.
      const jetGlow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex,
          color: 0x9fd8ff,
          transparent: true,
          opacity: 0.3,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      jetGlow.position.y = sign * jetHeight;
      jetGlow.scale.set(horizon * 2, horizon * 2, 1);
      group.add(jetGlow);
      jetGlows.push(jetGlow);

      // Traveling knots (visible mainly during extreme mode).
      const knots: THREE.Sprite[] = [];
      for (let k = 0; k < 4; k++) {
        const knot = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowTex,
            color: 0xc8e8ff,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        knot.scale.set(horizon * 0.8, horizon * 0.8, 1);
        group.add(knot);
        knots.push(knot);
      }
      jetKnots.push(knots);
    }
  }

  // ── 10. Lensing flares (extreme-mode only) ──
  // 3 thin ring sprites that scale up + fade in staggered pulses around the
  // photon sphere. Only visible when extremeLevel > 0.3.
  const flareTex = buildRingTexture(0.32, 0.5, 'rgba(255, 220, 160, 0.7)');
  const flares: THREE.Sprite[] = [];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: flareTex,
        color: 0xffe2a8,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      }),
    );
    f.scale.set(horizon * 3, horizon * 3, 1);
    group.add(f);
    flares.push(f);
  }

  // Scratch vector for per-frame world position queries (avoids allocs).
  const tmpCenter = new THREE.Vector3();

  let extreme = false;
  let extremeLevel = 0; // 0 = calm, 1 = maximum (smoothly approached)

  return {
    group,
    get extremeLevel() {
      return extremeLevel;
    },
    update(dt: number, elapsed: number): void {
      // Smoothly approach the extreme target for buttery transitions.
      const target = extreme ? 1 : 0;
      extremeLevel += (target - extremeLevel) * Math.min(1, dt * 2.5);
      const ex = extremeLevel;

      // Refresh disk-center / lens-shell-center uniforms (group may be
      // parented off-origin, e.g. solar.ts places the hole at (-17, 3.5, -11)).
      group.getWorldPosition(tmpCenter);
      diskMat.uniforms.uDiskCenter.value.copy(tmpCenter);
      lensShellMat.uniforms.uCenter.value.copy(tmpCenter);

      // Disk: accelerate time, boost brightness, warp vertices, lift lensing.
      diskMat.uniforms.uTime.value += dt * (opts.diskSpeed ?? 1) * (1 + ex * 5);
      diskMat.uniforms.uBoost.value = 1 + ex * 1.8;
      diskMat.uniforms.uWarp.value = ex;
      diskMat.uniforms.uLensing.value = 0.55 + ex * 0.45;
      diskMat.uniforms.uDoppler.value = 0.45 + ex * 0.55;

      // Hole: GROW and PULSE during extreme mode (the hole itself destabilizes).
      const pulse = 1 + ex * 0.4 + Math.sin(elapsed * (8 + ex * 12)) * ex * 0.12;
      hole.scale.setScalar(pulse);

      // Lensing arc above the hole: brighten + wobble during extreme mode.
      const arcMat = arc.material as THREE.MeshBasicMaterial;
      arcMat.opacity = 0.55 + ex * 0.35 + 0.1 * Math.sin(elapsed * 4.0);
      arc.rotation.z = Math.sin(elapsed * (1.0 + ex * 2.0)) * ex * 0.12;
      arc.scale.setScalar(1 + ex * 0.08);

      // Lensing distortion shell: time + extreme brightness + radius growth.
      lensShellMat.uniforms.uTime.value = elapsed;
      lensShellMat.uniforms.uExtreme.value = ex;
      lensShell.scale.setScalar(1 + ex * 0.3);

      // Photon ring: spin faster, shimmer, scale up.
      photonRingMat.uniforms.uTime.value = elapsed;
      photonRingMat.uniforms.uExtreme.value = ex;
      photonRingMat.uniforms.uShimmer.value = ex;
      photonRing.rotation.z += dt * (0.4 + ex * 3);
      const ringS = 1 + ex * 0.5 + Math.sin(elapsed * 6) * ex * 0.1;
      photonRing.scale.setScalar(ringS);

      // ISCO ring: smaller, faster counter-spin, dimmer shimmer.
      iscoRing.rotation.z -= dt * (0.8 + ex * 4);
      iscoRing.scale.setScalar(1 + ex * 0.3 + Math.sin(elapsed * 9) * ex * 0.08);
      (iscoRing.material as THREE.MeshBasicMaterial).opacity = 0.5 + ex * 0.3;

      // Einstein-ring billboard: pulse + shimmer during extreme.
      (einsteinRing.material as THREE.SpriteMaterial).opacity =
        0.5 + ex * 0.35 + 0.05 * Math.sin(elapsed * 5);
      const erS = horizon * (3.4 + ex * 0.6 + Math.sin(elapsed * 7) * ex * 0.2);
      einsteinRing.scale.set(erS, erS, 1);

      // Halo glow: grow and brighten dramatically.
      const glowS = horizon * (8 + ex * 6);
      glow.scale.set(glowS, glowS, 1);
      (glow.material as THREE.SpriteMaterial).opacity = 0.75 + ex * 0.25;

      // Jets: time + wobble + scale + color boost.
      jetCoreMat.uniforms.uTime.value = elapsed;
      jetSheathMat.uniforms.uTime.value = elapsed;
      jetCoreMat.uniforms.uWobble.value = 0.4 + ex * 0.8;
      jetSheathMat.uniforms.uWobble.value = 0.6 + ex * 0.8;
      jetCoreMat.uniforms.uBoost.value = 1 + ex * 1.5;
      jetSheathMat.uniforms.uBoost.value = 0.8 + ex * 1.4;

      const jetScale = 1 + ex * 1.5;
      jets.forEach((jet) => {
        jet.scale.set(1 + ex * 0.8, jetScale, 1 + ex * 0.8);
      });
      jetGlows.forEach((jg) => {
        const s = horizon * (2 + ex * 4);
        jg.scale.set(s, s, 1);
        (jg.material as THREE.SpriteMaterial).opacity = 0.3 + ex * 0.5;
      });

      // Knots travel from base → tip along each jet; only visible during extreme.
      jetKnots.forEach((knots, signIdx) => {
        const sign = signIdx === 0 ? 1 : -1;
        for (let k = 0; k < knots.length; k++) {
          const knot = knots[k];
          const phase = (elapsed * 0.45 + k / knots.length) % 1;
          const yT = phase; // 0 = base, 1 = tip
          knot.position.y = sign * yT * jetHeight;
          knot.position.x = Math.sin(elapsed * 1.5 + k * 1.3) * horizon * 0.15;
          knot.position.z = Math.cos(elapsed * 1.3 + k * 1.7) * horizon * 0.15;
          const s = horizon * (0.4 + 0.3 * (1 - yT));
          knot.scale.set(s, s, 1);
          const mat = knot.material as THREE.SpriteMaterial;
          // Knot visibility: only during extreme; bright at start, fades at tip.
          const vis = ex > 0.25 ? Math.min(1, (ex - 0.25) / 0.35) : 0;
          mat.opacity = vis * (1 - yT) * 0.9;
        }
      });

      // Lensing flares: staggered pulses, only when extreme > 0.3.
      const flareActive = ex > 0.3;
      const flareVis = flareActive ? Math.min(1, (ex - 0.3) / 0.4) : 0;
      flares.forEach((f, i) => {
        const period = 1.8 + i * 0.4;
        const phase = ((elapsed * (0.6 + i * 0.15) + i * 0.6) % period) / period;
        const fadeIn = phase < 0.65;
        if (!flareActive || !fadeIn) {
          f.visible = false;
        } else {
          f.visible = true;
          const fade = 1.0 - phase / 0.65;
          const scale = horizon * (3.0 + phase * 4.0);
          f.scale.set(scale, scale, 1);
          (f.material as THREE.SpriteMaterial).opacity = fade * flareVis * 0.8;
          (f.material as THREE.SpriteMaterial).rotation = elapsed * (0.3 + i * 0.1);
        }
      });
    },
    setExtreme(on: boolean): void {
      extreme = on;
    },
  };
}
