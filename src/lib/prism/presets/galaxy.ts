// GALAXY: High-detail procedural galaxy for the Singularity cinematic.
// Built as a single mesh of 20k-100k particles using a logarithmic spiral.
import * as THREE from 'three';

export function buildGalaxy(quality: string) {
  const count = quality === 'ultra' ? 100_000 : quality === 'high' ? 40_000 : 10_000;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const r = Math.pow(Math.random(), 2) * 20;
    const angle = r * 1.5 + Math.random() * Math.PI * 2;
    const spread = (Math.random() - 0.5) * (0.5 + r * 0.1);
    
    pos[i * 3] = Math.cos(angle) * r;
    pos[i * 3 + 1] = spread;
    pos[i * 3 + 2] = Math.sin(angle) * r;

    const hue = 0.6 + Math.random() * 0.1;
    const sat = 0.4 + Math.random() * 0.4;
    const lum = 0.5 + Math.random() * 0.5;
    const c = new THREE.Color().setHSL(hue, sat, lum);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const mat = new THREE.PointsMaterial({
    size: quality === 'ultra' ? 0.015 : 0.03,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  return new THREE.Points(geo, mat);
}
