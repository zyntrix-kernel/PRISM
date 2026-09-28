"use client";

import { useEffect, useRef, useState } from "react";
import "./PrismCinematicIntro.css";

type IntroProps = {
  onComplete?: () => void;
  showSkip?: boolean;
  duration?: number;
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
];

const INTRO_DURATION = 16000; // was 11200 — longer so people can actually read it

type Particle = {
  x: number;
  y: number;
  z: number;
  size: number;
  speed: number;
  phase: number;
  alpha: number;
};

type Pointer = {
  x: number;
  y: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function easeOutExpo(t: number) {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

function easeInOutCubic(t: number) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}

function drawGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  strength: number,
) {
  const gradient = ctx.createRadialGradient(
    x,
    y,
    0,
    x,
    y,
    radius,
  );

  gradient.addColorStop(
    0,
    `rgba(130, 220, 255, ${strength})`,
  );

  gradient.addColorStop(
    0.2,
    `rgba(55, 155, 255, ${strength * 0.65})`,
  );

  gradient.addColorStop(
    0.65,
    `rgba(20, 90, 255, ${strength * 0.16})`,
  );

  gradient.addColorStop(1, "rgba(0,0,0,0)");

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawLineGlow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  alpha: number,
  width = 1,
) {
  ctx.save();

  ctx.lineWidth = width;
  ctx.strokeStyle = `rgba(110, 205, 255, ${alpha})`;
  ctx.shadowColor = `rgba(65, 160, 255, ${alpha})`;
  ctx.shadowBlur = 14;

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.restore();
}

