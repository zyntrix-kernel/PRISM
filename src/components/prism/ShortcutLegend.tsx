"use client";

import { useEffect, useState } from "react";
import { Command, X } from "lucide-react";

interface Props {
  onPickPreset?: (n: number) => void;
}

const SHORTCUTS = [
  { group: "Worlds", keys: [{ k: "1-7", label: "Switch presets" }] },
  {
    group: "Camera",
    keys: [
      { k: "R", label: "Reset view" },
      { k: "X", label: "Reset world" },
      { k: "T", label: "Top view" },
      { k: "F", label: "Edge view" },
      { k: "V", label: "Overview" },
      { k: "O", label: "Auto-orbit" },
      { k: "+/-", label: "Zoom" },
      { k: "←↑↓→", label: "Orbit" },
    ],
  },
  {
    group: "Toggles",
    keys: [
      { k: "D", label: "Debug overlay" },
      { k: "H", label: "Help" },
      { k: "E", label: "Easy drive mode" },
      { k: "⌘K", label: "Command palette" },
    ],
  },
  {
    group: "Drive",
    keys: [{ k: "Space", label: "Brake" }],
  },
];

export default function ShortcutLegend({ onPickPreset }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {/* Trigger chip — subtle, sits at bottom-left above the rail */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Keyboard shortcuts"
        aria-expanded={open}
        title="Keyboard shortcuts"
        style={{
          position: "absolute",
          left: 14,
          bottom: 14,
          zIndex: 12,
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "7px 13px 7px 11px",
          background: "var(--glass-2)",
          backdropFilter: "blur(22px) saturate(160%)",
          WebkitBackdropFilter: "blur(22px) saturate(160%)",
          border: "1px solid var(--glass-line)",
          borderRadius: "var(--radius-pill)",
          boxShadow: "var(--glass-highlight), var(--glass-glow)",
          color: "var(--hud-fg-dim)",
          fontFamily: "inherit",
          fontSize: 11,
          letterSpacing: 0.6,
          cursor: "pointer",
          transition: "all 140ms cubic-bezier(0.2,0,0,1)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "rgba(154,220,255,0.16)";
          (e.currentTarget as HTMLElement).style.color = "var(--hud-fg)";
          (e.currentTarget as HTMLElement).style.borderColor = "var(--glass-line-strong)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "var(--glass-2)";
          (e.currentTarget as HTMLElement).style.color = "var(--hud-fg-dim)";
          (e.currentTarget as HTMLElement).style.borderColor = "var(--glass-line)";
        }}
      >
        <Command size={15} style={{ color: "var(--accent)", flex: "none" }} />
        <span style={{ fontWeight: 500, whiteSpace: "nowrap", flex: "none" }}>
          Shortcuts
        </span>
      </button>

      {/* Expanded legend panel */}
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 18 }}
            aria-hidden="true"
          />
          <div
            className="prism-glass"
            style={{
              position: "absolute",
              left: 14,
              bottom: 56,
              zIndex: 19,
              width: 280,
              maxHeight: "calc(100vh - 120px)",
              overflowY: "auto",
              padding: 16,
              borderRadius: "var(--radius-lg)",
              background: "var(--glass-3)",
              boxShadow: "var(--glass-glow-strong), var(--glass-highlight)",
              animation: "prism-help-in 200ms cubic-bezier(0.34,1.56,0.64,1)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                  letterSpacing: 1.8,
                  textTransform: "uppercase",
                  color: "var(--accent)",
                  fontWeight: 700,
                }}
              >
                <Command size={13} />
                Shortcuts
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close shortcuts"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--hud-fg-faint)",
                  cursor: "pointer",
                  padding: 2,
                  display: "flex",
                }}
              >
                <X size={15} />
              </button>
            </div>

            {SHORTCUTS.map((section) => (
              <div key={section.group} style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: 9,
                    letterSpacing: 1.6,
                    textTransform: "uppercase",
                    color: "var(--hud-fg-faint)",
                    fontWeight: 600,
                    marginBottom: 6,
                  }}
                >
                  {section.group}
                </div>
                {section.keys.map((item) => (
                  <div
                    key={item.k}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "5px 0",
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 12, color: "var(--hud-fg-dim)" }}>{item.label}</span>
                    <kbd
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--hud-fg)",
                        background: "rgba(154,220,255,0.1)",
                        border: "1px solid var(--glass-line)",
                        borderRadius: 5,
                        padding: "2px 7px",
                        minWidth: 28,
                        textAlign: "center",
                        fontWeight: 600,
                        boxShadow: "inset 0 -1px 0 rgba(0,0,0,0.3)",
                      }}
                    >
                      {item.k}
                    </kbd>
                  </div>
                ))}
              </div>
            ))}

            {/* Quick preset number buttons */}
            <div
              style={{
                marginTop: 8,
                paddingTop: 12,
                borderTop: "1px solid var(--glass-line)",
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: 1.6,
                  textTransform: "uppercase",
                  color: "var(--hud-fg-faint)",
                  fontWeight: 600,
                  marginBottom: 8,
                }}
              >
                Jump to preset
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
                {[
                  { n: 1, label: "Space" },
                  { n: 2, label: "Blocks" },
                  { n: 3, label: "Test" },
                  { n: 4, label: "Hole" },
                  { n: 5, label: "Drive" },
                  { n: 6, label: "Atom" },
                  { n: 7, label: "Voxel" },
                ].map((p) => (
                  <button
                    key={p.n}
                    type="button"
                    onClick={() => onPickPreset?.(p.n)}
                    title={p.label}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 2,
                      padding: "6px 2px",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid var(--glass-line)",
                      borderRadius: 7,
                      color: "var(--hud-fg-dim)",
                      fontFamily: "inherit",
                      fontSize: 10,
                      cursor: "pointer",
                      transition: "all 120ms cubic-bezier(0.2,0,0,1)",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "rgba(154,220,255,0.16)";
                      (e.currentTarget as HTMLElement).style.color = "var(--accent)";
                      (e.currentTarget as HTMLElement).style.borderColor = "var(--glass-line-strong)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
                      (e.currentTarget as HTMLElement).style.color = "var(--hud-fg-dim)";
                      (e.currentTarget as HTMLElement).style.borderColor = "var(--glass-line)";
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--accent)",
                      }}
                    >
                      {p.n}
                    </span>
                    <span style={{ fontSize: 8, letterSpacing: 0.3 }}>{p.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
