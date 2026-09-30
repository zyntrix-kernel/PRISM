"use client";

import { useEffect, useRef, useState } from "react";
import type { IntroMemberIndex, IntroQuality, IntroScene } from "@/lib/prism/intro/types";
import { PrismCinematicEngine } from "@/lib/prism/intro/engine";
import "./PrismCinematicIntro.css";

type IntroProps = {
  onComplete?: () => void;
  showSkip?: boolean;
  duration?: number;
  quality?: IntroQuality;
};

const TEAM = [
  {
    handle: "Zyntrix.krnl.sys",
    name: "Tanay Bhandari",
    role: "LEAD",
  },
  {
    handle: "Ash Collector",
    name: "Ashwin Nagaranjan Ramnath",
    role: "SCIENCE / BUILD",
  },
  {
    handle: "distortus_rexx",
    name: "Debroop Mojumder",
    role: "ENGINEERING / DESIGN",
  },
  {
    handle: "Unknown",
    name: "Maaz Mozzam",
    role: "TEAM",
  },
] as const;

const SCENE_CLASS: Record<IntroScene, string> = {
  boot: "scene-boot",
  physics: "scene-physics",
  chemistry: "scene-chemistry",
  mathematics: "scene-mathematics",
  synthesis: "scene-synthesis",
  labs: "scene-labs",
  prism: "scene-prism",
  team: "scene-team",
  launch: "scene-launch",
  complete: "scene-complete",
};

