"use client";

import type { PrismState } from "@/lib/prism/app";
import { MousePointer2, Hand, Fingerprint, Grab, Dot } from "lucide-react";

/**
 * InputModeIndicator
 * ----------------------------------------------------------------------------
 * A dreamy "instrument" widget showing the current input mode and gesture
 * state as a morphing icon. Makes the interface feel alive — the user can
 * see at a glance whether PRISM is responding to mouse or hand, and what
 * gesture it currently recognizes.
 *
 * Sits at the bottom-center, above the coach pill. Compact, glassy, tactile.
 */
type Mode = "mouse" | "hand" | "none";

function resolveMode(state: PrismState | null): Mode {
  if (!state) return "none";
  // The rail text reveals the live mode: gesture shows "—" when none,
  // otherwise the gesture name. hands text shows "No hands" / "1 hand" etc.
  const handsTxt = state.rail?.hands ?? "";
  const gestureTxt = state.rail?.gesture ?? "";
  if (handsTxt.includes("hand")) return "hand";
  if (gestureTxt && gestureTxt !== "—") return gestureTxt === "POINT" ? "hand" : "mouse";
  if (state.coach && /pinch|grab|point/i.test(state.coach)) return "mouse";
  return "mouse";
}

function resolveGesture(state: PrismState | null): "idle" | "point" | "pinch" | "grab" {
  if (!state) return "idle";
  const g = (state.rail?.gesture ?? "").toUpperCase();
  const coach = state.coach ?? "";
  if (g.includes("PINCH") || /pinch/i.test(coach)) return "pinch";
  if (g.includes("GRAB") || /grab|moving/i.test(coach)) return "grab";
  if (g.includes("POINT") || /point/i.test(coach)) return "point";
  return "idle";
}

const GESTURE_META: Record<
  "idle" | "point" | "pinch" | "grab",
  { icon: typeof Hand; label: string; hue: string }
> = {
  idle: { icon: Dot, label: "Idle", hue: "154, 220, 255" },
  point: { icon: MousePointer2, label: "Pointing", hue: "154, 220, 255" },
  pinch: { icon: Fingerprint, label: "Pinching", hue: "255, 179, 217" },
  grab: { icon: Grab, label: "Grabbing", hue: "255, 214, 170" },
};

const MODE_META: Record<Mode, { icon: typeof Hand; label: string }> = {
  none: { icon: Dot, label: "Waiting" },
  mouse: { icon: MousePointer2, label: "Mouse" },
  hand: { icon: Hand, label: "Hand" },
};

export default function InputModeIndicator({
  state,
}: {
  state: PrismState | null;
}) {
  const mode = resolveMode(state);
  const gesture = resolveGesture(state);
  const gMeta = GESTURE_META[gesture];
  const mMeta = MODE_META[mode];
  const GIcon = gMeta.icon;
  const MIcon = mMeta.icon;
  const hue = gMeta.hue;

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: 60,
        transform: "translateX(-50%)",
        zIndex: 11,
        display: "flex",
        alignItems: "center",
        gap: 0,
        padding: "6px 6px 6px 14px",
        background: "var(--glass-2)",
        backdropFilter: "blur(22px) saturate(160%)",
        WebkitBackdropFilter: "blur(22px) saturate(160%)",
        border: "1px solid var(--glass-line)",
        borderRadius: "var(--radius-pill)",
        boxShadow: `var(--glass-highlight), var(--glass-edge), 0 0 20px rgba(${hue}, 0.18), 0 6px 20px rgba(0,0,0,0.4)`,
        pointerEvents: "none",
        transition: "box-shadow 240ms cubic-bezier(0.2,0,0,1)",
        animation: "prism-mode-in 320ms cubic-bezier(0.34,1.56,0.64,1)",
      }}
    >
      <style>{`
        @keyframes prism-mode-in {
          from { opacity: 0; transform: translateX(-50%) translateY(8px) scale(0.94); }
          to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
        @keyframes prism-mode-pulse {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.12); }
        }
      `}</style>

      {/* Mode segment (mouse/hand icon) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          paddingRight: 10,
          marginRight: 10,
          borderRight: "1px solid var(--glass-line)",
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--hud-fg-dim)",
          }}
        >
          <MIcon size={14} />
        </span>
        <span
          style={{
            fontSize: 10,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: "var(--hud-fg-faint)",
            fontWeight: 600,
          }}
        >
          {mMeta.label}
        </span>
      </div>

      {/* Gesture segment (morphing icon) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingRight: 10,
        }}
      >
        <span
          style={{
            width: 26,
            height: 26,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            background: `radial-gradient(circle, rgba(${hue}, 0.22), transparent 70%)`,
            color: `rgb(${hue})`,
            position: "relative",
            transition: "all 240ms cubic-bezier(0.34,1.56,0.64,1)",
          }}
        >
          {/* Pulsing ring for active gestures */}
          {gesture !== "idle" && (
            <span
              style={{
                position: "absolute",
                inset: -3,
                borderRadius: "50%",
                border: `1px solid rgba(${hue}, 0.45)`,
                animation: "prism-mode-pulse 1.6s ease-in-out infinite",
              }}
            />
          )}
          <GIcon size={14} style={{ position: "relative", zIndex: 1 }} />
        </span>
        <span
          style={{
            fontSize: 10,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: "var(--hud-fg)",
            fontWeight: 600,
            minWidth: 56,
          }}
        >
          {gMeta.label}
        </span>
      </div>
    </div>
  );
}
