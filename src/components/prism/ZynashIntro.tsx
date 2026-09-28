"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";

/**
 * ZynashIntro — INSANE cinematic startup animation.
 *
 * Motion design that will blow people away at the expo. Built with
 * motion/react (Framer Motion successor) for buttery spring physics
 * + CSS for the glass/3D layers.
 *
 * Sequence:
 *   1. (0-0.8s)   Black screen → light burst from center
 *   2. (0.8-3s)   "ZYNASH LABS" title explodes in from particles
 *                  with glass panel + light sweep + 3D rotate
 *   3. (3-3.5s)   Title panel dissolves upward
 *   4. (3.5-7.5s) Credits appear as glass cards, one by one,
 *                  each with spring physics + light sweep
 *   5. (7.5-8.5s) Everything dissolves
 *   6. (8.5s)     Done
 *
 * Effects:
 *   - Light burst (radial gradient expanding from center)
 *   - Glass panels with backdrop-blur + refraction shimmer
 *   - 3D perspective transforms (rotateX, rotateY, translateZ)
 *   - Light sweep across glass surfaces (moving gradient)
 *   - Floating particles in 3D space (CSS transform-style: preserve-3d)
 *   - Aurora gradient that shifts behind everything
 *   - Spring physics on every element (motion/react)
 *   - Staggered credit reveals with AnimatePresence
 *   - Vignette for cinematic depth
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

type Phase = "burst" | "title" | "credits" | "fadeout" | "done";

// ── Floating particle ───────────────────────────────────────────────────
function FloatingParticle({ index }: { index: number }) {
  const seed = index * 137.5;
  const x = (seed % 100);
  const y = ((seed * 1.7) % 100);
  const z = (seed % 200) - 100;
  const size = 2 + (seed % 5);
  const colors = ["#0a84ff", "#5e9eff", "#a0c4ff", "#ffffff", "#7c3aed", "#c084fc"];
  const hue = colors[index % colors.length];
  const duration = 3 + (seed % 4);
  const delay = (seed % 30) / 10;

  return (
    <motion.div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        width: size,
        height: size,
        borderRadius: "50%",
        background: hue,
        boxShadow: `0 0 ${size * 6}px ${hue}`,
        transformStyle: "preserve-3d",
        pointerEvents: "none",
      }}
      initial={{ opacity: 0, scale: 0, z: z }}
      animate={{
        opacity: [0, 0.8, 0.8, 0],
        scale: [0, 1, 1, 0.5],
        y: [0, -40, -80],
        z: [z, z + 50, z + 100],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
}

// ── Glass card with light sweep ──────────────────────────────────────────
function GlassCard({
  children,
  isLead = false,
  delay = 0,
}: {
  children: React.ReactNode;
  isLead?: boolean;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{
        opacity: 0,
        rotateX: 25,
        y: 60,
        z: -150,
        scale: 0.7,
        filter: "blur(12px)",
      }}
      animate={{
        opacity: 1,
        rotateX: 0,
        y: 0,
        z: 0,
        scale: 1,
        filter: "blur(0px)",
      }}
      exit={{
        opacity: 0,
        y: -40,
        scale: 0.9,
        filter: "blur(8px)",
      }}
      transition={{
        duration: 0.7,
        delay,
        type: "spring",
        stiffness: 120,
        damping: 16,
        mass: 0.8,
      }}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        padding: isLead
          ? "clamp(20px, 4vw, 36px) clamp(36px, 7vw, 70px)"
          : "clamp(14px, 3vw, 24px) clamp(28px, 5vw, 50px)",
        borderRadius: "16px",
        background: isLead
          ? "linear-gradient(135deg, rgba(10,132,255,0.08), rgba(124,58,237,0.04))"
          : "rgba(255,255,255,0.02)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        border: isLead
          ? "1px solid rgba(10,132,255,0.25)"
          : "1px solid rgba(255,255,255,0.06)",
        boxShadow: isLead
          ? "0 8px 40px rgba(10,132,255,0.12), inset 0 1px 0 rgba(255,255,255,0.1), 0 0 60px rgba(10,132,255,0.05)"
          : "0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
        overflow: "hidden",
        transformStyle: "preserve-3d",
      }}
    >
      {/* Light sweep */}
      <motion.div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.08) 50%, transparent 60%)",
          backgroundSize: "200% 100%",
          pointerEvents: "none",
        }}
        animate={{ backgroundPosition: ["-100% 0", "200% 0"] }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
          delay: delay + 0.3,
        }}
      />
      {/* Top edge highlight */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "10%",
          right: "10%",
          height: 1,
          background: isLead
            ? "linear-gradient(90deg, transparent, rgba(10,132,255,0.5), transparent)"
            : "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)",
        }}
      />
      {children}
    </motion.div>
  );
}

