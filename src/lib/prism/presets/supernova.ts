// SUPERNOVA preset: a massive red supergiant that destabilizes and explodes.
//
// Visual systems (cinematic tier):
//  • Volumetric star surface — vertex shader physically displaces vertices
//    using Perlin noise (the photosphere visibly buckles & heaves).
//  • Chromosphere shell — a slightly larger transparent sphere with a
//    noise-driven alpha shader (the thin pinkish-red gas layer).
//  • Solar prominences — 5 TubeGeometry tendrils along CatmullRom curves
//    that arc out from the surface and back; flare & stretch during collapse.
//  • God rays — 10 thin ConeGeometry meshes radiating outward from the
//    star, additive, low opacity, slowly rotating; longer during explosion.
//  • Multi-component lens flare — bright core halo + anamorphic streak +
//    6 radial spikes + chromatic ring; intensifies during destabilization
//    and flashes blindingly during explosion.
//  • 4-phase sequence — stable → destabilizing → exploding → aftermath.
//    Stable: solar wind particles stream outward; subtle prominences.
//    Destabilizing: surface bulges, pre-flare micro-shockwaves, lens flare ramp.
//    Explosion: blinding flash, 3 concentric shock spheres (white→yellow→orange),
//               6 flat rings, debris with trails + per-particle tumbling + gas puffs,
//               brief rainbow "chromatic aberration" tint on debris.
//    Aftermath: slowly expanding nebula remnant (oxygen green + hydrogen red),
//               camera pulls back to reveal the dispersing cloud.
//  • Background — procedural nebula sphere + twinkling colored starfield.
//
// Noise + blackbody from: ggwzrd/threejs-galaxy (MIT) + vlwkaos/threejs-blackhole (ISC)

import * as THREE from 'three';
import { disposeGroup, type BuilderCtx, type WorldAPI } from './types';
import { NOISE_GLSL } from './noise_glsl';
import { createFresnelGlow } from './fresnel';

