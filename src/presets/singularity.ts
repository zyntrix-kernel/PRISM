// SINGULARITY preset: a close-up black hole with Keplerian debris and three
// grabbable survey probes. Drag a probe inward and watch its year collapse.

import * as THREE from 'three';
import { buildBlackHole, type BlackHole } from './blackhole';
import { OrbitingDebris, OrbitSystem } from './orbits';
import { disposeGroup, type BuilderCtx, type WorldAPI } from './types';

const PROBES = [
  { name: 'Probe I', color: 0x00f0ff, radius: 3.1, periodDays: 46 },
  { name: 'Probe II', color: 0x7cff6b, radius: 4.2, periodDays: 72 },
  { name: 'Probe III', color: 0xffb347, radius: 5.4, periodDays: 105 },
];

export function buildSingularity(ctx: BuilderCtx): WorldAPI {
  const { world } = ctx;
  const grabbables: THREE.Object3D[] = [];
  const orbits = new OrbitSystem();
  const facts = new Map<string, string>();

  const hole: BlackHole = buildBlackHole(
    { horizon: 1.5, diskInner: 1.45, diskOuter: 3.2, diskSpeed: 1.2 },
    ctx.glowTex,
  );
  world.add(hole.group);

  const holeHit = new THREE.Mesh(
    new THREE.SphereGeometry(2.2, 12, 8),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  holeHit.name = 'Singularity';
  holeHit.userData.grabbable = false;
  world.add(holeHit);
  grabbables.push(holeHit);
  facts.set('Singularity', '10-sun black hole · nothing returns (decor)');

  const debris = new OrbitingDebris(500, 2.6, 7.2, 0.05, 0xd8a06a, 99);
  world.add(debris.mesh);

  const probeGeo = new THREE.SphereGeometry(0.14, 24, 18);
  PROBES.forEach((p, i) => {
    const mat = new THREE.MeshStandardMaterial({
      color: p.color,
      emissive: p.color,
      emissiveIntensity: 0.6,
      roughness: 0.4,
    });
    const probe = new THREE.Mesh(probeGeo, mat);
    probe.name = p.name;
    probe.userData.orbitBody = true;
    const angle = (i / PROBES.length) * Math.PI * 2 + 0.3;
    world.add(probe);
    grabbables.push(probe);
    orbits.register(probe, p.radius, angle, p.periodDays);
    facts.set(p.name, 'Survey probe · expendable, apparently');
  });

  return {
    grabbables,
    background: 'nebula',
    view: { distance: 11, pitch: 0.5, yaw: 0.4 },
    update(dt: number, elapsed: number): void {
      hole.update(dt, elapsed);
      debris.update(dt);
      orbits.update(dt * 20); // probes run hot: 20 days/sec for visible motion
      for (const probe of orbits.bodies) probe.rotation.y += dt;
    },
    reset(): void {
      orbits.reset();
    },
    setOrbitFromPoint(mesh: THREE.Mesh, localPoint: THREE.Vector3): void {
      // Keep probes outside the photon ring but inside the debris field.
      orbits.setFromPoint(mesh, localPoint, 2.4, 7.4);
    },
    bodyInfo(name: string | null): string | null {
      if (!name) return null;
      const f = facts.get(name);
      if (!f) return null;
      const body = orbits.bodies.find((b) => b.name === name);
      if (body) {
        const s = orbits.get(body);
        if (s) return `${name} — ${f} · r ${s.radius.toFixed(2)} · year ${s.periodDays.toFixed(0)} d`;
      }
      return `${name} — ${f}`;
    },
    dispose(): void {
      disposeGroup(world);
    },
  };
}
