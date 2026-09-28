# Third-Party Licenses and Attributions

PRISM incorporates ideas, algorithms, and code from the following open-source projects.

## 1. threejs-blackhole (ISC License)
**Repository:** https://github.com/vlwkaos/threejs-blackhole  
**License:** ISC  
**What was used:**  
- Blackbody temperature-to-RGB color function (`temp_to_color`) — used in the black hole accretion disk fragment shader for physically-accurate disk coloring based on temperature (40000K → 3000K gradient).

## 2. threejs-galaxy (MIT License)
**Repository:** https://github.com/ggwzrd/threejs-galaxy  
**License:** MIT  
**Author:** lexical.eights-0k@icloud.com  
**What was used:**  
- Classic Perlin noise 3D (`cnoise`) — Stefan Gustavson's implementation, used in the nebula vertex shader for organic particle flow, and in the black hole disk shader for turbulence.
- Curl noise (`curl_noise`) — divergence-free flow field used in the nebula GPU vertex shader for realistic gas movement.
- Fractal Brownian motion (`fbm`) — layered noise for natural-looking turbulence.
- Barred spiral galaxy distribution — logarithmic spiral arms with differential rotation (inner particles rotate faster).
- Quality-tiered particle counts — more particles on Ultra/High, fewer on Low/Medium.

## 3. solar-system-threejs (Apache License 2.0)
**Repository:** https://github.com/sanderblue/solar-system-threejs  
**License:** Apache License 2.0  
**What was used:**  
- Multi-directional lighting concept — 4 directional lights from different angles (key, fill, bottom bounce, rim) to ensure all sides of 3D meshes are lit without dead dark sides. Used in the scene's global lighting setup.

## 4. three-nebula (MIT License)
**Repository:** https://github.com/creativelifeform/three-nebula  
**License:** MIT  
**What was used:**  
- GPU particle rendering concepts — InstancedBufferGeometry with custom vertex/fragment shaders for GPU-side particle updates (not CPU). The size attenuation formula `gl_PointSize = (size * factor) / -mvPosition.z` is used in the nebula shader.

## 5. cookieMonsterDev/solar-system-threejs (MIT License)
**Repository:** https://github.com/cookieMonsterDev/solar-system-threejs  
**License:** MIT  
**What was used:**  
- Fresnel rim glow shader (`createFresnelMaterial`) — creates an atmospheric edge glow on planets and the sun. Used in the solar system preset for every planet + the sun.
- PointLight at the sun's position — physically-correct lighting radiating from the center of the system.
- Planet texture concepts from Planetary Pixel Emporium (referenced in their README).

## 6. matt765/atom-animation (Personal Use License)
**Repository:** https://github.com/matt765/atom-animation  
**License:** Personal Use License  
**What was used:**  
- Fibonacci sphere distribution (golden angle) for nucleon packing — protons and neutrons are uniformly distributed on a sphere using the golden angle (π(3-√5)), replacing hardcoded positions.
- Golden-angle shell orientations — each electron shell gets a different 3D orientation so shells don't all lie in the same plane, creating a proper 3D atom.
- Visible torus orbit rings — thin TorusGeometry rings replace flat Line objects for visible orbital paths.

## 7. Three.js (MIT License)
**Library:** https://github.com/mrdoob/three.js  
**License:** MIT  
**What was used:** Core rendering engine (WebGLRenderer, Scene, Camera, shaders, postprocessing).

## 6. MediaPipe Tasks Vision (Apache License 2.0)
**Library:** @mediapipe/tasks-vision  
**License:** Apache License 2.0  
**What was used:** Hand landmark detection for the gesture interaction pipeline.

## 7. 3d-text by Anastasiia Solop (MIT License)
**Repository:** https://github.com/anastasiya1155/3d-text  
**License:** MIT — Copyright (c) 2022 Anastasiia Solop  
**What was used:**  
- TextGeometry + particle field rendering pattern for the cinematic ZYNASH LABS startup intro. The technique of combining extruded 3D text with a drifting point cloud was adapted from this project.

## 8. react-bits by David Haz (MIT + Commons Clause License)
**Repository:** https://github.com/DavidHDev/react-bits  
**License:** MIT + Commons Clause License Condition v1.0 — Copyright (c) 2026 David Haz  
**What was used:**  
- ShinyText gradient sweep technique — adapted for the metallic shimmer on the 3D title (a moving highlight band implemented as a custom shader uniform).  
- DecryptedText scramble-reveal pattern — adapted for the frame-by-frame credit reveal (characters scramble then settle into the real name).  
- Particles background pattern — adapted for the particle field behind the title (3D sphere distribution with color variance + additive blending).  
**Note:** Components are used internally within PRISM and are not redistributed as a standalone library.

## 9. Three.js-3D-Text by Imagineer99 (reference only)
**Repository:** https://github.com/Imagineer99/Three.js-3D-Text  
**License:** No LICENSE file (All Rights Reserved) — used as REFERENCE ONLY  
**What was used:**  
- The pattern of MeshStandardMaterial with high metalness + low roughness for a metallic text look. No code was copied; only the generic Three.js API pattern was referenced.

## 10. troika-three-text (MIT License)
**Library:** troika-three-text (via @react-three/drei)  
**License:** MIT  
**What was used:** SDF-based 3D text rendering for the "ZYNASH LABS" title (via drei's `<Text>` component).

---

All ported code has been attributed inline in the source files where it is used.
If you are the author of any of these repositories and believe the attribution is insufficient, please open an issue at https://github.com/zyntrix-kernel/PRISM.
