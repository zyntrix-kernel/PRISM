// GALAXY: Procedural barred-spiral galaxy for the Singularity cinematic.
// Uses logarithmic spiral arms with differential rotation (inner particles
// rotate faster). Spiral structure inspired by ggwzrd/threejs-galaxy (MIT).
// Attribution: https://github.com/ggwzrd/threejs-galaxy

import * as THREE from 'three';

export function buildGalaxy(quality: string) {
  const count = quality === 'ultra' ? 60_000 : quality === 'high' ? 25_000 : 8_000;
  const arms = 4; // number of spiral arms
  const armSpread = 0.5; // how wide each arm is
  const spinFactor = 3.0; // how tightly wound the spiral is

  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    // Distance from center (power distribution: more stars near center)
    const r = Math.pow(Math.random(), 0.6) * 20;

    // Which spiral arm this particle belongs to
    const armIndex = Math.floor(Math.random() * arms);
    const armOffset = (armIndex / arms) * Math.PI * 2;

    // Logarithmic spiral: angle increases with radius
    const spiralAngle = Math.log(r + 1) * spinFactor + armOffset;

    // Random scatter around the arm (thicker near center, thinner at edges)
    const scatter = (Math.random() - 0.5) * armSpread * (1.0 + 3.0 / (r + 1));
    const angle = spiralAngle + scatter;

    // Vertical thickness (galaxy disk is thin, with a bulge at center)
    const yScatter = (Math.random() - 0.5) * (0.3 + 2.0 / (r + 0.5));

    pos[i * 3] = Math.cos(angle) * r;
    pos[i * 3 + 1] = yScatter;
    pos[i * 3 + 2] = Math.sin(angle) * r;

    // Color: hot blue-white core → warm yellow mid → cool red edges
    const distNorm = r / 20;
    const c = new THREE.Color();
    if (distNorm < 0.2) {
      c.setHSL(0.6, 0.5, 0.85); // blue-white core
    } else if (distNorm < 0.5) {
      c.setHSL(0.12, 0.6, 0.7); // yellow-white
    } else if (distNorm < 0.8) {
      c.setHSL(0.05, 0.7, 0.5); // orange
    } else {
      c.setHSL(0.98, 0.5, 0.4); // red edges
    }
    // Add some variation
    c.offsetHSL((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.5) * 0.1);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const mat = new THREE.PointsMaterial({
    size: quality === 'ultra' ? 0.06 : quality === 'high' ? 0.1 : 0.15,
    vertexColors: true,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  return new THREE.Points(geo, mat);
}