export function buildSupernova(ctx: BuilderCtx): WorldAPI {
  const { world, glowTex, nebulaTex, shakeCamera, quality } = ctx;
  const grabbables: THREE.Object3D[] = [];
  const isUltra = quality === 'ultra';
  const isHigh = quality === 'high';
  const isHighOrUltra = isHigh || isUltra;

  // GLSL-like mix helper (kept local for parity with the original).
  function mix(a: number, b: number, t: number): number { return a + (b - a) * t; }

  // ───────────────────────────────────────────────────────────────────
  // 1. STAR (photosphere) — vertex-displaced Perlin noise surface.
  // ───────────────────────────────────────────────────────────────────
  // Higher detail now because vertices physically displace — extra
  // tessellation smooths the heaving surface (was detail 2/3, now 3/4).
  const starGeo = new THREE.IcosahedronGeometry(1.3, isUltra ? 5 : isHigh ? 4 : 3);
  const starVert = NOISE_GLSL + /* glsl */ `
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying vec3 vPos;
    varying float vDisp;
    uniform float uTime;
    uniform float uIntensity;
    uniform float uCollapse;

    void main() {
      vPos = position;
      // Subtle photosphere buckle in stable phase (0.04 amplitude);
      // multiplicative amplification during collapse (×3 peak → ~0.15).
      vec3 p = position * 2.0 + vec3(uTime * 0.3);
      float n1 = cnoise(p);
      float disp = n1 * 0.04;
      disp *= 1.0 + uCollapse * 2.0;
      if (uCollapse > 0.01) {
        float n2 = cnoise(p * 3.0 + vec3(uTime * 0.2)) * 0.3;
        float gran = cnoise(position * 8.0 + uTime * 0.1) * 0.15;
        disp += (n2 * 0.06 + gran * 0.025) * uCollapse;
      }
      // Sharp protuberances during late collapse (final heave before detonation).
      disp += uCollapse * uCollapse * 0.25 * smoothstep(0.45, 1.0, n1);
      vDisp = disp;

      vec3 displaced = position + normal * disp;
      vNormal = normalize(normalMatrix * normal);
      vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
      vWorldPos = worldPos.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `;

  const starFrag = NOISE_GLSL + /* glsl */ `
    precision highp float;
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying vec3 vPos;
    varying float vDisp;
    uniform float uTime;
    uniform float uIntensity;
    uniform float uCollapse;

    void main() {
      // 2 octaves of Perlin noise on low/medium, 3 on high/ultra.
      vec3 p = vPos * 2.0 + vec3(0.0, uTime * 0.3, 0.0);
      float n1 = cnoise(p);
      float turb = n1 * 0.5;
      float n2 = 0.0;
      float gran = 0.0;
      if (uCollapse > 0.01 || uIntensity > 1.5) {
        n2 = cnoise(p * 3.0 + vec3(uTime * 0.2)) * 0.3;
        gran = cnoise(vPos * 8.0 + uTime * 0.1) * 0.15;
        turb += n2 + gran;
      }
      turb = 0.5 + 0.5 * turb;

      // Fresnel rim
      vec3 viewDir = normalize(cameraPosition - vWorldPos);
      float fresnel = pow(1.0 - max(0.0, dot(vNormal, viewDir)), 2.5);

      // Blackbody temperature: RED SUPERGIANT in stable phase (2800-4500K).
      // Heats toward blue-white ONLY during collapse (uCollapse 0→1).
      float tempMax = mix(4500.0, 13000.0, uCollapse);
      float baseTemp = mix(2800.0, tempMax, turb);
      baseTemp += gran * 1500.0;
      baseTemp *= (1.0 + uCollapse * 2.5 + max(0.0, uIntensity - 1.0) * 0.8);
      // Hot ridges where displacement peaks (visible buckling).
      baseTemp += max(0.0, vDisp) * 6000.0;
      vec3 col = temp_to_color(baseTemp);

      // Bright hot spots where noise peaks (warmer during collapse).
      float hotspots = smoothstep(0.6, 1.0, turb);
      col += vec3(1.0, 0.85, 0.6) * hotspots * 0.35 * (1.0 + uCollapse * 1.5);

      // Fresnel rim glow (atmospheric edge).
      col += vec3(1.0, 0.7, 0.3) * fresnel * (0.3 + uCollapse * 0.7);

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
  const star = new THREE.Mesh(starGeo, starMat);
  world.add(star);

  // ── Fresnel glow shell (atmospheric edge) ──────────────────────────
  const fresnelGlow = createFresnelGlow(1.3, 0xffaa44, 0x000000);
  star.add(fresnelGlow);

  // ───────────────────────────────────────────────────────────────────
  // 2. CHROMOSPHERE — slightly-larger transparent shell with noise alpha.
  // ───────────────────────────────────────────────────────────────────
  const chromoGeo = new THREE.IcosahedronGeometry(1.45, isUltra ? 4 : isHigh ? 3 : 2);
  const chromoMat = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 1 },
      uCollapse: { value: 0 },
      uColor: { value: new THREE.Color(0xff4466) },
    },
    vertexShader: NOISE_GLSL + /* glsl */ `
      varying vec3 vPos;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      uniform float uTime;
      uniform float uCollapse;
      void main() {
        vPos = position;
        // Gentle gas-layer displacement, sharper during collapse.
        vec3 p = position * 2.5 + vec3(uTime * 0.4);
        float n = cnoise(p);
        float disp = n * 0.05 + uCollapse * 0.12 * n;
        vec3 displaced = position + normal * disp;
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: NOISE_GLSL + /* glsl */ `
      precision highp float;
      varying vec3 vPos;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      uniform float uTime;
      uniform float uIntensity;
      uniform float uCollapse;
      uniform vec3 uColor;
      void main() {
        vec3 p = vPos * 3.0 + vec3(uTime * 0.4);
        float n = cnoise(p) * 0.5 + 0.5;
        float n2 = cnoise(p * 2.0) * 0.5 + 0.5;
        float alpha = n * n2;
        // Fresnel makes the limb brighter (the chromosphere is a thin shell).
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - max(0.0, dot(vNormal, viewDir)), 2.0);
        alpha *= fresnel * 0.7 + 0.15;
        vec3 col = mix(uColor, vec3(1.0, 0.6, 0.4), uCollapse);
        col += uIntensity * 0.3;
        gl_FragColor = vec4(col, alpha * (0.4 + uCollapse * 0.6));
      }
    `,
  });
  const chromosphere = new THREE.Mesh(chromoGeo, chromoMat);
  star.add(chromosphere);

  // ───────────────────────────────────────────────────────────────────
  // 3. SOLAR PROMINENCES — 5 bright tendrils arcing out & back.
  //    TubeGeometry along a CatmullRom curve, additive emissive shader.
  //    Gated on high/ultra (tube meshes are non-trivial).
  // ───────────────────────────────────────────────────────────────────
  type Prominence = { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; baseArc: number; phase: number; axis: THREE.Vector3 };
  const prominences: Prominence[] = [];
  const PROMI_COUNT = isHighOrUltra ? 4 : 0;
  for (let i = 0; i < PROMI_COUNT; i++) {
    const d1 = new THREE.Vector3().randomDirection();
    const d2 = d1.clone().add(new THREE.Vector3().randomDirection().multiplyScalar(0.35)).normalize();
    const arcHeight = 2.6 + Math.random() * 1.6;
    const start = d1.clone().multiplyScalar(1.3);
    const end = d2.clone().multiplyScalar(1.3);
    const midDir = d1.clone().add(d2).multiplyScalar(0.5).normalize();
    const mid = midDir.clone().multiplyScalar(arcHeight);
    const c1 = start.clone().lerp(mid, 0.35).multiplyScalar(1.05);
    const c2 = end.clone().lerp(mid, 0.35).multiplyScalar(1.05);
    const curve = new THREE.CatmullRomCurve3([start, c1, mid, c2, end]);
    const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.07, 6, false);
    const tubeMat = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 1 },
        uCollapse: { value: 0 },
        uColor: { value: new THREE.Color(0xff5522) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform float uTime;
        uniform float uIntensity;
        uniform float uCollapse;
        uniform vec3 uColor;
        void main() {
          // Brighter in the middle of the arc (uv.y ~ 0.5).
          float bright = sin(vUv.y * 3.14159);
          bright = pow(bright, 0.7);
          // Subtle traveling flicker.
          float flick = 0.85 + 0.15 * sin(vUv.y * 25.0 - uTime * 4.0);
          vec3 col = mix(uColor, vec3(1.0, 0.9, 0.7), bright * (0.4 + uCollapse * 0.6));
          col *= uIntensity * flick;
          float alpha = bright * (0.4 + uCollapse * 0.5);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    star.add(tube);
    prominences.push({ mesh: tube, mat: tubeMat, baseArc: arcHeight, phase: Math.random() * Math.PI * 2, axis: midDir });
  }

  // ───────────────────────────────────────────────────────────────────
  // 4. GOD RAYS — 10 thin cone meshes radiating outward; slowly rotating.
  //    Gated on high/ultra (translucent cone fills are non-trivial).
  // ───────────────────────────────────────────────────────────────────
  const godRayGroup = new THREE.Group();
  const godRays: THREE.Mesh[] = [];
  const GODRAY_COUNT = isHighOrUltra ? 10 : 0;
  for (let i = 0; i < GODRAY_COUNT; i++) {
    // Fibonacci sphere distribution for even coverage.
    const t = (i + 0.5) / GODRAY_COUNT;
    const phi = Math.acos(1 - 2 * t);
    const theta = i * 2.39996; // golden angle
    const dir = new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    );
    // Cone: narrow tip near star surface, wider far outward (sunbeam look).
    const coneHeight = 6;
    const coneRadius = 0.7;
    const coneGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 8, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xffcc88, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    // Orient cone +Y axis to -dir so tip points inward (at star), base outward.
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
    cone.quaternion.copy(q);
    // Place center so tip sits at radius 1.3, base at radius 1.3 + coneHeight.
    cone.position.copy(dir).multiplyScalar(1.3 + coneHeight * 0.5);
    godRayGroup.add(cone);
    godRays.push(cone);
  }
  godRayGroup.visible = GODRAY_COUNT > 0;
  world.add(godRayGroup);

  // ───────────────────────────────────────────────────────────────────
  // 5. LENS FLARE — core halo + anamorphic streak + radial spikes + chromatic ring.
  //    Built from sprites (always face the camera) + a procedural ring texture.
  // ───────────────────────────────────────────────────────────────────
  const lensFlareGroup = new THREE.Group();
  world.add(lensFlareGroup);

  // 5a. Bright core halo (scales with star brightness).
  const flareCoreHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffffff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  flareCoreHalo.scale.set(2.0, 2.0, 1);
  lensFlareGroup.add(flareCoreHalo);

  // 5b. Horizontal anamorphic streak (cool blue, very wide & thin).
  const anamorphic = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0x88ccff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  anamorphic.scale.set(6, 0.3, 1);
  lensFlareGroup.add(anamorphic);

  // 5c. 4 radial spikes at 0°/45°/90°/135° (classic 4-point star pattern).
  const SPIKE_COUNT = 4;
  const spikeAngles = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4];
  const spikes: THREE.Sprite[] = [];
  for (let i = 0; i < SPIKE_COUNT; i++) {
    const angle = spikeAngles[i];
    const spike = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xfff2cc, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, rotation: angle,
    }));
    spike.scale.set(4, 0.2, 1);
    lensFlareGroup.add(spike);
    spikes.push(spike);
  }

  // 5d. Chromatic ring — procedural ring texture on a sprite.
  const ringTex = makeRingTexture();
  const chromaRingSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: ringTex, color: 0xffffff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  chromaRingSprite.scale.set(5.5, 5.5, 1);
  chromaRingSprite.material.userData.ownMap = true;
  lensFlareGroup.add(chromaRingSprite);

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

  // ───────────────────────────────────────────────────────────────────
  // 6. SHOCKWAVES — 3 concentric spheres (white→yellow→orange) + 6 flat rings.
  // ───────────────────────────────────────────────────────────────────
  const shockSpheres: THREE.Mesh[] = [
    new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide })),
    new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0xffeeaa, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide })),
    new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0xff8844, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide })),
  ];
  shockSpheres.forEach((s) => { s.visible = false; world.add(s); });

  // Flat shockwave rings (expanding in the orbital plane).
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

  // ── Pre-flare micro-shockwaves (small expanding rings during destabilizing) ──
  const microShocks: THREE.Mesh[] = [];
  const MICRO_COUNT = 3;
  for (let i = 0; i < MICRO_COUNT; i++) {
    const r = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.0, 64),
      new THREE.MeshBasicMaterial({
        color: 0xffaa66, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    r.rotation.x = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
    r.rotation.z = Math.random() * Math.PI * 2;
    r.visible = false;
    world.add(r);
    microShocks.push(r);
  }
  // Per micro-shock: trigger time (set during destabilizing), scale, opacity.
  // Spec: stagger spawns at 0.5s, 1.0s, 1.5s into the 2s destabilizing phase.
  const microShockState: Array<{ triggerT: number; fired: boolean; t: number }> = [];
  for (let i = 0; i < MICRO_COUNT; i++) {
    microShockState.push({ triggerT: 0.5 + i * 0.5, fired: false, t: 0 });
  }

  // ───────────────────────────────────────────────────────────────────
  // 7. DEBRIS — 2 systems: sparks (Points w/ rotation+trails) & hot-gas puffs.
  // ───────────────────────────────────────────────────────────────────
  const DEBRIS_COUNT = isUltra ? 800 : isHigh ? 500 : 250;
  const TRAIL_POINTS = 6;
  const TRAIL_SEGS = TRAIL_POINTS - 1;

  // Per-particle state.
  const debrisPos = new Float32Array(DEBRIS_COUNT * 3);
  const debrisCol = new Float32Array(DEBRIS_COUNT * 3);
  const debrisSize = new Float32Array(DEBRIS_COUNT);
  const debrisAngle = new Float32Array(DEBRIS_COUNT);     // current rotation
  const debrisRotVel = new Float32Array(DEBRIS_COUNT);    // rotation velocity
  const debrisElong = new Float32Array(DEBRIS_COUNT);     // 1=circular, >1=stretched
  const debrisVel: THREE.Vector3[] = [];
  const debrisLife = new Float32Array(DEBRIS_COUNT);
  const debrisHeat = new Float32Array(DEBRIS_COUNT);      // 0..1 hot
  const debrisTrailHist: Float32Array = new Float32Array(DEBRIS_COUNT * TRAIL_POINTS * 3);

  for (let i = 0; i < DEBRIS_COUNT; i++) {
    debrisVel.push(new THREE.Vector3());
    debrisLife[i] = 0;
    debrisPos[i * 3 + 1] = -999;
    debrisSize[i] = 0.5 + Math.random() * 1.5;
    debrisElong[i] = 1.0 + Math.random() * 1.5;
    debrisRotVel[i] = (Math.random() - 0.5) * 6;
    for (let j = 0; j < TRAIL_POINTS; j++) {
      debrisTrailHist[i * TRAIL_POINTS * 3 + j * 3 + 1] = -999;
    }
  }

  const debrisGeo = new THREE.BufferGeometry();
  debrisGeo.setAttribute('position', new THREE.BufferAttribute(debrisPos, 3));
  debrisGeo.setAttribute('aColor', new THREE.BufferAttribute(debrisCol, 3));
  debrisGeo.setAttribute('aSize', new THREE.BufferAttribute(debrisSize, 1));
  debrisGeo.setAttribute('aAngle', new THREE.BufferAttribute(debrisAngle, 1));
  debrisGeo.setAttribute('aElong', new THREE.BufferAttribute(debrisElong, 1));

  // Custom shader: per-particle rotation + elongation + size.
  const debrisMat = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    uniforms: {
      uMap: { value: glowTex },
      uPixelRatio: { value: typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1 },
      uOpacity: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aAngle;
      attribute float aElong;
      attribute vec3 aColor;
      varying vec3 vColor;
      varying float vAngle;
      varying float vElong;
      uniform float uPixelRatio;
      void main() {
        vColor = aColor;
        vAngle = aAngle;
        vElong = aElong;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPos;
        // Sized to be clearly visible without swamping the screen.
        gl_PointSize = aSize * uPixelRatio * (60.0 / max(0.001, -mvPos.z));
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uMap;
      varying vec3 vColor;
      varying float vAngle;
      varying float vElong;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        // Rotate the point quad (per-particle tumble).
        float c = cos(vAngle);
        float s = sin(vAngle);
        uv = mat2(c, -s, s, c) * uv;
        // Elongate (stretch along major axis after rotation).
        uv.x /= vElong;
        uv += 0.5;
        vec4 tex = texture2D(uMap, uv);
        if (tex.a < 0.01) discard;
        gl_FragColor = vec4(vColor * tex.rgb * 1.5, tex.a);
      }
    `,
  });
  const debris = new THREE.Points(debrisGeo, debrisMat);
  world.add(debris);

  // ── Debris trails (LineSegments tracking the last 8 positions per particle).
  //    Gated on high/ultra — LineSegments with thousands of vertices is heavy.
  // ───────────────────────────────────────────────────────────────────
  const trailPositions = new Float32Array(DEBRIS_COUNT * TRAIL_SEGS * 2 * 3);
  const trailColors = new Float32Array(DEBRIS_COUNT * TRAIL_SEGS * 2 * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
  const trailMat = new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const trailLines = new THREE.LineSegments(trailGeo, trailMat);
  trailLines.visible = false;
  world.add(trailLines);

  // ── Hot-gas puffs — larger, slower, fade faster. ────────────────────
  const PUFF_COUNT = isUltra ? 220 : isHigh ? 120 : 60;
  const puffPos = new Float32Array(PUFF_COUNT * 3);
  const puffCol = new Float32Array(PUFF_COUNT * 3);
  const puffSize = new Float32Array(PUFF_COUNT);
  const puffVel: THREE.Vector3[] = [];
  const puffLife = new Float32Array(PUFF_COUNT);
  const puffMaxLife = new Float32Array(PUFF_COUNT);
  for (let i = 0; i < PUFF_COUNT; i++) {
    puffVel.push(new THREE.Vector3());
    puffLife[i] = 0;
    puffPos[i * 3 + 1] = -999;
    puffSize[i] = 2.5 + Math.random() * 3.5;
  }
  const puffGeo = new THREE.BufferGeometry();
  puffGeo.setAttribute('position', new THREE.BufferAttribute(puffPos, 3));
  puffGeo.setAttribute('color', new THREE.BufferAttribute(puffCol, 3));
  puffGeo.setAttribute('size', new THREE.BufferAttribute(puffSize, 1));
  const puffMat = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    uniforms: {
      uMap: { value: glowTex },
      uPixelRatio: { value: typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1 },
      uOpacity: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute vec3 color;
      varying vec3 vColor;
      uniform float uPixelRatio;
      void main() {
        vColor = color;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPos;
        gl_PointSize = size * uPixelRatio * (60.0 / max(0.001, -mvPos.z));
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uMap;
      varying vec3 vColor;
      void main() {
        vec4 tex = texture2D(uMap, gl_PointCoord);
        if (tex.a < 0.01) discard;
        gl_FragColor = vec4(vColor * tex.rgb * 1.4, tex.a);
      }
    `,
  });
  const puffs = new THREE.Points(puffGeo, puffMat);
  world.add(puffs);

  // ── JS blackbody approximation matching the GLSL temp_to_color ──────
  function heatToColor(heat: number, out: THREE.Color): void {
    // heat: 0 (cold) → 1 (white-hot).
    if (heat > 0.88) out.setRGB(1.0, 1.0, 0.97);          // white-hot
    else if (heat > 0.72) out.setRGB(1.0, 0.95, 0.72);    // bright pale yellow
    else if (heat > 0.55) out.setRGB(1.0, 0.85, 0.5);     // yellow
    else if (heat > 0.35) out.setRGB(1.0, 0.55, 0.18);    // orange
    else if (heat > 0.18) out.setRGB(0.92, 0.25, 0.08);   // red
    else if (heat > 0.06) out.setRGB(0.42, 0.09, 0.03);   // dark red
    else out.setRGB(0.10, 0.05, 0.03);                    // near-black
  }

  function fireDebris(): void {
    const tmp = new THREE.Color();
    for (let i = 0; i < DEBRIS_COUNT; i++) {
      debrisPos[i * 3] = (Math.random() - 0.5) * 0.3;
      debrisPos[i * 3 + 1] = (Math.random() - 0.5) * 0.3;
      debrisPos[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
      // Spherical ejection with bias toward equatorial plane.
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.PI / 2) + (Math.random() - 0.5) * 1.5;
      const speed = 4 + Math.random() * 14;
      debrisVel[i].set(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.cos(phi) * speed * 0.6,
        Math.sin(phi) * Math.sin(theta) * speed,
      );
      debrisHeat[i] = 0.7 + Math.random() * 0.3;  // start very hot
      debrisAngle[i] = Math.random() * Math.PI * 2;
      debrisLife[i] = 1;
      // Initialize trail history at the spawn position.
      for (let j = 0; j < TRAIL_POINTS; j++) {
        debrisTrailHist[i * TRAIL_POINTS * 3 + j * 3] = debrisPos[i * 3];
        debrisTrailHist[i * TRAIL_POINTS * 3 + j * 3 + 1] = debrisPos[i * 3 + 1];
        debrisTrailHist[i * TRAIL_POINTS * 3 + j * 3 + 2] = debrisPos[i * 3 + 2];
      }
      heatToColor(debrisHeat[i], tmp);
      debrisCol[i * 3] = tmp.r;
      debrisCol[i * 3 + 1] = tmp.g;
      debrisCol[i * 3 + 2] = tmp.b;
    }
    debrisGeo.attributes.position.needsUpdate = true;
    debrisGeo.attributes.aColor.needsUpdate = true;
    debrisGeo.attributes.aAngle.needsUpdate = true;
    debrisMat.uniforms.uOpacity.value = 1;

    // Hot-gas puffs: slower, larger, fade faster.
    for (let i = 0; i < PUFF_COUNT; i++) {
      puffPos[i * 3] = (Math.random() - 0.5) * 0.5;
      puffPos[i * 3 + 1] = (Math.random() - 0.5) * 0.5;
      puffPos[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.PI / 2) + (Math.random() - 0.5) * 1.5;
      const speed = 1.5 + Math.random() * 5;
      puffVel[i].set(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.cos(phi) * speed * 0.7,
        Math.sin(phi) * Math.sin(theta) * speed,
      );
      // Puff heat varies: some cool (orange), some hot (yellow-white).
      const heat = 0.4 + Math.random() * 0.5;
      heatToColor(heat, tmp);
      // Boost brightness for puffs (additive).
      puffCol[i * 3] = tmp.r * 1.4;
      puffCol[i * 3 + 1] = tmp.g * 1.4;
      puffCol[i * 3 + 2] = tmp.b * 1.4;
      puffLife[i] = 1;
      puffMaxLife[i] = 0.6 + Math.random() * 0.6;
    }
    puffGeo.attributes.position.needsUpdate = true;
    puffGeo.attributes.color.needsUpdate = true;
    puffMat.uniforms.uOpacity.value = 1;

    if (isHighOrUltra) {
      trailLines.visible = true;
      trailMat.opacity = 1;
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 8. EXPLOSION FLASH (multi-layer) + NEBULA REMNANT.
  // ───────────────────────────────────────────────────────────────────
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

  // Nebula remnant — slowly expanding element-colored cloud (aftermath).
  const REMNANT_COUNT = isUltra ? 400 : isHigh ? 240 : 130;
  const remnantPos = new Float32Array(REMNANT_COUNT * 3);
  const remnantCol = new Float32Array(REMNANT_COUNT * 3);
  const remnantSize = new Float32Array(REMNANT_COUNT);
  const remnantVel: THREE.Vector3[] = [];
  const remnantLife = new Float32Array(REMNANT_COUNT);
  for (let i = 0; i < REMNANT_COUNT; i++) {
    remnantVel.push(new THREE.Vector3());
    remnantLife[i] = 0;
    remnantPos[i * 3 + 1] = -999;
    remnantSize[i] = 6 + Math.random() * 8;
    // Element-tinted: hydrogen red / oxygen green / sulfur yellow / nitrogen blue.
    const elt = Math.random();
    if (elt < 0.4) { remnantCol[i*3]=1.0; remnantCol[i*3+1]=0.25; remnantCol[i*3+2]=0.35; }     // Hα red
    else if (elt < 0.7) { remnantCol[i*3]=0.3; remnantCol[i*3+1]=1.0; remnantCol[i*3+2]=0.45; }  // OIII green
    else if (elt < 0.88) { remnantCol[i*3]=1.0; remnantCol[i*3+1]=0.85; remnantCol[i*3+2]=0.25; }// SII yellow
    else { remnantCol[i*3]=0.35; remnantCol[i*3+1]=0.5; remnantCol[i*3+2]=1.0; }                  // NII blue
  }
  const remnantGeo = new THREE.BufferGeometry();
  remnantGeo.setAttribute('position', new THREE.BufferAttribute(remnantPos, 3));
  remnantGeo.setAttribute('color', new THREE.BufferAttribute(remnantCol, 3));
  remnantGeo.setAttribute('size', new THREE.BufferAttribute(remnantSize, 1));
  const remnantMat = new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: {
      uMap: { value: glowTex },
      uPixelRatio: { value: typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1 },
      uOpacity: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute vec3 color;
      varying vec3 vColor;
      uniform float uPixelRatio;
      void main() {
        vColor = color;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPos;
        gl_PointSize = size * uPixelRatio * (60.0 / max(0.001, -mvPos.z));
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uMap;
      varying vec3 vColor;
      void main() {
        vec4 tex = texture2D(uMap, gl_PointCoord);
        if (tex.a < 0.01) discard;
        gl_FragColor = vec4(vColor * tex.rgb * 1.3, tex.a);
      }
    `,
  });
  const remnant = new THREE.Points(remnantGeo, remnantMat);
  world.add(remnant);

  function fireRemnant(): void {
    for (let i = 0; i < REMNANT_COUNT; i++) {
      remnantPos[i * 3] = (Math.random() - 0.5) * 1.2;
      remnantPos[i * 3 + 1] = (Math.random() - 0.5) * 1.2;
      remnantPos[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.PI / 2) + (Math.random() - 0.5) * 1.2;
      // Slow drift so the nebula stays in frame during the aftermath pull-back.
      const speed = 0.3 + Math.random() * 1.0;
      remnantVel[i].set(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.cos(phi) * speed * 0.7,
        Math.sin(phi) * Math.sin(theta) * speed,
      );
      remnantLife[i] = 1;
    }
    remnantGeo.attributes.position.needsUpdate = true;
    remnantMat.uniforms.uOpacity.value = 1;
  }

  // ── Point light (illuminates debris during explosion) ───────────────
  const explosionLight = new THREE.PointLight(0xfff2a8, 0, 30, 2);
  world.add(explosionLight);

  // ───────────────────────────────────────────────────────────────────
  // 9. SOLAR WIND — 200 particles streaming outward during stable phase.
  // ───────────────────────────────────────────────────────────────────
  const WIND_COUNT = 200;
  const windPos = new Float32Array(WIND_COUNT * 3);
  const windVel: THREE.Vector3[] = [];
  const windLife = new Float32Array(WIND_COUNT);
  const windMaxLife = new Float32Array(WIND_COUNT);
  for (let i = 0; i < WIND_COUNT; i++) {
    windVel.push(new THREE.Vector3());
    windLife[i] = 0;
    windPos[i * 3 + 1] = -999;
    windMaxLife[i] = 1.6 + Math.random() * 0.8;
  }
  const windGeo = new THREE.BufferGeometry();
  windGeo.setAttribute('position', new THREE.BufferAttribute(windPos, 3));
  const windMat = new THREE.PointsMaterial({
    size: 0.18, color: 0xffaa66, transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    map: glowTex,
  });
  const wind = new THREE.Points(windGeo, windMat);
  world.add(wind);

  function spawnWindParticle(i: number): void {
    const dir = new THREE.Vector3().randomDirection();
    const r = 1.3;
    windPos[i * 3] = dir.x * r;
    windPos[i * 3 + 1] = dir.y * r;
    windPos[i * 3 + 2] = dir.z * r;
    windVel[i].copy(dir).multiplyScalar(1.8 + Math.random() * 2.2);
    windLife[i] = 1;
  }

  // ───────────────────────────────────────────────────────────────────
  // 10. BACKGROUND — nebula sphere + twinkling colored distant stars.
  // ───────────────────────────────────────────────────────────────────
  const nebulaBgMat = new THREE.MeshBasicMaterial({
    map: nebulaTex, side: THREE.BackSide, transparent: true, opacity: 0.55,
    depthWrite: false,
  });
  const nebulaBg = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), nebulaBgMat);
  world.add(nebulaBg);

  // Twinkling distant stars — custom shader with per-star phase + stellar color.
  const STAR_COUNT = isUltra ? 600 : 300;
  const starPos = new Float32Array(STAR_COUNT * 3);
  const starPhase = new Float32Array(STAR_COUNT);
  const starCol = new Float32Array(STAR_COUNT * 3);
  const tmpC = new THREE.Color();
  for (let i = 0; i < STAR_COUNT; i++) {
    // Distribute on a shell (further than nebulaBg radius).
    const r = 45 + Math.random() * 12;
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    starPos[i * 3] = Math.cos(th) * s * r;
    starPos[i * 3 + 1] = u * r;
    starPos[i * 3 + 2] = Math.sin(th) * s * r;
    starPhase[i] = Math.random();
    // Stellar-class color variance (O blue → M red).
    const cls = Math.random();
    if (cls < 0.05) tmpC.setRGB(0.6, 0.7, 1.0);          // O/B blue
    else if (cls < 0.25) tmpC.setRGB(0.85, 0.9, 1.0);    // A white
    else if (cls < 0.55) tmpC.setRGB(1.0, 1.0, 0.85);     // F/G yellow
    else if (cls < 0.85) tmpC.setRGB(1.0, 0.8, 0.55);    // K orange
    else tmpC.setRGB(1.0, 0.5, 0.4);                     // M red
    starCol[i * 3] = tmpC.r;
    starCol[i * 3 + 1] = tmpC.g;
    starCol[i * 3 + 2] = tmpC.b;
  }
  const bgStarGeo = new THREE.BufferGeometry();
  bgStarGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  bgStarGeo.setAttribute('aPhase', new THREE.BufferAttribute(starPhase, 1));
  bgStarGeo.setAttribute('aColor', new THREE.BufferAttribute(starCol, 3));
  const bgStarMat = new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uBoost: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aPhase;
      attribute vec3 aColor;
      varying vec3 vColor;
      varying float vTwinkle;
      uniform float uTime;
      void main() {
        vColor = aColor;
        vTwinkle = 0.4 + 0.6 * sin(uTime * 2.5 + aPhase * 6.2831);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPos;
        gl_PointSize = (2.4 + sin(uTime * 1.3 + aPhase * 6.2831) * 1.0) * (300.0 / max(0.001, -mvPos.z));
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vColor;
      varying float vTwinkle;
      uniform float uBoost;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;
        float a = (1.0 - d * 2.0) * vTwinkle * 0.85 * uBoost;
        gl_FragColor = vec4(vColor, a);
      }
    `,
  });
  const bgStars = new THREE.Points(bgStarGeo, bgStarMat);
  world.add(bgStars);

  // ───────────────────────────────────────────────────────────────────
  // 11. ANIMATION STATE MACHINE — stable → destabilizing → exploding → aftermath
  // ───────────────────────────────────────────────────────────────────
  type Phase = 'stable' | 'destabilizing' | 'exploding' | 'aftermath';
  let phase: Phase = 'stable';
  let phaseT = 0;
  let shakeJoltsScheduled = 0;
  let shakeJoltTimer = 0;
  const STABLE_DURATION = 3;
  const DESTABILIZE_DURATION = 2;
  const EXPLODE_DURATION = 2;
  const AFTERMATH_DURATION = 3.2;

  // Cinematic camera: returns null during stable (user has full rig control),
  // overrides during the cinematic phases for zoom-in / pull-back drama.
  let cinematicActive = false;
  let cinematicYaw = 0.3;
  let cinematicPitch = 0.35;
  let cinematicDist = 12;
  let targetDist = 12;

  const tmpCol = new THREE.Color();

  return {
    grabbables,
    background: 0x050308,
    view: { distance: 12, pitch: 0.35, yaw: 0.3 },
    get cinematicCamera() {
      return cinematicActive
        ? { yaw: cinematicYaw, pitch: cinematicPitch, distance: cinematicDist }
        : null;
    },
    update(dt: number, elapsed: number): void {
      const seqDt = Math.min(dt, 0.05); // clamp for low FPS
      phaseT += seqDt;
      starMat.uniforms.uTime.value = elapsed;
      chromoMat.uniforms.uTime.value = elapsed;
      bgStarMat.uniforms.uTime.value = elapsed;

      // ── Stable phase ────────────────────────────────────────────────
      if (phase === 'stable') {
        cinematicActive = false;  // user-controlled
        // Gentle pulse.
        const pulse = 1 + Math.sin(elapsed * 1.2) * 0.025;
        star.scale.setScalar(pulse);
        starMat.uniforms.uIntensity.value = 1 + Math.sin(elapsed * 1.5) * 0.08;
        starMat.uniforms.uCollapse.value = 0;
        chromoMat.uniforms.uIntensity.value = starMat.uniforms.uIntensity.value;
        chromoMat.uniforms.uCollapse.value = 0;

        // Corona breathing.
        for (let i = 0; i < coronaLayers.length; i++) {
          const base = 4 + i * 2.5;
          const breathe = base + Math.sin(elapsed * (1.2 + i * 0.3)) * 0.4;
          coronaLayers[i].scale.set(breathe, breathe, 1);
          (coronaLayers[i].material as THREE.SpriteMaterial).opacity = 0.25 - i * 0.05 + Math.sin(elapsed * 1.5) * 0.03;
        }

        // Lens flare: visible from the start (cinematic baseline).
        // Per spec: halo 0.6, anamorphic 0.4, spikes ~0.4.
        const idle = 0.6 + Math.sin(elapsed * 1.5) * 0.04;
        (flareCoreHalo.material as THREE.SpriteMaterial).opacity = idle;
        (anamorphic.material as THREE.SpriteMaterial).opacity = 0.4;
        for (const sp of spikes) (sp.material as THREE.SpriteMaterial).opacity = 0.4;
        (chromaRingSprite.material as THREE.SpriteMaterial).opacity = 0.3;

        // God rays: faint idle shimmer.
        for (const ray of godRays) {
          (ray.material as THREE.MeshBasicMaterial).opacity = 0.08 + Math.sin(elapsed * 0.7) * 0.02;
        }

        // Prominences: gentle pulse.
        for (const p of prominences) {
          const pulseP = 1 + Math.sin(elapsed * 1.5 + p.phase) * 0.08;
          p.mesh.scale.setScalar(pulseP);
          p.mat.uniforms.uTime.value = elapsed;
          p.mat.uniforms.uIntensity.value = starMat.uniforms.uIntensity.value;
          p.mat.uniforms.uCollapse.value = 0;
        }
        godRayGroup.rotation.y = elapsed * 0.04;
        godRayGroup.rotation.x = Math.sin(elapsed * 0.05) * 0.1;

        // Solar wind: spawn ~5/s per particle slot. Recycle dead slots.
        const spawnPer = 6;
        for (let k = 0; k < spawnPer; k++) {
          const idx = Math.floor(Math.random() * WIND_COUNT);
          if (windLife[idx] <= 0) spawnWindParticle(idx);
        }
        for (let i = 0; i < WIND_COUNT; i++) {
          if (windLife[i] <= 0) continue;
          windLife[i] -= seqDt / windMaxLife[i];
          windPos[i * 3] += windVel[i].x * seqDt;
          windPos[i * 3 + 1] += windVel[i].y * seqDt;
          windPos[i * 3 + 2] += windVel[i].z * seqDt;
          // Slight outward acceleration (solar wind accelerates).
          windVel[i].multiplyScalar(1 + seqDt * 0.5);
          if (windLife[i] <= 0) windPos[i * 3 + 1] = -999;
        }
        windGeo.attributes.position.needsUpdate = true;
        windMat.opacity = 0.7;

        if (phaseT >= STABLE_DURATION) {
          phase = 'destabilizing';
          phaseT = 0;
          cinematicActive = true;
          targetDist = 8;
          for (const m of microShockState) { m.fired = false; m.t = 0; }
        }
      }
      // ── Destabilizing phase ─────────────────────────────────────────
      else if (phase === 'destabilizing') {
        const t = phaseT / DESTABILIZE_DURATION;
        const smoothT = t * t * (3 - 2 * t);

        // Slow zoom-in (cinematic).
        cinematicDist += (targetDist - cinematicDist) * Math.min(1, seqDt * 0.8);
        cinematicYaw = 0.3 + Math.sin(elapsed * 0.2) * 0.05;
        cinematicPitch = 0.35 + smoothT * 0.05;

        // Star swells & destabilizes.
        const pulse = 1 + smoothT * 0.5 + Math.sin(elapsed * (3 + smoothT * 15)) * smoothT * 0.08;
        star.scale.setScalar(pulse);
        starMat.uniforms.uIntensity.value = 1 + smoothT * 2;
        starMat.uniforms.uCollapse.value = smoothT;
        chromoMat.uniforms.uIntensity.value = starMat.uniforms.uIntensity.value;
        chromoMat.uniforms.uCollapse.value = smoothT;

        // Corona flares dramatically.
        for (let i = 0; i < coronaLayers.length; i++) {
          const flare = 4 + i * 2.5 + smoothT * 8 + Math.sin(elapsed * (8 + i * 3)) * smoothT * 2;
          coronaLayers[i].scale.set(flare, flare, 1);
          (coronaLayers[i].material as THREE.SpriteMaterial).opacity = 0.25 + smoothT * 0.5;
        }

        // Lens flare ramps from stable baseline up to near-blinding at detonation.
        const flareOp = 0.6 + smoothT * 0.4;
        (flareCoreHalo.material as THREE.SpriteMaterial).opacity = flareOp;
        (anamorphic.material as THREE.SpriteMaterial).opacity = 0.4 + smoothT * 0.4;
        const spikeOp = 0.4 + smoothT * 0.5;
        for (const sp of spikes) (sp.material as THREE.SpriteMaterial).opacity = spikeOp;
        (chromaRingSprite.material as THREE.SpriteMaterial).opacity = 0.3 + smoothT * 0.5;
        // Briefly rotate the anamorphic streak with camera framing (visual jitter).
        anamorphic.material.rotation = Math.sin(elapsed * 4) * 0.05;

        // God rays brighten & lengthen.
        for (const ray of godRays) {
          (ray.material as THREE.MeshBasicMaterial).opacity = 0.05 + smoothT * 0.12;
          ray.scale.set(1 + smoothT * 0.4, 1 + smoothT * 0.6, 1);
        }
        godRayGroup.rotation.y = elapsed * 0.04 + smoothT * 0.5;

        // Prominences flare & stretch outward.
        for (const p of prominences) {
          const flareP = 1 + Math.sin(elapsed * 4 + p.phase) * 0.15 + smoothT * 0.6;
          p.mesh.scale.setScalar(flareP);
          p.mat.uniforms.uTime.value = elapsed;
          p.mat.uniforms.uIntensity.value = 1 + smoothT * 2;
          p.mat.uniforms.uCollapse.value = smoothT;
        }

        // Pre-flare micro-shockwaves: 3 rings staggered at 0.5/1.0/1.5s (per spec).
        for (let i = 0; i < microShockState.length; i++) {
          const ms = microShockState[i];
          if (!ms.fired && phaseT >= ms.triggerT) {
            ms.fired = true;
            ms.t = 0;
            microShocks[i].visible = true;
          }
          if (ms.fired) {
            ms.t += seqDt;
            const k = Math.min(ms.t / 0.6, 1);  // 600ms lifetime
            // Opacity 0.8 → 0, scale 1 → 4 (per spec).
            (microShocks[i].material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
            const sc = 1 + k * 3;
            microShocks[i].scale.set(sc, sc, 1);
            if (k >= 1) microShocks[i].visible = false;
          }
        }

        // Solar wind fades.
        windMat.opacity *= Math.exp(-seqDt * 2);

        // Escalating tremors.
        if (Math.sin(elapsed * 18) > 0.7) shakeCamera(smoothT * 0.3);

        if (phaseT >= DESTABILIZE_DURATION) {
          phase = 'exploding';
          phaseT = 0;
          targetDist = 8;
          // ── DETONATION ──────────────────────────────────────────────
          shakeCamera(1.6);
          shakeJoltsScheduled = 3;       // 3 additional quick jolts
          shakeJoltTimer = 0.12;
          // Blinding flash: opacity 1.0, scale 15, fades over 400ms (per spec).
          flashCore.scale.set(15, 15, 1);
          flashHalo.scale.set(0.1, 0.1, 1);
          (flashCore.material as THREE.SpriteMaterial).opacity = 1.0;
          (flashHalo.material as THREE.SpriteMaterial).opacity = 0.9;
          // Lens flare flashes blindingly at explosion start (per spec).
          (flareCoreHalo.material as THREE.SpriteMaterial).opacity = 1.0;
          (anamorphic.material as THREE.SpriteMaterial).opacity = 1.0;
          for (const sp of spikes) (sp.material as THREE.SpriteMaterial).opacity = 1.0;
          (chromaRingSprite.material as THREE.SpriteMaterial).opacity = 1.0;
          fireDebris();
          fireRemnant();
          // Three concentric shock spheres stagger into life.
          shockSpheres.forEach((s, i) => { s.visible = true; s.scale.setScalar(1); (s.material as THREE.MeshBasicMaterial).opacity = 0; });
          // Trigger the flat rings + reuse them.
          for (const s of shocks) s.visible = true;
          // Hide the star surface & chromosphere; the flash takes over.
          star.visible = false;
          fresnelGlow.visible = false;
          chromosphere.visible = false;
          for (const p of prominences) p.mesh.visible = false;
          godRayGroup.visible = false;
          explosionLight.intensity = 80;
          // Background brighten (flash illuminates surrounding space).
          bgStarMat.uniforms.uBoost.value = 4.0;
          nebulaBgMat.opacity = 0.85;
        }
      }
      // ── Exploding phase ─────────────────────────────────────────────
      else if (phase === 'exploding') {
        const t = phaseT / EXPLODE_DURATION;

        // Keep the camera at the close distance; apply scheduled jolts.
        cinematicYaw = 0.3 + Math.sin(elapsed * 0.4) * 0.06;
        cinematicPitch = 0.4 + Math.sin(elapsed * 0.5) * 0.03;
        cinematicDist = 8;
        if (shakeJoltsScheduled > 0) {
          shakeJoltTimer -= seqDt;
          if (shakeJoltTimer <= 0) {
            shakeCamera(1.0);
            shakeJoltsScheduled--;
            shakeJoltTimer = 0.13;
          }
        }

        // Blinding flash decay: opacity = max(0, 1 - t/0.4) (per spec).
        // flashCore holds scale 15 (fills the screen briefly), then fades.
        // flashHalo provides a softer, longer afterglow for sustained feel.
        const coreOp = (flashCore.material as THREE.SpriteMaterial);
        const haloOp = (flashHalo.material as THREE.SpriteMaterial);
        coreOp.opacity = Math.max(0, 1 - phaseT / 0.4);  // 400ms decay
        flashCore.scale.set(15, 15, 1);
        const haloT = Math.min(phaseT / EXPLODE_DURATION, 1);
        haloOp.opacity = Math.max(0, 0.9 * (1 - haloT));
        const hs = 0.1 + haloT * 48;
        flashHalo.scale.set(hs, hs, 1);

        // 3 concentric shock spheres staggered (white → yellow → orange).
        for (let i = 0; i < shockSpheres.length; i++) {
          const offset = i * 0.12;
          const lt = Math.max(0, phaseT - offset);
          const k = Math.min(lt / 1.3, 1);
          const sc = 1 + k * 14;
          shockSpheres[i].scale.setScalar(sc);
          (shockSpheres[i].material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.7 * Math.pow(1 - k, 1.2));
        }

        // Flat shockwave rings (6 rings, staggered, expanding fast).
        shocks.forEach((shock, i) => {
          const lt = phaseT - i * 0.1;
          const k = Math.min(Math.max(lt / 1.0, 0), 1);
          (shock.material as THREE.MeshBasicMaterial).opacity = 0.9 * Math.pow(1 - k, 1.3);
          const sc = 0.9 + k * 18;
          shock.scale.set(sc, sc, 1);
          shock.visible = k < 1;
        });

        // Explosion light fades.
        explosionLight.intensity = Math.max(0, 80 * (1 - t * 1.5));

        // Background brighten decays.
        bgStarMat.uniforms.uBoost.value += (1.0 - bgStarMat.uniforms.uBoost.value) * Math.min(1, seqDt * 3);
        nebulaBgMat.opacity += (0.55 - nebulaBgMat.opacity) * Math.min(1, seqDt * 3);

        // ── Debris physics + per-particle rotation + cooling ──
        const chromaSpike = phaseT < 0.2;  // brief rainbow tint (chromatic-aberration proxy)
        for (let i = 0; i < DEBRIS_COUNT; i++) {
          if (debrisLife[i] <= 0) continue;
          debrisLife[i] -= seqDt * 0.25;
          debrisPos[i * 3] += debrisVel[i].x * seqDt;
          debrisPos[i * 3 + 1] += debrisVel[i].y * seqDt;
          debrisPos[i * 3 + 2] += debrisVel[i].z * seqDt;
          debrisVel[i].multiplyScalar(1 - seqDt * 0.4);
          debrisAngle[i] += debrisRotVel[i] * seqDt;
          // Cool heat over time → blackbody color shift.
          debrisHeat[i] = Math.max(0, debrisHeat[i] - seqDt * 0.18);
          if (chromaSpike) {
            // Rainbow tint by particle index (fades after 200ms).
            const blend = (0.2 - phaseT) / 0.2;
            const hue = (i / DEBRIS_COUNT + elapsed * 1.5) % 1;
            tmpCol.setHSL(hue, 1.0, 0.6);
            // Blend rainbow over the cooling color.
            heatToColor(debrisHeat[i], tmpC);
            tmpCol.lerp(tmpC, 1 - blend);
          } else {
            heatToColor(debrisHeat[i], tmpCol);
          }
          debrisCol[i * 3] = tmpCol.r;
          debrisCol[i * 3 + 1] = tmpCol.g;
          debrisCol[i * 3 + 2] = tmpCol.b;

          if (debrisLife[i] <= 0) debrisPos[i * 3 + 1] = -999;

          // Update trail history (shift + write newest).
          if (isHighOrUltra && trailLines.visible) {
            const base = i * TRAIL_POINTS * 3;
            // Shift history: oldest discarded, rest move down.
            for (let j = 0; j < TRAIL_POINTS - 1; j++) {
              debrisTrailHist[base + j * 3] = debrisTrailHist[base + (j + 1) * 3];
              debrisTrailHist[base + j * 3 + 1] = debrisTrailHist[base + (j + 1) * 3 + 1];
              debrisTrailHist[base + j * 3 + 2] = debrisTrailHist[base + (j + 1) * 3 + 2];
            }
            debrisTrailHist[base + (TRAIL_POINTS - 1) * 3] = debrisPos[i * 3];
            debrisTrailHist[base + (TRAIL_POINTS - 1) * 3 + 1] = debrisPos[i * 3 + 1];
            debrisTrailHist[base + (TRAIL_POINTS - 1) * 3 + 2] = debrisPos[i * 3 + 2];

            // Write line segments: seg j connects hist[j] → hist[j+1].
            const sBase = i * TRAIL_SEGS * 2 * 3;
            for (let j = 0; j < TRAIL_SEGS; j++) {
              const fromIdx = base + j * 3;
              const toIdx = base + (j + 1) * 3;
              trailPositions[sBase + j * 6] = debrisTrailHist[fromIdx];
              trailPositions[sBase + j * 6 + 1] = debrisTrailHist[fromIdx + 1];
              trailPositions[sBase + j * 6 + 2] = debrisTrailHist[fromIdx + 2];
              trailPositions[sBase + j * 6 + 3] = debrisTrailHist[toIdx];
              trailPositions[sBase + j * 6 + 4] = debrisTrailHist[toIdx + 1];
              trailPositions[sBase + j * 6 + 5] = debrisTrailHist[toIdx + 2];
              // Color: brighter near the newest end.
              const segT = j / (TRAIL_SEGS - 1);
              const segAlpha = segT * segT;
              trailColors[sBase + j * 6] = tmpCol.r * segAlpha;
              trailColors[sBase + j * 6 + 1] = tmpCol.g * segAlpha;
              trailColors[sBase + j * 6 + 2] = tmpCol.b * segAlpha;
              trailColors[sBase + j * 6 + 3] = tmpCol.r * (segAlpha + 0.05);
              trailColors[sBase + j * 6 + 4] = tmpCol.g * (segAlpha + 0.05);
              trailColors[sBase + j * 6 + 5] = tmpCol.b * (segAlpha + 0.05);
            }
          }
        }
        debrisGeo.attributes.position.needsUpdate = true;
        debrisGeo.attributes.aColor.needsUpdate = true;
        debrisGeo.attributes.aAngle.needsUpdate = true;
        debrisMat.uniforms.uOpacity.value = Math.max(0, 1 - t * 0.3);

        if (isHighOrUltra && trailLines.visible) {
          trailGeo.attributes.position.needsUpdate = true;
          trailGeo.attributes.color.needsUpdate = true;
          trailMat.opacity = Math.max(0, 1 - t * 0.5);
        }

        // Hot-gas puffs physics.
        for (let i = 0; i < PUFF_COUNT; i++) {
          if (puffLife[i] <= 0) continue;
          puffLife[i] -= seqDt / puffMaxLife[i];
          puffPos[i * 3] += puffVel[i].x * seqDt;
          puffPos[i * 3 + 1] += puffVel[i].y * seqDt;
          puffPos[i * 3 + 2] += puffVel[i].z * seqDt;
          puffVel[i].multiplyScalar(1 - seqDt * 0.25);
          if (puffLife[i] <= 0) puffPos[i * 3 + 1] = -999;
        }
        puffGeo.attributes.position.needsUpdate = true;
        puffMat.uniforms.uOpacity.value = Math.max(0, 1 - t * 0.6);

        // Remnant drifts outward slowly during explosion.
        for (let i = 0; i < REMNANT_COUNT; i++) {
          if (remnantLife[i] <= 0) continue;
          remnantPos[i * 3] += remnantVel[i].x * seqDt;
          remnantPos[i * 3 + 1] += remnantVel[i].y * seqDt;
          remnantPos[i * 3 + 2] += remnantVel[i].z * seqDt;
          remnantVel[i].multiplyScalar(1 - seqDt * 0.05);
        }
        remnantGeo.attributes.position.needsUpdate = true;
        remnantMat.uniforms.uOpacity.value = Math.min(1, t * 1.2);

        // Fade corona.
        for (const c of coronaLayers) {
          (c.material as THREE.SpriteMaterial).opacity *= Math.exp(-seqDt * 3);
        }
        // Fade lens flare.
        (flareCoreHalo.material as THREE.SpriteMaterial).opacity *= Math.exp(-seqDt * 4);
        (anamorphic.material as THREE.SpriteMaterial).opacity *= Math.exp(-seqDt * 4);
        for (const sp of spikes) (sp.material as THREE.SpriteMaterial).opacity *= Math.exp(-seqDt * 4);
        (chromaRingSprite.material as THREE.SpriteMaterial).opacity *= Math.exp(-seqDt * 4);

        if (phaseT >= EXPLODE_DURATION) {
          phase = 'aftermath';
          phaseT = 0;
          targetDist = 16;
          for (const s of shockSpheres) s.visible = false;
          for (const s of shocks) s.visible = false;
          flashCore.visible = false;
          flashHalo.visible = false;
          if (isHighOrUltra) trailLines.visible = false;
        }
      }
      // ── Aftermath phase ──────────────────────────────────────────────
      else if (phase === 'aftermath') {
        const t = phaseT / AFTERMATH_DURATION;

        // Slow camera pull-back to reveal the dispersing remnant.
        targetDist = 16;
        cinematicDist += (targetDist - cinematicDist) * Math.min(1, seqDt * 0.6);
        cinematicYaw = 0.3 + elapsed * 0.03;
        cinematicPitch = 0.4;

        // Continuing debris drift + fade.
        for (let i = 0; i < DEBRIS_COUNT; i++) {
          if (debrisLife[i] <= 0) continue;
          debrisLife[i] -= seqDt * 0.18;
          debrisPos[i * 3] += debrisVel[i].x * seqDt;
          debrisPos[i * 3 + 1] += debrisVel[i].y * seqDt;
          debrisPos[i * 3 + 2] += debrisVel[i].z * seqDt;
          debrisVel[i].multiplyScalar(1 - seqDt * 0.18);
          debrisAngle[i] += debrisRotVel[i] * seqDt * 0.5;
          debrisHeat[i] = Math.max(0, debrisHeat[i] - seqDt * 0.12);
          heatToColor(debrisHeat[i], tmpCol);
          debrisCol[i * 3] = tmpCol.r;
          debrisCol[i * 3 + 1] = tmpCol.g;
          debrisCol[i * 3 + 2] = tmpCol.b;
          if (debrisLife[i] <= 0) debrisPos[i * 3 + 1] = -999;
        }
        debrisGeo.attributes.position.needsUpdate = true;
        debrisGeo.attributes.aColor.needsUpdate = true;
        debrisGeo.attributes.aAngle.needsUpdate = true;
        debrisMat.uniforms.uOpacity.value *= Math.exp(-seqDt * 0.35);

        // Puffs fade quickly.
        for (let i = 0; i < PUFF_COUNT; i++) {
          if (puffLife[i] <= 0) continue;
          puffLife[i] -= seqDt / puffMaxLife[i];
          puffPos[i * 3] += puffVel[i].x * seqDt;
          puffPos[i * 3 + 1] += puffVel[i].y * seqDt;
          puffPos[i * 3 + 2] += puffVel[i].z * seqDt;
          if (puffLife[i] <= 0) puffPos[i * 3 + 1] = -999;
        }
        puffGeo.attributes.position.needsUpdate = true;
        puffMat.uniforms.uOpacity.value *= Math.exp(-seqDt * 1.0);

        // Remnant continues to drift outward (slow, visible, colorful).
        for (let i = 0; i < REMNANT_COUNT; i++) {
          remnantPos[i * 3] += remnantVel[i].x * seqDt;
          remnantPos[i * 3 + 1] += remnantVel[i].y * seqDt;
          remnantPos[i * 3 + 2] += remnantVel[i].z * seqDt;
          // Subtle drift acceleration (remnant is still expanding).
          remnantVel[i].multiplyScalar(1 + seqDt * 0.02);
        }
        remnantGeo.attributes.position.needsUpdate = true;
        remnantMat.uniforms.uOpacity.value = Math.max(0.15, 1 - t * 0.3);

        // Explosion light fades to zero.
        explosionLight.intensity *= Math.exp(-seqDt * 2);

        if (phaseT >= AFTERMATH_DURATION) {
          phase = 'stable';
          phaseT = 0;
          cinematicActive = false;
          // Reset star & chromosphere.
          star.visible = true;
          fresnelGlow.visible = true;
          chromosphere.visible = true;
          for (const p of prominences) p.mesh.visible = true;
          godRayGroup.visible = GODRAY_COUNT > 0;
          star.scale.setScalar(1);
          starMat.uniforms.uIntensity.value = 1;
          starMat.uniforms.uCollapse.value = 0;
          chromoMat.uniforms.uIntensity.value = 1;
          chromoMat.uniforms.uCollapse.value = 0;
          for (let i = 0; i < coronaLayers.length; i++) {
            const base = 4 + i * 2.5;
            coronaLayers[i].scale.set(base, base, 1);
            (coronaLayers[i].material as THREE.SpriteMaterial).opacity = 0.25 - i * 0.05;
          }
          for (let i = 0; i < DEBRIS_COUNT; i++) {
            debrisPos[i * 3 + 1] = -999;
            debrisLife[i] = 0;
          }
          debrisGeo.attributes.position.needsUpdate = true;
          debrisMat.uniforms.uOpacity.value = 0;
          for (let i = 0; i < PUFF_COUNT; i++) {
            puffPos[i * 3 + 1] = -999;
            puffLife[i] = 0;
          }
          puffGeo.attributes.position.needsUpdate = true;
          puffMat.uniforms.uOpacity.value = 0;
          for (let i = 0; i < REMNANT_COUNT; i++) {
            remnantPos[i * 3 + 1] = -999;
            remnantLife[i] = 0;
          }
          remnantGeo.attributes.position.needsUpdate = true;
          remnantMat.uniforms.uOpacity.value = 0;
          for (let i = 0; i < WIND_COUNT; i++) {
            windPos[i * 3 + 1] = -999;
            windLife[i] = 0;
          }
          windGeo.attributes.position.needsUpdate = true;
          windMat.opacity = 0.7;
          flashCore.visible = true;
          flashHalo.visible = true;
          for (const s of shocks) s.visible = false;
          for (const s of shockSpheres) s.visible = false;
          for (const m of microShocks) m.visible = false;
          for (const m of microShockState) { m.fired = false; m.t = 0; }
          explosionLight.intensity = 0;
          bgStarMat.uniforms.uBoost.value = 1.0;
          nebulaBgMat.opacity = 0.55;
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

// ── Procedural chromatic ring texture for the lens flare. ─────────────
function makeRingTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 128, 128);
    // Multi-color concentric ring strokes (chromatic look).
    const cx = 64, cy = 64;
    const rings: Array<[number, number, string]> = [
      [54, 4, 'rgba(255,80,140,0.75)'],
      [58, 2, 'rgba(80,200,255,0.5)'],
      [50, 2, 'rgba(255,255,80,0.5)'],
      [62, 1, 'rgba(200,120,255,0.35)'],
    ];
    for (const [r, w, col] of rings) {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}
