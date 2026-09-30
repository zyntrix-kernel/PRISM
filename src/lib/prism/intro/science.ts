import * as THREE from "three";
import type { IntroPointerState, IntroQualityProfile, IntroScene } from "./types";
import { SeededRandom, randomSphere } from "./random";

export interface ScienceUpdateContext {
  readonly time: number;
  readonly delta: number;
  readonly scene: IntroScene;
  readonly phase: number;
  readonly energy: number;
  readonly pointer: IntroPointerState;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function smooth(value: number): number {
  const x = clamp(value);
  return x * x * (3 - 2 * x);
}

function pulse(time: number, speed: number, offset = 0): number {
  return 0.5 + 0.5 * Math.sin(time * speed + offset);
}

function setOpacity(
  material: THREE.Material | THREE.Material[],
  opacity: number,
): void {
  if (Array.isArray(material)) {
    for (const item of material) {
      if ("opacity" in item) {
        item.opacity = opacity;
        item.transparent = opacity < 0.999;
      }
    }
    return;
  }

  if ("opacity" in material) {
    material.opacity = opacity;
    material.transparent = opacity < 0.999;
  }
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose?.();

    if (mesh.material) {
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];

      for (const material of materials) {
        for (const key of Object.keys(material)) {
          const value = (material as unknown as Record<string, unknown>)[key];
          if (value && value instanceof THREE.Texture) {
            value.dispose();
          }
        }
        material.dispose();
      }
    }
  });
}

function cylinderBetween(
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  material: THREE.Material,
): THREE.Mesh {
  const direction = new THREE.Vector3().subVectors(b, a);
  const length = direction.length();
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, Math.max(0.01, length), 12, 1),
    material,
  );

  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  return mesh;
}

function lineFromPoints(
  points: THREE.Vector3[],
  material: THREE.Material,
): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geometry, material);
}

function glowMaterial(
  color: string,
  opacity = 1,
  size = 0.08,
): THREE.PointsMaterial {
  return new THREE.PointsMaterial({
    color,
    size,
    transparent: opacity < 1,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
}

function makeAtom(
  radius: number,
  color: string,
  metallic = 0.18,
): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 18, 18),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.75,
      metalness: metallic,
      roughness: 0.22,
      transparent: true,
    }),
  );
}

function makeRing(radius: number, thickness: number, color: string): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.TorusGeometry(radius, thickness, 10, 96),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.36,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
}

export class StarFieldSystem {
  readonly group = new THREE.Group();

  private readonly stars: THREE.Points;
  private readonly dust: THREE.Points;
  private readonly starPositions: Float32Array;
  private readonly dustPositions: Float32Array;
  private readonly starVelocities: Float32Array;

  constructor(profile: IntroQualityProfile, random: SeededRandom) {
    const starCount = Math.max(520, Math.min(3300, profile.starCount));
    this.starPositions = new Float32Array(starCount * 3);
    this.starVelocities = new Float32Array(starCount);

    for (let i = 0; i < starCount; i++) {
      const radius = random.range(12, 48);
      const dir = randomSphere(random);
      const i3 = i * 3;
      this.starPositions[i3] = dir.x * radius;
      this.starPositions[i3 + 1] = dir.y * radius * 0.72;
      this.starPositions[i3 + 2] = dir.z * radius;
      this.starVelocities[i] = random.range(0.15, 0.85);
    }

    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.starPositions, 3),
    );

    this.stars = new THREE.Points(
      starGeometry,
      glowMaterial("#c9ecff", 0.82, 0.045),
    );
    this.stars.frustumCulled = false;

    const dustCount = Math.max(120, Math.min(1100, profile.dustCount));
    this.dustPositions = new Float32Array(dustCount * 3);

    for (let i = 0; i < dustCount; i++) {
      const radius = random.range(4, 24);
      const dir = randomSphere(random);
      const i3 = i * 3;
      this.dustPositions[i3] = dir.x * radius;
      this.dustPositions[i3 + 1] = dir.y * radius;
      this.dustPositions[i3 + 2] = dir.z * radius;
    }

    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.dustPositions, 3),
    );

    this.dust = new THREE.Points(
      dustGeometry,
      glowMaterial("#579bff", 0.18, 0.032),
    );
    this.dust.frustumCulled = false;

    this.group.add(this.stars, this.dust);
  }

  update({ time, delta, scene, energy, pointer }: ScienceUpdateContext): void {
    const fieldBoost =
      scene === "physics" ||
      scene === "chemistry" ||
      scene === "mathematics" ||
      scene === "synthesis"
        ? 1
        : scene === "boot"
          ? 0.2
          : 0.48;

    this.group.rotation.y += delta * 0.007 * (1 + energy);
    this.group.rotation.x =
      Math.sin(time * 0.07) * 0.035 + pointer.y * 0.035;

    const attribute = this.stars.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < this.starVelocities.length; i += 1) {
      const i3 = i * 3;
      const z = this.starPositions[i3 + 2];
      const speed = this.starVelocities[i] * delta * (0.8 + fieldBoost * 0.8);
      this.starPositions[i3 + 2] = z + speed;
      if (this.starPositions[i3 + 2] > 48) this.starPositions[i3 + 2] = -48;
    }
    attribute.needsUpdate = true;

    setOpacity(this.stars.material, 0.2 + energy * 0.55);
    setOpacity(this.dust.material, 0.04 + energy * 0.14);

    this.stars.rotation.z += delta * 0.012;
    this.dust.rotation.z -= delta * 0.006;
  }

  dispose(): void {
    disposeObject(this.group);
  }
}

