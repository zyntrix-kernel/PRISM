"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PrismState } from "@/lib/prism/app";
import {
  Search,
  Camera,
  Bug,
  Sparkles,
  HelpCircle,
  RotateCcw,
  Gauge,
  Hand,
  CornerDownLeft,
  Zap,
  Orbit,
  Boxes,
  Circle as CircleIcon,
  Disc,
  Car,
  Atom,
  Grid3x3,
  Crosshair,
  Sun,
  Cloud,
  type LucideIcon,
} from "lucide-react";

export interface CommandAction {
  id: string;
  label: string;
  hint?: string;
  group: string;
  /** Stable icon render function (never recreated → no row remounts). */
  icon: (size?: number) => React.ReactNode;
  keywords: string;
  run: () => void;
  /** Render-time active check against live state. */
  isActive?: (s: PrismState | null) => boolean;
}

interface Props {
  onClose: () => void;
  state: PrismState | null;
  app: {
    setPreset: (id: PrismState["preset"]) => void;
    setQuality: (q: string) => void;
    toggleDebug: () => void;
    toggleAi: () => void;
    toggleHelp: () => void;
    enableCamera: () => void;
  } | null;
}

const PRESETS: Array<{ id: PrismState["preset"]; label: string; icon: LucideIcon; blurb: string }> = [
  { id: "space", label: "Space", icon: Orbit, blurb: "Keplerian solar system" },
  { id: "blocks", label: "Blocks", icon: Boxes, blurb: "Voxel stacking rig" },
  { id: "test", label: "Test", icon: CircleIcon, blurb: "3-orb calibration" },
  { id: "singularity", label: "Black hole", icon: Disc, blurb: "Accretion disk + jets" },
  { id: "drive", label: "Drive", icon: Car, blurb: "Neon circuit arcade" },
  { id: "atom", label: "Atom", icon: Atom, blurb: "Bohr model photon lab" },
  { id: "voxel", label: "Voxel", icon: Grid3x3, blurb: "Place & break blocks" },
  { id: "gun", label: "Gun game", icon: Crosshair, blurb: "Target shooting range" },
  { id: "supernova", label: "Supernova", icon: Sun, blurb: "Stellar explosion" },
  { id: "nebula", label: "Nebula", icon: Cloud, blurb: "Living gas cloud" },
];

const QUALITIES = [
  { id: "auto", label: "Auto", desc: "Adapt to device" },
  { id: "ultra", label: "Ultra", desc: "Max fidelity" },
  { id: "high", label: "High", desc: "Textures + bloom" },
  { id: "medium", label: "Medium", desc: "Balanced" },
  { id: "low", label: "Low", desc: "Speed" },
];

