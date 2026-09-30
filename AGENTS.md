# PRISM Agent Guidance

## Product bar

PRISM is an interactive scientific instrument, not a generic sci-fi dashboard. Every UI or visual change should make the experience clearer, more tactile, more believable, or more useful.

Prefer:
- restrained glass, deep blue-black surfaces, precise typography, generous negative space
- physically motivated light, depth, inertia, refraction, parallax, and camera movement
- one strong visual idea per layer rather than stacks of unrelated effects
- compact controls that reveal detail progressively
- real state from the engine instead of decorative fake telemetry

Avoid:
- neon overload, arbitrary gradients, generic cyberpunk HUDs, oversized rounded cards, fake AI spectacle, noisy scanlines, or unexplained numbers
- visual effects that compete with the 3D world
- duplicate controls for the same engine action

## Architecture

The authoritative runtime is:
Camera -> HandTracker -> InteractionController -> PrismScene/WorldAPI -> render loop.

`PrismStage` owns the DOM bridge and lifecycle. `PrismApp` owns imperative runtime state. React UI mirrors state through `subscribe`.

Keep engine-owned DOM refs alive even when the modern visual chrome supersedes their appearance. Do not delete bridge elements just because they are visually hidden.

World metadata belongs in `src/lib/prism/presets/catalog.ts`. Keep labels, scientific descriptors, hues, and ordering consistent across the command chrome, command palette, transitions, and stage.

## Motion design

When editing the cinematic intro or any substantial animation work, use the vendored LottieFiles motion-design skill at `skills/motion-design/SKILL.md`.

Treat the skill as the motion-design source of truth for:
- emotional intent and visual narrative
- timing and directional easing
- primary, secondary, and ambient motion layers
- choreography and stagger budgets
- anticipation, follow-through, staging, and path design
- motion personality and consistency
- motion quality review before shipping

For complex cinematic sequences, keep the motion language coherent across scenes instead of making every effect independently flashy. Prefer believable physical motion and clear hero-element staging over raw effect count.

## Performance

PRISM must remain responsive while the camera is active.

Rules:
- never put MediaPipe inference on the render thread when a worker path is available
- never queue stale camera frames; backpressure is intentional
- keep camera capture bounded at modest resolution and frame rate
- update 2D landmark overlays only when tracking produces a new frame
- adapt tracking cadence to measured inference cost
- keep expensive post-processing behind the quality governor
- do not add persistent per-frame allocations inside interaction or rendering hot paths
- pause rendering work when the document is hidden
- always respect `prefers-reduced-motion`
- mobile compositor cost matters as much as raw Three.js draw calls

## Interaction

Pointer, pinch, grab, release, two-hand gestures, and mouse fallback should share one vocabulary. Prefer existing `InteractionController` behavior over parallel gesture logic in React.

Expose useful live state through `PrismState` when UI needs it. State should be factual and engine-derived:
- input mode
- focused/grabbed object
- pinch progress
- two-hand activity
- FPS history
- camera status
- world-specific information

Never invent telemetry merely to make the UI look technical.

## UI

The experience chrome should behave like one coherent instrument:
- primary controls at the top
- context and focused-object information only when useful
- telemetry subordinate to the scene
- interaction guidance concise and discoverable
- command palette is the universal escape hatch for keyboard/mouse users
- mobile layouts collapse density instead of shrinking desktop UI
- honor safe-area insets on mobile

For any new surface, ask whether an existing surface can be extended instead of creating another floating panel.

## Quality gate

Before considering a major change complete:
1. inspect the changed code and its integration points
2. verify state types match all consumers
3. check keyboard, pointer, touch, reduced-motion, and mobile paths
4. prefer an existing GitHub Actions CI result for actual build/type/lint evidence
5. never claim a build passed unless a fresh run or equivalent verification actually exists