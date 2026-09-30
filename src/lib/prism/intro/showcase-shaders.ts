export const PRISM_VERTEX = `
uniform float uTime;
uniform float uBreath;
varying vec3 vNormal;
varying vec3 vWorld;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vec3 p = position;
  p += normal * sin(uTime * 1.7 + position.y * 3.1 + position.x) * 0.025 * uBreath;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const PRISM_FRAGMENT = `
uniform float uTime;
uniform float uEnergy;
uniform float uFlash;
varying vec3 vNormal;
varying vec3 vWorld;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  float fresnel = pow(1.0 - max(dot(normalize(vNormal), V), 0.0), 2.7);

  float scan = 0.5 + 0.5 * sin(uTime * 3.0 + vWorld.y * 2.4);
  float spectral = 0.5 + 0.5 * sin(vWorld.x * 3.2 + uTime * 0.8);

  vec3 ice = vec3(0.66, 0.92, 1.0);
  vec3 blue = vec3(0.18, 0.46, 1.0);
  vec3 cyan = vec3(0.30, 0.82, 1.0);

  vec3 color = mix(blue, cyan, spectral);
  color = mix(color, ice, fresnel * 0.9);
  color += ice * scan * 0.08;
  color += ice * uFlash * 0.55;

  float edge = smoothstep(0.2, 1.0, fresnel);
  float alpha = 0.18 + edge * 0.68 + uEnergy * 0.12;

  gl_FragColor = vec4(color, alpha);
}
`;

export const PARTICLE_VERTEX = `
attribute float aSize;
attribute float aPhase;
uniform float uTime;
uniform float uScale;
varying float vPhase;

void main() {
  vPhase = aPhase;
  vec3 p = position;
  p.y += sin(uTime * 0.6 + aPhase * 6.2831) * 0.025;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale * (260.0 / max(4.0, -mv.z));
}
`;

export const PARTICLE_FRAGMENT = `
uniform vec3 uColor;
uniform float uTime;
varying float vPhase;

void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);
  float soft = smoothstep(0.5, 0.0, d);
  float pulse = 0.68 + 0.32 * sin(uTime * 1.2 + vPhase * 6.2831);
  gl_FragColor = vec4(uColor, soft * pulse);
}
`;

export const LIGHT_BEAM_FRAGMENT = `
uniform float uTime;
uniform float uOpacity;
varying float vSeed;

void main() {
  float streak = 0.5 + 0.5 * sin(uTime * 2.0 + vSeed * 10.0);
  float alpha = uOpacity * (0.42 + streak * 0.58);
  gl_FragColor = vec4(0.56, 0.88, 1.0, alpha);
}
`;
