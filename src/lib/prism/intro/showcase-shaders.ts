export const PRISM_VERTEX = `
varying vec3 vNormal;
varying vec3 vWorld;

void main() {
  // Preserve the optical object silhouette. Motion is expressed by the
  // camera, lighting and surrounding field rather than deforming the glass.
  vNormal = normalize(normalMatrix * normal);
  vec4 world = modelMatrix * vec4(position, 1.0);
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

float band(float x, float center, float width) {
  return 1.0 - smoothstep(width, width * 1.7, abs(x - center));
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);

  float facing = max(dot(N, V), 0.0);
  float fresnel = pow(1.0 - facing, 3.2);

  // A restrained spectral field: cyan -> azure -> blue -> violet.
  float spectralPhase = vWorld.x * 1.15 + vWorld.y * 0.42 + uTime * 0.16;
  float wave = 0.5 + 0.5 * sin(spectralPhase * 3.1);
  float bandA = band(wave, 0.18, 0.12);
  float bandB = band(wave, 0.48, 0.15);
  float bandC = band(wave, 0.78, 0.13);

  vec3 cyan = vec3(0.44, 0.89, 1.00);
  vec3 azure = vec3(0.20, 0.55, 1.00);
  vec3 violet = vec3(0.48, 0.43, 1.00);

  vec3 spectral = mix(azure, cyan, 0.45 + 0.35 * sin(spectralPhase));
  spectral = mix(spectral, violet, bandC * 0.42);

  // Facet response creates the sense of thick engineered glass.
  float facet = pow(1.0 - abs(N.y), 2.0);
  float caustic = pow(0.5 + 0.5 * sin(vWorld.x * 8.0 - vWorld.z * 5.0 + uTime * 0.7), 7.0);

  vec3 color = spectral;
  color = mix(color, vec3(0.88, 0.97, 1.0), fresnel * 0.86);
  color += vec3(0.53, 0.90, 1.0) * facet * 0.10;
  color += vec3(0.70, 0.94, 1.0) * caustic * (0.055 + uEnergy * 0.05);
  color += vec3(0.90, 0.98, 1.0) * uFlash * 0.65;
  color += vec3(0.35, 0.72, 1.0) * (bandA * 0.04 + bandB * 0.06);

  float alpha = 0.10 + fresnel * 0.64 + facet * 0.09 + uEnergy * 0.10 + uFlash * 0.10;
  gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.94));
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
