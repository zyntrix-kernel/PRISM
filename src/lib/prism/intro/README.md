# PRISM Cinematic Science Engine

PRISM opens with a realtime Three.js science film rather than a static splash screen.

The intro is isolated from the main interaction engine. It uses one lightweight WebGL context, preallocated buffer geometry, a deterministic timeline, and CSS compositor layers. The goal is a rich visual impression without making the expo laptop fight two heavy render pipelines at once.

## Visual sequence

| Time | Scene | Visual language |
| --- | --- | --- |
| 0.00–0.85s | boot | star ignition, calibration marks, spatial wake-up |
| 0.85–3.00s | physics | projectile motion, pendulum, orbital motion, dynamic field |
| 3.00–5.25s | chemistry | atom shells, electrons, H₂O, CO₂, molecular lattice |
| 5.25–7.50s | mathematics | phi-inspired spiral, sine, parabola, vectors, matrix field, torus knot |
| 7.50–9.25s | synthesis | disciplines collapse into a procedural crystalline core |
| 9.25–10.40s | labs | ZYNASH LABS identity reveal |
| 10.40–11.80s | prism | PRISM title + full expansion |
| 11.80–14.80s | team | four-member sequential credit reveal |
| 14.80–15.80s | launch | camera dive into the PRISM core |
| 15.80–16.00s | complete | handoff flash |

The timeline is normalized, so changing duration preserves the choreography.

## Performance architecture

The hot path is intentionally simple:

- One Three.js renderer and one scene.
- No EffectComposer or bloom pass during the intro.
- Star, electron, molecule, vector, and shard positions use preallocated typed arrays.
- No per-frame BufferGeometry creation.
- No per-frame scene graph traversals for visibility management.
- Adaptive quality can reduce device-pixel ratio and particle density after sustained frame pressure.
- A subsystem circuit breaker prevents a science or WebGL exception from killing the semantic timeline.

The main PRISM render loop remains paused until the intro hands control back.

## Science visualizers

### Physics

A gravity-based projectile path is paired with a pendulum whose swing uses the small-angle angular-frequency relationship, plus a compact orbit system and moving field particles.

### Chemistry

The visualizer presents an atomic nucleus, three electron shells, moving electrons, stylized H₂O and CO₂ molecular arrangements, and a repeating lattice.

### Mathematics

Parametric curves, a sine graph, a parabola, a phi-inspired spiral, a moving graph point, vectors, and a torus knot turn mathematical structure into visible motion.

### Synthesis

The independent discipline systems fade toward a single rotating crystal, surrounded by procedural shards and orbital rings, before the camera dives toward the core.

These are presentation visualizations for the school expo, not scientific simulation software.

## Team credits

- Zyntrix.krnl.sys — Tanay Bhandari · LEAD
- Ash Collector — Ashwin Nagaranjan Ramnath
- distortus_rexx — Debroop Mojumder
- Unknown — Maaz Mozzam

## Resilience

Pointer movement subtly bends the camera and world. Escape skips the sequence. The engine pauses when the document is hidden, respects prefers-reduced-motion, falls back to the typography layer when WebGL cannot initialize, and keeps advancing when a browser/GPU runtime fault occurs.

The prism:intro-cue custom event exposes scene boundaries for future sound, haptics, and telemetry without coupling those concerns to React state.