export class PhysicsSystem {
  readonly group = new THREE.Group();

  private readonly projectile: THREE.Mesh;
  private readonly projectileTrail: THREE.Line;
  private readonly pendulumArm: THREE.Line;
  private readonly pendulumBob: THREE.Mesh;
  private readonly orbit: THREE.Group;
  private readonly fieldParticles: THREE.Points;
  private readonly fieldPositions: Float32Array;
  private readonly origin = new THREE.Vector3(-6.5, -1.7, 0);

  constructor(random: SeededRandom) {
    const arcPoints: THREE.Vector3[] = [];
    const v0 = 9;
    const angle = THREE.MathUtils.degToRad(54);
    const g = 9.8;
    const tMax = (2 * v0 * Math.sin(angle)) / g;

    for (let i = 0; i < 96; i++) {
      const t = (i / 95) * tMax;
      const x = this.origin.x + v0 * Math.cos(angle) * t;
      const y = this.origin.y + v0 * Math.sin(angle) * t - 0.5 * g * t * t;
      arcPoints.push(new THREE.Vector3(x, y, 0));
    }

    this.projectileTrail = lineFromPoints(
      arcPoints,
      new THREE.LineBasicMaterial({
        color: "#7ed7ff",
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.group.add(this.projectileTrail);

    this.projectile = makeAtom(0.12, "#e6fbff");
    this.group.add(this.projectile);

    const pivot = new THREE.Vector3(2.8, 1.9, 0);
    this.pendulumArm = lineFromPoints(
      [pivot, pivot.clone().add(new THREE.Vector3(0, -2.8, 0))],
      new THREE.LineBasicMaterial({
        color: "#5b9cff",
        transparent: true,
        opacity: 0.65,
      }),
    );
    this.pendulumBob = makeAtom(0.23, "#8fe0ff");
    this.group.add(this.pendulumArm, this.pendulumBob);

    this.orbit = new THREE.Group();
    const sun = makeAtom(0.42, "#fff0a0");
    sun.material.emissiveIntensity = 2;
    const earth = makeAtom(0.22, "#65bfff");
    const moon = makeAtom(0.085, "#d7ecff");
    earth.position.x = 1.55;
    moon.position.x = 2.05;
    this.orbit.add(sun, earth, moon, makeRing(1.55, 0.012, "#6bb7ff"));
    this.orbit.position.set(-1.6, 2.1, -0.9);
    this.group.add(this.orbit);

    const count = 34;
    this.fieldPositions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      this.fieldPositions[i3] = random.range(-8, 8);
      this.fieldPositions[i3 + 1] = random.range(-4, 4);
      this.fieldPositions[i3 + 2] = random.range(-2.4, 2.4);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.fieldPositions, 3),
    );
    this.fieldParticles = new THREE.Points(
      geometry,
      glowMaterial("#4fa8ff", 0.45, 0.06),
    );
    this.group.add(this.fieldParticles);
  }

  update({ time, scene, energy, phase }: ScienceUpdateContext): void {
    const visibility =
      scene === "physics"
        ? smooth(Math.min(1, phase * 2.7))
        : scene === "chemistry"
          ? 1 - smooth(Math.min(1, phase * 1.4))
          : scene === "synthesis"
            ? 0.08
            : 0;

    setOpacity(this.projectileTrail.material, visibility * 0.82);
    setOpacity(this.projectile.material, visibility);
    setOpacity(this.pendulumArm.material, visibility * 0.72);
    setOpacity(this.pendulumBob.material, visibility);
    setOpacity((this.orbit.children[3] as THREE.Mesh).material, visibility * 0.6);
    this.orbit.children[0].visible = visibility > 0.01;
    this.orbit.children[1].visible = visibility > 0.01;
    this.orbit.children[2].visible = visibility > 0.01;

    const v0 = 9;
    const angle = THREE.MathUtils.degToRad(54);
    const g = 9.8;
    const tMax = (2 * v0 * Math.sin(angle)) / g;
    const local = (phase * tMax * 0.96) % tMax;
    const x = this.origin.x + v0 * Math.cos(angle) * local;
    const y = this.origin.y + v0 * Math.sin(angle) * local - 0.5 * g * local * local;
    this.projectile.position.set(
      x,
      y,
      Math.sin(time * 5) * 0.08,
    );

    const pivotY = 1.9;
    const pivotX = 2.8;
    const omega = Math.sqrt(g / 2.8);
    const swing = THREE.MathUtils.degToRad(26) * Math.cos(omega * time * 1.2);
    const bobX = pivotX + Math.sin(swing) * 2.8;
    const bobY = pivotY - Math.cos(swing) * 2.8;
    const pivot = new THREE.Vector3(pivotX, pivotY, 0);
    const bob = new THREE.Vector3(bobX, bobY, 0.12 * Math.sin(time * 2));
    this.pendulumArm.geometry.dispose();
    this.pendulumArm.geometry = new THREE.BufferGeometry().setFromPoints([pivot, bob]);
    this.pendulumBob.position.copy(bob);

    this.orbit.rotation.y = time * 0.45;
    this.orbit.rotation.x = Math.sin(time * 0.2) * 0.08;

    const positions = this.fieldParticles.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < this.fieldPositions.length / 3; i++) {
      const i3 = i * 3;
      const x0 = this.fieldPositions[i3];
      const y0 = this.fieldPositions[i3 + 1];
      const r = Math.sqrt(x0 * x0 + y0 * y0) + 0.4;
      const swirl = time * 0.18 + r * 0.25;
      this.fieldPositions[i3] = x0 + Math.cos(swirl + y0) * 0.018 * energy;
      this.fieldPositions[i3 + 1] = y0 + Math.sin(swirl + x0) * 0.018 * energy;
    }
    positions.needsUpdate = true;
    setOpacity(this.fieldParticles.material, visibility * 0.52);
  }

