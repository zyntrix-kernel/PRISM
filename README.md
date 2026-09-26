# PRISM — Projected Reality Interaction & Spatial Manipulation

**ZYNASH LABS** · web-first, hand-controlled 3D scientific visualization.

Pipeline: `Camera → MediaPipe HandLandmarker → landmarks → gesture engine →
interaction controller → Three.js scene → WebGL`.

## Quick start

Requirements: Node.js 18+ and a modern browser (Chrome/Edge recommended).

```bash
npm install
npm run dev      # → http://localhost:5173
```

Open the page, allow camera access, and point your index finger to move the
cursor. Pinch (thumb + index) to grab the highlighted sphere, move to drag,
release to drop.

No camera? The mouse works as a fallback: move to point, hold left button
to grab.

## Running on another PC

Copy the project folder **without** `node_modules`, then on the new machine
(Node.js 18+ required, internet needed once):

```bash
npm install
npm run dev
```

For exhibitions (no Node needed at runtime, just Chrome), build once here
and carry only `dist/`:

```bash
npm run build
# copy dist/ to the expo machine and serve it statically, e.g.:
npx serve dist
```

## USB offline stick

`npm run package:usb` vendors the hand-tracking runtime (MediaPipe wasm +
model, ~41 MB, rebuilt from npm + model hub — never committed) and builds:

```bash
npm run package:usb
# copy dist/* + portable/Start-PRISM.* to the stick as G:\PRISM\
```

On any Windows PC, double-click **`Start-PRISM.bat`** — a tiny local server
starts (no install, no admin rights) and opens the app on localhost, so the
camera works. What's offline: everything except the optional AI observer
(FastVLM weights download once from Hugging Face when first enabled, then
cache in that browser).

## Devices & quality

Quality defaults to **Auto**: PRISM probes the device (mobile, CPU/RAM,
GPU) and picks High/Medium/Low, then an FPS governor steps down further if
the frame rate sags. An explicit `?quality=` or the dropdown always wins.
Touch screens get two-finger pinch-zoom, larger controls, and a compact HUD.

## Scripts

| Command       | Purpose                                  |
|---------------|------------------------------------------|
| `npm run dev` | Local dev server with hot reload        |
| `npm test`    | Unit tests (gesture engine, smoothing)  |
| `npm run build` | Type-check + portable production build (`dist/`) |
| `npm run preview` | Serve the production build locally  |

## Interaction map

- **Point** (index extended) → virtual cursor + hover highlight (One Euro adaptive smoothing: steady at rest, lag-free in motion)
- **Pinch** (thumb–index, hysteresis + frame debounce + self-calibrating thresholds) → grab / drag / release; progress ring cinches as the pinch closes
- **Grab assist** → near-misses within a small screen radius snap to the body
- **Two-hand pinch** → hands apart/together zooms, twisting rotates the world (baseline re-captured on every entry — no scale jumps)
- **Mouse** → full fallback (move = point, hold = grab, drag empty space = orbit camera)
- **Camera** → drag empty space to orbit, wheel to zoom toward cursor, right-drag to pan; arrows orbit, `+`/`-` zoom, `R` reset view, `T` top, `F` edge, `V` overview, `O` auto-orbit
- **Drive preset** → pointer steers, analog pinch = gas pedal, release to coast, Space = brake; Easy mode (button or `E`): point + pinch drops a pin, pinch again sends the car, pinch once more stops it
- **Presets** → keys `1`–`7` or the dropdown: Space / Block game / Test / Black hole / Drive / Atom / Voxel
- **Voxel preset** → tap pinch = place block, hold pinch = break (sliding off cancels); palette buttons or `Q`/`E` pick blocks
- **AI observer** (off by default) → FastVLM-0.5B watches the camera in a Web Worker and reports `{intent, target, confidence}` into the debug overlay; enable with the AI button or `?ai=1`. Readout only — it never drives anything.
- **Drive preset** → pointer steers, pinch-hold = gas, open palm / Space = brake; Easy mode (button or `E`): point + pinch drops a pin, pinch again sends the car, pinch once more stops it

