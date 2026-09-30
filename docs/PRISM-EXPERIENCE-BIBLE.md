# PRISM Experience Bible

## North star
PRISM should feel like a scientific instrument from the near future, not a school dashboard. Every surface earns its pixels. Every animation communicates state. Every expensive effect has a performance budget.

## Product pillars
1. **Clarity before spectacle** — the science remains readable.
2. **Instrument, not decoration** — HUD elements behave like controls and measurements.
3. **Material hierarchy** — glass, crystal, light and typography have distinct roles.
4. **Physics-aware motion** — inertia, spring, drag, refraction and orbital motion should feel coherent.
5. **Camera-first interaction** — hand tracking is an input sensor, never the visual subject.
6. **Graceful degradation** — mobile preserves the idea of the experience while reducing compositor/GPU work.
7. **Zero dead pixels** — invisible or irrelevant systems stop updating where possible.

## Intro direction
The intro is rebuilt as a short cinematic film rather than a conventional splash screen. A generated Higgsfield hero sequence provides the photographic/cinematic substrate; HTML typography and WebGL overlays provide exact project identity and deterministic timing.

Sequence:
- 0–1.2s: black, a single precise white ray appears.
- 1.2–4.5s: impossible scientific chamber, prism, refracted spectrum, microscopic particles.
- 4.5–7.5s: camera dives through the spectrum into mathematical and atomic structures.
- 7.5–10s: the structures resolve into the ZYNASH LABS mark.
- 10–13s: PRISM title and full expansion appear with restrained glass instrumentation.
- 13–16s: team credits enter one at a time.
- final beat: the camera passes through the prism and dissolves into the live PRISM lab.

## Visual grammar
- Background: near-black blue, never flat navy.
- Primary light: cold white.
- Accent: cyan/ice-blue.
- Glass: translucent with thin specular edge, not a giant blur.
- Typography: compact grotesk, high contrast, generous tracking for labels.
- Motion: decisive starts, smooth settle, tiny overshoot only where physical.
- Sound, if later added: one tonal identity, no generic whooshes.

## Performance contract
- Camera inference is asynchronous and sampled below render cadence.
- Never queue stale video frames.
- Prefer requestVideoFrameCallback when available.
- Keep camera input at 640×480 class on mobile unless a capability check proves a larger frame is necessary.
- Use device pixel ratio budgets.
- Do not run simulation updates for hidden/non-visible systems.
- Do not allocate geometry in render loops.
- Avoid full-screen blur/backdrop-filter on low-tier devices.
- Respect prefers-reduced-motion.
