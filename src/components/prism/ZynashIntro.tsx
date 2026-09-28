"use client";

import { useEffect, useRef, useState } from "react";

/**
 * ZynashIntro — dreamy glass UI cinematic startup animation.
 *
 * NOT a cheap decrypt effect. NOT a broken 3D canvas. This is a premium
 * glass-morphism intro with:
 *   - Layered glass panels with backdrop-blur + refraction feel
 *   - CSS 3D perspective transforms (rotateX, rotateY, translateZ)
 *   - A light sweep that sweeps across the title (ShinyText pattern)
 *   - Particles drifting in 3D space (CSS, not WebGL — always works)
 *   - Credits that fade + scale in with spring easing (clean, not scrambled)
 *   - An aurora gradient that shifts behind everything
 *
 * Phases:
 *   1. (0-2s)    Aurora fades in + glass title card rotates in from 3D
 *   2. (2-5s)   Credits appear one by one with glass card spring entrance
 *   3. (5-6s)   Everything dissolves
 *   4. (6s)     Done
 */

interface CreditEntry {
  name: string;
  role: string;
  badge?: string;
}

const CREDITS: CreditEntry[] = [
  { name: "Tanay Bhandari", role: "Zyntrix.krnl.sys", badge: "LEAD" },
  { name: "Ashwin Nagaranjan Ramnath", role: "Ash Collector" },
  { name: "Debroop", role: "distortus_rexx" },
];

type Phase = "title" | "credits" | "fadeout" | "done";

// ── Floating particle (CSS 3D) ──────────────────────────────────────────
function Particle({ delay, duration, x, y, z, size, hue }: {
  delay: number; duration: number; x: number; y: number; z: number; size: number; hue: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        width: size,
        height: size,
        borderRadius: "50%",
        background: hue,
        boxShadow: `0 0 ${size * 4}px ${hue}`,
        transform: `translateZ(${z}px)`,
        opacity: 0,
        animation: `zynash-particle-float ${duration}s ease-in-out ${delay}s infinite alternate`,
        pointerEvents: "none",
      }}
    />
  );
}

