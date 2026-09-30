"use client";

import { useEffect, useRef, useState } from "react";
import "./PrismCinematicIntroV2.css";

const TEAM = [
  ["Zyntrix.krnl.sys", "Tanay Bhandari", "LEAD"],
  ["Ash Collector", "Ashwin Nagaranjan Ramnath", "SYSTEMS"],
  ["distortus_rexx", "Debroop Mojumder", "ENGINEERING"],
  ["Unknown", "Maaz Mozzam", "RESEARCH"],
] as const;

const CHAPTERS = ["MATTER", "ENERGY", "INFORMATION", "PRISM"] as const;

export default function PrismCinematicIntroV2({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<"void" | "reveal" | "title" | "team" | "launch">("void");
  const [teamIndex, setTeamIndex] = useState(-1);
  const [chapter, setChapter] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const timers = [
      window.setTimeout(() => setPhase("reveal"), 900),
      window.setTimeout(() => setChapter(1), 2200),
      window.setTimeout(() => setChapter(2), 3500),
      window.setTimeout(() => setChapter(3), 4800),
      window.setTimeout(() => setPhase("title"), 5600),
      window.setTimeout(() => setPhase("team"), 7600),
      ...TEAM.map((_, i) => window.setTimeout(() => setTeamIndex(i), 7800 + i * 1150)),
      window.setTimeout(() => setPhase("launch"), 12300),
      window.setTimeout(onComplete, 13900),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [onComplete]);

  return (
    <main className={`prism-intro-v2 prism-intro-v2--${phase}`} aria-label="PRISM cinematic introduction">
      <div className="prism-intro-v2__film" aria-hidden="true">
        <div className="prism-intro-v2__noise" />
        <div className="prism-intro-v2__starfield" />
        <div className="prism-intro-v2__ray prism-intro-v2__ray--a" />
        <div className="prism-intro-v2__ray prism-intro-v2__ray--b" />
        <div className="prism-intro-v2__ray prism-intro-v2__ray--c" />
        <div className="prism-intro-v2__orb prism-intro-v2__orb--a" />
        <div className="prism-intro-v2__orb prism-intro-v2__orb--b" />
        <div className="prism-intro-v2__prism">
          <span />
        </div>
        <div className="prism-intro-v2__spectrum" />
        <div className="prism-intro-v2__grid" />
      </div>

      <header className="prism-intro-v2__top">
        <span>ZYNASH LABS</span>
        <span>PRISM / 001</span>
      </header>

      <div className="prism-intro-v2__chapter" aria-hidden="true">
        {CHAPTERS.map((item, i) => (
          <span className={i <= chapter ? "is-active" : ""} key={item}>{item}</span>
        ))}
      </div>

      <section className="prism-intro-v2__copy">
        <div className="prism-intro-v2__eyebrow">PROJECTED REALITY / SPATIAL COMPUTING</div>
        <h1>PRISM</h1>
        <p>Projected Reality Interaction &amp; Spatial Manipulation</p>
      </section>

      {phase === "team" || phase === "launch" ? (
        <section className="prism-intro-v2__team" aria-live="polite">
          <div className="prism-intro-v2__team-kicker">THE PEOPLE BEHIND THE EXPERIMENT</div>
          {TEAM.map(([handle, name, role], i) => (
            <div className={`prism-intro-v2__member ${i === teamIndex ? "is-current" : i < teamIndex ? "is-past" : ""}`} key={handle}>
              <span className="prism-intro-v2__member-no">0{i + 1}</span>
              <span className="prism-intro-v2__member-name">{name}</span>
              <span className="prism-intro-v2__member-handle">{handle}</span>
              <span className="prism-intro-v2__member-role">{role}</span>
            </div>
          ))}
        </section>
      ) : null}

      <footer className="prism-intro-v2__bottom">
        <span>SCIENCE / DESIGN / COMPUTATION</span>
        <button type="button" onClick={onComplete}>SKIP INTRO <kbd>ENTER</kbd></button>
      </footer>
    </main>
  );
}
