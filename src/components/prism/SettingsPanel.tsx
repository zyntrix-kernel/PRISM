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
        className={open ? "active" : ""}
        style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
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
              background: "rgba(6, 4, 13, 0.45)",
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
              animation: "prism-fade-in 160ms cubic-bezier(0.2,0,0,1)",
            }}
            aria-hidden="true"
          />
          <div
            className="prism-glass"
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: "min(340px, calc(100vw - 32px))",
              zIndex: 36,
              display: "flex",
              flexDirection: "column",
              background: "var(--glass-3)",
              boxShadow: "var(--glass-glow-strong), var(--glass-highlight)",
              borderLeft: "1px solid var(--glass-line-strong)",
              borderRadius: 0,
              borderRight: "none",
              borderTop: "none",
              borderBottom: "none",
              animation: "prism-drawer-in 280ms cubic-bezier(0.34,1.56,0.64,1)",
            }}
          >
            <style>{`
              @keyframes prism-drawer-in {
                from { transform: translateX(100%); opacity: 0.4; }
                to { transform: translateX(0); opacity: 1; }
              }
              @keyframes prism-gear-spin {
                to { transform: rotate(360deg); }
              }
              @keyframes prism-toggle-knob {
                from { transform: translateX(0); }
                to { transform: translateX(20px); }
              }
            `}</style>

            {/* Drawer header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "18px 20px 14px",
                borderBottom: "1px solid var(--glass-line)",
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
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
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
                borderTop: "1px solid var(--glass-line)",
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
      }}
    >
      <Icon size={12} style={{ color: "var(--hud-fg-faint)" }} />
      <span
        style={{
          fontSize: 10,
          letterSpacing: 1.6,
          textTransform: "uppercase",
          color: "var(--hud-fg-faint)",
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
        transition: "all 140ms cubic-bezier(0.2,0,0,1)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.07)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)";
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
      {/* Toggle switch */}
      <span
        style={{
          width: 38,
          height: 22,
          flex: "none",
          borderRadius: 11,
          background: active ? "var(--accent)" : "rgba(255,255,255,0.1)",
          position: "relative",
          transition: "background 200ms cubic-bezier(0.2,0,0,1)",
          boxShadow: active ? "0 0 10px rgba(154,220,255,0.5)" : "inset 0 1px 2px rgba(0,0,0,0.3)",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: 2,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: active ? "#fff" : "var(--hud-fg-dim)",
            transform: active ? "translateX(16px)" : "translateX(0)",
            transition: "transform 200ms cubic-bezier(0.34,1.56,0.64,1), background 200ms",
            boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
          }}
        />
      </span>
    </button>
  );
}
