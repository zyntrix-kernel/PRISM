"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  PrismCinematicEngine,
} from "@/lib/prism/intro/engine";
import type {
  IntroMemberIndex,
  IntroQuality,
  IntroScene,
} from "@/lib/prism/intro/types";
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
    role: "",
  },
  {
    handle: "distortus_rexx",
    name: "Debroop",
    role: "",
  },
] as const;

const SCENE_CLASS: Record<
  IntroScene,
  string
> = {
  boot: "scene-boot",
  field: "scene-field",
  crystallize: "scene-crystallize",
  labs: "scene-labs",
  prism: "scene-prism",
  definition: "scene-definition",
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
      <div
        className="copy copy-awakening"
        data-scene-copy="boot"
      >
        <span className="micro">
          INITIALIZING SPATIAL ENVIRONMENT
        </span>

        <span className="line" />

        <span className="micro faded">
          ZYNASH LABS
        </span>
      </div>
    );
  }

  if (scene === "field") {
    return (
      <div
        className="copy copy-ignition"
        data-scene-copy="field"
      >
        <span className="micro">
          REALITY / INTERFACE
        </span>

        <h1 className="ghost-word">
          PERCEIVE
        </h1>

        <span className="micro field-caption">
          A SPATIAL SYSTEM IS
          FORMING
        </span>
      </div>
    );
  }

  if (scene === "crystallize") {
    return (
      <div
        className="copy copy-crystallize"
        data-scene-copy="crystallize"
      >
        <div className="crystal-caption">
          OPTICAL CORE
        </div>

        <div className="crystal-caption-large">
          STRUCTURING
        </div>

        <div className="crystal-caption">
          MATTER · LIGHT · SPACE
        </div>
      </div>
    );
  }

  if (scene === "labs") {
    return (
      <div
        className="copy copy-labs"
        data-scene-copy="labs"
      >
        <div className="labs-small">
          ZYNASH
        </div>

        <h1>
          LABS<sup>®</sup>
        </h1>

        <div className="labs-rule" />

        <p>
          ENGINEERING THE UNSEEN
        </p>
      </div>
    );
  }

  if (scene === "prism") {
    return (
      <div
        className="copy copy-prism"
        data-scene-copy="prism"
      >
        <div className="project-overline">
          PROJECT ZYNASH · 001
        </div>

        <div className="prism-word">
          PRISM
        </div>

        <div className="prism-subline">
          PROJECTED REALITY
        </div>

        <div className="prism-subline">
          INTERACTION & SPATIAL
          MANIPULATION
        </div>
      </div>
    );
  }

  if (scene === "definition") {
    return (
      <div
        className="copy copy-title"
        data-scene-copy="definition"
      >
        <div className="title-kicker">
          ZYNASH LABS PRESENTS
        </div>

        <h2>
          PRISM
        </h2>

        <p>
          Projected Reality Interaction
          <br />
          &amp; Spatial Manipulation
        </p>

        <div className="definition-meta">
          HUMAN · SPACE · OBJECT
        </div>

        <div className="title-line" />
      </div>
    );
  }

  if (scene === "team") {
    const safeMember =
      member >= 0
        ? member
        : 0;

    const person =
      TEAM[safeMember];

    return (
      <div
        className="copy copy-team"
        data-scene-copy="team"
      >
        <div className="team-kicker">
          THE TEAM · PRISM
        </div>

        <div className="member">
          <div className="member-number">
            {String(
              safeMember + 1,
            ).padStart(2, "0")}
          </div>

          <div className="member-main">
            <div className="member-handle">
              {person.handle}
            </div>

            <div className="member-name">
              {person.name}
            </div>

            {person.role && (
              <div className="member-role">
                {person.role}
              </div>
            )}
          </div>
        </div>

        <div className="team-dots">
          {TEAM.map((_, index) => (
            <span
              key={index}
              className={
                index === safeMember
                  ? "active"
                  : ""
              }
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="copy copy-launch"
      data-scene-copy="launch"
    >
      <div className="launch-small">
        ZYNASH LABS · PRISM
      </div>

      <div className="launch-word">
        EXPERIENCE
      </div>

      <div className="launch-sub">
        ENTERING SPATIAL INTERFACE
      </div>
    </div>
  );
}

export default function PrismCinematicIntro({
  onComplete,
  showSkip = false,
  duration = 13200,
  quality = "auto",
}: IntroProps) {
  const rootRef =
    useRef<HTMLDivElement>(null);

  const canvasRef =
    useRef<HTMLCanvasElement>(null);

  const progressLabelRef =
    useRef<HTMLDivElement>(null);

  const engineRef =
    useRef<PrismCinematicEngine | null>(
      null,
    );

  const completionTimerRef =
    useRef<number | null>(null);

  const [
    scene,
    setScene,
  ] = useState<IntroScene>("boot");

  const [
    member,
    setMember,
  ] = useState<IntroMemberIndex>(-1);

  const [
    exiting,
    setExiting,
  ] = useState(false);

  useEffect(() => {
    const canvas =
      canvasRef.current;

    const root =
      rootRef.current;

    if (!canvas || !root) {
      return;
    }

    let lastProgressInteger =
      -1;

    const engine =
      new PrismCinematicEngine({
        canvas,
        durationMs:
          duration,
        quality,
        seed: 0x5a17c0de,
        reducedMotion:
          window.matchMedia(
            "(prefers-reduced-motion: reduce)",
          ).matches,

        onSceneChange: (
          nextScene,
          nextMember,
        ) => {
          setScene(
            nextScene,
          );

          setMember(
            nextMember,
          );

          root.dataset.scene =
            nextScene;

          root.dataset.member =
            String(
              nextMember,
            );
        },

        onProgress: (
          progress,
          label,
        ) => {
          root.style.setProperty(
            "--intro-progress",
            String(progress),
          );

          root.style.setProperty(
            "--intro-progress-pct",
            String(
              Math.round(
                progress *
                  100,
              ),
            ),
          );

          root.dataset.phase =
            label;

          const integer =
            Math.round(
              progress *
                100,
            );

          if (
            progressLabelRef.current &&
            integer !==
              lastProgressInteger
          ) {
            lastProgressInteger =
              integer;

            progressLabelRef.current.textContent =
              String(
                integer,
              ).padStart(
                3,
                "0",
              );
          }
        },

        onComplete: () => {
          setExiting(true);

          completionTimerRef.current =
            window.setTimeout(
              () => {
                onComplete?.();
              },
              820,
            );
        },
      });

    engineRef.current =
      engine;

    engine.start();

    return () => {
      if (
        completionTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          completionTimerRef.current,
        );
      }

      engine.dispose();
      engineRef.current = null;
    };
  }, [
    duration,
    quality,
    onComplete,
  ]);

  useEffect(() => {
    if (!showSkip) {
      return;
    }

    const onKey = (
      event: KeyboardEvent,
    ) => {
      if (
        event.key === "Escape"
      ) {
        engineRef.current?.skip();
      }
    };

    window.addEventListener(
      "keydown",
      onKey,
    );

    return () =>
      window.removeEventListener(
        "keydown",
        onKey,
      );
  }, [showSkip]);

  const sceneClass =
    SCENE_CLASS[scene];

  return (
    <div
      ref={rootRef}
      className={[
        "prism-cinematic",
        sceneClass,
        exiting
          ? "is-exiting"
          : "",
      ].join(" ")}
      data-scene={scene}
      data-member={member}
    >
      <canvas
        ref={canvasRef}
        className="prism-canvas"
        aria-hidden="true"
      />

      <div className="prism-vignette" />
      <div className="prism-noise" />
      <div className="prism-scanlines" />

      <div className="cinematic-depth-plane depth-plane-a" />
      <div className="cinematic-depth-plane depth-plane-b" />
      <div className="cinematic-depth-plane depth-plane-c" />

      <div className="cinematic-content">
        <SceneCopy
          scene={scene}
          member={member}
        />
      </div>

      <header className="intro-topbar">
        <div className="intro-brand">
          <span className="brand-mark">
            Z
          </span>

          <span className="brand-name">
            ZYNASH LABS
          </span>
        </div>

        <div className="top-center">
          SPATIAL SYSTEM
        </div>

        <div className="top-status">
          <span className="status-dot" />
          ONLINE
        </div>
      </header>

      <aside
        className="intro-side-left"
        aria-hidden="true"
      >
        <span>P</span>
        <i />
        <span>R</span>
        <i />
        <span>I</span>
        <i />
        <span>S</span>
        <i />
        <span>M</span>
      </aside>

      <aside
        className="intro-side-right"
        aria-hidden="true"
      >
        <span>001</span>
        <span>•</span>
        <span>2026</span>
      </aside>

      <footer className="intro-bottombar">
        <div>
          PRISM / 001
        </div>

        <div className="progress-track">
          <div className="progress-bar" />
        </div>

        <div
          ref={progressLabelRef}
        >
          000
        </div>
      </footer>

      {showSkip &&
        !exiting && (
          <button
            type="button"
            className="skip-button"
            onClick={() =>
              engineRef.current?.skip()
            }
          >
            <span>
              SKIP INTRO
            </span>

            <kbd>
              ESC
            </kbd>
          </button>
        )}

      <div className="final-flare" />
    </div>
  );
}
