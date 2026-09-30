
import * as THREE from "three";
import {
  damp,
  easeInOutCubic,
  easeOutExpo,
  lerp,
  pulse,
} from "./easing";
import { SeededRandom, randomSphere } from "./random";
import {
  ATMOSPHERE_FRAGMENT,
  CORE_FRAGMENT,
  CRYSTAL_FRAGMENT,
  CRYSTAL_VERTEX,
  DUST_FRAGMENT,
  DUST_VERTEX,
  PORTAL_FRAGMENT,
  STAR_FRAGMENT,
  STAR_VERTEX,
} from "./shaders";
import type {
  IntroPointerState,
  IntroQualityProfile,
  IntroScene,
} from "./types";

function setOpacity(
  material: THREE.Material | THREE.Material[],
  opacity: number,
): void {
  const list = Array.isArray(material)
    ? material
    : [material];

  for (const item of list) {
    item.transparent = true;
    item.opacity = opacity;
  }
}

function disposeMaterial(
  material?: THREE.Material | THREE.Material[],
): void {
  if (!material) return;

  if (Array.isArray(material)) {
    for (const item of material) {
      item.dispose();
    }
  } else {
    material.dispose();
  }
}

function disposeObject(
  object: THREE.Object3D,
): void {
  object.traverse((child) => {
    const renderable =
      child as THREE.Mesh<
        THREE.BufferGeometry,
        THREE.Material | THREE.Material[]
      >;

    renderable.geometry?.dispose();
    disposeMaterial(renderable.material);
  });
}

/* =========================================================
   ATMOSPHERE
   ========================================================= */

export class AtmosphereSystem {
  readonly group = new THREE.Group();

  private readonly material: THREE.ShaderMaterial;
  private readonly plane: THREE.Mesh;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0 },
        uPointerX: { value: 0 },
        uPointerY: { value: 0 },
      },
      vertexShader: [
        "varying vec2 vUv;",
        "void main() {",
        "  vUv = uv;",
        "  gl_Position = vec4(position.xy, 0.999, 1.0);",
        "}",
      ].join("\n"),
      fragmentShader: ATMOSPHERE_FRAGMENT,
    });

    this.plane = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.material,
    );

    this.plane.frustumCulled = false;
    this.group.renderOrder = -1000;
    this.plane.renderOrder = -1000;
    this.group.add(this.plane);
  }

  update(
    time: number,
    energy: number,
    pointer: IntroPointerState,
  ): void {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uEnergy.value = energy;
    this.material.uniforms.uPointerX.value = pointer.x;
    this.material.uniforms.uPointerY.value = pointer.y;
  }

  dispose(): void {
    disposeObject(this.group);
  }
}

/* =========================================================
   STARFIELD
   ========================================================= */

export class StarFieldSystem {
  readonly points: THREE.Points;

  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;

  constructor(
    profile: IntroQualityProfile,
    random: SeededRandom,
  ) {
    const count = profile.starCount;

    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const sizes = new Float32Array(count);
    const alphas = new Float32Array(count);
    const twinkles = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const sphere = randomSphere(random);
      const radius = random.range(45, 520);

      positions[i3] = sphere.x * radius;
      positions[i3 + 1] = sphere.y * radius;
      positions[i3 + 2] = sphere.z * radius;

      phases[i] = random.range(0, Math.PI * 2);
      sizes[i] = random.range(0.6, 3.2);
      alphas[i] = random.range(0.22, 0.95);
      twinkles[i] = random.range(0.2, 1.7);
    }

