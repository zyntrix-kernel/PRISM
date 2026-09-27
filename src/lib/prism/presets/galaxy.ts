// GALAXY: Procedural barred-spiral galaxy for the Singularity cinematic.
// EXACT recreation of the ggwzrd/threejs-galaxy (MIT) look:
// - 3 spiral arms (branches)
// - Warm orange-red core (#ff6030) → cool deep blue edges (#1b3984)
// - Soft circular points via pow(1 - dist, 3.0) fragment shader
// - Per-particle aScale attribute for size variation
// - Differential rotation in the vertex shader (inner particles spin faster)
// - Powered randomness (randomnessPower = 3) so particles hug the arms
// - Linear spin (spinAngle = radius * spin), not logarithmic
//
// Attribution: https://github.com/ggwzrd/threejs-galaxy (MIT)

import * as THREE from 'three';

// ── Parameters matching ggwzrd/threejs-galaxy ────────────────────────────
const GALAXY_PARAMS = {
  branches: 3,            // 3 spiral arms (ggwzrd default)
  radius: 5,               // galaxy radius in local space
  spin: 1,                 // arm winding (linear: spinAngle = radius * spin)
  randomness: 0.2,         // base scatter amount
  randomnessPower: 3,      // concentrate particles toward arms (pow exponent)
  insideColor: 0xff6030,   // warm orange-red core
  outsideColor: 0x1b3984,  // cool deep blue edges
  uSize: 30,               // global point size multiplier (tuned for the shader)
};

// ── Vertex shader: differential rotation + size attenuation ──────────────
const GALAXY_VERT = /* glsl */ `
  attribute float aScale;
  uniform float uSize;
  uniform float uTime;
  varying vec3 vColor;

  void main() {
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);

    // Differential rotation: inner particles spin faster (1/distance).
    // This is the signature ggwzrd animation — the spiral arms visibly wind.
    float angle = atan(modelPosition.x, modelPosition.z);
    float distanceToCenter = length(modelPosition.xz);
    float angleOffset = (1.0 / max(distanceToCenter, 0.1)) * uTime * 0.2;
    angle += angleOffset;
    modelPosition.x = cos(angle) * distanceToCenter;
    modelPosition.z = sin(angle) * distanceToCenter;

    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;
    gl_Position = projectedPosition;

    // Size: per-particle scale × global size × distance attenuation
    gl_PointSize = uSize * aScale;
    gl_PointSize *= (1.0 / max(0.1, -viewPosition.z));

    vColor = color;
  }
`;

// ── Fragment shader: soft circular point with tight bright core ──────────
// pow(strength, 3.0) gives the signature ggwzrd look: a tight bright dot
// with a soft glowing halo around it (NOT a flat disc).
const GALAXY_FRAG = /* glsl */ `
  varying vec3 vColor;
  uniform float uOpacity;

  void main() {
    // Distance from the center of the point sprite (0.5 = center)
    float strength = distance(gl_PointCoord, vec2(0.5));
    strength = 1.0 - strength;
    // pow(3.0) = tight bright core, soft falloff. This is what makes the
    // galaxy glow instead of looking like flat squares.
    strength = pow(strength, 3.0);

    vec3 color = mix(vec3(0.0), vColor, strength);
    gl_FragColor = vec4(color, strength * uOpacity);
  }
`;

/** Build a soft radial glow sprite texture for the galactic core glow. */
function makeGlowTexture(inner: string, outer: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
    g.addColorStop(0, inner);
    g.addColorStop(0.4, inner.replace(',1)', ',0.4)'));
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildGalaxy(quality: string): THREE.Points {
  // Particle counts — high enough for the dense "glowing band" look.
  // ggwzrd uses 100k; we scale by quality.
  const count = quality === 'ultra' ? 100_000 : quality === 'high' ? 50_000 : 20_000;

  const { branches, radius, spin, randomness, randomnessPower, insideColor, outsideColor, uSize } = GALAXY_PARAMS;

  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const scales = new Float32Array(count); // per-particle size variation (ggwzrd aScale)

  const inside = new THREE.Color(insideColor);
  const outside = new THREE.Color(outsideColor);

  for (let i = 0; i < count; i++) {
    // ── Distance from center: UNIFORM (not power-biased) — ggwzrd uses Math.random() * radius ──
    const r = Math.random() * radius;

    // ── Branch angle: which of the N arms this particle belongs to ──
    const branchAngle = ((i % branches) / branches) * Math.PI * 2;

    // ── Spin: LINEAR (spinAngle = radius * spin) — NOT logarithmic ──
    const spinAngle = r * spin;

    // ── Randomness: POWERED so particles hug the arm (pow = concentrated) ──
    // Most particles land close to the arm; few become halo stars.
    // The sign is random (+/-), and the amount scales with radius.
    const randomX = Math.pow(Math.random(), randomnessPower)
      * (Math.random() < 0.5 ? 1 : -1) * randomness * r;
    const randomY = Math.pow(Math.random(), randomnessPower)
      * (Math.random() < 0.5 ? 1 : -1) * randomness * r;
    const randomZ = Math.pow(Math.random(), randomnessPower)
      * (Math.random() < 0.5 ? 1 : -1) * randomness * r;

    // Position: arm center + spin, then scatter
    positions[i * 3] = Math.cos(branchAngle + spinAngle) * r + randomX;
    positions[i * 3 + 1] = randomY;
    positions[i * 3 + 2] = Math.sin(branchAngle + spinAngle) * r + randomZ;

    // ── Color: warm interior → cool exterior (ggwzrd signature) ──
    const mixed = inside.clone();
    mixed.lerp(outside, r / radius);
    colors[i * 3] = mixed.r;
    colors[i * 3 + 1] = mixed.g;
    colors[i * 3 + 2] = mixed.b;

    // ── Per-particle scale: random 0..1 (ggwzrd aScale) ──
    scales[i] = Math.random();
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: uSize },
      uTime: { value: 0 },
      uOpacity: { value: 1 },
    },
    vertexShader: GALAXY_VERT,
    fragmentShader: GALAXY_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true,
  });

  const galaxy = new THREE.Points(geo, mat);

  // ── Galactic core glow sprites (for distance visibility) ───────────────
  // These additive sprites give the galaxy a luminous core that reads even
  // when fully zoomed out (camera at distance 80). The particles alone use
  // size attenuation, so at extreme distance they become sub-pixel. These
  // glow sprites ensure the galaxy is always visible as a glowing band.
  // They DON'T change the particle look — they're additive overlays.
  const glowTex = makeGlowTexture('rgba(255,180,120,1)', 'rgba(60,40,120,0)');

  // Inner core glow: warm orange (matches the warm insideColor)
  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xff8050, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  coreGlow.scale.set(4, 4, 1);
  coreGlow.position.set(0, 0, 0);
  galaxy.add(coreGlow);

  // Mid halo: warm-to-cool blend
  const haloGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xaa6688, transparent: true, opacity: 0.4,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  haloGlow.scale.set(12, 12, 1);
  haloGlow.position.set(0, 0, 0);
  galaxy.add(haloGlow);

  // Outer halo: cool blue (matches the cool outsideColor) — wide + faint,
  // makes the galaxy visible as a hazy band at extreme distance
  const outerHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0x2a4a8a, transparent: true, opacity: 0.25,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  outerHalo.scale.set(30, 30, 1);
  outerHalo.position.set(0, 0, 0);
  galaxy.add(outerHalo);

  return galaxy;
}