export default function CommandPalette({ onClose, state, app }: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Actions are rebuilt only when `app` changes (once: null → instance on
  // mount). `isActive` reads live state at render time via the passed arg,
  // so state ticks never churn this array. No refs needed.
  const actions = useMemo<CommandAction[]>(() => {
    const out: CommandAction[] = [];
    for (const p of PRESETS) {
      const PIcon = p.icon;
      out.push({
        id: `preset-${p.id}`,
        label: `Switch to ${p.label}`,
        hint: p.blurb,
        group: "Worlds",
        icon: (s) => <PIcon size={s ?? 15} />,
        keywords: `preset world ${p.id} ${p.label}`,
        run: () => app?.setPreset(p.id),
        isActive: (s) => s?.preset === p.id,
      });
    }
    for (const q of QUALITIES) {
      out.push({
        id: `quality-${q.id}`,
        label: `Quality: ${q.label}`,
        hint: q.desc,
        group: "Render",
        icon: (s) => <Gauge size={s ?? 15} />,
        keywords: `quality tier render ${q.id} ${q.label}`,
        run: () => app?.setQuality(q.id),
        isActive: (s) => s?.quality === q.id,
      });
    }
    out.push({
      id: "camera",
      label: "Enable camera",
      hint: "For hand tracking",
      group: "Vision",
      icon: (s) => <Camera size={s ?? 15} />,
      keywords: "camera enable vision hand tracking",
      run: () => app?.enableCamera(),
      isActive: (s) => !!s?.cameraOn,
    });
    out.push({
      id: "debug",
      label: "Toggle debug overlay",
      hint: "D · diagnostics",
      group: "Toggles",
      icon: (s) => <Bug size={s ?? 15} />,
      keywords: "debug overlay diagnostics toggle",
      run: () => app?.toggleDebug(),
      isActive: (s) => !!s?.debugVisible,
    });
    out.push({
      id: "ai",
      label: "Toggle AI observer",
      hint: "FastVLM watches camera",
      group: "Toggles",
      icon: (s) => <Sparkles size={s ?? 15} />,
      keywords: "ai observer fastvlm vision toggle",
      run: () => app?.toggleAi(),
      isActive: (s) => !!s?.aiEnabled,
    });
    out.push({
      id: "help",
      label: "Show help guide",
      hint: "H · all controls",
      group: "Toggles",
      icon: (s) => <HelpCircle size={s ?? 15} />,
      keywords: "help guide controls",
      run: () => app?.toggleHelp(),
    });
    out.push({
      id: "reset-view",
      label: "Reset camera view",
      hint: "R · back to default",
      group: "Camera",
      icon: (s) => <RotateCcw size={s ?? 15} />,
      keywords: "reset view camera home",
      run: () => {
        if (typeof window !== "undefined") window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" }));
      },
    });
    out.push({
      id: "detonate",
      label: "Detonate black hole",
      hint: "B · cinematic sequence",
      group: "Cinematic",
      icon: (s) => <Zap size={s ?? 15} />,
      keywords: "detonate explode blackhole singularity cinematic boom",
      run: () => {
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("prism-detonate"));
      },
    });
    return out;
  }, [app]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) => a.keywords.toLowerCase().includes(q) || a.label.toLowerCase().includes(q));
  }, [actions, query]);

  const groups = useMemo(() => {
    const m = new Map<string, CommandAction[]>();
    for (const a of filtered) {
      if (!m.has(a.group)) m.set(a.group, []);
      m.get(a.group)!.push(a);
    }
    return Array.from(m.entries());
  }, [filtered]);

  // Focus search on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keyboard navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (i + 1) % Math.max(1, filtered.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i - 1 + filtered.length) % Math.max(1, filtered.length));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const a = filtered[active];
        if (a) {
          a.run();
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, active, onClose]);

  // Scroll active into view.
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  let flatIdx = -1;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh",
        background: "rgba(6, 4, 13, 0.55)",
        backdropFilter: "blur(6px)",
        animation: "prism-fade-in 160ms cubic-bezier(0.2,0,0,1)",
      }}
      onClick={onClose}
    >
      <div
        className="prism-glass"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, calc(100vw - 32px))",
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: "var(--radius-xl)",
          background: "var(--glass-3)",
          boxShadow: "var(--glass-glow-strong), var(--glass-highlight)",
          overflow: "hidden",
          animation: "prism-help-in 200ms cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        {/* Search header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 18px",
            borderBottom: "1px solid var(--glass-line)",
          }}
        >
          <Search size={18} style={{ color: "var(--accent)", flex: "none" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Search actions, presets, settings…"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--hud-fg)",
              fontFamily: "inherit",
              fontSize: 15,
            }}
          />
          <kbd
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--hud-fg-faint)",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid var(--glass-line)",
              borderRadius: 6,
              padding: "2px 7px",
              flex: "none",
            }}
          >
            esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ overflowY: "auto", padding: 8, flex: 1 }}>
          {groups.length === 0 && (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--hud-fg-faint)", fontSize: 13 }}>
              No actions match “{query}”.
            </div>
          )}
          {groups.map(([group, items]) => (
            <div key={group} style={{ marginBottom: 6 }}>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: 1.8,
                  textTransform: "uppercase",
                  color: "var(--hud-fg-faint)",
                  padding: "8px 10px 4px",
                  fontWeight: 600,
                }}
              >
                {group}
              </div>
              {items.map((a) => {
                flatIdx += 1;
                const isActive = flatIdx === active;
                const isOn = a.isActive?.(state) ?? false;
                return (
                  <button
                    key={a.id}
                    data-idx={flatIdx}
                    type="button"
                    onMouseEnter={() => setActive(flatIdx)}
                    onClick={() => {
                      a.run();
                      onClose();
                    }}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "9px 12px",
                      background: isActive ? "var(--accent-soft)" : "transparent",
                      border: "1px solid transparent",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                      textAlign: "left",
                      color: "var(--hud-fg)",
                      fontFamily: "inherit",
                      transition: "all 120ms cubic-bezier(0.2,0,0,1)",
                      boxShadow: isActive ? "inset 0 0 0 1px var(--glass-line-strong)" : "none",
                    }}
                  >
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        flex: "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 8,
                        background: isOn ? "rgba(154,220,255,0.18)" : "rgba(255,255,255,0.05)",
                        color: isOn ? "var(--accent)" : "var(--hud-fg-dim)",
                      }}
                    >
                      {a.icon(15)}
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 1, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 500 }}>{a.label}</span>
                      {a.hint && <span style={{ fontSize: 11, color: "var(--hud-fg-faint)" }}>{a.hint}</span>}
                    </span>
                    {isOn && (
                      <span
                        style={{
                          fontSize: 10,
                          letterSpacing: 0.8,
                          textTransform: "uppercase",
                          color: "var(--ok)",
                          fontWeight: 700,
                          flex: "none",
                        }}
                      >
                        Active
                      </span>
                    )}
                    {isActive && <CornerDownLeft size={14} style={{ color: "var(--accent)", flex: "none" }} />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 16px",
            borderTop: "1px solid var(--glass-line)",
            fontSize: 11,
            color: "var(--hud-fg-faint)",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Hand size={12} />
            <span>Press</span>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            <span>to navigate</span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span>select</span>
            <Kbd>↵</Kbd>
          </span>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        color: "var(--hud-fg-dim)",
        background: "rgba(255,255,255,0.06)",
        border: "1px solid var(--glass-line)",
        borderRadius: 5,
        padding: "1px 6px",
        minWidth: 18,
        textAlign: "center",
        display: "inline-block",
      }}
    >
      {children}
    </kbd>
  );
}