  dispose(): void {
    this.pendulumArm.geometry.dispose();
    disposeObject(this.group);
  }
}

export class ChemistrySystem {
  readonly group = new THREE.Group();

  private readonly shells: THREE.Mesh[] = [];
  private readonly electrons: Array<{ mesh: THREE.Mesh; radius: number; phase: number; speed: number }> = [];
  private readonly moleculeGroups: THREE.Group[] = [];
  private readonly lattice: THREE.Group;
  private readonly bonds: THREE.Mesh[] = [];

  constructor(random: SeededRandom) {
    const atom = new THREE.Group();
    atom.position.set(0, 0.1, 0);
    const nucleus = makeAtom(0.52, "#6aa8ff");
    atom.add(nucleus);
    atom.add(makeAtom(0.27, "#e8f8ff"));
    atom.children[1].position.set(0.2, 0.13, 0.16);

    for (let i = 0; i < 3; i++) {
      const shell = makeRing(1.0 + i * 0.56, 0.012, i % 2 === 0 ? "#72c9ff" : "#4b7bff");
      shell.rotation.x = Math.PI / 2 + i * 0.42;
      shell.rotation.z = i * 0.8;
      atom.add(shell);
      this.shells.push(shell);

      for (let e = 0; e < (i === 0 ? 2 : i === 1 ? 4 : 2); e++) {
        const electron = makeAtom(0.055, "#dff9ff");
        atom.add(electron);
        this.electrons.push({
          mesh: electron,
          radius: 1.0 + i * 0.56,
          phase: (e / Math.max(1, i === 0 ? 2 : i === 1 ? 4 : 2)) * Math.PI * 2 + i,
          speed: 0.9 + random.range(0.1, 0.55),
        });
      }
    }

    this.group.add(atom);

    const water = this.makeWaterMolecule();
    water.position.set(-3.7, -1.35, 0.2);
    this.moleculeGroups.push(water);

    const co2 = this.makeCo2Molecule();
    co2.position.set(3.8, -1.1, -0.4);
    this.moleculeGroups.push(co2);

    this.lattice = new THREE.Group();
    const spacing = 1.02;
    const material = new THREE.MeshStandardMaterial({
      color: "#4e9dff",
      emissive: "#4e9dff",
      emissiveIntensity: 0.55,
      metalness: 0.25,
      roughness: 0.25,
      transparent: true,
    });
    for (let x = -2; x <= 2; x++) {
      for (let y = -1; y <= 1; y++) {
        const node = new THREE.Mesh(
          new THREE.SphereGeometry(0.105, 10, 10),
          material.clone(),
        );
        node.position.set(x * spacing, y * spacing, Math.sin(x * 0.8 + y) * 0.35);
        this.lattice.add(node);
      }
    }

    const latticeNodes = this.lattice.children as THREE.Mesh[];
    for (let i = 0; i < latticeNodes.length; i++) {
      for (let j = i + 1; j < latticeNodes.length; j++) {
        if (latticeNodes[i].position.distanceTo(latticeNodes[j].position) < 1.12) {
          const bond = cylinderBetween(
            latticeNodes[i].position,
            latticeNodes[j].position,
            0.012,
            new THREE.MeshBasicMaterial({
              color: "#4f9bff",
              transparent: true,
              opacity: 0.3,
              blending: THREE.AdditiveBlending,
            }),
          );
          this.lattice.add(bond);
          this.bonds.push(bond);
        }
      }
    }
    this.lattice.position.set(0, 2.7, -1.7);
    this.group.add(this.lattice, ...this.moleculeGroups);
  }