    this.geometry = new THREE.BufferGeometry();

    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );
    this.geometry.setAttribute(
      "aPhase",
      new THREE.BufferAttribute(phases, 1),
    );
    this.geometry.setAttribute(
      "aSize",
      new THREE.BufferAttribute(sizes, 1),
    );
    this.geometry.setAttribute(
      "aAlpha",
      new THREE.BufferAttribute(alphas, 1),
    );
    this.geometry.setAttribute(
      "aTwinkle",
      new THREE.BufferAttribute(twinkles, 1),
    );

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: {
          value: profile.pixelRatio,
        },
        uEnergy: { value: 0 },
        uColorA: {
          value: new THREE.Color("#68c8ff"),
        },
        uColorB: {
          value: new THREE.Color("#f1fbff"),
        },
      },
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
    });

    this.points = new THREE.Points(
      this.geometry,
      this.material,
    );

    this.points.frustumCulled = false;
  }

  update(
    time: number,
    energy: number,
    dt: number,
    scene: IntroScene,
  ): void {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uEnergy.value = energy;

    const speed =
      scene === "launch"
        ? 2.8
        : scene === "prism"
          ? 1.45
          : 0.62;

    this.points.rotation.y +=
      dt * speed * 0.004;

    this.points.rotation.x =
      Math.sin(time * 0.025) * 0.06;

    this.points.rotation.z =
      Math.cos(time * 0.019) * 0.035;
  }

  setPixelRatio(value: number): void {
    this.material.uniforms.uPixelRatio.value =
      value;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/* =========================================================
   MICRO DUST
   ========================================================= */

export class DustSystem {
  readonly points: THREE.Points;

  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;

  constructor(
    profile: IntroQualityProfile,
    random: SeededRandom,
  ) {
    const count = profile.dustCount;

    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const phases = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const sphere = randomSphere(random);
      const radius = random.range(8, 150);
      const i3 = i * 3;

      positions[i3] = sphere.x * radius;
      positions[i3 + 1] = sphere.y * radius;
      positions[i3 + 2] = sphere.z * radius;

      scales[i] = random.range(0.4, 1.9);
      phases[i] = random.range(0, Math.PI * 2);
    }

    this.geometry = new THREE.BufferGeometry();

    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );
    this.geometry.setAttribute(
      "aScale",
      new THREE.BufferAttribute(scales, 1),
    );
    this.geometry.setAttribute(
      "aPhase",
      new THREE.BufferAttribute(phases, 1),
    );

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0 },
      },
      vertexShader: DUST_VERTEX,
      fragmentShader: DUST_FRAGMENT,
    });

    this.points = new THREE.Points(
      this.geometry,
      this.material,
    );

    this.points.frustumCulled = false;
  }

  update(
    time: number,
    energy: number,
  ): void {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uEnergy.value = energy;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/* =========================================================
   SPATIAL FIELD
   ========================================================= */

export class SpatialGridSystem {
  readonly group = new THREE.Group();

  private readonly material: THREE.LineBasicMaterial;

  constructor() {
    const positions: number[] = [];
    const half = 42;
    const spacing = 2.2;
    const count = Math.floor(half / spacing);

    for (let i = -count; i <= count; i++) {
      const p = i * spacing;

      positions.push(
        -half, -10, p,
        half, -10, p,
        p, -10, -half,
        p, -10, half,
      );
    }

    const geometry =
      new THREE.BufferGeometry();

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        positions,
        3,
      ),
    );

    this.material =
      new THREE.LineBasicMaterial({
        color: new THREE.Color("#2478c8"),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
      });

    this.group.add(
      new THREE.LineSegments(
        geometry,
        this.material,
      ),
    );
  }

  update(
    time: number,
    energy: number,
    scene: IntroScene,
  ): void {
    const visible =
      scene === "boot"
        ? 0
        : scene === "launch"
          ? 0.05
          : 0.14;

    this.material.opacity = damp(
      this.material.opacity,
      visible * energy,
      7,
      1 / 60,
    );

    this.group.position.y =
      Math.sin(time * 0.1) * 0.08;

    this.group.rotation.z =
      Math.sin(time * 0.035) * 0.018;
  }

  dispose(): void {
    disposeObject(this.group);
  }
}

/* =========================================================
   ENERGY RIBBONS
   ========================================================= */

export class EnergyRibbonSystem {
  readonly group = new THREE.Group();

  private readonly ribbons: Array<{
    line: THREE.Line;
    positions: Float32Array;
    material: THREE.LineBasicMaterial;
    phase: number;
    radius: number;
    tilt: number;
  }> = [];

