"use client";

import { useEffect, useRef } from "react";

/**
 * ParallaxDepthLayer
 * ----------------------------------------------------------------------------
 * A dreamy parallax starfield that responds to pointer movement. Multiple
 * layers of tiny stars drift at different speeds as the mouse moves, creating
 * a sense of depth and dimensionality behind the 3D scene.
 *
 * Sits above the atmosphere orbs but below the scene canvas. Pure CSS
 * transforms (GPU-friendly), pointer-events: none. Disabled on reduced-motion.
 *
 * This adds spatial depth WITHOUT touching the Three.js engine — it's a
 * pure DOM layer that makes the whole interface feel more alive.
 */
const LAYERS = [
  { count: 18, size: 1.5, depth: 0.012, opacity: 0.5, hue: "255, 243, 230" },
  { count: 12, size: 2.2, depth: 0.024, opacity: 0.65, hue: "154, 220, 255" },
  { count: 6, size: 3, depth: 0.04, opacity: 0.8, hue: "255, 179, 217" },
];

interface Star {
  x: number; // 0..1 normalized
  y: number;
  layer: number;
  twinkle: number; // phase offset for opacity animation
}

export default function ParallaxDepthLayer() {
  const ref = useRef<HTMLDivElement>(null);
  const starsRef = useRef<Star[]>([]);

  // Generate stars once
  if (starsRef.current.length === 0) {
    const stars: Star[] = [];
    LAYERS.forEach((layer, li) => {
      for (let i = 0; i < layer.count; i++) {
        stars.push({
          x: Math.random(),
          y: Math.random(),
          layer: li,
          twinkle: Math.random() * Math.PI * 2,
        });
      }
    });
    starsRef.current = stars;
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Respect reduced-motion: skip parallax, stars stay static
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      // Normalize to -1..1 from center
      targetX = (e.clientX / window.innerWidth) * 2 - 1;
      targetY = (e.clientY / window.innerHeight) * 2 - 1;
    };

    const animate = () => {
      // Smooth lerp toward target for buttery parallax
      currentX += (targetX - currentX) * 0.06;
      currentY += (targetY - currentY) * 0.06;
      const layers = el.children;
      for (let i = 0; i < layers.length; i++) {
        const layer = LAYERS[i];
        if (!layer) continue;
        const dx = -currentX * layer.depth * 100;
        const dy = -currentY * layer.depth * 100;
        (layers[i] as HTMLElement).style.transform = `translate(${dx}px, ${dy}px)`;
      }
      raf = requestAnimationFrame(animate);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(animate);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 2,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {LAYERS.map((layer, li) => (
        <div
          key={li}
          style={{
            position: "absolute",
            inset: "-5%",
            willChange: "transform",
          }}
        >
          {starsRef.current
            .filter((s) => s.layer === li)
            .map((star, si) => (
              <span
                key={si}
                style={{
                  position: "absolute",
                  left: `${star.x * 100}%`,
                  top: `${star.y * 100}%`,
                  width: layer.size,
                  height: layer.size,
                  borderRadius: "50%",
                  background: `rgb(${layer.hue})`,
                  boxShadow: `0 0 ${layer.size * 2}px rgba(${layer.hue}, 0.8)`,
                  opacity: layer.opacity,
                  animation: `prism-star-twinkle ${3 + (si % 4)}s ease-in-out infinite`,
                  animationDelay: `${star.twinkle}s`,
                }}
              />
            ))}
        </div>
      ))}
      <style>{`
        @keyframes prism-star-twinkle {
          0%, 100% { opacity: var(--star-opacity, 0.5); transform: scale(1); }
          50% { opacity: calc(var(--star-opacity, 0.5) * 0.4); transform: scale(0.7); }
        }
      `}</style>
    </div>
  );
}
