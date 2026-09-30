# PRISM Opening Film

The startup sequence is intentionally minimal: one optical object, one continuous visual idea, and a clean handoff into the interactive instrument.

## Direction

The film begins in near-black space and gradually reveals a transparent optical prism. A controlled beam crosses the frame, enters the glass, refracts, and separates into a restrained spectrum. The camera moves closer as the prism becomes the visual anchor.

The identity reveal is deliberately sparse. ZYNASH LABS appears as a small brand mark, followed by PRISM and its full project name. Credits use a focused single-person reveal instead of a dense roster or artificial interface language.

The final movement drives the camera toward the prism and uses a brief white/cyan light transition to hand control to the realtime PRISM application.

## Engineering

- A single Three.js renderer owns the entire cinematic scene.
- The prism uses a physically based transmissive material with clearcoat and optical refraction.
- Light paths, spectral lines, dust, and orbital accents are prebuilt and animated without per-frame geometry reconstruction.
- Pixel ratio is capped for reliable startup performance.
- WebGL failure falls back cleanly so the application can still launch.
- Pointer movement creates restrained camera parallax on desktop.
- Escape skips the film immediately.
- The main PrismApp remains isolated until the opening sequence completes.

## Credit presentation

- Tanay Bhandari / Zyntrix.krnl.sys / LEAD
- Ashwin Nagaranjan Ramnath / Ash Collector
- Debroop Mojumder / distortus_rexx
- Maaz Mozzam / Unknown
