"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
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
  Scan,
  type LucideIcon,
} from "lucide-react";
import { PRESET_CATALOG } from "@/lib/prism/presets/catalog";
import { PRESET_ORDER } from "@/lib/prism/presets/types";

export interface CommandAction {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: (size?: number) => ReactNode;
  keywords: string;
  run: () => void;
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
    togglePresentation: () => boolean;
    toggleCamera: () => void;
  } | null;
}

const PRESET_ICONS: Record<PrismState["preset"], LucideIcon> = {
  space: Orbit,
  blocks: Boxes,
  test: CircleIcon,
  singularity: Disc,
  drive: Car,
  atom: Atom,
  voxel: Grid3x3,
  gun: Crosshair,
  supernova: Sun,
  nebula: Cloud,
};

const PRESETS = PRESET_ORDER.map((id) => ({
  id,
  label: PRESET_CATALOG[id].label,
  icon: PRESET_ICONS[id],
  blurb: PRESET_CATALOG[id].description,
}));

const QUALITIES = [
  { id: "auto", label: "Auto", desc: "Adapt to device" },
  { id: "ultra", label: "Ultra", desc: "Maximum fidelity" },
  { id: "high", label: "High", desc: "High-detail rendering" },
  { id: "medium", label: "Medium", desc: "Balanced performance" },
  { id: "low", label: "Low", desc: "Performance first" },
];

