// NEBULA preset: a volumetric procedural nebula with GPU-driven Perlin/curl
// noise flow. Colors shift over time. On High/Ultra, particles flow via a
// custom vertex shader (curl noise). On Low/Medium, they use simple CPU
// sinusoidal drift (cheaper, same visual at a distance).
//
// Noise functions ported from ggwzrd/threejs-galaxy (MIT).
// Attribution: https://github.com/ggwzrd/threejs-galaxy

import * as THREE from 'three';
import { disposeGroup, type BuilderCtx, type WorldAPI } from './types';
import { NOISE_GLSL } from './noise_glsl';

export function buildNebula(ctx: BuilderCtx): WorldAPI {
  const { world, quality, glowTex } = ctx;
  const grabbables: THREE.Object3D[] = [];

  const isUltra = quality === 'ultra';
  const isHigh = quality === 'high';
  // GPU curl-noise shader (soft circular particles) is cheap fragment work —
  // always enabled so the nebula never shows hard square points.
  const useShader = true;

  const COUNT = isUltra ? 3000 : isHigh ? 1500 : 800;

  // ── Particle cloud ──────────────────────────────────────────────────
  const pos = new Float32Array(COUNT * 3);
  const basePos = new Float32Array(COUNT * 3);
  const col = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT); // per-particle phase offset

  for (let i = 0; i < COUNT; i++) {
    const r = Math.pow(Math.random(), 0.5) * 8;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const x = r * Math.sin(phi) * Math.cos(theta) * 1.2;
    const y = r * Math.cos(phi) * 0.5;
    const z = r * Math.sin(phi) * Math.sin(theta) * 1.2;

    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    basePos[i * 3] = x; basePos[i * 3 + 1] = y; basePos[i * 3 + 2] = z;
    seed[i] = Math.random() * 100;

    const distNorm = r / 8;
    const c = new THREE.Color();
    if (distNorm < 0.3) c.setHSL(0.55, 0.8, 0.6);
    else if (distNorm < 0.6) c.setHSL(0.85, 0.7, 0.5);
    else c.setHSL(0.08, 0.7, 0.45);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (useShader) {
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.setAttribute('aBasePos', new THREE.BufferAttribute(basePos, 3));
  }

  let mat: THREE.PointsMaterial | THREE.ShaderMaterial;

  if (useShader) {
    // ── GPU shader path (High/Ultra): curl noise in vertex shader ────
    mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: isUltra ? 6.0 : 4.0 },
      },
      vertexShader: NOISE_GLSL + /* glsl */ `
        uniform float uTime;
        uniform float uSize;
        attribute float aSeed;
        attribute vec3 aBasePos;
        varying vec3 vColor;

        void main() {
          vColor = color;

          // Curl noise flow field — organic, divergence-free drift
          vec3 flowPos = aBasePos * 0.15 + vec3(0.0, uTime * 0.05, 0.0);
          vec3 flow = curl_noise(flowPos + aSeed * 0.01) * 0.8;

          vec3 worldPos = aBasePos + flow;

          // Differential rotation (inner particles rotate faster)
          float dist = length(aBasePos.xz);
          float rotSpeed = uTime * 0.08 / max(dist, 0.5);
          float c = cos(rotSpeed); float s = sin(rotSpeed);
          worldPos.xz = mat2(c, -s, s, c) * worldPos.xz;

          vec4 mvPos = modelViewMatrix * vec4(worldPos, 1.0);
          gl_PointSize = uSize * (1.0 / -mvPos.z) * 100.0;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          // Soft circular particle (no hard square edges)
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          if (d > 0.5) discard;
          float alpha = (1.0 - d * 2.0) * 0.6;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });
  } else {
    // ── CPU path (Low/Medium): simple sinusoidal drift ──────────────
    mat = new THREE.PointsMaterial({
      size: isHigh ? 0.12 : 0.18,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
  }

  const cloud = new THREE.Points(geo, mat);
  world.add(cloud);

  // ── Background stars ────────────────────────────────────────────────
  const STAR_COUNT = isUltra ? 500 : 250;
  const starPos = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 60;
    starPos[i * 3 + 1] = (Math.random() - 0.5) * 60;
    starPos[i * 3 + 2] = (Math.random() - 0.5) * 60;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const bgStars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xaaccff, size: 0.08, transparent: true, opacity: 0.5, depthWrite: false,
  }));
  world.add(bgStars);

  // ── Central core glow ────────────────────────────────────────────────
  // Multi-layer additive core: bright inner sprite + soft outer halo.
  // Both use the shared radial glowTex (soft circular falloff) — without
  // a texture map, sprites render as flat hard-edged squares (the "odd
  // square in the middle" bug).
  const coreInner = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0x88ddff, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  coreInner.scale.set(2.5, 2.5, 1);
  world.add(coreInner);

  const coreHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0x9988ff, transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  coreHalo.scale.set(6, 6, 1);
  world.add(coreHalo);

  // A small bright PointLight at the core illuminates the inner particles
  // (they're MeshBasicMaterial so this is subtle, but it adds depth on
  // MeshStandard children if any are added later).
  const coreLight = new THREE.PointLight(0xaaccff, 1.2, 12, 2);
  coreLight.position.set(0, 0, 0);
  world.add(coreLight);

  return {
    grabbables,
    background: 0x020308,
    view: { distance: 16, pitch: 0.2, yaw: 0 },
    update(dt: number, elapsed: number): void {
      if (useShader) {
        // GPU path: just update the time uniform (the shader does the rest)
        (mat as THREE.ShaderMaterial).uniforms.uTime.value = elapsed;
      } else {
        // CPU path: sinusoidal drift (cheap, no noise)
        // OPTIMIZED: update every other frame to halve CPU cost
        if (Math.floor(elapsed * 30) % 2 === 0) {
          const positions = geo.attributes.position.array as Float32Array;
          for (let i = 0; i < COUNT; i++) {
            const s = seed[i];
            positions[i * 3] = basePos[i * 3] + Math.sin(elapsed * 0.3 + s) * 0.3;
            positions[i * 3 + 1] = basePos[i * 3 + 1] + Math.cos(elapsed * 0.25 + s * 1.3) * 0.2;
            positions[i * 3 + 2] = basePos[i * 3 + 2] + Math.sin(elapsed * 0.2 + s * 0.7) * 0.3;
          }
          geo.attributes.position.needsUpdate = true;
        }
      }

      cloud.rotation.y += dt * 0.05;
      bgStars.rotation.y -= dt * 0.02;

      // Core: dual-layer breathing pulse (inner bright + outer halo).
      const innerPulse = 2.5 + Math.sin(elapsed * 0.8) * 0.4;
      const haloPulse = 6 + Math.sin(elapsed * 0.5 + 1.2) * 1.0;
      coreInner.scale.set(innerPulse, innerPulse, 1);
      coreHalo.scale.set(haloPulse, haloPulse, 1);
      (coreInner.material as THREE.SpriteMaterial).opacity = 0.85 + Math.sin(elapsed * 1.2) * 0.1;
      (coreHalo.material as THREE.SpriteMaterial).opacity = 0.35 + Math.sin(elapsed * 0.5) * 0.08;
      // Core light intensity breathes with the pulse.
      coreLight.intensity = 1.2 + Math.sin(elapsed * 0.8) * 0.3;
    },
    coachHint() { return 'A living nebula — Perlin noise drives the flow'; },
    dispose() { disposeGroup(world); },
  };
}