  constructor(
    count: number,
    random: SeededRandom,
  ) {
    for (let i = 0; i < count; i++) {
      const pointCount = 44;
      const positions =
        new Float32Array(
          pointCount * 3,
        );

      const material =
        new THREE.LineBasicMaterial({
          color:
            i % 3 === 0
              ? "#c2efff"
              : i % 3 === 1
                ? "#5ebcff"
                : "#3e82ed",
          transparent: true,
          opacity: 0,
          blending:
            THREE.AdditiveBlending,
        });

      const geometry =
        new THREE.BufferGeometry();

      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(
          positions,
          3,
        ),
      );

      const line =
        new THREE.Line(
          geometry,
          material,
        );

      this.group.add(line);

      this.ribbons.push({
        line,
        positions,
        material,
        phase:
          random.range(
            0,
            Math.PI * 2,
          ),
        radius:
          random.range(
            3.2,
            9.2,
          ),
        tilt:
          random.signed(
            0.7,
          ),
      });
    }
  }

  update(
    time: number,
    energy: number,
    scene: IntroScene,
  ): void {
    const visibility =
      scene === "field"
        ? 0.34
        : scene === "crystallize"
          ? 0.54
          : scene === "labs"
            ? 0.42
            : scene === "prism"
              ? 0.2
              : 0;

    for (
      let rIndex = 0;
      rIndex < this.ribbons.length;
      rIndex++
    ) {
      const ribbon =
        this.ribbons[rIndex];

      const pointCount =
        ribbon.positions.length /
        3;

      for (
        let i = 0;
        i < pointCount;
        i++
      ) {
        const u =
          i /
          Math.max(
            1,
            pointCount - 1,
          );

        const angle =
          u *
            Math.PI *
            4.6 +
          ribbon.phase +
          time *
            (0.5 +
              rIndex *
                0.011);

        const radius =
          ribbon.radius *
            (
              1 -
              u *
                0.46
            ) +
          Math.sin(
            u * 18 +
              time * 1.2 +
              ribbon.phase,
          ) *
            0.16;

        const i3 =
          i * 3;

        ribbon.positions[i3] =
          Math.cos(
            angle,
          ) *
          radius;

        ribbon.positions[i3 + 1] =
          (
            u -
            0.5
          ) *
          18 *
          ribbon.tilt;

        ribbon.positions[i3 + 2] =
          Math.sin(
            angle,
          ) *
          radius;
      }

      const attr =
        ribbon.line.geometry.getAttribute(
          "position",
        ) as THREE.BufferAttribute;

      attr.needsUpdate = true;

      ribbon.material.opacity =
        visibility *
        energy *
        (
          0.38 +
          0.62 *
            (
              0.5 +
              0.5 *
                Math.sin(
                  time *
                    (
                      0.55 +
                      rIndex *
                        0.016
                    ) +
                    ribbon.phase,
                )
            )
        );

      ribbon.line.rotation.y =
        time *
        0.045 *
        (rIndex % 2 === 0 ? 1 : -1);
    }
  }

  dispose(): void {
    for (const ribbon of this.ribbons) {
      ribbon.line.geometry.dispose();
      ribbon.material.dispose();
    }

    this.group.clear();
  }
}

/* =========================================================
   CRYSTAL
   ========================================================= */

export class CrystalSystem {
  readonly group =
    new THREE.Group();

  private readonly shellMaterial:
    THREE.ShaderMaterial;

  private readonly coreMaterial:
    THREE.ShaderMaterial;

  private readonly shell:
    THREE.Mesh;

  private readonly inner:
    THREE.Mesh;

  private readonly wire:
    THREE.LineSegments;

  private readonly core:
    THREE.Mesh;

  private readonly rings:
    THREE.Mesh[] = [];

  private readonly shards:
    Array<{
      mesh: THREE.Mesh;
      phase: number;
      radius: number;
      axis: THREE.Vector3;
    }> = [];

