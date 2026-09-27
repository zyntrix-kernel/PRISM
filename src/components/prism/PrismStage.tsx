"use client";

import { useEffect, useRef, useState } from "react";
import { PrismApp, type PrismState } from "@/lib/prism/app";
import "@/lib/prism/prism.css";
import CommandPalette from "./CommandPalette";
import ShortcutLegend from "./ShortcutLegend";
import PresetTransitionOverlay from "./PresetTransitionOverlay";
import InputModeIndicator from "./InputModeIndicator";
import PrismToast from "./PrismToast";
import SettingsPanel from "./SettingsPanel";
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
  ChevronDown,
  Command,
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

const PRESET_VISUALS: Record<
  string,
  { icon: LucideIcon; hue: string; blurb: string }
> = {
  space: { icon: Orbit, hue: "154, 220, 255", blurb: "Keplerian solar system" },
  blocks: { icon: Boxes, hue: "255, 179, 217", blurb: "Voxel stacking rig" },
  test: { icon: CircleIcon, hue: "201, 184, 255", blurb: "3-orb calibration" },
  singularity: { icon: Disc, hue: "255, 214, 170", blurb: "Accretion disk + jets" },
  drive: { icon: Car, hue: "143, 245, 180", blurb: "Neon circuit arcade" },
  atom: { icon: Atom, hue: "154, 220, 255", blurb: "Bohr model photon lab" },
  voxel: { icon: Grid3x3, hue: "255, 207, 92", blurb: "Place & break blocks" },
  gun: { icon: Crosshair, hue: "125, 211, 252", blurb: "Target shooting range" },
  supernova: { icon: Sun, hue: "255, 170, 68", blurb: "Stellar explosion" },
  nebula: { icon: Cloud, hue: "165, 180, 252", blurb: "Living gas cloud" },
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
  const [onboardMin, setOnboardMin] = useState(false);

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

  // Track whether any modal is open → dim the 3D scene for focus.
  // cmdOpen is local state; settings/help are checked via DOM query.
  const [modalOpen, setModalOpen] = useState(false);
  useEffect(() => {
    const check = () => {
      const helpOpen = !document.querySelector("#prism-help")?.classList.contains("hidden");
      const settingsOpen = !!document.querySelector('[aria-label="Settings"]')?.getAttribute("aria-expanded") === "true";
      setModalOpen(cmdOpen || helpOpen || settingsOpen);
    };
    check();
    const interval = setInterval(check, 200);
    return () => clearInterval(interval);
  }, [cmdOpen]);

  return (
    <div className="prism-root" ref={rootRef}>
      {/* Preset-switch transition overlay (dreamy radial flash on world change) */}
      <PresetTransitionOverlay key={preset} preset={preset} />

      {/* Ambient backdrop dim when a modal is open (focus management).
          pointer-events: ALWAYS none — the backdrop must never block clicks
          to the HUD behind it. It's purely visual. */}
      <div
        className="prism-modal-backdrop"
        aria-hidden="true"
        style={{
          opacity: modalOpen ? 1 : 0,
          pointerEvents: "none",
        }}
      />

      {/* Toast notifications (action feedback) */}
      <PrismToast />

      {/* Atmospheric layers — depth below everything.
          NOTE: prism-grain and prism-vignette CSS overlays were REMOVED.
          Film grain + vignette are now handled GPU-side by the post-processing
          pipeline (animated, resolution-aware, in scene.ts). The old CSS
          versions were STATIC and sat on top of the canvas as a frozen noise
          texture + dark gradient — they were the "static thing covering the
          whole three.js" the user reported. */}
      <div className="prism-atmosphere" aria-hidden="true">
        <div className="prism-orb prism-orb-a" />
        <div className="prism-orb prism-orb-b" />
        <div className="prism-orb prism-orb-c" />
      </div>

      {/* ParallaxDepthLayer REMOVED — it was a CSS/DOM 2D starfield that sat
          behind the canvas (z-index 2 < canvas z-index 3). On presets with a
          transparent canvas (background: 'nebula' → scene.background = null),
          the CSS stars showed THROUGH the canvas as a frozen 2D layer that
          doesn't move with the 3D camera — the "static thing covering the
          whole three.js". The 3D scene now has its own GPU-twinkling
          starfield (scene.ts STAR_VERTEX/STAR_FRAGMENT shader) that lives in
          real 3D space and moves correctly with the camera. */}

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

      {/* Webcam off-state placeholder — shows ZYNASH LABS logo, hides when live */}
      {!state?.cameraOn && (
        <div id="prism-webcam-frame" aria-hidden="true">
          <div className="prism-webcam-placeholder">
            <img
              src="/zynash-logo.png"
              alt="ZYNASH LABS"
              className="prism-wcam-logo"
              style={{
                width: 72,
                height: 72,
                objectFit: "contain",
                marginBottom: 4,
                opacity: 0.9,
                filter: "drop-shadow(0 0 12px rgba(125, 211, 252, 0.3))",
              }}
            />
            <span className="prism-wcam-brand">ZYNASH LABS</span>
            <span className="prism-wcam-hint">Enable camera for hand tracking</span>
          </div>
        </div>
      )}

      {/* ===== Top HUD — spatial control bar ===== */}
      <header id="prism-hud" className="prism-glass">
        <div id="prism-hud-title">
          <span className="prism-mark" aria-hidden="true" />
          PRISM
        </div>
        <div
          id="prism-hud-status"
          ref={setEl("status")}
          role="status"
          aria-live="polite"
          style={{ display: "flex", alignItems: "center", gap: 7 }}
        >
          <span
            className="prism-status-dot"
            aria-hidden="true"
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              flex: "none",
              background: state?.cameraOn
                ? "var(--ok)"
                : state?.status && /fault|unavailable/i.test(state.status)
                  ? "var(--warn)"
                  : "var(--accent)",
              boxShadow: state?.cameraOn
                ? "0 0 8px rgba(143,245,180,0.8)"
                : "0 0 8px rgba(154,220,255,0.5)",
              transition: "all 200ms cubic-bezier(0.2,0,0,1)",
            }}
          />
          <span className="prism-status-text">Starting…</span>
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
              {(() => {
                const PIcon = PRESET_VISUALS[preset].icon;
                return (
                  <PIcon
                    size={14}
                    style={{ color: `rgb(${PRESET_VISUALS[preset].hue})` }}
                  />
                );
              })()}
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

          {/* Detonate button — only visible in the singularity preset.
              Triggers the cinematic blackhole detonation sequence. */}
          {preset === "singularity" && (
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("prism-detonate"));
                window.__prismToast?.({
                  message: "Singularity destabilizing…",
                  kind: "warn",
                });
              }}
              title="Trigger the cinematic detonation (B)"
              aria-label="Detonate black hole"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "linear-gradient(135deg, rgba(255,154,165,0.2), rgba(255,207,92,0.16))",
                borderColor: "rgba(255,154,165,0.5)",
                animation: "prism-invite-pulse 2.5s ease-in-out infinite",
              }}
            >
              <Zap size={13} style={{ color: "var(--pink-deep)" }} />
              <span style={{ fontWeight: 700, letterSpacing: 0.5 }}>Detonate</span>
            </button>
          )}

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

          {/* Settings gear — opens drawer with Debug/AI/Quality/Easy */}
          <SettingsPanel state={state} app={app} />

          {/* Hidden native engine buttons (kept for keyboard-shortcut compat) */}
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
            style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 1, height: 1 }}
          >
            Debug
          </button>
          <button
            id="prism-btn-ai"
            type="button"
            ref={setEl("aiBtn") as React.RefObject<HTMLButtonElement>}
            title="AI observer: watches the camera with FastVLM (off by default)"
            aria-label="Toggle AI observer"
            className={state?.aiEnabled ? "active" : ""}
            style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 1, height: 1 }}
          >
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

      {/* ===== Live input-mode + gesture indicator (morphing instrument) ===== */}
      <InputModeIndicator state={state} />

      {/* ===== Onboarding ===== */}
      <aside
        id="prism-onboard"
        className="prism-glass hidden"
        aria-label="Getting started"
        ref={setEl("onboard")}
      >
        <div className="prism-onboard-header">
          <h2>Getting started</h2>
          <button
            type="button"
            className="prism-onboard-min"
            onClick={() => setOnboardMin((v) => !v)}
            aria-label={onboardMin ? "Expand onboarding" : "Minimize onboarding"}
            aria-expanded={!onboardMin}
            title={onboardMin ? "Expand" : "Minimize"}
          >
            <ChevronDown
              size={15}
              style={{
                transform: onboardMin ? "rotate(-90deg)" : "rotate(0deg)",
                transition: "transform 200ms cubic-bezier(0.2,0,0,1)",
              }}
            />
          </button>
        </div>
        {!onboardMin && (
          <>
            <p className="prism-onboard-sub">Complete these to get started.</p>
            <ol>
              <li data-step="camera">
                <span className="tick" />
                <span>Enable the camera</span>
              </li>
              <li data-step="hand">
                <span className="tick" />
                <span>Show your hand</span>
              </li>
              <li data-step="grab">
                <span className="tick" />
                <span>Pinch to grab</span>
              </li>
            </ol>
          </>
        )}
        {/* Dreamy progress bar — fills as onboarding steps complete */}
        <div className="prism-onboard-progress" aria-hidden="true">
          <div
            className="prism-onboard-progress-fill"
            style={{
              width: `${(state?.onboardSteps
                ? (Number(state.onboardSteps.camera) + Number(state.onboardSteps.hand) + Number(state.onboardSteps.grab)) / 3 * 100
                : 0)}%`,
            }}
          />
        </div>
        {!onboardMin && (
          <div className="row">
            <button id="prism-btn-onboard-close" type="button" ref={setEl("onboardClose") as React.RefObject<HTMLButtonElement>}>
              Dismiss
            </button>
            <button id="prism-btn-onboard-help" type="button" ref={setEl("onboardHelp") as React.RefObject<HTMLButtonElement>}>
              View guide
            </button>
          </div>
        )}
        <div className="celebrate hidden">Setup complete</div>
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
        {/* Credits */}
        <div className="prism-credits">
          <div className="prism-credits-logo">
            <img src="/zynash-logo.png" alt="ZYNASH LABS" style={{ width: 28, height: 28, objectFit: "contain" }} />
            <span className="prism-credits-brand">ZYNASH LABS</span>
          </div>
          <p className="prism-credits-tagline">
            PRISM — Projected Reality Interaction &amp; Spatial Manipulation
          </p>
          <div className="prism-credits-team">
            <div className="prism-credit-row">
              <span className="prism-credit-name">Tanay Bhandari</span>
              <span className="prism-credit-handle">Zyntrix.krnl.sys</span>
            </div>
            <div className="prism-credit-row">
              <span className="prism-credit-name">Ashwin Nagaranjan Ramnath</span>
              <span className="prism-credit-handle">Ash Collector</span>
            </div>
          </div>
        </div>
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

      {/* Keyboard shortcut legend (bottom-left chip) */}
      <ShortcutLegend
        onPickPreset={(n) => {
          // Preset keys 1-7 map to PRESET_ORDER indices
          if (n >= 1 && n <= 7) {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: String(n) }));
          }
        }}
      />
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
                {(() => {
                  const GIcon = v.icon;
                  return (
                    <GIcon
                      size={22}
                      style={{
                        color: `rgb(${v.hue})`,
                        filter: `drop-shadow(0 0 8px rgba(${v.hue}, 0.6))`,
                      }}
                    />
                  );
                })()}
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