// ── Main intro ──────────────────────────────────────────────────────────
export default function ZynashIntro({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("burst");
  const [visibleCredits, setVisibleCredits] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    if (skipped) {
      const t = setTimeout(() => onDoneRef.current(), 500);
      return () => clearTimeout(t);
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setPhase("title"), 800));
    timers.push(setTimeout(() => setPhase("credits"), 3500));
    // Reveal credits one by one
    CREDITS.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleCredits(i + 1), 3500 + i * 1400));
    });
    timers.push(setTimeout(() => setPhase("fadeout"), 3500 + CREDITS.length * 1400 + 800));
    timers.push(setTimeout(() => setPhase("done"), 3500 + CREDITS.length * 1400 + 800 + 1000));
    return () => timers.forEach(clearTimeout);
  }, [skipped]);

  useEffect(() => {
    if (phase === "done") onDoneRef.current();
  }, [phase]);

  const skip = () => { if (!skipped) setSkipped(true); };
  if (phase === "done") return null;

  const showBurst = phase === "burst";
  const showTitle = phase === "title" || phase === "credits" || phase === "fadeout";
  const showCredits = phase === "credits" || phase === "fadeout";
  const isFading = phase === "fadeout";

  return (
    <motion.div
      onClick={skip}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#000000",
        cursor: "pointer",
        overflow: "hidden",
        perspective: "1200px",
      }}
      animate={{ opacity: isFading ? 0 : 1 }}
      transition={{ duration: 1, ease: "easeOut" }}
    >
      {/* ── Aurora background ─────────────────────────────────────────── */}
      <motion.div
        style={{
          position: "absolute",
          inset: "-30%",
          background: `
            radial-gradient(ellipse at 25% 35%, rgba(10,132,255,0.12) 0%, transparent 50%),
            radial-gradient(ellipse at 75% 65%, rgba(124,58,237,0.10) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 50%, rgba(10,132,255,0.03) 0%, transparent 70%)
          `,
        }}
        animate={{
          scale: [1, 1.15, 1],
          rotate: [0, 3, 0],
          opacity: [0.5, 1, 0.5],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ── Light burst from center ──────────────────────────────────── */}
      <AnimatePresence>
        {showBurst && (
          <motion.div
            key="burst"
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(10,132,255,0.9), rgba(10,132,255,0.2) 40%, transparent 70%)",
            }}
            initial={{ scale: 0, opacity: 0, x: "-50%", y: "-50%" }}
            animate={{ scale: 200, opacity: [0, 1, 0.3, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
          />
        )}
      </AnimatePresence>

      {/* ── Floating particles ───────────────────────────────────────── */}
      <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d" }}>
        {Array.from({ length: 40 }, (_, i) => (
          <FloatingParticle key={i} index={i} />
        ))}
      </div>

      {/* ── Vignette ─────────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "clamp(16px, 3vh, 28px)",
          transformStyle: "preserve-3d",
        }}
      >
        {/* ── Title panel ───────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {showTitle && !showCredits && (
            <motion.div
              key="title"
              style={{ transformStyle: "preserve-3d" }}
              initial={{
                opacity: 0,
                rotateX: -50,
                rotateY: 20,
                z: -300,
                scale: 0.4,
                filter: "blur(20px)",
              }}
              animate={{
                opacity: 1,
                rotateX: 0,
                rotateY: 0,
                z: 0,
                scale: 1,
                filter: "blur(0px)",
              }}
              exit={{
                opacity: 0,
                y: -80,
                scale: 0.85,
                filter: "blur(15px)",
              }}
              transition={{
                duration: 1,
                type: "spring",
                stiffness: 80,
                damping: 18,
                mass: 1,
              }}
            >
              <div
                style={{
                  position: "relative",
                  padding: "clamp(30px, 6vw, 55px) clamp(40px, 8vw, 90px)",
                  borderRadius: "24px",
                  background: "rgba(255,255,255,0.025)",
                  backdropFilter: "blur(24px) saturate(200%)",
                  WebkitBackdropFilter: "blur(24px) saturate(200%)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: "0 12px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12), 0 0 100px rgba(10,132,255,0.06)",
                  textAlign: "center",
                  overflow: "hidden",
                }}
              >
                {/* Light sweep */}
                <motion.div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.1) 50%, transparent 65%)",
                    backgroundSize: "200% 100%",
                    pointerEvents: "none",
                  }}
                  animate={{ backgroundPosition: ["-100% 0", "200% 0"] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                />
                {/* Top edge highlight */}
                <div style={{ position: "absolute", top: 0, left: "15%", right: "15%", height: 1, background: "linear-gradient(90deg, transparent, rgba(10,132,255,0.4), transparent)" }} />

                <div
                  style={{
                    fontSize: "clamp(2rem, 7vw, 5rem)",
                    fontWeight: 800,
                    letterSpacing: "0.12em",
                    background: "linear-gradient(180deg, #ffffff 0%, #b0b0b8 45%, #d8d8dc 70%, #ffffff 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                    filter: "drop-shadow(0 6px 24px rgba(10,132,255,0.3))",
                    position: "relative",
                  }}
                >
                  ZYNASH LABS
                </div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6, duration: 0.8 }}
                  style={{
                    marginTop: "clamp(10px, 2vw, 16px)",
                    fontSize: "clamp(0.6rem, 1.2vw, 0.8rem)",
                    fontWeight: 500,
                    letterSpacing: "0.35em",
                    color: "rgba(10,132,255,0.6)",
                    textTransform: "uppercase",
                    position: "relative",
                  }}
                >
                  Projected Reality Interaction &amp; Spatial Manipulation
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Credits ──────────────────────────────────────────────── */}
        {showCredits && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "clamp(14px, 2.5vh, 24px)",
              transformStyle: "preserve-3d",
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              style={{
                fontSize: "clamp(0.65rem, 1.4vw, 0.85rem)",
                fontWeight: 700,
                letterSpacing: "0.35em",
                color: "rgba(255,255,255,0.12)",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              ZYNASH LABS
            </motion.div>

            <AnimatePresence>
              {CREDITS.slice(0, visibleCredits).map((credit, i) => {
                const isLead = credit.badge === "LEAD";
                return (
                  <GlassCard key={i} isLead={isLead} delay={0}>
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
                          position: "relative",
                        }}
                      >
                        LEAD
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: isLead
                          ? "clamp(1.3rem, 3.2vw, 2rem)"
                          : "clamp(1rem, 2.4vw, 1.4rem)",
                        fontWeight: 600,
                        letterSpacing: "0.01em",
                        color: isLead ? "#ffffff" : "rgba(245,245,247,0.88)",
                        textShadow: isLead ? "0 2px 12px rgba(10,132,255,0.35)" : "none",
                        position: "relative",
                      }}
                    >
                      {credit.name}
                    </div>
                    <div
                      style={{
                        fontSize: "clamp(0.68rem, 1.2vw, 0.82rem)",
                        fontWeight: 500,
                        letterSpacing: "0.1em",
                        color: isLead ? "rgba(10,132,255,0.8)" : "rgba(255,255,255,0.3)",
                        fontFamily: "var(--font-mono, 'SF Mono', monospace)",
                        position: "relative",
                      }}
                    >
                      {credit.role}
                    </div>
                  </GlassCard>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Skip hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 1 }}
          style={{
            position: "fixed",
            bottom: 30,
            fontSize: 10,
            letterSpacing: "0.2em",
            color: "rgba(255,255,255,0.12)",
            textTransform: "uppercase",
          }}
        >
          Click anywhere to skip
        </motion.div>
      </div>
    </motion.div>
  );
}
