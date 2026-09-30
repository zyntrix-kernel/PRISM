"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Atom, Camera, ChevronDown, CircleDot, Cloud, Command, Disc, Grid3X3,
  Hand, HelpCircle, Info, Orbit, Sparkles, Target, Boxes, Car, Sun, X, Zap, ScanLine,
} from "lucide-react";
import type { PrismApp, PrismState } from "@/lib/prism/app";
import type { PresetId } from "@/lib/prism/presets/types";
import { PRESET_CATALOG } from "@/lib/prism/presets/catalog";

type Props = { state: PrismState | null; app: PrismApp | null; onCommand: () => void; };
type PresetMeta = { icon: LucideIcon; hue: string; label: string; description: string; science: string; };

const PRESET_ICONS: Record<PresetId, LucideIcon> = {
  space: Orbit,
  blocks: Boxes,
  test: CircleDot,
  singularity: Disc,
  drive: Car,
  atom: Atom,
  voxel: Grid3X3,
  gun: Target,
  supernova: Sun,
  nebula: Cloud,
};

const PRESETS: Record<PresetId, PresetMeta> = (Object.keys(PRESET_CATALOG) as PresetId[]).reduce(
  (acc, id) => {
    acc[id] = { ...PRESET_CATALOG[id], icon: PRESET_ICONS[id] };
    return acc;
  },
  {} as Record<PresetId, PresetMeta>,
);

const PRESET_ORDER = Object.keys(PRESETS) as PresetId[];

