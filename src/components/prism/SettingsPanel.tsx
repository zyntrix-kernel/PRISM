"use client";

import { useEffect, useState } from "react";
import type { PrismState } from "@/lib/prism/app";
import {
  Settings,
  X,
  Bug,
  Sparkles,
  Gauge,
  Cpu,
  Eye,
  Activity,
  Check,
} from "lucide-react";

/**
 * SettingsPanel
 * ----------------------------------------------------------------------------
 * A dreamy glass drawer that consolidates Debug, AI, Quality, and Easy-mode
 * toggles into one place — decluttering the top HUD. Slides in from the
 * right with a spring entrance. Each toggle is a tactile glass switch.
 *
 * The native engine buttons (debug/ai/quality) remain in the DOM (hidden)
 * for keyboard-shortcut compatibility; this panel calls the same app methods.
 */
interface Props {
  state: PrismState | null;
  app: {
    toggleDebug: () => void;
    toggleAi: () => void;
    setQuality: (q: string) => void;
    toggleEasy: () => void;
  } | null;
}

const QUALITY_TIERS = [
  { id: "auto", label: "Auto", desc: "Adapt", icon: Cpu },
  { id: "ultra", label: "Ultra", desc: "Max", icon: Sparkles },
  { id: "high", label: "High", desc: "Bloom", icon: Eye },
  { id: "medium", label: "Medium", desc: "Balanced", icon: Gauge },
  { id: "low", label: "Low", desc: "Speed", icon: Activity },
];

