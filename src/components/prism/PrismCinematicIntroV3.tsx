"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { IntroMemberIndex, IntroQuality, IntroScene } from "@/lib/prism/intro/types";
import { PrismCinematicEngine } from "@/lib/prism/intro/engine";
import "./PrismCinematicIntroV3.css";

type IntroProps = {
  onComplete?: () => void;
  showSkip?: boolean;
  duration?: number;
  quality?: IntroQuality;
};

type Chapter = {
  id: "physics" | "chemistry" | "mathematics" | "information";
  index: string;
  label: string;
  signal: string;
};

const CHAPTERS: readonly Chapter[] = [
  { id: "physics", index: "01", label: "PHYSICS", signal: "MOTION / FORCE / TIME" },
  { id: "chemistry", index: "02", label: "CHEMISTRY", signal: "MATTER / BOND / STRUCTURE" },
  { id: "mathematics", index: "03", label: "MATHEMATICS", signal: "PATTERN / RATIO / FORM" },
  { id: "information", index: "04", label: "INFORMATION", signal: "SIGNAL / LOGIC / CONTROL" },
];

const TEAM = [
  { no: "01", handle: "Zyntrix.krnl.sys", name: "Tanay Bhandari", role: "LEAD" },
  { no: "02", handle: "Ash Collector", name: "Ashwin Nagaranjan Ramnath", role: "SCIENCE / BUILD" },
  { no: "03", handle: "distortus_rexx", name: "Debroop Mojumder", role: "ENGINEERING / DESIGN" },
  { no: "04", handle: "Unknown", name: "Maaz Mozzam", role: "TEAM" },
] as const;

const SCENE_META: Record<IntroScene, {
  kicker: string;
  title: string;
  accent: string;
  description: string;
  system: string;
  chapter?: Chapter["id"];
}> = {
  boot: {
    kicker: "ZYNASH LABS / SPATIAL RESEARCH UNIT",
    title: "OBSERVE",
    accent: "WHAT MOVES.",
    description: "A realtime visual system built from first principles.",
    system: "SIGNAL ACQUIRED",
  },
  physics: {
    kicker: "01 / PHYSICS",
    title: "MOTION",
    accent: "BECOMES VISIBLE.",
    description: "Force, momentum, gravity, and time translated into motion.",
    system: "MECHANICS / ORBIT / OSCILLATION",
    chapter: "physics",
  },
  chemistry: {
    kicker: "02 / CHEMISTRY",
    title: "MATTER",
    accent: "BECOMES STRUCTURE.",
    description: "Atoms, bonds, fields, and molecular form rendered in motion.",
    system: "ATOM / BOND / LATTICE",
    chapter: "chemistry",
  },
  mathematics: {
    kicker: "03 / MATHEMATICS",
    title: "PATTERN",
    accent: "BECOMES GEOMETRY.",
    description: "Relationships become curves, ratios, paths, and space.",
    system: "FUNCTION / RATIO / GEOMETRY",
    chapter: "mathematics",
  },
  information: {
    kicker: "04 / INFORMATION",
    title: "SIGNAL",
    accent: "BECOMES CONTROL.",
    description: "Data travels from idea to encoded action.",
    system: "SIGNAL / LOGIC / CONTROL",
    chapter: "information",
  },
  synthesis: {
    kicker: "SYNTHESIS / 05",
    title: "MANY DISCIPLINES.",
    accent: "ONE INTERFACE.",
    description: "Physics, chemistry, mathematics, and information converge.",
    system: "SYSTEM COHERENCE",
  },
  labs: {
    kicker: "ZYNASH LABS / EXPERIMENTAL INTERFACE",
    title: "ZYNASH",
    accent: "LABS.",
    description: "A project built to make invisible systems observable.",
    system: "RESEARCH PROGRAM / 001",
  },
  prism: {
    kicker: "PROJECT / 001",
    title: "PRISM",
    accent: "SPATIAL MANIPULATION.",
    description: "Projected Reality Interaction & Spatial Manipulation.",
    system: "SPATIAL INTERFACE / READY",
  },
  team: {
    kicker: "CORE TEAM / PROJECT 001",
    title: "THE PEOPLE",
    accent: "BEHIND THE PROJECTION.",
    description: "Four minds. One experimental system.",
    system: "COLLABORATIVE BUILD",
  },
  launch: {
    kicker: "ZYNASH LABS / PRISM",
    title: "ENTER",
    accent: "PRISM.",
    description: "Projected Reality Interaction & Spatial Manipulation",
    system: "SPATIAL INTERFACE / ONLINE",
  },
  complete: {
    kicker: "PRISM / 001",
    title: "PRISM",
    accent: "ONLINE.",
    description: "Realtime spatial system ready.",
    system: "SESSION READY",
  },
};