  private makeWaterMolecule(): THREE.Group {
    const group = new THREE.Group();
    const oxygen = makeAtom(0.31, "#65bfff");
    const hydrogenA = makeAtom(0.16, "#f1fbff");
    const hydrogenB = makeAtom(0.16, "#f1fbff");
    hydrogenA.position.set(-0.62, -0.08, 0);
    hydrogenB.position.set(0.62, -0.08, 0);
    const bondMaterial = new THREE.MeshBasicMaterial({
      color: "#96ddff",
      transparent: true,
      opacity: 0.68,
      blending: THREE.AdditiveBlending,
    });

    group.add(oxygen, hydrogenA, hydrogenB);
    group.add(
      cylinderBetween(oxygen.position, hydrogenA.position, 0.045, bondMaterial),
      cylinderBetween(oxygen.position, hydrogenB.position, 0.045, bondMaterial.clone()),
    );
    group.rotation.z = -0.36;
    return group;
  }

  private makeCo2Molecule(): THREE.Group {
    const group = new THREE.Group();
    const carbon = makeAtom(0.27, "#c7e5ff");
    const oxygenA = makeAtom(0.22, "#ff9e9e");
    const oxygenB = makeAtom(0.22, "#ff9e9e");
    oxygenA.position.x = -0.78;
    oxygenB.position.x = 0.78;
    const bondMaterial = new THREE.MeshBasicMaterial({
      color: "#a9ddff",
      transparent: true,
      opacity: 0.68,
      blending: THREE.AdditiveBlending,
    });
    group.add(
      carbon,
      oxygenA,
      oxygenB,
      cylinderBetween(carbon.position, oxygenA.position, 0.04, bondMaterial),
      cylinderBetween(carbon.position, oxygenB.position, 0.04, bondMaterial.clone()),
    );
    group.rotation.z = 0.22;
    return group;
  }