  constructor(
    random: SeededRandom,
  ) {
    this.shellMaterial =
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uPulse: { value: 0 },
          uWarp: { value: 0 },
          uEnergy: { value: 0 },
          uColorA: {
            value:
              new THREE.Color("#2675d0"),
          },
          uColorB: {
            value:
              new THREE.Color("#c9f1ff"),
          },
        },
        vertexShader:
          CRYSTAL_VERTEX,
        fragmentShader:
          CRYSTAL_FRAGMENT,
      });

    this.shell =
      new THREE.Mesh(
        new THREE.IcosahedronGeometry(
          2.6,
          3,
        ),
        this.shellMaterial,
      );

    this.group.add(
      this.shell,
    );

    this.inner =
      new THREE.Mesh(
        new THREE.IcosahedronGeometry(
          2.18,
          2,
        ),
        new THREE.MeshBasicMaterial({
          color: "#1f5a99",
          transparent: true,
          opacity: 0.11,
          wireframe: true,
          blending:
            THREE.AdditiveBlending,
        }),
      );

    this.group.add(
      this.inner,
    );

    this.wire =
      new THREE.LineSegments(
        new THREE.EdgesGeometry(
          new THREE.IcosahedronGeometry(
            3.05,
            1,
          ),
        ),
        new THREE.LineBasicMaterial({
          color: "#8ad9ff",
          transparent: true,
          opacity: 0.2,
          blending:
            THREE.AdditiveBlending,
        }),
      );

    this.group.add(
      this.wire,
    );

    this.coreMaterial =
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending:
          THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uEnergy: { value: 0 },
        },
        vertexShader: [
          "varying vec2 vUv;",
          "void main() {",
          "  vUv = uv;",
          "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
          "}",
        ].join("\n"),
        fragmentShader:
          CORE_FRAGMENT,
      });

    this.core =
      new THREE.Mesh(
        new THREE.PlaneGeometry(
          2.8,
          2.8,
        ),
        this.coreMaterial,
      );

    this.core.position.z =
      0.15;

    this.group.add(
      this.core,
    );

    for (
      let i = 0;
      i < 5;
      i++
    ) {
      const ring =
        new THREE.Mesh(
          new THREE.TorusGeometry(
            3.2 +
              i *
                0.58,
            0.012 +
              i *
                0.003,
            8,
            96,
          ),
          new THREE.MeshBasicMaterial({
            color:
              i % 2 === 0
                ? "#73d3ff"
                : "#438dff",
            transparent: true,
            opacity: 0,
            blending:
              THREE.AdditiveBlending,
          }),
        );

      ring.rotation.x =
        Math.PI * 0.5 +
        i * 0.2;

      ring.rotation.z =
        i * 0.9;

      this.group.add(
        ring,
      );

      this.rings.push(
        ring,
      );
    }

    for (
      let i = 0;
      i < 34;
      i++
    ) {
      const mesh =
        new THREE.Mesh(
          new THREE.OctahedronGeometry(
            random.range(
              0.05,
              0.16,
            ),
            0,
          ),
          new THREE.MeshBasicMaterial({
            color:
              i % 4 === 0
                ? "#d5f5ff"
                : "#438df5",
            transparent: true,
            opacity: 0,
            blending:
              THREE.AdditiveBlending,
          }),
        );

      const radius =
        random.range(
          4.2,
          8.4,
        );

      const angle =
        random.range(
          0,
          Math.PI * 2,
        );

      mesh.position.set(
        Math.cos(angle) *
          radius,
        random.signed(2.7),
        Math.sin(angle) *
          radius,
      );

      this.group.add(
        mesh,
      );

      this.shards.push({
        mesh,
        radius,
        phase:
          random.range(
            0,
            Math.PI * 2,
          ),
        axis:
          new THREE.Vector3(
            random.signed(),
            random.signed(),
            random.signed(),
          ).normalize(),
      });
    }
  }

  update(
    time: number,
    energy: number,
    scene: IntroScene,
    launchProgress: number,
  ): void {
    const formation =
      easeOutExpo(
        scene === "boot"
          ? 0
          : Math.min(
              1,
              (time - 1.9) /
                2.2,
            ),
      );

    const visibility =
      scene === "boot"
        ? 0
        : scene === "field"
          ? 0.24
          : scene === "crystallize"
            ? 1
            : scene === "labs"
              ? 0.92
              : scene === "prism"
                ? 0.83
                : scene === "definition"
                  ? 0.54
                  : scene === "team"
                    ? 0.28
                    : 0.12;

    const p =
      0.5 +
      0.5 *
        Math.sin(
          time *
            (
              scene === "launch"
                ? 2.4
                : 0.72
            ) *
            Math.PI,
        );

    this.shellMaterial.uniforms.uTime.value =
      time;

    this.shellMaterial.uniforms.uPulse.value =
      p *
      visibility;

    this.shellMaterial.uniforms.uWarp.value =
      energy *
      (
        0.08 +
        visibility *
          0.5
      );

    this.shellMaterial.uniforms.uEnergy.value =
      energy;

    this.coreMaterial.uniforms.uTime.value =
      time;

    this.coreMaterial.uniforms.uEnergy.value =
      energy *
      visibility;

    const launchScale =
      1 +
      launchProgress *
        5.8;

    this.group.scale.setScalar(
      (
        0.15 +
        formation *
          0.85
      ) *
      launchScale,
    );

    this.group.position.y =
      Math.sin(
        time * 0.55,
      ) *
      0.32;

    this.group.rotation.x =
      -0.25 +
      Math.sin(
        time * 0.24,
      ) *
      0.08;

    this.group.rotation.y =
      time * 0.31;

    this.group.rotation.z =
      Math.sin(
        time * 0.18,
      ) *
      0.11;

    this.inner.rotation.y =
      -time * 0.42;

    this.wire.rotation.y =
      time * 0.18;

    this.wire.rotation.x =
      -time * 0.08;

    this.core.scale.setScalar(
      0.74 +
        p *
          0.18 +
        energy *
          0.25,
    );

    for (
      let i = 0;
      i < this.rings.length;
      i++
    ) {
      const ring =
        this.rings[i];

      const shimmer =
        0.5 +
        0.5 *
          Math.sin(
            time *
              (
                0.38 +
                i *
                  0.12
              ) +
              i,
          );

      setOpacity(
        ring.material,
        visibility *
          (
            0.05 +
            shimmer *
              0.13
          ),
      );

      ring.rotation.y +=
        0.001 +
        i * 0.00025;
    }

    for (
      let i = 0;
      i < this.shards.length;
      i++
    ) {
      const shard =
        this.shards[i];

      const angle =
        time *
          (
            0.18 +
            i *
              0.003
          ) +
        shard.phase;

      const radius =
        shard.radius +
        energy *
          3.2;

      shard.mesh.position.set(
        Math.cos(angle) *
          radius,
        Math.sin(
          time *
            0.46 +
            shard.phase,
        ) *
          (
            1.6 +
            energy *
              2.3
          ),
        Math.sin(angle) *
          radius,
      );

      shard.mesh.rotateOnAxis(
        shard.axis,
        0.01,
      );

      setOpacity(
        shard.mesh.material,
        visibility *
          (
            0.12 +
            0.25 *
              (
                0.5 +
                0.5 *
                  Math.sin(
                    time *
                      0.3 +
                      shard.phase,
                  )
              )
          ),
      );
    }
  }

  dispose(): void {
    disposeObject(
      this.group,
    );
  }
}

