"use client";

/**
 * PresetTransitionOverlay
 * ----------------------------------------------------------------------------
 * A premium cinematic transition: smooth fade-to-color + fade-in with the
 * preset's signature hue. The name appears with a gentle spring entrance,
 * then fades as the new world is revealed.
 *
 * Implementation: parent passes `key={preset}`, so React remounts on change.
 * Pure CSS animation, no state, no lint violations.
 */
const PRESET_HUES: Record<string, string> = {
  space: "154, 220, 255",
  blocks: "255, 179, 217",
  test: "201, 184, 255",
  singularity: "255, 214, 170",
  drive: "143, 245, 180",
  atom: "154, 220, 255",
  voxel: "255, 207, 92",
  gun: "125, 211, 252",
  supernova: "255, 170, 68",
  nebula: "165, 180, 252",
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
      {/* Smooth cinematic fade overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 50% 50%, rgba(${hue}, 0.15) 0%, rgba(${hue}, 0.05) 40%, transparent 80%)`,
          animation: "prism-transition-flash 600ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        }}
      />
      {/* Soft expanding ring */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 20,
          height: 20,
          marginLeft: -10,
          marginTop: -10,
          borderRadius: "50%",
          border: `1.5px solid rgba(${hue}, 0.5)`,
          boxShadow: `0 0 30px rgba(${hue}, 0.4)`,
          animation: "prism-transition-ring 600ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        }}
      />
      {/* Preset name — gentle fade with spring-like entrance */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          fontFamily: "var(--font-ui)",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: 4,
          textTransform: "uppercase",
          color: `rgb(${hue})`,
          textShadow: `0 0 20px rgba(${hue}, 0.6)`,
          animation: "prism-transition-label 600ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
          whiteSpace: "nowrap",
        }}
      >
        {preset}
      </div>
      <style>{`
        @keyframes prism-transition-flash {
          0% { opacity: 0; }
          20% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes prism-transition-ring {
          0% {
            transform: scale(0.1);
            opacity: 0;
          }
          25% {
            opacity: 1;
          }
          100% {
            transform: scale(30);
            opacity: 0;
          }
        }
        @keyframes prism-transition-label {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.9); letter-spacing: 8px; }
          25% { opacity: 1; transform: translate(-50%, -50%) scale(1); letter-spacing: 4px; }
          75% { opacity: 1; }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.05); letter-spacing: 2px; }
        }
      `}</style>
    </div>
  );
}