export default function ZynashIntro({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("title");
  const [visibleCredit, setVisibleCredit] = useState(-1);
  const [skipped, setSkipped] = useState(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    if (skipped) {
      const t = setTimeout(() => onDoneRef.current(), 400);
      return () => clearTimeout(t);
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setPhase("credits"), 2500));
    CREDITS.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleCredit(i), 2500 + i * 1200));
    });
    timers.push(setTimeout(() => setPhase("fadeout"), 2500 + CREDITS.length * 1200 + 800));
    timers.push(setTimeout(() => setPhase("done"), 2500 + CREDITS.length * 1200 + 800 + 1000));
    return () => timers.forEach(clearTimeout);
  }, [skipped]);

  useEffect(() => {
    if (phase === "done") onDoneRef.current();
  }, [phase]);

  const skip = () => { if (!skipped) setSkipped(true); };
  if (phase === "done") return null;

  const isFading = phase === "fadeout";
  const showTitle = phase === "title";
  const showCredits = phase === "credits" || isFading;

  // Generate particles
  const particles = Array.from({ length: 30 }, (_, i) => ({
    delay: Math.random() * 4,
    duration: 3 + Math.random() * 4,
    x: Math.random() * 100,
    y: Math.random() * 100,
    z: Math.random() * 200 - 100,
    size: 2 + Math.random() * 4,
    hue: ["#0a84ff", "#5e9eff", "#a0c4ff", "#ffffff", "#7c3aed"][Math.floor(Math.random() * 5)],
  }));

  return (
    <div
      onClick={skip}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#000000",
        cursor: "pointer",
        opacity: isFading ? 0 : 1,
        transition: "opacity 1s ease-out",
        overflow: "hidden",
        perspective: "1000px",
      }}
    >
      {/* Aurora gradient background — shifts slowly */}
      <div
        style={{
          position: "absolute",
          inset: "-20%",
          background: `
            radial-gradient(ellipse at 30% 40%, rgba(10,132,255,0.15) 0%, transparent 50%),
            radial-gradient(ellipse at 70% 60%, rgba(124,58,237,0.12) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 50%, rgba(10,132,255,0.05) 0%, transparent 70%)
          `,
          animation: "zynash-aurora 8s ease-in-out infinite alternate",
        }}
      />

      {/* Floating particles in 3D space */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformStyle: "preserve-3d",
        }}
      >
        {particles.map((p, i) => (
          <Particle key={i} {...p} />
        ))}
      </div>

      {/* Content container — 3D centered */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          transformStyle: "preserve-3d",
          gap: "clamp(20px, 4vh, 40px)",
        }}
      >
        {/* Phase 1: Glass title card */}
        {showTitle && (
          <div
            style={{
              transformStyle: "preserve-3d",
              animation: "zynash-title-3d 2.5s cubic-bezier(0.16, 1, 0.3, 1) forwards",
            }}
          >
            {/* Glass panel behind the title */}
            <div
              style={{
                position: "relative",
                padding: "clamp(30px, 6vw, 60px) clamp(40px, 8vw, 100px)",
                borderRadius: "24px",
                background: "rgba(255,255,255,0.03)",
                backdropFilter: "blur(20px) saturate(180%)",
                WebkitBackdropFilter: "blur(20px) saturate(180%)",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: `
                  0 8px 32px rgba(0,0,0,0.4),
                  inset 0 1px 0 rgba(255,255,255,0.1),
                  0 0 80px rgba(10,132,255,0.08)
                `,
                textAlign: "center",
                overflow: "hidden",
              }}
            >
              {/* Light sweep across the glass */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.08) 50%, transparent 70%)",
                  backgroundSize: "200% 100%",
                  animation: "zynash-sweep 3s ease-in-out infinite",
                  pointerEvents: "none",
                }}
              />

              {/* Title with metallic gradient */}
              <div
                style={{
                  fontSize: "clamp(2rem, 7vw, 5rem)",
                  fontWeight: 800,
                  letterSpacing: "0.12em",
                  background: "linear-gradient(180deg, #ffffff 0%, #c0c0c8 50%, #e8e8ec 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  filter: "drop-shadow(0 4px 20px rgba(10,132,255,0.25))",
                  position: "relative",
                }}
              >
                ZYNASH LABS
              </div>

              {/* Subtitle */}
              <div
                style={{
                  marginTop: "clamp(10px, 2vw, 16px)",
                  fontSize: "clamp(0.65rem, 1.3vw, 0.85rem)",
                  fontWeight: 500,
                  letterSpacing: "0.35em",
                  color: "rgba(10,132,255,0.65)",
                  textTransform: "uppercase",
                  animation: "zynash-fade-in 1s ease-out 1s forwards",
                  opacity: 0,
                }}
              >
                Projected Reality Interaction &amp; Spatial Manipulation
              </div>
            </div>
          </div>
        )}

        {/* Phase 2: Credits with glass card entrance */}
        {showCredits && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "clamp(16px, 3vh, 28px)",
              textAlign: "center",
              transformStyle: "preserve-3d",
            }}
          >
            {/* Small header */}
            <div
              style={{
                fontSize: "clamp(0.7rem, 1.5vw, 0.95rem)",
                fontWeight: 700,
                letterSpacing: "0.3em",
                color: "rgba(255,255,255,0.15)",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              ZYNASH LABS
            </div>

            {CREDITS.map((credit, i) => {
              if (i > visibleCredit) return null;
              const isLead = credit.badge === "LEAD";
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    padding: "clamp(16px, 3vw, 28px) clamp(30px, 6vw, 60px)",
                    borderRadius: "16px",
                    background: isLead
                      ? "rgba(10,132,255,0.06)"
                      : "rgba(255,255,255,0.02)",
                    backdropFilter: "blur(16px) saturate(160%)",
                    WebkitBackdropFilter: "blur(16px) saturate(160%)",
                    border: isLead
                      ? "1px solid rgba(10,132,255,0.2)"
                      : "1px solid rgba(255,255,255,0.06)",
                    boxShadow: isLead
                      ? "0 4px 24px rgba(10,132,255,0.1), inset 0 1px 0 rgba(255,255,255,0.08)"
                      : "0 4px 16px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)",
                    animation: "zynash-credit-glass 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  {/* Light sweep on the glass card */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.06) 50%, transparent 60%)",
                      backgroundSize: "200% 100%",
                      animation: "zynash-sweep 4s ease-in-out infinite",
                      pointerEvents: "none",
                    }}
                  />

                  {isLead && (
                    <div
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.25em",
                        color: "#0a84ff",
                        textTransform: "uppercase",
                        padding: "3px 10px",
                        border: "1px solid rgba(10,132,255,0.35)",
                        borderRadius: "999px",
                        background: "rgba(10,132,255,0.08)",
                      }}
                    >
                      LEAD
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: isLead
                        ? "clamp(1.3rem, 3.2vw, 2rem)"
                        : "clamp(1.05rem, 2.5vw, 1.5rem)",
                      fontWeight: 600,
                      letterSpacing: "0.01em",
                      color: isLead ? "#ffffff" : "rgba(245,245,247,0.9)",
                      textShadow: isLead
                        ? "0 2px 12px rgba(10,132,255,0.3)"
                        : "none",
                      position: "relative",
                    }}
                  >
                    {credit.name}
                  </div>
                  <div
                    style={{
                      fontSize: "clamp(0.7rem, 1.3vw, 0.85rem)",
                      fontWeight: 500,
                      letterSpacing: "0.1em",
                      color: isLead
                        ? "rgba(10,132,255,0.8)"
                        : "rgba(255,255,255,0.35)",
                      fontFamily: "var(--font-mono, 'SF Mono', monospace)",
                      position: "relative",
                    }}
                  >
                    {credit.role}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Skip hint */}
        <div
          style={{
            position: "fixed",
            bottom: 30,
            fontSize: 10,
            letterSpacing: "0.2em",
            color: "rgba(255,255,255,0.15)",
            textTransform: "uppercase",
            animation: "zynash-fade-in 1s ease-out 1s forwards",
            opacity: 0,
          }}
        >
          Click anywhere to skip
        </div>
      </div>

      <style>{`
        @keyframes zynash-title-3d {
          0% {
            transform: perspective(1000px) rotateX(-45deg) rotateY(15deg) translateZ(-200px) scale(0.5);
            opacity: 0;
            filter: blur(15px);
          }
          60% {
            opacity: 1;
            filter: blur(0px);
          }
          100% {
            transform: perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0px) scale(1);
            opacity: 1;
            filter: blur(0px);
          }
        }
        @keyframes zynash-credit-glass {
          0% {
            transform: perspective(800px) rotateX(20deg) translateY(40px) translateZ(-100px) scale(0.8);
            opacity: 0;
            filter: blur(10px);
          }
          100% {
            transform: perspective(800px) rotateX(0deg) translateY(0px) translateZ(0px) scale(1);
            opacity: 1;
            filter: blur(0px);
          }
        }
        @keyframes zynash-sweep {
          0% { background-position: -100% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes zynash-aurora {
          0% { transform: scale(1) rotate(0deg); opacity: 0.6; }
          100% { transform: scale(1.1) rotate(5deg); opacity: 1; }
        }
        @keyframes zynash-particle-float {
          0% { opacity: 0; transform: translateZ(var(--z, 0px)) translateY(0px); }
          50% { opacity: 0.8; }
          100% { opacity: 0; transform: translateZ(var(--z, 0px)) translateY(-30px); }
        }
        @keyframes zynash-fade-in {
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