/* =========================================================
   BURST
   ========================================================= */

interface BurstParticle {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  age: number;
  readonly life: number;
}

export class BurstSystem {
  readonly points: THREE.Points;

  private readonly geometry:
    THREE.BufferGeometry;

  private readonly material:
    THREE.PointsMaterial;

  private readonly positions:
    Float32Array;

  private readonly particles:
    BurstParticle[];

  private readonly random:
    SeededRandom;

  private active = false;
  private age = 0;

  constructor(
    random: SeededRandom,
    count = 520,
  ) {
    this.random = random;

    this.positions =
      new Float32Array(
        count * 3,
      );

    this.particles =
      Array.from(
        { length: count },
        () => ({
          position:
            new THREE.Vector3(),
          velocity:
            new THREE.Vector3(),
          age: 999,
          life:
            random.range(
              0.8,
              2.2,
            ),
        }),
      );

    this.geometry =
      new THREE.BufferGeometry();

    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        this.positions,
        3,
      ),
    );

    this.material =
      new THREE.PointsMaterial({
        color:
          new THREE.Color(
            "#d8f6ff",
          ),
        size: 0.075,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending:
          THREE.AdditiveBlending,
        sizeAttenuation: true,
      });

    this.points =
      new THREE.Points(
        this.geometry,
        this.material,
      );

    this.points.frustumCulled =
      false;
  }

  trigger(): void {
    this.active = true;
    this.age = 0;

    for (
      const particle of this.particles
    ) {
      const dir =
        randomSphere(
          this.random,
        );

      const speed =
        this.random.range(
          6,
          18,
        );

      particle.position.set(
        dir.x * 0.16,
        dir.y * 0.16,
        dir.z * 0.16,
      );

      particle.velocity.set(
        dir.x * speed,
        dir.y * speed,
        dir.z * speed,
      );

      particle.age = 0;
    }
  }

  update(
    dt: number,
    intensity: number,
  ): void {
    if (!this.active) {
      this.material.opacity = 0;
      return;
    }

    this.age += dt;

    let alive = 0;

    for (
      let i = 0;
      i < this.particles.length;
      i++
    ) {
      const particle =
        this.particles[i];

      particle.age +=
        dt;

      const i3 =
        i * 3;

      if (
        particle.age >=
        particle.life
      ) {
        this.positions[i3] =
          9999;
        this.positions[i3 + 1] =
          9999;
        this.positions[i3 + 2] =
          9999;
        continue;
      }

      alive++;

      particle.velocity.multiplyScalar(
        Math.pow(
          0.21,
          dt,
        ),
      );

      particle.velocity.y -=
        dt *
        0.8;

      particle.position.addScaledVector(
        particle.velocity,
        dt,
      );

      this.positions[i3] =
        particle.position.x;

      this.positions[i3 + 1] =
        particle.position.y;

      this.positions[i3 + 2] =
        particle.position.z;
    }

    (
      this.geometry.getAttribute(
        "position",
      ) as THREE.BufferAttribute
    ).needsUpdate = true;

    this.material.opacity =
      intensity *
      Math.max(
        0,
        1 -
          this.age /
            2.15,
      );

    this.material.size =
      0.055 +
      intensity *
        0.09;

    if (alive === 0) {
      this.active = false;
      this.material.opacity = 0;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/* =========================================================
   PORTAL
   ========================================================= */

export class PortalSystem {
  readonly mesh: THREE.Mesh;

  private readonly material:
    THREE.ShaderMaterial;

  constructor() {
    this.material =
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending:
          THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uProgress: { value: 0 },
        },
        vertexShader: [
          "varying vec2 vUv;",
          "void main() {",
          "  vUv = uv;",
          "  gl_Position = vec4(position.xy, 0.998, 1.0);",
          "}",
        ].join("\n"),
        fragmentShader:
          PORTAL_FRAGMENT,
      });

    this.mesh =
      new THREE.Mesh(
        new THREE.PlaneGeometry(
          2,
          2,
        ),
        this.material,
      );

    this.mesh.frustumCulled =
      false;

    this.mesh.renderOrder =
      1000;

    this.mesh.visible =
      false;
  }

  update(
    time: number,
    progress: number,
  ): void {
    this.mesh.visible =
      progress > 0;

    this.material.uniforms.uTime.value =
      time;

    this.material.uniforms.uProgress.value =
      progress;
  }

  dispose(): void {
    disposeObject(
      this.mesh,
    );
  }
}

