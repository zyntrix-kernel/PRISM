"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PrismApp, type PrismState } from "@/lib/prism/app";
import { prismScore } from "@/lib/prism/audio";
import "@/lib/prism/prism.css";
import CommandPalette from "./CommandPalette";
import PresetTransitionOverlay from "./PresetTransitionOverlay";
import InputModeIndicator from "./InputModeIndicator";
import PrismToast from "./PrismToast";
import SettingsPanel from "./SettingsPanel";
import PrismExperienceChrome from "./PrismExperienceChrome";
import PrismCinematicIntro from "./PrismCinematicIntro";
import { PRESET_CATALOG } from "@/lib/prism/presets/catalog";
import { PRESET_ORDER, type PresetId } from "@/lib/prism/presets/types";
import {
  Camera,
  Hand,
  Activity,
  HelpCircle,
  Bug,
  Sparkles,
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

const PRESET_ICONS: Record<PresetId, LucideIcon> = {
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

const PRESET_VISUALS: Record<string, { icon: LucideIcon; hue: string; blurb: string }> = Object.fromEntries(
  PRESET_ORDER.map((id) => [
    id,
    {
      icon: PRESET_ICONS[id],
      hue: PRESET_CATALOG[id].hue.replaceAll(" ", ""),
      blurb: PRESET_CATALOG[id].description,
    },
  ]),
);

/* Quality tiers rendered with the same visual language as the worlds picker. */
const QUALITY_ORDER = ["auto", "ultra", "high", "medium", "low"] as const;
const QUALITY_VISUALS: Record<string, { icon: LucideIcon; hue: string; blurb: string }> = {
  auto: { icon: Gauge, hue: "125, 211, 252", blurb: "Adaptive — trades effects for a locked frame rate" },
  ultra: { icon: Sparkles, hue: "196, 132, 252", blurb: "Everything maxed — bloom, textures, full particles" },
  high: { icon: Sun, hue: "94, 234, 212", blurb: "Procedural planet textures + bloom glow" },
  medium: { icon: Disc, hue: "250, 204, 21", blurb: "Balanced look with lighter particle fields" },
  low: { icon: Zap, hue: "148, 163, 184", blurb: "Featherweight — keeps weak GPUs realtime" },
};

/*
 * Startup phase machine:
 *   film — the "FIRST LIGHT" ZYNASH LABS cinematic owns the machine.
 *   boot — the film's final hyperflash hands off: the app mounts underneath a
 *          white veil that dissolves into the live 3D scene (HUD cascades in).
 *   live — the instrument is yours.
 * Strict single-WebGL-context policy: PrismApp is constructed only when the
 * film unmounts, so the cinematic and the engine never compete for the GPU.
 */
type StartupPhase = "film" | "boot" | "live";

export default function PrismStage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<PrismApp | null>(null);
  const [phase, setPhase] = useState<StartupPhase>("film");
  const showIntro = phase === "film";
  const dismissIntro = useCallback(() => {
    // The film ends on a white hyperflash — mount the app NOW so the veil
    // dissolves from the flash straight into the live scene, then release.
    setPhase("boot");
    window.setTimeout(() => setPhase("live"), 1150);
  }, []);

  // Stable refs to all HUD elements (imperative engine writes to these)
  const els = useRef<Record<string, HTMLElement | null>>({});
  const setEl = <T extends HTMLElement>(key: string) => (e: T | null) => {
    els.current[key] = e;
  };

  const [state, setState] = useState<PrismState | null>(null);
  const [app, setApp] = useState<PrismApp | null>(null);
  const [presetOpen, setPresetOpen] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [onboardMin, setOnboardMin] = useState(false);

  /*
   * Sound state lives in the score singleton (external store). Reading it via
   * useSyncExternalStore keeps the chip honest — and avoids setState-inside-
   * effect, which the hooks lint rule (CI) rightly rejects.
   */
  const scoreStore = prismScore();
  const sfxMuted = useSyncExternalStore(scoreStore.subscribe, () => scoreStore.isMuted, () => false);
  const sfxArmed = useSyncExternalStore(scoreStore.subscribe, () => scoreStore.unlocked, () => false);

  /*
   * App-phase audio: the film score hands the AudioContext over to the
   * instrument. The master ramp-back happens once the boot veil clears, and
   * interaction SFX attach to the state stream (preset changes, grabs,
   * camera lifecycle, toasts). A gesture listener covers late unlocks so the
   * first click in the app also awakens audio if the film played silent.
   */
  useEffect(() => {
    if (phase !== "live") return;
    const score = prismScore();
    score.restoreMaster(0.85, 0.9);

    /*
     * Boot chord: fire at +480ms when the score is already armed (the user
     * interacted during the film), otherwise HOLD it until the first gesture —
     * browsers forbid audio before that, so instead of losing the chord
     * silently we play it the moment the context comes alive.
     */
    let bootDone = score.unlocked;
    const playBoot = () => {
      if (bootDone) return;
      bootDone = true;
      window.setTimeout(() => score.sfx("boot"), 80);
    };
    if (score.unlocked) window.setTimeout(() => score.sfx("boot"), 480);

    /* Capture phase: runs BEFORE element handlers, so even the very first
     * click's SFX has a live context to speak through (bubble-phase listeners
     * fire after the target — that ordering used to swallow the first sound). */
    const unlock = () => {
      score.unlock();
      playBoot();
    };
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
  }, [phase]);

  // Preset change → world whoosh.
  const prevPresetRef = useRef<string | null>(null);
  useEffect(() => {
    if (!state) return;
    const prev = prevPresetRef.current;
    prevPresetRef.current = state.preset;
    if (prev && prev !== state.preset) prismScore().sfx("preset");
  }, [state?.preset]);

  // Grab / release ticks (pinch interaction feedback).
  const prevGrabRef = useRef<string | null>(null);
  useEffect(() => {
    if (!state) return;
    const prev = prevGrabRef.current;
    prevGrabRef.current = state.grabbedName;
    if (!prev && state.grabbedName) prismScore().sfx("grab");
    else if (prev && !state.grabbedName) prismScore().sfx("release");
  }, [state?.grabbedName]);

  // Camera lifecycle → confirmation arpeggio.
  const prevCamRef = useRef(false);
  useEffect(() => {
    if (!state) return;
    const prev = prevCamRef.current;
    prevCamRef.current = state.cameraOn;
    if (!prev && state.cameraOn) prismScore().sfx("camera");
  }, [state?.cameraOn]);

  // Toasts → soft kind-aware blips (piggybacks on the imperative hook).
  useEffect(() => {
    if (phase !== "live") return;
    const w = window as unknown as {
      __prismToast?: (t: { message: string; kind?: string }) => void;
    };
    const original = w.__prismToast;
    if (!original) return;
    w.__prismToast = (t) => {
      original(t);
      const kind = t.kind ?? "info";
      prismScore().sfx(kind === "success" ? "toast-ok" : kind === "warn" ? "toast-warn" : "toast-info");
    };
    return () => {
      w.__prismToast = original;
    };
  }, [phase, app]);

  const toggleAppSfx = useCallback(() => {
    const score = prismScore();
    score.setMuted(!score.isMuted);
  }, []);

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
    /*
     * Strict startup handoff:
     * the cinematic gets the machine first. PrismApp, Three.js world creation,
     * and MediaPipe preload begin only after the intro completes. This avoids
     * two WebGL contexts and background WASM/model work competing during the
     * first frame of the showcase.
     */
    if (showIntro) return;

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

    return () => {
      unsub();
      app.dispose();
      appRef.current = null;
      setApp(null);
    };
  }, [showIntro]);

  useEffect(() => {
    if (!showIntro && appRef.current) {
      appRef.current.start();
    }
  }, [showIntro]);

  const preset = state?.preset ?? "space";
  const quality = state?.quality ?? "auto";

  return (
    <div
      className={`prism-root${state?.presentationMode ? " is-presentation" : ""}${phase === "live" ? " prism-hud-cascade" : ""}`}
      ref={rootRef}
    >
      {/* Cinematic ZYNASH LABS startup film — plays once per load */}
      {showIntro && (
        <PrismCinematicIntro
          onComplete={dismissIntro}
          showSkip={true}
        />
      )}

      {/* Handoff veil — carries the film's final hyperflash over the mounted
          app, then dissolves so the scene feels revealed, not swapped. */}
      {phase === "boot" && <div className="prism-bootveil" aria-hidden="true" />}

      {/* Sound toggle — glass chip, lives through the whole session */}
      {phase === "live" && (
        <button
          type="button"
          id="prism-sfx-chip"
          className="prism-glass"
          onClick={toggleAppSfx}
          aria-label={sfxMuted ? "Enable sound effects" : "Mute sound effects"}
          title={
            sfxMuted
              ? "SFX muted — click to enable"
              : sfxArmed
                ? "SFX on"
                : "Sound arms on your first click — interact anywhere"
          }
          data-armed={sfxMuted || !sfxArmed ? "off" : "on"}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M2 6h2.6L8.4 2.8v10.4L4.6 10H2z" fill="currentColor" />
            {sfxMuted || !sfxArmed ? (
              <path d="M11 5.6l3.4 4.8M14.4 5.6L11 10.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
            ) : (
              <path d="M10.8 5.2a4 4 0 010 5.6M12.6 3.4a6.4 6.4 0 010 9.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
            )}
          </svg>
        </button>
      )}

      {/* School watermark — Narayana Educational Institutions. Pinned to the
          one corner no HUD surface claims (right edge, above the webcam
          frame). Translucent but readable; never intercepts pointers. */}
      {phase === "live" && (
        <img
          id="prism-watermark"
          src="/narayana-logo.webp"
          alt="Narayana Educational Institutions"
          draggable={false}
        />
      )}

      {/* Preset-switch transition overlay (dreamy radial flash on world change) */}
      <PresetTransitionOverlay key={preset} preset={preset} />

      {/* Ambient backdrop dim when a modal is open (focus management).
          NOTE: the backdrop is DISABLED — it covered the entire viewport
          and dimmed/blurred the 3D scene too, which the user reported as
          'dims everything'. The help/settings panels now handle their own
          visual focus without a full-screen overlay. */}

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
              src="/prism-logo-icon.png"
              alt="PRISM"
              className="prism-wcam-logo"
              style={{
                width: 118,
                height: "auto",
                objectFit: "contain",
                marginBottom: 2,
                opacity: 0.95,
                filter: "drop-shadow(0 0 14px rgba(125, 211, 252, 0.35))",
              }}
            />
            <span className="prism-wcam-brand">ZYNASH LABS</span>
            <span className="prism-wcam-hint">Enable camera for hand tracking</span>
          </div>
        </div>
      )}

      {/* ===== Top HUD — spatial control bar ===== */}
      <header id="prism-hud" className="prism-glass prism-glass-hover">
        <div id="prism-hud-title">
          <img
            src="/prism-logo-mark.png"
            alt=""
            aria-hidden="true"
            className="prism-mark-img"
            draggable={false}
          />
          <span className="prism-wordmark">PRISM</span>
        </div>
        <div
          id="prism-hud-status"
          ref={setEl("status")}
          role="status"
          aria-live="polite"
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <span
            className="prism-status-dot"
            aria-hidden="true"
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: state?.cameraOn
                ? "var(--ok)"
                : state?.status && /fault|unavailable/i.test(state.status)
                  ? "var(--warn)"
                  : "var(--accent)",
              boxShadow: state?.cameraOn
                ? "0 0 8px rgba(143,245,180,0.8)"
                : "0 0 8px rgba(154,220,255,0.5)",
            }}
          />
          <span className="prism-status-text">Starting…</span>
        </div>
        <div id="prism-hud-controls">
          <button
            id="prism-btn-camera"
            type="button"
            ref={setEl<HTMLButtonElement>("cameraBtn")}
            aria-label="Enable camera for hand tracking"
            className="prism-pressable"
          >
            <Camera size={14} style={{ marginRight: 6 }} />
            Enable camera
          </button>

          {/* Preset picker — dreamy visual gallery */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className={`prism-pressable ${presetOpen ? "active" : ""}`}
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
              className="prism-pressable"
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
            ref={setEl<HTMLSelectElement>("presetSel")}
            title="World preset (keys 1-7)"
            aria-label="World preset"
            style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 1, height: 1 }}
          />

          <button
            id="prism-btn-easy"
            type="button"
            ref={setEl<HTMLButtonElement>("easyBtn")}
            className="hidden"
            title="Easy point-and-go mode (E)"
            aria-label="Toggle easy point-and-go driving"
          />

          {/* Premium separator between primary actions and utility group */}
          <span className="prism-btn-sep" aria-hidden="true" />

          {/* Quality picker — same dreamy gallery as the worlds picker */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className={`prism-pressable ${qualityOpen ? "active" : ""}`}
              onClick={() => setQualityOpen((v) => !v)}
              aria-label="Render quality"
              aria-expanded={qualityOpen}
              title="Render quality"
              style={{ display: "flex", alignItems: "center", gap: 7 }}
            >
              {(() => {
                const QIcon = QUALITY_VISUALS[quality].icon;
                return (
                  <QIcon
                    size={14}
                    style={{ color: `rgb(${QUALITY_VISUALS[quality].hue})` }}
                  />
                );
              })()}
              <span style={{ textTransform: "capitalize" }}>{quality}</span>
              <ChevronRight
                size={13}
                style={{
                  transform: qualityOpen ? "rotate(90deg)" : "rotate(0deg)",
                  transition: "transform 140ms cubic-bezier(0.2,0,0,1)",
                }}
              />
            </button>
            {qualityOpen && (
              <QualityGallery
                current={quality}
                onPick={(q) => {
                  app?.setQuality(q);
                  setQualityOpen(false);
                }}
                onClose={() => setQualityOpen(false)}
              />
            )}

            {/* Hidden native select kept in sync for the engine's change events */}
            <select
              id="prism-sel-quality"
              ref={setEl<HTMLSelectElement>("qualitySel")}
              title="Render quality"
              aria-label="Render quality"
              defaultValue="auto"
              style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 1, height: 1 }}
            >
              <option value="auto">Auto</option>
              <option value="ultra">Ultra</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {/* AI toggle — directly in the top bar */}
          <button
            id="prism-btn-ai"
            type="button"
            ref={setEl<HTMLButtonElement>("aiBtn")}
            title="AI observer: watches the camera with FastVLM (off by default)"
            aria-label="Toggle AI observer"
            className={`prism-pressable ${state?.aiEnabled ? "active" : ""}`}
            style={{ padding: "7px 9px", display: "flex", alignItems: "center", gap: 5 }}
          >
            <Sparkles size={13} />
            <span style={{ fontSize: 11, fontWeight: 500 }}>AI</span>
          </button>

          {/* Debug toggle — directly in the top bar */}
          <button
            id="prism-btn-debug"
            type="button"
            ref={setEl<HTMLButtonElement>("debugBtn")}
            title="Toggle debug overlay (D)"
            aria-label="Toggle debug overlay"
            className={`prism-pressable ${state?.debugVisible ? "active" : ""}`}
            style={{ padding: "7px 9px", display: "flex", alignItems: "center", gap: 5 }}
          >
            <Bug size={13} />
          </button>

          {/* Settings gear — opens drawer with remaining settings */}
          <SettingsPanel state={state} app={app} />

          <button
            id="prism-btn-help"
            type="button"
            ref={setEl<HTMLButtonElement>("helpBtn")}
            title="Show help (H)"
            aria-label="Show help"
            className="prism-pressable"
            style={{ padding: "8px 10px" }}
          >
            <HelpCircle size={14} />
          </button>
          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            title="Command palette (Cmd+K)"
            aria-label="Open command palette"
            className="prism-pressable"
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
      {cmdOpen && !state?.presentationMode && (
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
            <button id="prism-btn-onboard-close" type="button" ref={setEl<HTMLButtonElement>("onboardClose")}>
              Dismiss
            </button>
            <button id="prism-btn-onboard-help" type="button" ref={setEl<HTMLButtonElement>("onboardHelp")}>
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
            <img src="/prism-logo-mark.png" alt="PRISM" style={{ width: 30, height: 30, objectFit: "contain" }} />
            <span className="prism-credits-brand">PRISM</span>
          </div>
          <p className="prism-credits-tagline">
            PRISM — Projected Reality Interaction &amp; Spatial Manipulation
          </p>
          <div className="prism-credits-team">
            <div className="prism-credit-row">
            <span className="prism-credit-name">Tanay Bhandari</span>
            <span className="prism-credit-handle" style={{ color: "var(--accent)" }}>Zyntrix.krnl.sys · LEAD</span>
          </div>
          <div className="prism-credit-row">
            <span className="prism-credit-name">Ashwin Nagaranjan Ramnath</span>
            <span className="prism-credit-handle">Ash Collector</span>
          </div>
          <div className="prism-credit-row">
            <span className="prism-credit-name">Debroop Mojumder</span>
            <span className="prism-credit-handle">distortus_rexx</span>
          </div>
          <div className="prism-credit-row">
            <span className="prism-credit-name">Maaz Mozzam</span>
            <span className="prism-credit-handle">Unknown</span>
          </div>
          </div>
        </div>
        <button id="prism-btn-help-close" type="button" ref={setEl<HTMLButtonElement>("helpClose")}>
          Close
        </button>
      </div>

      <style>{`
        .prism-rail-icon {
          color: var(--hud-fg-faint);
          flex: none;
        }
      `}</style>

      {phase === "live" && state?.presentationMode && (
        <div className="prism-presentation-hint" aria-live="polite">
          <span>P</span>
          <span>EXIT PRESENTATION</span>
        </div>
      )}

      {phase === "live" && <PrismExperienceChrome state={state} app={app} onCommand={() => { if (!state?.presentationMode) setCmdOpen(true); }} />}

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
        className="prism-glass prism-glass-premium prism-dropdown-enter"
        style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          minWidth: 340,
          padding: 12,
          borderRadius: "var(--radius-lg)",
          zIndex: 31,
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
                className="prism-preset-card"
                onClick={() => onPick(id)}
                style={{
                  background: active
                    ? `rgba(${v.hue}, 0.22)`
                    : undefined,
                  borderColor: active
                    ? `rgba(${v.hue}, 0.6)`
                    : undefined,
                  boxShadow: active
                    ? `0 0 16px rgba(${v.hue}, 0.35), inset 0 0.5px 0 rgba(255,255,255,0.06)`
                    : undefined,
                  // Pass the hue to the CSS accent bar via custom prop
                  "--accent-hue": `rgb(${v.hue})`,
                } as React.CSSProperties}
              >
                {/* Accent bar — preset signature color */}
                <span
                  className="prism-preset-accent-bar"
                  aria-hidden="true"
                  style={{
                    background: active
                      ? `rgb(${v.hue})`
                      : `linear-gradient(180deg, rgba(${v.hue}, 0.9), rgba(${v.hue}, 0))`,
                    opacity: active ? 1 : undefined,
                  }}
                />
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
                      filter: `drop-shadow(0 0 4px rgba(${v.hue}, 0.6))`,
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

/*
 * Quality gallery — single-column sibling of the PresetGallery. Same glass
 * panel, accent bar and active-check styling; each row reads icon → name →
 * blurb so the tradeoffs are obvious at a glance.
 */
function QualityGallery({
  current,
  onPick,
  onClose,
}: {
  current: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
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
        className="prism-glass prism-glass-premium prism-dropdown-enter"
        style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          minWidth: 292,
          padding: 10,
          borderRadius: "var(--radius-lg)",
          zIndex: 31,
        }}
      >
        <div style={{ display: "grid", gap: 6 }}>
          {QUALITY_ORDER.map((id) => {
            const v = QUALITY_VISUALS[id];
            const active = id === current;
            return (
              <button
                key={id}
                type="button"
                className="prism-preset-card prism-quality-card"
                onClick={() => onPick(id)}
                style={{
                  background: active ? `rgba(${v.hue}, 0.22)` : undefined,
                  borderColor: active ? `rgba(${v.hue}, 0.6)` : undefined,
                  boxShadow: active
                    ? `0 0 16px rgba(${v.hue}, 0.35), inset 0 0.5px 0 rgba(255,255,255,0.06)`
                    : undefined,
                  "--accent-hue": `rgb(${v.hue})`,
                } as React.CSSProperties}
              >
                <span
                  className="prism-preset-accent-bar"
                  aria-hidden="true"
                  style={{
                    background: active
                      ? `rgb(${v.hue})`
                      : `linear-gradient(180deg, rgba(${v.hue}, 0.9), rgba(${v.hue}, 0))`,
                    opacity: active ? 1 : undefined,
                  }}
                />
                {(() => {
                  const QIcon = v.icon;
                  return (
                    <QIcon
                      size={20}
                      style={{
                        color: `rgb(${v.hue})`,
                        filter: `drop-shadow(0 0 8px rgba(${v.hue}, 0.6))`,
                        flexShrink: 0,
                      }}
                    />
                  );
                })()}
                <span className="prism-quality-copy">
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
                </span>
                {active && (
                  <Check
                    size={14}
                    style={{
                      marginLeft: "auto",
                      color: `rgb(${v.hue})`,
                      filter: `drop-shadow(0 0 4px rgba(${v.hue}, 0.6))`,
                      flexShrink: 0,
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

