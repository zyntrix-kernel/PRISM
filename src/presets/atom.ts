// ATOM preset: an interactive Bohr model. Three shells (n = 1, 2, 3) with
// one electron each; grab an electron and drop it on another shell. Falling
// to a lower shell emits a photon flash labeled with its true wavelength
// (E = 13.6·(1/n² − 1/m²) eV, λ = 1240/E nm) — the interaction IS the lesson.

import * as THREE from 'three';
import { makeLabel } from './labels';
import { OrbitSystem } from './orbits';
import { disposeGroup, type BuilderCtx, type WorldAPI } from './types';

export interface Shell {
  n: number;
  radius: number;
  /** Orbital period in seconds (passed through the day-based orbit system). */
  period: number;
}

export const SHELLS: Shell[] = [
  { n: 1, radius: 1.6, period: 5 },
  { n: 2, radius: 2.7, period: 11 },
  { n: 3, radius: 4.0, period: 19 },
];

/** Nearest shell index for a dragged radius. */
export function shellOfRadius(radius: number): number {
  let best = 0;
  for (let i = 1; i < SHELLS.length; i++) {
    if (Math.abs(radius - SHELLS[i].radius) < Math.abs(radius - SHELLS[best].radius)) {
      best = i;
    }
  }
  return best;
}

/** Photon wavelength (nm) for a drop from shell nFrom to nTo (nFrom > nTo). */
export function photonNm(nFrom: number, nTo: number): number {
  const energyEV = 13.6 * (1 / (nTo * nTo) - 1 / (nFrom * nFrom));
  return 1240 / energyEV;
}

/** Human color name for the info panel. */
export function photonColorName(nm: number): string {
  if (nm < 380) return 'ultraviolet';
  if (nm < 450) return 'violet';
  if (nm < 495) return 'blue';
  if (nm < 570) return 'green';
  if (nm < 590) return 'yellow';
  if (nm < 620) return 'orange';
  if (nm < 750) return 'red';
  return 'infrared';
}

