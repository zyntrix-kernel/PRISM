"use client";

import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, Info, AlertTriangle, X } from "lucide-react";

/**
 * PrismToast
 * ----------------------------------------------------------------------------
 * A dreamy toast notification system for action feedback. Toasts slide in
 * from the top-right with a spring entrance, glow with their semantic hue,
 * auto-dismiss after 3s, and stack gracefully.
 *
 * Usage: call window.__prismToast({ message, kind }) from anywhere.
 * Wired into the PrismApp via a global so the imperative engine can emit
 * toasts without importing React.
 */

export interface ToastItem {
  id: number;
  message: string;
  kind: "success" | "info" | "warn";
  hue?: string;
}

type ToastFn = (t: Omit<ToastItem, "id">) => void;

declare global {
  interface Window {
    __prismToast?: ToastFn;
  }
}

const KIND_META: Record<
  ToastItem["kind"],
  { icon: typeof CheckCircle2; hue: string; label: string }
> = {
  success: { icon: CheckCircle2, hue: "143, 245, 180", label: "Success" },
  info: { icon: Info, hue: "154, 220, 255", label: "Info" },
  warn: { icon: AlertTriangle, hue: "255, 207, 92", label: "Notice" },
};

export default function PrismToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const push: ToastFn = (t) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), 3200);
    };
    window.__prismToast = push;
    return () => {
      delete window.__prismToast;
    };
  }, [dismiss]);

  return (
    <div
      style={{
        position: "fixed",
        top: 64,
        right: 14,
        zIndex: 45,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: "min(340px, calc(100vw - 28px))",
        pointerEvents: "none",
      }}
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => {
        const meta = KIND_META[t.kind];
        const Icon = meta.icon;
        const hue = t.hue ?? meta.hue;
        return (
          <div
            key={t.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "11px 14px 11px 12px",
              background: "var(--glass-3)",
              backdropFilter: "blur(24px) saturate(170%)",
              WebkitBackdropFilter: "blur(24px) saturate(170%)",
              border: `1px solid rgba(${hue}, 0.4)`,
              borderRadius: "var(--radius-md)",
              boxShadow: `var(--glass-highlight), 0 0 20px rgba(${hue}, 0.22), 0 8px 24px rgba(0,0,0,0.45)`,
              color: "var(--hud-fg)",
              fontFamily: "var(--font-ui)",
              fontSize: 13,
              lineHeight: 1.4,
              pointerEvents: "auto",
              animation: "prism-toast-in 360ms cubic-bezier(0.34,1.56,0.64,1)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <style>{`
              @keyframes prism-toast-in {
                from { opacity: 0; transform: translateX(40px) scale(0.92); }
                to { opacity: 1; transform: translateX(0) scale(1); }
              }
              @keyframes prism-toast-out {
                to { opacity: 0; transform: translateX(40px) scale(0.92); }
              }
              @keyframes prism-toast-bar {
                from { transform: scaleX(1); }
                to { transform: scaleX(0); }
              }
            `}</style>
            {/* Progress bar showing auto-dismiss countdown */}
            <div
              style={{
                position: "absolute",
                left: 0,
                bottom: 0,
                height: 2,
                width: "100%",
                background: `rgba(${hue}, 0.5)`,
                transformOrigin: "left",
                animation: "prism-toast-bar 3200ms linear forwards",
              }}
            />
            <span
              style={{
                width: 26,
                height: 26,
                flex: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 7,
                background: `rgba(${hue}, 0.16)`,
                color: `rgb(${hue})`,
              }}
            >
              <Icon size={15} />
            </span>
            <span style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
              {t.message}
            </span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--hud-fg-faint)",
                cursor: "pointer",
                padding: 2,
                flex: "none",
                display: "flex",
                marginTop: -1,
              }}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
