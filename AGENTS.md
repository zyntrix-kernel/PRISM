# AGENTS.md
## ZYNASH LABS: PRISM Agent Instructions

You are working on **PRISM (Projected Reality Interaction & Spatial Manipulation)**.

PRISM is a **web-first, portable, hand-controlled 3D scientific visualization project**.

---

## 1. Project Location

PRISM is located at:

```text
C:\Users\USER\Desktop\Zyntrix\PRISM
```

Reference repositories are located at:

```text
C:\Users\USER\Desktop\Zyntrix\PRISM\Reference Repos
```

Current reference repositories:

```text
Reference Repos\
├── HoloGraphic\
├── Hand-controller\
├── threejs-handtracking-101\
├── hand-gesture\
├── mediapipe-fluid-threejs\
└── mediapipe\
```

Inspect these repositories when their implementation is relevant.

---

## 2. Critical Rule: Reference ≠ Copy-Paste

The reference repositories exist to provide:

- implementation examples
- proven approaches
- API usage examples
- gesture ideas
- performance ideas
- visual-effect ideas

Do NOT blindly combine entire repositories.

Before reusing code:

1. Inspect its implementation.
2. Check its license.
3. Confirm compatibility with PRISM's license and architecture.
4. Keep attribution/license requirements when applicable.
5. Prefer implementing clean PRISM-native modules when that is simpler.

PRISM should remain an original, maintainable project.

---

## 3. Architecture

Prefer this pipeline:

```text
Camera
  ↓
MediaPipe
  ↓
Hand landmarks
  ↓
Gesture engine
  ↓
Interaction controller
  ↓
Three.js scene
  ↓
WebGL renderer
```

Keep these responsibilities separated.

Do not put gesture detection, rendering and camera processing into one giant file.

---

## 4. Web-First Requirement

PRISM must be designed to run in a modern browser.

The same core should be capable of being deployed as:

```text
Web app
Windows portable build
Android/PWA
Linux browser application
```

Do not introduce Windows-only functionality into the core unless there is a strong reason.

Avoid hardcoded user paths.

Use relative paths and bundled assets.

---

## 5. Performance Requirements

Prioritize:

- low latency
- stable hand tracking
- smooth rendering
- low jitter
- low CPU overhead
- low GPU overhead

Target approximately:

```text
Render: 60 FPS when hardware permits
Tracking: 20–30 FPS when hardware permits
```

Use smoothing/interpolation for hand-controlled objects.

Do not make the renderer wait unnecessarily for camera inference.

Use efficient Three.js techniques such as:

- shared geometries
- shared materials
- `InstancedMesh`
- `BufferGeometry`
- controlled draw calls
- limited dynamic lights

Avoid unnecessary object creation in hot loops.

---

## 6. Gesture System

Gestures should initially be based on measurable landmark geometry.

Initial gesture vocabulary:

```text
☝ Point
🤏 Pinch
✋ Open palm
👐 Two-hand transform
```

Do not add complex ML gesture classifiers unless simple geometric logic is insufficient.

Gestures should have clear states and transitions.

Example:

```text
NONE
 ↓
POINTING
 ↓
PINCH / GRAB
 ↓
MOVING
 ↓
RELEASE
 ↓
NONE
```

---

## 7. Interaction

Use a virtual pointer/ray for 3D selection.

The basic interaction should be:

```text
Index finger → virtual pointer
                     ↓
                  raycast
                     ↓
                3D object
```

Pinch should grab the selected object.

Two hands can control:

```text
distance change → zoom/scale
relative rotation → world rotation
```

Interaction should feel smooth rather than directly copying noisy landmark coordinates.

---

## 8. Scientific Content

PRISM is a science-expo project.

The final scene must demonstrate a meaningful scientific concept rather than being only a visual effects demo.

Possible environments:

- planetary/orbital systems
- magnetic fields
- electric fields
- molecules
- Earth systems
- other scientifically defensible 3D visualizations

Scientific claims must be represented accurately.

---

## 9. Testing

After meaningful implementation changes:

1. Start the application.
2. Test the affected feature.
3. Check browser console errors.
4. Check tracking behavior.
5. Check FPS/latency where relevant.
6. Fix regressions.
7. Only then continue.

Test:

```text
one hand
two hands
fast movement
slow movement
tracking loss
tracking recovery
different webcam resolutions
weaker hardware
```

---

## 10. Debug Mode

PRISM should eventually have an optional debug overlay showing information such as:

```text
FPS
tracking FPS
hands detected
current gesture
tracking confidence
object count
draw calls
```

Debug tools should be removable/disableable for the final exhibition.

---

## 11. Portability

The final application should be usable by someone who does not have the development environment installed.

Avoid requiring the user to install:

```text
Node.js
Python
global npm packages
development dependencies
```

The production build should bundle what it needs.

A preferred deployment model is:

```text
PRISM/
├── executable or launcher
├── assets/
├── models/
└── config/
```

The hosted web version should also remain available as a fallback.

---

## 12. Hardware Independence

Do not assume the exhibition machine has the developer's GPU.

PRISM must degrade gracefully.

Possible quality tiers:

```text
High
→ full visual effects

Medium
→ reduced particles/effects

Low
→ lightweight scene and tracking
```

Functionality is more important than visual effects.

---

## 13. Development Philosophy

Build in small verified stages.

Preferred loop:

```text
Plan
 ↓
Implement
 ↓
Run
 ↓
Test
 ↓
Measure
 ↓
Fix
 ↓
Refactor
 ↓
Repeat
```

Do not rewrite working systems without a reason.

Do not add dependencies just because they are convenient.

Keep the code understandable enough for the project owners to maintain.

---

## 14. Current First Objective

The first working PRISM prototype should be:

```text
Webcam
  ↓
MediaPipe hand tracking
  ↓
Index fingertip
  ↓
Virtual cursor
  ↓
Three.js sphere
  ↓
Point at sphere
  ↓
Pinch
  ↓
Grab sphere
  ↓
Move hand
  ↓
Sphere follows smoothly
  ↓
Release
```

Do not move to the holographic enclosure until this interaction works reliably.

---

## 15. Read PLAN.md

`PLAN.md` contains the overall project roadmap and should be treated as the project-level plan.

Update it when major architectural or milestone decisions change.
