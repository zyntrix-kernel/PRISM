# PRISM Cinematic Science Engine

The PRISM startup sequence is a realtime Three.js showcase designed as a tiny science film.

It is deliberately separate from the main PRISM interaction engine. The intro owns its own render loop, camera, quality governor, post-processing, deterministic scene systems, and timeline. When the intro finishes, PrismStage hands control back to the actual PRISM world.

## Visual sequence

| Time | Scene | Visual language |
| --- | --- | --- |
| 0.00–0.85s | boot | star ignition, calibration marks, spatial wake-up |
| 0.85–3.00s | physics | projectile trajectory, pendulum, orbital motion, moving field particles |
| 3.00–5.25s | chemistry | atomic shells, electrons, H₂O, CO₂, molecular lattice |
| 5.25–7.50s | mathematics | golden-ratio spiral, sine graph, parabola, vectors, matrix blocks, torus knot |
| 7.50–9.25s | synthesis | the disciplines converge into a procedural crystalline core |
| 9.25–10.40s | labs | ZYNASH LABS identity reveal |
| 10.40–11.80s | prism | PRISM title + full expansion |
| 11.80–14.80s | team | four-member sequential credit reveal |
| 14.80–15.80s | launch | camera dive into the PRISM core |
| 15.80–16.00s | complete | handoff flash |

The timeline is normalized, so custom duration still preserves the choreography.

## Architecture

- engine.ts owns lifecycle, renderer, camera choreography, cues, post-processing, adaptive quality, and the frame loop.
- science.ts contains the independent realtime systems for physics, chemistry, mathematics, synthesis, and procedural stars.
- timeline.ts is the canonical source of scene boundaries and cue events.
- quality.ts selects an initial tier and can downgrade GPU pressure during playback.
- PrismCinematicIntro.tsx is intentionally thin. React only owns semantic scene/member labels and the accessible skip control.
- PrismCinematicIntro.css handles the cinematic typography, glass instrumentation, scene choreography, grain, scan, vignette, and exit transition.

## Science visualizers

The science content is procedural rather than a pre-rendered video:

- Physics uses a gravity-based projectile path, a harmonic pendulum, orbital bodies, and a moving field.
- Chemistry uses electron-shell motion plus stylized molecular structures for water and carbon dioxide.
- Mathematics uses parametric curves, vectors, a phi-inspired spiral, a graph point, and a matrix-like lattice.
- Synthesis turns the three disciplines into one animated crystalline object.

These are presentation visualizations for the expo intro, not a scientific simulator.

## Interaction and resilience

Pointer movement subtly bends the camera and scene composition. Escape skips. prism:intro-cue custom events expose scene boundaries for future sound, haptics, or telemetry without putting those concerns into React state.

The engine pauses when the document is hidden, respects prefers-reduced-motion, uses a dedicated adaptive quality path, and falls back to the typography timeline when WebGL initialization fails.

## Team credits

- Zyntrix.krnl.sys — Tanay Bhandari · LEAD
- Ash Collector — Ashwin Nagaranjan Ramnath
- distortus_rexx — Debroop Mojumder
- Unknown — Maaz Mozzam
