# PRISM Cinematic Intro Engine

The PRISM startup experience is intentionally implemented as a small realtime
cinematic framework instead of a collection of unrelated CSS animations.

## Runtime architecture

```
PrismCinematicIntro.tsx
        |
        v
PrismCinematicEngine
        |
        +-- IntroDirector
        +-- Timeline / cue scheduler
        +-- Adaptive quality governor
        +-- Three.js renderer
        +-- EffectComposer
        +-- UnrealBloomPass
        +-- Cinematic post shader
        |
        +-- AtmosphereSystem
        +-- StarFieldSystem
        +-- DustSystem
        +-- SpatialGridSystem
        +-- EnergyRibbonSystem
        +-- SignalOrbitSystem
        +-- CrystalSystem
        +-- BurstSystem
        +-- PortalSystem
```

## Design principles

- React owns only durable UI state such as the current cinematic scene and
  current team member.
- The animation loop does not call React state setters every frame.
- Procedural visuals use a deterministic seed, making the composition stable
  between runs and easier to reproduce when debugging.
- The renderer adapts pixel ratio and can bypass post-processing when the
  measured frame rate becomes unhealthy.
- Reduced-motion users receive a lighter motion profile.
- WebGL failure does not prevent the title/team sequence from completing.
- Timeline cues are also emitted as `prism:intro-cue` CustomEvents. This is an
  extension point for future sound design, telemetry, haptics, or external
  presentation controls without coupling those systems to React.
- The main PRISM render loop remains paused while the cinematic owns the frame
  budget.

## Timeline

The canonical cinematic timeline is 13.2 seconds:

1. Boot / initialization
2. Spatial field awakening
3. Optical crystal formation
4. ZYNASH LABS reveal
5. PRISM reveal
6. Full project title
7. Team credits
8. Final portal / handoff

The component can still receive a custom duration. The engine maps that duration
onto the canonical timeline so the scene choreography remains deterministic.

## Expo behavior

The main Stage mounts the cinematic automatically. The intro should remain
skippable only for development/debug builds unless a presentation workflow needs
an Escape override.

The PRISM application render loop starts only after the cinematic reports
completion, preventing two continuously-rendering scenes from competing during
the most visually demanding part of startup.
