// ─────────────────────────────────────────────────────────────────────────────
// PRISM · "FIRST LIGHT" — GLSL.
// The swarm (morphing GPU particles), the crystal (dispersion glass),
// the beam + spectral fan, and the final grade pass (CA, streaks, bloom-kiss,
// vignette, grain, flash). Everything hand-written, no deps beyond three.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// THE SWARM — one Points cloud that becomes everything.
// Morph model: per-particle aFrom/aTo targets + staggered smoothstep blend,
// curl-flavoured turbulence, differential swirl (Keplerian shear), and a
// breathing drift so the organism never sits still.
// ─────────────────────────────────────────────────────────────────────────────

export const SWARM_VERTEX = /* glsl */ `
  attribute vec3 aFrom;
  attribute vec3 aTo;
  attribute vec4 aRand;   // per-particle persistent randoms
  attribute vec3 aTint;   // per-act colour multiplier

  uniform float uTime;
  uniform float uMorphT0;
  uniform float uMorphDur;
  uniform float uStagger;   // fraction of morph duration spread per particle
  uniform float uTurb;      // turbulence amplitude
  uniform float uTurbFreq;
  uniform float uSwirl;     // differential rotation speed (rad/s at unit rand)
  uniform float uSpiral;    // implosion spiral factor
  uniform float uDrift;     // idle breathing amplitude
  uniform float uSize;      // base point size
  uniform float uPixelRatio;
  uniform float uBurst;     // genesis explosion progress (0 settled → 1 spread)
  uniform float uAlpha;     // global opacity — keeps additive density in filmic range

  varying vec3 vColor;
  varying float vFade;

  vec3 turbulence(vec3 p, float t) {
    return vec3(
      sin(p.y * 1.7 + t * 1.15) + 0.6 * sin(p.z * 2.3 + t * 0.7),
      sin(p.z * 1.9 + t * 1.35) + 0.6 * sin(p.x * 2.1 + t * 0.8),
      sin(p.x * 1.5 + t * 0.95) + 0.6 * sin(p.y * 2.7 + t * 1.2)
    );
  }

  void main() {
    // — staggered per-particle morph —
    float mp = clamp((uTime - uMorphT0) / max(uMorphDur, 0.0001), 0.0, 1.0);
    float w = aRand.w * uStagger;
    mp = clamp((mp - w) / max(1.0 - uStagger, 0.0001), 0.0, 1.0);
    mp = 1.0 - pow(1.0 - mp, 3.0); // easeOutCubic — arrivals decelerate

    vec3 target = mix(aFrom, aTo, mp);

    // — differential swirl: inner particles orbit faster (Keplerian shear) —
    if (uSwirl != 0.0) {
      float r = length(target.xz) + 0.001;
      float ang = uSwirl * uTime * (0.55 + 0.9 * aRand.x) / (0.55 + r * 0.24);
      float ca = cos(ang);
      float sa = sin(ang);
      target.xz = mat2(ca, -sa, sa, ca) * target.xz;
    }

    // — implosion spiral: points corkscrew inward while converging —
    if (uSpiral != 0.0) {
      float k = clamp(uTime - uMorphT0, 0.0, uMorphDur) / max(uMorphDur, 0.0001);
      float r = length(target.xz) + 0.001;
      float ang = uSpiral * (1.0 - k) * (2.2 + 1.4 * aRand.y);
      float ca = cos(ang);
      float sa = sin(ang);
      target.xz = mat2(ca, -sa, sa, ca) * target.xz;
    }

    // — living turbulence + breath —
    vec3 turb = turbulence(target * uTurbFreq + aRand.xyz * 7.0, uTime) * uTurb;
    vec3 breath = vec3(
      sin(uTime * 0.9 + aRand.x * 40.0),
      cos(uTime * 0.8 + aRand.y * 40.0),
      sin(uTime * 1.1 + aRand.z * 40.0)
    ) * uDrift;

    vec3 pos = target + turb + breath;

    // — genesis burst: the first explosion expands outward with time —
    pos *= 1.0 + uBurst * (0.4 + 1.6 * aRand.y);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    float dist = max(0.6, -mv.z);
    float size = uSize * (0.55 + 0.9 * aRand.z) * uPixelRatio * (92.0 / dist);
    gl_PointSize = clamp(size, 0.5, 7.5);

    // — colour: act ramp × per-particle tint × shimmer —
    float shimmer = 0.72 + 0.28 * sin(uTime * (1.4 + 2.2 * aRand.x) + aRand.y * 6.28);
    vColor = aTint * shimmer;
    // fresh arrivals flash brighter as they lock in
    float arrive = smoothstep(0.86, 1.0, mp);
    vColor *= 1.0 + arrive * 1.6 * step(0.001, uMorphDur);

    // far particles dim slightly — depth without fog cost
    vFade = clamp(1.15 - dist / 60.0, 0.25, 1.0) * uAlpha;
  }
`;

