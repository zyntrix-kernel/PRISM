// GALAXY: Procedural barred-spiral galaxy for the Singularity cinematic.
// Uses logarithmic spiral arms with differential rotation (inner particles
// rotate faster). Spiral structure inspired by ggwzrd/threejs-galaxy (MIT).
// Attribution: https://github.com/ggwzrd/threejs-galaxy

import * as THREE from 'three';

/** Build a soft radial glow sprite texture for the galactic core. */
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

/** Build a diffuse disc texture for the galactic dust cloud (Milky Way band).
 *  This is what makes the galaxy read as a glowing band at distance instead
 *  of a bunch of dimmed points. The texture is a soft radial gradient with
 *  a brighter bulge at the center. */
function makeDustTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    // Base: transparent
    ctx.clearRect(0, 0, 256, 256);
    // Radial gradient: bright core → soft disk → faint halo
    const g = ctx.createRadialGradient(128, 128, 4, 128, 128, 128);
    g.addColorStop(0, 'rgba(220, 230, 255, 0.85)');
    g.addColorStop(0.12, 'rgba(180, 200, 255, 0.55)');
    g.addColorStop(0.3, 'rgba(140, 160, 230, 0.3)');
    g.addColorStop(0.55, 'rgba(110, 120, 200, 0.15)');
    g.addColorStop(0.8, 'rgba(90, 80, 160, 0.05)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildGalaxy(quality: string): THREE.Points {
  const count = quality === 'ultra' ? 60_000 : quality === 'high' ? 25_000 : 8_000;
  const arms = 4; // number of spiral arms
  const armSpread = 0.5; // how wide each arm is
  const spinFactor = 3.0; // how tightly wound the spiral is

  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    // Distance from center (power distribution: more stars near center)
    const r = Math.pow(Math.random(), 0.6) * 20;

    // Which spiral arm this particle belongs to
    const armIndex = Math.floor(Math.random() * arms);
    const armOffset = (armIndex / arms) * Math.PI * 2;

    // Logarithmic spiral: angle increases with radius
    const spiralAngle = Math.log(r + 1) * spinFactor + armOffset;

    // Random scatter around the arm (thicker near center, thinner at edges)
    const scatter = (Math.random() - 0.5) * armSpread * (1.0 + 3.0 / (r + 1));
    const angle = spiralAngle + scatter;

    // Vertical thickness (galaxy disk is thin, with a bulge at center)
    const yScatter = (Math.random() - 0.5) * (0.3 + 2.0 / (r + 0.5));

    pos[i * 3] = Math.cos(angle) * r;
    pos[i * 3 + 1] = yScatter;
    pos[i * 3 + 2] = Math.sin(angle) * r;

    // Color: hot blue-white core → warm yellow mid → cool red edges.
    // BOOSTED brightness so stars stay visible at distance (was L 0.85/0.7/0.5/0.4).
    const distNorm = r / 20;
    const c = new THREE.Color();
    if (distNorm < 0.2) {
      c.setHSL(0.6, 0.5, 0.95); // blue-white core (brighter)
    } else if (distNorm < 0.5) {
      c.setHSL(0.12, 0.6, 0.85); // yellow-white (brighter)
    } else if (distNorm < 0.8) {
      c.setHSL(0.05, 0.7, 0.65); // orange (brighter)
    } else {
      c.setHSL(0.98, 0.5, 0.55); // red edges (brighter)
    }
    // Add some variation
    c.offsetHSL((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.5) * 0.1);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  // NOTE: sizeAttenuation: false means particles stay a constant SCREEN size
  // regardless of distance. This is the key fix — at camera distance 80 with
  // galaxy scaled 81x, sizeAttenuation particles shrink to sub-pixel and the
  // galaxy vanishes. With sizeAttenuation off, the stars stay visible as a
  // Milky-Way-like band of points at any distance.
  const mat = new THREE.PointsMaterial({
    size: quality === 'ultra' ? 1.4 : quality === 'high' ? 1.8 : 2.2,
    vertexColors: true,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: false, // ← key: stars stay visible at distance
  });

  const galaxy = new THREE.Points(geo, mat);

  // ── Diffuse dust cloud (the Milky Way band) ────────────────────────────
  // A big additive disc with a soft radial gradient. This is what makes the
  // galaxy read as a glowing band at distance — the diffuse glow of
  // unresolved stars + interstellar gas. Without it, at distance the galaxy
  // looks like "a bunch of dimmed particles" (user complaint). With it, the
  // galaxy looks like the Milky Way: a luminous band with embedded stars.
  const dustTex = makeDustTexture();
  const dustDisc = new THREE.Mesh(
    new THREE.CircleGeometry(20, 64),
    new THREE.MeshBasicMaterial({
      map: dustTex,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  // Lay the disc flat in the galaxy's plane (XZ). It will rotate with the galaxy.
  dustDisc.rotation.x = -Math.PI / 2;
  dustDisc.position.set(0, 0, 0);
  galaxy.add(dustDisc);

  // ── Galactic core glow: bright inner sprite + soft outer halo ──────────
  // These additive sprites give the galaxy a luminous core that reads even
  // at distance / during the cinematic zoom-out.
  const glowTex = makeGlowTexture('rgba(220,230,255,1)', 'rgba(120,150,255,0)');
  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xdde6ff, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  coreGlow.scale.set(6, 6, 1);
  coreGlow.position.set(0, 0, 0);
  galaxy.add(coreGlow);

  const haloGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0x8899ff, transparent: true, opacity: 0.4,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  haloGlow.scale.set(20, 20, 1);
  haloGlow.position.set(0, 0, 0);
  galaxy.add(haloGlow);

  // Outer faint halo — a wide soft glow that makes the galaxy visible as a
  // hazy band even when fully zoomed out (camera at distance 80).
  const outerHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0x6677aa, transparent: true, opacity: 0.2,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  outerHalo.scale.set(40, 40, 1);
  outerHalo.position.set(0, 0, 0);
  galaxy.add(outerHalo);

  return galaxy;
}
