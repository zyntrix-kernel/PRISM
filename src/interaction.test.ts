// Integration test for the hand/mouse → action pipeline (the exact path a
// user drives with): synthetic hand frames and synthetic pointer events flow
// through the real InteractionController against a stubbed scene (real
// THREE camera + real CameraRig, no renderer/DOM needed).

import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InteractionController } from './interaction';
import { CameraRig, type PrismScene } from './scene';
import type { HandFrame, Landmark } from './types';

type Listener = (e: never) => void;

const elListeners = new Map<string, Listener[]>();
const winListeners = new Map<string, Listener[]>();

function fakeElement() {
  return {
    style: {} as Record<string, string>,
    addEventListener: (type: string, fn: Listener) => {
      const list = elListeners.get(type) ?? [];
      list.push(fn);
      elListeners.set(type, list);
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  };
}

function stubPrism(): PrismScene {
  const camera = new THREE.PerspectiveCamera(55, 800 / 600, 0.1, 300);
  camera.position.set(0, 4.6, 12);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true); // no render loop in tests: refresh manually
  return {
    camera,
    world: new THREE.Group(),
    grabbables: [],
    renderer: { domElement: fakeElement() },
    rig: new CameraRig(),
    resetLayout: () => {},
    setHover: () => {},
    markGrabbed: () => {},
    setCursor: () => {},
  } as unknown as PrismScene;
}

function fireEl(type: string, event: unknown): void {
  for (const fn of elListeners.get(type) ?? []) fn(event as never);
}

function fireWin(type: string, event: unknown): void {
  for (const fn of winListeners.get(type) ?? []) fn(event as never);
}

/** 21 landmarks; pinch closed when `pinched` (thumb tip meets index tip). */
function makeLandmarks(pinched: boolean): Landmark[] {
  return makeHandAt(pinched ? 0.45 : 0.3, pinched ? 0.47 : 0.55);
}

/** Pinched fixture with explicit thumb/index x positions (for two-hand tests). */
function makeHandAt(thumbX: number, indexX: number): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.6, z: 0 }));
  lm[0] = { x: 0.5, y: 0.9, z: 0 }; // wrist
  lm[9] = { x: 0.5, y: 0.55, z: 0 }; // middle MCP (hand scale anchor)
  lm[4] = { x: thumbX, y: 0.5, z: 0 };
  lm[8] = { x: indexX, y: 0.5, z: 0 };
  return lm;
}

function handFrame(pinched: boolean): HandFrame {
  return {
    hands: [{ landmarks: makeLandmarks(pinched), handedness: 'Right', confidence: 0.9 }],
    timestampMs: performance.now(),
  };
}

const DT = 1 / 60;

