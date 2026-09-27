// Fresnel rim glow shader — creates an atmospheric edge glow on spheres.
// Ported from cookieMonsterDev/solar-system-threejs (MIT).
// Attribution: https://github.com/cookieMonsterDev/solar-system-threejs

import * as THREE from 'three';

const VERT = /* glsl */ `
  uniform float fresnelBias;
  uniform float fresnelScale;
  uniform float fresnelPower;
  varying float vReflectionFactor;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vec3 worldNormal = normalize(mat3(modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz) * normal);
    vec3 I = worldPosition.xyz - cameraPosition;
    vReflectionFactor = fresnelBias + fresnelScale * pow(1.0 + dot(normalize(I), worldNormal), fresnelPower);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 color1;
  uniform vec3 color2;
  varying float vReflectionFactor;

  void main() {
    float f = clamp(vReflectionFactor, 0.0, 1.0);
    gl_FragColor = vec4(mix(color2, color1, vec3(f)), f);
  }
`;

/**
 * Creates a Fresnel glow mesh that wraps a sphere, giving it an atmospheric
 * edge glow. Place it as a child of the planet mesh, scaled slightly larger.
 *
 * @param radius The sphere radius
 * @param rimColor The glow color at the rim (edge)
 * @param facingColor The color when facing the camera (usually dark)
 */
export function createFresnelGlow(
  radius: number,
  rimColor: number,
  facingColor: number = 0x000000,
): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      color1: { value: new THREE.Color(rimColor) },
      color2: { value: new THREE.Color(facingColor) },
      fresnelBias: { value: 0.2 },
      fresnelScale: { value: 1.5 },
      fresnelPower: { value: 4.0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 14), material);
  mesh.scale.setScalar(1.1);
  return mesh;
}
