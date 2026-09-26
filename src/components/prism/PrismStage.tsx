"use client";

import { useEffect, useRef, useState } from "react";
import { PrismApp, type PrismState } from "@/lib/prism/app";
import "@/lib/prism/prism.css";
import CommandPalette from "./CommandPalette";
import {
  Camera,
  Eye,
  Hand,
  Activity,
  HelpCircle,
  Bug,
  Sparkles,
  Cpu,
  Gauge,
  X,
  Check,
  ChevronRight,
  Command,
} from "lucide-react";

const PRESET_VISUALS: Record<
  string,
  { icon: string; hue: string; blurb: string }
> = {
  space: { icon: "🪐", hue: "154, 220, 255", blurb: "Keplerian solar system" },
  blocks: { icon: "🧱", hue: "255, 179, 217", blurb: "Voxel stacking rig" },
  test: { icon: "◌", hue: "201, 184, 255", blurb: "3-orb calibration" },
  singularity: { icon: "●", hue: "255, 214, 170", blurb: "Accretion disk + jets" },
  drive: { icon: "🏎", hue: "143, 245, 180", blurb: "Neon circuit arcade" },
  atom: { icon: "⚛", hue: "154, 220, 255", blurb: "Bohr model photon lab" },
  voxel: { icon: "▦", hue: "255, 207, 92", blurb: "Place & break blocks" },
};

