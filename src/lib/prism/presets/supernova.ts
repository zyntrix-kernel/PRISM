// SUPERNOVA preset: a star that pulses, destabilizes, then explodes in a
// massive shockwave. The star's corona flares, shock rings expand outward,
// and stellar debris scatters into the void. Repeats on a loop.

import * as THREE from 'three';
import { disposeGroup, type BuilderCtx, type WorldAPI } from './types';

export function buildSupernova(ctx: BuilderCtx): WorldAPI {
  const { world, glowTex, shakeCamera, quality } = ctx;
  const grabbables: THREE.Object3D[] = [];

  // ── Star core (procedural shader sphere) ─────────────────────────────
  const starVert = /* glsl */ `
    varying vec3 vNormal;
    varying vec2 vUv;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  const starFrag = /* glsl */ `
    precision highp float;
    varying vec3 vNormal;
    varying vec2 vUv;
    uniform float uTime;
    uniform float uIntensity;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vnoise(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1,0)), u.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
    }

    void main() {
      // Surface turbulence (granulation)
      float n = vnoise(vUv * 8.0 + uTime * 0.3);
      float n2 = vnoise(vUv * 24.0 - uTime * 0.5);
      float turb = 0.6 + 0.3 * n + 0.1 * n2;

      // Fresnel rim glow
      float fresnel = pow(1.0 - max(0.0, dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);

      // Color: white-hot core → orange → deep red surface
      vec3 col = mix(vec3(1.0, 0.95, 0.8), vec3(1.0, 0.6, 0.15), 1.0 - turb);
      col = mix(col, vec3(0.8, 0.2, 0.05), smoothstep(0.3, 0.7, 1.0 - turb));
      col += vec3(1.0, 0.9, 0.7) * fresnel * 0.5;

      col *= uIntensity;
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const starMat = new THREE.ShaderMaterial({
    vertexShader: starVert,
    fragmentShader: starFrag,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 1 },
    },
  });
  const star = new THREE.Mesh(new THREE.SphereGeometry(1.2, 48, 32), starMat);
  world.add(star);

  // ── Corona glow (sprite) ────────────────────────────────────────────
  const corona = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex, color: 0xffaa44, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  corona.scale.set(5, 5, 1);
  world.add(corona);

  // ── Shockwave rings (expand on explosion) ───────────────────────────
  const shocks: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.0, 64),
      new THREE.MeshBasicMaterial({
        color: i === 0 ? 0xfff2a8 : 0xff8844,
        transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    world.add(ring);
    shocks.push(ring);
  }

  // ── Stellar debris (particle system) ─────────────────────────────────
  const DEBRIS_COUNT = quality === 'ultra' ? 500 : quality === 'high' ? 300 : 150;
  const debrisPos = new Float32Array(DEBRIS_COUNT * 3);
  const debrisCol = new Float32Array(DEBRIS_COUNT * 3);
  const debrisVel: THREE.Vector3[] = [];
  const debrisLife = new Float32Array(DEBRIS_COUNT);
  for (let i = 0; i < DEBRIS_COUNT; i++) {
    debrisVel.push(new THREE.Vector3());
    debrisLife[i] = 0;
    debrisPos[i * 3 + 1] = -999; // hidden
  }
  const debrisGeo = new THREE.BufferGeometry();
  debrisGeo.setAttribute('position', new THREE.BufferAttribute(debrisPos, 3));
  debrisGeo.setAttribute('color', new THREE.BufferAttribute(debrisCol, 3));
  const debrisMat = new THREE.PointsMaterial({
    size: 0.12, vertexColors: true, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const debris = new THREE.Points(debrisGeo, debrisMat);
  world.add(debris);

  function fireDebris(): void {
    for (let i = 0; i < DEBRIS_COUNT; i++) {
      debrisPos[i * 3] = 0; debrisPos[i * 3 + 1] = 0; debrisPos[i * 3 + 2] = 0;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 5 + Math.random() * 10;
      debrisVel[i].set(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.cos(phi) * speed,
        Math.sin(phi) * Math.sin(theta) * speed,
      );
      const heat = Math.random();
      debrisCol[i * 3] = 1;
      debrisCol[i * 3 + 1] = 0.5 + heat * 0.5;
      debrisCol[i * 3 + 2] = heat * 0.3;
      debrisLife[i] = 1;
    }
    debrisGeo.attributes.position.needsUpdate = true;
    debrisGeo.attributes.color.needsUpdate = true;
    debrisMat.opacity = 1;
  }

  // ── Explosion flash ─────────────────────────────────────────────────
  const flash = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex, color: 0xffffff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  flash.scale.set(0.1, 0.1, 1);
  world.add(flash);

  // ── Animation state machine ─────────────────────────────────────────
  type Phase = 'stable' | 'destabilizing' | 'exploding' | 'aftermath';
  let phase: Phase = 'stable';
  let phaseT = 0;
  const STABLE_DURATION = 4;
  const DESTABILIZE_DURATION = 2;
  const EXPLODE_DURATION = 1.5;
  const AFTERMATH_DURATION = 3;

  return {
    grabbables,
    background: 0x050308,
    view: { distance: 10, pitch: 0.3, yaw: 0.2 },
    update(dt: number, elapsed: number): void {
      phaseT += dt;
      starMat.uniforms.uTime.value = elapsed;

      if (phase === 'stable') {
        // Gentle pulse
        const pulse = 1 + Math.sin(elapsed * 1.5) * 0.03;
        star.scale.setScalar(pulse);
        starMat.uniforms.uIntensity.value = 1 + Math.sin(elapsed * 2) * 0.1;
        corona.scale.set(5 + Math.sin(elapsed * 1.5) * 0.3, 5 + Math.sin(elapsed * 1.5) * 0.3, 1);
        (corona.material as THREE.SpriteMaterial).opacity = 0.35 + Math.sin(elapsed * 2) * 0.05;

        if (phaseT >= STABLE_DURATION) {
          phase = 'destabilizing';
          phaseT = 0;
        }
      } else if (phase === 'destabilizing') {
        // Escalating instability: faster pulse, growing, shaking
        const t = phaseT / DESTABILIZE_DURATION;
        const smoothT = t * t * (3 - 2 * t);
        const pulse = 1 + smoothT * 0.4 + Math.sin(elapsed * (4 + smoothT * 10)) * smoothT * 0.1;
        star.scale.setScalar(pulse);
        starMat.uniforms.uIntensity.value = 1 + smoothT * 1.5;
        corona.scale.setScalar(5 + smoothT * 4 + Math.sin(elapsed * 8) * smoothT * 1);
        (corona.material as THREE.SpriteMaterial).opacity = 0.35 + smoothT * 0.4;

        if (Math.sin(elapsed * 15) > 0.8) shakeCamera(smoothT * 0.2);

        if (phaseT >= DESTABILIZE_DURATION) {
          phase = 'exploding';
          phaseT = 0;
          shakeCamera(1.0);
          flash.scale.set(0.1, 0.1, 1);
          (flash.material as THREE.SpriteMaterial).opacity = 1;
          fireDebris();
          for (let i = 0; i < shocks.length; i++) shocks[i].visible = true;
          star.visible = false;
        }
      } else if (phase === 'exploding') {
        const t = phaseT / EXPLODE_DURATION;

        // Flash
        (flash.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - t * 2);
        const fs = 0.1 + t * 20;
        flash.scale.set(fs, fs, 1);

        // Shockwaves
        shocks.forEach((shock, i) => {
          const lt = phaseT - i * 0.15;
          const k = Math.min(Math.max(lt / 1.2, 0), 1);
          (shock.material as THREE.MeshBasicMaterial).opacity = 0.8 * Math.pow(1 - k, 1.5);
          const sc = 0.8 + k * 15;
          shock.scale.set(sc, sc, 1);
          shock.visible = k < 1;
        });

        // Debris
        for (let i = 0; i < DEBRIS_COUNT; i++) {
          if (debrisLife[i] <= 0) continue;
          debrisLife[i] -= dt * 0.3;
          debrisPos[i * 3] += debrisVel[i].x * dt;
          debrisPos[i * 3 + 1] += debrisVel[i].y * dt;
          debrisPos[i * 3 + 2] += debrisVel[i].z * dt;
          debrisVel[i].multiplyScalar(1 - dt * 0.3);
          if (debrisLife[i] <= 0) debrisPos[i * 3 + 1] = -999;
        }
        debrisGeo.attributes.position.needsUpdate = true;
        debrisMat.opacity = Math.max(0, 1 - t * 0.5);

        // Fade corona
        (corona.material as THREE.SpriteMaterial).opacity *= Math.exp(-dt * 2);

        if (phaseT >= EXPLODE_DURATION) {
          phase = 'aftermath';
          phaseT = 0;
        }
      } else if (phase === 'aftermath') {
        // Debris continues to drift + fade
        for (let i = 0; i < DEBRIS_COUNT; i++) {
          if (debrisLife[i] <= 0) continue;
          debrisLife[i] -= dt * 0.2;
          debrisPos[i * 3] += debrisVel[i].x * dt;
          debrisPos[i * 3 + 1] += debrisVel[i].y * dt;
          debrisPos[i * 3 + 2] += debrisVel[i].z * dt;
          debrisVel[i].multiplyScalar(1 - dt * 0.2);
          if (debrisLife[i] <= 0) debrisPos[i * 3 + 1] = -999;
        }
        debrisGeo.attributes.position.needsUpdate = true;
        debrisMat.opacity *= Math.exp(-dt * 0.5);

        if (phaseT >= AFTERMATH_DURATION) {
          // Reset for loop
          phase = 'stable';
          phaseT = 0;
          star.visible = true;
          star.scale.setScalar(1);
          starMat.uniforms.uIntensity.value = 1;
          (corona.material as THREE.SpriteMaterial).opacity = 0.4;
          corona.scale.set(5, 5, 1);
          for (let i = 0; i < DEBRIS_COUNT; i++) { debrisPos[i * 3 + 1] = -999; debrisLife[i] = 0; }
          debrisGeo.attributes.position.needsUpdate = true;
          debrisMat.opacity = 0;
          flash.visible = false;
          for (const s of shocks) s.visible = false;
        }
      }
    },
    bodyInfo() { return phase === 'exploding' ? 'SUPERNOVA — star core collapse in progress' : phase === 'destabilizing' ? 'Star destabilizing — supernova imminent' : `${phase}`; },
    coachHint() { return phase === 'stable' ? 'Watch the star — it will go supernova' : phase === 'destabilizing' ? 'The star is destabilizing…' : phase === 'exploding' ? 'SUPERNOVA!' : 'Stellar debris dispersing…'; },
    dispose() { disposeGroup(world); },
  };
}
