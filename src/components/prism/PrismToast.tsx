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
      {toasts.map((t, idx) => {
        const meta = KIND_META[t.kind];
        const Icon = meta.icon;
        const hue = t.hue ?? meta.hue;
        // Stacked toasts behind the front get a subtle 0.98 scale + opacity
        const isStacked = idx < toasts.length - 1;
        return (
          <div
            key={t.id}
            className={`prism-toast ${isStacked ? "stacked" : ""}`}
            style={{
              "--toast-hue": `rgb(${hue})`,
              "--toast-hue-glow": `rgba(${hue}, 0.22)`,
            } as React.CSSProperties}
          >
            {/* Semantic left accent bar */}
            <span className="prism-toast-accent" aria-hidden="true" />
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
                zIndex: 1,
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
              className="prism-toast-close"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
      <style>{`
        @keyframes prism-toast-bar {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
      `}</style>
    </div>
  );
}