function ChapterRail({ scene }: { scene: IntroScene }) {
  const active = SCENE_META[scene].chapter;

  return (
    <nav className="prism-v3__chapters" aria-label="PRISM disciplines">
      <div className="prism-v3__chapters-label">FIELD STUDY</div>
      {CHAPTERS.map((chapter) => {
        const activeIndex = active ? CHAPTERS.findIndex((item) => item.id === active) : -1;
        const chapterIndex = CHAPTERS.findIndex((item) => item.id === chapter.id);
        const reached = activeIndex >= 0 && chapterIndex <= activeIndex;

        return (
          <div
            className={[
              "prism-v3__chapter",
              reached ? "is-reached" : "",
              active === chapter.id ? "is-active" : "",
            ].filter(Boolean).join(" ")}
            key={chapter.id}
          >
            <span className="prism-v3__chapter-rule" />
            <span className="prism-v3__chapter-index">{chapter.index}</span>
            <span className="prism-v3__chapter-name">{chapter.label}</span>
          </div>
        );
      })}
    </nav>
  );
}

function SignalReadout({ scene, progress }: { scene: IntroScene; progress: number }) {
  const meta = SCENE_META[scene];
  const pct = Math.round(progress * 100);

  return (
    <aside className="prism-v3__readout" aria-label="Cinematic telemetry">
      <div className="prism-v3__readout-top">
        <span>RUN / 001</span>
        <span>{String(pct).padStart(3, "0")}%</span>
      </div>
      <div className="prism-v3__readout-line" />
      <div className="prism-v3__readout-row">
        <span>PHASE</span>
        <strong>{scene.toUpperCase()}</strong>
      </div>
      <div className="prism-v3__readout-row">
        <span>SYSTEM</span>
        <strong>{meta.system}</strong>
      </div>
      <div className="prism-v3__readout-row">
        <span>FRAME</span>
        <strong>{String(Math.floor(progress * 576)).padStart(4, "0")}</strong>
      </div>
    </aside>
  );
}

function TeamPanel({ activeMember }: { activeMember: IntroMemberIndex }) {
  const index = Math.max(0, Math.min(3, activeMember));

  return (
    <section className="prism-v3__team" aria-label="PRISM core team" aria-live="polite">
      <div className="prism-v3__team-head">
        <span>CORE TEAM</span>
        <span>PROJECT 001</span>
      </div>
      <div className="prism-v3__team-list">
        {TEAM.map((person, personIndex) => {
          const current = personIndex === index;
          const past = personIndex < index;

          return (
            <div
              className={[
                "prism-v3__member",
                current ? "is-current" : "",
                past ? "is-past" : "",
              ].filter(Boolean).join(" ")}
              key={person.handle}
            >
              <span className="prism-v3__member-no">{person.no}</span>
              <span className="prism-v3__member-main">
                <b>{person.name}</b>
                <small>{person.handle}</small>
              </span>
              <span className="prism-v3__member-role">{person.role}</span>
              <span className="prism-v3__member-signal">
                {current ? "ACTIVE" : past ? "LOGGED" : "QUEUED"}
              </span>
            </div>
          );
        })}
      </div>
      <div className="prism-v3__team-progress">
        {TEAM.map((person, personIndex) => (
          <span className={personIndex <= index ? "is-filled" : ""} key={person.handle} />
        ))}
      </div>
    </section>
  );
}

