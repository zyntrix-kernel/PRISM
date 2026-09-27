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

  // Secondary white-hot core flash for the explosion climax
  const coreFlash = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex, color: 0xffffff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  coreFlash.visible = false;
  world.add(coreFlash);

  const shocks: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.9, 2.05, 128),
      new THREE.MeshBasicMaterial({
        color: i < 2 ? 0xffe6b8 : 0xff9a4d, transparent: true, opacity: 0,
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
  // Cinematic camera auto-orbit during detonation (set by detonate()).
  let cinematicYaw = 0.4;
  let cinematicPitch = 0.5;
  let cinematicDist = 11;
  let cinematicActive = false;

  // ── PARTICLE BURST SYSTEM ───────────────────────────────────────────
  // A radial burst of ~400 particles that fires at the explosion climax.
  // Each particle has a velocity + lifetime; they fade as they fly outward.
  const BURST_COUNT = 400;
  const burstPos = new Float32Array(BURST_COUNT * 3);
  const burstCol = new Float32Array(BURST_COUNT * 3);
  const burstVel: THREE.Vector3[] = [];
  const burstLife = new Float32Array(BURST_COUNT);
  for (let i = 0; i < BURST_COUNT; i++) {
    burstVel.push(new THREE.Vector3());
    burstLife[i] = 0;
  }
  const burstGeo = new THREE.BufferGeometry();
  burstGeo.setAttribute('position', new THREE.BufferAttribute(burstPos, 3));
  burstGeo.setAttribute('color', new THREE.BufferAttribute(burstCol, 3));
  const burstMat = new THREE.PointsMaterial({
    size: 0.3,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const burst = new THREE.Points(burstGeo, burstMat);
  burst.visible = false;
  world.add(burst);

  /** Fire the burst: give each particle a random radial velocity. */
  const fireBurst = (): void => {
    burst.visible = true;
    burstMat.opacity = 1;
    for (let i = 0; i < BURST_COUNT; i++) {
      burstPos[i * 3] = 0;
      burstPos[i * 3 + 1] = 0;
      burstPos[i * 3 + 2] = 0;
      // Random direction (uniform on a sphere)
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 8 + Math.random() * 12;
      burstVel[i].set(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.cos(phi) * speed,
        Math.sin(phi) * Math.sin(theta) * speed,
      );
      // Color: white-hot core fading to orange/pink
      const heat = Math.random();
      burstCol[i * 3] = 1;
      burstCol[i * 3 + 1] = 0.6 + heat * 0.4;
      burstCol[i * 3 + 2] = 0.3 + heat * 0.5;
      burstLife[i] = 1;
    }
    burstGeo.attributes.position.needsUpdate = true;
    burstGeo.attributes.color.needsUpdate = true;
  };

  /** Update the burst particles each frame. */
  const updateBurst = (dt: number): void => {
    if (!burst.visible) return;
    let alive = 0;
    for (let i = 0; i < BURST_COUNT; i++) {
      if (burstLife[i] <= 0) continue;
      burstLife[i] -= dt * 0.6;
      if (burstLife[i] <= 0) {
        burstPos[i * 3 + 1] = -999; // hide dead particles
        continue;
      }
      alive++;
      burstPos[i * 3] += burstVel[i].x * dt;
      burstPos[i * 3 + 1] += burstVel[i].y * dt;
      burstPos[i * 3 + 2] += burstVel[i].z * dt;
      // Slow down slightly (drag)
      burstVel[i].multiplyScalar(1 - dt * 0.5);
    }
    burstGeo.attributes.position.needsUpdate = true;
    burstMat.opacity = alive > 0 ? Math.min(1, alive / 100) : 0;
    if (alive === 0) burst.visible = false;
  };

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

  /** Smoothstep easing for cinematic transitions (ease-in-out). */
  const smooth = (t: number) => t * t * (3 - 2 * t);
  /** Exponential approach (frame-rate independent lerp). */
  const approach = (current: number, target: number, rate: number, dt: number) =>
    current + (target - current) * (1 - Math.exp(-rate * dt));

  /** Trigger the cinematic detonation sequence programmatically. */
  const detonate = (): void => {
    if (deto) return; // already running
    console.log('[PRISM] detonate() called — starting cinematic sequence');
    deto = { t: 0 };
    hole.setExtreme(true);
    flash.visible = true;
    coreFlash.visible = true;
    for (const shock of shocks) shock.visible = true;
    shakeCamera(0.9);
    cinematicActive = true;
    cinematicYaw = 0.4;
    cinematicPitch = 0.5;
    cinematicDist = 11;
  };

  // Listen for programmatic detonation (button / command palette / keyboard).
  const onDetonate = (): void => detonate();
  if (typeof window !== 'undefined') {
    window.addEventListener('prism-detonate', onDetonate);
  }

  return {
    grabbables,
    background: 'nebula',
    view: { distance: 11, pitch: 0.5, yaw: 0.4 },
    /** Cinematic camera override: when active, the scene rig uses these.
     *  Evaluated as a getter so it reflects the live cinematicActive state. */
    get cinematicCamera() {
      return cinematicActive
        ? { yaw: cinematicYaw, pitch: cinematicPitch, distance: cinematicDist }
        : null;
    },
    coachHint(): string | null {
      if (deto) return null; // let the visuals speak
      return 'Drag a probe into the hole · or press Detonate';
    },
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
              detonate();
            }
          } else {
            probe.userData.diveT = 0;
          }
        }
        // Idle cinematic: slow drift when not detonating
        if (cinematicActive) {
          cinematicYaw = approach(cinematicYaw, 0.4, 1, dt);
          cinematicPitch = approach(cinematicPitch, 0.5, 1, dt);
          cinematicDist = approach(cinematicDist, 11, 1, dt);
          if (Math.abs(cinematicYaw - 0.4) < 0.01) cinematicActive = false;
        }
      } else {
        // Clamp dt so the sequence doesn't skip phases on slow frame rates.
        const seqDt = Math.min(dt, 0.05);
        deto.t += seqDt;
        const t = deto.t;

        // ── CINEMATIC SEQUENCE: 5 ACTS ───────────────────────────────────
        // Act 1 (0-2s):   Push IN close + escalating tremors (destabilizing)
        // Act 2 (2-4s):   Violent shaking + hole destabilizes maximally
        // Act 3 (4-6s):   EXTREME zoom-out — black hole shrinks to a dot
        // Act 4 (6-9s):   Galaxy appears, rotates, goes unstable
        // Act 5 (9-11s):  Galaxy BLASTS apart (massive explosion)
        // Final (11s+):   Settle back to home

        if (t < 2) {
          // Act 1: push in close + escalating tremors
          cinematicYaw += dt * 0.3;
          cinematicPitch = approach(cinematicPitch, 0.35, 1.5, dt);
          cinematicDist = approach(cinematicDist, 6, 2, dt);
          if (Math.sin(t * 12) > 0.9) shakeCamera(t * 0.15);
        } else if (t < 4) {
          // Act 2: violent shaking + hole at maximum destabilization
          cinematicYaw += dt * 0.4;
          cinematicPitch = approach(cinematicPitch, 0.45, 1, dt);
          cinematicDist = approach(cinematicDist, 7, 1, dt);
          if (Math.sin(t * 25) > 0.6) shakeCamera(0.4 + (t - 2) * 0.15);
        } else if (t < 6) {
          // Act 3: EXTREME zoom-out — black hole shrinks to a dot
          // Direct lerp (not approach) for fast, dramatic pull-back
          const zoomT = smooth((t - 4) / 2);
          cinematicDist = 7 + zoomT * 73;  // 7 → 80
          cinematicYaw += dt * 0.15;
          cinematicPitch = 0.5 + zoomT * 0.2;
        } else if (t < 9) {
          // Act 4: hold extremely wide, galaxy emerges + destabilizes
          cinematicDist = approach(cinematicDist, 80, 1.5, dt);
          cinematicYaw += dt * 0.06;
          cinematicPitch = approach(cinematicPitch, 0.65, 0.5, dt);
        } else if (t < 11) {
          // Act 5: galaxy blasts — push in slightly for immersion
          cinematicDist = approach(cinematicDist, 45, 1.2, dt);
          cinematicYaw += dt * 0.3;
        }
        cinematicActive = true;

        // ── WORLD SCALE (the black hole shrinks during zoom-out) ────────
        const zoom =
          t < 2 ? 1 - smooth(t / 2) * 0.3
          : t < 4 ? 0.7
          : t < 6 ? 0.7 - smooth((t - 4) / 2) * 0.69  // shrink to 0.01
          : t < 9 ? 0.01  // tiny dot
          : t < 11 ? 0.01
          : 1;
        world.scale.setScalar(zoom);

        // During Act 3+, the galaxy grows to dominate the view.
        // The black hole is still there but becomes insignificant at the galaxy's scale.
        world.visible = true; // keep visible — the galaxy is a child of world

        // ── DEBRIS SPIN ──────────────────────────────────────────────────
        const spin =
          t < 2 ? 1 + smooth(t / 2) * 9
          : t < 4 ? 12
          : t < 6 ? 12 - smooth((t - 4) / 2) * 11
          : 1;
        debris.spinBoost = spin;

        // ── PROBE FLING ─────────────────────────────────────────────────
        if (t < 3) {
          for (const probe of orbits.bodies) {
            const s = orbits.get(probe);
            if (s) s.radius = Math.min(14, s.radius + dt * 3.5);
          }
        }

        // ── HOLE EXTREME MODE ───────────────────────────────────────────
        if (t < 4) hole.setExtreme(true);
        else if (t < 8.5) hole.setExtreme(false);
        else hole.setExtreme(false);

        // ── FLASH ───────────────────────────────────────────────────────
        const flashMat = flash.material as THREE.SpriteMaterial;
        flashMat.opacity =
          t < 2 ? 0.95
          : t < 3.5 ? Math.max(0, 0.95 * (1 - (t - 2) / 1.5))
          : t > 9 && t < 9.3 ? 0.9 * (1 - (t - 9) / 0.3)
          : 0;
        const fsc = 3 + Math.sin(Math.min(t, 2) * 9) * 0.8 + t * 1.5;
        flash.scale.set(fsc, fsc, 1);

        // ── CORE FLASH (galaxy explosion climax at t=9) ───────────────
        const coreMat = coreFlash.material as THREE.SpriteMaterial;
        if (t > 8.8 && t < 10.5) {
          const ct = t - 8.8;
          coreMat.opacity = Math.max(0, 1 - ct / 1.7) * (ct < 0.2 ? ct / 0.2 : 1);
          const cs = 5 + ct * 30;
          coreFlash.scale.set(cs, cs, 1);
        } else {
          coreMat.opacity = 0;
        }

        // ── SHOCKWAVES ──────────────────────────────────────────────────
        shocks.forEach((shock, i) => {
          const lt = t - i * 0.28;
          const k = Math.min(Math.max(lt / 1.8, 0), 1);
          const mat = shock.material as THREE.MeshBasicMaterial;
          mat.opacity = 0.8 * Math.pow(1 - k, 1.5);
          const sc = 1 + smooth(k) * 11;
          shock.scale.set(sc, sc, 1);
          shock.visible = k < 1 && t < 8.5;
        });

        // ── GALAXY REVEAL + DESTABILIZATION + EXPLOSION ────────────────
        // Galaxy appears at t=4 (Act 3) and grows to dominate the view
        if (t >= 4) {
          if (galaState === 'hidden') {
            galaState = 'revealing';
            galaxy.visible = true;
            galaxy.rotation.z = 0;
          }
          if (galaState === 'revealing') {
            const revealT = t - 4;
            // Galaxy grows from tiny to MASSIVE (fills the wide view)
            const s = 1 + smooth(revealT / 5) * 80;
            galaxy.scale.setScalar(s);
            galaxy.rotation.y += dt * 0.2;
            // Destabilize: rotation accelerates over time
            galaxy.rotation.y += dt * revealT * 0.3;
            // Wobble (instability)
            galaxy.rotation.z = Math.sin(revealT * 3) * 0.05 * smooth(revealT / 3);
            if (revealT >= 5) {
              galaState = 'exploding';
              shakeCamera(1.0);
              fireBurst();
            }
          }
          if (galaState === 'exploding') {
            const expT = t - 9;
            // Explosive expansion (accelerating outward violently)
            const s = 81 * (1 + expT * expT * 3);
            galaxy.scale.setScalar(s);
            galaxy.rotation.y += dt * 1.5;
            galaxy.rotation.z += dt * 0.5;
            const gMat = galaxy.material as THREE.PointsMaterial;
            gMat.opacity = Math.max(0, 1 - expT / 2);
            // Big shake at the explosion peak
            if (expT > 0 && expT < 0.15) shakeCamera(1.0);
            if (expT >= 2) {
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
            world.visible = true; // restore world visibility
            flash.visible = false;
            coreFlash.visible = false;
            cinematicActive = false;
            // Re-add the black hole + debris + probes to the scene
            if (!hole.group.parent) world.add(hole.group);
            if (!debris.mesh.parent) world.add(debris.mesh);
            for (const probe of orbits.bodies) {
              if (!probe.parent) world.add(probe);
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
      updateBurst(dt);
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
      if (typeof window !== 'undefined') {
        window.removeEventListener('prism-detonate', onDetonate);
      }
      disposeGroup(world);
    },
  };
}
