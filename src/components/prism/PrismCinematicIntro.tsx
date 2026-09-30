"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { CSSProperties } from "react";
import "./PrismCinematicIntro.css";

type Props = {
  onComplete?: () => void;
  showSkip?: boolean;
  duration?: number;
};

const TEAM = [
  { name: "Tanay Bhandari", handle: "Zyntrix.krnl.sys", role: "LEAD" },
  { name: "Ashwin Nagaranjan Ramnath", handle: "Ash Collector", role: "" },
  { name: "Debroop Mojumder", handle: "distortus_rexx", role: "" },
  { name: "Maaz Mozzam", handle: "Unknown", role: "" },
] as const;

const FILM_MS = 15800;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
};
const easeOut = (value: number) => 1 - Math.pow(1 - clamp01(value), 4);
const easeInOut = (value: number) => {
  const x = clamp01(value);
  return x < 0.5
    ? 8 * x * x * x * x
    : 1 - Math.pow(-2 * x + 2, 4) / 2;
};

class PrismFilm {
  private readonly canvas: HTMLCanvasElement;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.01, 200);
  private readonly subject = new THREE.Group();
  private readonly rays = new THREE.Group();
  private readonly particles = new THREE.Group();
  private readonly accents = new THREE.Group();
  private readonly pointer = new THREE.Vector2();
  private readonly targetPointer = new THREE.Vector2();

  private renderer: THREE.WebGLRenderer | null = null;
  private prism: THREE.Mesh | null = null;
  private edges: THREE.LineSegments | null = null;
  private inputRay: THREE.Line | null = null;
  private spectrum: THREE.Line[] = [];
  private dust: THREE.Points | null = null;
  private ringA: THREE.Mesh | null = null;
  private ringB: THREE.Mesh | null = null;
  private keyLight: THREE.PointLight | null = null;

  private raf = 0;
  private startAt = 0;
  private lastAt = 0;
  private disposed = false;
  private readonly reducedMotion: boolean;
  private readonly duration: number;

  constructor(canvas: HTMLCanvasElement, reducedMotion: boolean, duration: number) {
    this.canvas = canvas;
    this.reducedMotion = reducedMotion;
    this.duration = Math.max(9000, duration);

    this.camera.position.set(0, 0.08, 8.8);
    this.scene.add(this.subject, this.rays, this.particles, this.accents);
    this.setup();
  }

  get progress() {
    return this.startAt
      ? clamp01((performance.now() - this.startAt) / this.duration)
      : 0;
  }

  start() {
    if (this.disposed || this.raf) return;
    this.startAt = performance.now();
    this.lastAt = this.startAt;
    this.raf = requestAnimationFrame(this.tick);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;

    window.removeEventListener("resize", this.resize);
    window.removeEventListener("pointermove", this.onPointer);
    document.removeEventListener("visibilitychange", this.onVisibility);

    this.scene.traverse((object) => {
      const drawable = object as THREE.Mesh & {
        geometry?: THREE.BufferGeometry;
        material?: THREE.Material | THREE.Material[];
      };
      drawable.geometry?.dispose();
      if (Array.isArray(drawable.material)) {
        drawable.material.forEach((material) => material.dispose());
      } else {
        drawable.material?.dispose();
      }
    });

    this.renderer?.dispose();
    this.renderer = null;
  }

  private setup() {
    this.scene.background = new THREE.Color("#010208");
    this.scene.fog = new THREE.FogExp2("#010208", 0.012);

    this.scene.add(new THREE.HemisphereLight("#d8f7ff", "#010611", 1.15));

    this.keyLight = new THREE.PointLight("#8fe3ff", 24, 25, 2);
    this.keyLight.position.set(-2.8, 1.5, 3.4);
    this.scene.add(this.keyLight);

    const rim = new THREE.PointLight("#5577ff", 12, 24, 2);
    rim.position.set(3.7, -2, -2.4);
    this.scene.add(rim);

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false,
        depth: true,
        stencil: false,
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.08;
    } catch {
      this.renderer = null;
    }

    this.buildPrism();
    this.buildLight();
    this.buildDust();
    this.buildRings();
    this.resize();

    window.addEventListener("resize", this.resize, { passive: true });
    window.addEventListener("pointermove", this.onPointer, { passive: true });
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  private buildPrism() {
    const geometry = new THREE.CylinderGeometry(1.52, 1.52, 0.065, 3, 1, false);
    geometry.rotateX(Math.PI / 2);

    const material = new THREE.MeshPhysicalMaterial({
      color: "#e9fbff",
      roughness: 0.06,
      metalness: 0,
      transmission: 0.97,
      thickness: 1.6,
      ior: 1.52,
      transparent: true,
      opacity: 0.75,
      attenuationColor: new THREE.Color("#75cfff"),
      attenuationDistance: 2.5,
      clearcoat: 0.8,
      clearcoatRoughness: 0.075,
      envMapIntensity: 1.8,
    });

    this.prism = new THREE.Mesh(geometry, material);
    this.prism.rotation.set(0.08, 0.02, Math.PI / 6);
    this.subject.add(this.prism);

    const edgeGeometry = new THREE.EdgesGeometry(geometry, 1);
    this.edges = new THREE.LineSegments(
      edgeGeometry,
      new THREE.LineBasicMaterial({
        color: "#e3fbff",
        transparent: true,
        opacity: 0.54,
      }),
    );
    this.edges.rotation.copy(this.prism.rotation);
    this.subject.add(this.edges);
  }

  private buildLight() {
    const inputGeometry = new THREE.BufferGeometry();
    inputGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array([
          -6.4, 0.2, 0,
          -1.3, 0.2, 0,
          -0.15, 0.13, 0,
          0.15, 0.1, 0,
        ]),
        3,
      ),
    );

    this.inputRay = new THREE.Line(
      inputGeometry,
      new THREE.LineBasicMaterial({
        color: "#f8fdff",
        transparent: true,
        opacity: 0,
      }),
    );
    this.rays.add(this.inputRay);

    const palette = ["#8ee7ff", "#9ed0ff", "#b1bbff", "#caabff", "#f4bcff"];
    palette.forEach((color, index) => {
      const spread = (index - 2) * 0.105;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(
          new Float32Array([
            0.08, 0.1 + spread * 0.15, -index * 0.004,
            0.52, 0.065 + spread, -index * 0.008,
            4.9, -0.34 + spread * 4.5, -0.015 * index,
          ]),
          3,
        ),
      );

      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: 0,
        }),
      );
      this.spectrum.push(line);
      this.rays.add(line);
    });
  }

  private buildDust() {
    const count = this.reducedMotion ? 180 : 520;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
      const r = 2.3 + ((i * 0.6180339887) % 1) * 5.4;
      const a = ((i * 0.754877666) % 1) * Math.PI * 2;
      const b = ((i * 0.569840291) % 1) * Math.PI;
      positions[i * 3] = Math.sin(b) * Math.cos(a) * r;
      positions[i * 3 + 1] = Math.cos(b) * r * 0.62;
      positions[i * 3 + 2] = Math.sin(b) * Math.sin(a) * r - 1.2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    this.dust = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: "#a8e5ff",
        size: this.reducedMotion ? 0.017 : 0.022,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        sizeAttenuation: true,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.particles.add(this.dust);
  }

  private buildRings() {
    const material = new THREE.MeshBasicMaterial({
      color: "#8bdfff",
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.ringA = new THREE.Mesh(
      new THREE.RingGeometry(2.65, 2.655, 128),
      material.clone(),
    );
    this.ringA.rotation.x = Math.PI / 2.15;
    this.ringA.rotation.z = -0.35;

    this.ringB = new THREE.Mesh(
      new THREE.RingGeometry(1.78, 1.785, 128),
      material.clone(),
    );
    this.ringB.rotation.x = Math.PI / 2.6;
    this.ringB.rotation.z = 0.42;

    this.accents.add(this.ringA, this.ringB);
  }

  private readonly onPointer = (event: PointerEvent) => {
    this.targetPointer.x = event.clientX / Math.max(1, window.innerWidth) - 0.5;
    this.targetPointer.y = event.clientY / Math.max(1, window.innerHeight) - 0.5;
  };

  private readonly onVisibility = () => {
    this.lastAt = performance.now();
  };

  private readonly resize = () => {
    if (!this.renderer) return;
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(width, height, false);
  };

  private readonly tick = (now: number) => {
    if (this.disposed) return;

    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastAt) / 1000));
    this.lastAt = now;

    const progress = this.progress;
    this.update(progress, dt);

    if (this.renderer) {
      try {
        this.renderer.render(this.scene, this.camera);
      } catch {
        this.renderer = null;
      }
    }

    if (progress < 1 && !this.disposed) {
      this.raf = requestAnimationFrame(this.tick);
    } else {
      this.raf = 0;
    }
  };

  private update(progress: number, dt: number) {
    const reveal = easeOut((progress - 0.06) / 0.22);
    const refract = smooth((progress - 0.19) / 0.22);
    const titleMoment = smooth((progress - 0.48) / 0.14);
    const teamMoment = smooth((progress - 0.65) / 0.17);
    const launchMoment = smooth((progress - 0.83) / 0.15);
    const exit = smooth((progress - 0.94) / 0.06);

    this.pointer.lerp(this.targetPointer, this.reducedMotion ? 0.25 : 0.075);

    const desiredX = this.pointer.x * 0.44;
    const desiredY = 0.15 - this.pointer.y * 0.28;
    this.camera.position.x += (desiredX - this.camera.position.x) * 0.055;
    this.camera.position.y += (desiredY - this.camera.position.y) * 0.055;

    this.subject.position.y = (1 - reveal) * 0.62;
    this.subject.scale.setScalar(0.78 + reveal * 0.22);
    this.subject.rotation.x = 0.06 + refract * 0.12;
    this.subject.rotation.y = 0.05 + reveal * 0.3;
    this.subject.rotation.z = Math.PI / 6 + refract * 0.22;

    if (this.prism) {
      const material = this.prism.material as THREE.MeshPhysicalMaterial;
      material.opacity = 0.08 + reveal * 0.66;
      material.thickness = 1.25 + refract * 0.5;
    }

    if (this.edges) {
      (this.edges.material as THREE.LineBasicMaterial).opacity = 0.05 + reveal * 0.5;
    }

    if (this.inputRay) {
      (this.inputRay.material as THREE.LineBasicMaterial).opacity =
        smooth(progress / 0.12) * (1 - titleMoment * 0.55);
      this.inputRay.position.x = -0.25 * (1 - reveal);
    }

    this.spectrum.forEach((line, index) => {
      const local = smooth((progress - 0.22 - index * 0.014) / 0.18);
      const material = line.material as THREE.LineBasicMaterial;
      material.opacity = local * 0.7 * (1 - launchMoment * 0.74);
      const positions = line.geometry.getAttribute("position") as THREE.BufferAttribute;
      const x = 4.9 + refract * 0.5;
      positions.setX(2, x);
      positions.needsUpdate = true;
    });

    if (this.dust) {
      const material = this.dust.material as THREE.PointsMaterial;
      material.opacity = (0.03 + refract * 0.08 + titleMoment * 0.04) * (1 - exit);
      this.particles.rotation.y += dt * 0.017;
      this.particles.rotation.x += dt * 0.003;
    }

    if (this.ringA && this.ringB) {
      const opacity = refract * (1 - exit) * 0.16;
      (this.ringA.material as THREE.MeshBasicMaterial).opacity = opacity;
      (this.ringB.material as THREE.MeshBasicMaterial).opacity = opacity * 0.65;
      this.ringA.rotation.z += dt * 0.07;
      this.ringB.rotation.z -= dt * 0.052;
    }

    if (this.keyLight) {
      this.keyLight.intensity =
        16 +
        reveal * 20 +
        launchMoment * 8 +
        Math.sin(progress * Math.PI * 9) * 1.2;
      this.keyLight.position.x = -2.3 + this.pointer.x * 1.7;
      this.keyLight.position.y = 1.35 - this.pointer.y * 1.1;
    }

    this.camera.lookAt(0, this.subject.position.y * 0.08, 0);

    const dive = easeInOut(launchMoment);
    this.camera.position.z = 8.8 - dive * 5.2 - exit * 1.4;
    this.camera.fov = 32 + dive * 5.5;
    this.camera.updateProjectionMatrix();

    this.rays.position.z = -dive * 1.4;
    this.rays.scale.setScalar(1 + dive * 0.14);
    this.rootAtmosphere(dive, exit);
  }

  private rootAtmosphere(dive: number, exit: number) {
    this.accents.position.z = dive * 0.25;
    this.accents.scale.setScalar(1 + dive * 0.08);
    this.subject.rotation.y += dive * 0.0002;
    if (exit > 0) {
      this.subject.scale.setScalar(1 + exit * 0.08);
    }
  }
}

