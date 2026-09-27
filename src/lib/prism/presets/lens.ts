// Gravitational lensing post-processing shader for the singularity preset.
// On Ultra quality, this pass distorts the rendered scene around the black
// hole's screen position, bending light rays — the classic Interstellar
// Gargantua effect. On lower tiers, it's a no-op (the pass isn't added).

import * as THREE from 'three';

const LENS_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const LENS_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  uniform vec2 uHolePos;     // screen-space position of the black hole (0..1)
  uniform float uHoleRadius; // event horizon screen radius (0..1)
  uniform float uStrength;   // lensing strength (0 = off, 1 = full)
  uniform float uTime;

  void main() {
    vec2 uv = vUv;
    vec2 hole = uHolePos;

    // Vector from hole center to current pixel
    vec2 d = uv - hole;
    float dist = length(d);

    // Einstein ring radius (where lensing is strongest)
    float einsteinR = uHoleRadius * 3.0;

    if (dist < uHoleRadius * 0.9) {
      // Inside the event horizon: pure black
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    // Gravitational lensing: bend the UV outward from the hole.
    // The deflection angle is proportional to 1/dist (Schwarzschild approximation).
    float deflection = uStrength * einsteinR * einsteinR / (dist * dist + 0.001);

    // Clamp so we don't sample too far
    deflection = min(deflection, 0.15);

    // Direction away from hole
    vec2 dir = normalize(d);

    // Bend the UV: sample from a position pushed outward (light wraps around)
    vec2 bentUv = uv - dir * deflection;

    // Add a subtle photon ring glow at the Einstein radius
    float ringGlow = exp(-pow((dist - einsteinR) / (uHoleRadius * 0.3), 2.0)) * 0.4 * uStrength;

    // Chromatic aberration near the hole (wavelength-dependent bending)
    float ca = deflection * 0.3;
    vec3 col;
    col.r = texture2D(tDiffuse, bentUv - dir * ca * 0.5).r;
    col.g = texture2D(tDiffuse, bentUv).g;
    col.b = texture2D(tDiffuse, bentUv + dir * ca * 0.5).b;

    // Add photon ring glow (warm white-gold)
    col += vec3(1.0, 0.9, 0.7) * ringGlow;

    // Slight darkening near the horizon (gravitational redshift)
    float redshift = smoothstep(uHoleRadius * 2.0, uHoleRadius * 0.9, dist) * 0.3 * uStrength;
    col *= (1.0 - redshift);

    gl_FragColor = vec4(col, 1.0);
  }
`;

export class GravitationalLensPass {
  readonly material: THREE.ShaderMaterial;
  private fsQuad: THREE.Mesh;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private mesh: THREE.Mesh;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: LENS_VERT,
      fragmentShader: LENS_FRAG,
      uniforms: {
        tDiffuse: { value: null as THREE.Texture | null },
        uHolePos: { value: new THREE.Vector2(0.5, 0.5) },
        uHoleRadius: { value: 0.05 },
        uStrength: { value: 0 },
        uTime: { value: 0 },
      },
      depthWrite: false,
      depthTest: false,
    });

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.scene.add(this.mesh);
  }

  /** Render the lensing effect over the existing framebuffer. */
  render(
    renderer: THREE.WebGLRenderer,
    readBuffer: THREE.WebGLRenderTarget,
    writeBuffer: THREE.WebGLRenderTarget | null,
    holePos: THREE.Vector2,
    holeRadius: number,
    strength: number,
    time: number,
  ): void {
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    this.material.uniforms.uHolePos.value.copy(holePos);
    this.material.uniforms.uHoleRadius.value = holeRadius;
    this.material.uniforms.uStrength.value = strength;
    this.material.uniforms.uTime.value = time;

    if (writeBuffer) {
      renderer.setRenderTarget(writeBuffer);
    } else {
      renderer.setRenderTarget(null);
    }
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
