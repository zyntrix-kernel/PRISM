// SPACE preset: Keplerian solar system with procedural sun shader, Saturn
// rings with Cassini Division, anamorphic lens flare, twinkling local
// starfield, Earth day/night with city lights, and a particle comet tail.
//
// Visual tier (high/ultra):
//   - Procedural sun shader (Perlin granulation, limb darkening, chromosphere)
//   - Coronal mass ejections via noise-driven vertex displacement
//   - Saturn rings shader (C/B/A/F bands + Cassini Division + soft alpha)
//   - Anamorphic lens flare on the sun (additive billboard sprite group)
//   - Twinkling local starfield (per-star phase + frequency, stellar colors)
//   - Earth day/night with procedural city lights (custom shader)
//   - Comet particle tail (anti-sunward stream, solar-wind pressure scaling)
//
// Lower tiers (medium/low): flat materials + sprite glows for performance.

import * as THREE from 'three';
import { buildBlackHole, type BlackHole } from './blackhole';
import {
  MAX_ORBIT_RADIUS,
  MIN_ORBIT_RADIUS,
  OrbitingDebris,
  OrbitSystem,
  TIME_DAYS_PER_SECOND,
} from './orbits';
import { ParticlePool } from './particles';
import { disposeGroup, type BuilderCtx, type WorldAPI } from './types';
import { makeLabel } from './labels';
import { createFresnelGlow } from './fresnel';
import { NOISE_GLSL } from './noise_glsl';

interface PlanetSpec {
  name: string;
  radius: number;
  size: number;
  color: number;
  periodDays: number;
  facts: string;
  texKey?:
    | 'mercury'
    | 'venus'
    | 'earth'
    | 'mars'
    | 'jupiter'
    | 'saturn'
    | 'uranus'
    | 'neptune';
  atmosphere?: number; // atmosphere tint (undefined = none)
  ring?: boolean;
}

const PLANETS: PlanetSpec[] = [
  { name: 'Mercury', radius: 1.5, size: 0.09, color: 0x9c8e82, periodDays: 88, facts: 'Swift planet · year 88 days', texKey: 'mercury' },
  { name: 'Venus', radius: 1.95, size: 0.15, color: 0xe8b06a, periodDays: 225, facts: 'Hottest planet · retrograde spin', texKey: 'venus', atmosphere: 0xf2d8a8 },
  { name: 'Earth', radius: 2.6, size: 0.16, color: 0x3f8cff, periodDays: 365.25, facts: '1 AU · the only known life', texKey: 'earth', atmosphere: 0x4da6ff },
  { name: 'Mars', radius: 3.15, size: 0.12, color: 0xe05a3a, periodDays: 687, facts: 'Year 687 days · Olympus Mons', texKey: 'mars' },
  { name: 'Jupiter', radius: 4.3, size: 0.46, color: 0xd8a05e, periodDays: 4333, facts: 'Giant · year 11.9 Earth years', texKey: 'jupiter', atmosphere: 0xd8a878 },
  { name: 'Saturn', radius: 5.45, size: 0.38, color: 0xe3cf9a, periodDays: 10759, facts: 'Ringed giant · year 29.5 years', texKey: 'saturn', atmosphere: 0xe0d0a0, ring: true },
  { name: 'Uranus', radius: 6.5, size: 0.28, color: 0x7fe3e0, periodDays: 30687, facts: 'Ice giant · rolls on its side', texKey: 'uranus', atmosphere: 0x7fe3e0 },
  { name: 'Neptune', radius: 7.45, size: 0.27, color: 0x4a6de0, periodDays: 60190, facts: 'Windiest world · year 165 years', texKey: 'neptune', atmosphere: 0x5a7df0 },
];

// ============================================================================
// Atmosphere fresnel (existing, reused for non-Earth planets)
// ============================================================================

const ATMO_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const ATMO_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vView;
  uniform vec3 uColor;
  void main() {
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 3.0);
    gl_FragColor = vec4(uColor * rim * 1.8, rim);
  }
`;

function makeAtmosphere(size: number, color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(size * 1.22, 20, 14),
    new THREE.ShaderMaterial({
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_FRAG,
      uniforms: { uColor: { value: new THREE.Color(color) } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  return mesh;
}

// ============================================================================
// Procedural Sun Shader — granulation, limb darkening, chromosphere, pulse
// ============================================================================

const SUN_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vLocal;
  varying vec3 vView;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vLocal = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const SUN_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vLocal;
  varying vec3 vView;
  uniform float uTime;
  ${NOISE_GLSL}

  void main() {
    // 3D Perlin-noise granulation at multiple frequencies + drift speeds.
    vec3 p = normalize(vLocal) * 2.2;
    float n1 = cnoise(p + vec3(uTime * 0.07, 0.0, 0.0));
    float n2 = cnoise(p * 2.3 + vec3(uTime * 0.11, uTime * 0.05, 0.0));
    float n3 = cnoise(p * 5.5 - vec3(0.0, uTime * 0.16, uTime * 0.04));
    float gran = 0.5 + 0.34 * n1 + 0.18 * n2 + 0.10 * n3;
    gran = clamp(gran, 0.0, 1.6);

    // Limb darkening: dim at grazing angles (mu = cos(view-normal angle)).
    float mu = max(0.0, dot(normalize(vNormal), normalize(vView)));
    float limb = 0.32 + 0.68 * pow(mu, 0.55);

    // Blackbody-ish palette: deep orange core -> yellow-white -> white-hot peaks.
    vec3 deepOrange = vec3(1.0, 0.36, 0.06);
    vec3 yellowWhite = vec3(1.0, 0.78, 0.42);
    vec3 whiteHot = vec3(1.0, 0.95, 0.86);
    float heat = clamp(gran * limb * 1.35, 0.0, 1.4);
    vec3 col = mix(deepOrange, yellowWhite, smoothstep(0.2, 0.7, heat));
    col = mix(col, whiteHot, smoothstep(0.85, 1.3, heat));
    col *= limb;

    // Chromosphere: thin pinkish-red ring at the very edge.
    float chromo = pow(1.0 - mu, 6.0);
    col += vec3(1.0, 0.22, 0.28) * chromo * 0.85;

    // Gentle pulse.
    col *= 1.0 + 0.06 * sin(uTime * 0.9);

    gl_FragColor = vec4(col, 1.0);
  }
`;

function buildSunShaderMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SUN_VERT,
    fragmentShader: SUN_FRAG,
    uniforms: { uTime: { value: 0 } },
  });
}

// ============================================================================
// Coronal Mass Ejections — noise-driven vertex displacement on a slightly
// larger sphere. Bright tendrils arc out from the surface where noise pushes
// outward.
// ============================================================================

const CME_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vDisp;
  uniform float uTime;
  ${NOISE_GLSL}

  void main() {
    vec3 p = normalize(position) * 1.6;
    float n1 = cnoise(p + vec3(uTime * 0.08, 0.0, 0.0));
    float n2 = cnoise(p * 2.1 + vec3(uTime * 0.14, uTime * 0.06, 0.0));
    float tendril = max(0.0, n1 * 0.6 + n2 * 0.5 - 0.15);
    float disp = tendril * 0.45;
    vDisp = disp;
    vec3 newPos = position + normal * disp;
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(newPos, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const CME_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vDisp;

  void main() {
    float mu = max(0.0, dot(normalize(vNormal), normalize(vView)));
    float rim = pow(1.0 - mu, 3.0);
    vec3 col = mix(vec3(1.0, 0.55, 0.18), vec3(1.0, 0.85, 0.55), rim);
    float alpha = clamp(vDisp * 4.5, 0.0, 0.85) * (0.35 + 0.65 * rim);
    gl_FragColor = vec4(col, alpha);
  }
`;

function buildCMEMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: CME_VERT,
    fragmentShader: CME_FRAG,
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });
}

// ============================================================================
// Saturn Rings — multi-band (C/B/A/F) shader with Cassini Division
// and soft alpha falloff at both edges.
// ============================================================================

const RING_VERT = /* glsl */ `
  varying float vRadius;
  varying float vAngle;
  void main() {
    vRadius = length(position.xy);
    vAngle = atan(position.y, position.x);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RING_FRAG = /* glsl */ `
  precision highp float;
  varying float vRadius;
  varying float vAngle;
  uniform float uInner;
  uniform float uOuter;
  uniform float uTime;

  void main() {
    float t = clamp((vRadius - uInner) / (uOuter - uInner), 0.0, 1.0);

    // Saturn ring bands (t = 0 inner .. 1 outer).
    //   C ring: 0.00 - 0.22 (faint)
    //   B ring: 0.22 - 0.55 (bright)
    //   Cassini Division: 0.55 - 0.62 (dark gap)
    //   A ring: 0.62 - 0.94 (medium-bright)
    //   F ring: 0.94 - 1.00 (thin outer)
    float bright = 0.0;
    bright += 0.22 * smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.18, 0.22, t));
    bright += 0.95 * smoothstep(0.22, 0.24, t) * (1.0 - smoothstep(0.5, 0.55, t));
    bright += 0.62 * smoothstep(0.62, 0.65, t) * (1.0 - smoothstep(0.9, 0.94, t));
    bright += 0.55 * smoothstep(0.94, 0.96, t) * (1.0 - smoothstep(0.99, 1.0, t));

    // Fine radial density bands + a soft angular shimmer.
    float fine = 0.5 + 0.5 * sin(t * 90.0 + sin(vAngle * 5.0 + uTime * 0.1) * 0.6);
    bright *= 0.82 + 0.18 * fine;

    // Soft alpha at inner + outer edges; carve the Cassini Division gap.
    float alpha = smoothstep(0.0, 0.03, t) * (1.0 - smoothstep(0.985, 1.0, t));
    alpha *= 1.0 - smoothstep(0.54, 0.56, t) * (1.0 - smoothstep(0.61, 0.63, t));
    alpha *= 0.92; // slight transparency so planet shadow could show through

    vec3 col = vec3(0.89, 0.79, 0.61) * bright;
    // Inner C ring slightly cooler.
    col = mix(col, vec3(0.72, 0.75, 0.82), smoothstep(0.22, 0.0, t) * 0.25);

    gl_FragColor = vec4(col, alpha);
  }
`;

function buildSaturnRings(inner: number, outer: number): THREE.Mesh {
  const geo = new THREE.RingGeometry(inner, outer, 96, 6);
  const mat = new THREE.ShaderMaterial({
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    uniforms: {
      uInner: { value: inner },
      uOuter: { value: outer },
      uTime: { value: 0 },
    },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2 + 0.25;
  return mesh;
}

// ============================================================================
// Earth Day/Night with City Lights — procedural canvas sampled from the
// Earth land texture, mixed by sun-facing in a custom shader.
// ============================================================================

function buildCityLightsTexture(earthTex: THREE.CanvasTexture): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // Sample the earth texture to detect land (green/brown dominant over blue).
  let earthData: Uint8ClampedArray | null = null;
  let ew = 0;
  let eh = 0;
  const earthCanvas = earthTex.image as HTMLCanvasElement | undefined;
  if (earthCanvas) {
    const ec = earthCanvas.getContext('2d');
    if (ec) {
      try {
        const img = ec.getImageData(0, 0, earthCanvas.width, earthCanvas.height);
        earthData = img.data;
        ew = earthCanvas.width;
        eh = earthCanvas.height;
      } catch {
        // Cross-origin tainting (shouldn't happen for procedural canvases).
        earthData = null;
      }
    }
  }
  const sampleLand = (u: number, v: number): boolean => {
    if (!earthData) return Math.random() < 0.3;
    const x = Math.min(ew - 1, Math.max(0, Math.floor(u * ew)));
    const y = Math.min(eh - 1, Math.max(0, Math.floor(v * eh)));
    const i = (y * ew + x) * 4;
    const r = earthData[i];
    const g = earthData[i + 1];
    const b = earthData[i + 2];
    return g > b + 10 && r > 60;
  };

  // Clustered city lights: scatter dots on land, avoiding the poles.
  const cityCount = 2400;
  for (let i = 0; i < cityCount; i++) {
    const u = Math.random();
    const v = Math.random();
    if (v < 0.12 || v > 0.88) continue; // skip polar regions
    if (!sampleLand(u, v)) continue;
    const x = u * W;
    const y = v * H;
    const cluster = Math.random();
    const brightness = 0.4 + Math.random() * 0.6;
    const hue = 38 + Math.random() * 20; // warm yellow-orange sodium glow
    const sat = 70 + Math.random() * 20;
    const light = 50 + Math.random() * 30;
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${brightness})`;
    const dotSize = cluster > 0.95 ? 2 : 1;
    ctx.fillRect(x, y, dotSize, dotSize);
    // Occasional bright megalopolis clusters.
    if (cluster > 0.97) {
      for (let j = 0; j < 6; j++) {
        const dx = (Math.random() - 0.5) * 6;
        const dy = (Math.random() - 0.5) * 6;
        ctx.fillStyle = `hsla(${hue + 10}, 80%, 70%, ${brightness * 0.7})`;
        ctx.fillRect(x + dx, y + dy, 1, 1);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

function buildCloudsTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, W, H);
    for (let j = 0; j < 90; j++) {
      const u = Math.random();
      const v = Math.random();
      const r = 6 + Math.random() * 14;
      const a = 0.3 + Math.random() * 0.5;
      const g = ctx.createRadialGradient(u * W, v * H, 0, u * W, v * H, r);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(u * W - r, v * H - r, r * 2, r * 2);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const EARTH_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  varying vec3 vView;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const EARTH_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  varying vec3 vView;
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform vec3 uSunDir;
  uniform vec3 uAtmoColor;

  void main() {
    float sunFacing = dot(normalize(vWorldNormal), normalize(uSunDir));
    float dayFactor = smoothstep(-0.12, 0.22, sunFacing);

    vec3 day = texture2D(uDay, vUv).rgb;
    vec3 night = texture2D(uNight, vUv).rgb * 2.5; // boost city lights
    vec3 ambient = vec3(0.015, 0.025, 0.05);
    vec3 col = mix(night + ambient, day * (0.85 + 0.15 * max(0.0, sunFacing)), dayFactor);

    // Atmosphere fresnel rim.
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 3.0);
    col += uAtmoColor * rim * 0.6;

    gl_FragColor = vec4(col, 1.0);
  }
`;

function buildEarthMaterial(
  dayTex: THREE.CanvasTexture,
  nightTex: THREE.CanvasTexture,
  atmoColor: number,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: EARTH_VERT,
    fragmentShader: EARTH_FRAG,
    uniforms: {
      uDay: { value: dayTex },
      uNight: { value: nightTex },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uAtmoColor: { value: new THREE.Color(atmoColor) },
    },
  });
}

// ============================================================================
// Twinkling Starfield — per-star brightness, color, phase, frequency.
// ============================================================================

const STAR_VERT = /* glsl */ `
  attribute float aBrightness;
  attribute float aPhase;
  attribute float aFreq;
  attribute vec3 aColor;
  varying float vBrightness;
  varying vec3 vColor;
  uniform float uTime;

  void main() {
    vBrightness = aBrightness;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float twinkle = 0.55 + 0.45 * sin(uTime * aFreq + aPhase);
    gl_PointSize = (1.6 + 2.8 * aBrightness) * twinkle * (260.0 / -mv.z);
  }
`;

const STAR_FRAG = /* glsl */ `
  precision highp float;
  varying float vBrightness;
  varying vec3 vColor;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float halo = 1.0 - smoothstep(0.0, 0.5, d);
    float core = 1.0 - smoothstep(0.0, 0.18, d);
    float a = (halo * 0.6 + core * 0.8) * vBrightness;
    gl_FragColor = vec4(vColor * (halo + core), a);
  }
`;

interface StarLayer {
  points: THREE.Points;
  material: THREE.ShaderMaterial;
}

function buildTwinklingStars(count: number): StarLayer {
  const positions = new Float32Array(count * 3);
  const brightness = new Float32Array(count);
  const phase = new Float32Array(count);
  const freq = new Float32Array(count);
  const colors = new Float32Array(count * 3);

  // Stellar classification tints (O/B blue-white -> M red).
  const palette = [
    new THREE.Color(0.95, 0.96, 1.0),
    new THREE.Color(1.0, 1.0, 1.0),
    new THREE.Color(1.0, 0.97, 0.85),
    new THREE.Color(1.0, 0.92, 0.7),
    new THREE.Color(1.0, 0.78, 0.55),
    new THREE.Color(1.0, 0.62, 0.45),
  ];

  for (let i = 0; i < count; i++) {
    const r = 60 + Math.random() * 60;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

    brightness[i] = 0.3 + Math.random() * 0.7;
    phase[i] = Math.random() * Math.PI * 2;
    freq[i] = 0.4 + Math.random() * 2.2;

    const roll = Math.random();
    let idx: number;
    if (roll < 0.1) idx = 0;
    else if (roll < 0.3) idx = 1;
    else if (roll < 0.5) idx = 2;
    else if (roll < 0.75) idx = 3;
    else if (roll < 0.92) idx = 4;
    else idx = 5;
    const c = palette[idx];
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aBrightness', new THREE.BufferAttribute(brightness, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aFreq', new THREE.BufferAttribute(freq, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, material: mat };
}

// ============================================================================
// Comet Particle Tail — anti-sunward stream, solar-wind-pressure scaling
// ============================================================================

const TAIL_VERT = /* glsl */ `
  attribute float aLife;
  attribute float aSize;
  varying float vLife;

  void main() {
    vLife = aLife;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float lifeAlpha = clamp(aLife, 0.0, 1.0);
    gl_PointSize = aSize * lifeAlpha * (260.0 / -mv.z);
  }
`;

const TAIL_FRAG = /* glsl */ `
  precision highp float;
  varying float vLife;
  uniform vec3 uColor;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float halo = 1.0 - smoothstep(0.0, 0.5, d);
    float core = 1.0 - smoothstep(0.0, 0.2, d);
    float a = (halo * 0.5 + core * 0.7) * clamp(vLife, 0.0, 1.0);
    gl_FragColor = vec4(uColor * (halo + core * 0.5), a);
  }
`;

interface CometTail {
  points: THREE.Points;
  material: THREE.ShaderMaterial;
  positions: Float32Array;
  velocities: Float32Array;
  life: Float32Array;
  size: Float32Array;
  capacity: number;
  cursor: number;
  spawnAccum: number;
  posAttr: THREE.BufferAttribute;
  lifeAttr: THREE.BufferAttribute;
}

function buildCometTail(capacity: number, color: number): CometTail {
  const positions = new Float32Array(capacity * 3);
  const velocities = new Float32Array(capacity * 3);
  const life = new Float32Array(capacity);
  const size = new Float32Array(capacity);
  for (let i = 0; i < capacity; i++) {
    positions[i * 3 + 1] = -9999; // parked
    life[i] = 0;
    size[i] = 0.06 + Math.random() * 0.1;
  }
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  const lifeAttr = new THREE.BufferAttribute(life, 1);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('aLife', lifeAttr);
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: TAIL_VERT,
    fragmentShader: TAIL_FRAG,
    uniforms: { uColor: { value: new THREE.Color(color) } },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return {
    points,
    material: mat,
    positions,
    velocities,
    life,
    size,
    capacity,
    cursor: 0,
    spawnAccum: 0,
    posAttr,
    lifeAttr,
  };
}

function tailSpawn(
  tail: CometTail,
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
): void {
  const i = tail.cursor;
  tail.cursor = (tail.cursor + 1) % tail.capacity;
  tail.positions[i * 3] = x;
  tail.positions[i * 3 + 1] = y;
  tail.positions[i * 3 + 2] = z;
  tail.velocities[i * 3] = vx;
  tail.velocities[i * 3 + 1] = vy;
  tail.velocities[i * 3 + 2] = vz;
  tail.life[i] = 1.0;
}

function tailUpdate(tail: CometTail, dt: number): void {
  for (let i = 0; i < tail.capacity; i++) {
    if (tail.life[i] <= 0) continue;
    tail.life[i] -= dt / 2.0; // ~2s lifetime
    if (tail.life[i] <= 0) {
      tail.positions[i * 3 + 1] = -9999;
      tail.life[i] = 0;
      continue;
    }
    tail.positions[i * 3] += tail.velocities[i * 3] * dt;
    tail.positions[i * 3 + 1] += tail.velocities[i * 3 + 1] * dt;
    tail.positions[i * 3 + 2] += tail.velocities[i * 3 + 2] * dt;
  }
  tail.posAttr.needsUpdate = true;
  tail.lifeAttr.needsUpdate = true;
}

// ============================================================================
// Anamorphic Lens Flare — additive billboard sprite group: core halo,
// horizontal anamorphic streak, radial spikes, chromatic ring.
// ============================================================================

function buildFlareTexture(kind: 'core' | 'streak' | 'spike' | 'ring'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  if (kind === 'streak') {
    c.width = 512;
    c.height = 32;
  } else {
    c.width = 256;
    c.height = 256;
  }
  const ctx = c.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(c);
  ctx.clearRect(0, 0, c.width, c.height);

  if (kind === 'core') {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(220,235,255,0.85)');
    g.addColorStop(0.45, 'rgba(140,180,255,0.35)');
    g.addColorStop(1, 'rgba(80,140,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  } else if (kind === 'streak') {
    const g = ctx.createLinearGradient(0, 16, 512, 16);
    g.addColorStop(0, 'rgba(120,180,255,0)');
    g.addColorStop(0.4, 'rgba(160,210,255,0.3)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.6, 'rgba(160,210,255,0.3)');
    g.addColorStop(1, 'rgba(120,180,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 12, 512, 8);
    const g2 = ctx.createLinearGradient(0, 16, 512, 16);
    g2.addColorStop(0, 'rgba(80,140,255,0)');
    g2.addColorStop(0.5, 'rgba(140,200,255,0.22)');
    g2.addColorStop(1, 'rgba(80,140,255,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 4, 512, 24);
  } else if (kind === 'spike') {
    const g = ctx.createLinearGradient(128, 0, 128, 256);
    g.addColorStop(0, 'rgba(140,200,255,0)');
    g.addColorStop(0.45, 'rgba(200,225,255,0.25)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.55, 'rgba(200,225,255,0.25)');
    g.addColorStop(1, 'rgba(140,200,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(124, 0, 8, 256);
  } else {
    // ring — chromatic thin ring.
    const cx = 128;
    const cy = 128;
    for (let r = 86; r < 100; r++) {
      const t = (r - 86) / 14;
      const hue = (t * 360 + 200) % 360;
      ctx.strokeStyle = `hsla(${hue}, 85%, 60%, ${0.6 - Math.abs(t - 0.5) * 0.8})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface LensFlare {
  group: THREE.Group;
  core: THREE.Sprite;
  streak: THREE.Sprite;
  spikes: THREE.Sprite[];
  ring: THREE.Sprite;
  textures: THREE.CanvasTexture[];
}

function buildLensFlare(): LensFlare {
  const group = new THREE.Group();
  const coreTex = buildFlareTexture('core');
  const streakTex = buildFlareTexture('streak');
  const spikeTex = buildFlareTexture('spike');
  const ringTex = buildFlareTexture('ring');

  const core = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: coreTex,
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    }),
  );
  core.scale.set(2.0, 2.0, 1);
  group.add(core);

  const streak = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: streakTex,
      color: 0xc8e0ff,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    }),
  );
  streak.scale.set(8.0, 0.5, 1);
  group.add(streak);

  const spikes: THREE.Sprite[] = [];
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: spikeTex,
        color: 0xb0d0ff,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      }),
    );
    sp.material.rotation = (i / 6) * Math.PI;
    sp.scale.set(0.18, 4.2, 1);
    spikes.push(sp);
    group.add(sp);
  }

  const ring = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: ringTex,
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    }),
  );
  ring.scale.set(4.5, 4.5, 1);
  group.add(ring);

  return {
    group,
    core,
    streak,
    spikes,
    ring,
    textures: [coreTex, streakTex, spikeTex, ringTex],
  };
}

// ============================================================================
// Main builder
// ============================================================================

export function buildSolar(ctx: BuilderCtx): WorldAPI {
  const { world, labelLayer, shakeCamera } = ctx;
  const grabbables: THREE.Object3D[] = [];
  const orbits = new OrbitSystem();
  const facts = new Map<string, string>();
  const labels: THREE.Sprite[] = [];
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  let hole: BlackHole | null = null;

  // Premium visuals run on medium+ (only the flat-color fallback on low).
  const isHigh = ctx.quality !== 'low';
  const isUltra = ctx.quality === 'ultra';

  // Local textures + animated shader materials we own.
  const localTextures: THREE.Texture[] = [];
  const animatedShaders: THREE.ShaderMaterial[] = [];

  // ===== SUN ===============================================================
  const sunRadius = 0.85;
  let sunMat: THREE.Material;
  if (isHigh) {
    const m = buildSunShaderMaterial();
    animatedShaders.push(m);
    sunMat = m;
  } else {
    const m = new THREE.MeshBasicMaterial({ color: 0xffc766 });
    m.userData.texMap = ctx.planetTex.sun;
    sunMat = m;
  }
  const sun = new THREE.Mesh(new THREE.SphereGeometry(sunRadius, 48, 32), sunMat);
  sun.name = 'Sol';
  sun.userData.grabbable = false;
  world.add(sun);
  grabbables.push(sun);
  facts.set('Sol', 'G2V star · 99.86% of system mass');

  // Corona sprites (kept for all tiers — add visual heft to the star).
  for (const [scale, opacity, color] of [
    [3.2, 0.85, 0xffa64d],
    [5.2, 0.35, 0xff8a3d],
  ] as Array<[number, number, number]>) {
    const corona = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: ctx.glowTex,
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    corona.scale.set(scale, scale, 1);
    sun.add(corona);
  }
  // Fresnel rim glow on the sun.
  sun.add(createFresnelGlow(sunRadius, 0xffff99, 0x000000));

  // Coronal Mass Ejections (high/ultra only).
  if (isHigh) {
    const cmeMat = buildCMEMaterial();
    animatedShaders.push(cmeMat);
    const cme = new THREE.Mesh(new THREE.SphereGeometry(sunRadius * 1.05, 48, 32), cmeMat);
    sun.add(cme);
  }

  // Physically-correct point light at the sun center.
  const sunLight = new THREE.PointLight(0xfff2cc, 3, 50, 1.5);
  sunLight.position.set(0, 0, 0);
  world.add(sunLight);

  // ===== PLANETS ===========================================================
  let earthMesh: THREE.Mesh | null = null;
  let earthMat: THREE.ShaderMaterial | null = null;
  let cloudsMesh: THREE.Mesh | null = null;

  PLANETS.forEach((spec, i) => {
    let mat: THREE.Material;
    let isEarth = false;
    if (spec.texKey === 'earth' && isHigh) {
      // Earth: custom day/night shader with city lights.
      const cityLightsTex = buildCityLightsTexture(ctx.planetTex.earth);
      localTextures.push(cityLightsTex);
      const m = buildEarthMaterial(
        ctx.planetTex.earth,
        cityLightsTex,
        spec.atmosphere ?? 0x4da6ff,
      );
      animatedShaders.push(m);
      earthMat = m;
      mat = m;
      isEarth = true;
    } else {
      const m = new THREE.MeshStandardMaterial({
        color: spec.color,
        emissive: spec.color,
        emissiveIntensity: 0.25,
        roughness: 0.7,
        metalness: 0.05,
      });
      if (spec.texKey) m.userData.texMap = ctx.planetTex[spec.texKey];
      mat = m;
    }
    const planet = new THREE.Mesh(new THREE.SphereGeometry(spec.size, 32, 24), mat);
    planet.name = spec.name;
    planet.userData.orbitBody = true;
    const angle = (i / PLANETS.length) * Math.PI * 2 + 0.6;
    world.add(planet);
    grabbables.push(planet);
    orbits.register(planet, spec.radius, angle, spec.periodDays);
    facts.set(spec.name, spec.facts);

    if (spec.atmosphere !== undefined) {
      planet.add(makeAtmosphere(spec.size, spec.atmosphere));
    }
    planet.add(createFresnelGlow(spec.size, spec.color, 0x000000));

    if (spec.ring) {
      let ring: THREE.Mesh;
      if (isHigh) {
        ring = buildSaturnRings(spec.size * 1.3, spec.size * 2.1);
        animatedShaders.push(ring.material as THREE.ShaderMaterial);
      } else {
        ring = new THREE.Mesh(
          new THREE.RingGeometry(spec.size * 1.3, spec.size * 2.1, 48),
          new THREE.MeshBasicMaterial({
            color: 0xd9c49a,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide,
          }),
        );
        ring.rotation.x = -Math.PI / 2 + 0.25;
      }
      planet.add(ring);
    }

    if (isEarth) {
      earthMesh = planet;
      // Thin cloud shell (slightly larger, slowly rotating, ~35% opacity).
      const cloudsTex = buildCloudsTexture();
      localTextures.push(cloudsTex);
      const cloudsMat = new THREE.MeshStandardMaterial({
        map: cloudsTex,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        roughness: 1,
      });
      cloudsMesh = new THREE.Mesh(
        new THREE.SphereGeometry(spec.size * 1.015, 32, 24),
        cloudsMat,
      );
      planet.add(cloudsMesh);
    }

    // Orbit ring line.
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 96; k++) {
      const a = (k / 96) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * spec.radius, 0, Math.sin(a) * spec.radius));
    }
    world.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x1c4a5e, transparent: true, opacity: 0.6 }),
      ),
    );
    const label = makeLabel(spec.name);
    labelLayer.add(label);
    labels.push(label);
  });

  // Earth's moon (decor, follows Earth).
  const earth = earthMesh ?? orbits.bodies.find((b) => b.name === 'Earth') ?? null;
  const moonMat = new THREE.MeshStandardMaterial({ color: 0xb8b8bc, roughness: 0.95 });
  moonMat.userData.texMap = ctx.planetTex.moon;
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), moonMat);
  world.add(moon);
  let moonAngle = 1.2;

  // Asteroid belt between Mars and Jupiter.
  const belt = new OrbitingDebris(350, 3.55, 4.05, 0.035, 0x8a7a68, 42);
  world.add(belt.mesh);

  // ===== COMET =============================================================
  const cometMat = new THREE.MeshStandardMaterial({ color: 0xcfe8ff, roughness: 0.6 });
  const comet = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), cometMat);
  const cometGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: ctx.glowTex,
      color: 0x9fd8ff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  cometGlow.scale.set(0.9, 0.9, 1);
  comet.add(cometGlow);
  world.add(comet);
  let cometAngle = 0.4;
  const COMET_A = 8.2;
  const COMET_E = 0.68;

  // Comet particle tail (high/ultra only).
  const cometTail = isHigh ? buildCometTail(110, 0xcfe8ff) : null;
  if (cometTail) world.add(cometTail.points);

  // ===== TWINKLING STARS (local layer) =====================================
  let starLayer: StarLayer | null = null;
  if (isHigh) {
    const starCount = isUltra ? 1000 : 700;
    starLayer = buildTwinklingStars(starCount);
    starLayer.points.renderOrder = -1;
    world.add(starLayer.points);
  }

  // ===== LENS FLARE (high/ultra) ===========================================
  let flare: LensFlare | null = null;
  if (isHigh) {
    flare = buildLensFlare();
    for (const t of flare.textures) localTextures.push(t);
    sun.add(flare.group); // sun is at world origin; flare inherits its position
  }

  // ===== BLACK HOLE (decor) ================================================
  hole = buildBlackHole(
    { horizon: 0.85, diskInner: 1.5, diskOuter: 3.1, diskSpeed: 0.7 },
    ctx.glowTex,
  );
  hole.group.position.set(-17, 3.5, -11);
  world.add(hole.group);
  const holeHit = new THREE.Mesh(
    new THREE.SphereGeometry(2.6, 12, 8),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  holeHit.name = 'M87* analogue';
  holeHit.userData.grabbable = false;
  holeHit.position.copy(hole.group.position);
  world.add(holeHit);
  grabbables.push(holeHit);
  facts.set('M87* analogue', 'Supermassive black hole · 6.5B suns (decor, out of reach)');

  const grid = new THREE.GridHelper(26, 40, 0x0e3a4a, 0x0a1c2a);
  grid.position.y = -3;
  world.add(grid);

  // ===== SUN-CRASH KIT (vaporization) ======================================
  const impactFlash = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: ctx.glowTex,
      color: 0xfff2c8,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  impactFlash.visible = false;
  world.add(impactFlash);
  let impactT = 1e9;
  const impactDebris = new ParticlePool(160, 0xffb347, 0.09);
  world.add(impactDebris.points);
  const vaporized = new Map<THREE.Mesh, number>();

  // Camera reference (captured via updatePointer; used by the lens flare).
  let cameraRef: THREE.PerspectiveCamera | null = null;
  const sunToCam = new THREE.Vector3();
  const camForward = new THREE.Vector3();

  return {
    grabbables,
    background: 'nebula',
    view: { distance: 13.5, pitch: 0.42, yaw: 0 },

    update(dt: number, elapsed: number): void {
      orbits.update(dt * TIME_DAYS_PER_SECOND);
      for (const planet of orbits.bodies) planet.rotation.y += dt * 0.4;
      // Sun: the shader self-animates; only spin the fallback texture tier.
      if (!isHigh) sun.rotation.y += dt * 0.05;
      belt.update(dt);
      hole?.update(dt, elapsed);
      impactDebris.update(dt);

      // Advance animated shader times (sun granulation, CME drift, ring shimmer,
      // earth atmo via sun dir, twinkle phase).
      for (const m of animatedShaders) {
        const u = m.uniforms.uTime as { value: number } | undefined;
        if (u) u.value = elapsed;
      }

      // Earth: update sun direction (sun is at world origin).
      if (earthMat && earthMesh) {
        earthMesh.getWorldPosition(tmp);
        tmp2.set(0, 0, 0).sub(tmp).normalize();
        (earthMat.uniforms.uSunDir.value as THREE.Vector3).copy(tmp2);
      }
      // Clouds: slow independent rotation.
      if (cloudsMesh) cloudsMesh.rotation.y += dt * 0.02;

      // Sun-crash vaporization logic (unchanged from original).
      for (const planet of orbits.bodies) {
        const st = orbits.get(planet);
        if (!st) continue;
        const left = vaporized.get(planet);
        if (left !== undefined) {
          const rest = left - dt;
          if (rest <= 0) {
            vaporized.delete(planet);
            st.radius = st.home.radius;
            st.periodDays = st.home.periodDays;
            planet.scale.setScalar(planet.userData.homeScale as number);
          } else {
            vaporized.set(planet, rest);
          }
          continue;
        }
        if (planet.userData.grabbed && st.radius < 1.35) {
          const charge = ((planet.userData.diveT as number | undefined) ?? 0) + dt;
          planet.userData.diveT = charge;
          if (charge >= 0.6) {
            planet.userData.diveT = 0;
            planet.userData.homeScale = planet.scale.x;
            planet.scale.setScalar(0.01);
            planet.getWorldPosition(tmp);
            impactFlash.position.copy(tmp);
            impactFlash.visible = true;
            impactT = 0;
            for (let i = 0; i < 90; i++) {
              const a = Math.random() * Math.PI * 2;
              const sp = 2 + Math.random() * 4;
              impactDebris.spawn(
                tmp.x,
                tmp.y,
                tmp.z,
                Math.cos(a) * sp,
                1 + Math.random() * 2,
                Math.sin(a) * sp,
              );
            }
            shakeCamera(0.5);
            vaporized.set(planet, 4.0);
          }
        } else {
          planet.userData.diveT = 0;
        }
      }
      if (impactT < 1.0) {
        impactT += dt;
        const k = Math.min(1, impactT / 1.0);
        impactFlash.visible = true;
        (impactFlash.material as THREE.SpriteMaterial).opacity = 0.95 * (1 - k);
        const sc = 1.5 + k * 5;
        impactFlash.scale.set(sc, sc, 1);
      } else {
        impactFlash.visible = false;
      }

      // Moon orbit.
      if (earth) {
        moonAngle += ((dt * TIME_DAYS_PER_SECOND * Math.PI * 2) / 27.3) % (Math.PI * 2);
        moon.position.set(
          earth.position.x + Math.cos(moonAngle) * 0.34,
          Math.sin(moonAngle * 2) * 0.05,
          earth.position.z + Math.sin(moonAngle) * 0.34,
        );
      }

      // Comet orbit + tail.
      const r = (COMET_A * (1 - COMET_E * COMET_E)) / (1 + COMET_E * Math.cos(cometAngle));
      cometAngle += (dt * 2.6) / (r * r);
      comet.position.set(
        Math.cos(cometAngle) * r,
        0.4 * Math.sin(cometAngle * 2),
        Math.sin(cometAngle) * r,
      );
      const tailBoost = THREE.MathUtils.clamp(2.2 - r * 0.22, 0.5, 1.6);
      cometGlow.scale.set(0.9 * tailBoost, 0.9 * tailBoost, 1);

      if (cometTail) {
        comet.getWorldPosition(tmp); // comet world position
        const cometR = tmp.length();
        // Solar-wind pressure: spawn rate scales with proximity to the sun.
        const spawnRate = THREE.MathUtils.clamp(60 - cometR * 5, 12, 60);
        cometTail.spawnAccum += dt * spawnRate;
        const toSpawn = Math.floor(cometTail.spawnAccum);
        cometTail.spawnAccum -= toSpawn;
        // Anti-sunward direction (away from origin).
        tmp2.copy(tmp).normalize();
        // Tail length factor: closer to sun = longer tail.
        const tailLen = THREE.MathUtils.clamp(2.5 - cometR * 0.18, 0.4, 2.2);
        for (let i = 0; i < toSpawn; i++) {
          const spread = 0.05;
          const px = tmp.x + (Math.random() - 0.5) * spread;
          const py = tmp.y + (Math.random() - 0.5) * spread;
          const pz = tmp.z + (Math.random() - 0.5) * spread;
          const baseSpeed = 0.4 + tailLen * 0.6;
          const vx = tmp2.x * baseSpeed + (Math.random() - 0.5) * 0.2;
          const vy = tmp2.y * baseSpeed + (Math.random() - 0.5) * 0.2 + 0.05;
          const vz = tmp2.z * baseSpeed + (Math.random() - 0.5) * 0.2;
          tailSpawn(cometTail, px, py, pz, vx, vy, vz);
        }
        tailUpdate(cometTail, dt);
      }

      // Lens flare: billboard is automatic (sprites face camera). Scale by
      // distance + view-centeredness; hide when sun is behind the camera.
      if (flare && cameraRef) {
        sun.getWorldPosition(tmp);
        sunToCam.copy(cameraRef.position).sub(tmp);
        const dist = sunToCam.length();
        cameraRef.getWorldDirection(camForward);
        const centered = THREE.MathUtils.clamp(camForward.dot(sunToCam) / Math.max(0.0001, dist), 0, 1);
        const inFront = camForward.dot(sunToCam) > 0;
        const show = inFront && dist < 60;
        flare.group.visible = show;
        if (show) {
          // Closer + more centered = larger flare.
          const distScale = THREE.MathUtils.clamp(20 / Math.max(1, dist), 0.4, 2.2);
          const centerScale = 0.55 + 0.7 * centered;
          const scale = distScale * centerScale;
          flare.core.scale.set(2.0 * scale, 2.0 * scale, 1);
          flare.streak.scale.set(8.0 * scale, 0.5 * scale, 1);
          flare.ring.scale.set(4.5 * scale, 4.5 * scale, 1);
          for (const sp of flare.spikes) sp.scale.set(0.18 * scale, 4.2 * scale, 1);
        }
      } else if (flare && !cameraRef) {
        // No pointer yet: keep flare visible at a default scale.
        flare.group.visible = true;
      }

      // Labels (existing logic — radial offset for inner planets, lift for outer).
      for (let i = 0; i < orbits.bodies.length; i++) {
        const body = orbits.bodies[i];
        body.getWorldPosition(tmp);
        const size = (body.geometry as THREE.SphereGeometry).parameters.radius;
        const distFromSun = Math.hypot(tmp.x, tmp.z);
        const mat = labels[i].material as THREE.SpriteMaterial;
        if (distFromSun < 4) {
          const dirX = distFromSun > 0.01 ? tmp.x / distFromSun : 0;
          const dirZ = distFromSun > 0.01 ? tmp.z / distFromSun : 0;
          const offset = 1.1 + Math.max(0, 3.2 - distFromSun) * 0.45;
          const yStagger = (i % 3) * 0.55;
          labels[i].position.set(
            tmp.x + dirX * offset,
            tmp.y + size + 0.4 + yStagger,
            tmp.z + dirZ * offset,
          );
          mat.opacity = THREE.MathUtils.clamp((distFromSun - 1.0) / 1.8, 0.12, 1);
        } else {
          const lift = size > 0.6 ? size + 0.6 : size + 0.4;
          labels[i].position.set(tmp.x, tmp.y + lift, tmp.z);
          mat.opacity = 1;
        }
      }
    },

    // Captures the camera reference (called every frame by the interaction
    // loop via PrismScene.trackPointer). Used only for the lens flare.
    updatePointer(_ndcX: number, _ndcY: number, camera: THREE.PerspectiveCamera): void {
      cameraRef = camera;
    },

    setOrbitFromPoint(mesh: THREE.Mesh, localPoint: THREE.Vector3): void {
      orbits.setFromPoint(mesh, localPoint, MIN_ORBIT_RADIUS, MAX_ORBIT_RADIUS);
    },

    bodyInfo(name: string | null): string | null {
      if (!name) return null;
      const f = facts.get(name);
      if (!f) return null;
      const body = orbits.bodies.find((b) => b.name === name);
      if (body) {
        if (vaporized.has(body)) {
          const left = vaporized.get(body) ?? 0;
          return `${name} — vaporized in the sun! Reforming in ${left.toFixed(1)} s…`;
        }
        const s = orbits.get(body);
        if (s) return `${name} — ${f} · r ${s.radius.toFixed(2)} · year ${s.periodDays.toFixed(0)} d`;
      }
      return `${name} — ${f}`;
    },

    dispose(): void {
      for (const t of localTextures) t.dispose();
      disposeGroup(world);
      disposeGroup(labelLayer);
    },
  };
}