export const SWARM_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vFade;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;

    float halo = smoothstep(0.5, 0.0, d);
    float core = smoothstep(0.14, 0.0, d);
    float alpha = (halo * 0.34 + core * 0.5) * vFade;
    vec3 col = vColor * (0.55 + 1.05 * core);

    gl_FragColor = vec4(col * alpha, alpha);
  }
`;

export function makeSwarmMaterial(pixelRatio: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SWARM_VERTEX,
    fragmentShader: SWARM_FRAGMENT,
    uniforms: {
      uTime: { value: 0 },
      uMorphT0: { value: 0 },
      uMorphDur: { value: 1 },
      uStagger: { value: 0.35 },
      uTurb: { value: 0.18 },
      uTurbFreq: { value: 0.55 },
      uSwirl: { value: 0 },
      uSpiral: { value: 0 },
      uDrift: { value: 0.03 },
      uSize: { value: 1.4 },
      uPixelRatio: { value: pixelRatio },
      uBurst: { value: 0 },
      uAlpha: { value: 0.42 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// THE CRYSTAL — fake-glass dispersion shader: Fresnel rim per RGB channel
// with shifted exponents (chromatic edge), inner glow, facet sparkle.
// Cheap enough for any GPU the expo will throw at it.
// ─────────────────────────────────────────────────────────────────────────────

export const CRYSTAL_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const CRYSTAL_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uBase;
  uniform vec3 uRim;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vWorld;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vView);
    float ndv = clamp(dot(n, v), 0.0, 1.0);

    // dispersion: three tight Fresnel rims with shifted exponents —
    // high powers keep the chromatic edge confined to true silhouette
    float fr = pow(1.0 - ndv, 5.0);
    float fg = pow(1.0 - ndv, 6.2);
    float fb = pow(1.0 - ndv, 7.6);
    vec3 rim = uRim * vec3(fr * 0.9, fg * 1.1, fb * 1.4);

    // facet sparkle: two moving key lights
    vec3 l1 = normalize(vec3(sin(uTime * 0.5) * 0.8, 0.9, 0.5));
    vec3 l2 = normalize(vec3(-0.6, -0.4, cos(uTime * 0.4) * 0.8));
    float s1 = pow(max(dot(reflect(-v, n), l1), 0.0), 42.0);
    float s2 = pow(max(dot(reflect(-v, n), l2), 0.0), 60.0);

    // inner depth: quiet refraction body
    vec3 body = uBase * (0.05 + 0.4 * pow(ndv, 2.0));
    float sheen = pow(ndv, 8.0) * 0.18;

    vec3 col = body + rim + vec3(1.0, 1.0, 1.0) * (s1 + s2) * 1.1 + uRim * sheen;
    float a = uOpacity * (0.4 + 0.6 * clamp(fr + fg + fb + (s1 + s2) * 2.0, 0.0, 1.0));
    gl_FragColor = vec4(col, a);
  }
`;

export function makeCrystalMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: CRYSTAL_VERTEX,
    fragmentShader: CRYSTAL_FRAGMENT,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0.66 },
      uBase: { value: new THREE.Color('#0a2a52') },
      uRim: { value: new THREE.Color('#8fd4ff') },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// THE BEAM — white light cylinder with flowing energy + soft ends.
