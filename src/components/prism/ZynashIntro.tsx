"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";

/**
 * ZynashIntro — Apple-ad-quality cinematic startup animation.
 *
 * Design principles (from studying Apple product launch ads):
 *   1. Only animate GPU-accelerated properties (transform, opacity)
 *      — NEVER animate filter:blur during motion (causes stutter)
 *   2. Custom cubic-bezier easing — Apple uses [0.16, 1, 0.3, 1] (ease-out-expo)
 *   3. Multiple parallax depth layers — background moves slower than foreground
 *   4. Fly-ins from different angles — title from depth, credits from sides
 *   5. Seamless phase transitions — overlap, don't cut
 *   6. Static glass blur (backdrop-filter set once, not animated)
 *   7. Minimal particles — 15 premium, not 40 cheap
 *   8. Depth-of-field — elements at different depths have different opacity
 *
 * Sequence (with overlap, like Apple):
 *   0.0s  Aurora fades in (deep background, parallax layer 0)
 *   0.3s  Light particles appear (midground, parallax layer 1)
 *   0.5s  Title flies in from depth Z-300 → Z0, rotateY 25→0, scale 0.3→1
 *   1.2s  Subtitle fades in below title
 *   2.5s  Title starts dissolving (opacity 1→0, scale 1→1.1, y 0→-30)
 *         WHILE credits phase begins (overlap — no gap)
 *   2.8s  Credit 1 flies in from left (x:-200, z:-100 → x:0, z:0)
 *   3.8s  Credit 2 flies in from right (x:200, z:-100 → x:0, z:0)
 *   4.8s  Credit 3 flies in from bottom (y:200, z:-100 → y:0, z:0)
 *   6.0s  Everything starts dissolving
 *   7.0s  Done
 */

// Apple-style easing curves
const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;
const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const;

interface CreditEntry { name: string; role: string; badge?: string; }
const CREDITS: CreditEntry[] = [
  { name: "Tanay Bhandari", role: "Zyntrix.krnl.sys", badge: "LEAD" },
  { name: "Ashwin Nagaranjan Ramnath", role: "Ash Collector" },
  { name: "Debroop", role: "distortus_rexx" },
];

// Fly-in direction for each credit (visual variety)
const CREDIT_DIRECTIONS = [
  { x: -180, y: 0, z: -120 },   // from left
  { x: 180, y: 0, z: -120 },    // from right
  { x: 0, y: 120, z: -120 },    // from bottom
];

type Phase = "title" | "credits" | "fadeout" | "done";

// ── Premium particle (GPU-optimized: only transform+opacity animate) ────
function Particle({ i }: { i: number }) {
  const cfg = [
    { x: 15, y: 20, size: 4, hue: "#0a84ff", dur: 6, delay: 0 },
    { x: 85, y: 30, size: 3, hue: "#5e9eff", dur: 5, delay: 0.5 },
    { x: 50, y: 10, size: 5, hue: "#ffffff", dur: 7, delay: 1 },
    { x: 25, y: 70, size: 3, hue: "#7c3aed", dur: 5.5, delay: 0.3 },
    { x: 75, y: 80, size: 4, hue: "#a0c4ff", dur: 6.5, delay: 0.8 },
    { x: 40, y: 50, size: 2, hue: "#0a84ff", dur: 4.5, delay: 1.2 },
    { x: 60, y: 40, size: 3, hue: "#c084fc", dur: 5, delay: 0.6 },
    { x: 10, y: 85, size: 4, hue: "#5e9eff", dur: 6, delay: 0.2 },
    { x: 90, y: 15, size: 2, hue: "#ffffff", dur: 4, delay: 1.5 },
    { x: 35, y: 25, size: 3, hue: "#0a84ff", dur: 5.5, delay: 0.9 },
    { x: 65, y: 65, size: 4, hue: "#a0c4ff", dur: 6.5, delay: 0.4 },
    { x: 20, y: 45, size: 2, hue: "#7c3aed", dur: 5, delay: 1.1 },
    { x: 80, y: 55, size: 3, hue: "#ffffff", dur: 4.5, delay: 0.7 },
    { x: 45, y: 80, size: 4, hue: "#0a84ff", dur: 6, delay: 0.1 },
    { x: 55, y: 15, size: 2, hue: "#c084fc", dur: 5.5, delay: 1.3 },
  ][i];

  return (
    <motion.div
      style={{
        position: "absolute",
        left: `${cfg.x}%`,
        top: `${cfg.y}%`,
        width: cfg.size,
        height: cfg.size,
        borderRadius: "50%",
        background: cfg.hue,
        boxShadow: `0 0 ${cfg.size * 5}px ${cfg.hue}`,
        pointerEvents: "none",
      }}
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        opacity: [0, 0.6, 0.6, 0],
        scale: [0, 1, 1, 0.3],
        y: [0, -30, -60],
      }}
      transition={{
        duration: cfg.dur,
        delay: cfg.delay,
        repeat: Infinity,
        ease: "easeInOut" as const,
        times: [0, 0.3, 0.7, 1],
      }}
    />
  );
}

