
"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { MEMBER_DUR, MEMBER_T0, TEAM, TEXT_T0, TEXT_T1, TOTAL } from "@/lib/prism/intro/config";
import { PrismParticleFilm } from "@/lib/prism/intro/particle-film";
import "./PrismCinematicIntro.css";

type Props = {
  onComplete?: () => void;
  showSkip?: boolean;
  duration?: number;
};

export default function PrismCinematicIntro({
  onComplete,
  showSkip = true,
  duration = TOTAL * 1000,
}: Props) {
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const filmRef = useRef<PrismParticleFilm | null>(null);
  const onCompleteRef = useRef(onComplete);
  const finishRef = useRef<(() => void) | null>(null);

  const [time, setTime] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [memberIndex, setMemberIndex] = useState(-1);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const film = new PrismParticleFilm(canvas, reducedMotion, duration / 1000);
    filmRef.current = film;

    let uiFrame = 0;
    let lastUi = 0;
    let finishing = false;

    const finish = (delay = reducedMotion ? 40 : 620) => {
      if (finishing) return;
      finishing = true;
      film.dispose();
      filmRef.current = null;
      setExiting(true);
      window.setTimeout(() => onCompleteRef.current?.(), delay);
    };

    finishRef.current = () => finish(80);

    const updateUi = (now: number) => {
      if (!filmRef.current) return;

      const current = filmRef.current.time;
      root.style.setProperty("--film-time", String(current));
      root.style.setProperty("--film-progress", String(Math.min(1, current / (duration / 1000))));

      if (now - lastUi >= 60) {
        lastUi = now;
        setTime(current);

        const visibleMember =
          current >= MEMBER_T0 && current < MEMBER_T0 + MEMBER_DUR * TEAM.length
            ? Math.min(TEAM.length - 1, Math.floor((current - MEMBER_T0) / MEMBER_DUR))
            : -1;
        setMemberIndex(visibleMember);
      }

      if (film.progress >= 1) {
        finish();
        return;
      }

      uiFrame = requestAnimationFrame(updateUi);
    };

    film.start();
    uiFrame = requestAnimationFrame(updateUi);

    return () => {
      cancelAnimationFrame(uiFrame);
      film.dispose();
      filmRef.current = null;
      finishRef.current = null;
    };
  }, [duration]);

  useEffect(() => {
    if (!showSkip) return;

    const skip = () => finishRef.current?.();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        skip();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSkip]);

  const titleIn = Math.min(1, Math.max(0, (time - TEXT_T0) / 0.82));
  const titleOut = Math.min(1, Math.max(0, (time - (TEXT_T1 - 0.52)) / 0.52));
  const titleOpacity = titleIn * (1 - titleOut);

  const creditsIn = Math.min(1, Math.max(0, (time - (MEMBER_T0 - 0.22)) / 0.48));
  const creditsOut = Math.min(1, Math.max(0, (time - 14.20) / 0.60));
  const creditsOpacity = creditsIn * (1 - creditsOut);

  const style = {
    "--title-opacity": titleOpacity,
    "--title-y": String((1 - titleIn) * 20 - titleOut * 16) + "px",
    "--credits-opacity": creditsOpacity,
    "--credits-y": String((1 - creditsIn) * 18 - creditsOut * 12) + "px",
  } as CSSProperties;

  const active = memberIndex >= 0 ? TEAM[memberIndex] : null;
  const progress = Math.min(1, Math.max(0, time / (duration / 1000)));

  return (
    <main
      ref={rootRef}
      className={"prism-cinematic" + (exiting ? " is-exiting" : "")}
      style={style}
      aria-label="PRISM opening film"
    >
      <canvas ref={canvasRef} className="prism-cinematic__canvas" aria-hidden="true" />
      <div className="prism-cinematic__vignette" aria-hidden="true" />
      <div className="prism-cinematic__grain" aria-hidden="true" />

      <header className="prism-cinematic__header">
        <div className="prism-cinematic__brand">
          <span className="prism-cinematic__mark">Z</span>
          <span>ZYNASH LABS</span>
        </div>

        {showSkip && !exiting ? (
          <button
            type="button"
            className="prism-cinematic__skip"
            onClick={() => finishRef.current?.()}
          >
            Skip
          </button>
        ) : null}
      </header>

      <section className="prism-cinematic__title" aria-live="polite">
        <span className="prism-cinematic__title-kicker">ZYNASH LABS</span>
        <h1>PRISM</h1>
        <p>Projected Reality Interaction &amp; Spatial Manipulation</p>
      </section>

      <section
        className="prism-cinematic__credit"
        style={
          active
            ? {
                opacity: "var(--credits-opacity)",
                transform: "translate3d(0,var(--credits-y),0)",
              }
            : { opacity: 0, transform: "translate3d(0,18px,0)" }
        }
        aria-label="PRISM team"
      >
        <div className="prism-cinematic__credit-index">
          {active ? String(memberIndex + 1).padStart(2, "0") : "00"} / {String(TEAM.length).padStart(2, "0")}
        </div>
        <div className="prism-cinematic__credit-copy">
          <span className="prism-cinematic__credit-overline">A project by</span>
          <strong>{active?.name ?? ""}</strong>
          <span>
            {active?.handle ?? ""}
            {active?.role ? \` · \${active.role}\` : ""}
          </span>
        </div>
      </section>

      <div className="prism-cinematic__footer" aria-hidden="true">
        <span>PRISM / ZYNASH LABS</span>
        <i style={{ transform: \`scaleX(\${progress})\` }} />
      </div>
    </main>
  );
}