  update({ time, scene, energy, phase, pointer }: ScienceUpdateContext): void {
    const visibility =
      scene === "chemistry"
        ? smooth(Math.min(1, phase * 2.5))
        : scene === "mathematics"
          ? 1 - smooth(Math.min(1, phase * 1.25))
          : scene === "synthesis"
            ? 0.12
            : 0;

    for (let i = 0; i < this.shells.length; i++) {
      const shell = this.shells[i];
      shell.rotation.y += 0.0018 * (i + 1);
      setOpacity(shell.material, visibility * (0.26 + energy * 0.15));
    }

    for (let i = 0; i < this.electrons.length; i++) {
      const e = this.electrons[i];
      const angle = time * e.speed + e.phase;
      e.mesh.position.set(
        Math.cos(angle) * e.radius,
        Math.sin(angle * 1.63) * (0.72 + e.radius * 0.08),
        Math.sin(angle) * e.radius,
      );
      setOpacity(e.mesh.material, visibility * 0.95);
    }

    for (let i = 0; i < this.moleculeGroups.length; i++) {
      const molecule = this.moleculeGroups[i];
      molecule.rotation.y = Math.sin(time * 0.55 + i) * 0.16 + pointer.x * 0.08;
      molecule.rotation.x = Math.cos(time * 0.34 + i) * 0.1;
      molecule.scale.setScalar(0.84 + visibility * 0.26);
      molecule.traverse((object) => {
        if (object instanceof THREE.Mesh && object.material) {
          setOpacity(object.material, visibility * 0.9);
        }
      });
    }

    this.lattice.rotation.y = time * 0.18;
    this.lattice.rotation.x = Math.sin(time * 0.23) * 0.08;
    this.lattice.scale.setScalar(0.82 + visibility * 0.22);
    this.lattice.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material) {
        setOpacity(object.material, visibility * 0.7);
      }
    });
  }

  dispose(): void {
    disposeObject(this.group);
  }
}

export class MathematicsSystem {
  readonly group = new THREE.Group();

  private readonly spiral: THREE.Line;
  private readonly sine: THREE.Line;
  private readonly parabola: THREE.Line;
  private readonly point: THREE.Mesh;
  private readonly torusKnot: THREE.Mesh;
  private readonly vectors: THREE.ArrowHelper[] = [];
  private readonly matrixBlocks: THREE.Mesh[] = [];