## Worlds (presets)

| Preset | Content |
|--------|---------|
| Space | Keplerian solar system (drag planets, year follows T² ∝ r³), moon, comet, asteroid belt, distant black hole, nebula |
| Block game | Voxel stacking on a baseplate with grid snap |
| Test | Original 3-orb calibration rig |
| Black hole | Close-up hole with accretion disk, jets, debris + 3 grabbable survey probes |
| Drive | Arcade car on a neon circuit: pinch = gas, palm/Space = brake, easy point-and-go autopilot, lap timer, tire smoke |
| Atom | Interactive Bohr model: drag electrons between shells, drops emit true-wavelength photon flashes |
| Voxel | Minecraft-like builder (original textures): tap pinch = place, hold = break, 6-block palette, chunked terrain |

**Quality tiers:** High adds procedural planet textures (100% original, generated in-browser — no downloads, no licenses) + bloom glow; Medium/Low use flat colors for speed.

## Project layout

```text
src/
├── main.ts          # bootstrap + decoupled render/tracking loop
├── config.ts        # all tunable constants
├── camera.ts        # webcam acquisition + friendly errors
├── tracking.ts      # MediaPipe HandLandmarker wrapper + landmark overlay
├── gestures.ts      # geometric gesture recognition (tested)
├── gestures.test.ts # unit tests with synthetic landmarks
├── smoothing.ts     # exponential + One Euro adaptive filters (tested)
├── smoothing.test.ts
├── textures.ts      # procedural planet/glow/nebula textures (no downloads)
├── interaction.ts   # raycast select, grab/drag, two-hand, camera rig input
├── scene.ts         # renderer, camera rig, bloom, cursor, preset loader
├── ai/              # FastVLM-0.5B observer (worker + manager, tested)
│   ├── ai-worker.ts     # WebGPU inference off the main thread
│   ├── observer.ts      # lifecycle, prompt grounding, JSON validation
│   └── observer.test.ts # prompt/parser/state-machine tests
├── presets/         # space / blocks / test / singularity / drive / atom worlds
│   ├── types.ts     # WorldAPI contracts (+ drive input)
│   ├── orbits.ts    # Kepler mechanics + instanced debris (tested via solar.test)
│   ├── blackhole.ts # procedural accretion-disk GLSL
│   ├── drive.ts     # arcade car physics (tested via drive.test) + neon circuit
│   ├── solar.ts / blocks.ts / test.ts / singularity.ts
├── solar.test.ts    # Kepler's-law tests
├── drive.test.ts    # steering / throttle / brake / lap tests
├── debug.ts         # debug overlay (FPS, gesture, draw calls…)
└── styles.css
```

## Offline model (optional)

By default the hand model + wasm runtime load from a CDN (internet required
once, then cached by the browser). For fully-offline use, download
`hand_landmarker.task` from the MediaPipe model hub into
`public/models/hand_landmarker.task` — the app probes that path first.

## Milestones

- M1–M4 (tracking, cursor, selection, pinch grab): **implemented**
- M5 (two-hand zoom/rotate): **implemented** (basic)
- M6 (scientific environment): **implemented — Keplerian solar system** (grab planets to reshape orbits, year follows T² ∝ r³; sizes/distances compressed, periods true) + black-hole / voxel / test presets
- M7 (polish): partially — bloom, atmospheres, procedural textures, labels, debug overlay, quality tiers
- M7/M8 (polish, portable packaging): debug overlay + quality tiers done

## Third-party notices

Original PRISM-native implementation. Functional ideas (pinch-distance
scaling, cursor-drag with smoothing) were informed by the local reference
repos, but no third-party code was copied. Runtime dependencies
(`three`, `@mediapipe/tasks-vision`) are covered by their own npm licenses.