export default function PrismStage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<PrismApp | null>(null);

  // Stable refs to all HUD elements (imperative engine writes to these)
  const els = useRef<Record<string, HTMLElement | null>>({});
  const setEl = (key: string) => (e: HTMLElement | null) => {
    els.current[key] = e;
  };

  const [state, setState] = useState<PrismState | null>(null);
  const [app, setApp] = useState<PrismApp | null>(null);
  const [presetOpen, setPresetOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  // Cmd/Ctrl + K opens the command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!container || !video || !overlay) return;

    const e = els.current;
    const elements = {
      container,
      video,
      overlay,
      status: e.status!,
      cameraBtn: e.cameraBtn as HTMLButtonElement,
      qualitySel: e.qualitySel as HTMLSelectElement,
      presetSel: e.presetSel as HTMLSelectElement,
      debugBtn: e.debugBtn as HTMLButtonElement,
      helpBtn: e.helpBtn as HTMLButtonElement,
      helpCard: e.helpCard!,
      helpClose: e.helpClose as HTMLButtonElement,
      debugEl: e.debug!,
      planetInfo: e.planetInfo!,
      easyBtn: e.easyBtn as HTMLButtonElement,
      aiBtn: e.aiBtn as HTMLButtonElement,
      palette: e.palette!,
      coach: e.coach!,
      rail: {
        cam: e.railCam,
        hands: e.railHands,
        gesture: e.railGesture,
        fps: e.railFps,
      },
      onboard: e.onboard!,
      onboardClose: e.onboardClose as HTMLButtonElement,
      onboardHelp: e.onboardHelp as HTMLButtonElement,
    };

    const app = new PrismApp(elements);
    appRef.current = app;
    setApp(app);
    const unsub = app.subscribe(setState);
    app.start();

    return () => {
      unsub();
      app.dispose();
      appRef.current = null;
      setApp(null);
    };
  }, []);

  const preset = state?.preset ?? "space";
  const quality = state?.quality ?? "auto";

  return (
    <div className="prism-root" ref={rootRef}>
      {/* Atmospheric layers — depth below everything */}
      <div className="prism-atmosphere" aria-hidden="true">
        <div className="prism-orb prism-orb-a" />
        <div className="prism-orb prism-orb-b" />
        <div className="prism-orb prism-orb-c" />
      </div>
      <div className="prism-grain" aria-hidden="true" />
      <div className="prism-vignette" aria-hidden="true" />

      {/* 3D scene */}
      <main
        id="prism-scene"
        className="prism-scene"
        ref={containerRef}
        aria-label="Interactive 3D scene"
      />

      {/* Mirrored webcam preview + hand skeleton overlay */}
      <video id="prism-webcam" autoPlay playsInline muted ref={videoRef} aria-label="Webcam preview for hand tracking" />
      <canvas id="prism-landmark-overlay" ref={overlayRef} />

      {/* ===== Top HUD — spatial control bar ===== */}
      <header id="prism-hud" className="prism-glass">
        <div id="prism-hud-title">
          <span className="prism-mark" aria-hidden="true" />
          PRISM <span>hand-controlled 3D lab</span>
        </div>
        <div id="prism-hud-status" ref={setEl("status")} role="status" aria-live="polite">
          Starting…
        </div>
        <div id="prism-hud-controls">
          <button
            id="prism-btn-camera"
            type="button"
            ref={setEl("cameraBtn") as React.RefObject<HTMLButtonElement>}
            aria-label="Enable camera for hand tracking"
          >
            <Camera size={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }} />
            Enable camera
          </button>

          {/* Preset picker — dreamy visual gallery */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className={presetOpen ? "active" : ""}
              onClick={() => setPresetOpen((v) => !v)}
              aria-label="Choose world preset"
              aria-expanded={presetOpen}
              style={{ display: "flex", alignItems: "center", gap: 7 }}
            >
              <span style={{ fontSize: 13 }}>{PRESET_VISUALS[preset].icon}</span>
              <span style={{ textTransform: "capitalize" }}>{preset}</span>
              <ChevronRight
                size={13}
                style={{
                  transform: presetOpen ? "rotate(90deg)" : "rotate(0deg)",
                  transition: "transform 140ms cubic-bezier(0.2,0,0,1)",
                }}
              />
            </button>
            {presetOpen && (
              <PresetGallery
                current={preset}
                onPick={(id) => {
                  app?.setPreset(id as PrismState["preset"]);
                  setPresetOpen(false);
                }}
                onClose={() => setPresetOpen(false)}
              />
            )}
          </div>

          {/* Hidden native select kept in sync for the engine's change events */}
          <select
            id="prism-sel-preset"
            ref={setEl("presetSel") as React.RefObject<HTMLSelectElement>}
            title="World preset (keys 1-7)"
            aria-label="World preset"
            style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 1, height: 1 }}
          />

          <button
            id="prism-btn-easy"
            type="button"
            ref={setEl("easyBtn") as React.RefObject<HTMLButtonElement>}
            className="hidden"
            title="Easy point-and-go mode (E)"
            aria-label="Toggle easy point-and-go driving"
          />

          {/* Quality control */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className={quality !== "auto" ? "active" : ""}
              onClick={() => setPaletteOpen((v) => !v)}
              aria-label="Render quality"
              aria-expanded={paletteOpen}
              style={{ display: "flex", alignItems: "center", gap: 7 }}
            >
              <Gauge size={13} />
              <span style={{ textTransform: "capitalize" }}>{quality}</span>
              <ChevronRight
                size={13}
                style={{
                  transform: paletteOpen ? "rotate(90deg)" : "rotate(0deg)",
                  transition: "transform 140ms cubic-bezier(0.2,0,0,1)",
                }}
              />
            </button>
            {paletteOpen && (
              <QualityMenu
                current={quality}
                onPick={(q) => {
                  app?.setQuality(q);
                  setPaletteOpen(false);
                }}
                onClose={() => setPaletteOpen(false)}
              />
            )}
          </div>
          <select
            id="prism-sel-quality"
            ref={setEl("qualitySel") as React.RefObject<HTMLSelectElement>}
            title="Render quality"
            aria-label="Render quality"
            defaultValue="auto"
            style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 1, height: 1 }}
          >
            <option value="ultra">Ultra</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="auto">Auto</option>
          </select>

          <button
            id="prism-btn-debug"
            type="button"
            ref={setEl("debugBtn") as React.RefObject<HTMLButtonElement>}
            title="Toggle debug overlay (D)"
            aria-label="Toggle debug overlay"
            className={state?.debugVisible ? "active" : ""}
          >
            <Bug size={13} style={{ display: "inline", verticalAlign: "-2px", marginRight: 5 }} />
            Debug
          </button>
          <button
            id="prism-btn-ai"
            type="button"
            ref={setEl("aiBtn") as React.RefObject<HTMLButtonElement>}
            title="AI observer: watches the camera with FastVLM (off by default)"
            aria-label="Toggle AI observer"
            className={state?.aiEnabled ? "active" : ""}
          >
            <Sparkles size={13} style={{ display: "inline", verticalAlign: "-2px", marginRight: 5 }} />
            AI
          </button>
          <button
            id="prism-btn-help"
            type="button"
            ref={setEl("helpBtn") as React.RefObject<HTMLButtonElement>}
            title="Show help (H)"
            aria-label="Show help"
          >
            <HelpCircle size={13} style={{ display: "inline", verticalAlign: "-2px" }} />
          </button>
          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            title="Command palette (Cmd+K)"
            aria-label="Open command palette"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
            }}
          >
            <Command size={13} />
            <kbd
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--hud-fg-dim)",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid var(--glass-line)",
                borderRadius: 5,
                padding: "1px 5px",
              }}
            >
              ⌘K
            </kbd>
          </button>
        </div>
      </header>

      {/* ===== Command palette (Cmd+K) — mounted fresh each open ===== */}
      {cmdOpen && (
        <CommandPalette
          onClose={() => setCmdOpen(false)}
          state={state}
          app={app}
        />
      )}

      {/* ===== Debug overlay (engine-owned innerHTML) ===== */}
      <div id="prism-debug" className="prism-glass hidden" ref={setEl("debug")} />

      {/* ===== Planet / body info ===== */}
      <div id="prism-planet-info" className="prism-glass hidden" ref={setEl("planetInfo")} />

      {/* ===== Voxel palette ===== */}
      <div id="prism-voxel-palette" className="prism-glass hidden" ref={setEl("palette")} />

      {/* ===== System rail — ambient awareness ===== */}
      <aside id="prism-sys-rail" className="prism-glass" aria-label="System status">
        <div className="prism-rail-header">System</div>
        <div className="prism-rail-item" id="prism-rail-cam" ref={setEl("railCam")}>
          <span className="dot" data-state="off" />
          <Camera size={12} className="prism-rail-icon" />
          <span className="txt">Camera off</span>
        </div>
        <div className="prism-rail-item" id="prism-rail-hands" ref={setEl("railHands")}>
          <span className="dot" data-state="off" />
          <Hand size={12} className="prism-rail-icon" />
          <span className="txt">No hands</span>
        </div>
        <div className="prism-rail-item" id="prism-rail-gesture" ref={setEl("railGesture")}>
          <span className="dot" data-state="off" />
          <Activity size={12} className="prism-rail-icon" />
          <span className="txt">—</span>
        </div>
        <div className="prism-rail-item" id="prism-rail-fps" ref={setEl("railFps")}>
          <span className="dot" data-state="on" />
          <Gauge size={12} className="prism-rail-icon" />
          <span className="txt">— fps</span>
        </div>
      </aside>

      {/* ===== Coach pill ===== */}
      <div id="prism-coach" className="prism-glass hidden" role="status" ref={setEl("coach")}>
        <span className="prism-coach-icon" aria-hidden="true" />
        <span className="prism-coach-text" />
      </div>

      {/* ===== Onboarding ===== */}
      <aside
        id="prism-onboard"
        className="prism-glass hidden"
        aria-label="Getting started"
        ref={setEl("onboard")}
      >
        <h2>First flight</h2>
        <p className="prism-onboard-sub">Three steps to lift off.</p>
        <ol>
          <li data-step="camera">
            <span className="tick">✓</span>
            <span>Enable the camera</span>
          </li>
          <li data-step="hand">
            <span className="tick">✓</span>
            <span>Show your hand</span>
          </li>
          <li data-step="grab">
            <span className="tick">✓</span>
            <span>Pinch to grab</span>
          </li>
        </ol>
        <div className="row">
          <button id="prism-btn-onboard-close" type="button" ref={setEl("onboardClose") as React.RefObject<HTMLButtonElement>}>
            Skip tour
          </button>
          <button id="prism-btn-onboard-help" type="button" ref={setEl("onboardHelp") as React.RefObject<HTMLButtonElement>}>
            Full guide
          </button>
        </div>
        <div className="celebrate hidden">Ready to explore ✓</div>
      </aside>

      {/* ===== Help card ===== */}
      <div id="prism-help" className="hidden" ref={setEl("helpCard")}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>How to interact — point + pinch</h2>
          <button
            type="button"
            onClick={() => app?.toggleHelp()}
            aria-label="Close help"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--hud-fg-dim)",
              cursor: "pointer",
              padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>
        <ul>
          <li><b>Point</b> your index finger to move the cursor. Near-misses snap to nearby bodies.</li>
          <li><b>Pinch</b> (thumb + index together) to grab the highlighted body. The ring cinches as the pinch closes — it grabs at full close.</li>
          <li><b>Move</b> while pinching to drag it, <b>release</b> to drop. Thresholds self-calibrate to your hand.</li>
          <li><b>Two-hand pinch:</b> move apart/together to zoom, twist to rotate.</li>
          <li><b>No camera?</b> Use the mouse: move to point, hold left button to grab.</li>
        </ul>
        <h2>Camera (mouse / keys)</h2>
        <ul>
          <li><b>Drag empty space</b> to orbit · <b>wheel</b> to zoom toward the cursor · <b>right-drag</b> to pan.</li>
          <li><b>Arrows</b> orbit · <b>+/-</b> zoom · <b>R</b> reset view · <b>X</b> reset world · <b>T</b> top · <b>F</b> edge · <b>V</b> overview · <b>O</b> auto-orbit · <b>H</b> this help.</li>
          <li><b>1–7</b> switch presets. <b>High</b> quality adds procedural planet textures + bloom glow.</li>
        </ul>
        <h2>Drive preset</h2>
        <ul>
          <li><b>Steer</b> with pointer left/right · <b>pinch-hold</b> = gas · release to coast · <b>Space</b> = brake.</li>
          <li><b>Easy mode</b> (button or <b>E</b>): point at the ground, <b>pinch</b> to drop a pin, <b>pinch</b> again to GO, <b>pinch</b> once more to stop.</li>
          <li>Stay inside the neon rails — the grass slows you down. Cross the start line for lap times.</li>
        </ul>
        <h2>Atom preset</h2>
        <ul>
          <li>Grab an <b>electron</b> and drop it on another shell (<b>n=1, 2, 3</b>).</li>
          <li>Dropping to a <b>lower</b> shell emits a photon flash labeled with its true wavelength (3→2 glows red at 656 nm).</li>
        </ul>
        <h2>Voxel preset</h2>
        <ul>
          <li><b>Tap</b> a pinch to place the selected block on the targeted face.</li>
          <li><b>Hold</b> the pinch to break the block (highlight reddens) — sliding off cancels. Bedrock never breaks.</li>
          <li>Pick blocks from the palette below, or press <b>Q</b>/<b>E</b> to cycle.</li>
        </ul>
        <button id="prism-btn-help-close" type="button" ref={setEl("helpClose") as React.RefObject<HTMLButtonElement>}>
          Close
        </button>
      </div>

      <style>{`
        .prism-rail-icon {
          color: var(--hud-fg-faint);
          flex: none;
        }
      `}</style>
    </div>
  );
}

