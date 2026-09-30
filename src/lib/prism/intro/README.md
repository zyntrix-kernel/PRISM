# PRISM Cinematic Science Film

The PRISM intro is a realtime 3D title sequence for the ZYNASH LABS school robotics project. It is designed around a premium motion language, a directed camera, procedural science visuals, and a deterministic handoff into the main interactive world.

## Narrative

1. FIRST PRINCIPLES: the scene wakes from darkness and establishes matter, energy, and information.
2. PHYSICS: gravity, projectile motion, pendulum oscillation, orbital motion, and dynamic fields.
3. CHEMISTRY: atomic shells, electrons, molecular structures, lattice geometry, and a DNA-style helix.
4. MATHEMATICS: sine/cosine curves, a parabola, a phi-inspired spiral, a helix, a Lissajous figure, and a torus knot.
5. INFORMATION: a live signal curve, matrix-like instancing field, and encoded data stream.
6. SYNTHESIS: the systems collapse toward one custom triangular prism with orbital rings and refracted light paths.
7. ZYNASH LABS: identity reveal.
8. PRISM: project title and full expansion.
9. TEAM: four sequential credits.
10. LAUNCH: camera dives into the prism core before the main app appears.

## Motion direction

The vendored LottieFiles motion-design skill is the reference for the choreography. PRISM uses one shared motion language with premium easing, deliberate hero staging, anticipatory scene transitions, secondary follow-through, and restrained ambient motion.

The 1/3 distance rule is respected through staged camera travel. The three motion layers are explicit:

- Primary: the current science or identity hero.
- Secondary: supporting curves, rings, signals, or geometry.
- Ambient: the cosmic field, subtle light sweeps, grain, and instrumentation.

## Realtime engineering

- One intro WebGL renderer.
- Preallocated typed arrays for moving point systems and line systems.
- No per-frame geometry reconstruction.
- No EffectComposer in the intro hot path.
- Adaptive pixel ratio and quality downgrade.
- Reduced-motion support.
- WebGL and frame-level circuit breakers.
- Main PrismApp initialization is deferred until the intro completes.
- Pointer movement gently affects the camera and world.

## Team

- Zyntrix.krnl.sys - Tanay Bhandari · LEAD
- Ash Collector - Ashwin Nagaranjan Ramnath
- distortus_rexx - Debroop Mojumder
- Unknown - Maaz Mozzam

## Assets

The cinematic hero is generated procedurally in Three.js so the sequence does not depend on a hosted media URL. A Higgsfield hero-image attempt was tested, but the connected account did not expose a compatible unlimited generation route for the chosen visual model, so no paid asset was forced into the build.