  constructor() {
    const lineMaterial = new THREE.LineBasicMaterial({
      color: "#8fdcff",
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
    });

    const goldenPoints: THREE.Vector3[] = [];
    for (let i = 0; i < 180; i++) {
      const theta = i / 15;
      const r = 0.08 * Math.pow(1.085, i * 0.6);
      goldenPoints.push(
        new THREE.Vector3(
          Math.cos(theta) * r * 0.42 - 4.7,
          Math.sin(theta) * r * 0.42 - 0.15,
          Math.sin(theta * 1.6) * 0.15,
        ),
      );
    }
    this.spiral = lineFromPoints(goldenPoints, lineMaterial.clone());
    this.group.add(this.spiral);

    const sinePoints: THREE.Vector3[] = [];
    const parabolaPoints: THREE.Vector3[] = [];
    for (let i = 0; i < 140; i++) {
      const x = -3.1 + (i / 139) * 6.2;
      sinePoints.push(new THREE.Vector3(x, Math.sin(x * 1.85) * 1.05, 0));
      parabolaPoints.push(
        new THREE.Vector3(x, 0.16 * x * x - 2.15, -0.9),
      );
    }
    this.sine = lineFromPoints(sinePoints, lineMaterial.clone());
    this.parabola = lineFromPoints(parabolaPoints, lineMaterial.clone());
    this.group.add(this.sine, this.parabola);

    this.point = makeAtom(0.11, "#f4fdff");
    this.group.add(this.point);

    this.torusKnot = new THREE.Mesh(
      new THREE.TorusKnotGeometry(1.05, 0.19, 128, 16),
      new THREE.MeshBasicMaterial({
        color: "#5ca8ff",
        transparent: true,
        opacity: 0.66,
        wireframe: true,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.torusKnot.position.set(3.7, 1.15, -0.5);
    this.group.add(this.torusKnot);

    for (let i = 0; i < 5; i++) {
      const arrow = new THREE.ArrowHelper(
        new THREE.Vector3(0.8, 0.25 * (i - 2), 0.35).normalize(),
        new THREE.Vector3(-2.4 + i * 1.2, 2.25 + Math.sin(i) * 0.18, 0.2),
        0.8 + i * 0.08,
        i % 2 === 0 ? "#77d6ff" : "#587fff",
        0.16,
        0.1,
      );
      this.vectors.push(arrow);
      this.group.add(arrow);
    }

    const blockGeometry = new THREE.BoxGeometry(0.28, 0.28, 0.28);
    for (let i = 0; i < 25; i++) {
      const x = i % 5;
      const y = Math.floor(i / 5);
      const block = new THREE.Mesh(
        blockGeometry,
        new THREE.MeshBasicMaterial({
          color: "#4d95ff",
          transparent: true,
          opacity: 0.36,
          blending: THREE.AdditiveBlending,
        }),
      );
      block.position.set(
        1.1 + x * 0.42,
        -2.6 + y * 0.42,
        Math.sin(x * 0.8 + y) * 0.24,
      );
      this.matrixBlocks.push(block);
      this.group.add(block);
    }
  }

  update({ time, scene, energy, phase, pointer }: ScienceUpdateContext): void {
    const visibility =
      scene === "mathematics"
        ? smooth(Math.min(1, phase * 2.6))
        : scene === "synthesis"
          ? 1 - smooth(Math.min(1, phase * 1.15))
          : scene === "prism"
            ? 0.06
            : 0;

    for (const line of [this.spiral, this.sine, this.parabola]) {
      setOpacity(line.material, visibility * 0.76);
    }

    this.spiral.rotation.z = -time * 0.08;
    this.sine.position.z = Math.sin(time * 0.4) * 0.18;
    this.parabola.position.z = -0.82 + pointer.x * 0.14;

    const x = -3.1 + ((time * 0.85) % 6.2);
    const y = Math.sin(x * 1.85) * 1.05;
    this.point.position.set(x, y, 0.1);
    setOpacity(this.point.material, visibility);

    this.torusKnot.rotation.x = time * 0.34;
    this.torusKnot.rotation.y = time * 0.5;
    setOpacity(this.torusKnot.material, visibility * 0.7);

    for (let i = 0; i < this.vectors.length; i++) {
      const arrow = this.vectors[i];
      const direction = new THREE.Vector3(
        Math.cos(time * 0.4 + i) * 0.65,
        Math.sin(time * 0.65 + i * 0.6) * 0.32,
        0.35,
      ).normalize();
      arrow.setDirection(direction);
      arrow.setLength(0.65 + visibility * (0.45 + i * 0.08), 0.16, 0.1);
      arrow.visible = visibility > 0.01;
    }

    for (let i = 0; i < this.matrixBlocks.length; i++) {
      const block = this.matrixBlocks[i];
      const pulseValue = pulse(time, 1.6, i * 0.3);
      block.position.z = Math.sin(time * 0.8 + i * 0.22) * 0.22;
      block.scale.setScalar(0.72 + pulseValue * 0.42 + energy * 0.18);
      setOpacity(block.material, visibility * (0.2 + pulseValue * 0.25));
    }

    this.group.rotation.y = pointer.x * 0.05;
  }

  dispose(): void {
    disposeObject(this.group);
  }
}

export class SynthesisSystem {
  readonly group = new THREE.Group();

  private readonly crystal: THREE.Mesh;
  private readonly wire: THREE.LineSegments;
  private readonly core: THREE.Mesh;
  private readonly rings: THREE.Mesh[] = [];
  private readonly shards: THREE.Mesh[] = [];

  constructor(random: SeededRandom) {
    this.crystal = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.35, 3),
      new THREE.MeshPhysicalMaterial({
        color: "#66b7ff",
        emissive: "#2678d5",
        emissiveIntensity: 0.68,
        metalness: 0.38,
        roughness: 0.1,
        transmission: 0.36,
        thickness: 0.8,
        transparent: true,
        opacity: 0.7,
        wireframe: true,
      }),
    );

    this.wire = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(3.0, 2)),
      new THREE.LineBasicMaterial({
        color: "#d9f7ff",
        transparent: true,
        opacity: 0.62,
        blending: THREE.AdditiveBlending,
      }),
    );

    this.core = new THREE.Mesh(
      new THREE.SphereGeometry(0.66, 32, 32),
      new THREE.MeshBasicMaterial({
        color: "#f3fdff",
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
      }),
    );

