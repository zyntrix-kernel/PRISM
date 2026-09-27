// GUN GAME preset: a premium arcade shooting range controlled by pointing + pinching.
// Procedural gunmetal pistol with slide-recoil animation, multi-layer muzzle flash
// (core + halo + sparks + point light + smoke), shattering bullseye targets with
// gravity-driven fragments, shockwave + score-popup FX, neon-lit volumetric range,
// bullet tracers, and a hover-reactive 3D crosshair.

import * as THREE from 'three';
import { disposeGroup, type BuilderCtx, type WorldAPI } from './types';

// ── Procedural texture helpers ──────────────────────────────────────

function makeGridTexture(): THREE.Texture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#070a14';
  c.fillRect(0, 0, size, size);
  // Minor grid lines
  c.strokeStyle = '#172a4a';
  c.lineWidth = 1;
  const step = size / 16;
  for (let i = 0; i <= 16; i++) {
    const p = i * step;
    c.beginPath(); c.moveTo(p, 0); c.lineTo(p, size); c.stroke();
    c.beginPath(); c.moveTo(0, p); c.lineTo(size, p); c.stroke();
  }
  // Major grid (every 4) — brighter accent
  c.strokeStyle = '#2a5599';
  c.lineWidth = 2;
  for (let i = 0; i <= 16; i += 4) {
    const p = i * step;
    c.beginPath(); c.moveTo(p, 0); c.lineTo(p, size); c.stroke();
    c.beginPath(); c.moveTo(0, p); c.lineTo(size, p); c.stroke();
  }
  // Glowing intersection dots
  c.fillStyle = '#5da8ff';
  for (let i = 0; i <= 16; i += 4) {
    for (let j = 0; j <= 16; j += 4) {
      c.beginPath();
      c.arc(i * step, j * step, 1.8, 0, Math.PI * 2);
      c.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.anisotropy = 4;
  return tex;
}

function makeBullseyeTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d')!;
  c.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;
  // Concentric rings: red outer, white mid, red center, dark bullseye dot
  const rings: Array<[number, string]> = [
    [1.00, '#c1272d'],
    [0.78, '#f4f4f6'],
    [0.56, '#c1272d'],
    [0.34, '#f4f4f6'],
    [0.16, '#c1272d'],
    [0.06, '#1a1a1e'],
  ];
  for (const [r, col] of rings) {
    c.fillStyle = col;
    c.beginPath();
    c.arc(cx, cy, r * size / 2, 0, Math.PI * 2);
    c.fill();
  }
  // Subtle ring separators
  c.strokeStyle = 'rgba(0,0,0,0.28)';
  c.lineWidth = 1;
  for (const r of [0.78, 0.56, 0.34, 0.16]) {
    c.beginPath();
    c.arc(cx, cy, r * size / 2, 0, Math.PI * 2);
    c.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

function makeVignetteTexture(): THREE.Texture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d')!;
  const cx = size / 2, cy = size / 2;
  const grad = c.createRadialGradient(cx, cy, size * 0.2, cx, cy, size * 0.72);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0)');
  grad.addColorStop(0.85, 'rgba(2,4,12,0.55)');
  grad.addColorStop(1, 'rgba(2,4,12,0.92)');
  c.fillStyle = grad;
  c.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function makeTextSprite(
  text: string,
  color: string,
  fontPx = 72,
  w = 256,
  h = 128,
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const c = canvas.getContext('2d')!;
  c.clearRect(0, 0, w, h);
  c.font = `900 ${fontPx}px system-ui, -apple-system, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  // Outer glow
  c.shadowColor = color;
  c.shadowBlur = 24;
  c.fillStyle = color;
  c.fillText(text, w / 2, h / 2);
  c.shadowBlur = 12;
  c.fillText(text, w / 2, h / 2);
  // Crisp white core
  c.shadowBlur = 0;
  c.fillStyle = '#ffffff';
  c.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, depthTest: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 50;
  return sprite;
}

function disposeSprite(s: THREE.Sprite): void {
  const m = s.material as THREE.SpriteMaterial;
  if (m.map) m.map.dispose();
  m.dispose();
}

// ── Types ───────────────────────────────────────────────────────────

interface Target {
  group: THREE.Group;
  alive: boolean;
  spawnAt: number;
  lifetime: number;
  hit: boolean;
  shatterT: number;
  expiring: number;
  fragments: THREE.Mesh[];
  fragVel: THREE.Vector3[];
  fragAng: THREE.Vector3[];
  baseColor: THREE.Color;
}

interface ScorePopup {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface SmokePuff {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  baseScale: number;
}

interface Shockwave {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

interface ImpactFlash {
  sprite: THREE.Sprite;
  life: number;
  maxLife: number;
}

const TARGET_COUNT = 6;
const RANGE = 9;
const SPREAD = 6;
const FRAGMENTS_PER_TARGET = 8;
const SMOKE_COUNT = 8;
const SPARK_COUNT = 7;
const HAZE_COUNT_MED = 60;

export function buildGunGame(ctx: BuilderCtx): WorldAPI {
  const { world, glowTex, shakeCamera, quality } = ctx;
  const grabbables: THREE.Object3D[] = [];
  const isHighTier = quality === 'high' || quality === 'ultra';
  const isMediumPlus = quality !== 'low';
  let disposed = false;

  // ══ ENVIRONMENT ════════════════════════════════════════════════════

  // Vignette sphere — encloses the scene, dark at the edges (fake volumetric
  // fog + scope-vignette feel). The scene's own THREE.Fog (20..70) handles
  // far-distance fade; this adds a uniform periphery darkening.
  const vignette = new THREE.Mesh(
    new THREE.SphereGeometry(50, 32, 16),
    new THREE.MeshBasicMaterial({
      map: makeVignetteTexture(),
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      fog: false,
    }),
  );
  vignette.renderOrder = -10;
  world.add(vignette);

  // Floor with procedural grid texture
  const gridTex = makeGridTexture();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(SPREAD * 2 + 14, RANGE + 10),
    new THREE.MeshStandardMaterial({
      map: gridTex,
      color: 0x6a8aff,
      emissive: 0x1a2a55,
      emissiveIntensity: 0.35,
      roughness: 0.55,
      metalness: 0.4,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -SPREAD - 0.5, -RANGE / 2 + 1);
  world.add(floor);

  // Backstop wall behind targets
  const backstop = new THREE.Mesh(
    new THREE.PlaneGeometry(SPREAD * 2 + 6, SPREAD * 2 + 4),
    new THREE.MeshStandardMaterial({
      color: 0x0c0e16, roughness: 0.95, metalness: 0.1,
    }),
  );
  backstop.position.set(0, 0, -RANGE - 0.5);
  world.add(backstop);

  // Neon strip lights on the backstop (visual accent)
  const stripGeo = new THREE.PlaneGeometry(SPREAD * 2 + 4, 0.08);
  const stripTop = new THREE.Mesh(
    stripGeo,
    new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.75, fog: false }),
  );
  stripTop.position.set(0, SPREAD + 0.3, -RANGE - 0.48);
  world.add(stripTop);
  const stripBot = new THREE.Mesh(
    stripGeo,
    new THREE.MeshBasicMaterial({ color: 0xff3a8c, transparent: true, opacity: 0.75, fog: false }),
  );
  stripBot.position.set(0, -SPREAD - 0.3, -RANGE - 0.48);
  world.add(stripBot);

  // Distant ambient silhouettes (out-of-range target ghosts — atmosphere)
  const silhouettes: THREE.Group[] = [];
  for (let i = 0; i < 5; i++) {
    const sil = new THREE.Group();
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 0.8, 4, 8),
      new THREE.MeshStandardMaterial({
        color: 0x0a0d18,
        emissive: 0x0a0d18,
        emissiveIntensity: 0.1,
        transparent: true,
        opacity: 0.6,
        roughness: 0.9,
      }),
    );
    sil.add(torso);
    sil.position.set(
      (Math.random() - 0.5) * 14,
      -0.5 + Math.random() * 2.5,
      -RANGE - 4 - Math.random() * 5,
    );
    sil.rotation.y = (Math.random() - 0.5) * 0.5;
    sil.scale.setScalar(0.8 + Math.random() * 0.6);
    world.add(sil);
    silhouettes.push(sil);
  }

  // Atmospheric haze particles (slow drift, additive blue motes)
  const hazeCount = isMediumPlus ? HAZE_COUNT_MED : 0;
  const hazePos = new Float32Array(hazeCount * 3);
  const hazeVel: THREE.Vector3[] = [];
  for (let i = 0; i < hazeCount; i++) {
    hazePos[i * 3] = (Math.random() - 0.5) * 18;
    hazePos[i * 3 + 1] = -SPREAD + Math.random() * (SPREAD * 2 + 2);
    hazePos[i * 3 + 2] = -RANGE + Math.random() * RANGE;
    hazeVel.push(new THREE.Vector3(
      (Math.random() - 0.5) * 0.1,
      Math.random() * 0.05,
      (Math.random() - 0.5) * 0.1,
    ));
  }
  const hazeGeo = new THREE.BufferGeometry();
  hazeGeo.setAttribute('position', new THREE.BufferAttribute(hazePos, 3));
  const hazeMat = new THREE.PointsMaterial({
    size: 0.18,
    map: glowTex,
    color: 0x6a8aff,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const haze = new THREE.Points(hazeGeo, hazeMat);
  haze.frustumCulled = false;
  if (hazeCount > 0) world.add(haze);

  // ══ LIGHTING ═══════════════════════════════════════════════════════
  const ambient = new THREE.AmbientLight(0x1a2244, 0.7);
  world.add(ambient);

  // Key light from above-front (cool white)
  const keyLight = new THREE.DirectionalLight(0xddeeff, 0.95);
  keyLight.position.set(2, 6, 5);
  world.add(keyLight);

  // Fill light from the side (warm amber)
  const fillLight = new THREE.DirectionalLight(0xff8a5a, 0.4);
  fillLight.position.set(-4, 1, 2);
  world.add(fillLight);

  // Neon strip lights (colored point lights flanking the range)
  const neonCyan = new THREE.PointLight(0x22d3ee, 1.6, 18, 1.5);
  neonCyan.position.set(-SPREAD - 1, 2, -RANGE + 2);
  world.add(neonCyan);

  const neonMagenta = new THREE.PointLight(0xff3a8c, 1.6, 18, 1.5);
  neonMagenta.position.set(SPREAD + 1, 2, -RANGE + 2);
  world.add(neonMagenta);

  const neonAmber = new THREE.PointLight(0xffaa33, 1.0, 14, 1.6);
  neonAmber.position.set(0, -SPREAD + 1, -RANGE);
  world.add(neonAmber);

  // ══ PISTOL MODEL ════════════════════════════════════════════════════
  // gunGroup     — world-space transform (position, rotation, recoil pitch)
  // pistolGroup  — local pistol geometry, handles idle sway
  // slideGroup   — child of pistolGroup; the reciprocating top slide (kicks back on fire)
  const gunGroup = new THREE.Group();
  const pistolGroup = new THREE.Group();
  gunGroup.add(pistolGroup);

  // PBR materials — gunmetal slide, darker frame, dark textured grip
  const matSlide = new THREE.MeshStandardMaterial({
    color: 0x2a2a2e, roughness: 0.3, metalness: 0.92,
  });
  const matFrame = new THREE.MeshStandardMaterial({
    color: 0x18181c, roughness: 0.45, metalness: 0.78,
  });
  const matGrip = new THREE.MeshStandardMaterial({
    color: 0x0e0e12, roughness: 0.78, metalness: 0.4,
  });
  const matAccent = new THREE.MeshStandardMaterial({
    color: 0x7dd3fc, emissive: 0x7dd3fc, emissiveIntensity: 0.85, roughness: 0.3,
  });
  const matAccentRed = new THREE.MeshStandardMaterial({
    color: 0xff3a8c, emissive: 0xff3a8c, emissiveIntensity: 0.85, roughness: 0.3,
  });

  // Slide group (reciprocates on fire)
  const slideGroup = new THREE.Group();
  const slide = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.17, 0.25), matSlide);
  slide.position.set(0, 0.06, 0);
  slideGroup.add(slide);
  // Bevel strip along the top of the slide (visual detail)
  const slideTop = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.02, 0.18), matFrame);
  slideTop.position.set(0, 0.155, 0);
  slideGroup.add(slideTop);
  // Slide serrations (rear grip pattern)
  for (let i = 0; i < 6; i++) {
    const serr = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.15, 0.27), matFrame);
    serr.position.set(-0.55 + i * 0.035, 0.06, 0);
    slideGroup.add(serr);
  }
  // Front sight (glowing accent post — on top of slide)
  const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.08, 0.04), matAccent);
  frontSight.position.set(0.55, 0.2, 0);
  slideGroup.add(frontSight);
  // Rear sight (notched block + two tritium-style accent posts)
  const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.14), matSlide);
  rearSight.position.set(-0.5, 0.18, 0);
  slideGroup.add(rearSight);
  const rearPost1 = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.04, 0.05), matAccentRed);
  rearPost1.position.set(-0.5, 0.225, 0.05);
  slideGroup.add(rearPost1);
  const rearPost2 = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.04, 0.05), matAccentRed);
  rearPost2.position.set(-0.5, 0.225, -0.05);
  slideGroup.add(rearPost2);
  // Side accent LED strips (cyan glow line along each side of the slide)
  const sideLed1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.008, 0.005), matAccent);
  sideLed1.position.set(0, 0.09, 0.13);
  slideGroup.add(sideLed1);
  const sideLed2 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.008, 0.005), matAccent);
  sideLed2.position.set(0, 0.09, -0.13);
  slideGroup.add(sideLed2);
  pistolGroup.add(slideGroup);

  // Barrel (protrudes from the front of the slide — fixed to frame, not slide)
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.055, 0.42, 24),
    matSlide,
  );
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(0.72, 0.06, 0);
  pistolGroup.add(barrel);

  // Muzzle crown (slight flare at barrel tip)
  const muzzleCrown = new THREE.Mesh(
    new THREE.CylinderGeometry(0.068, 0.055, 0.06, 24),
    matFrame,
  );
  muzzleCrown.rotation.z = Math.PI / 2;
  muzzleCrown.position.set(0.92, 0.06, 0);
  pistolGroup.add(muzzleCrown);

  // Frame (lower receiver)
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.13, 0.22), matFrame);
  frame.position.set(-0.05, -0.06, 0);
  pistolGroup.add(frame);

  // Trigger guard (half-torus)
  const guard = new THREE.Mesh(
    new THREE.TorusGeometry(0.1, 0.024, 10, 20, Math.PI),
    matSlide,
  );
  guard.position.set(-0.1, -0.19, 0);
  guard.rotation.set(Math.PI / 2, 0, 0);
  pistolGroup.add(guard);

  // Trigger (small box inside the guard)
  const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.04), matFrame);
  trigger.position.set(-0.1, -0.15, 0);
  pistolGroup.add(trigger);

  // Grip (angled, tapered, with ribbed texture)
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.24), matGrip);
  grip.position.set(-0.34, -0.44, 0);
  grip.rotation.z = -0.2;
  pistolGroup.add(grip);
  // Grip texture lines (vertical ribbing for a textured-polymer feel)
  for (let i = 0; i < 7; i++) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.012, 0.25), matSlide);
    const yPos = -0.18 - i * 0.065;
    line.position.set(-0.34 - i * 0.013, yPos, 0);
    line.rotation.z = -0.2;
    pistolGroup.add(line);
  }
  // Magwell flare at the grip base
  const magwell = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.26), matFrame);
  magwell.position.set(-0.46, -0.74, 0);
  magwell.rotation.z = -0.2;
  pistolGroup.add(magwell);

  // Muzzle anchor — flash, sparks, smoke, and the muzzle light are parented
  // here so they inherit the pistol's transform and follow the gun.
  const muzzleAnchor = new THREE.Object3D();
  muzzleAnchor.position.set(0.97, 0.06, 0);
  pistolGroup.add(muzzleAnchor);

  // Position the gun in first-person view (just in front of the camera,
  // pointing toward -Z where the targets are).
  const GUN_BASE_POS = new THREE.Vector3(0.5, -0.8, 4.5);
  const GUN_BASE_ROT = new THREE.Euler(-0.15, -Math.PI / 2 - 0.08, 0.03);
  gunGroup.position.copy(GUN_BASE_POS);
  gunGroup.rotation.copy(GUN_BASE_ROT);
  gunGroup.scale.setScalar(1.1);
  world.add(gunGroup);

  // Dedicated key light for the pistol so it stays visible against the dark bg
  const gunLight = new THREE.DirectionalLight(0xaaccff, 0.75);
  gunLight.position.set(0, 2, 6);
  gunLight.target = gunGroup;
  world.add(gunLight);
  world.add(gunLight.target);

  // ══ MUZZLE FLASH SYSTEM (multi-layer) ═══════════════════════════════
  // Layer 1: Bright white-yellow core sprite (1-frame flash)
  const flashCore = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex, color: 0xfff4c2, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false,
    }),
  );
  flashCore.scale.set(0.5, 0.5, 1);
  flashCore.renderOrder = 30;
  muzzleAnchor.add(flashCore);

  // Layer 2: Orange glow halo (fades over ~150ms)
  const flashHalo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex, color: 0xffaa44, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false,
    }),
  );
  flashHalo.scale.set(1.5, 1.5, 1);
  flashHalo.renderOrder = 29;
  muzzleAnchor.add(flashHalo);

  // Layer 3: Radial spark lines (LineSegments shooting outward, fade ~80ms)
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPositions = new Float32Array(SPARK_COUNT * 6); // 2 pts × 3 coords per spark
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
  const sparkMat = new THREE.LineBasicMaterial({
    color: 0xfff2a8, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const sparks = new THREE.LineSegments(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  muzzleAnchor.add(sparks);
  const sparkDirs: THREE.Vector3[] = [];
  const sparkLens: number[] = [];
  for (let i = 0; i < SPARK_COUNT; i++) {
    const angle = (i / SPARK_COUNT) * Math.PI * 2 + Math.random() * 0.2;
    sparkDirs.push(new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0));
    sparkLens.push(0.25 + Math.random() * 0.35);
  }

  // Layer 4: PointLight at the muzzle (flashes 0 → 8 → 0 over ~100ms)
  const muzzleLight = new THREE.PointLight(0xfff2a8, 0, 8, 2);
  muzzleAnchor.add(muzzleLight);

  // Layer 5: Smoke puffs (high/ultra tier only; puff outward + rise, fade ~400ms)
  const smokePuffs: SmokePuff[] = [];
  if (isHighTier) {
    for (let i = 0; i < SMOKE_COUNT; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex, color: 0x9999aa, transparent: true, opacity: 0,
          blending: THREE.NormalBlending, depthWrite: false,
        }),
      );
      s.scale.set(0.18, 0.18, 1);
      s.visible = false;
      muzzleAnchor.add(s);
      smokePuffs.push({
        sprite: s,
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.4,
        baseScale: 0.18,
      });
    }
  }

  // ══ BULLET TRAIL ═══════════════════════════════════════════════════
  // Thin glowing line from muzzle to hit point + a midpoint tracer glow
  // sprite (slightly thicker in the middle, tapered feel).
  const trailGeo = new THREE.BufferGeometry();
  const trailPos = new Float32Array(6);
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const trailMat = new THREE.LineBasicMaterial({
    color: 0xbff7ff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const trail = new THREE.Line(trailGeo, trailMat);
  trail.frustumCulled = false;
  trail.renderOrder = 25;
  world.add(trail);

  const tracerGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex, color: 0xbff7ff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false,
    }),
  );
  tracerGlow.scale.set(0.3, 0.06, 1);
  tracerGlow.renderOrder = 26;
  world.add(tracerGlow);

  // ══ CROSSHAIR (premium 3D, hover-reactive) ══════════════════════════
  const crosshair = new THREE.Group();
  const chMatNormal = new THREE.MeshBasicMaterial({
    color: 0x7dd3fc, transparent: true, opacity: 0.85, depthTest: false, fog: false,
  });
  const chMatHover = new THREE.MeshBasicMaterial({
    color: 0xff3a5c, transparent: true, opacity: 0.95, depthTest: false, fog: false,
  });
  // Center dot (shares one of the materials — swap on hover)
  const chDot = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), chMatNormal);
  chDot.renderOrder = 40;
  crosshair.add(chDot);
  // 4 diagonal tick marks
  const chTicks: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.015, 0.015), chMatNormal);
    tick.renderOrder = 40;
    tick.position.set(Math.cos(angle) * 0.22, Math.sin(angle) * 0.22, 0);
    tick.rotation.z = angle;
    crosshair.add(tick);
    chTicks.push(tick);
  }
  // Outer faint ring
  const chRing = new THREE.Mesh(
    new THREE.RingGeometry(0.13, 0.16, 32),
    new THREE.MeshBasicMaterial({
      color: 0x7dd3fc, transparent: true, opacity: 0.4, depthTest: false, fog: false,
    }),
  );
  chRing.renderOrder = 39;
  crosshair.add(chRing);
  crosshair.position.set(0, 0, -RANGE);
  crosshair.visible = false;
  world.add(crosshair);

  // ══ TARGET SYSTEM (premium bullseye) ════════════════════════════════
  const bullseyeTex = makeBullseyeTexture();
  const targetGeo = new THREE.CircleGeometry(0.45, 32);
  const rimGeo = new THREE.TorusGeometry(0.45, 0.05, 12, 32);
  // Fragment geometry — a pie-slice wedge of the target disc
  const fragGeo = new THREE.CircleGeometry(0.45, 16, 0, Math.PI / 4);

  const targets: Target[] = [];
  function spawnTarget(): void {
    if (disposed) return;
    const group = new THREE.Group();
    // Front disc with the bullseye texture
    const disc = new THREE.Mesh(
      targetGeo,
      new THREE.MeshStandardMaterial({
        map: bullseyeTex,
        emissive: 0xffffff,
        emissiveMap: bullseyeTex,
        emissiveIntensity: 0.28,
        roughness: 0.45,
        metalness: 0.55,
        side: THREE.DoubleSide,
      }),
    );
    group.add(disc);
    // Metallic outer rim ring
    const rim = new THREE.Mesh(
      rimGeo,
      new THREE.MeshStandardMaterial({
        color: 0xd0d0d8, roughness: 0.25, metalness: 0.95,
      }),
    );
    group.add(rim);
    // Fresnel-style rim glow sprite (additive halo)
    const rimGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex, color: 0x7dd3fc, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }),
    );
    rimGlow.scale.set(1.4, 1.4, 1);
    group.add(rimGlow);
    // Backing plate (solid 3D feel)
    const back = new THREE.Mesh(
      new THREE.CircleGeometry(0.46, 32),
      new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.7, metalness: 0.4 }),
    );
    back.position.z = -0.04;
    group.add(back);

    group.position.set(
      (Math.random() - 0.5) * SPREAD * 1.5,
      (Math.random() - 0.5) * SPREAD * 1.5,
      -RANGE,
    );
    group.scale.setScalar(0.01);
    group.name = 'Target';
    group.userData.grabbable = false;
    world.add(group);
    grabbables.push(group);
    targets.push({
      group,
      alive: true,
      spawnAt: performance.now() / 1000,
      lifetime: 4 + Math.random() * 3,
      hit: false,
      shatterT: 0,
      expiring: 0,
      fragments: [],
      fragVel: [],
      fragAng: [],
      baseColor: new THREE.Color(0xff5566),
    });
  }
  for (let i = 0; i < 3; i++) spawnTarget();
  let nextSpawn = 1.5;

  // ══ HIT FX pools: shockwaves + impact flashes ══════════════════════
  const shockwaves: Shockwave[] = [];
  function spawnShockwave(pos: THREE.Vector3, color: number): void {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.1, 0.14, 24),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false,
        side: THREE.DoubleSide, fog: false,
      }),
    );
    ring.position.copy(pos);
    ring.lookAt(0, 0, 5); // face the camera roughly
    ring.renderOrder = 28;
    world.add(ring);
    shockwaves.push({ mesh: ring, life: 0.3, maxLife: 0.3 });
  }

  const impactFlashes: ImpactFlash[] = [];
  function spawnImpactFlash(pos: THREE.Vector3, color: number): void {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex, color, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false,
      }),
    );
    sprite.position.copy(pos);
    sprite.scale.set(1.0, 1.0, 1);
    sprite.renderOrder = 27;
    world.add(sprite);
    impactFlashes.push({ sprite, life: 0.2, maxLife: 0.2 });
  }

  // ══ SCORE POPUPS (floating 3D text sprites) ════════════════════════
  const scorePopups: ScorePopup[] = [];
  function spawnScorePopup(
    pos: THREE.Vector3,
    text: string,
    color: string,
    scale = 1,
  ): void {
    const sprite = makeTextSprite(text, color, 72, 256, 128);
    sprite.position.copy(pos);
    sprite.position.y += 0.5;
    sprite.scale.set(1.2 * scale, 0.6 * scale, 1);
    world.add(sprite);
    scorePopups.push({
      sprite,
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.4, 1.2, 0),
      life: 0.8,
      maxLife: 0.8,
    });
  }

  // ══ COMBO COUNTER (3D text sprite, shown when combo ≥ 3) ════════════
  let score = 0, combo = 0, comboTimer = 0;
  let comboSprite: THREE.Sprite | null = null;
  let comboSpriteText = '';
  function updateComboSprite(): void {
    if (combo >= 3) {
      const text = `COMBO x${combo}`;
      if (text !== comboSpriteText) {
        if (comboSprite) {
          world.remove(comboSprite);
          disposeSprite(comboSprite);
          comboSprite = null;
        }
        comboSprite = makeTextSprite(text, '#fbbf24', 84, 320, 128);
        comboSprite.position.set(3.2, 2.5, 0);
        comboSprite.scale.set(1.5, 0.75, 1);
        world.add(comboSprite);
        comboSpriteText = text;
      }
    } else if (comboSprite) {
      world.remove(comboSprite);
      disposeSprite(comboSprite);
      comboSprite = null;
      comboSpriteText = '';
    }
  }

  // ══ SHATTER FRAGMENTS (high/ultra tier) ═════════════════════════════
  function shatterTarget(t: Target): void {
    t.group.visible = false; // hide the disc; fragments take over
    const baseColor = t.baseColor;
    const pos = t.group.position;
    for (let i = 0; i < FRAGMENTS_PER_TARGET; i++) {
      const frag = new THREE.Mesh(
        fragGeo,
        new THREE.MeshStandardMaterial({
          color: baseColor,
          emissive: baseColor,
          emissiveIntensity: 0.45,
          roughness: 0.4,
          metalness: 0.5,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 1,
        }),
      );
      frag.position.copy(pos);
      frag.position.z += (Math.random() - 0.5) * 0.1;
      const startAngle = (i / FRAGMENTS_PER_TARGET) * Math.PI * 2;
      frag.rotation.z = startAngle;
      world.add(frag);
      t.fragments.push(frag);
      const angle = startAngle + Math.random() * 0.4;
      const speed = 2.5 + Math.random() * 3;
      t.fragVel.push(new THREE.Vector3(
        Math.cos(angle) * speed,
        Math.sin(angle) * speed + 1.5,
        (Math.random() - 0.5) * 1.5,
      ));
      t.fragAng.push(new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 8,
      ));
    }
  }

  // ══ POINTER + SHOOTING ══════════════════════════════════════════════
  const aimPoint = new THREE.Vector3();
  let hasAim = false;
  let hoveringTarget = false;
  let lastFireAt = 0;
  const FIRE_COOLDOWN = 0.18;
  let slideRecoil = 0; // 0..1, decays to 0 after fire (~120ms)
  let gunRecoil = 0;   // 0..1, decays to 0 after fire (~130ms)
  const muzzleWorld = new THREE.Vector3();
  const tmpVec = new THREE.Vector3();

  function fire(): void {
    const now = performance.now() / 1000;
    if (now - lastFireAt < FIRE_COOLDOWN) return;
    lastFireAt = now;

    // Trigger recoil values (decayed in update())
    slideRecoil = 1;
    gunRecoil = 1;

    // Layer 1: Core flash (1-frame bright pop)
    const cm = flashCore.material as THREE.SpriteMaterial;
    cm.opacity = 1;
    flashCore.scale.set(
      0.55 + Math.random() * 0.2,
      0.55 + Math.random() * 0.2,
      1,
    );
    // Layer 2: Halo flash (decays over ~150ms)
    const hm = flashHalo.material as THREE.SpriteMaterial;
    hm.opacity = 0.9;
    flashHalo.scale.set(
      1.6 + Math.random() * 0.3,
      1.6 + Math.random() * 0.3,
      1,
    );
    // Layer 4: Muzzle light (intensity tied to gunRecoil in update())
    muzzleLight.intensity = 8;

    // Layer 3: Refresh sparks outward from muzzle (local space)
    for (let i = 0; i < SPARK_COUNT; i++) {
      const dir = sparkDirs[i];
      const len = sparkLens[i];
      sparkPositions[i * 6 + 0] = 0;
      sparkPositions[i * 6 + 1] = 0;
      sparkPositions[i * 6 + 2] = 0;
      sparkPositions[i * 6 + 3] = dir.x * len;
      sparkPositions[i * 6 + 4] = dir.y * len;
      sparkPositions[i * 6 + 5] = dir.z * len + 0.05; // tiny forward bias
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkMat.opacity = 1;

    // Layer 5: Smoke puff (high/ultra tier only)
    if (isHighTier) {
      for (let i = 0; i < smokePuffs.length; i++) {
        const p = smokePuffs[i];
        p.sprite.visible = true;
        p.sprite.position.set(0, 0, 0);
        const ang = (i / smokePuffs.length) * Math.PI * 2 + Math.random() * 0.5;
        const sp = 0.4 + Math.random() * 0.5;
        p.vel.set(Math.cos(ang) * sp, Math.sin(ang) * sp + 0.3, 0.4 + Math.random() * 0.5);
        p.life = p.maxLife = 0.35 + Math.random() * 0.15;
        p.baseScale = 0.15 + Math.random() * 0.1;
        const pm = p.sprite.material as THREE.SpriteMaterial;
        pm.opacity = 0.6;
        pm.color.setHSL(0.6, 0.02, 0.5 + Math.random() * 0.2);
        p.sprite.scale.set(p.baseScale, p.baseScale, 1);
      }
    }

    // Bullet trail: muzzle world position → hit point
    muzzleAnchor.getWorldPosition(muzzleWorld);
    const target = hasAim ? aimPoint : new THREE.Vector3(0, 0, -RANGE);
    trailPos[0] = muzzleWorld.x; trailPos[1] = muzzleWorld.y; trailPos[2] = muzzleWorld.z;
    trailPos[3] = target.x; trailPos[4] = target.y; trailPos[5] = target.z;
    trailGeo.attributes.position.needsUpdate = true;
    trailMat.opacity = 0.9;
    // Tracer glow at midpoint (slightly thicker middle, tapered feel)
    tmpVec.copy(muzzleWorld).add(target).multiplyScalar(0.5);
    tracerGlow.position.copy(tmpVec);
    (tracerGlow.material as THREE.SpriteMaterial).opacity = 0.85;
    const trailLen = muzzleWorld.distanceTo(target);
    tracerGlow.scale.set(Math.max(0.2, trailLen * 0.18), 0.06, 1);

    shakeCamera(0.18);

    // Hit detection — find nearest alive target within hit radius
    let hitTarget: Target | null = null;
    let hitDist = Infinity;
    for (const t of targets) {
      if (!t.alive || t.hit) continue;
      const d = t.group.position.distanceTo(target);
      if (d < 0.5 && d < hitDist) {
        hitDist = d;
        hitTarget = t;
      }
    }
    if (hitTarget) {
      const t = hitTarget;
      t.hit = true; t.alive = false;
      combo++; comboTimer = 2;
      // Score by accuracy (bullseye bonus)
      let points = 10;
      let popupText = '+10';
      let popupColor = '#ffffff';
      let popupScale = 1;
      if (hitDist < 0.15) {
        points = 50; popupText = '+50 BULLSEYE'; popupColor = '#fbbf24'; popupScale = 1.4;
      } else if (hitDist < 0.32) {
        points = 25; popupText = '+25'; popupColor = '#7dd3fc'; popupScale = 1.15;
      }
      // Combo multiplier (≥3 hits in a row)
      const mult = combo >= 3 ? Math.min(5, 1 + (combo - 2) * 0.5) : 1;
      score += Math.round(points * mult);

      const hitPos = t.group.position.clone();
      spawnShockwave(hitPos, 0xfff2a8);
      spawnImpactFlash(hitPos, 0xfff2a8);
      if (isHighTier) shatterTarget(t);
      spawnScorePopup(hitPos, popupText, popupColor, popupScale);
      updateComboSprite();
      shakeCamera(0.35);
    } else {
      // Miss → small impact flash on the backstop
      spawnImpactFlash(target, 0x6a8aff);
    }
  }

  return {
    grabbables,
    background: 0x060810,
    stars: false,
    view: { distance: 7, pitch: 0, yaw: 0 },
    update(dt: number, elapsed: number): void {
      const now = performance.now() / 1000;

      // ── Idle sway (subtle breathing motion on the pistol) ──
      pistolGroup.position.x = Math.sin(elapsed * 0.7) * 0.012;
      pistolGroup.position.y = Math.sin(elapsed * 1.3) * 0.008;
      pistolGroup.rotation.z = Math.sin(elapsed * 0.9) * 0.004;

      // ── Recoil decay (slide + gun) ──
      slideRecoil = Math.max(0, slideRecoil - dt / 0.12); // ~120ms
      gunRecoil = Math.max(0, gunRecoil - dt / 0.13);     // ~130ms
      // Slide kicks back along local -X (= world +Z, toward shooter)
      slideGroup.position.x = -0.1 * slideRecoil;
      // Whole gun kicks back toward camera (+Z) + muzzle pitches up
      gunGroup.position.x = GUN_BASE_POS.x;
      gunGroup.position.y = GUN_BASE_POS.y;
      gunGroup.position.z = GUN_BASE_POS.z + 0.15 * gunRecoil;
      gunGroup.rotation.x = GUN_BASE_ROT.x + 0.08 * gunRecoil;
      gunGroup.rotation.y = GUN_BASE_ROT.y;
      gunGroup.rotation.z = GUN_BASE_ROT.z;

      // ── Spawn targets ──
      nextSpawn -= dt;
      if (nextSpawn <= 0 && targets.filter((t) => t.alive && !t.hit).length < TARGET_COUNT) {
        spawnTarget();
        nextSpawn = 1 + Math.random() * 2;
      }

      // ── Update targets ──
      for (let i = targets.length - 1; i >= 0; i--) {
        const t = targets[i];
        const age = now - t.spawnAt;
        if (t.hit) {
          // Shattering — animate fragments with gravity + fade
          t.shatterT += dt;
          for (let f = 0; f < t.fragments.length; f++) {
            const frag = t.fragments[f];
            const vel = t.fragVel[f];
            const ang = t.fragAng[f];
            frag.position.x += vel.x * dt;
            frag.position.y += vel.y * dt;
            frag.position.z += vel.z * dt;
            vel.y -= 9.8 * dt; // gravity
            vel.multiplyScalar(1 - dt * 0.7); // air drag
            frag.rotation.x += ang.x * dt;
            frag.rotation.y += ang.y * dt;
            frag.rotation.z += ang.z * dt;
            const mat = frag.material as THREE.MeshStandardMaterial;
            mat.opacity = Math.max(0, 1 - t.shatterT / 1.0);
            mat.emissiveIntensity = Math.max(0, 0.45 - t.shatterT * 0.45);
          }
          if (t.shatterT >= 1.2) {
            // Cleanup fragments + target; schedule respawn
            for (const frag of t.fragments) {
              world.remove(frag);
              frag.geometry.dispose();
              (frag.material as THREE.Material).dispose();
            }
            t.fragments.length = 0;
            world.remove(t.group);
            const idx = grabbables.indexOf(t.group);
            if (idx >= 0) grabbables.splice(idx, 1);
            targets.splice(i, 1);
            setTimeout(() => {
              if (!disposed && targets.length < TARGET_COUNT) spawnTarget();
            }, 1500);
          }
          continue;
        }
        if (t.alive) {
          // Spawn-in scale ease
          const cur = t.group.scale.x;
          t.group.scale.setScalar(cur + (1 - cur) * Math.min(1, dt * 5));
          // Subtle vertical bob
          t.group.position.y += Math.sin(now * 2 + t.spawnAt) * dt * 0.15;
          // Slow rotation for shimmer
          t.group.rotation.z += dt * 0.3;
          if (age > t.lifetime) {
            // Expire — begin fade-out
            t.alive = false;
            t.expiring = 0;
          }
        } else {
          // Expiring fade-out (~1s)
          t.expiring += dt;
          const fade = Math.max(0, 1 - t.expiring);
          t.group.scale.setScalar(Math.max(0.01, fade));
          if (t.expiring >= 1) {
            world.remove(t.group);
            const idx = grabbables.indexOf(t.group);
            if (idx >= 0) grabbables.splice(idx, 1);
            targets.splice(i, 1);
          }
        }
      }

      // ── Crosshair: follow aim, detect hover ──
      hoveringTarget = false;
      if (hasAim) {
        crosshair.visible = true;
        crosshair.position.lerp(aimPoint, Math.min(1, dt * 18));
        for (const t of targets) {
          if (t.alive && !t.hit && t.group.position.distanceTo(aimPoint) < 0.55) {
            hoveringTarget = true; break;
          }
        }
      } else {
        crosshair.visible = false;
      }
      // Hover state: red + expanded + pulse
      const chColor = hoveringTarget ? 0xff3a5c : 0x7dd3fc;
      const chOpacity = hoveringTarget ? 0.95 : 0.7;
      (chDot.material as THREE.MeshBasicMaterial).color.setHex(chColor);
      (chDot.material as THREE.MeshBasicMaterial).opacity = chOpacity;
      (chRing.material as THREE.MeshBasicMaterial).color.setHex(chColor);
      (chRing.material as THREE.MeshBasicMaterial).opacity = hoveringTarget ? 0.75 : 0.4;
      for (const tick of chTicks) {
        const m = tick.material as THREE.MeshBasicMaterial;
        m.color.setHex(chColor);
        m.opacity = chOpacity;
      }
      const scaleBase = hoveringTarget ? 1.18 : 1;
      const pulse = hoveringTarget ? 1 + Math.sin(elapsed * 12) * 0.08 : 1;
      const sFinal = scaleBase * pulse;
      crosshair.scale.set(sFinal, sFinal, sFinal);

      // ── Muzzle flash decay ──
      const fmCore = flashCore.material as THREE.SpriteMaterial;
      fmCore.opacity = Math.max(0, fmCore.opacity - dt * 8); // ~125ms
      const hm2 = flashHalo.material as THREE.SpriteMaterial;
      hm2.opacity = Math.max(0, hm2.opacity - dt * 6.5); // ~150ms
      const haloScale = 1.6 + (1 - hm2.opacity) * 0.5;
      flashHalo.scale.set(haloScale, haloScale, 1);
      // Sparks fade over ~80ms
      sparkMat.opacity = Math.max(0, sparkMat.opacity - dt * 12.5);
      // Muzzle light intensity tied to gunRecoil (~100ms decay)
      muzzleLight.intensity = 8 * gunRecoil;

      // ── Smoke update (high/ultra only) ──
      if (isHighTier) {
        for (const p of smokePuffs) {
          if (!p.sprite.visible) continue;
          p.life -= dt;
          if (p.life <= 0) {
            p.sprite.visible = false;
            continue;
          }
          p.sprite.position.x += p.vel.x * dt;
          p.sprite.position.y += p.vel.y * dt;
          p.sprite.position.z += p.vel.z * dt;
          p.vel.y += 0.6 * dt; // smoke rises
          p.vel.multiplyScalar(1 - dt * 1.2);
          const lifeRatio = p.life / p.maxLife;
          const sScale = p.baseScale * (1 + (1 - lifeRatio) * 1.5);
          p.sprite.scale.set(sScale, sScale, 1);
          (p.sprite.material as THREE.SpriteMaterial).opacity = lifeRatio * 0.55;
        }
      }

      // ── Trail decay (~100ms) ──
      trailMat.opacity = Math.max(0, trailMat.opacity - dt * 10);
      const tm = tracerGlow.material as THREE.SpriteMaterial;
      tm.opacity = Math.max(0, tm.opacity - dt * 10);

      // ── Shockwaves ──
      for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        sw.life -= dt;
        const ratio = 1 - sw.life / sw.maxLife;
        const scale = 1 + ratio * 4;
        sw.mesh.scale.set(scale, scale, 1);
        (sw.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - ratio);
        if (sw.life <= 0) {
          world.remove(sw.mesh);
          sw.mesh.geometry.dispose();
          (sw.mesh.material as THREE.Material).dispose();
          shockwaves.splice(i, 1);
        }
      }

      // ── Impact flashes ──
      for (let i = impactFlashes.length - 1; i >= 0; i--) {
        const f = impactFlashes[i];
        f.life -= dt;
        const ratio = 1 - f.life / f.maxLife;
        const s = 1 + ratio * 1.5;
        f.sprite.scale.set(s, s, 1);
        (f.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - ratio);
        if (f.life <= 0) {
          world.remove(f.sprite);
          disposeSprite(f.sprite);
          impactFlashes.splice(i, 1);
        }
      }

      // ── Score popups ──
      for (let i = scorePopups.length - 1; i >= 0; i--) {
        const p = scorePopups[i];
        p.life -= dt;
        p.sprite.position.x += p.vel.x * dt;
        p.sprite.position.y += p.vel.y * dt;
        p.sprite.position.z += p.vel.z * dt;
        p.vel.y -= 1.5 * dt; // slight deceleration
        const lifeRatio = p.life / p.maxLife;
        (p.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, lifeRatio * 1.4);
        const sc = 1.2 * (1 + (1 - lifeRatio) * 0.3);
        p.sprite.scale.set(sc, sc * 0.5, 1);
        if (p.life <= 0) {
          world.remove(p.sprite);
          disposeSprite(p.sprite);
          scorePopups.splice(i, 1);
        }
      }

      // ── Combo sprite subtle pulse ──
      if (comboSprite) {
        const pulse = 1 + Math.sin(elapsed * 6) * 0.05;
        comboSprite.scale.set(1.5 * pulse, 0.75 * pulse, 1);
      }

      // ── Haze drift (atmospheric particles) ──
      if (hazeCount > 0) {
        for (let i = 0; i < hazeCount; i++) {
          hazePos[i * 3] += hazeVel[i].x * dt;
          hazePos[i * 3 + 1] += hazeVel[i].y * dt;
          hazePos[i * 3 + 2] += hazeVel[i].z * dt;
          if (hazePos[i * 3 + 1] > SPREAD + 1) hazePos[i * 3 + 1] = -SPREAD - 1;
          if (hazePos[i * 3] > 9) hazePos[i * 3] = -9;
          if (hazePos[i * 3] < -9) hazePos[i * 3] = 9;
        }
        hazeGeo.attributes.position.needsUpdate = true;
      }

      // ── Silhouettes subtle drift ──
      for (let i = 0; i < silhouettes.length; i++) {
        silhouettes[i].rotation.y += dt * 0.05 * (i % 2 === 0 ? 1 : -1);
      }

      // ── Combo timer ──
      if (comboTimer > 0) {
        comboTimer -= dt;
        if (comboTimer <= 0) {
          combo = 0;
          updateComboSprite();
        }
      }
    },
    updatePointer(ndcX: number, ndcY: number, camera: THREE.PerspectiveCamera): void {
      const ray = new THREE.Raycaster();
      const ndc = new THREE.Vector2(ndcX, ndcY);
      ray.setFromCamera(ndc, camera);
      const planeZ = -RANGE;
      const dir = ray.ray.direction;
      const origin = ray.ray.origin;
      if (Math.abs(dir.z) > 0.001) {
        const t = (planeZ - origin.z) / dir.z;
        if (t > 0) {
          aimPoint.set(origin.x + dir.x * t, origin.y + dir.y * t, planeZ);
          hasAim = true;
          return;
        }
      }
      hasAim = false;
    },
    capturesPointer: () => true,
    pointerFocus(out: THREE.Vector3) { if (!hasAim) return false; out.copy(aimPoint); return true; },
    setPointerAction(pressed: boolean) { if (pressed) fire(); },
    bodyInfo(name: string | null) { return name === 'Target' ? `Target · ${score} pts` : null; },
    coachHint() {
      if (score === 0) return 'Point at a target · pinch or click to fire';
      return `${score} pts${combo > 1 ? ` · ${combo}x combo` : ''}`;
    },
    shakeCamera(amount: number) { shakeCamera(amount); },
    dispose() {
      disposed = true;
      // Dispose pooled FX sprites/textures (disposeGroup only catches geometries/materials)
      for (const p of scorePopups) disposeSprite(p.sprite);
      for (const f of impactFlashes) disposeSprite(f.sprite);
      for (const sw of shockwaves) {
        sw.mesh.geometry.dispose();
        (sw.mesh.material as THREE.Material).dispose();
      }
      if (comboSprite) disposeSprite(comboSprite);
      // Bullseye + grid textures are referenced by materials under world —
      // disposeGroup traverses world and disposes each mesh's material, but
      // shared CanvasTextures used as maps won't be auto-disposed unless
      // userData.ownMap is set. Manually dispose the shared textures here.
      bullseyeTex.dispose();
      gridTex.dispose();
      (vignette.material as THREE.MeshBasicMaterial).map?.dispose();
      disposeGroup(world);
    },
  };
}