export function buildAtom(ctx: BuilderCtx): WorldAPI {
  const { world, labelLayer, glowTex } = ctx;
  const grabbables: THREE.Object3D[] = [];
  const orbits = new OrbitSystem();
  const facts = new Map<string, string>();
  const labels: THREE.Sprite[] = [];
  const tmp = new THREE.Vector3();
  // Last settled shell per electron: dropping below it emits a photon.
  const lastShell = new Map<THREE.Mesh, number>();
  let lastEmission: string | null = null;

  // Nucleus: proton/neutron cluster + glow (info only).
  const nucleus = new THREE.Group();
  const nucleonGeo = new THREE.SphereGeometry(0.16, 16, 12);
  const protonMat = new THREE.MeshStandardMaterial({ color: 0xe04848, emissive: 0xe04848, emissiveIntensity: 0.5, roughness: 0.5 });
  const neutronMat = new THREE.MeshStandardMaterial({ color: 0xd8dce8, emissive: 0x888899, emissiveIntensity: 0.3, roughness: 0.6 });
  const spots: Array<[number, number, number]> = [
    [0, 0, 0], [0.26, 0.1, 0.05], [-0.24, 0.12, -0.08], [0.05, -0.25, 0.1],
    [-0.08, 0.05, 0.26], [0.12, 0.2, -0.22], [-0.2, -0.18, 0.12], [0.22, -0.12, -0.14],
  ];
  spots.forEach(([x, y, z], i) => {
    const nucleon = new THREE.Mesh(nucleonGeo, i % 2 === 0 ? protonMat : neutronMat);
    nucleon.position.set(x, y, z);
    nucleus.add(nucleon);
  });
  const coreGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex, color: 0xff8a5c, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  coreGlow.scale.set(2.2, 2.2, 1);
  nucleus.add(coreGlow);
  nucleus.name = 'Nucleus';
  nucleus.userData.grabbable = false;
  world.add(nucleus);
  grabbables.push(nucleus);
  facts.set('Nucleus', 'Protons + neutrons · 99.97% of atomic mass');

  // Shells + electrons.
  const electronGeo = new THREE.SphereGeometry(0.13, 24, 18);
  SHELLS.forEach((shell, si) => {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 96; k++) {
      const a = (k / 96) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * shell.radius, 0, Math.sin(a) * shell.radius));
    }
    world.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x2a6a8a, transparent: true, opacity: 0.7 }),
      ),
    );
    const label = makeLabel(`n=${shell.n}`, 0.8);
    labelLayer.add(label);
    labels.push(label);

    const mat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff, emissive: 0x00f0ff, emissiveIntensity: 0.9, roughness: 0.3,
    });
    const electron = new THREE.Mesh(electronGeo, mat);
    electron.name = `Electron n=${shell.n}`;
    electron.userData.orbitBody = true;
    const angle = (si / SHELLS.length) * Math.PI * 2 + 0.4;
    world.add(electron);
    grabbables.push(electron);
    orbits.register(electron, shell.radius, angle, shell.period);
    lastShell.set(electron, si);
    facts.set(electron.name, 'Electron · drag it to another shell');
  });

  // Photon flash pool (one reusable glow sprite, scaled + faded).
  const flash = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex, color: 0xfff2c8, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  flash.visible = false;
  world.add(flash);
  let flashT = 1e9;

  const shellName = (mesh: THREE.Mesh): string => {
    const s = orbits.get(mesh);
    return s ? `n=${SHELLS[shellOfRadius(s.radius)].n}` : '';
  };

  return {
    grabbables,
    background: 0x05070f,
    view: { distance: 9.5, pitch: 0.5, yaw: 0.4 },
    update(dt: number, elapsed: number): void {
      void elapsed;
      orbits.update(dt); // periods registered in seconds
      for (const electron of orbits.bodies) {
        electron.rotation.y += dt * 3;
        // Emission check: settled shell dropped below the last recorded one.
        const s = orbits.get(electron);
        if (!s || electron.userData.grabbed) continue;
        const now = shellOfRadius(s.radius);
        const prev = lastShell.get(electron) ?? now;
        if (now < prev) {
          const nm = photonNm(SHELLS[prev].n, SHELLS[now].n);
          lastEmission = `Photon ${nm.toFixed(0)} nm (${photonColorName(nm)})`;
          electron.getWorldPosition(tmp);
          flash.position.copy(tmp);
          flashT = 0;
          facts.set(electron.name, `Electron · just emitted ${nm.toFixed(0)} nm`);
        }
        lastShell.set(electron, now);
      }
      if (flashT < 0.8) {
        flashT += dt;
        const k = Math.min(1, flashT / 0.8);
        flash.visible = true;
        (flash.material as THREE.SpriteMaterial).opacity = 0.9 * (1 - k);
        const sc = 0.6 + k * 2.4;
        flash.scale.set(sc, sc, 1);
      } else {
        flash.visible = false;
      }
      nucleus.rotation.y += dt * 0.3;
      for (let i = 0; i < orbits.bodies.length; i++) {
        const body = orbits.bodies[i];
        body.getWorldPosition(tmp);
        labels[i].position.set(tmp.x, tmp.y + 0.45, tmp.z);
      }
    },
    reset(): void {
      orbits.reset();
      for (const electron of orbits.bodies) {
        const s = orbits.get(electron);
        if (s) lastShell.set(electron, shellOfRadius(s.home.radius));
      }
      lastEmission = null;
      flashT = 1e9;
      flash.visible = false;
    },
    setOrbitFromPoint(mesh: THREE.Mesh, localPoint: THREE.Vector3): void {
      // Magnetic shells: snap live to the nearest shell while dragging.
      const s = orbits.get(mesh);
      if (!s) return;
      const snapped = SHELLS[shellOfRadius(Math.hypot(localPoint.x, localPoint.z))];
      s.radius = snapped.radius;
      s.angle = Math.atan2(localPoint.z, localPoint.x);
      s.periodDays = snapped.period;
    },
    bodyInfo(name: string | null): string | null {
      if (!name) return lastEmission ? `Atom (Bohr model) · last event: ${lastEmission}` : null;
      const factsLine = facts.get(name);
      if (!factsLine) return null;
      if (name.startsWith('Electron')) {
        const body = orbits.bodies.find((b) => b.name === name);
        const extra = body ? ` · shell ${shellName(body)}` : '';
        return `${name} — ${factsLine}${extra}`;
      }
      return `${name} — ${factsLine}`;
    },
    dispose(): void {
      disposeGroup(world);
      disposeGroup(labelLayer);
    },
  };
}
