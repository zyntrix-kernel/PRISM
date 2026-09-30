# Higgsfield hero film brief

The runtime intro has a deterministic CSS/WebGL fallback and a slot for a generated hero film. When a Higgsfield cinematic generation is available, export it as a silent 16:9 master and use it as a background plate behind the exact HTML title/team typography.

## Master prompt

A world-class scientific product film for PRISM by ZYNASH LABS. No people. No text. No logos. Near-black blue void. A perfect optical prism made of physically accurate crystal glass receives a single white beam. The beam splits into impossibly clean spectral planes. The camera moves through the spectrum, transitioning across scales: atomic orbitals, molecular bonds, DNA helix, gravitational trajectories, crystalline lattice, mathematical curves, then a calm return to the prism. Every transformation is caused by the same beam of light, so the sequence feels like one continuous scientific idea rather than a montage. Minimal luxury product cinematography, deep blacks, cold white highlights, ice-blue/cyan refraction, precise caustics, realistic glass, restrained volumetric haze, controlled lens behavior, no neon cyberpunk, no generic holograms, no clutter. Camera language: slow macro push, precise orbital move, one accelerating dive, then a perfectly stable hero lock-off. The final frame must leave clean negative space around the center for an overlaid PRISM title.

## Edit rule

Do not bake project text into the generated video. Exact typography, team names and timing remain DOM-owned so the expo build stays crisp at every resolution and can be localized or corrected without regenerating the film.

## Runtime fallback

If the generated asset is unavailable, PRISM uses `PrismCinematicIntroV2` which recreates the same visual grammar procedurally with CSS, avoiding a network-dependent blank intro.