export default function SettingsPanel({ state, app }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Trigger gear button in the HUD */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Settings"
        aria-expanded={open}
        title="Settings"
        className={`prism-pressable ${open ? "active" : ""}`}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 10px" }}
      >
        <Settings size={14} style={{ animation: open ? "prism-gear-spin 4s linear infinite" : "none" }} />
      </button>

      {/* Backdrop + drawer */}
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 35,
              background: "rgba(6, 4, 13, 0.55)",
              backdropFilter: "blur(8px) saturate(80%)",
              WebkitBackdropFilter: "blur(8px) saturate(80%)",
              animation: "prism-fade-in 200ms cubic-bezier(0.2,0,0,1)",
            }}
            aria-hidden="true"
          />
          <div
            className="prism-glass-premium prism-drawer-enter"
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              height: "100vh",
              width: "min(360px, calc(100vw - 32px))",
              zIndex: 36,
              display: "flex",
              flexDirection: "column",
              borderLeft: "1px solid var(--glass-line-soft)",
              borderRadius: 0,
              borderRight: "none",
              borderTop: "none",
              borderBottom: "none",
            }}
          >
            <style>{`
              @keyframes prism-gear-spin {
                to { transform: rotate(360deg); }
              }
            `}</style>

            {/* Premium drag handle at top (centered, 36×4px) */}
            <div className="prism-drag-handle" aria-hidden="true" />

            {/* Drawer header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px 14px",
                borderBottom: "1px solid var(--glass-line-soft)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Settings size={17} style={{ color: "var(--accent)" }} />
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: 1.5,
                    textTransform: "uppercase",
                    color: "var(--hud-fg)",
                  }}
                >
                  Settings
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close settings"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--hud-fg-faint)",
                  cursor: "pointer",
                  padding: 4,
                  display: "flex",
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Drawer content — scrollable */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "12px 20px",
                scrollbarWidth: "thin",
                scrollbarColor: "rgba(154,220,255,0.3) transparent",
              }}
              className="prism-settings-scroll"
            >
              {/* Performance sparkline */}
              <FpsSparkline history={state?.fpsHistory ?? []} />

              {/* Quality section */}
              <SectionHeader icon={Gauge} label="Render Quality" />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 6,
                  marginBottom: 20,
                }}
              >
                {QUALITY_TIERS.map((tier) => {
                  const active = state?.quality === tier.id;
                  const Icon = tier.icon;
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      onClick={() => app?.setQuality(tier.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "10px 12px",
                        background: active ? "var(--accent-soft)" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${active ? "var(--glass-line-strong)" : "var(--glass-line)"}`,
                        borderRadius: "var(--radius-sm)",
                        cursor: "pointer",
                        textAlign: "left",
                        color: "var(--hud-fg)",
                        fontFamily: "inherit",
                        transition: "all 140ms cubic-bezier(0.2,0,0,1)",
                        boxShadow: active ? "0 0 12px rgba(154,220,255,0.2)" : "none",
                      }}
                      onMouseEnter={(e) => {
                        if (!active)
                          (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)";
                      }}
                      onMouseLeave={(e) => {
                        if (!active)
                          (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
                      }}
                    >
                      <Icon size={15} style={{ color: active ? "var(--accent)" : "var(--hud-fg-faint)" }} />
                      <span style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{tier.label}</span>
                        <span style={{ fontSize: 10, color: "var(--hud-fg-faint)" }}>{tier.desc}</span>
                      </span>
                      {active && (
                        <Check size={13} style={{ marginLeft: "auto", color: "var(--accent)" }} />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Toggles section */}
              <SectionHeader icon={Bug} label="Diagnostics & AI" />
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                <ToggleRow
                  icon={Bug}
                  label="Debug overlay"
                  desc="FPS, gestures, draw calls"
                  active={!!state?.debugVisible}
                  onToggle={() => app?.toggleDebug()}
                />
                <ToggleRow
                  icon={Sparkles}
                  label="AI observer"
                  desc="FastVLM watches camera"
                  active={!!state?.aiEnabled}
                  onToggle={() => app?.toggleAi()}
                />
              </div>

              {/* Drive easy mode (only shown for drive preset) */}
              {state?.preset === "drive" && (
                <>
                  <SectionHeader icon={Eye} label="Drive" />
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                    <ToggleRow
                      icon={Activity}
                      label="Easy mode"
                      desc="Point-and-go autopilot"
                      active={!!state?.easyMode}
                      onToggle={() => app?.toggleEasy()}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Footer hint */}
            <div
              style={{
                padding: "12px 20px",
                borderTop: "1px solid var(--glass-line-soft)",
                fontSize: 10,
                color: "var(--hud-fg-faint)",
                letterSpacing: 0.4,
                textAlign: "center",
              }}
            >
              Press <kbd style={kbdStyle}>Esc</kbd> to close · <kbd style={kbdStyle}>D</kbd> debug ·{" "}
              <kbd style={kbdStyle}>H</kbd> help
            </div>
          </div>
        </>
      )}
    </>
  );
}

const kbdStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  color: "var(--hud-fg-dim)",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid var(--glass-line)",
  borderRadius: 4,
  padding: "1px 5px",
};

function SectionHeader({
  icon: Icon,
  label,
}: {
  icon: typeof Bug;
  label: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        marginBottom: 8,
        marginTop: 4,
      }}
    >
      <Icon size={11} style={{ color: "rgba(255, 255, 255, 0.4)" }} />
      <span
        style={{
          fontSize: 10,
          letterSpacing: 1.6,
          textTransform: "uppercase",
          color: "rgba(255, 255, 255, 0.4)",
          fontWeight: 600,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  desc,
  active,
  onToggle,
}: {
  icon: typeof Bug;
  label: string;
  desc: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="prism-pressable"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        padding: "10px 12px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid var(--glass-line)",
        borderRadius: "var(--radius-sm)",
        cursor: "pointer",
        textAlign: "left",
        color: "var(--hud-fg)",
        fontFamily: "inherit",
        transition: "background 140ms cubic-bezier(0.2,0,0,1), border-color 140ms cubic-bezier(0.2,0,0,1)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.07)";
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.16)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)";
        (e.currentTarget as HTMLElement).style.borderColor = "var(--glass-line)";
      }}
    >
      <span
        style={{
          width: 30,
          height: 30,
          flex: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          background: active ? "rgba(154,220,255,0.16)" : "rgba(255,255,255,0.05)",
          color: active ? "var(--accent)" : "var(--hud-fg-faint)",
          transition: "all 200ms cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        <Icon size={15} />
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 1, flex: 1 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 11, color: "var(--hud-fg-faint)" }}>{desc}</span>
      </span>
      {/* Premium iOS-style toggle switch (rounded pill, green when on, smooth slide) */}
      <span
        className="prism-toggle-track"
        data-on={active ? "true" : "false"}
        aria-hidden="true"
      >
        <span className="prism-toggle-knob" />
      </span>
    </button>
  );
}

/**
 * FpsSparkline — a dreamy live FPS history graph.
 * Renders the last 40 FPS samples as a smooth sparkline with a gradient
 * fill, current FPS readout, and a 60fps reference line.
 */
function FpsSparkline({ history }: { history: number[] }) {
  const W = 280;
  const H = 44;
  const samples = history.length > 1 ? history : [60, 60];
  const max = Math.max(70, ...samples);
  const min = 0;
  const range = max - min || 1;
  const step = W / Math.max(1, samples.length - 1);

  // Build the sparkline path
  const pts = samples.map((v, i) => {
    const x = i * step;
    const y = H - ((v - min) / range) * (H - 6) - 3;
    return [x, y] as const;
  });
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const fillPath = `${linePath} L${W},${H} L0,${H} Z`;
  const current = samples[samples.length - 1] ?? 0;
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const hue = current >= 50 ? "143, 245, 180" : current >= 30 ? "255, 207, 92" : "255, 154, 165";

  return (
    <div
      style={{
        marginBottom: 18,
        padding: "12px 14px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid var(--glass-line)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Activity size={12} style={{ color: `rgb(${hue})` }} />
          <span
            style={{
              fontSize: 10,
              letterSpacing: 1.6,
              textTransform: "uppercase",
              color: "var(--hud-fg-faint)",
              fontWeight: 600,
            }}
          >
            Performance
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: `rgb(${hue})`, fontVariantNumeric: "tabular-nums" }}>
            {current.toFixed(0)}
          </span>
          <span style={{ fontSize: 9, color: "var(--hud-fg-faint)", letterSpacing: 0.4 }}>fps</span>
          <span style={{ fontSize: 9, color: "var(--hud-fg-faint)", marginLeft: 8 }}>
            avg {avg.toFixed(0)}
          </span>
        </div>
      </div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
        <defs>
          <linearGradient id="prism-fps-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`rgba(${hue}, 0.4)`} />
            <stop offset="100%" stopColor={`rgba(${hue}, 0)`} />
          </linearGradient>
        </defs>
        {/* 60fps reference line */}
        {(() => {
          const y60 = H - (60 / range) * (H - 6) - 3;
          return y60 > 0 && y60 < H ? (
            <line x1={0} y1={y60} x2={W} y2={y60} stroke="rgba(255,255,255,0.08)" strokeWidth={1} strokeDasharray="3,3" />
          ) : null;
        })()}
        <path d={fillPath} fill="url(#prism-fps-fill)" />
        <path d={linePath} fill="none" stroke={`rgb(${hue})`} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        {/* Current point dot */}
        {pts.length > 0 && (
          <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.5} fill={`rgb(${hue})`}>
            <animate attributeName="r" values="2.5;4;2.5" dur="2s" repeatCount="indefinite" />
          </circle>
        )}
      </svg>
    </div>
  );
}