describe('interaction action pipeline', () => {
  beforeEach(() => {
    elListeners.clear();
    winListeners.clear();
    vi.stubGlobal('window', {
      addEventListener: (type: string, fn: Listener) => {
        const list = winListeners.get(type) ?? [];
        list.push(fn);
        winListeners.set(type, list);
      },
      dispatchEvent: () => true,
    });
  });

  it('fires one pinch rising edge from a real hand frame sequence', () => {
    const ic = new InteractionController(stubPrism());
    // Open hand: no action.
    ic.update(DT, handFrame(false));
    expect(ic.actionHeld).toBe(false);
    expect(ic.actionPressed).toBe(false);
    // Pinch needs 3 consecutive frames to latch (debounce).
    ic.update(DT, handFrame(true));
    ic.update(DT, handFrame(true));
    expect(ic.actionPressed).toBe(false);
    ic.update(DT, handFrame(true));
    expect(ic.actionHeld).toBe(true);
    expect(ic.actionPressed).toBe(true);
    // Held: no repeat edge.
    ic.update(DT, handFrame(true));
    expect(ic.actionHeld).toBe(true);
    expect(ic.actionPressed).toBe(false);
    // Release: falling edge fires exactly once (exit debounce = 3 frames)…
    for (let i = 0; i < 3; i++) ic.update(DT, handFrame(false));
    expect(ic.actionHeld).toBe(false);
    expect(ic.actionReleased).toBe(true);
    // …then the edge clears on the following frame.
    ic.update(DT, handFrame(false));
    expect(ic.actionReleased).toBe(false);
  });

  it('keeps the pointer finite and the cursor alive through hand input', () => {
    const ic = new InteractionController(stubPrism());
    for (let i = 0; i < 10; i++) ic.update(DT, handFrame(i % 3 !== 0));
    expect(ic.mode).toBe('hand');
    expect(Number.isFinite(ic.pointerNX)).toBe(true);
  });

  it('resolves a downward pointer to a ground point (easy-mode pin drop)', () => {
    const ic = new InteractionController(stubPrism());
    // Index fingertip low in frame → NDC y negative → ray hits the y=0 plane.
    const lm = makeLandmarks(false);
    lm[8] = { x: 0.5, y: 0.85, z: 0 };
    lm[4] = { x: 0.3, y: 0.6, z: 0 };
    ic.update(DT, { hands: [{ landmarks: lm, handedness: 'Right', confidence: 0.9 }], timestampMs: 1 });
    const g = ic.groundXZ();
    expect(g).not.toBeNull();
    expect(Number.isFinite(g!.x) && Number.isFinite(g!.z)).toBe(true);
  });

  it('treats a quick mouse click on empty space as an action (pin drop)', () => {
    const ic = new InteractionController(stubPrism());
    // Seed mouse presence so mouse mode engages.
    fireEl('pointermove', { clientX: 400, clientY: 300 });
    ic.update(DT, null);
    expect(ic.mode).toBe('mouse');
    // Press on empty space (no grabbables → orbit armed)…
    fireEl('pointerdown', { button: 0, clientX: 400, clientY: 300 });
    ic.update(DT, null);
    expect(ic.actionHeld).toBe(false); // orbiting, not throttling
    // …release without dragging → click pulse.
    fireWin('pointerup', { clientX: 402, clientY: 301 });
    ic.update(DT, null);
    expect(ic.actionPressed).toBe(true);
    ic.update(DT, null);
    expect(ic.actionPressed).toBe(false);
  });

  it('orbits the camera on mouse drag without firing actions', () => {
    const prism = stubPrism();
    const ic = new InteractionController(prism);
    const yawBefore = prism.rig.yaw;
    fireEl('pointermove', { clientX: 400, clientY: 300 });
    ic.update(DT, null);
    fireEl('pointerdown', { button: 0, clientX: 400, clientY: 300 });
    // Big drag → orbit, and the release must NOT count as a click.
    fireEl('pointermove', { clientX: 550, clientY: 380 });
    ic.update(DT, null);
    fireWin('pointerup', { clientX: 550, clientY: 380 });
    ic.update(DT, null);
    expect(prism.rig.yaw).not.toBe(yawBefore);
    expect(ic.actionPressed).toBe(false);
  });

  it('survives tracking loss mid-pinch without throwing', () => {
    const ic = new InteractionController(stubPrism());
    for (let i = 0; i < 5; i++) ic.update(DT, handFrame(true));
    expect(ic.actionHeld).toBe(true);
    ic.update(DT, null);
    ic.update(DT, null);
    expect(ic.actionHeld).toBe(false);
    expect(ic.mode).toBe('none');
  });

  it('reports analog pinch closeness (gas pedal), not just binary pinch', () => {
    const ic = new InteractionController(stubPrism());
    expect(ic.pinchCloseness).toBe(0);
    // Mid-zone ratio ≈ 0.27 (between enter 0.22 and exit 0.32) → half pedal.
    const lm = makeHandAt(0.45, 0.545);
    ic.update(DT, { hands: [{ landmarks: lm, handedness: 'Right', confidence: 0.9 }], timestampMs: 1 });
    expect(ic.pinchCloseness).toBeGreaterThan(0.3);
    expect(ic.pinchCloseness).toBeLessThan(0.7);
    // Full touch → full pedal.
    ic.update(DT, handFrame(true));
    expect(ic.pinchCloseness).toBe(1);
  });

  it('snaps near-misses to tiny bodies (grab assist)', () => {
    const prism = stubPrism();
    const pea = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xff0000 }),
    );
    pea.name = 'Pea';
    prism.grabbables.push(pea);
    prism.world.add(pea);
    prism.world.updateMatrixWorld(true);
    const ic = new InteractionController(prism);
    // Aim 0.05 NDC off the pea's center: a direct raycast misses…
    const center = pea.getWorldPosition(new THREE.Vector3()).project(prism.camera);
    const clientX = ((center.x + 0.05) * 0.5 + 0.5) * 800;
    const clientY = (1 - (center.y * 0.5 + 0.5)) * 600;
    fireEl('pointermove', { clientX, clientY });
    ic.update(DT, null);
    expect(ic.mode).toBe('mouse');
    // …but assist still highlights it.
    expect(ic.hoveredName).toBe('Pea');
  });

  it('holds hover through brief misses, then clears (flicker guard)', () => {
    const prism = stubPrism();
    const pea = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xff0000 }),
    );
    pea.name = 'Pea';
    prism.grabbables.push(pea);
    prism.world.add(pea);
    prism.world.updateMatrixWorld(true);
    const ic = new InteractionController(prism);
    const center = pea.getWorldPosition(new THREE.Vector3()).project(prism.camera);
    const clientX = (center.x * 0.5 + 0.5) * 800;
    const clientY = (1 - (center.y * 0.5 + 0.5)) * 600;
    fireEl('pointermove', { clientX, clientY });
    ic.update(DT, null);
    expect(ic.hoveredName).toBe('Pea');
    // Point at empty sky: highlight survives 2 missed frames…
    fireEl('pointermove', { clientX: 780, clientY: 20 });
    ic.update(DT, null);
    ic.update(DT, null);
    expect(ic.hoveredName).toBe('Pea');
    // …and clears on the 3rd.
    ic.update(DT, null);
    expect(ic.hoveredName).toBeNull();
  });

  it('does not teleport world scale when a two-hand gesture re-enters', () => {
    const prism = stubPrism();
    const ic = new InteractionController(prism);
    const two = (ax: number, bx: number, t: number): HandFrame => ({
      hands: [
        { landmarks: makeHandAt(ax - 0.01, ax + 0.01), handedness: 'Left', confidence: 0.9 },
        { landmarks: makeHandAt(bx - 0.01, bx + 0.01), handedness: 'Right', confidence: 0.9 },
      ],
      timestampMs: t,
    });
    // Latch both pinches, then spread the hands: world grows.
    for (let i = 0; i < 3; i++) ic.update(DT, two(0.26, 0.76, i));
    expect(prism.world.scale.x).toBe(1);
    ic.update(DT, two(0.26, 0.96, 3));
    const grown = prism.world.scale.x;
    expect(grown).toBeGreaterThan(1.2);
    // Drop both hands, then re-enter at the ORIGINAL spread: no jump.
    ic.update(DT, null);
    for (let i = 0; i < 3; i++) ic.update(DT, two(0.26, 0.76, 10 + i));
    expect(prism.world.scale.x).toBe(grown);
  });

  it('dollies the camera on a two-finger touch spread (no actions fired)', () => {
    const prism = stubPrism();
    const ic = new InteractionController(prism);
    const start = prism.rig.distance;
    fireEl('pointerdown', { pointerId: 1, pointerType: 'touch', button: 0, clientX: 300, clientY: 300 });
    fireEl('pointerdown', { pointerId: 2, pointerType: 'touch', button: 0, clientX: 500, clientY: 300 });
    ic.update(DT, null);
    fireEl('pointermove', { pointerId: 1, pointerType: 'touch', clientX: 250, clientY: 300 });
    fireEl('pointermove', { pointerId: 2, pointerType: 'touch', clientX: 550, clientY: 300 });
    ic.update(DT, null);
    expect(prism.rig.distance).toBeLessThan(start); // spread = dolly in
    expect(ic.actionHeld).toBe(false);
    expect(ic.actionPressed).toBe(false);
    fireWin('pointerup', { pointerId: 1, clientX: 250, clientY: 300 });
    fireWin('pointerup', { pointerId: 2, clientX: 550, clientY: 300 });
    ic.update(DT, null);
  });

  it('grabs with a single touch press on a body', () => {
    const prism = stubPrism();
    const pea = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xff0000 }),
    );
    pea.name = 'Pea';
    prism.grabbables.push(pea);
    prism.world.add(pea);
    prism.world.updateMatrixWorld(true);
    const ic = new InteractionController(prism);
    const center = pea.getWorldPosition(new THREE.Vector3()).project(prism.camera);
    const clientX = (center.x * 0.5 + 0.5) * 800;
    const clientY = (1 - (center.y * 0.5 + 0.5)) * 600;
    fireEl('pointerdown', { pointerId: 7, pointerType: 'touch', button: 0, clientX, clientY });
    fireEl('pointermove', { pointerId: 7, pointerType: 'touch', clientX, clientY });
    ic.update(DT, null);
    expect(ic.grabbedName).toBe('Pea');
    fireWin('pointerup', { pointerId: 7, clientX, clientY });
    ic.update(DT, null);
    expect(ic.grabbedName).toBeNull();
  });
});
