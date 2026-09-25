// Integration test: builds the real DRIVE world headless (no DOM needed —
// textures come from the caller) and runs the complete easy-mode cycle plus
// adversarial input fuzz. Any throw or NaN here = the in-browser freeze.

import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildDrive } from './presets/drive';
import type { BuilderCtx, DriveFrameInput, WorldAPI } from './presets/types';
import type { PlanetTextureSet } from './textures';

function makeCtx(): BuilderCtx {
  const tex = new THREE.Texture();
  return {
    world: new THREE.Group(),
    labelLayer: new THREE.Group(),
    glowTex: tex,
    nebulaTex: tex,
    planetTex: {} as PlanetTextureSet,
  };
}

function frame(over: Partial<DriveFrameInput> = {}): DriveFrameInput {
  return {
    steer: 0,
    throttle: 0,
    brake: false,
    actionPressed: false,
    ground: null,
    ...over,
  };
}

function assertFiniteWorld(world: THREE.Group): void {
  world.updateMatrixWorld(true);
  world.traverse((obj) => {
    for (const n of [obj.position.x, obj.position.y, obj.position.z]) {
      expect(n, `NaN in ${obj.name || obj.type}`).not.toBeNaN();
    }
  });
}

describe('drive easy-mode integration', () => {
  let world: WorldAPI;
  let ctx: BuilderCtx;

  beforeEach(() => {
    ctx = makeCtx();
    world = buildDrive(ctx);
    world.setEasyMode?.(true);
  });

  it('completes pinch → pin → pinch → drive → arrive without throwing', () => {
    const target = { x: 2, z: 2 };
    // Pinch #1: drop the pin.
    world.setDriveInput?.(frame({ actionPressed: true, ground: target }));
    world.update(1 / 60, 0);
    expect(world.bodyInfo?.(null)).toContain('GO');
    // Pinch #2: launch.
    world.setDriveInput?.(frame({ actionPressed: true }));
    world.update(1 / 60, 1 / 60);
    expect(world.bodyInfo?.(null)).toContain('STOP');
    // Let the autopilot run (up to 60 s of frames).
    let t = 0;
    for (let i = 0; i < 3600; i++) {
      t += 1 / 60;
      world.setDriveInput?.(frame());
      world.update(1 / 60, t);
    }
    const info = world.bodyInfo?.(null) ?? '';
    expect(info).toContain('drop a pin'); // back to idle = arrived
    assertFiniteWorld(ctx.world);
  });

  it('cancels a drive on the third pinch', () => {
    const target = { x: -3, z: 4 };
    world.setDriveInput?.(frame({ actionPressed: true, ground: target }));
    world.update(1 / 60, 0);
    world.setDriveInput?.(frame({ actionPressed: true }));
    world.update(1 / 60, 1 / 60);
    expect(world.bodyInfo?.(null)).toContain('STOP');
    world.setDriveInput?.(frame({ actionPressed: true }));
    world.update(1 / 60, 2 / 60);
    expect(world.bodyInfo?.(null)).toContain('drop a pin');
  });

  it('survives fuzz: action spam, null ground, NaN steer, huge dt', () => {
    let seed = 12345;
    const rand = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    let t = 0;
    for (let i = 0; i < 2000; i++) {
      const r = rand();
      t += 1 / 30;
      world.setDriveInput?.({
        steer: r < 0.05 ? NaN : rand() * 2 - 1,
        throttle: rand() < 0.5 ? 1 : 0,
        brake: rand() < 0.2,
        actionPressed: rand() < 0.1,
        ground: rand() < 0.5 ? { x: (rand() - 0.5) * 40, z: (rand() - 0.5) * 40 } : null,
      });
      world.update(r < 0.02 ? 5 : 1 / 30, t);
      world.bodyInfo?.(null);
    }
    assertFiniteWorld(ctx.world);
  });

  it('manual mode moves the car with throttle and stops with brake', () => {
    world.setEasyMode?.(false);
    let t = 0;
    for (let i = 0; i < 120; i++) {
      t += 1 / 60;
      world.setDriveInput?.(frame({ throttle: 1 }));
      world.update(1 / 60, t);
    }
    const moving = world.bodyInfo?.(null) ?? '';
    expect(moving).not.toContain('0 km/h');
    for (let i = 0; i < 240; i++) {
      t += 1 / 60;
      world.setDriveInput?.(frame({ brake: true }));
      world.update(1 / 60, t);
    }
    expect(world.bodyInfo?.(null)).toContain('0 km/h');
    assertFiniteWorld(ctx.world);
  });
});
