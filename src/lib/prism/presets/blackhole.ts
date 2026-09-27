// Procedural black hole: event horizon, temperature-ramped accretion disk
// (original GLSL — white-hot rim cooling outward, streaky turbulence,
// Keplerian inner-faster swirl), photon ring, glow, and relativistic jets.
//
// Rebuilt for motion design: the hole PULSES, GROWS, and DESTABILIZES during
// extreme mode. The disk warps and breaks. Jets flare violently. This is
// not a static model — it's a living, breathing body that responds to its
// energy state.

import * as THREE from 'three';

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

const DISK_VERT = /* glsl */ `
  varying vec2 vLocal;
  uniform float uWarp;
  void main() {
    vLocal = position.xy;
    // Warp the disk vertices during extreme mode — the disk buckles.
    float r = length(vLocal);
    float warpAmt = uWarp * sin(r * 3.0 + uWarp * 8.0) * 0.15;
    vec3 pos = position;
    pos.z += warpAmt * r;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const DISK_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vLocal;
  uniform float uTime;
  uniform float uInner;
  uniform float uOuter;
  uniform float uBoost;
  uniform float uWarp;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    float r = length(vLocal);
    float t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
    float ang = atan(vLocal.y, vLocal.x);

    // Keplerian swirl: inner material laps the outer material.
    // During extreme mode, the swirl accelerates dramatically.
    float speedMul = 1.0 + uWarp * 4.0;
    float swirl = uTime * (2.4 / (0.35 + t)) * speedMul;
    float streaks = vnoise(vec2(ang * 2.5 + swirl, t * 7.0 - uTime * 0.2));
    streaks = 0.55 + 0.45 * streaks;
    float fine = vnoise(vec2(ang * 7.0 - swirl * 0.7, t * 16.0));
    float brightness = streaks * (0.8 + 0.2 * fine);

    // Blackbody-ish ramp: blue-white rim -> orange -> ember edge.
    // During extreme mode, shift hotter (more blue-white, less orange).
    vec3 hotCol = mix(vec3(0.85, 0.92, 1.0), vec3(1.0, 0.55, 0.15), smoothstep(0.0, 0.4, t) * (1.0 - uWarp * 0.5));
    vec3 col = mix(hotCol, vec3(0.5, 0.1, 0.03), smoothstep(0.4, 1.0, t));
    // Super-heated inner rim — brighter and wider during extreme.
    float rimWidth = 0.18 + uWarp * 0.12;
    col += vec3(0.9, 0.85, 0.7) * pow(1.0 - smoothstep(0.0, rimWidth, t), 2.0);

    float alpha = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.75, 1.0, t));
    gl_FragColor = vec4(col * brightness * 1.7 * uBoost, alpha * 0.92);
  }
`;

export function buildBlackHole(opts: BlackHoleOpts, glowTex: THREE.Texture): BlackHole {
  const { horizon } = opts;
  const inner = opts.diskInner * horizon;
  const outer = opts.diskOuter * horizon;
  const group = new THREE.Group();

  // The void: pure black. We'll SCALE this during extreme mode to make the
  // hole itself visibly grow/destabilize.
  const hole = new THREE.Mesh(
    new THREE.SphereGeometry(horizon, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000 }),
  );
  group.add(hole);

  // Accretion disk — warped during extreme mode via vertex shader.
  const diskMat = new THREE.ShaderMaterial({
    vertexShader: DISK_VERT,
    fragmentShader: DISK_FRAG,
    uniforms: {
      uTime: { value: Math.random() * 100 },
      uInner: { value: inner },
      uOuter: { value: outer },
      uBoost: { value: 1 },
      uWarp: { value: 0 },
    },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const disk = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 128, 12), diskMat);
  disk.rotation.x = -Math.PI / 2;
  group.add(disk);

  // Photon ring: thin, bright torus hugging the shadow.
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(horizon * 1.32, horizon * 0.045, 12, 96),
    new THREE.MeshBasicMaterial({
      color: 0xffe6b8,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  // Halo glow sprite — grows dramatically during extreme mode.
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

  // Relativistic jets along ±Y — these FLARE massively during extreme.
  const jetMat = new THREE.MeshBasicMaterial({
    color: 0x9fd8ff,
    transparent: true,
    opacity: 0.14,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const jets: THREE.Mesh[] = [];
  const jetGlows: THREE.Sprite[] = [];
  if (opts.jets !== false) {
    for (const sign of [1, -1]) {
      const jet = new THREE.Mesh(new THREE.ConeGeometry(horizon * 0.4, horizon * 7, 24, 1, true), jetMat);
      jet.position.y = sign * horizon * 3.5;
      if (sign < 0) jet.rotation.z = Math.PI;
      group.add(jet);
      jets.push(jet);
      // Jet tip glow
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
      jetGlow.position.y = sign * horizon * 7;
      jetGlow.scale.set(horizon * 2, horizon * 2, 1);
      group.add(jetGlow);
      jetGlows.push(jetGlow);
    }
  }

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

      // Disk: accelerate time, boost brightness, warp vertices.
      diskMat.uniforms.uTime.value += dt * (opts.diskSpeed ?? 1) * (1 + ex * 5);
      diskMat.uniforms.uBoost.value = 1 + ex * 1.8;
      diskMat.uniforms.uWarp.value = ex;

      // Hole: GROW and PULSE during extreme mode (this is the key visual —
      // the hole itself destabilizes, not just the disk).
      const pulse = 1 + ex * 0.4 + Math.sin(elapsed * (8 + ex * 12)) * ex * 0.12;
      hole.scale.setScalar(pulse);

      // Photon ring: spin faster, brighten, scale up.
      jetMat.opacity = (0.14 + ex * 0.35) + 0.05 * Math.sin(elapsed * (2.3 + ex * 8));
      ring.rotation.z += dt * (0.4 + ex * 3);
      const ringS = 1 + ex * 0.5 + Math.sin(elapsed * 6) * ex * 0.1;
      ring.scale.setScalar(ringS);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.95 + ex * 0.05;

      // Glow: grow and brighten dramatically.
      const glowS = horizon * (8 + ex * 6);
      glow.scale.set(glowS, glowS, 1);
      (glow.material as THREE.SpriteMaterial).opacity = 0.75 + ex * 0.25;

      // Jets: grow longer + wider, flare the tips.
      jets.forEach((jet) => {
        const s = 1 + ex * 1.5;
        jet.scale.set(1 + ex * 0.8, s, 1);
      });
      jetGlows.forEach((jg) => {
        const s = horizon * (2 + ex * 4);
        jg.scale.set(s, s, 1);
        (jg.material as THREE.SpriteMaterial).opacity = 0.3 + ex * 0.5;
      });
    },
    setExtreme(on: boolean): void {
      extreme = on;
    },
  };
}