export default function PrismCinematicIntro({
  onComplete,
  showSkip = true,
  duration = INTRO_DURATION,
}: IntroProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const pointer = useRef<Pointer>({
    x: 0,
    y: 0,
  });

  const particles = useRef<Particle[]>([]);
  const completed = useRef(false);

  const [progress, setProgress] = useState(0);
  const [scene, setScene] = useState(0);
  const [member, setMember] = useState(-1);
  const [exiting, setExiting] = useState(false);

  const finish = () => {
    if (completed.current) return;

    completed.current = true;
    setExiting(true);

    window.setTimeout(() => {
      onComplete?.();
    }, 850);
  };

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    let raf = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;

      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();

    window.addEventListener("resize", resize);

    particles.current = Array.from(
      { length: 360 },
      (_, i) => ({
        x: Math.random(),
        y: Math.random(),
        z: Math.random(),
        size: Math.random() * 1.8 + 0.25,
        speed: Math.random() * 0.8 + 0.15,
        phase: Math.random() * Math.PI * 2,
        alpha: Math.random() * 0.7 + 0.1,
      }),
    );

    const handlePointerMove = (event: PointerEvent) => {
      pointer.current.x =
        event.clientX / window.innerWidth - 0.5;

      pointer.current.y =
        event.clientY / window.innerHeight - 0.5;
    };

    window.addEventListener(
      "pointermove",
      handlePointerMove,
      { passive: true },
    );

    const start = performance.now();

    const render = (now: number) => {
      const elapsed = now - start;
      const pct = clamp(elapsed / duration, 0, 1);

      setProgress(pct);

      if (elapsed < 1200) {
        setScene(0);
        setMember(-1);
      } else if (elapsed < 2700) {
        setScene(1);
        setMember(-1);
      } else if (elapsed < 4200) {
        setScene(2);
        setMember(-1);
      } else if (elapsed < 6100) {
        setScene(3);
        setMember(-1);
      } else if (elapsed < 7600) {
        setScene(4);
        setMember(-1);
      } else if (elapsed < 9900) {
        setScene(5);

        const local = elapsed - 7600;

        if (local < 760) {
          setMember(0);
        } else if (local < 1520) {
          setMember(1);
        } else {
          setMember(2);
        }
      } else {
        setScene(6);
        setMember(2);
      }

      const width = window.innerWidth;
      const height = window.innerHeight;

      ctx.clearRect(0, 0, width, height);

      /*
       * Deep atmospheric base.
       */
      const background = ctx.createRadialGradient(
        width * 0.5,
        height * 0.42,
        0,
        width * 0.5,
        height * 0.42,
        Math.max(width, height) * 0.75,
      );

      background.addColorStop(
        0,
        "rgba(9, 40, 92, 0.35)",
      );

      background.addColorStop(
        0.42,
        "rgba(2, 16, 43, 0.8)",
      );

      background.addColorStop(
        1,
        "rgba(1, 6, 17, 1)",
      );

      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);

      /*
       * Main energy core.
       */
      const coreX =
        width * 0.5 +
        pointer.current.x * 35;

      const coreY =
        height * 0.44 +
        pointer.current.y * 25;

      const sceneEnergy =
        elapsed < 1200
          ? 0
          : easeOutExpo(
              clamp((elapsed - 1200) / 1300, 0, 1),
            );

      drawGlow(
        ctx,
        coreX,
        coreY,
        Math.min(width, height) *
          (0.12 + sceneEnergy * 0.12),
        0.18 + sceneEnergy * 0.24,
      );

      /*
       * Particle universe.
       */
      particles.current.forEach((particle, index) => {
        const drift =
          elapsed * 0.00001 * particle.speed;

        const px =
          (((particle.x + drift * (0.5 + particle.z)) %
            1) *
            width);

        const py =
          (((particle.y +
            Math.sin(
              elapsed * 0.0003 + particle.phase,
            ) *
              0.00035) %
            1) *
            height);

        const perspective =
          0.3 + particle.z * 0.9;

        const size =
          particle.size * perspective;

        const alpha =
          particle.alpha *
          (0.2 + sceneEnergy * 0.8);

        ctx.fillStyle = `rgba(168, 225, 255, ${alpha})`;

        ctx.beginPath();

        ctx.arc(
          px,
          py,
          size,
          0,
          Math.PI * 2,
        );

        ctx.fill();

        if (
          index % 17 === 0 &&
          sceneEnergy > 0.25
        ) {
          drawLineGlow(
            ctx,
            px,
            py,
            coreX,
            coreY,
            alpha * 0.05,
            0.35,
          );
        }
      });

      /*
       * Horizon / spatial plane.
       */
      const gridStart =
        height * 0.62;

      const gridIntensity =
        smoothstep(
          clamp(
            (elapsed - 1500) / 1700,
            0,
            1,
          ),
        );

      ctx.save();

      ctx.globalAlpha =
        gridIntensity * 0.32;

      ctx.strokeStyle =
        "rgba(82, 170, 255, 0.42)";

      ctx.lineWidth = 1;

      for (
        let y = gridStart;
        y < height + 200;
        y += 34
      ) {
        const perspective =
          (y - gridStart) /
          (height - gridStart + 1);

        const offset =
          perspective * perspective * 80;

        ctx.beginPath();
        ctx.moveTo(-offset, y);
        ctx.lineTo(width + offset, y);
        ctx.stroke();
      }

      for (
        let x = -width;
        x < width * 2;
        x += 70
      ) {
        ctx.beginPath();
        ctx.moveTo(width * 0.5, gridStart);
        ctx.lineTo(x, height + 200);
        ctx.stroke();
      }

      ctx.restore();

      /*
       * Orbit system.
       */
      const orbitPower =
        smoothstep(
          clamp(
            (elapsed - 2200) / 1300,
            0,
            1,
          ),
        );

      ctx.save();

      ctx.translate(
        coreX,
        coreY,
      );

      ctx.rotate(
        elapsed * 0.0001,
      );

      [1, 1.35, 1.72].forEach(
        (scale, index) => {
          ctx.save();

          ctx.rotate(index * 0.82);

          ctx.scale(
            1,
            0.32 + index * 0.07,
          );

          ctx.strokeStyle =
            `rgba(91, 190, 255, ${
              0.12 * orbitPower
            })`;

          ctx.shadowColor =
            "rgba(45, 155, 255, 0.6)";

          ctx.shadowBlur = 12;

          ctx.lineWidth = 1.1;

          ctx.beginPath();

          ctx.arc(
            0,
            0,
            Math.min(width, height) *
              0.14 *
              scale,
            0,
            Math.PI * 2,
          );

          ctx.stroke();

          ctx.restore();
        },
      );

      ctx.restore();

      /*
       * Radial rays.
       */
      const rayPower =
        smoothstep(
          clamp(
            (elapsed - 2500) / 1600,
            0,
            1,
          ),
        );

      if (rayPower > 0) {
        ctx.save();

        ctx.translate(coreX, coreY);

        for (let i = 0; i < 28; i++) {
          const angle =
            (Math.PI * 2 * i) / 28 +
            elapsed * 0.00005;

          const radius =
            Math.min(width, height) *
            (0.14 + ((i * 37) % 100) / 150);

          const x =
            Math.cos(angle) * radius;

          const y =
            Math.sin(angle) * radius;

          const startRadius =
            Math.min(width, height) * 0.13;

          const sx =
            Math.cos(angle) * startRadius;

          const sy =
            Math.sin(angle) * startRadius;

          drawLineGlow(
            ctx,
            sx,
            sy,
            x,
            y,
            rayPower * 0.035,
            0.6,
          );
        }

        ctx.restore();
      }

      /*
       * Rotating angular HUD.
       */
      if (elapsed > 2900) {
        const hudPower = smoothstep(
          clamp(
            (elapsed - 2900) / 900,
            0,
            1,
          ),
        );

        ctx.save();

        ctx.translate(coreX, coreY);

        ctx.rotate(
          -elapsed * 0.00012,
        );

        const hudRadius =
          Math.min(width, height) * 0.235;

        ctx.strokeStyle =
          `rgba(122, 206, 255, ${
            hudPower * 0.2
          })`;

        ctx.lineWidth = 1;

        for (let i = 0; i < 36; i++) {
          const angle =
            (Math.PI * 2 * i) / 36;

          const r1 = hudRadius;
          const r2 =
            i % 3 === 0
              ? hudRadius + 13
              : hudRadius + 6;

          ctx.beginPath();

          ctx.moveTo(
            Math.cos(angle) * r1,
            Math.sin(angle) * r1,
          );

          ctx.lineTo(
            Math.cos(angle) * r2,
            Math.sin(angle) * r2,
          );

          ctx.stroke();
        }

        ctx.restore();
      }

      /*
       * Main light pulse.
       */
      if (
        elapsed > 3900 &&
        elapsed < 6600
      ) {
        const pulse =
          0.5 +
          Math.sin(elapsed * 0.004) * 0.5;

        drawGlow(
          ctx,
          coreX,
          coreY,
          Math.min(width, height) *
            0.08,
          0.25 + pulse * 0.1,
        );
      }

      /*
       * Final convergence.
       */
      if (elapsed > 9700) {
        const converge = smoothstep(
          clamp(
            (elapsed - 9700) / 1000,
            0,
            1,
          ),
        );

        ctx.fillStyle = `rgba(225, 247, 255, ${
          converge * 0.07
        })`;

        ctx.fillRect(
          0,
          0,
          width,
          height,
        );
      }

      if (elapsed >= duration) {
        finish();
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);

      window.removeEventListener(
        "resize",
        resize,
      );

      window.removeEventListener(
        "pointermove",
        handlePointerMove,
      );
    };
  }, [duration]);

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        showSkip
      ) {
        finish();
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyboard,
    );

    return () =>
      window.removeEventListener(
        "keydown",
        handleKeyboard,
      );
  }, [showSkip]);

  const sceneClass = `scene-${scene}`;

  return (
    <div
      ref={rootRef}
      className={`prism-cinematic ${sceneClass} ${
        exiting ? "is-exiting" : ""
      }`}
    >
      <canvas
        ref={canvasRef}
        className="prism-canvas"
      />

      <div className="prism-vignette" />
      <div className="prism-noise" />
      <div className="prism-scanlines" />

      {/* Ambient glass silhouettes */}
      <div className="glass-orb glass-orb-a" />
      <div className="glass-orb glass-orb-b" />

      {/* Central 3D crystal */}
      <div className="prism-hero">
        <div className="crystal-shadow" />

        <div className="crystal">
          <div className="crystal-edge crystal-edge-a" />
          <div className="crystal-edge crystal-edge-b" />
          <div className="crystal-edge crystal-edge-c" />

          <div className="crystal-face crystal-face-1">
            <span />
          </div>

          <div className="crystal-face crystal-face-2">
            <span />
          </div>

          <div className="crystal-face crystal-face-3">
            <span />
          </div>

          <div className="crystal-core">
            <div className="core-ring" />
            <div className="core-ring ring-2" />
            <div className="core-light" />
          </div>
        </div>

        <div className="floating-glyph glyph-1">
          01
        </div>

        <div className="floating-glyph glyph-2">
          XR
        </div>

        <div className="floating-glyph glyph-3">
          ∆
        </div>

        <div className="spatial-label">
          SPATIAL FIELD
        </div>
      </div>

      {/* Cinematic copy */}
      <div className="cinematic-content">
        {scene === 0 && (
          <div className="copy copy-awakening">
            <span className="micro">
              INITIALIZING SPATIAL ENVIRONMENT
            </span>

            <span className="line" />

            <span className="micro faded">
              ZYNASH LABS
            </span>
          </div>
        )}

        {scene === 1 && (
          <div className="copy copy-ignition">
            <span className="micro">
              REALITY / INTERFACE
            </span>

            <h1 className="ghost-word">
              PERCEIVE
            </h1>
          </div>
        )}

        {scene === 2 && (
          <div className="copy copy-labs">
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
        )}

        {scene === 3 && (
          <div className="copy copy-prism">
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
        )}

        {scene === 4 && (
          <div className="copy copy-title">
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

            <div className="title-line" />
          </div>
        )}

        {scene === 5 && member >= 0 && (
          <div className="copy copy-team">
            <div className="team-kicker">
              THE TEAM · PRISM
            </div>

            <div
              key={member}
              className="member"
            >
              <div className="member-number">
                {String(member + 1).padStart(
                  2,
                  "0",
                )}
              </div>

              <div>
                <div className="member-handle">
                  {TEAM[member].handle}
                </div>

                <div className="member-name">
                  {TEAM[member].name}
                </div>

                {TEAM[member].role && (
                  <div className="member-role">
                    {TEAM[member].role}
                  </div>
                )}
              </div>
            </div>

            <div className="team-dots">
              {TEAM.map((_, index) => (
                <span
                  key={index}
                  className={
                    index === member
                      ? "active"
                      : ""
                  }
                />
              ))}
            </div>
          </div>
        )}

        {scene === 6 && (
          <div className="copy copy-launch">
            <div className="launch-small">
              ZYNASH LABS · PRISM
            </div>

            <div className="launch-word">
              EXPERIENCE
            </div>
          </div>
        )}
      </div>

      {/* Top chrome */}
      <div className="intro-topbar">
        <div className="brand-mark">
          Z
        </div>

        <div className="top-center">
          SPATIAL SYSTEM
        </div>

        <div className="top-status">
          <span className="status-dot" />
          ONLINE
        </div>
      </div>

      {/* Bottom chrome */}
      <div className="intro-bottombar">
        <div>
          PRISM / 001
        </div>

        <div className="progress-track">
          <div
            className="progress-bar"
            style={{
              transform: `scaleX(${progress})`,
            }}
          />
        </div>

        <div>
          {String(
            Math.min(
              100,
              Math.round(progress * 100),
            ),
          ).padStart(3, "0")}
        </div>
      </div>

      {showSkip && !exiting && (
        <button
          type="button"
          className="skip-button"
          onClick={finish}
        >
          <span>SKIP INTRO</span>
          <kbd>ESC</kbd>
        </button>
      )}

      {/* White-blue cinematic transition */}
      <div className="final-flare" />
    </div>
  );
}