function Sparkline({ values }: { values: number[] }) {
  const points = useMemo(() => {
    const slice = values.slice(-32);
    if (slice.length < 2) return "";
    const min = Math.max(0, Math.min(...slice) - 5);
    const max = Math.max(60, Math.max(...slice) + 5);
    const range = Math.max(1, max - min);
    return slice.map((value, i) => {
      const x = (i / (slice.length - 1)) * 100;
      const y = 100 - ((value - min) / range) * 82 - 9;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(" ");
  }, [values]);

  return (
    <svg className="prism-command-sparkline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="prism-spark-fill" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="rgba(125,211,252,.30)" />
        <stop offset="100%" stopColor="rgba(125,211,252,0)" />
      </linearGradient></defs>
      {points && <><polyline className="prism-command-sparkline-fill" points={`0,100 ${points} 100,100`} /><polyline className="prism-command-sparkline-line" points={points} /></>}
    </svg>
  );
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "warn" }) {
  return <div className="prism-command-stat"><span>{label}</span><strong className={`prism-command-stat--${tone}`}>{value}</strong></div>;
}

export default function PrismExperienceChrome({ state, app, onCommand }: Props) {
  const [presetOpen, setPresetOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const presetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!presetOpen) return;
    const close = (event: PointerEvent) => { if (!presetRef.current?.contains(event.target as Node)) setPresetOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setPresetOpen(false); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [presetOpen]);

  useEffect(() => {
    if (!helpOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setHelpOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [helpOpen]);

  const preset = state?.preset ?? "space";
  const meta = PRESETS[preset];
  const Icon = meta.icon;
  const fps = state?.fpsHistory.at(-1) ?? 0;
  const fpsTone = fps && fps < 30 ? "warn" : "good";
  const hands = state?.rail.hands?.trim() || "No hands";
  const gesture = state?.rail.gesture?.trim() || "Mouse";
  const inputMode = state?.inputMode?.toUpperCase() || "POINTER";
  const status = state?.cameraStarting ? "CALIBRATING" : state?.status?.split("—")[0]?.trim() || "READY";
  const focus = state?.coach?.trim() || (state?.cameraOn ? "Point to explore · pinch to interact" : "Move to point · hold to grab");

  return (
    <>
      <section className="prism-command-chrome" aria-label="PRISM control surface" data-preset={preset} style={{ "--world-color": `rgb(${meta.hue})` } as CSSProperties}>
        <div className="prism-command-top">
          <div className="prism-command-brand">
            <div className="prism-command-mark" aria-hidden="true"><span /></div>
            <div className="prism-command-brand-copy"><strong>PRISM</strong><span>ZYNASH LABS · PROJECT 001</span></div>
          </div>

          <div className="prism-command-status" aria-live="polite">
            <span className={`prism-command-status-dot ${state?.cameraOn ? "is-live" : state?.cameraStarting ? "is-warn" : ""}`} />
            <div><strong>{status}</strong><span>REALTIME SPATIAL INTERFACE</span></div>
          </div>

          <div className="prism-command-actions">
            <button type="button" className={`prism-command-button ${state?.cameraOn ? "is-active" : ""}`} onClick={() => app?.toggleCamera()} disabled={!app || state?.cameraStarting} aria-busy={state?.cameraStarting ?? false} aria-pressed={state?.cameraOn ?? false} aria-label={state?.cameraOn ? "Disable camera" : "Enable camera"} title={state?.cameraOn ? "Disable camera" : "Enable camera"}>
              <Camera size={14} /><span>{state?.cameraOn ? "LIVE" : "CAMERA"}</span>
            </button>

            <div className="prism-command-preset-wrap" ref={presetRef}>
              <button type="button" className={`prism-command-button ${presetOpen ? "is-open" : ""}`} onClick={() => setPresetOpen((v) => !v)} aria-expanded={presetOpen}>
                <Icon size={14} style={{ color: `rgb(${meta.hue})` }} /><span>{meta.label}</span><ChevronDown size={12} />
              </button>
              {presetOpen && (
                <div className="prism-command-preset-popover">
                  <header><div><span>WORLD CATALOG</span><strong>Select an experiment</strong></div><b>{String(PRESET_ORDER.length).padStart(2, "0")}</b></header>
                  <div className="prism-command-preset-grid">
                    {PRESET_ORDER.map((id) => {
                      const item = PRESETS[id];
                      const ItemIcon = item.icon;
                      return (
                        <button key={id} type="button" className={`prism-command-preset-item ${id === preset ? "is-active" : ""}`} onClick={() => { app?.setPreset(id); setPresetOpen(false); }}>
                          <span className="prism-command-preset-icon" style={{ "--preset-color": `rgb(${item.hue})` } as CSSProperties}><ItemIcon size={16} /></span>
                          <span className="prism-command-preset-copy"><strong>{item.label}</strong><small>{item.description}</small></span>
                          <small className="prism-command-preset-science">{item.science}</small>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <label className="prism-command-quality">
              <span>QUALITY</span>
              <select value={state?.quality ?? "auto"} onChange={(e) => app?.setQuality(e.target.value)} aria-label="Render quality">
                <option value="auto">AUTO</option><option value="ultra">ULTRA</option><option value="high">HIGH</option><option value="medium">MEDIUM</option><option value="low">LOW</option>
              </select>
            </label>

            <button type="button" className={`prism-command-button ${state?.aiEnabled ? "is-active" : ""}`} onClick={() => app?.toggleAi()} aria-pressed={state?.aiEnabled ?? false} aria-label={state?.aiEnabled ? "Disable AI observer" : "Enable AI observer"} title="Toggle AI observer">
              <Sparkles size={14} /><span>AI</span>
            </button>
            <button
              type="button"
              className={`prism-command-button prism-command-presentation ${state?.presentationMode ? "is-active" : ""}`}
              onClick={() => app?.togglePresentation()}
              aria-pressed={state?.presentationMode ?? false}
              aria-label={state?.presentationMode ? "Exit presentation mode" : "Enter presentation mode"}
              title={state?.presentationMode ? "Exit presentation mode · P" : "Enter presentation mode · P"}
            >
              <ScanLine size={14} /><span>PRESENT</span>
            </button>
            <button type="button" className="prism-command-button prism-command-button--utility" onClick={onCommand} title="Open command palette"><Command size={14} /><span>COMMAND</span></button>
            <button type="button" className="prism-command-help" onClick={() => setHelpOpen(true)} aria-label="Open interaction guide"><HelpCircle size={15} /></button>
          </div>
        </div>

        <div className="prism-command-world-strip">
          <span>WORLD / {String(PRESET_ORDER.indexOf(preset) + 1).padStart(2, "0")}</span><i /><strong>{meta.label.toUpperCase()}</strong><span>{meta.description.toUpperCase()}</span><em>{meta.science.toUpperCase()}</em>
        </div>
      </section>

      <aside className="prism-command-left" aria-label="Interaction telemetry">
        <header><span>SYSTEM</span><span>01</span></header>
        <div className="prism-command-stats">
          <Stat label="CAMERA" value={state?.cameraOn ? "LIVE" : "MOUSE"} tone={state?.cameraOn ? "good" : "neutral"} />
          <Stat label="INPUT" value={inputMode} tone={state?.inputMode === "hand" ? "good" : "neutral"} />
          <Stat label="HANDS" value={hands.toUpperCase()} tone={state?.cameraOn && hands !== "No hands" ? "good" : "neutral"} />
          <Stat label="GESTURE" value={gesture.toUpperCase()} />
          <Stat label="PINCH" value={String(state?.pinchPercent ?? 0) + "%"} tone={(state?.pinchPercent ?? 0) > 75 ? "good" : "neutral"} />
        </div>
        <div className="prism-command-divider" />
        <div className="prism-command-mini"><span>MODE</span><strong>{state?.cameraOn ? "OPTICAL" : "DIRECT"}</strong></div>
        <div className="prism-command-mini"><span>FOCUS</span><strong>{state?.focusedName?.toUpperCase() || "NONE"}</strong></div>
        <div className="prism-command-mini"><span>WORLD</span><strong>{state?.twoHandActive ? "TWO-HAND" : "SINGLE"}</strong></div>
      </aside>

      {state?.planetInfo && (
        <aside className="prism-command-inspection" aria-live="polite" aria-label="Focused object">
          <header><span>FOCUS OBJECT</span><span>LOCKED</span></header>
          <div className="prism-command-inspection-marker" aria-hidden="true"><span /></div>
          <p>{state.planetInfo}</p>
          <div className="prism-command-inspection-state">
            <span>{state.grabbedName ? "HELD" : "HOVER"}</span>
            <strong>{state.twoHandActive ? "TWO-HAND CONTROL" : String(state.pinchPercent ?? 0) + "% PINCH"}</strong>
          </div>
        </aside>
      )}

      <aside className="prism-command-right" aria-label="Performance telemetry">
        <header><span>TELEMETRY</span><span>02</span></header>
        <div className="prism-command-fps">
          <div><span>FRAME RATE</span><strong>{fps ? fps.toFixed(0) : "--"}<small> FPS</small></strong></div>
          <b className={`prism-command-fps-badge prism-command-fps-badge--${fpsTone}`}>{fpsTone === "good" ? "STABLE" : "GUARD"}</b>
        </div>
        <div className="prism-command-sensor-line">
          <span>{state?.cameraResolution ? "SENSOR " + state.cameraResolution : "SENSOR OFF"}</span>
          <span>{state?.visionErrors ? "ERR " + state.visionErrors : "PIPELINE NOMINAL"}</span>
        </div>
        <Sparkline values={state?.fpsHistory ?? []} />
        <div className="prism-command-telemetry-grid">
          <div><span>TRACK</span><strong>{state?.cameraOn ? "MEDIAPIPE" : "POINTER"}</strong></div>
          <div><span>AI</span><strong>{state?.aiEnabled ? "ON" : "OFF"}</strong></div>
          <div><span>GRAB</span><strong>{state?.grabbedName ? "ACTIVE" : "READY"}</strong></div>
          <div><span>ENGINE</span><strong>THREE.JS</strong></div>
        </div>
      </aside>

      <div className="prism-command-focus" aria-live="polite">
        <div className="prism-command-focus-orb" aria-hidden="true"><span /></div>
        <div className="prism-command-focus-copy"><span><Hand size={10} /> {state?.cameraOn ? "OPTICAL INPUT" : "POINTER INPUT"}</span><strong>{focus}</strong></div>
        <button type="button" onClick={onCommand} title="Open command palette">⌘K</button>
      </div>

      <footer className="prism-command-footer">
        <span className="prism-command-footer-brand">ZYNASH LABS</span><i /><span>PROJECTED REALITY / SPATIAL MANIPULATION</span><b>R RESET · X REBUILD · O ORBIT · ⌘K COMMAND</b>
        <button type="button" onClick={() => setHelpOpen(true)}><Info size={12} /><span>INTERACTION MAP</span></button>
      </footer>

      {helpOpen && (
        <div className="prism-command-help-overlay" role="dialog" aria-modal="true" aria-label="PRISM interaction guide">
          <div className="prism-command-help-scrim" onClick={() => setHelpOpen(false)} />
          <section className="prism-command-help-card">
            <header><div><span>PRISM / INTERACTION MAP</span><h2>Operate the spatial instrument.</h2></div><button type="button" onClick={() => setHelpOpen(false)} aria-label="Close guide"><X size={16} /></button></header>
            <div className="prism-command-help-grid">
              <article><span>01</span><Hand size={17} /><h3>Point + pinch</h3><p>Point with your index finger. Pinch to grab the highlighted body and release to place it.</p></article>
              <article><span>02</span><Orbit size={17} /><h3>Two hands</h3><p>Use two hands to scale and rotate the active world with continuous spatial control.</p></article>
              <article><span>03</span><CircleDot size={17} /><h3>Mouse fallback</h3><p>Move to point, hold to grab, drag to orbit, wheel to zoom, and right-drag to pan.</p></article>
              <article><span>04</span><Zap size={17} /><h3>World controls</h3><p>Switch experiments above. R resets the view, X rebuilds the world, P enters the clean presentation view, and number keys change presets.</p></article>
            </div>
            <footer><span>ESC</span> CLOSE <span>⌘K</span> COMMAND PALETTE <span>H</span> GUIDE</footer>
          </section>
        </div>
      )}
    </>
  );
}
