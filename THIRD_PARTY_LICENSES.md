# Third-Party Notices (PRISM)

PRISM itself is MIT-licensed (see `LICENSE`, © 2026 ZYNASH LABS).
This file records third-party code, techniques, and assets reused in PRISM
and the obligations that come with them.

## 1. three.js (MIT) — dependency + adapted voxel technique

- **What:** the `three` npm package (runtime dependency), plus the voxel
  meshing technique adapted into `src/presets/voxel.ts`: culled-face chunk
  meshing against a texture atlas, DDA voxel-ray traversal for picking, and
  the place/remove + hover-highlight interaction pattern.
- **Sources:** the three.js manual "Voxel Geometry" series
  (`https://threejs.org/manual/en/voxel-geometry.html`,
  part of the three.js repository) and the `webgl_interactive_voxelpainter`
  example. The implementation in PRISM is a clean-room TypeScript adaptation
  (own chunk layout, own atlas, own lighting); only the underlying technique
  and face-winding conventions carry over.
- **License:** MIT. Copyright © 2010-2026 three.js authors.
- **Deliberately NOT reused:** the manual's sample texture atlas
  (`flourish-cc-by-nc-sa.png`), which is CC-BY-NC-SA and unsuitable for an
  expo/distributable project. All PRISM voxel textures are original
  procedurally generated pixels. No Mojang / Minecraft assets are used
  anywhere in PRISM.

The full three.js license text:

```text
The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## 2. MediaPipe Tasks Vision (Apache-2.0) — dependency only

- **What:** `@mediapipe/tasks-vision` npm package (HandLandmarker runtime).
- **License:** Apache License 2.0. Used unmodified as a dependency; no
  MediaPipe code is copied into PRISM sources.

## 3. Transformers.js (Apache-2.0) — dependency only

- **What:** `@huggingface/transformers` npm package (AI observer runtime).
- **License:** Apache License 2.0. Used unmodified as a dependency; no
  library code is copied into PRISM sources.

## 4. FastVLM-0.5B model weights — runtime download, NOT distributed

- **What:** `onnx-community/FastVLM-0.5B-ONNX` weights, fetched on demand
  from Hugging Face only when the user enables the AI observer, then cached
  in the browser.
- **License:** governed by the model card on Hugging Face. The weights are
  never bundled into PRISM's `dist/` — verify the card's terms before any
  redistribution scenario that would include them.

## Reference repositories (no code copied)

The local `Reference Repos/` directory informed PRISM's architecture
(pinch-distance scaling, cursor-drag smoothing) but no third-party code from
those repositories was copied into `src/`. If that ever changes, the
component, its license, and this file will be updated together.