// ─────────────────────────────────────────────────────────────────────────────

export const BEAM_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const BEAM_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float along = vUv.y;              // cylinder height / plane length
    float radial = abs(vUv.x - 0.5) * 2.0; // around circumference / across width
    float core = smoothstep(1.0, 0.0, radial);
    float flow = 0.75 + 0.25 * sin(along * 34.0 - uTime * 9.0);
    float ends = smoothstep(0.0, 0.08, along) * smoothstep(1.0, 0.86, along);
    float a = core * flow * ends * uIntensity;
    vec3 col = uColor * (0.75 + 0.85 * core) + vec3(1.0) * core * 0.6;
    gl_FragColor = vec4(col * a, a);
  }
`;

export function makeBeamMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: BEAM_VERTEX,
    fragmentShader: BEAM_FRAGMENT,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 1 },
      uColor: { value: new THREE.Color('#dfefff') },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// THE GRADE — final full-screen pass: chromatic aberration, anamorphic
// streak kiss, vignette, film grain, and the flash bus (white/blue hits).
// ─────────────────────────────────────────────────────────────────────────────

export const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uAber: { value: 0.55 }, // CA amount multiplier
    uGrain: { value: 0.05 },
    uVignette: { value: 0.32 },
    uFlash: { value: 0 }, // 0..1 white flash
    uBlueFlash: { value: 0 }, // 0..1 dreamy blue wash
    uFade: { value: 0 }, // 0..1 to black (end)
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAber;
    uniform float uGrain;
    uniform float uVignette;
    uniform float uFlash;
    uniform float uBlueFlash;
    uniform float uFade;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float dist = length(c);

      // chromatic aberration — radial, quadratic falloff, punch on flash
      float amt = uAber * 0.012 * dist * dist * (1.0 + uFlash * 3.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * amt).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * amt).b;

      // anamorphic streak kiss — horizontal bright-pass taps
      vec3 streak = vec3(0.0);
      streak += texture2D(tDiffuse, uv + vec2(0.012, 0.0)).rgb * 0.25;
      streak += texture2D(tDiffuse, uv - vec2(0.012, 0.0)).rgb * 0.25;
      streak += texture2D(tDiffuse, uv + vec2(0.028, 0.0)).rgb * 0.12;
      streak += texture2D(tDiffuse, uv - vec2(0.028, 0.0)).rgb * 0.12;
      float lum = dot(streak, vec3(0.299, 0.587, 0.114));
      col += streak * smoothstep(0.55, 1.2, lum) * 0.24;

      // dreamy blue wash + white flash
      col = mix(col, vec3(0.043, 0.216, 0.502), uBlueFlash * 0.85);
      col += vec3(1.0, 0.99, 0.97) * uFlash;

      // vignette
      float vig = smoothstep(0.95, 0.32, dist * (1.0 + uVignette));
      col *= mix(1.0, vig, 0.85);

      // film grain
      float g = hash(uv * vec2(1920.0, 1080.0) + fract(uTime) * 37.0) - 0.5;
      col += g * uGrain * (0.4 + 0.6 * (1.0 - dist));

      // end fade to black
      col *= (1.0 - uFade);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

// ─────────────────────────────────────────────────────────────────────────────
// Starfield (background layer for optics/team acts) — twinkle points.
// ─────────────────────────────────────────────────────────────────────────────

export const STAR_VERTEX = /* glsl */ `
  attribute float aPhase;
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    float tw = 0.55 + 0.45 * sin(uTime * (0.6 + aPhase * 1.7) + aPhase * 40.0);
    vAlpha = tw * uAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = max(1.0, -mv.z);
    gl_PointSize = clamp(aSize * uPixelRatio * (110.0 / dist), 0.5, 5.0);
  }
`;

export const STAR_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d) * vAlpha;
    gl_FragColor = vec4(vColor * (0.7 + 0.6 * smoothstep(0.2, 0.0, d)), a * 0.85);
  }
`;
