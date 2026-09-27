// GALAXY: Procedural barred-spiral galaxy for the Singularity cinematic.
// EXACT recreation of the ggwzrd/threejs-galaxy (MIT) look, boosted for GLOW:
// - 3 spiral arms (branches) with differential rotation (ggwzrd vertex shader)
// - Warm bright core (#ff7040) → vibrant cool blue edges (#2a4a9a)
// - Soft circular points via pow(1 - dist, 2.5) fragment shader + 1.3× brightness
// - 5 additive glow sprites (ultra-halo → bulge) for distance visibility
// - Procedural diffuse dust disc (Milky Way band look)
// - Subtle core pulse synced to uTime — "living galaxy" feel
// - Per-particle aScale attribute for size variation
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
  insideColor: 0xff7040,   // warm bright orange-red core (boosted)
  outsideColor: 0x2a4a9a,  // vibrant cool blue edges (boosted)
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

// ── Fragment shader: soft circular point with a wider glowing halo ──────
// pow(strength, 2.5) widens the glow slightly so each point contributes more
// visible luminosity (was 3.0 in the strict ggwzrd look — too tight for the
// luminous "Milky Way band" target). A 1.3× brightness multiplier on top of
// that pushes the additive blending into true glow territory.
const GALAXY_FRAG = /* glsl */ `
  varying vec3 vColor;
  uniform float uOpacity;

  void main() {
    // Distance from the center of the point sprite (0.5 = center)
    float strength = distance(gl_PointCoord, vec2(0.5));
    strength = 1.0 - strength;
    // pow(2.5) = bright core with a slightly wider soft halo than the original
    // pow(3.0). This is what makes the galaxy glow instead of looking like
    // flat squares, and gives more per-particle glow contribution.
    strength = pow(strength, 2.5);

    // 1.3× brightness boost: drives additive blending harder so overlapping
    // particles sum into a luminous band rather than a sparse scatter.
    vec3 color = mix(vec3(0.0), vColor, strength) * 1.3;
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

/**
 * Build a procedural diffuse "dust disc" texture — the Milky Way band look.
 * 256×256 radial gradient with multiple color stops:
 *   bright warm core → warm halo → soft blue mid → faint purple → transparent.
 * Mapped onto a flat CircleGeometry laid in the XZ plane, additive-blended,
 * this produces the diffuse hazy band of light that real galaxies have and
 * that particle-only renderings lack.
 */
function makeDustTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0.0, 'rgba(255,200,140,0.95)'); // bright warm core
    g.addColorStop(0.12, 'rgba(255,160,100,0.70)'); // warm halo
    g.addColorStop(0.30, 'rgba(180,150,210,0.40)'); // soft purple-blue mid
    g.addColorStop(0.55, 'rgba(120,140,210,0.22)'); // cool blue mid
    g.addColorStop(0.80, 'rgba(80,60,150,0.10)');    // faint purple halo
    g.addColorStop(1.0, 'rgba(30,20,60,0.0)');       // transparent edge
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
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

  // Bright central bulge: very small, very bright white-yellow sprite at the
  // exact center. Represents the dense core of old stars (galactic bulge).
  // Rendered first so the warmer halo sprites layer on top of it.
  const bulgeGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffeecc, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  bulgeGlow.scale.set(2.5, 2.5, 1);
  bulgeGlow.position.set(0, 0, 0);
  galaxy.add(bulgeGlow);

  // Inner core glow: warm orange (matches the warm insideColor). Subtly
  // pulses via onBeforeRender below for a "living galaxy" feel.
  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xff8050, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  coreGlow.scale.set(4, 4, 1);
  coreGlow.position.set(0, 0, 0);
  galaxy.add(coreGlow);

  // Subtle core pulse synced to the differential-rotation uTime uniform —
  // opacity 0.85 ± 0.1 breathing. Reads uTime from the parent Points' shader
  // material (driven by singularity.ts) so the pulse pauses when the galaxy
  // is hidden and stays in sync with the spiral winding.
  const coreGlowMat = coreGlow.material as THREE.SpriteMaterial;
  coreGlow.onBeforeRender = () => {
    const gMat = galaxy.material as THREE.ShaderMaterial;
    const t = (gMat.uniforms.uTime.value as number) ?? 0;
    coreGlowMat.opacity = 0.85 + Math.sin(t * 1.5) * 0.1;
  };

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

  // Ultra-wide faint glow: extremely large, very low-opacity cool blue halo.
  // This is what makes the galaxy read as a hazy smudge even when the camera
  // is at maximum distance (Act 4 in singularity.ts, dist ≈ 80). Without it,
  // the outerHalo alone isn't wide enough to bridge the gap between the
  // visible spiral arms and the empty space around it.
  const ultraGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0x3a5aaa, transparent: true, opacity: 0.1,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  ultraGlow.scale.set(60, 60, 1);
  ultraGlow.position.set(0, 0, 0);
  galaxy.add(ultraGlow);

  // ── Diffuse dust disc (the Milky Way band look) ────────────────────────
  // A flat disc in the XZ plane with a multi-stop radial gradient: warm
  // bright core → cool blue mid → faint purple halo → transparent. Additive
  // blending + depthWrite:false means it just brightens whatever is behind
  // it, producing the diffuse hazy "band of light" that real galaxies have
  // (and that point-sprite galaxies lack — they look too pointillistic).
  // Radius = galaxy radius × 1.5 so the disc extends past the spiral arms.
  const dustTex = makeDustTexture();
  const dustGeo = new THREE.CircleGeometry(radius * 1.5, 64);
  const dustMat = new THREE.MeshBasicMaterial({
    map: dustTex,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const dustDisc = new THREE.Mesh(dustGeo, dustMat);
  dustDisc.rotation.x = -Math.PI / 2; // lay flat in the XZ plane
  dustDisc.position.set(0, 0, 0);
  galaxy.add(dustDisc);

  return galaxy;
}