function FormulaBand({ scene }: { scene: IntroScene }) {
  const content: Record<IntroScene, readonly string[]> = {
    boot: ["MATTER", "ENERGY", "INFORMATION"],
    physics: ["F = ma", "p = mv", "Δt → MEASURED"],
    chemistry: ["H₂O / 104.5°", "CO₂ / LINEAR", "e⁻ / ENERGY LEVELS"],
    mathematics: ["φ = 1.618033…", "y = sin(x)", "Σ aₙeⁱⁿˣ"],
    information: ["01001000", "00110010", "01010010", "00100001"],
    synthesis: ["PHYSICS", "CHEMISTRY", "MATHEMATICS", "INFORMATION"],
    labs: ["MODEL / 001", "REALTIME / 3D", "BUILD / ACTIVE"],
    prism: ["HAND", "POINTER", "SPACE"],
    team: ["SCIENCE", "DESIGN", "COMPUTATION"],
    launch: ["INPUT", "SPATIAL", "INTERFACE"],
    complete: ["ONLINE", "READY", "001"],
  };

  return (
    <div className="prism-v3__formula-band" aria-hidden="true">
      {content[scene].map((item, index) => (
        <span key={item + "-" + index}>{item}</span>
      ))}
    </div>
  );
}

export default function PrismCinematicIntroV3({
  onComplete,
  showSkip = true,
  duration = 19200,
  quality = "auto",
}: IntroProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PrismCinematicEngine | null>(null);
  const completionTimerRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);

  const [scene, setScene] = useState<IntroScene>("boot");
  const [member, setMember] = useState<IntroMemberIndex>(-1);
  const [progress, setProgress] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [pointerActive, setPointerActive] = useState(false);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;

    let lastUiProgress = -1;

    const engine = new PrismCinematicEngine({
      canvas,
      durationMs: duration,
      quality,
      seed: 0x5a17c0de,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      onSceneChange: (nextScene, nextMember) => {
        setScene(nextScene);
        setMember(nextMember);
        root.dataset.scene = nextScene;
        root.dataset.member = String(nextMember);
      },
      onProgress: (nextProgress) => {
        root.style.setProperty("--v3-progress", String(nextProgress));
        setProgress((previous) => {
          if (Math.abs(previous - nextProgress) < 0.012 && nextProgress < 1) return previous;
          return nextProgress;
        });

        const rounded = Math.round(nextProgress * 100);
        if (rounded !== lastUiProgress) {
          lastUiProgress = rounded;
          root.dataset.percent = String(rounded).padStart(3, "0");
        }
      },
      onComplete: () => {
        setExiting(true);
        completionTimerRef.current = window.setTimeout(() => {
          onCompleteRef.current?.();
        }, 720);
      },
    });

    engineRef.current = engine;
    engine.start();

    return () => {
      if (completionTimerRef.current !== null) {
        window.clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
      engine.dispose();
      engineRef.current = null;
    };
  }, [duration, quality]);

  useEffect(() => {
    if (!showSkip) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter") {
        engineRef.current?.skip();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showSkip]);

  useEffect(() => {
    const onVisibility = () => {
      rootRef.current?.classList.toggle(
        "is-backgrounded",
        document.visibilityState === "hidden",
      );
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const meta = SCENE_META[scene];
  const chapterIndex = meta.chapter
    ? CHAPTERS.findIndex((item) => item.id === meta.chapter)
    : -1;

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(1, rect.width) - 0.5;
    const y = (event.clientY - rect.top) / Math.max(1, rect.height) - 0.5;
    const root = rootRef.current;
    if (!root) return;

    root.style.setProperty("--v3-pointer-x", String(x));
    root.style.setProperty("--v3-pointer-y", String(y));
    setPointerActive(true);
  };

  const handlePointerLeave = () => {
    const root = rootRef.current;
    if (!root) return;
    root.style.setProperty("--v3-pointer-x", "0");
    root.style.setProperty("--v3-pointer-y", "0");
    setPointerActive(false);
  };

  const styleVars = {
    "--v3-chapter": chapterIndex >= 0 ? String(chapterIndex) : "0",
  } as CSSProperties;

  return (
    <main
      ref={rootRef}
      className={[
        "prism-v3",
        exiting ? "is-exiting" : "",
        pointerActive ? "is-pointering" : "",
      ].filter(Boolean).join(" ")}
      data-scene={scene}
      data-member={member}
      data-percent="000"
      style={styleVars}
      aria-label="PRISM cinematic introduction"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <canvas ref={canvasRef} className="prism-v3__canvas" aria-hidden="true" />

      <div className="prism-v3__atmosphere" aria-hidden="true">
        <div className="prism-v3__halo prism-v3__halo--a" />
        <div className="prism-v3__halo prism-v3__halo--b" />
        <div className="prism-v3__aperture" />
        <div className="prism-v3__vector prism-v3__vector--x" />
        <div className="prism-v3__vector prism-v3__vector--y" />
        <div className="prism-v3__vector prism-v3__vector--z" />
        <div className="prism-v3__orbital-line prism-v3__orbital-line--a" />
        <div className="prism-v3__orbital-line prism-v3__orbital-line--b" />
      </div>

      <div className="prism-v3__frame" aria-hidden="true">
        <span className="prism-v3__frame-corner prism-v3__frame-corner--tl" />
        <span className="prism-v3__frame-corner prism-v3__frame-corner--tr" />
        <span className="prism-v3__frame-corner prism-v3__frame-corner--bl" />
        <span className="prism-v3__frame-corner prism-v3__frame-corner--br" />
      </div>

      <header className="prism-v3__header">
        <div className="prism-v3__brand">
          <span className="prism-v3__brand-mark">Z</span>
          <span className="prism-v3__brand-text">
            <b>ZYNASH LABS</b>
            <small>PRISM / SPATIAL SCIENCE</small>
          </span>
        </div>

        <div className="prism-v3__header-state">
          <span className="prism-v3__live-dot" />
          <span>REALTIME / 3D</span>
          <i />
          <span>{scene.toUpperCase()}</span>
        </div>

        {showSkip && !exiting ? (
          <button
            type="button"
            className="prism-v3__skip"
            onClick={() => engineRef.current?.skip()}
            aria-label="Skip cinematic introduction"
          >
            <span>SKIP</span>
            <kbd>ESC</kbd>
          </button>
        ) : (
          <span className="prism-v3__skip-spacer" aria-hidden="true" />
        )}
      </header>

      <ChapterRail scene={scene} />

      <div className="prism-v3__center">
        <div className="prism-v3__center-glass" aria-hidden="true" />

        {scene === "team" ? (
          <TeamPanel activeMember={member} />
        ) : (
          <section
            className="prism-v3__hero"
            key={scene + "-" + member}
            aria-live="polite"
          >
            <div className="prism-v3__hero-kicker">
              <span>{meta.kicker}</span>
              <span>{meta.system}</span>
            </div>

            <div className="prism-v3__hero-title">
              <span>{meta.title}</span>
              <em>{meta.accent}</em>
            </div>

            <p>{meta.description}</p>

            {scene === "prism" ? (
              <div className="prism-v3__project-lockup">
                <span>PROJECTED REALITY INTERACTION</span>
                <b>&amp; SPATIAL MANIPULATION</b>
              </div>
            ) : null}

            {scene === "launch" ? (
              <div className="prism-v3__launch-lockup">
                <span>INPUT / HAND + POINTER</span>
                <i />
                <span>ENGINE / THREE.JS</span>
                <i />
                <span>STATE / READY</span>
              </div>
            ) : null}
          </section>
        )}
      </div>

      <SignalReadout scene={scene} progress={progress} />
      <FormulaBand scene={scene} />

      <footer className="prism-v3__footer">
        <div className="prism-v3__footer-id">
          <span>PROJECT 001</span>
          <i />
          <span>ZYNASH LABS</span>
        </div>

        <div className="prism-v3__progress">
          <div className="prism-v3__progress-track">
            <span />
          </div>
          <small>{String(Math.round(progress * 100)).padStart(3, "0")}%</small>
        </div>

        <div className="prism-v3__footer-state">
          <span>{meta.system}</span>
          <b>{scene === "complete" ? "ONLINE" : "RUNNING"}</b>
        </div>
      </footer>

      <div className="prism-v3__microcopy" aria-hidden="true">
        <span>PRISM / 001</span>
        <span>{meta.kicker}</span>
      </div>

      <div className="prism-v3__center-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <div className="prism-v3__exit-flare" aria-hidden="true" />
    </main>
  );
}