export default function CommandPalette({ onClose, state, app }: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const actions = useMemo<CommandAction[]>(() => {
    const out: CommandAction[] = [];

    for (const preset of PRESETS) {
      const Icon = preset.icon;
      out.push({
        id: "preset-" + preset.id,
        label: "Switch to " + preset.label,
        hint: preset.blurb,
        group: "Worlds",
        icon: (size) => <Icon size={size ?? 15} />,
        keywords: "world preset " + preset.id + " " + preset.label + " " + preset.blurb,
        run: () => app?.setPreset(preset.id),
        isActive: (s) => s?.preset === preset.id,
      });
    }

    for (const quality of QUALITIES) {
      out.push({
        id: "quality-" + quality.id,
        label: "Quality: " + quality.label,
        hint: quality.desc,
        group: "Render",
        icon: (size) => <Gauge size={size ?? 15} />,
        keywords: "quality render performance " + quality.id + " " + quality.label,
        run: () => app?.setQuality(quality.id),
        isActive: (s) => s?.quality === quality.id,
      });
    }

    out.push(
      {
        id: "presentation",
        label: state?.presentationMode ? "Exit presentation mode" : "Enter presentation mode",
        hint: "P · clean exhibition view",
        group: "Experience",
        icon: (size) => <Scan size={size ?? 15} />,
        keywords: "presentation presenter exhibition clean mode fullscreen focus",
        run: () => { app?.togglePresentation(); },
        isActive: (s) => !!s?.presentationMode,
      },
      {
        id: "camera",
        label: state?.cameraOn ? "Disable camera" : "Enable camera",
        hint: state?.cameraOn ? "Return to pointer input" : "Hand tracking input",
        group: "Vision",
        icon: (size) => <Camera size={size ?? 15} />,
        keywords: "camera enable vision hand tracking",
        run: () => app?.toggleCamera(),
        isActive: (s) => !!s?.cameraOn,
      },
      {
        id: "debug",
        label: "Toggle debug overlay",
        hint: "D · diagnostics",
        group: "System",
        icon: (size) => <Bug size={size ?? 15} />,
        keywords: "debug diagnostics overlay fps gpu logs",
        run: () => app?.toggleDebug(),
        isActive: (s) => !!s?.debugVisible,
      },
      {
        id: "ai",
        label: "Toggle AI observer",
        hint: "FastVLM camera observer",
        group: "Vision",
        icon: (size) => <Sparkles size={size ?? 15} />,
        keywords: "ai observer fastvlm vision",
        run: () => app?.toggleAi(),
        isActive: (s) => !!s?.aiEnabled,
      },
      {
        id: "help",
        label: "Open interaction guide",
        hint: "H · controls",
        group: "System",
        icon: (size) => <HelpCircle size={size ?? 15} />,
        keywords: "help guide interaction controls gestures",
        run: () => app?.toggleHelp(),
      },
      {
        id: "reset-view",
        label: "Reset camera view",
        hint: "R · home framing",
        group: "Camera",
        icon: (size) => <RotateCcw size={size ?? 15} />,
        keywords: "reset camera view home framing",
        run: () => {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" }));
          }
        },
      },
      {
        id: "detonate",
        label: "Detonate black hole",
        hint: "B · singularity sequence",
        group: "Cinematic",
        icon: (size) => <Zap size={size ?? 15} />,
        keywords: "detonate black hole singularity cinematic",
        run: () => {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("prism-detonate"));
          }
        },
      },
    );

    return out;
  }, [app, state?.presentationMode]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((action) => {
      return action.keywords.toLowerCase().includes(q) || action.label.toLowerCase().includes(q);
    });
  }, [actions, query]);

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((current) => (current + 1) % Math.max(1, filtered.length));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((current) => (current - 1 + Math.max(1, filtered.length)) % Math.max(1, filtered.length));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const action = filtered[active];
        if (!action) return;
        action.run();
        onClose();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, filtered, onClose]);

  useEffect(() => {
    const item = listRef.current?.querySelector<HTMLElement>('[data-idx="' + active + '"]');
    item?.scrollIntoView({ block: "nearest" });
  }, [active]);

  let flatIndex = -1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="PRISM command palette"
      className="prism-command-palette-backdrop"
      onClick={onClose}
    >
      <div
        className="prism-command-palette"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="prism-command-palette-header">
          <div className="prism-command-palette-title">
            <span>PRISM / COMMAND</span>
            <strong>Control the instrument.</strong>
          </div>
          <kbd>ESC</kbd>
        </header>

        <div className="prism-command-palette-search">
          <Search size={17} aria-hidden="true" />
          <input
            ref={inputRef}
            aria-label="Search PRISM commands"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            placeholder="Search worlds, rendering, camera, presentation…"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div ref={listRef} role="listbox" aria-label="Command results" className="prism-command-palette-results">
          {filtered.length === 0 && (
            <div className="prism-command-empty">
              <strong>No matching command</strong>
              <span>Try a world, camera, quality, or presentation search.</span>
            </div>
          )}

          {(() => {
            const grouped = new Map<string, CommandAction[]>();
            for (const action of filtered) {
              const group = grouped.get(action.group);
              if (group) group.push(action);
              else grouped.set(action.group, [action]);
            }

            return Array.from(grouped.entries()).map(([group, items]) => (
              <section key={group} className="prism-command-group">
                <div className="prism-command-group-title">{group}</div>
                {items.map((action) => {
                  flatIndex += 1;
                  const selected = flatIndex === active;
                  const activeState = action.isActive?.(state) ?? false;
                  const Icon = action.icon;

                  return (
                    <button
                      key={action.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      data-idx={flatIndex}
                      className={"prism-command-row" + (selected ? " is-selected" : "")}
                      onMouseEnter={() => setActive(flatIndex)}
                      onClick={() => {
                        action.run();
                        onClose();
                      }}
                    >
                      <span className={"prism-command-row-icon" + (activeState ? " is-active" : "")}>
                        {Icon(16)}
                      </span>
                      <span className="prism-command-row-copy">
                        <strong>{action.label}</strong>
                        {action.hint && <small>{action.hint}</small>}
                      </span>
                      {activeState && <span className="prism-command-row-state">ACTIVE</span>}
                      {selected && <CornerDownLeft size={14} className="prism-command-row-enter" aria-hidden="true" />}
                    </button>
                  );
                })}
              </section>
            ));
          })()}
        </div>

        <footer className="prism-command-palette-footer">
          <span><Hand size={12} /> Navigate <Kbd>↑</Kbd><Kbd>↓</Kbd></span>
          <span>Select <Kbd>↵</Kbd></span>
          <span>Close <Kbd>ESC</Kbd></span>
        </footer>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="prism-command-kbd">{children}</kbd>;
}
