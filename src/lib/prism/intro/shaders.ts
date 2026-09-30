export const STAR_VERTEX = `
attribute float aSize;
attribute float aAlpha;
attribute float aPhase;
attribute float aTwinkle;

uniform float uTime;
uniform float uPixelRatio;
uniform float uEnergy;

varying float vAlpha;
varying float vTwinkle;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

  float depth = max(16.0, -mvPosition.z);
  float breathing =
    0.72 +
    0.28 *
      sin(
        uTime * (0.6 + aTwinkle * 1.6) +
        aPhase
      );

  float energyBoost =
    1.0 +
    uEnergy * 0.9;

  gl_PointSize =
    aSize *
    uPixelRatio *
    breathing *
    energyBoost *
    (220.0 / depth);

  gl_Position =
    projectionMatrix *
    mvPosition;

  vAlpha =
    aAlpha *
    breathing *
    (0.65 + uEnergy * 0.35);

  vTwinkle =
    0.5 +
    0.5 *
      sin(
        uTime * (1.0 + aTwinkle * 2.4) +
        aPhase
      );
}
`;

export const STAR_FRAGMENT = `
uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;

varying float vAlpha;
varying float vTwinkle;

void main() {
  vec2 uv = gl_PointCoord.xy - 0.5;
  float radius = length(uv);

  if (radius > 0.5) discard;

  float soft =
    smoothstep(
      0.5,
      0.0,
      radius
    );

  float core =
    pow(
      smoothstep(
        0.18,
        0.0,
        radius
      ),
      1.7
    );

  vec3 color =
    mix(
      uColorA,
      uColorB,
      vTwinkle
    );

  float alpha =
    (
      soft * 0.65 +
      core * 0.95
    ) *
    vAlpha;

  gl_FragColor =
    vec4(
      color,
      alpha
    );
`;

export const DUST_VERTEX = `
attribute float aScale;
attribute float aPhase;

uniform float uTime;
uniform float uEnergy;

varying float vScale;

void main() {
  vec3 p = position;

  float wave =
    sin(
      uTime * 0.18 +
      aPhase +
      p.y * 0.22
    );

  p += normalize(p + vec3(0.001)) *
    wave *
    (0.15 + uEnergy * 0.9);

  vec4 mvPosition =
    modelViewMatrix *
    vec4(p, 1.0);

  gl_PointSize =
    aScale *
    (170.0 / max(30.0, -mvPosition.z)) *
    (1.0 + uEnergy * 0.8);

  gl_Position =
    projectionMatrix *
    mvPosition;

  vScale = aScale;
`;

export const DUST_FRAGMENT = `
varying float vScale;

void main() {
  vec2 uv = gl_PointCoord.xy - 0.5;
  float d = length(uv);

  if (d > 0.5) discard;

  float a =
    smoothstep(
      0.5,
      0.0,
      d
    );

  float core =
    smoothstep(
      0.16,
      0.0,
      d
    );

  gl_FragColor =
    vec4(
      0.45,
      0.8,
      1.0,
      a * (0.12 + core * 0.35)
    );
`;

export const CRYSTAL_VERTEX = `
uniform float uTime;
uniform float uPulse;
uniform float uWarp;

varying vec3 vNormal;
varying vec3 vWorld;
varying float vPulse;

void main() {
  vec3 p = position;

  float wave =
    sin(
      p.y * 8.0 +
      uTime * 1.8
    );

  float radial =
    length(
      p.xz
    );

  p += normal *
    wave *
    radial *
    uWarp *
    0.06;

  p *=
    1.0 +
    uPulse *
    0.045;

  vec4 world =
    modelMatrix *
    vec4(
      p,
      1.0
    );

  vWorld =
    world.xyz;

  vNormal =
    normalize(
      normalMatrix *
      normal
    );

  vPulse =
    uPulse;

  gl_Position =
    projectionMatrix *
    modelViewMatrix *
    vec4(
      p,
      1.0
    );
`;

export const CRYSTAL_FRAGMENT = `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uEnergy;

varying vec3 vNormal;
varying vec3 vWorld;
varying float vPulse;

void main() {
  vec3 viewDir =
    normalize(
      cameraPosition -
      vWorld
    );

  float fresnel =
    pow(
      1.0 -
      max(
        0.0,
        dot(
          normalize(vNormal),
          viewDir
        )
      ),
      2.8
    );

  vec3 color =
    mix(
      uColorA,
      uColorB,
      fresnel * 0.9
    );

  float inner =
    0.12 +
    fresnel * 0.48 +
    uEnergy * 0.12;

  gl_FragColor =
    vec4(
      color,
      inner
    );
`;