function SceneCopy({
  scene,
  member,
}: {
  scene: IntroScene;
  member: IntroMemberIndex;
}) {
  if (scene === "boot") {
    return (
      <section className="intro-scene-copy copy-boot" data-scene-copy="boot">
        <div className="boot-micro">ZYNASH LABS / SPATIAL RESEARCH UNIT</div>
        <div className="boot-core-word">OBSERVE</div>
        <div className="boot-under">
          <span>MATTER</span>
          <i />
          <span>ENERGY</span>
          <i />
          <span>INFORMATION</span>
        </div>
      </section>
    );
  }

  if (scene === "physics") {
    return (
      <section className="intro-scene-copy copy-discipline copy-physics" data-scene-copy="physics">
        <div className="discipline-index">01 / PHYSICS</div>
        <div className="discipline-title">MOTION<br />BECOMES<br />VISIBLE.</div>
        <div className="science-equations">
          <span>F = ma</span>
          <span>v² = u² + 2as</span>
          <span>g ≈ 9.81 m/s²</span>
        </div>
        <p>Trajectories. Orbits. Oscillations. A world governed by measurable change.</p>
      </section>
    );
  }

  if (scene === "chemistry") {
    return (
      <section className="intro-scene-copy copy-discipline copy-chemistry" data-scene-copy="chemistry">
        <div className="discipline-index">02 / CHEMISTRY</div>
        <div className="discipline-title">MATTER<br />FINDS<br />BOND.</div>
        <div className="chemistry-metrics">
          <span><b>H₂O</b><small>molecular geometry</small></span>
          <span><b>CO₂</b><small>linear structure</small></span>
          <span><b>e⁻</b><small>quantized shell</small></span>
        </div>
      </section>
    );
  }

  if (scene === "mathematics") {
    return (
      <section className="intro-scene-copy copy-discipline copy-mathematics" data-scene-copy="mathematics">
        <div className="discipline-index">03 / MATHEMATICS</div>
        <div className="discipline-title">PATTERN<br />BECOMES<br />FORM.</div>
        <div className="math-formula">
          <span>φ = 1.618033988…</span>
          <span>y = sin x</span>
          <span>Σ → ∞</span>
        </div>
        <p>Functions become curves. Ratios become geometry. Numbers become space.</p>
      </section>
    );
  }

  if (scene === "synthesis") {
    return (
      <section className="intro-scene-copy copy-synthesis" data-scene-copy="synthesis">
        <div className="synthesis-kicker">THE THREE LANGUAGES OF REALITY</div>
        <div className="synthesis-word">PHYSICS <i>×</i> CHEMISTRY <i>×</i> MATHEMATICS</div>
        <div className="synthesis-line" />
        <p>One visual language.</p>
      </section>
    );
  }

  if (scene === "labs") {
    return (
      <section className="intro-scene-copy copy-labs" data-scene-copy="labs">
        <div className="labs-mini">A ZYNASH LABS INSTRUMENT</div>
        <div className="labs-word">ZYNASH<br /><span>LABS</span></div>
        <p>Engineering the invisible into something you can see.</p>
      </section>
    );
  }

  if (scene === "prism") {
    return (
      <section className="intro-scene-copy copy-prism" data-scene-copy="prism">
        <div className="prism-kicker">PROJECT / 001</div>
        <div className="prism-word">PRISM</div>
        <div className="prism-expansion">PROJECTED REALITY INTERACTION<br />&amp; SPATIAL MANIPULATION</div>
        <div className="prism-rule" />
        <div className="prism-note">From equations to interaction.</div>
      </section>
    );
  }

  if (scene === "team") {
    const safeMember = member >= 0 ? member : 0;
    const person = TEAM[safeMember];

    return (
      <section className="intro-scene-copy copy-team" data-scene-copy="team">
        <div className="team-kicker">THE TEAM / PRISM</div>
        <div className="team-index">{String(safeMember + 1).padStart(2, "0")} / 04</div>
        <div className="team-handle">{person.handle}</div>
        <div className="team-name">{person.name}</div>
        <div className="team-role">{person.role}</div>
        <div className="team-track" aria-hidden="true">
          {TEAM.map((_, index) => (
            <span key={index} className={index === safeMember ? "active" : ""} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="intro-scene-copy copy-launch" data-scene-copy={scene}>
      <div className="launch-kicker">ZYNASH LABS PRESENTS</div>
      <div className="launch-prism">PRISM</div>
      <div className="launch-title">Projected Reality Interaction<br />&amp; Spatial Manipulation</div>
      <div className="launch-enter">ENTER SPATIAL INTERFACE</div>
    </section>
  );
}

export default function PrismCinematicIntro({
  onComplete,
  showSkip = false,
  duration = 16000,
  quality = "auto",
}: IntroProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<PrismCinematicEngine | null>(null);
  const completionTimerRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);

  const [scene, setScene] = useState<IntroScene>("boot");
  const [member, setMember] = useState<IntroMemberIndex>(-1);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;

    let lastProgressInteger = -1;

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
      onProgress: (progress, label) => {
        root.style.setProperty("--intro-progress", String(progress));
        root.dataset.phase = label;

        const integer = Math.round(progress * 100);
        if (progressRef.current && integer !== lastProgressInteger) {
          lastProgressInteger = integer;
          progressRef.current.textContent = String(integer).padStart(3, "0") + "%";
        }
      },
      onComplete: () => {
        setExiting(true);
        completionTimerRef.current = window.setTimeout(() => {
          onCompleteRef.current?.();
        }, 760);
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

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") engineRef.current?.skip();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSkip]);

  return (
    <div
      ref={rootRef}
      className={
        "prism-cinematic " +
        SCENE_CLASS[scene] +
        (exiting ? " is-exiting" : "")
      }
      data-scene={scene}
      data-member={member}
      data-phase="CALIBRATING THE OBSERVABLE"
    >
      <canvas ref={canvasRef} className="prism-canvas" aria-hidden="true" />

      <div className="intro-aurora aurora-a" aria-hidden="true" />
      <div className="intro-aurora aurora-b" aria-hidden="true" />
      <div className="intro-vignette" aria-hidden="true" />
      <div className="intro-grain" aria-hidden="true" />
      <div className="intro-scan" aria-hidden="true" />

      <header className="intro-topbar">
        <div className="intro-brand">
          <span className="intro-logo">Z</span>
          <span>
            <b>ZYNASH LABS</b>
            <small>PRISM / SPATIAL SCIENCE</small>
          </span>
        </div>

        <div className="intro-system-readout">
          <span className="readout-pulse" />
          <span>REALTIME / 3D</span>
          <span className="readout-divider" />
          <span>{scene.toUpperCase()}</span>
        </div>

        {showSkip && !exiting && (
          <button
            type="button"
            className="intro-skip"
            onClick={() => engineRef.current?.skip()}
            aria-label="Skip PRISM introduction"
          >
            <span>SKIP</span>
            <kbd>ESC</kbd>
          </button>
        )}
      </header>

      <aside className="intro-left-rail" aria-hidden="true">
        <span>F = ma</span>
        <span>H₂O</span>
        <span>φ</span>
        <span>∑</span>
        <span>001</span>
      </aside>

      <aside className="intro-right-rail" aria-hidden="true">
        <span>36.74° N</span>
        <span>SCIENCE</span>
        <span>∞</span>
        <span>2026</span>
      </aside>

      <main className="intro-content">
        <SceneCopy scene={scene} member={member} />
      </main>

      <footer className="intro-bottombar">
        <div className="bottom-meta">
          <span>ZYNASH LABS</span>
          <i />
          <span>PRISM / 001</span>
        </div>

        <div className="progress-shell" aria-hidden="true">
          <div className="progress-fill" />
          <div className="progress-glint" />
        </div>

        <div className="bottom-progress" ref={progressRef}>
          000%
        </div>
      </footer>

      <div className="intro-corner corner-tl" aria-hidden="true" />
      <div className="intro-corner corner-tr" aria-hidden="true" />
      <div className="intro-corner corner-bl" aria-hidden="true" />
      <div className="intro-corner corner-br" aria-hidden="true" />

      <div className="launch-flash" aria-hidden="true" />
    </div>
  );
}
