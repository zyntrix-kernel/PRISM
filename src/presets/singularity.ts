// SINGULARITY preset: a close-up black hole with Keplerian debris and three
// grabbable survey probes. Drag a probe inward and watch its year collapse.

import * as THREE from 'three';
import { buildBlackHole, type BlackHole } from './blackhole';
import { OrbitingDebris, OrbitSystem } from './orbits';
import { disposeGroup, type BuilderCtx, type WorldAPI } from './types';
import { buildGalaxy } from './galaxy';

const PROBES = [
  { name: 'Probe I', color: 0x00f0ff, radius: 3.1, periodDays: 46 },
  { name: 'Probe II', color: 0x7cff6b, radius: 4.2, periodDays: 72 },
  { name: 'Probe III', color: 0xffb347, radius: 5.4, periodDays: 105 },
];

export function buildSingularity(ctx: BuilderCtx): WorldAPI {
  const { world, glowTex, shakeCamera } = ctx;
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

  // Galaxy for the grand finale
  const galaxy = buildGalaxy(ctx.quality);
  galaxy.visible = false;
  galaxy.scale.setScalar(0.1);
  world.add(galaxy);

  // Detonation kit: drag a grabbed probe inside r 2.6 and hold 0.5 s to
  // push the hole EXTREME — disk flares, jets roar, debris spins up, probes
  // fling outward while the world pulls back, then everything reforms.
  const flash = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex, color: 0xfff2d8, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  flash.visible = false;
  world.add(flash);
  const shocks: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.9, 2.05, 96),
      new THREE.MeshBasicMaterial({
        color: 0xffb37a, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    world.add(ring);
    shocks.push(ring);
  }
  let deto: { t: number } | null = null;
  let galaState: 'hidden' | 'revealing' | 'exploding' | 'done' = 'hidden';

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
      // Detonation trigger: grabbed probe held inside r 2.6 charges 0.5 s.
      if (!deto) {
        for (const probe of orbits.bodies) {
          const s = orbits.get(probe);
          if (!s) continue;
          if (probe.userData.grabbed && s.radius < 2.6) {
            const charge = ((probe.userData.diveT as number | undefined) ?? 0) + dt;
            probe.userData.diveT = charge;
            if (charge >= 0.5) {
              probe.userData.diveT = 0;
              deto = { t: 0 };
              hole.setExtreme(true);
              flash.visible = true;
              for (const shock of shocks) shock.visible = true;
              shakeCamera(0.8);
            }
          } else {
            probe.userData.diveT = 0;
          }
        }
      } else {
        deto.t += dt;
        const t = deto.t;
        // Act 1 (0–2 s): spin up, fling probes, pull the world back.
        // Act 2 (2–3.2 s): hold the wide shot, flash pulses.
        // Act 3 (3.2–4.5 s): settle everything home.
        const spin = t < 2 ? 1 + (t / 2) * 7 : t < 3.2 ? 8 : Math.max(1, 8 - (t - 3.2) * 5.4);
        debris.spinBoost = spin;
        const zoom = t < 2 ? 1 - (t / 2) * 0.45 : t < 3.2 ? 0.55 : 0.55 + ((t - 3.2) / 1.3) * 0.45;
        world.scale.setScalar(zoom);
        if (t < 2.5) {
          for (const probe of orbits.bodies) {
            const s = orbits.get(probe);
            if (s) s.radius = Math.min(14, s.radius + dt * 3);
          }
        }
        if (t > 3.2 && hole) hole.setExtreme(false);
        (flash.material as THREE.SpriteMaterial).opacity = t < 2 ? 0.95 : Math.max(0, 0.95 * (1 - (t - 2) / 1.2));
        const fsc = 3 + Math.sin(Math.min(t, 2) * 9) * 0.8 + t * 1.5;
        flash.scale.set(fsc, fsc, 1);
        shocks.forEach((shock, i) => {
          const lt = t - i * 0.3;
          const k = Math.min(Math.max(lt / 1.6, 0), 1);
          const mat = shock.material as THREE.MeshBasicMaterial;
          mat.opacity = 0.75 * (1 - k);
          const sc = 1 + k * 9;
          shock.scale.set(sc, sc, 1);
          shock.visible = k < 1;
        });
        if (t >= 4.5) {
          if (galaState === 'hidden') {
            galaState = 'revealing';
            galaxy.visible = true;
          }
          if (galaState === 'revealing') {
            const revealT = t - 4.5;
            const s = 0.1 + (revealT / 3) * 19;
            galaxy.scale.setScalar(s);
            if (revealT >= 3) galaState = 'exploding';
          }
          if (galaState === 'exploding') {
            const expT = t - 7.5;
            const s = 20 * (1 + expT * 2);
            galaxy.scale.setScalar(s);
            galaxy.material.opacity = Math.max(0, 1 - expT / 1.5);
            if (expT >= 1.5) {
              galaState = 'done';
              galaxy.visible = false;
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('prism-reset-world'));
              }
            }
          }
          if (galaState === 'done') {
            deto = null;
            debris.spinBoost = 1;
            world.scale.setScalar(1);
            flash.visible = false;
            for (const probe of orbits.bodies) {
              const s = orbits.get(probe);
              if (s) {
                s.radius = s.home.radius;
                s.periodDays = s.home.periodDays;
              }
            }
          }
        }
      }
      hole.update(dt, elapsed);
      debris.update(dt);
      orbits.update(dt * 20); // probes run hot: 20 days/sec for visible motion
      for (const probe of orbits.bodies) probe.rotation.y += dt;
    },
    setOrbitFromPoint(mesh: THREE.Mesh, localPoint: THREE.Vector3): void {
      // Keep probes outside the photon ring but inside the debris field.
      orbits.setFromPoint(mesh, localPoint, 2.4, 7.4);
    },
    bodyInfo(name: string | null): string | null {
      if (deto) return 'SUPERMASSIVE DETONATION — the galaxy is coming apart!';
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