export const CORE_FRAGMENT = `
uniform float uTime;
uniform float uEnergy;

varying vec2 vUv;

void main() {
  vec2 uv =
    vUv -
    0.5;

  float d =
    length(uv);

  float core =
    smoothstep(
      0.25,
      0.0,
      d
    );

  float halo =
    smoothstep(
      0.5,
      0.04,
      d
    );

  float pulse =
    0.72 +
    0.28 *
      sin(
        uTime * 4.5
      );

  vec3 color =
    mix(
      vec3(0.55, 0.84, 1.0),
      vec3(0.93, 1.0, 1.0),
      core
    );

  float alpha =
    (
      core *
      0.9 +
      halo *
      0.28
    ) *
    pulse *
    (0.55 + uEnergy * 0.85);

  gl_FragColor =
    vec4(
      color,
      alpha
    );
`;

export const PORTAL_FRAGMENT = `
uniform float uTime;
uniform float uProgress;

varying vec2 vUv;

void main() {
  vec2 uv =
    vUv -
    0.5;

  float radius =
    length(uv);

  float ring =
    abs(
      radius -
      (
        0.11 +
        uProgress * 0.48
      )
    );

  float ringGlow =
    exp(
      -ring * 72.0
    );

  float core =
    exp(
      -radius *
      (7.0 + uProgress * 3.0)
    );

  float scan =
    0.5 +
    0.5 *
      sin(
        atan(
          uv.y,
          uv.x
        ) *
        18.0 +
        uTime * 2.0
      );

  vec3 color =
    mix(
      vec3(0.2, 0.52, 1.0),
      vec3(0.82, 0.98, 1.0),
      scan
    );

  float alpha =
    max(
      ringGlow *
        (0.2 + uProgress * 0.8),
      core *
        0.5
    );

  gl_FragColor =
    vec4(
      color,
      alpha
    );
`;

export const ATMOSPHERE_FRAGMENT = `
uniform float uTime;
uniform float uEnergy;
uniform float uPointerX;
uniform float uPointerY;

varying vec2 vUv;

void main() {
  vec2 uv =
    vUv -
    0.5;

  float radial =
    length(
      uv
    );

  float drift =
    sin(
      uTime * 0.11 +
      uv.x * 3.0
    ) *
    0.02;

  float field =
    exp(
      -(
        radial *
        (2.8 + uEnergy)
      )
    );

  float pointer =
    exp(
      -length(
        uv -
        vec2(
          uPointerX * 0.18,
          uPointerY * 0.18
        )
      ) *
      8.0
    );

  vec3 blue =
    vec3(
      0.04,
      0.18,
      0.42
    );

  vec3 cyan =
    vec3(
      0.09,
      0.42,
      0.78
    );

  vec3 color =
    mix(
      blue,
      cyan,
      pointer + field * 0.35
    );

  float alpha =
    (
      field * 0.26 +
      pointer * 0.08 +
      drift * 0.2
    ) *
    (0.4 + uEnergy * 0.7);

  gl_FragColor =
    vec4(
      color,
      alpha
    );
`;

export const CINEMATIC_POST_FRAGMENT = `
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uTime;
uniform float uChromatic;
uniform float uVignette;
uniform float uFlash;

varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  vec2 centered = uv - 0.5;

  float radius = length(centered);

  vec2 dir =
    normalize(
      centered +
      vec2(0.0001)
    );

  float aberration =
    uChromatic *
    radius *
    radius;

  vec2 offset =
    dir *
    aberration;

  float r =
    texture2D(
      tDiffuse,
      uv + offset
    ).r;

  float g =
    texture2D(
      tDiffuse,
      uv
    ).g;

  float b =
    texture2D(
      tDiffuse,
      uv - offset
    ).b;

  vec3 color =
    vec3(
      r,
      g,
      b
    );

  float vignette =
    1.0 -
    smoothstep(
      0.25,
      0.78,
      radius
    ) *
    uVignette;

  color *= vignette;

  color +=
    vec3(
      0.7,
      0.9,
      1.0
    ) *
    uFlash *
    exp(
      -radius *
      7.0
    );

  float scan =
    sin(
      uv.y *
      uResolution.y *
      0.18
    ) *
    0.004;

  color += scan;

  gl_FragColor =
    vec4(
      color,
      1.0
    );
`;
