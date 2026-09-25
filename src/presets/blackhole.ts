// Procedural black hole: event horizon, temperature-ramped accretion disk
// (original GLSL — white-hot rim cooling outward, streaky turbulence,
// Keplerian inner-faster swirl), photon ring, glow, and relativistic jets.

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
}

const DISK_VERT = /* glsl */ `
  varying vec2 vLocal;
  void main() {
    vLocal = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DISK_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vLocal;
  uniform float uTime;
  uniform float uInner;
  uniform float uOuter;

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
    float swirl = uTime * (2.4 / (0.35 + t));
    float streaks = vnoise(vec2(ang * 2.5 + swirl, t * 7.0 - uTime * 0.2));
    streaks = 0.55 + 0.45 * streaks;
    float fine = vnoise(vec2(ang * 7.0 - swirl * 0.7, t * 16.0));
    float brightness = streaks * (0.8 + 0.2 * fine);

    // Blackbody-ish ramp: blue-white rim -> orange -> ember edge.
    vec3 col = mix(vec3(0.85, 0.92, 1.0), vec3(1.0, 0.55, 0.15), smoothstep(0.0, 0.4, t));
    col = mix(col, vec3(0.5, 0.1, 0.03), smoothstep(0.4, 1.0, t));
    // Super-heated inner rim.
    col += vec3(0.9, 0.85, 0.7) * pow(1.0 - smoothstep(0.0, 0.18, t), 2.0);

    float alpha = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.75, 1.0, t));
    gl_FragColor = vec4(col * brightness * 1.7, alpha * 0.92);
  }
`;

export function buildBlackHole(opts: BlackHoleOpts, glowTex: THREE.Texture): BlackHole {
  const { horizon } = opts;
  const inner = opts.diskInner * horizon;
  const outer = opts.diskOuter * horizon;
  const group = new THREE.Group();

  // The void: pure black.
  const hole = new THREE.Mesh(
    new THREE.SphereGeometry(horizon, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000 }),
  );
  group.add(hole);

  // Accretion disk in local XY, then laid flat into XZ.
  const diskMat = new THREE.ShaderMaterial({
    vertexShader: DISK_VERT,
    fragmentShader: DISK_FRAG,
    uniforms: {
      uTime: { value: Math.random() * 100 },
      uInner: { value: inner },
      uOuter: { value: outer },
    },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const disk = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 128, 8), diskMat);
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

  // Halo glow sprite.
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

  // Relativistic jets along ±Y.
  const jetMat = new THREE.MeshBasicMaterial({
    color: 0x9fd8ff,
    transparent: true,
    opacity: 0.14,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const jets: THREE.Mesh[] = [];
  if (opts.jets !== false) {
    for (const sign of [1, -1]) {
      const jet = new THREE.Mesh(new THREE.ConeGeometry(horizon * 0.4, horizon * 7, 24, 1, true), jetMat);
      jet.position.y = sign * horizon * 3.5;
      if (sign < 0) jet.rotation.z = Math.PI;
      group.add(jet);
      jets.push(jet);
    }
  }

  return {
    group,
    update(dt: number, elapsed: number): void {
      diskMat.uniforms.uTime.value += dt * (opts.diskSpeed ?? 1);
      jetMat.opacity = 0.11 + 0.05 * Math.sin(elapsed * 2.3);
      ring.rotation.z += dt * 0.4;
    },
  };
}
