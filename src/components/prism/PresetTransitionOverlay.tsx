"use client";

/**
 * PresetTransitionOverlay
 * ----------------------------------------------------------------------------
 * Plays a dreamy radial flash + fade whenever the active preset changes.
 * The flash emanates from screen center with the preset's signature hue,
 * then settles into a soft veil that lifts to reveal the new world.
 *
 * Implementation: the parent passes `key={preset}`, so React remounts this
 * component fresh on every preset change. The CSS animation plays from
 * scratch each mount (animation-fill-mode: forwards → ends invisible).
 * No useState/useEffect needed → no cascading renders, no lint violations.
 */
const PRESET_HUES: Record<string, string> = {
  space: "154, 220, 255",
  blocks: "255, 179, 217",
  test: "201, 184, 255",
  singularity: "255, 214, 170",
  drive: "143, 245, 180",
  atom: "154, 220, 255",
  voxel: "255, 207, 92",
};

export default function PresetTransitionOverlay({
  preset,
}: {
  preset: string;
}) {
  const hue = PRESET_HUES[preset] ?? "154, 220, 255";

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {/* Radial flash emanating from center */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 50% 50%, rgba(${hue}, 0.28) 0%, rgba(${hue}, 0.12) 30%, transparent 70%)`,
          animation: "prism-transition-flash 850ms cubic-bezier(0.2, 0, 0, 1) forwards",
        }}
      />
      {/* Expanding ring (the "iris" of the transition) */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 40,
          height: 40,
          marginLeft: -20,
          marginTop: -20,
          borderRadius: "50%",
          border: `2px solid rgba(${hue}, 0.6)`,
          boxShadow: `0 0 40px rgba(${hue}, 0.5), inset 0 0 20px rgba(${hue}, 0.3)`,
          animation: "prism-transition-ring 850ms cubic-bezier(0.2, 0, 0, 1) forwards",
        }}
      />
      {/* Preset name label — fades in then out, centered */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          fontFamily: "var(--font-ui)",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 6,
          textTransform: "uppercase",
          color: `rgb(${hue})`,
          textShadow: `0 0 24px rgba(${hue}, 0.7), 0 0 48px rgba(${hue}, 0.4)`,
          animation: "prism-transition-label 850ms cubic-bezier(0.2, 0, 0, 1) forwards",
          whiteSpace: "nowrap",
        }}
      >
        {preset}
      </div>
      <style>{`
        @keyframes prism-transition-flash {
          0% { opacity: 0; }
          15% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes prism-transition-ring {
          0% {
            transform: scale(0.1);
            opacity: 0;
            border-width: 6px;
          }
          25% {
            opacity: 1;
            border-width: 3px;
          }
          100% {
            transform: scale(40);
            opacity: 0;
            border-width: 0.5px;
          }
        }
        @keyframes prism-transition-label {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); letter-spacing: 12px; }
          30% { opacity: 1; transform: translate(-50%, -50%) scale(1); letter-spacing: 6px; }
          70% { opacity: 1; transform: translate(-50%, -50%) scale(1); letter-spacing: 6px; }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.1); letter-spacing: 3px; }
        }
      `}</style>
    </div>
  );
}
