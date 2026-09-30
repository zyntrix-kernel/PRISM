# PRISM Runtime Architecture

PRISM is intentionally split into three budgets: input, simulation, and presentation.

## Input
Camera frames are sampled with backpressure. Vision inference is allowed to run slower than the display refresh rate. Only the newest useful observation matters.

## Simulation
Simulation systems should expose `enabled`, `visible`, or a coarse activity state. When a system is outside the camera frustum, paused by the current scene, or covered by a modal transition, it should stop expensive updates.

## Presentation
Three.js owns the pixels. DOM owns controls and exact typography. Never use the DOM to fake thousands of particles. Never use WebGL to render text that must remain perfectly legible.

## Performance rules
- No per-frame allocations in hot loops.
- No full-resolution camera processing on mobile by default.
- No render-target/post-processing stack on low-tier devices unless explicitly budgeted.
- Use `renderer.info` in development to watch draw calls and triangles.
- Use `requestAnimationFrame` only for the visual clock; camera cadence is independent.
- Pause work on `document.hidden`.
- Prefer visibility-driven simulation over global ticking.