/* ==========================================================================
   Preset gallery — dreamy visual picker
   ========================================================================== */

function PresetGallery({
  current,
  onPick,
  onClose,
}: {
  current: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const presets = Object.entries(PRESET_VISUALS);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 30 }}
        aria-hidden="true"
      />
      <div
        className="prism-glass"
        style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          minWidth: 320,
          padding: 12,
          borderRadius: "var(--radius-lg)",
          zIndex: 31,
          animation: "prism-fade-in 140ms cubic-bezier(0.2,0,0,1)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}
        >
          {presets.map(([id, v]) => {
            const active = id === current;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onPick(id)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 6,
                  padding: "10px 12px",
                  background: active
                    ? `rgba(${v.hue}, 0.22)`
                    : "rgba(255,255,255,0.04)",
                  border: `1px solid ${active ? `rgba(${v.hue}, 0.6)` : "var(--glass-line)"}`,
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  textAlign: "left",
                  color: "var(--hud-fg)",
                  fontFamily: "inherit",
                  transition: "all 140ms cubic-bezier(0.2,0,0,1)",
                  boxShadow: active ? `0 0 16px rgba(${v.hue}, 0.35)` : "none",
                  position: "relative",
                  overflow: "hidden",
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
                <span
                  style={{
                    fontSize: 20,
                    filter: `drop-shadow(0 0 8px rgba(${v.hue}, 0.6))`,
                  }}
                >
                  {v.icon}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    textTransform: "capitalize",
                    letterSpacing: 0.2,
                  }}
                >
                  {id}
                </span>
                <span style={{ fontSize: 11, color: "var(--hud-fg-faint)", lineHeight: 1.4 }}>
                  {v.blurb}
                </span>
                {active && (
                  <Check
                    size={14}
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      color: `rgb(${v.hue})`,
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

/* ==========================================================================
   Quality menu
   ========================================================================== */

function QualityMenu({
  current,
  onPick,
  onClose,
}: {
  current: string;
  onPick: (q: string) => void;
  onClose: () => void;
}) {
  const tiers = [
    { id: "auto", label: "Auto", desc: "Probe device + adapt", icon: Cpu },
    { id: "ultra", label: "Ultra", desc: "3× pixel + full bloom", icon: Sparkles },
    { id: "high", label: "High", desc: "2× pixel + textures", icon: Eye },
    { id: "medium", label: "Medium", desc: "Balanced default", icon: Gauge },
    { id: "low", label: "Low", desc: "Flat colors, speed", icon: Activity },
  ];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 30 }} aria-hidden="true" />
      <div
        className="prism-glass"
        style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          minWidth: 240,
          padding: 8,
          borderRadius: "var(--radius-lg)",
          zIndex: 31,
          animation: "prism-fade-in 140ms cubic-bezier(0.2,0,0,1)",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {tiers.map((t) => {
          const active = t.id === current;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onPick(t.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                background: active ? "var(--accent-soft)" : "transparent",
                border: "1px solid transparent",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                textAlign: "left",
                color: "var(--hud-fg)",
                fontFamily: "inherit",
                transition: "all 140ms cubic-bezier(0.2,0,0,1)",
              }}
              onMouseEnter={(e) => {
                if (!active)
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
              }}
              onMouseLeave={(e) => {
                if (!active)
                  (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              <Icon size={15} style={{ color: active ? "var(--accent)" : "var(--hud-fg-faint)" }} />
              <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{t.label}</span>
                <span style={{ fontSize: 11, color: "var(--hud-fg-faint)" }}>{t.desc}</span>
              </span>
              {active && <Check size={14} style={{ marginLeft: "auto", color: "var(--accent)" }} />}
            </button>
          );
        })}
      </div>
    </>
  );
}