    this.group.add(this.crystal, this.wire, this.core);

    for (let i = 0; i < 6; i++) {
      const ring = makeRing(3.25 + i * 0.48, 0.013 + i * 0.0015, i % 2 ? "#5f8dff" : "#8be0ff");
      ring.rotation.x = Math.PI / 2 + i * 0.22;
      ring.rotation.z = i * 0.9;
      this.rings.push(ring);
      this.group.add(ring);
    }

    for (let i = 0; i < 64; i++) {
      const shard = new THREE.Mesh(
        new THREE.TetrahedronGeometry(random.range(0.04, 0.13)),
        new THREE.MeshBasicMaterial({
          color: i % 3 === 0 ? "#e6fbff" : "#4c9cff",
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
        }),
      );
      const dir = randomSphere(random);
      const radius = random.range(3.2, 7.5);
      shard.position.copy(dir).multiplyScalar(radius);
      this.shards.push(shard);
      this.group.add(shard);
    }
  }

  update({ time, scene, energy, phase, pointer }: ScienceUpdateContext): void {
    const visibility =
      scene === "synthesis"
        ? smooth(Math.min(1, phase * 2.4))
        : scene === "labs"
          ? 1 - smooth(Math.min(1, phase * 1.7))
          : scene === "prism"
            ? 0.38
            : scene === "team"
              ? 0.05
              : 0;

    this.crystal.rotation.x = -0.24 + Math.sin(time * 0.22) * 0.08;
    this.crystal.rotation.y = time * 0.45;
    this.crystal.rotation.z = Math.sin(time * 0.16) * 0.08;
    this.crystal.scale.setScalar(0.58 + visibility * 0.56 + pointer.y * 0.03);
    setOpacity(this.crystal.material, visibility * 0.75);

    this.wire.rotation.y = -time * 0.18;
    this.wire.rotation.x = time * 0.11;
    setOpacity(this.wire.material, visibility * 0.82);

    const corePulse = 0.86 + pulse(time, 2.6) * 0.22 + energy * 0.16;
    this.core.scale.setScalar(corePulse);
    setOpacity(this.core.material, visibility * 0.96);

    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i];
      ring.rotation.y += 0.0015 + i * 0.0005;
      setOpacity(ring.material, visibility * (0.08 + pulse(time, 1.1, i) * 0.16));
    }

    for (let i = 0; i < this.shards.length; i++) {
      const shard = this.shards[i];
      const angle = time * (0.12 + i * 0.002) + i;
      const radius = 3.4 + (i % 11) * 0.26 + energy * 2.0;
      shard.position.x = Math.cos(angle) * radius;
      shard.position.y = Math.sin(time * 0.34 + i * 0.17) * (1.6 + energy * 2.2);
      shard.position.z = Math.sin(angle) * radius;
      shard.rotation.x += 0.009;
      shard.rotation.y += 0.012;
      setOpacity(shard.material, visibility * (0.08 + pulse(time, 1.9, i) * 0.24));
    }
  }

  dispose(): void {
    disposeObject(this.group);
  }
}

export class ScienceShowcase {
  readonly group = new THREE.Group();

  private readonly stars: StarFieldSystem;
  private readonly physics: PhysicsSystem;
  private readonly chemistry: ChemistrySystem;
  private readonly mathematics: MathematicsSystem;
  private readonly synthesis: SynthesisSystem;

  constructor(profile: IntroQualityProfile, random: SeededRandom) {
    this.stars = new StarFieldSystem(profile, random);
    this.physics = new PhysicsSystem(random);
    this.chemistry = new ChemistrySystem(random);
    this.mathematics = new MathematicsSystem();
    this.synthesis = new SynthesisSystem(random);

    this.group.add(
      this.stars.group,
      this.physics.group,
      this.chemistry.group,
      this.mathematics.group,
      this.synthesis.group,
    );
  }

  update(context: ScienceUpdateContext): void {
    this.stars.update(context);
    this.physics.update(context);
    this.chemistry.update(context);
    this.mathematics.update(context);
    this.synthesis.update(context);

    this.group.rotation.y = context.pointer.x * 0.025;
    this.group.rotation.x = context.pointer.y * 0.02;
  }

  dispose(): void {
    disposeObject(this.group);
  }
}
