# PRISM Opening Film

The startup sequence is treated as a product film, not as an interface.

## Visual direction

The scene starts in near-black and introduces one optical event: a controlled beam reaches a glass prism, the prism catches light, and a restrained spectrum opens across the frame. The camera feeling is created through coordinated scale, parallax, spectral motion, and a physically based glass hero object.

There are no HUD panels, telemetry readouts, fake laboratory labels, chapter cards, or decorative science montages. Typography appears only when it has narrative purpose:

1. ZYNASH LABS establishes authorship.
2. PRISM and the full project name establish identity.
3. A quiet closing credit identifies the team.
4. A short white/cyan optical flare hands control to the live experience.

The result should read as a calm, expensive opening title sequence rather than a sci-fi dashboard.

## Rendering architecture

- PrismOpeningFilm owns the WebGL lifecycle and all cinematic animation.
- A fullscreen procedural shader handles the atmospheric field, beam, spectral separation, glass edge energy, bloom-like lighting, grain, and final light transition.
- A single real Three.js prism mesh sits above the shader and uses MeshPhysicalMaterial with transmission, IOR, clearcoat, dispersion, and a small generated environment texture for reflection.
- Geometry is built once. The animation updates uniforms, transforms, and material properties instead of reconstructing geometry every frame.
- The fullscreen shader is aspect-aware and resized with the viewport.
- Renderer pixel ratio is capped more aggressively on small touch devices.
- transmissionResolutionScale is reduced to keep transmissive glass from becoming a startup performance trap.
- Custom shader output includes Three.js color-space conversion for consistent display output.
- Visibility changes reset frame timing so tab suspension does not create a large animation jump.

## Interaction and accessibility

- Desktop pointer movement produces restrained camera/object parallax.
- Escape and the visible Skip control end the film immediately.
- Reduced-motion mode keeps the visual composition while reducing animation speed and removing film grain.
- The film delays the app handoff until the exit transition has visually completed.

## Credits

- Tanay Bhandari / Zyntrix.krnl.sys / Lead
- Ashwin Nagaranjan Ramnath / Ash Collector
- Debroop Mojumder / distortus_rexx
- Maaz Mozzam / Unknown
