"use client";

/*
 * PRISM · "FIRST LIGHT" — the ZYNASH LABS startup film.
 *
 * React is the projection booth: it mounts the canvas, starts the WebGL
 * film engine (intro3d/film.ts), and renders the DOM-owned typography —
 * science captions, the PRISM lockup, and the team credits — as dreamy
 * blue glass over the picture. All per-frame styling is written straight
 * to CSS variables from the film's render hook; React state only changes
 * when the act actually changes, so the overlay never re-renders per frame.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { CAPTIONS, TEAM, TOTAL, actAt, memberAt, type ActId } from "@/lib/prism/intro3d/timeline";
import { PrismIntroFilm, type FilmQuality } from "@/lib/prism/intro3d/film";
import { detectDevice } from "@/lib/prism/device";
import { prismScore } from "@/lib/prism/audio";
import "./PrismCinematicIntro.css";

const ACT_LABEL: Record<ActId, string> = {
  genesis: "GENESIS",
  labs: "ZYNASH LABS",
  optics: "I · OPTICS",
  chemistry: "II · MATTER",
  mathematics: "III · CHAOS",
  prism: "PRISM",
  team: "CREDITS",
  handoff: "ENTER",
};

type Props = {
  onComplete?: () => void;
  showSkip?: boolean;
};

export default function PrismCinematicIntro({ onComplete, showSkip = true }: Props) {
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const filmRef = useRef<PrismIntroFilm | null>(null);
  const onCompleteRef = useRef(onComplete);
  const finishRef = useRef<(() => void) | null>(null);

  const [act, setAct] = useState<ActId>("genesis");
  const [captionIdx, setCaptionIdx] = useState(-1);
  const [memberIdx, setMemberIdx] = useState(-1);
  const [exiting, setExiting] = useState(false);
  const [poster, setPoster] = useState(false); // no-WebGL fallback
  const [muted, setMuted] = useState(true); // mirrored from the score singleton
  const [armed, setArmed] = useState(false); // true once an AudioContext exists

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // DOM concern, not React state — avoids a cascading render on mount
    root.classList.toggle("is-reduced", reducedMotion);

    let finishing = false;
    let posterTimer: number | undefined;
    let cadence: number | undefined;

    const finish = (delay = 620) => {
      if (finishing) return;
      finishing = true;
      setExiting(true);
      // Score rides into the handoff — its fade is orchestrated by the stage.
      prismScore().finish(1.05);
      window.setTimeout(() => onCompleteRef.current?.(), delay);
    };
    finishRef.current = () => finish(120);

    // ── Procedural score — autoplay-safe: the AudioContext is created on the
    // first gesture; before that the film simply plays silent, never blocked.
    const score = prismScore();
    score.buildScore();
    setMuted(score.isMuted);
    setArmed(score.hasContext);
    const unlock = () => {
      score.unlock();
      setArmed(score.hasContext);
    };
    // Capture phase — arms audio BEFORE any element handler runs, so even the
    // very first click's cue has a live context (bubble listeners fire late).
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);

    // ── No WebGL → CSS poster run (title + credits, no canvas) ──
    let film: PrismIntroFilm | null = null;
    try {
      const device = detectDevice();
      // ?quality= override (same convention as the main engine) wins; a
      // software-rendered GPU drops to `low` so the film stays realtime.
      const forced = new URLSearchParams(window.location.search).get("quality");
      const quality: FilmQuality =
        forced === "ultra" || forced === "high" || forced === "medium" || forced === "low"
          ? forced
          : device.isWeakGpu
            ? "low"
            : device.tier;
      film = new PrismIntroFilm(canvas, { quality, reduced: reducedMotion });
    } catch {
      film = null;
    }

    if (!film) {
      // Poster cadence: hold the lockup, then walk the credits, then leave.
      // (setState deferred into timers — the effect body stays render-clean.)
      window.setTimeout(() => setPoster(true), 0);
      window.setTimeout(() => setMemberIdx(0), 3400);
      cadence = window.setInterval(() => {
        setMemberIdx((m) => {
          if (m >= 0 && m < TEAM.length - 1) return m + 1;
          return m;
        });
      }, 1500);
      posterTimer = window.setTimeout(() => finish(300), 3400 + TEAM.length * 1500 + 900);
      filmRef.current = null;
      return () => {
        window.clearTimeout(posterTimer);
        window.clearInterval(cadence);
      };
    }

    filmRef.current = film;

    // Debug hook (?debug) — exposes the film engine for live inspection
    if (new URLSearchParams(window.location.search).has("debug")) {
      (window as unknown as { __prismFilm?: PrismIntroFilm }).__prismFilm = film;
    }

    // ── Frame hook: CSS vars directly, React state only on real changes ──
    let lastAct: ActId | null = null;
    let lastCaption = -2;
    let lastMember = -2;
    let ended = false;

    film.setBeforeRender((t) => {
      score.update(t);
      root.style.setProperty("--film-progress", String(Math.min(1, t / TOTAL)));
      root.style.setProperty("--film-t", t.toFixed(2));

      const a = actAt(t);
      if (a !== lastAct) {
        lastAct = a;
        setAct(a);
      }

      let ci = -1;
      for (let i = 0; i < CAPTIONS.length; i++) {
        if (t >= CAPTIONS[i].t0 && t < CAPTIONS[i].t1) {
          ci = i;
          break;
        }
      }
      if (ci !== lastCaption) {
        lastCaption = ci;
        setCaptionIdx(ci);
      }

      const mi = reducedMotion ? -1 : memberAt(t);
      if (mi !== lastMember) {
        lastMember = mi;
        setMemberIdx(mi);
      }

      if (!ended && t >= TOTAL - 0.02) {
        ended = true;
        finish(40);
      }
    });

    film.start();

    // resize plumbing
    const onResize = () => filmRef.current?.resize();
    window.addEventListener("resize", onResize);

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finishRef.current?.();
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      film?.dispose();
      filmRef.current = null;
      finishRef.current = null;
    };
  }, []);

  const onSkip = useCallback(() => {
    filmRef.current?.skip();
    finishRef.current?.();
  }, []);

  const toggleSound = useCallback(() => {
    const score = prismScore();
    if (!score.hasContext) {
      // First activation — create the context and let the score in.
      score.setMuted(false);
      score.unlock();
      setMuted(false);
      setArmed(true);
      return;
    }
    const next = !score.isMuted;
    score.setMuted(next);
    setMuted(next);
  }, []);

  const caption = captionIdx >= 0 ? CAPTIONS[captionIdx] : null;
  const member = memberIdx >= 0 ? TEAM[memberIdx] : null;
  const showLockup = act === "prism" && !poster;
  const showCredits = (act === "team" || act === "handoff") && !poster;

  const style = {
    "--intro-act": act,
  } as CSSProperties;

  return (
    <main
      ref={rootRef}
      className={
        "prism-cinematic" +
        (exiting ? " is-exiting" : "") +
        (poster ? " is-poster" : "")
      }
      style={style}
      aria-label="PRISM opening film by ZYNASH LABS"
    >
      {/* WebGL picture (absent in poster mode) */}
      {!poster && <canvas ref={canvasRef} className="prism-cinematic__canvas" aria-hidden="true" />}

      {/* Dreamfield — always-on blue ambience + poster gradient */}
      <div className="prism-cinematic__dream" aria-hidden="true" />
      <div className="prism-cinematic__vignette" aria-hidden="true" />
      <div className="prism-cinematic__grain" aria-hidden="true" />

      {/* Cinema letterbox */}
      <div className="prism-cinematic__bar prism-cinematic__bar--top" aria-hidden="true" />
      <div className="prism-cinematic__bar prism-cinematic__bar--bottom" aria-hidden="true" />

      {/* Chrome */}
      <header className="prism-cinematic__header">
        <div className="prism-cinematic__brand">
          <span className="prism-cinematic__mark" aria-hidden="true">
            <i />
          </span>
          <span className="prism-cinematic__brand-name">ZYNASH LABS</span>
        </div>
        <div className="prism-cinematic__header-actions">
          {showSkip && !exiting ? (
            <button
              type="button"
              className="prism-cinematic__skip"
              onClick={onSkip}
              data-intro-skip="true"
            >
              Skip intro <kbd>ESC</kbd>
            </button>
          ) : null}
        {!exiting ? (
          <button
            type="button"
            className="prism-cinematic__sound"
            onClick={toggleSound}
            aria-label={muted || !armed ? "Turn film sound on" : "Turn film sound off"}
            title={
              muted
                ? "Sound off — click to enable the score"
                : armed
                  ? "Sound on"
                  : "Sound on — arms at your first click anywhere"
            }
            data-armed={armed && !muted ? "on" : "off"}
          >
            <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
              <path
                d="M2 6h2.6L8.4 2.8v10.4L4.6 10H2z"
                fill="currentColor"
              />
              {muted || !armed ? (
                <path d="M11 5.6l3.4 4.8M14.4 5.6L11 10.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
              ) : (
                <path
                  d="M10.8 5.2a4 4 0 010 5.6M12.6 3.4a6.4 6.4 0 010 9.2"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  fill="none"
                />
              )}
            </svg>
            <span>SCORE</span>
          </button>
        ) : null}
        </div>
      </header>

      {/* Act rail — top center, tiny */}
      {!poster && (
        <div className="prism-cinematic__act" aria-hidden="true">
          <span>{ACT_LABEL[act]}</span>
        </div>
      )}

      {/* Science captions */}
      {caption ? (
        <section className="prism-cinematic__caption" key={caption.index} aria-live="polite">
          <div className="prism-cinematic__caption-index">{caption.index}</div>
          <div className="prism-cinematic__caption-copy">
            <span className="prism-cinematic__caption-field">{caption.field}</span>
            <strong>{caption.title}</strong>
            <small>{caption.detail}</small>
          </div>
          <div className="prism-cinematic__caption-formula">{caption.formula}</div>
        </section>
      ) : null}

      {/* PRISM lockup */}
      <section
        className={"prism-cinematic__lockup" + (showLockup ? " is-on" : "")}
        aria-live="polite"
      >
        <span className="prism-cinematic__kicker">ZYNASH LABS PRESENTS</span>
        <h1 className="prism-cinematic__title">
          <span>P</span>
          <span>R</span>
          <span>I</span>
          <span>S</span>
          <span>M</span>
        </h1>
        <p className="prism-cinematic__subtitle">
          Projected Reality Interaction &amp; Spatial Manipulation
        </p>
      </section>

      {/* Team credits */}
      <section
        className={
          "prism-cinematic__credit" +
          (showCredits && member ? " is-on" : "") +
          (member ? "" : " is-empty")
        }
        aria-live="polite"
        aria-label="PRISM team"
      >
        {member ? (
          <>
            <div className="prism-cinematic__credit-meta">
              <span className="prism-cinematic__credit-index">
                {String(memberIdx + 1).padStart(2, "0")}
                <i>/</i>
                {String(TEAM.length).padStart(2, "0")}
              </span>
              <span className="prism-cinematic__credit-over">ZYNASH LABS · CREW</span>
            </div>
            <strong className="prism-cinematic__credit-name" key={member.name}>
              {member.name}
            </strong>
            <span className="prism-cinematic__credit-handle">
              {member.handle}
              {member.role ? <em> · {member.role}</em> : null}
            </span>
          </>
        ) : null}
      </section>

      {/* Poster-mode title (no WebGL only) */}
      {poster && (
        <section className="prism-cinematic__poster-lockup" aria-live="polite">
          <span className="prism-cinematic__kicker">ZYNASH LABS PRESENTS</span>
          <h1 className="prism-cinematic__title">
            <span>P</span>
            <span>R</span>
            <span>I</span>
            <span>S</span>
            <span>M</span>
          </h1>
          <p className="prism-cinematic__subtitle">
            Projected Reality Interaction &amp; Spatial Manipulation
          </p>
        </section>
      )}

      {/* Progress rail */}
      <footer className="prism-cinematic__footer" aria-hidden="true">
        <span className="prism-cinematic__footer-label">FIRST LIGHT · 28.8S · ZYNASH LABS 2026</span>
        <i className="prism-cinematic__progress" />
      </footer>

      {/* School watermark — Narayana Educational Institutions, a presenter's
          bug riding above the footer rail, bottom-right. */}
      <img
        className="prism-cinematic__schoolmark"
        src="/narayana-logo.webp"
        alt="Narayana Educational Institutions"
        draggable={false}
      />
    </main>
  );
}
