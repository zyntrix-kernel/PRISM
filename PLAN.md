# ZYNASH LABS: PRISM
## Project Plan

**PRISM = Projected Reality Interaction & Spatial Manipulation**

This document is the working plan for building PRISM as a **web-first, portable, hand-controlled 3D scientific visualization**.

---

## 1. Local Reference Repositories

All reference projects have already been downloaded locally.

**Reference Repos root:**

```text
C:\Users\USER\Desktop\Zyntrix\PRISM\Reference Repos
```

The directories currently available are:

```text
C:\Users\USER\Desktop\Zyntrix\PRISM\Reference Repos\
├── HoloGraphic\
├── Hand-controller\
├── threejs-handtracking-101\
├── hand-gesture\
├── mediapipe-fluid-threejs\
└── mediapipe\
```

### Repository roles

| Local repository | Use as reference for |
|---|---|
| `HoloGraphic` | MediaPipe + Three.js + webcam + holographic/3D interaction |
| `Hand-controller` | Hand-controlled interaction, selection, dragging and gesture logic |
| `threejs-handtracking-101` | Simple MediaPipe → Three.js hand-tracking pipeline |
| `hand-gesture` | Gesture recognition, smoothing and interaction techniques |
| `mediapipe-fluid-threejs` | Advanced hand-driven particles/visual effects |
| `mediapipe` | Core MediaPipe reference and APIs |

**Important:** These repositories are references and foundations. Do not blindly merge them together. Study their implementation, reuse compatible open-source components where their licenses permit it, and build an original PRISM architecture.

---

# 2. Main Goal

Build a system where:

```text
Webcam
   ↓
Hand Tracking
   ↓
Landmarks
   ↓
Gesture Recognition
   ↓
Interaction System
   ↓
Three.js 3D Environment
   ↓
Web / Desktop / Mobile
```

The user should be able to manipulate a scientific 3D environment without touching a controller.

Example interactions:

- Point → select
- Pinch → grab
- Move hand → move selected object
- Two hands apart/together → zoom
- Two-hand rotation → rotate the environment
- Open palm → pause/reset

---

# 3. Web-First Architecture

PRISM should be **web-first and portable**.

The core application should avoid unnecessary platform-specific dependencies so the same project can eventually run as:

```text
Web browser
   ├── Windows
   ├── Linux
   └── Android

Optional packaging
   ├── Portable Windows application
   └── PWA / Android wrapper
```

The development PC is the primary development and testing machine.

The final exhibition computer does NOT need to be the development PC.

---

# 4. Technology Direction

Preferred stack:

- TypeScript
- Three.js
- WebGL
- MediaPipe hand tracking
- Modern browser APIs
- Vite or an equivalent lightweight build system
- React only where it provides useful UI structure

Do not introduce heavy frameworks without a clear reason.

---

# 5. Performance Goals

PRISM should separate camera/vision processing from rendering.

Target:

```text
Rendering:      ~60 FPS where hardware allows
Hand tracking:  ~20–30 FPS where hardware allows
Interaction:    Low latency
```

The latest hand state should be consumed by the render loop rather than forcing every render frame to wait for a new tracking result.

Use:

- interpolation / smoothing
- efficient landmark calculations
- shared geometries
- `InstancedMesh` for many repeated objects
- limited draw calls
- lightweight lighting
- minimal unnecessary allocations inside hot loops

The application should automatically reduce visual effects on weaker hardware where practical.

---

# 6. Development Milestones

## M1: Hand Tracking

Get webcam input working and display MediaPipe hand landmarks.

Success:

```text
Webcam → MediaPipe → visible hand landmarks
```

## M2: Virtual Hand Cursor

Use the index fingertip as a virtual pointer.

## M3: 3D Interaction

Create a simple Three.js scene containing a few objects.

Pointing at an object should identify/select it.

## M4: Pinch Grab

Pinch detection should allow the user to grab an object.

```text
Pinch → grab
Move hand → move object
Release → release
```

## M5: Two-Hand Controls

Add:

```text
hands apart/together → zoom
hand rotation → scene rotation
```

## M6: Scientific Environment

Replace the test objects with a real scientific visualization.

Possible subjects:

- Solar system
- Magnetic fields
- Orbital mechanics
- Molecules
- Electric fields
- Earth systems

Choose the subject after the interaction system is stable.

**Selected: Solar System** (Keplerian orbits; grab planets to reshape orbits
with the year recomputed from T² ∝ r³; sizes/distances compressed, periods
true, order correct).

## M7: Visual Polish

Add:

- holographic-style rendering
- particles where useful
- subtle glow/emission
- clean UI
- debug mode
- performance information

Do not sacrifice interaction responsiveness for visual effects.

## M8: Portability

Create a production build that can be copied to another machine.

Requirements:

- no development environment required
- no global Node/Python installation required for the end user
- bundled production assets
- relative paths
- camera detection
- useful error messages
- offline-capable core where practical

The web version must also remain usable.

## M9: Exhibition Hardware

Only after the software works:

```text
PRISM application
      ↓
Display
      ↓
Pepper's Ghost-style reflector
      ↓
Camera positioned for hand tracking
```

The optical enclosure is the presentation layer. The software should work without it during development.

---

# 7. AI Development Workflow

AI coding agents will be used heavily for implementation, testing and iteration.

The AI should:

1. Inspect the reference repositories.
2. Identify useful implementation patterns.
3. Build PRISM incrementally.
4. Run the project after meaningful changes.
5. Test hand tracking and interactions.
6. Diagnose performance problems.
7. Fix regressions before moving forward.
8. Keep the architecture modular.

Do not generate the entire application blindly in one pass.

Prefer:

```text
Implement → Run → Test → Diagnose → Fix → Repeat
```

---

# 8. Testing Checklist

Every major interaction should be tested with:

- one hand
- two hands
- slow movement
- fast movement
- hand leaving the camera
- hand returning to the camera
- accidental pinch
- multiple objects
- low lighting
- different webcam resolutions
- weaker hardware

The application should fail gracefully instead of freezing when tracking is lost.

---

# 9. Final Exhibition Goal

The finished prototype should demonstrate:

**Computer Vision + Gesture Recognition + 3D Graphics + Human-Computer Interaction + Optical Projection**

The intended experience:

> A user sees a scientific 3D environment and manipulates it naturally with their hands, without touching a controller or screen.

---

# ZYNASH LABS

## PROJECT PRISM

*Projected Reality Interaction & Spatial Manipulation*
