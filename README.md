# PRISM

### Projected Reality Interaction & Spatial Manipulation

A hand-controlled 3D science lab built with Next.js 16, Three.js, and MediaPipe.
Point with your finger, pinch to grab, drag planets into the sun, drop electrons
into the nucleus, race a neon circuit, and detonate a black hole — all without
touching the mouse.

> Built by **ZYNASH LABS** — Tanay Bhandari & Ashwin Nagaranjan Ramnath.

---

## ✨ What is this?

PRISM is a browser-native, hand-tracked 3D sandbox. Ten fully-interactive
"worlds" (presets) cover astronomy, quantum physics, creative play, and arcade
shooting — each driven by real shaders, real physics, and real gesture input.
No controllers, no headset, no install. Just a webcam and a browser.

The hand-tracking is fully **offline-capable**: the MediaPipe wasm + model
ship in `public/`, so the app works without an internet connection after the
first load. There's a CDN fallback if the local vendor step was skipped.

### Highlights

- 🖐️ **Two-hand tracking** via MediaPipe Tasks Vision (pinch to grab, two-hand
  zoom + twist gestures, adaptive pointer smoothing that retunes itself to your
  camera's tracking rate)
- 🌌 **10 procedural worlds** — solar system, black hole, supernova, atom,
  nebula, voxel builder, block stacker, neon drive circuit, target range, and a
  calibration rig
- 🎬 **Cinematic post-processing** — UnrealBloom, chromatic aberration, vignette,
  ACES filmic tone mapping (high/ultra tiers)
- ✨ **Custom GLSL everywhere** — Perlin noise 3D, curl noise, blackbody
  temperature-to-RGB, Fresnel rim glow, gravitational lensing, Doppler beaming
- 🎯 **Real interaction design** — drag a planet into the sun and it vaporizes;
  ram an electron into the nucleus and it detonates; pull a probe inside the
  photon ring and the whole galaxy explodes
- 🤖 **Optional AI observer** — FastVLM-0.5B runs in a Web Worker via
  Transformers.js + WebGPU to narrate the scene (off by default, opt-in)
- 📱 **Quality-tiered** — auto-detects device capability and degrades
  gracefully. Premium shaders run on medium+; a flat-color fallback exists for
  truly low-end devices, and an FPS governor downgrades the tier if the frame
  rate actually drops

---

## 🚀 Quick start

```bash
# install
bun install

# run the dev server (port 3000)
bun run dev

# lint
bun run lint
```

Open `http://localhost:3000` and **allow camera access** when prompted.
Point your index finger at the screen to control the cursor. Pinch
(thumb + index) to grab. Move both hands apart/together to zoom. Twist to
rotate the world.

> **No camera?** Mouse + trackpad work too. Click-drag to orbit, scroll to
> zoom, arrow keys to orbit, `R` to reset the view.

---

## 🌍 The 10 worlds

Press `1`–`0` (or use the preset dropdown / command palette `⌘K`) to switch.

| # | Preset | What it is |
|---|--------|------------|
| 1 | **Space** | A Keplerian solar system. Procedural sun shader (Perlin granulation + chromosphere + CME + anamorphic lens flare), Saturn rings with the Cassini Division, Earth day/night with city lights, twinkling stellar-class starfield, asteroid belt, comet with particle tail, and a distant black hole on the edge of the sky. Drag a planet into the sun and watch it vaporize. |
| 2 | **Blocks** | Voxel stacking puzzle. Drop blocks from the palette; they tumble with simple gravity. |
| 3 | **Test** | 3-orb calibration rig — verify tracking, pinch, and hover before diving into other worlds. |
| 4 | **Singularity** | A close-up black hole with **Doppler beaming** (one side of the disk brighter), **gravitational lensing** (the disk wraps over the top of the hole — Interstellar-style), a sharp Einstein/photon ring, relativistic jets, and a 5-act cinematic detonation sequence that ends with the galaxy exploding. Press `B` or drag a probe inside the photon ring. |
| 5 | **Drive** | Neon racing circuit. Pilot a car around the track; brake with `Space`. Easy mode (`E`) for beginners. |
| 6 | **Atom** | A Bohr model with Fibonacci-distributed nucleons, golden-angle shell orientations, **electron ribbon trails**, a **probability density cloud**, and **photon emission beams** colored by the true wavelength (E = 13.6·(1/n² − 1/m²) eV → λ = 1240/E nm). Ram an electron into the nucleus for a core-breach detonation. |
| 7 | **Voxel** | Place and break blocks Minecraft-style. |
| 8 | **Gun** | First-person target shooting range. 3D pistol model, muzzle flash, crosshair, score + combo counter. |
| 9 | **Supernova** | A red supergiant with Perlin noise 3D surface turbulence and phase-dependent blackbody colors (2800K stable → 13000K during collapse). 4-phase explosion: stable → destabilizing → exploding → aftermath, with volumetric shockwaves and 800 particles of debris. |
| 10 | **Nebula** | A volumetric procedural nebula driven by GPU curl noise. 3000 particles flow organically, color-shifting from blue core to magenta/pink edges. Soft additive-blended circular sprites. |

---

## 🎮 Controls

### Hands
- **Point** (index finger) — move the 3D cursor
- **Pinch** (thumb + index) — grab the body under the cursor
- **Two hands apart / together** — zoom the world
- **Two-hand twist** — rotate the world
- **Open palm** — release

### Keyboard

| Key | Action |
|-----|--------|
| `1`–`0` | Switch presets |
| `R` | Reset camera view |
| `X` | Reset world |
| `T` / `F` / `V` | Top / Edge / Overview camera |
| `O` | Toggle auto-orbit |
| `+` / `−` | Zoom in / out |
| `← ↑ ↓ →` | Orbit |
| `D` | Debug overlay (FPS, draw calls, triangles, tracking rate) |
| `H` | Help menu |
| `E` | Easy drive mode (Drive preset) |
| `B` | Detonate (Singularity preset) |
| `Space` | Brake (Drive preset) |
| `⌘K` | Command palette (fuzzy search all actions) |
| `Esc` | Close any open panel |

### Mouse / trackpad
- **Click-drag** — orbit
- **Scroll** — zoom
- **Click** — grab (where supported)

---

## 🏗️ Architecture

```
src/
├── app/                          # Next.js 16 App Router
│   └── page.tsx                  # Mounts <PrismStage />
│
├── components/prism/            # React shell (DOM/HUD)
│   ├── PrismStage.tsx            # Mounts the engine, renders all HUD
│   ├── CommandPalette.tsx        # ⌘K fuzzy-search actions
│   ├── SettingsPanel.tsx         # Drawer: FPS sparkline, quality tiers, toggles
│   ├── ShortcutLegend.tsx        # Keyboard shortcut legend + preset grid
│   ├── PresetTransitionOverlay.tsx # Cinematic radial flash on world change
│   ├── InputModeIndicator.tsx    # Live gesture/mode indicator (breathing)
│   └── PrismToast.tsx            # Toast notification system
│
└── lib/prism/                   # Three.js engine (imperative, framework-agnostic)
    ├── app.ts                    # PrismApp: mount/dispose/subscribe, wires HUD ↔ scene
    ├── scene.ts                  # PrismScene: renderer, camera rig (damped), composer, starfield
    ├── interaction.ts            # Raycast, grab/drag, gesture dispatch
    ├── pointer.ts                # Adaptive pointer filter (1€-like, retunes to camera fps)
    ├── gestures.ts               # Pinch detection, two-hand zoom/twist
    ├── tracking.ts               # MediaPipe HandLandmarker wrapper
    ├── camera.ts                 # Orbit/pan/zoom input → rig deltas
    ├── smoothing.ts              # Exponential + OneEuro smoothing helpers
    ├── highlight.ts              # Hover/grab emissive boost + pinch ring
    ├── perf.ts                   # FPS governor (auto-downgrades quality)
    ├── device.ts                 # Device + GPU classification → quality tier
    ├── config.ts                 # All tunable constants (pinch thresholds, bloom, etc.)
    ├── textures.ts               # Procedural planet textures (value noise, FBM, gas-giant bands)
    ├── coach.ts                  # Coach hints overlay
    ├── debug.ts                  # Debug overlay (FPS, draw calls, triangles)
    ├── prism.css                 # Apple-HIG design system (pure black, SF Pro, glass)
    │
    ├── presets/                  # The 10 worlds (each implements WorldAPI)
    │   ├── types.ts              #   WorldAPI + BuilderCtx contracts
    │   ├── solar.ts              #   1. Space — solar system
    │   ├── blocks.ts             #   2. Block game
    │   ├── test.ts               #   3. Test rig
    │   ├── singularity.ts        #   4. Black hole + detonation
    │   ├── drive.ts              #   5. Neon drive
    │   ├── atom.ts               #   6. Atom (Bohr model)
    │   ├── voxel.ts              #   7. Voxel builder
    │   ├── gun.ts                #   8. Gun game
    │   ├── supernova.ts          #   9. Supernova
    │   ├── nebula.ts             #   10. Nebula
    │   ├── blackhole.ts          #   Reusable black hole builder (used by space + singularity)
    │   ├── galaxy.ts             #   Spiral galaxy generator (singularity finale)
    │   ├── orbits.ts             #   OrbitSystem + asteroid belt
    │   ├── particles.ts           #   ParticlePool (debris, bursts)
    │   ├── labels.ts              #   Sprite text labels
    │   ├── fresnel.ts            #   Fresnel rim glow shader (cookieMonsterDev)
    │   └── noise_glsl.ts         #   Perlin/curl/fbm GLSL (ggwzrd/threejs-galaxy)
    │
    └── ai/                       # Optional AI observer
        ├── observer.ts           # FastVLM-0.5B scene narration (Web Worker)
        └── ai-worker.ts          # Transformers.js + WebGPU worker
```

### Design philosophy

**Imperative engine + React shell.** The Three.js scene is a class
(`PrismScene`) that owns its own render loop, input, and disposal. React
mounts it once via a ref and renders the HUD around it. This keeps the 3D
work off the React reconciler — 90+ FPS with no re-renders on gesture input.

**WorldAPI contract.** Every preset implements the same interface
(`grabbables`, `update(dt, elapsed)`, `setOrbitFromPoint`, `bodyInfo`,
`dispose`). The interaction controller, camera rig, and HUD don't know
which preset is loaded — they just talk to `WorldAPI`.

**Quality tiers, not feature gates.** The device detector picks a starting
tier (low/medium/high/ultra) based on cores + memory + GPU class. Premium
shaders run on medium+. An FPS governor downgrades the tier if the frame
rate actually drops. Initial visual quality wins over conservative gating.

---

## 🎨 Design system

PRISM follows an **Apple HIG-inspired** design language (without Apple branding):

| Token | Value | Use |
|-------|-------|-----|
| Background | `#000000` pure black | App background |
| Foreground | `#f5f5f7` | Primary text |
| Accent | `#0a84ff` Apple system blue | Active states, focus |
| Glass surface | `rgba(28,28,30,0.72)` + `blur(20px) saturate(180%)` | HUD panels |
| Typography | SF Pro stack, 13px body, `-0.1px` tracking, 500/600 weights | All UI |
| Spacing | 4pt grid (4, 8, 12, 16, 20, 28) | Layout |
| Motion | `cubic-bezier(0.25, 0.1, 0.25, 1)` default, `cubic-bezier(0.34, 1.56, 0.64, 1)` spring | Transitions |
| Buttons | Borderless filled `rgba(255,255,255,0.08)`, `scale(0.96)` on press | Interactive |

All tokens are CSS variables in `prism.css` — theme once, applies everywhere.

---

## ⚙️ Quality tiers

| Tier | Pixel ratio | Star count | Bloom | Post-processing | Shaders |
|------|-------------|------------|-------|------------------|---------|
| **Ultra** | 1.75 | 1500 | ✅ | CA + vignette | All custom GLSL, max detail |
| **High** | 1.5 | 1000 | ✅ | CA + vignette | All custom GLSL |
| **Medium** | 1.25 | 600 | ❌ | — | All custom GLSL (soft-gate) |
| **Low** | 1.0 | 400 | ❌ | — | Flat-color fallback |

The tier is picked at startup from `navigator.hardwareConcurrency`,
`navigator.deviceMemory`, GPU class (via `WEBGL_debug_renderer_info`), and
mobile UA. Override with `?quality=ultra|high|medium|low` in the URL, or
change it live in the Settings drawer (`gear` icon).

---

## 🧪 Shaders & physics

A non-exhaustive list of the "Three.js insanity" under the hood:

- **Blackbody temperature-to-RGB** (`temp_to_color`) — physically-accurate
  disk/star coloring by temperature (40000K → 3000K). Ported from
  [vlwkaos/threejs-blackhole](https://github.com/vlwkaos/threejs-blackhole) (ISC).
- **Perlin noise 3D** (`cnoise`) + **curl noise** (`curl_noise`) + **fbm** —
  organic turbulence everywhere (sun granulation, nebula flow, star surface,
  disk streaks). Ported from [ggwzrd/threejs-galaxy](https://github.com/ggwzrd/threejs-galaxy) (MIT).
- **Fresnel rim glow** — atmospheric edge effect on planets/sun. Ported from
  [cookieMonsterDev/solar-system-threejs](https://github.com/cookieMonsterDev/solar-system-threejs) (MIT).
- **Gravitational lensing** — a distortion shell that bends background stars
  around the event horizon, with a bright Einstein ring at the photon sphere.
- **Doppler beaming** — the black hole accretion disk's approaching side is
  1.6× brighter and blue-shifted; the receding side is dimmed and red-shifted.
- **Keplerian orbits** — inner bodies lap outer bodies (ω ∝ 1/r^1.5), with
  pointer-based orbit re-assignment.
- **Photon emission physics** — electron shell drops compute the true
  wavelength (E = 13.6·(1/n² − 1/m²) eV → λ = 1240/E nm) and emit a beam
  colored by the CIE wavelength-to-RGB approximation.
- **Cinematic camera sequences** — the singularity detonation runs a 5-act
  camera script (push-in → violent shake → extreme pull-back → galaxy reveal
  → explosion) using smoothstep easing + exponential damping.

See [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md) for full attributions.

---

## 🤖 AI observer (optional)

PRISM ships an optional AI scene narrator: **FastVLM-0.5B** runs in a Web
Worker via [Transformers.js](https://huggingface.co/docs/transformers.js) +
WebGPU. Every 3 seconds it captures a frame and generates a short caption
describing what's happening in the scene.

- **Off by default** — enable with the AI button in the HUD or `?ai=1` in the URL
- Runs entirely in the browser — no API calls, no data leaves the device
- Requires WebGPU support (Chrome 113+, Edge 113+)

---

## 🔧 Configuration

All tunable constants live in [`src/lib/prism/config.ts`](./src/lib/prism/config.ts):

- **Tracking** — MediaPipe model URLs, numHands, confidence thresholds
- **Gestures** — pinch enter/exit thresholds (normalized by hand size),
  debounce frames + ms, extended-finger ratio
- **Interaction** — adaptive pointer filter params, grab smoothing, zoom/rotate
  sensitivity, hover radius, coast time after tracking loss
- **Camera rig** — orbit/pan/zoom speeds, min/max distance, auto-orbit speed
- **Bloom** — strength, radius, threshold
- **AI** — model ID, interval, frame size, max tokens
- **Quality** — pixel ratios per tier

URL query params:
- `?preset=space|blocks|test|singularity|drive|atom|voxel|gun|supernova|nebula`
- `?quality=ultra|high|medium|low`
- `?ai=1` — enable the AI observer on load

---

## 📦 Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 (strict) |
| 3D engine | Three.js 0.186 |
| Hand tracking | @mediapipe/tasks-vision 1.0.1 |
| AI | @huggingface/transformers 4.3 (FastVLM-0.5B-ONNX) |
| Styling | Tailwind CSS 4 + custom Apple-HIG design system |
| UI primitives | shadcn/ui (New York) + Lucide icons |
| State | Zustand 5 |
| Package manager | Bun |

---

## 📄 License

This project's source code is released under the MIT License (see `LICENSE`
if present, otherwise treat as MIT).

Third-party shader code retains its original licenses — see
[`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md) for full attributions:

- [threejs-blackhole](https://github.com/vlwkaos/threejs-blackhole) (ISC) — blackbody `temp_to_color`
- [threejs-galaxy](https://github.com/ggwzrd/threejs-galaxy) (MIT) — Perlin/curl noise, fbm
- [solar-system-threejs](https://github.com/sanderblue/solar-system-threejs) (Apache 2.0) — multi-light setup
- [three-nebula](https://github.com/creativelifeform/three-nebula) (MIT) — GPU particle concepts
- [solar-system-threejs](https://github.com/cookieMonsterDev/solar-system-threejs) (MIT) — Fresnel rim glow
- [atom-animation](https://github.com/matt765/atom-animation) — Fibonacci nucleon distribution, golden-angle shells

---

## 👥 Credits

**ZYNASH LABS**

- **Tanay Bhandari**
- **Ashwin Nagaranjan Ramnath**

---

## 🛠️ Development

```bash
bun install      # install deps
bun run dev      # start dev server on :3000
bun run lint     # ESLint
```

There's no test suite (by design — the project is a visual/experiential demo,
not a library). The dev server hot-reloads on file changes.

### Mini services

WebSocket / socket.io services (if added) live in `mini-services/` — each is a
standalone Bun project with its own port + `package.json`, started with
`bun run dev` in the background.

---

## ❓ Troubleshooting

**Camera not detected?**
Make sure you're on `https://` or `localhost`. Browsers block camera access on
plain `http://` except for localhost. Grant permission when prompted. If you
denied it, click the camera icon in your browser's address bar and re-grant.

**Hand tracking laggy?**
Try `?quality=low` — premium shaders are disabled, freeing GPU budget for the
MediaPipe inference loop. Also ensure good lighting (the model needs to see
your hand clearly).

**Black screen?**
The 3D scene needs WebGL. Check `chrome://gpu` — if WebGL is software-only
(SwiftShader/llvmpipe), it'll still work but slowly. PRISM auto-detects this
and picks the `low` tier, but you can override with `?quality=high` if your
device is actually capable.

**Detonation won't trigger?**
In the Singularity preset, drag a probe inside the photon ring and **hold** for
0.5 seconds, or just press `B`.

---

<p align="center">
  <strong>PRISM</strong> · Projected Reality Interaction & Spatial Manipulation<br>
  <sub>Built with Next.js 16 · Three.js · MediaPipe · by ZYNASH LABS</sub>
</p>
