
"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { PrismOpeningFilm } from "@/lib/prism/intro/opening-film";
import "./PrismCinematicIntro.css";

type Props = {
  onComplete?: () => void;
  showSkip?: boolean;
  duration?: number;
};

const FILM_MS = 14500;

const TEAM = [
  { name: "Tanay Bhandari", handle: "Zyntrix.krnl.sys", role: "Lead" },
  { name: "Ashwin Nagaranjan Ramnath", handle: "Ash Collector", role: "" },
  { name: "Debroop Mojumder", handle: "distortus_rexx", role: "" },
  { name: "Maaz Mozzam", handle: "Unknown", role: "" },
] as const;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export default function PrismCinematicIntro({
  onComplete,
  showSkip = true,
  duration = FILM_MS,
}: Props) {
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const filmRef = useRef<PrismOpeningFilm | null>(null);
  const onCompleteRef = useRef(onComplete);
  const completingRef = useRef(false);
  const [progress, setProgress] = useState(0);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const film = new PrismOpeningFilm(canvas, reducedMotion, duration);
    filmRef.current = film;
    film.start();

    let uiFrame = 0;
    let lastUiAt = 0;

    const finish = () => {
      if (completingRef.current) return;
      completingRef.current = true;
      film.dispose();
      filmRef.current = null;
      setExiting(true);

      window.setTimeout(() => {
        onCompleteRef.current?.();
      }, reducedMotion ? 40 : 560);
    };

    const updateUi = (now: number) => {
      if (!filmRef.current) return;

      const current = filmRef.current.progress;
      root.style.setProperty("--film-progress", String(current));

      if (now - lastUiAt >= 48 || current >= 1) {
        lastUiAt = now;
        setProgress(current);
      }

      if (current >= 1) {
        finish();
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
      if (completingRef.current) return;
      completingRef.current = true;
      filmRef.current?.dispose();
      filmRef.current = null;
      setExiting(true);
      window.setTimeout(() => onCompleteRef.current?.(), 80);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        skip();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSkip]);

  const titleStart = 0.50;
  const titleEnd = 0.69;
  const titleFadeStart = 0.72;
  const titleFadeEnd = 0.83;
  const titleIn = clamp01((progress - titleStart) / (titleEnd - titleStart));
  const titleOut = clamp01((progress - titleFadeStart) / (titleFadeEnd - titleFadeStart));
  const titleOpacity = titleIn * (1 - titleOut);

  const creditsStart = 0.735;
  const creditsEnd = 0.915;
  const creditsIn = clamp01((progress - creditsStart) / (creditsEnd - creditsStart));
  const creditsOut = clamp01((progress - 0.925) / 0.075);
  const creditsOpacity = creditsIn * (1 - creditsOut);

  const vars = {
    "--title-opacity": titleOpacity,
    "--title-y": ((1 - titleIn) * 18 - titleOut * 14) + "px",
    "--credits-opacity": creditsOpacity,
    "--credits-y": ((1 - creditsIn) * 20 - creditsOut * 12) + "px",
  } as CSSProperties;

  return (
    <main
      ref={rootRef}
      className={"prism-cinematic" + (exiting ? " is-exiting" : "")}
      style={vars}
      aria-label="PRISM opening film"
    >
      <canvas ref={canvasRef} className="prism-cinematic__canvas" aria-hidden="true" />

      <div className="prism-cinematic__grain" aria-hidden="true" />
      <div className="prism-cinematic__vignette" aria-hidden="true" />

      <header className="prism-cinematic__header">
        <div className="prism-cinematic__brand" aria-label="ZYNASH LABS">
          <span className="prism-cinematic__mark">Z</span>
          <span>ZYNASH LABS</span>
        </div>

        {showSkip && !exiting ? (
          <button
            type="button"
            className="prism-cinematic__skip"
            onClick={() => {
              filmRef.current?.dispose();
              filmRef.current = null;
              setExiting(true);
              if (!completingRef.current) {
                completingRef.current = true;
                window.setTimeout(() => onCompleteRef.current?.(), 80);
              }
            }}
            aria-label="Skip introduction"
          >
            Skip
          </button>
        ) : null}
      </header>

      <section className="prism-cinematic__title" aria-live="polite">
        <span className="prism-cinematic__eyebrow">ZYNASH LABS</span>
        <h1>PRISM</h1>
        <p>Projected Reality Interaction &amp; Spatial Manipulation</p>
      </section>

      <section
        className="prism-cinematic__credits"
        aria-label="PRISM team"
        aria-live="polite"
      >
        <div className="prism-cinematic__credits-rule" />
        <div className="prism-cinematic__credits-label">A project by</div>

        <div className="prism-cinematic__credits-grid">
          {TEAM.map((person, index) => (
            <div
              className="prism-cinematic__credit"
              key={person.handle}
              style={{ "--credit-index": index } as CSSProperties}
            >
              <span className="prism-cinematic__credit-name">{person.name}</span>
              <span className="prism-cinematic__credit-meta">
                {person.handle}
                {person.role ? \` · \${person.role}\` : ""}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="prism-cinematic__microcopy" aria-hidden="true">
        PRISM / ZYNASH LABS
      </div>
    </main>
  );
}