export default function ZynashIntro({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("title");
  const [visibleCredits, setVisibleCredits] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const [titleExiting, setTitleExiting] = useState(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    if (skipped) {
      const t = setTimeout(() => onDoneRef.current(), 500);
      return () => clearTimeout(t);
    }
    const T = setTimeout;
    const timers: ReturnType<typeof T>[] = [];
    // Title dissolves at 2.5s (starts BEFORE credits phase for overlap)
    timers.push(T(() => setTitleExiting(true), 2400));
    // Credits phase begins at 2.8s (overlaps with title exit — no gap)
    timers.push(T(() => setPhase("credits"), 2700));
    // Credits appear one by one
    CREDITS.forEach((_, i) => {
      timers.push(T(() => setVisibleCredits(i + 1), 2700 + i * 1100));
    });
    // Fade out
    timers.push(T(() => setPhase("fadeout"), 2700 + CREDITS.length * 1100 + 600));
    // Done
    timers.push(T(() => setPhase("done"), 2700 + CREDITS.length * 1100 + 600 + 1000));
    return () => timers.forEach(clearTimeout);
  }, [skipped]);

  useEffect(() => {
    if (phase === "done") onDoneRef.current();
  }, [phase]);

  const skip = () => { if (!skipped) setSkipped(true); };
  if (phase === "done") return null;

  const showCredits = phase === "credits" || phase === "fadeout";
  const isFading = phase === "fadeout";

  return (
    <motion.div
      onClick={skip}
      style={{
        position: "fixed", inset: 0, zIndex: 9999, background: "#000",
        cursor: "pointer", overflow: "hidden", perspective: "1500px",
      }}
      animate={{ opacity: isFading ? 0 : 1 }}
      transition={{ duration: 1, ease: EASE_OUT_EXPO }}
    >
      {/* ══ PARALLAX LAYER 0: Aurora background (deep, slow) ════════════ */}
      <motion.div
        style={{ position: "absolute", inset: "-30%" }}
        initial={{ opacity: 0, scale: 1.2 }}
        animate={{ opacity: 1, scale: [1.2, 1.05, 1.15, 1.1], rotate: [0, 2, -1, 0] }}
        transition={{
          opacity: { duration: 1.5, ease: EASE_OUT_EXPO },
          scale: { duration: 10, repeat: Infinity, ease: "easeInOut" },
          rotate: { duration: 10, repeat: Infinity, ease: "easeInOut" },
        }}
      >
        <div style={{
          position: "absolute", inset: 0,
          background: `
            radial-gradient(ellipse 60% 50% at 25% 30%, rgba(10,132,255,0.15) 0%, transparent 60%),
            radial-gradient(ellipse 50% 40% at 75% 70%, rgba(124,58,237,0.12) 0%, transparent 60%),
            radial-gradient(ellipse 70% 60% at 50% 50%, rgba(10,132,255,0.04) 0%, transparent 70%)
          `,
        }} />
      </motion.div>

      {/* ══ PARALLAX LAYER 1: Particles (midground) ═════════════════════ */}
      <motion.div
        style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, z: [0, 10, 0] }}
        transition={{
          opacity: { duration: 1, delay: 0.3, ease: EASE_OUT_EXPO },
          z: { duration: 8, repeat: Infinity, ease: "easeInOut" },
        }}
      >
        {Array.from({ length: 15 }, (_, i) => <Particle key={i} i={i} />)}
      </motion.div>

      {/* ══ VIGNETTE (static, for cinematic depth) ══════════════════════ */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.5) 100%)",
      }} />

      {/* ══ PARALLAX LAYER 2: Content (foreground) ═════════════════════ */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        transformStyle: "preserve-3d",
      }}>

        {/* ── TITLE (flies in from depth) ────────────────────────────── */}
        <AnimatePresence>
          {!titleExiting && (
            <motion.div
              key="title"
              style={{ transformStyle: "preserve-3d" }}
              initial={{
                opacity: 0,
                rotateX: -35,
                rotateY: 20,
                z: -400,
                scale: 0.3,
              }}
              animate={{
                opacity: 1,
                rotateX: 0,
                rotateY: 0,
                z: 0,
                scale: 1,
              }}
              exit={{
                opacity: 0,
                y: -40,
                scale: 1.15,
                z: 100,
              }}
              transition={{
                initial: { duration: 1.2, ease: EASE_OUT_EXPO },
                exit: { duration: 0.8, ease: EASE_IN_OUT },
              }}
            >
              {/* Glass panel (static blur — NOT animated) */}
              <div style={{
                position: "relative",
                padding: "clamp(28px, 5vw, 50px) clamp(36px, 7vw, 80px)",
                borderRadius: "20px",
                background: "rgba(255,255,255,0.02)",
                backdropFilter: "blur(24px) saturate(180%)",
                WebkitBackdropFilter: "blur(24px) saturate(180%)",
                border: "1px solid rgba(255,255,255,0.06)",
                boxShadow: "0 8px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 80px rgba(10,132,255,0.05)",
                overflow: "hidden", textAlign: "center",
              }}>
                {/* Light sweep (only backgroundPosition animates — GPU-safe) */}
                <motion.div
                  style={{
                    position: "absolute", inset: 0, pointerEvents: "none",
                    background: "linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.06) 50%, transparent 65%)",
                    backgroundSize: "200% 100%",
                  }}
                  animate={{ backgroundPosition: ["-100% 0%", "200% 0%"] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                />
                {/* Top edge highlight */}
                <div style={{
                  position: "absolute", top: 0, left: "15%", right: "15%", height: 1,
                  background: "linear-gradient(90deg, transparent, rgba(10,132,255,0.35), transparent)",
                }} />

                <div style={{
                  fontSize: "clamp(1.8rem, 6.5vw, 4.5rem)",
                  fontWeight: 800, letterSpacing: "0.1em",
                  background: "linear-gradient(180deg, #ffffff 0%, #b0b0b8 45%, #d0d0d4 65%, #ffffff 100%)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                  filter: "drop-shadow(0 4px 20px rgba(10,132,255,0.25))",
                  position: "relative",
                }}>
                  ZYNASH LABS
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8, duration: 0.8, ease: EASE_OUT_EXPO }}
                  style={{
                    marginTop: "clamp(8px, 1.5vw, 14px)",
                    fontSize: "clamp(0.58rem, 1.1vw, 0.75rem)",
                    fontWeight: 500, letterSpacing: "0.3em",
                    color: "rgba(10,132,255,0.55)", textTransform: "uppercase",
                    position: "relative",
                  }}
                >
                  Projected Reality Interaction &amp; Spatial Manipulation
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── CREDITS (fly in from different directions) ─────────────── */}
        {showCredits && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: "clamp(12px, 2vh, 20px)", transformStyle: "preserve-3d",
          }}>
            {/* Small header */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 0.12, scale: 1 }}
              transition={{ duration: 0.8, ease: EASE_OUT_EXPO }}
              style={{
                fontSize: "clamp(0.6rem, 1.2vw, 0.8rem)", fontWeight: 700,
                letterSpacing: "0.3em", color: "rgba(255,255,255,1)",
                textTransform: "uppercase", marginBottom: 4,
              }}
            >
              ZYNASH LABS
            </motion.div>

            <AnimatePresence>
              {CREDITS.slice(0, visibleCredits).map((credit, i) => {
                const isLead = credit.badge === "LEAD";
                const dir = CREDIT_DIRECTIONS[i % CREDIT_DIRECTIONS.length];
                return (
                  <motion.div
                    key={i}
                    style={{
                      position: "relative",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                      padding: isLead
                        ? "clamp(16px, 3vw, 28px) clamp(30px, 6vw, 56px)"
                        : "clamp(12px, 2.5vw, 20px) clamp(24px, 5vw, 44px)",
                      borderRadius: "14px",
                      background: isLead
                        ? "linear-gradient(135deg, rgba(10,132,255,0.07), rgba(124,58,237,0.03))"
                        : "rgba(255,255,255,0.015)",
                      backdropFilter: "blur(20px) saturate(160%)",
                      WebkitBackdropFilter: "blur(20px) saturate(160%)",
                      border: isLead
                        ? "1px solid rgba(10,132,255,0.2)"
                        : "1px solid rgba(255,255,255,0.05)",
                      boxShadow: isLead
                        ? "0 6px 30px rgba(10,132,255,0.1), inset 0 1px 0 rgba(255,255,255,0.08)"
                        : "0 4px 16px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.03)",
                      overflow: "hidden", transformStyle: "preserve-3d",
                    }}
                    initial={{
                      opacity: 0,
                      x: dir.x,
                      y: dir.y,
                      z: dir.z,
                      scale: 0.6,
                      rotateY: dir.x > 0 ? 15 : dir.x < 0 ? -15 : 0,
                    }}
                    animate={{
                      opacity: 1,
                      x: 0, y: 0, z: 0,
                      scale: 1,
                      rotateY: 0,
                    }}
                    exit={{
                      opacity: 0,
                      scale: 0.9,
                      y: -20,
                    }}
                    transition={{
                      duration: 0.9,
                      ease: EASE_OUT_EXPO,
                    }}
                  >
                    {/* Light sweep */}
                    <motion.div
                      style={{
                        position: "absolute", inset: 0, pointerEvents: "none",
                        background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.05) 50%, transparent 60%)",
                        backgroundSize: "200% 100%",
                      }}
                      animate={{ backgroundPosition: ["-100% 0%", "200% 0%"] }}
                      transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
                    />
                    {/* Top edge */}
                    <div style={{
                      position: "absolute", top: 0, left: "10%", right: "10%", height: 1,
                      background: isLead
                        ? "linear-gradient(90deg, transparent, rgba(10,132,255,0.35), transparent)"
                        : "linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)",
                    }} />

                    {isLead && (
                      <div style={{
                        fontSize: 8, fontWeight: 700, letterSpacing: "0.25em",
                        color: "#0a84ff", textTransform: "uppercase",
                        padding: "2px 8px", border: "1px solid rgba(10,132,255,0.3)",
                        borderRadius: "999px", background: "rgba(10,132,255,0.06)",
                        position: "relative",
                      }}>
                        LEAD
                      </div>
                    )}
                    <div style={{
                      fontSize: isLead ? "clamp(1.2rem, 3vw, 1.8rem)" : "clamp(0.95rem, 2.2vw, 1.3rem)",
                      fontWeight: 600, letterSpacing: "0.01em",
                      color: isLead ? "#ffffff" : "rgba(245,245,247,0.85)",
                      textShadow: isLead ? "0 2px 10px rgba(10,132,255,0.3)" : "none",
                      position: "relative",
                    }}>
                      {credit.name}
                    </div>
                    <div style={{
                      fontSize: "clamp(0.65rem, 1.1vw, 0.78rem)",
                      fontWeight: 500, letterSpacing: "0.1em",
                      color: isLead ? "rgba(10,132,255,0.75)" : "rgba(255,255,255,0.28)",
                      fontFamily: "var(--font-mono, 'SF Mono', monospace)",
                      position: "relative",
                    }}>
                      {credit.role}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Skip hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.12 }}
          transition={{ delay: 1.5, duration: 1 }}
          style={{
            position: "fixed", bottom: 24,
            fontSize: 9, letterSpacing: "0.2em",
            color: "rgba(255,255,255,1)", textTransform: "uppercase",
          }}
        >
          Click anywhere to skip
        </motion.div>
      </div>
    </motion.div>
  );
}