/* =========================================================
   SIGNAL ORBITS
   ========================================================= */

export class SignalOrbitSystem {
  readonly group =
    new THREE.Group();

  private readonly nodes:
    Array<{
      mesh: THREE.Mesh;
      phase: number;
      radius: number;
      speed: number;
    }> = [];

  constructor(
    profile: IntroQualityProfile,
    random: SeededRandom,
  ) {
    const count =
      Math.min(
        32,
        profile.lineCount +
          4,
      );

    for (
      let i = 0;
      i < count;
      i++
    ) {
      const mesh =
        new THREE.Mesh(
          new THREE.SphereGeometry(
            random.range(
              0.025,
              0.075,
            ),
            6,
            6,
          ),
          new THREE.MeshBasicMaterial({
            color:
              i % 5 === 0
                ? "#e1f8ff"
                : "#60bfff",
            transparent: true,
            opacity: 0,
            blending:
              THREE.AdditiveBlending,
          }),
        );

      this.group.add(
        mesh,
      );

      this.nodes.push({
        mesh,
        phase:
          random.range(
            0,
            Math.PI * 2,
          ),
        radius:
          random.range(
            4,
            12,
          ),
        speed:
          random.range(
            0.08,
            0.24,
          ),
      });
    }
  }

  update(
    time: number,
    energy: number,
    scene: IntroScene,
  ): void {
    const visibility =
      scene === "field"
        ? 0.46
        : scene === "crystallize"
          ? 0.76
          : scene === "labs"
            ? 0.55
            : scene === "prism"
              ? 0.24
              : 0;

    for (
      const node of this.nodes
    ) {
      const angle =
        time *
          node.speed +
        node.phase;

      const radius =
        node.radius +
        Math.sin(
          time * 0.3 +
            node.phase,
        ) *
          0.5;

      node.mesh.position.set(
        Math.cos(
          angle,
        ) *
          radius,
        Math.sin(
          angle *
            1.7,
        ) *
          2.3,
        Math.sin(
          angle,
        ) *
          radius,
      );

      const pulseAmount =
        0.55 +
        0.45 *
          Math.sin(
            time * 2.2 +
              node.phase,
          );

      setOpacity(
        node.mesh.material,
        visibility *
          energy *
          pulseAmount *
          0.45,
      );
    }

    this.group.rotation.y =
      time * 0.035;

    this.group.rotation.x =
      Math.sin(
        time * 0.13,
      ) *
      0.04;
  }

  dispose(): void {
    disposeObject(
      this.group,
    );
  }
}
