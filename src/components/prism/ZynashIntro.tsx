"use client";

import { useEffect, useState } from "react";

/**
 * ZynashIntro — cinematic startup animation.
 *
 * Plays a frame-by-frame credit sequence with 3D perspective effects:
 *   Phase 1 (0-2.5s):   "ZYNASH LABS" title scales + rotates in from 3D
 *   Phase 2 (2.5-6.5s): Credits appear one by one (frame-by-frame)
 *   Phase 3 (6.5-7.5s): Everything fades to black
 *   Phase 4 (7.5s+):    Intro dismissed, app visible
 *
 * The user can click anywhere to skip.
 *
 * Credit order (user-specified priority):
 *   1. Zyntrix.krnl.sys (Tanay Bhandari) — LEAD
 *   2. Ashwin Nagaranjan Ramnath — Ash Collector
 *   3. Debroop — distortus_rexx
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

export default function ZynashIntro({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("title");
  const [visibleCredit, setVisibleCredit] = useState(-1);
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    if (skipped) {
      const t = setTimeout(onDone, 400);
      return () => clearTimeout(t);
    }

    const timers: ReturnType<typeof setTimeout>[] = [];

    // Phase 1: title appears (0-2.5s)
    timers.push(setTimeout(() => setPhase("credits"), 2500));

    // Phase 2: credits appear one by one (2.5s start, 1.3s each)
    CREDITS.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleCredit(i), 2500 + i * 1300));
    });

    // Phase 3: fade out (after all credits shown + brief hold)
    timers.push(setTimeout(() => setPhase("fadeout"), 2500 + CREDITS.length * 1300 + 800));

    // Phase 4: done (after fade)
    timers.push(setTimeout(() => setPhase("done"), 2500 + CREDITS.length * 1300 + 800 + 1000));

    return () => timers.forEach(clearTimeout);
  }, [skipped, onDone]);

  useEffect(() => {
    if (phase === "done") onDone();
  }, [phase, onDone]);

  const skip = () => {
    if (!skipped) setSkipped(true);
  };

  if (phase === "done") return null;

  const isFading = phase === "fadeout";

  return (
    <div
      onClick={skip}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#000000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        perspective: "800px",
        opacity: isFading ? 0 : 1,
        transition: "opacity 1s ease-out",
        overflow: "hidden",
      }}
    >
      {/* Ambient radial glow behind the title */}
      <div
        style={{
          position: "absolute",
          width: "60vmax",
          height: "60vmax",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(10,132,255,0.08) 0%, rgba(10,132,255,0.02) 40%, transparent 70%)",
          filter: "blur(40px)",
          animation: "zynash-pulse 3s ease-in-out infinite alternate",
        }}
      />

      {/* Phase 1: ZYNASH LABS title with 3D entrance */}
      {phase === "title" && (
        <div
          style={{
            transform: "rotateX(0deg) scale(1)",
            animation: "zynash-title-in 2.5s cubic-bezier(0.16, 1, 0.3, 1) forwards",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: "clamp(2.5rem, 8vw, 6rem)",
              fontWeight: 800,
              letterSpacing: "0.15em",
              background: "linear-gradient(180deg, #f5f5f7 0%, #a0a0a8 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              filter: "drop-shadow(0 4px 20px rgba(10,132,255,0.3))",
            }}
          >
            ZYNASH LABS
          </div>
          <div
            style={{
              marginTop: 12,
              fontSize: "clamp(0.7rem, 1.5vw, 0.9rem)",
              fontWeight: 500,
              letterSpacing: "0.4em",
              color: "rgba(10,132,255,0.7)",
              textTransform: "uppercase",
            }}
          >
            Projected Reality Interaction
          </div>
        </div>
      )}

      {/* Phase 2: Credits appear one by one */}
      {phase === "credits" && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "clamp(20px, 4vh, 40px)",
            textAlign: "center",
          }}
        >
          {/* Small "ZYNASH LABS" header that stays during credits */}
          <div
            style={{
              fontSize: "clamp(0.8rem, 1.8vw, 1.1rem)",
              fontWeight: 700,
              letterSpacing: "0.3em",
              color: "rgba(255,255,255,0.3)",
              textTransform: "uppercase",
              marginBottom: 10,
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
                  gap: 4,
                  animation: `zynash-credit-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards`,
                }}
              >
                {isLead && (
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.2em",
                      color: "#0a84ff",
                      textTransform: "uppercase",
                      padding: "2px 8px",
                      border: "1px solid rgba(10,132,255,0.4)",
                      borderRadius: "var(--radius-pill, 999px)",
                      marginBottom: 4,
                    }}
                  >
                    LEAD
                  </div>
                )}
                <div
                  style={{
                    fontSize: isLead
                      ? "clamp(1.4rem, 3.5vw, 2.2rem)"
                      : "clamp(1.1rem, 2.8vw, 1.7rem)",
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                    color: isLead ? "#f5f5f7" : "rgba(245,245,247,0.85)",
                    textShadow: isLead
                      ? "0 2px 12px rgba(10,132,255,0.25)"
                      : "none",
                  }}
                >
                  {credit.name}
                </div>
                <div
                  style={{
                    fontSize: "clamp(0.75rem, 1.4vw, 0.9rem)",
                    fontWeight: 500,
                    letterSpacing: "0.1em",
                    color: isLead ? "rgba(10,132,255,0.8)" : "rgba(255,255,255,0.35)",
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  {credit.role}
                </div>
              </div>
            );
          })}

          {/* Skip hint */}
          <div
            style={{
              position: "fixed",
              bottom: 30,
              fontSize: 10,
              letterSpacing: "0.2em",
              color: "rgba(255,255,255,0.2)",
              textTransform: "uppercase",
              animation: "zynash-fade-in 1s ease-out 1s forwards",
              opacity: 0,
            }}
          >
            Click anywhere to skip
          </div>
        </div>
      )}

      <style>{`
        @keyframes zynash-title-in {
          0% {
            transform: rotateX(-90deg) scale(0.3);
            opacity: 0;
            filter: blur(20px) drop-shadow(0 0 40px rgba(10,132,255,0.6));
          }
          50% {
            opacity: 1;
            filter: blur(0px) drop-shadow(0 4px 20px rgba(10,132,255,0.4));
          }
          100% {
            transform: rotateX(0deg) scale(1);
            opacity: 1;
            filter: blur(0px) drop-shadow(0 4px 20px rgba(10,132,255,0.3));
          }
        }
        @keyframes zynash-credit-in {
          0% {
            transform: translateY(30px) scale(0.8);
            opacity: 0;
            filter: blur(8px);
          }
          100% {
            transform: translateY(0) scale(1);
            opacity: 1;
            filter: blur(0px);
          }
        }
        @keyframes zynash-pulse {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.15); opacity: 1; }
        }
        @keyframes zynash-fade-in {
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