export default function PrismCinematicIntro({
  onComplete,
  showSkip = true,
  duration = FILM_MS,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const filmRef = useRef<PrismFilm | null>(null);
  const onCompleteRef = useRef(onComplete);

  const [progress, setProgress] = useState(0);
  const [teamIndex, setTeamIndex] = useState(-1);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const film = new PrismFilm(canvas, reducedMotion, duration);
    filmRef.current = film;
    film.start();

    let uiFrame = 0;

    const updateUi = () => {
      if (!filmRef.current) return;

      const current = filmRef.current.progress;
      root.style.setProperty("--prism-progress", String(current));
      setProgress(current);

      const currentTeam =
        current >= 0.665 && current < 0.89
          ? Math.min(3, Math.floor((current - 0.665) / 0.056))
          : -1;
      setTeamIndex(currentTeam);

      if (current >= 1) {
        setExiting(true);
        onCompleteRef.current?.();
        return;
      }

      uiFrame = requestAnimationFrame(updateUi);
    };

    uiFrame = requestAnimationFrame(updateUi);

    return () => {
      cancelAnimationFrame(uiFrame);
      film.dispose();
      filmRef.current = null;
    };
  }, [duration]);

  useEffect(() => {
    if (!showSkip) return;

    const skip = () => {
      filmRef.current?.dispose();
      filmRef.current = null;
      setExiting(true);
      onCompleteRef.current?.();
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") skip();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSkip]);

  const titleReveal = smooth((progress - 0.45) / 0.12);
  const titleFade = smooth((progress - 0.79) / 0.12);
  const titleOpacity = titleReveal * (1 - titleFade);
  const titleShift = (1 - titleReveal) * 16 - titleFade * 18;

  const teamReveal = smooth((progress - 0.635) / 0.045);
  const teamFade = smooth((progress - 0.84) / 0.07);
  const teamOpacity = teamReveal * (1 - teamFade);
  const teamShift = (1 - teamReveal) * 12 - teamFade * 12;

  const index = Math.max(0, Math.min(3, teamIndex));
  const activePerson = TEAM[index];

  return (
    <main
      ref={rootRef}
      className={"prism-cinematic-v5" + (exiting ? " is-exiting" : "")}
      style={
        {
          "--prism-progress": progress,
          "--prism-title-opacity": titleOpacity,
          "--prism-title-shift": titleShift + "px",
          "--prism-team-opacity": teamOpacity,
          "--prism-team-shift": teamShift + "px",
        } as CSSProperties
      }
      aria-label="PRISM cinematic introduction"
    >
      <canvas
        ref={canvasRef}
        className="prism-cinematic-v5__canvas"
        aria-hidden="true"
      />

      <div className="prism-cinematic-v5__wash" aria-hidden="true" />
      <div className="prism-cinematic-v5__glow" aria-hidden="true" />
      <div className="prism-cinematic-v5__vignette" aria-hidden="true" />

      <header className="prism-cinematic-v5__header">
        <div className="prism-cinematic-v5__brand">
          <span className="prism-cinematic-v5__mark">Z</span>
          <span>ZYNASH LABS</span>
        </div>

        {showSkip && !exiting ? (
          <button
            type="button"
            className="prism-cinematic-v5__skip"
            onClick={() => {
              filmRef.current?.dispose();
              filmRef.current = null;
              setExiting(true);
              onCompleteRef.current?.();
            }}
            aria-label="Skip introduction"
          >
            Skip
          </button>
        ) : null}
      </header>

      <section
        className="prism-cinematic-v5__title"
        style={{ opacity: titleOpacity, transform: "translate(-50%, calc(-50% + " + titleShift + "px))" }}
        aria-live="polite"
      >
        <span className="prism-cinematic-v5__eyebrow">ZYNASH LABS</span>
        <h1>PRISM</h1>
        <p>Projected Reality Interaction &amp; Spatial Manipulation</p>
      </section>

      <section
        className="prism-cinematic-v5__team"
        style={{
          opacity: teamOpacity,
          transform: "translate(-50%, calc(-50% + " + teamShift + "px))",
        }}
        aria-live="polite"
        aria-label="PRISM team"
      >
        <div className="prism-cinematic-v5__team-head">
          <span>BUILT BY</span>
          <span>PROJECT 001</span>
        </div>

        <div className="prism-cinematic-v5__team-focus">
          <span className="prism-cinematic-v5__team-count">
            {String(index + 1).padStart(2, "0")} / 04
          </span>
          <div>
            <b>{activePerson.name}</b>
            <small>{activePerson.handle}</small>
          </div>
          <span className="prism-cinematic-v5__team-role">
            {activePerson.role || "CORE TEAM"}
          </span>
        </div>

        <div className="prism-cinematic-v5__team-line">
          {TEAM.map((person, personIndex) => (
            <span
              key={person.handle}
              className={personIndex === index ? "is-active" : ""}
            />
          ))}
        </div>
      </section>

      <footer className="prism-cinematic-v5__footer">
        <span>PRISM / 001</span>
        <div className="prism-cinematic-v5__progress">
          <i />
        </div>
        <span>{String(Math.round(progress * 100)).padStart(3, "0")}</span>
      </footer>

      <div className="prism-cinematic-v5__flare" aria-hidden="true" />
    </main>
  );
}
