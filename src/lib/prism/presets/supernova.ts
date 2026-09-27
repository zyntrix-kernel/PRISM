// SUPERNOVA preset: a massive star that destabilizes and explodes.
// Uses real Perlin noise 3D for surface turbulence, blackbody temperature
// colors, volumetric shockwaves, and 3D debris with trail particles.
//
// Noise + blackbody from: ggwzrd/threejs-galaxy (MIT) + vlwkaos/threejs-blackhole (ISC)

import * as THREE from 'three';
import { disposeGroup, type BuilderCtx, type WorldAPI } from './types';
import { NOISE_GLSL } from './noise_glsl';
import { createFresnelGlow } from './fresnel';

export function buildSupernova(ctx: BuilderCtx): WorldAPI {
  const { world, glowTex, shakeCamera, quality } = ctx;
  const grabbables: THREE.Object3D[] = [];
  const isUltra = quality === 'ultra';
  const isHigh = quality === 'high';

  // ── Star surface: Perlin noise 3D turbulence + blackbody colors ───
  const starVert = /* glsl */ `
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying vec3 vPos;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPos = position;
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPos = worldPos.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `;

  const starFrag = NOISE_GLSL + /* glsl */ `
    precision highp float;
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying vec3 vPos;
    uniform float uTime;
    uniform float uIntensity;
    uniform float uCollapse;  // 0 = stable, 1 = fully collapsing

    void main() {
      // 3D Perlin noise for realistic plasma turbulence (multiple octaves)
      vec3 p = vPos * 2.0 + vec3(0.0, uTime * 0.3, 0.0);
      float n1 = cnoise(p);
      float n2 = cnoise(p * 3.0 + vec3(uTime * 0.2));
      float n3 = cnoise(p * 8.0 - vec3(uTime * 0.5));
      float turb = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
      turb = 0.5 + 0.5 * turb;

      // Granulation detail
      float gran = cnoise(vPos * 15.0 + uTime * 0.1) * 0.15;

      // Fresnel rim
      vec3 viewDir = normalize(cameraPosition - vWorldPos);
      float fresnel = pow(1.0 - max(0.0, dot(vNormal, viewDir)), 2.5);

      // Blackbody temperature: hotter at surface peaks, cooler at valleys
      // During collapse: temperature skyrockets
      float baseTemp = mix(3000.0, 12000.0, turb);
      baseTemp += gran * 2000.0;
      baseTemp *= (1.0 + uCollapse * 3.0 + uIntensity * 0.5);
      vec3 col = temp_to_color(baseTemp);

      // Add bright hot spots where noise peaks
      float hotspots = smoothstep(0.6, 1.0, turb);
      col += vec3(1.0, 0.95, 0.8) * hotspots * 0.5 * (1.0 + uCollapse);

      // Fresnel rim glow (atmospheric edge)
      col += vec3(1.0, 0.7, 0.3) * fresnel * (0.3 + uCollapse * 0.7);

      // Intensity boost during destabilization
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
      uCollapse: { value: 0 },
    },
  });

  // Use IcosahedronGeometry for more uniform tessellation (from cookieMonster repo)
  const starGeo = new THREE.IcosahedronGeometry(1.3, isUltra ? 5 : isHigh ? 3 : 2);
  const star = new THREE.Mesh(starGeo, starMat);
  world.add(star);

  // ── Fresnel glow shell (atmospheric edge) ──────────────────────────
  const fresnelGlow = createFresnelGlow(1.3, 0xffaa44, 0x000000);
  star.add(fresnelGlow);

  // ── Corona (multi-layer sprite glow) ───────────────────────────────
  const coronaLayers: THREE.Sprite[] = [];
  const coronaColors = [0xff8800, 0xffaa44, 0xffdd66];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: coronaColors[i], transparent: true,
      opacity: 0.25 - i * 0.05, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const scale = 4 + i * 2.5;
    s.scale.set(scale, scale, 1);
    world.add(s);
    coronaLayers.push(s);
  }

  // ── Volumetric shockwave (3D expanding sphere, not just flat ring) ─
  const shockSphere = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 16),
    new THREE.MeshBasicMaterial({
      color: 0xfff2a8, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
    }),
  );
  shockSphere.visible = false;
  world.add(shockSphere);

  // ── Flat shockwave rings (expanding in the orbital plane) ──────────
  const shocks: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.0, 96),
      new THREE.MeshBasicMaterial({
        color: i < 2 ? 0xfff2a8 : i < 4 ? 0xff8844 : 0xff4422,
        transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2 + (i * 0.05);
    ring.visible = false;
    world.add(ring);
    shocks.push(ring);
  }

  // ── Stellar debris (3D particles with trails) ──────────────────────
  const DEBRIS_COUNT = isUltra ? 800 : isHigh ? 400 : 200;
  const debrisPos = new Float32Array(DEBRIS_COUNT * 3);
  const debrisCol = new Float32Array(DEBRIS_COUNT * 3);
  const debrisSize = new Float32Array(DEBRIS_COUNT);
  const debrisVel: THREE.Vector3[] = [];
  const debrisLife = new Float32Array(DEBRIS_COUNT);
  for (let i = 0; i < DEBRIS_COUNT; i++) {
    debrisVel.push(new THREE.Vector3());
    debrisLife[i] = 0;
    debrisPos[i * 3 + 1] = -999;
    debrisSize[i] = 0.5 + Math.random() * 1.5;
  }
  const debrisGeo = new THREE.BufferGeometry();
  debrisGeo.setAttribute('position', new THREE.BufferAttribute(debrisPos, 3));
  debrisGeo.setAttribute('color', new THREE.BufferAttribute(debrisCol, 3));
  const debrisMat = new THREE.PointsMaterial({
    size: isUltra ? 0.15 : 0.2, vertexColors: true, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    map: glowTex,
  });
  const debris = new THREE.Points(debrisGeo, debrisMat);
  world.add(debris);

  function fireDebris(): void {
    for (let i = 0; i < DEBRIS_COUNT; i++) {
      debrisPos[i * 3] = (Math.random() - 0.5) * 0.3;
      debrisPos[i * 3 + 1] = (Math.random() - 0.5) * 0.3;
      debrisPos[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
      // Spherical ejection with bias toward equatorial plane
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.PI / 2) + (Math.random() - 0.5) * 1.5; // bias toward equator
      const speed = 4 + Math.random() * 14;
      debrisVel[i].set(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.cos(phi) * speed * 0.6, // flatter ejection
        Math.sin(phi) * Math.sin(theta) * speed,
      );
      // Color: hot white → yellow → orange → red (blackbody cooling)
      const heat = Math.random();
      const temp = mix(50000.0, 3000.0, 1.0 - heat);
      const c = new THREE.Color();
      // Manual blackbody approximation
      if (heat > 0.7) { c.setRGB(1, 1, 0.95); } // white-hot
      else if (heat > 0.4) { c.setRGB(1, 0.85, 0.5); } // yellow
      else if (heat > 0.2) { c.setRGB(1, 0.5, 0.15); } // orange
      else { c.setRGB(0.8, 0.15, 0.05); } // deep red
      debrisCol[i * 3] = c.r;
      debrisCol[i * 3 + 1] = c.g;
      debrisCol[i * 3 + 2] = c.b;
      debrisLife[i] = 1;
    }
    debrisGeo.attributes.position.needsUpdate = true;
    debrisGeo.attributes.color.needsUpdate = true;
    debrisMat.opacity = 1;
  }

  // Helper for GLSL-like mix
  function mix(a: number, b: number, t: number): number { return a + (b - a) * t; }

  // ── Explosion flash (multi-layer: white core + warm halo) ──────────
  const flashCore = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffffff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  world.add(flashCore);
  const flashHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffaa44, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  world.add(flashHalo);

  // ── Point light (illuminates debris during explosion) ───────────────
  const explosionLight = new THREE.PointLight(0xfff2a8, 0, 30, 2);
  world.add(explosionLight);

  // ── Background stars ───────────────────────────────────────────────
  const STAR_COUNT = isUltra ? 600 : 300;
  const starPos = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 80;
    starPos[i * 3 + 1] = (Math.random() - 0.5) * 80;
    starPos[i * 3 + 2] = (Math.random() - 0.5) * 80;
  }
  const bgStarGeo = new THREE.BufferGeometry();
  bgStarGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const bgStars = new THREE.Points(bgStarGeo, new THREE.PointsMaterial({
    color: 0x99aacc, size: 0.06, transparent: true, opacity: 0.4, depthWrite: false,
  }));
  world.add(bgStars);

  // ── Animation state machine ─────────────────────────────────────────
  type Phase = 'stable' | 'destabilizing' | 'exploding' | 'aftermath';
  let phase: Phase = 'stable';
  let phaseT = 0;
  const STABLE_DURATION = 3;
  const DESTABILIZE_DURATION = 2;
  const EXPLODE_DURATION = 2;
  const AFTERMATH_DURATION = 3;

  return {
    grabbables,
    background: 0x050308,
    view: { distance: 12, pitch: 0.35, yaw: 0.3 },
    update(dt: number, elapsed: number): void {
      const seqDt = Math.min(dt, 0.05); // clamp for low FPS
      phaseT += seqDt;
      starMat.uniforms.uTime.value = elapsed;

      if (phase === 'stable') {
        // Gentle pulse with Perlin noise surface
        const pulse = 1 + Math.sin(elapsed * 1.2) * 0.025;
        star.scale.setScalar(pulse);
        starMat.uniforms.uIntensity.value = 1 + Math.sin(elapsed * 1.5) * 0.08;
        starMat.uniforms.uCollapse.value = 0;

        // Corona breathing
        for (let i = 0; i < coronaLayers.length; i++) {
          const base = 4 + i * 2.5;
          const breathe = base + Math.sin(elapsed * (1.2 + i * 0.3)) * 0.4;
          coronaLayers[i].scale.set(breathe, breathe, 1);
          (coronaLayers[i].material as THREE.SpriteMaterial).opacity = 0.25 - i * 0.05 + Math.sin(elapsed * 1.5) * 0.03;
        }

        if (phaseT >= STABLE_DURATION) {
          phase = 'destabilizing';
          phaseT = 0;
        }
      } else if (phase === 'destabilizing') {
        const t = phaseT / DESTABILIZE_DURATION;
        const smoothT = t * t * (3 - 2 * t);

        // Star swells and destabilizes
        const pulse = 1 + smoothT * 0.5 + Math.sin(elapsed * (3 + smoothT * 15)) * smoothT * 0.08;
        star.scale.setScalar(pulse);
        starMat.uniforms.uIntensity.value = 1 + smoothT * 2;
        starMat.uniforms.uCollapse.value = smoothT;

        // Corona flares dramatically
        for (let i = 0; i < coronaLayers.length; i++) {
          const flare = 4 + i * 2.5 + smoothT * 8 + Math.sin(elapsed * (8 + i * 3)) * smoothT * 2;
          coronaLayers[i].scale.set(flare, flare, 1);
          (coronaLayers[i].material as THREE.SpriteMaterial).opacity = 0.25 + smoothT * 0.5;
        }

        // Escalating tremors
        if (Math.sin(elapsed * 18) > 0.7) shakeCamera(smoothT * 0.3);

        if (phaseT >= DESTABILIZE_DURATION) {
          phase = 'exploding';
          phaseT = 0;
          shakeCamera(1.2);
          flashCore.scale.set(0.1, 0.1, 1);
          flashHalo.scale.set(0.1, 0.1, 1);
          (flashCore.material as THREE.SpriteMaterial).opacity = 1;
          (flashHalo.material as THREE.SpriteMaterial).opacity = 0.8;
          fireDebris();
          for (const s of shocks) s.visible = true;
          shockSphere.visible = true;
          star.visible = false;
          fresnelGlow.visible = false;
          explosionLight.intensity = 50;
        }
      } else if (phase === 'exploding') {
        const t = phaseT / EXPLODE_DURATION;

        // Multi-layer flash decay
        const coreOp = (flashCore.material as THREE.SpriteMaterial);
        const haloOp = (flashHalo.material as THREE.SpriteMaterial);
        coreOp.opacity = Math.max(0, 1 - t * 1.5);
        haloOp.opacity = Math.max(0, 0.8 * (1 - t));
        const fs = 0.1 + t * 25;
        flashCore.scale.set(fs, fs, 1);
        const hs = 0.1 + t * 35;
        flashHalo.scale.set(hs, hs, 1);

        // Volumetric shock sphere
        const sphereScale = 1 + t * 12;
        shockSphere.scale.setScalar(sphereScale);
        (shockSphere.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.6 * (1 - t * 1.5));

        // Flat shockwave rings (6 rings, staggered, expanding fast)
        shocks.forEach((shock, i) => {
          const lt = phaseT - i * 0.1;
          const k = Math.min(Math.max(lt / 1.0, 0), 1);
          (shock.material as THREE.MeshBasicMaterial).opacity = 0.9 * Math.pow(1 - k, 1.3);
          const sc = 0.9 + k * 18;
          shock.scale.set(sc, sc, 1);
          shock.visible = k < 1;
        });

        // Explosion light fades
        explosionLight.intensity = Math.max(0, 50 * (1 - t * 1.5));

        // Debris physics
        for (let i = 0; i < DEBRIS_COUNT; i++) {
          if (debrisLife[i] <= 0) continue;
          debrisLife[i] -= seqDt * 0.25;
          debrisPos[i * 3] += debrisVel[i].x * seqDt;
          debrisPos[i * 3 + 1] += debrisVel[i].y * seqDt;
          debrisPos[i * 3 + 2] += debrisVel[i].z * seqDt;
          debrisVel[i].multiplyScalar(1 - seqDt * 0.4);
          if (debrisLife[i] <= 0) debrisPos[i * 3 + 1] = -999;
        }
        debrisGeo.attributes.position.needsUpdate = true;
        debrisMat.opacity = Math.max(0, 1 - t * 0.3);

        // Fade corona
        for (const c of coronaLayers) {
          (c.material as THREE.SpriteMaterial).opacity *= Math.exp(-seqDt * 3);
        }

        if (phaseT >= EXPLODE_DURATION) {
          phase = 'aftermath';
          phaseT = 0;
          shockSphere.visible = false;
        }
      } else if (phase === 'aftermath') {
        // Debris drifts + fades slowly
        for (let i = 0; i < DEBRIS_COUNT; i++) {
          if (debrisLife[i] <= 0) continue;
          debrisLife[i] -= seqDt * 0.15;
          debrisPos[i * 3] += debrisVel[i].x * seqDt;
          debrisPos[i * 3 + 1] += debrisVel[i].y * seqDt;
          debrisPos[i * 3 + 2] += debrisVel[i].z * seqDt;
          debrisVel[i].multiplyScalar(1 - seqDt * 0.15);
          if (debrisLife[i] <= 0) debrisPos[i * 3 + 1] = -999;
        }
        debrisGeo.attributes.position.needsUpdate = true;
        debrisMat.opacity *= Math.exp(-seqDt * 0.3);

        // Explosion light fades to zero
        explosionLight.intensity *= Math.exp(-seqDt * 2);

        if (phaseT >= AFTERMATH_DURATION) {
          phase = 'stable';
          phaseT = 0;
          star.visible = true;
          fresnelGlow.visible = true;
          star.scale.setScalar(1);
          starMat.uniforms.uIntensity.value = 1;
          starMat.uniforms.uCollapse.value = 0;
          for (let i = 0; i < coronaLayers.length; i++) {
            const base = 4 + i * 2.5;
            coronaLayers[i].scale.set(base, base, 1);
            (coronaLayers[i].material as THREE.SpriteMaterial).opacity = 0.25 - i * 0.05;
          }
          for (let i = 0; i < DEBRIS_COUNT; i++) { debrisPos[i * 3 + 1] = -999; debrisLife[i] = 0; }
          debrisGeo.attributes.position.needsUpdate = true;
          debrisMat.opacity = 0;
          flashCore.visible = false;
          flashHalo.visible = false;
          for (const s of shocks) s.visible = false;
          explosionLight.intensity = 0;
        }
      }
    },
    bodyInfo() {
      if (phase === 'exploding') return 'SUPERNOVA — core collapse in progress';
      if (phase === 'destabilizing') return 'Star destabilizing — supernova imminent';
      if (phase === 'aftermath') return 'Stellar remnant dispersing';
      return 'Red supergiant — stable';
    },
    coachHint() {
      if (phase === 'stable') return 'A red supergiant — waiting to go supernova';
      if (phase === 'destabilizing') return 'The star is collapsing…';
      if (phase === 'exploding') return 'SUPERNOVA — core collapse!';
      return 'Stellar debris dispersing into the void…';
    },
    dispose() { disposeGroup(world); },
  };
}
