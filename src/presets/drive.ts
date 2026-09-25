// DRIVE preset: arcade car on a neon circuit.
//
// Two driving modes:
// - MANUAL: screen-relative steering (pointer right = nose goes right on
//   screen), pinch-hold = gas, open palm / Space = brake.
// - EASY (point-and-go): point at the ground, pinch once to drop a pin,
//   pinch again to send the car (pure-pursuit autopilot), pinch once more
//   to cancel. A ghost marker previews where the pin will land.
//
// Physics convention (single, unit-tested): forward = (sin h, 0, cos h),
// heading increases screen-clockwise from above, steer > 0 = screen right.
// Reverse automatically counter-steers, like a real car.

import * as THREE from 'three';
import { disposeGroup, type BuilderCtx, type DriveFrameInput, type WorldAPI } from './types';
import { ParticlePool } from './particles';

export const TRACK_A = 9;
export const TRACK_B = 6;
const ARENA_RADIUS = 16;

const ACCEL = 9;
const BRAKE_DECEL = 18;
const DRAG = 0.9;
const ROLLING = 1.2;
const VMAX = 14;
const VMIN = -4;
const STEER_RATE = 0.16;

export interface CarState {
  x: number;
  z: number;
  heading: number;
  speed: number;
}

export interface DriveControl {
  /** -1 (screen left) .. +1 (screen right). */
  steer: number;
  /** Gas pedal 0..1 (analog for hands, binary for mouse/keys). */
  throttle: number;
  brake: boolean;
}

export function wrapPi(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** One arcade-physics step (mutates state). Pure math: fully unit-tested. */
export function stepCar(s: CarState, input: DriveControl, dt: number, maxSpeed = VMAX): void {
  if (input.brake) {
    const stop = Math.sign(s.speed) * BRAKE_DECEL * dt;
    s.speed = Math.abs(stop) > Math.abs(s.speed) ? 0 : s.speed - stop;
  } else {
    const thr = THREE.MathUtils.clamp(input.throttle, 0, 1);
    if (thr > 0) s.speed += thr * ACCEL * dt;
  }
  // Drag + rolling resistance always apply.
  s.speed -= s.speed * DRAG * dt;
  const roll = Math.sign(s.speed) * ROLLING * dt;
  s.speed = Math.abs(roll) > Math.abs(s.speed) ? 0 : s.speed - roll;
  s.speed = THREE.MathUtils.clamp(s.speed, VMIN, maxSpeed);
  // Screen-relative steering (invert in reverse, like a real car).
  s.heading += input.steer * s.speed * STEER_RATE * dt;
  s.x += Math.sin(s.heading) * s.speed * dt;
  s.z += Math.cos(s.heading) * s.speed * dt;
}

/** Elliptical track angle of a ground point (for lap counting). */
export function trackAngle(x: number, z: number): number {
  return Math.atan2(z / TRACK_B, x / TRACK_A);
}

/** Lap counter: counts forward wraps past the start line (phi = 0). */
export class LapTracker {
  laps = 0;
  lastLapTime = 0;
  lapStart = 0;
  private unwrapped = 0;
  private base = 0;
  private prevPhi = 0;
  private traveled = 0;
  private initialized = false;

  reset(now: number): void {
    this.laps = 0;
    this.lastLapTime = 0;
    this.lapStart = now;
    this.traveled = 0;
    this.initialized = false;
  }

  update(x: number, z: number, now: number): void {
    const phi = trackAngle(x, z);
    if (!this.initialized) {
      this.prevPhi = phi;
      this.base = phi;
      this.unwrapped = phi;
      this.initialized = true;
      return;
    }
    const d = wrapPi(phi - this.prevPhi);
    this.prevPhi = phi;
    this.unwrapped += d;
    this.traveled += Math.abs(d);
    const crossed = Math.floor((this.unwrapped - this.base) / (Math.PI * 2) + 1e-9);
    // The travel guard stops start-line straddling from farming laps.
    if (crossed > this.laps && this.traveled > Math.PI * 1.5) {
      this.laps = crossed;
      this.lastLapTime = now - this.lapStart;
      this.lapStart = now;
      this.traveled = 0;
    }
  }

  currentLapTime(now: number): number {
    return now - this.lapStart;
  }
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

export function buildDrive(ctx: BuilderCtx): WorldAPI {
  const { world, glowTex } = ctx;
  const grabbables: THREE.Object3D[] = [];
  const car: CarState = { x: TRACK_A, z: 0, heading: 0, speed: 0 };
  const laps = new LapTracker();
  let elapsed = 0;
  let easy = false;
  let selected: { x: number; z: number } | null = null;
  let driving = false;
  let input: DriveFrameInput = { steer: 0, throttle: 0, brake: false, actionPressed: false, ground: null };

  // ---- circuit decor ----------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(ARENA_RADIUS, 48),
    new THREE.MeshStandardMaterial({ color: 0x0b0e16, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  world.add(ground);

  const rail = (a: number, b: number, color: number): void => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const t = (i / 128) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(t) * a, 0.03, Math.sin(t) * b));
    }
    world.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }),
      ),
    );
  };
  rail(TRACK_A - 0.9, TRACK_B - 0.9, 0x00f0ff);
  rail(TRACK_A + 0.9, TRACK_B + 0.9, 0xff2fd6);

  // Start line + gantry.
  const startLine = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.02, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xf2f5ff }),
  );
  startLine.position.set(TRACK_A, 0.02, 0);
  world.add(startLine);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.6, emissive: 0x00f0ff, emissiveIntensity: 0.4 });
  for (const dz of [-1.4, 1.4]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.2, 10), postMat);
    post.position.set(TRACK_A, 1.1, dz);
    world.add(post);
  }
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.5, 3.0),
    new THREE.MeshBasicMaterial({ color: 0x101828 }),
  );
  banner.position.set(TRACK_A, 2.3, 0);
  world.add(banner);

  // Corner light posts around the outer rail.
  const postGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.6, 8);
  const postGlow = new THREE.MeshBasicMaterial({ color: 0x7cff6b });
  const posts = new THREE.InstancedMesh(postGeo, postGlow, 16);
  {
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * Math.PI * 2;
      dummy.position.set(Math.cos(t) * (TRACK_A + 1.6), 0.8, Math.sin(t) * (TRACK_B + 1.6));
      dummy.updateMatrix();
      posts.setMatrixAt(i, dummy.matrix);
    }
  }
  world.add(posts);

  // ---- the car ----------------------------------------------------------
  const carGroup = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xff4d2e,
    emissive: 0xff4d2e,
    emissiveIntensity: 0.35,
    roughness: 0.35,
    metalness: 0.3,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.32, 1.9), bodyMat);
  body.position.y = 0.42;
  carGroup.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.28, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.2, metalness: 0.6 }),
  );
  cabin.position.set(0, 0.68, -0.15);
  carGroup.add(cabin);
  // Headlights / taillight bar.
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
  for (const dx of [-0.28, 0.28]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.06), lightMat);
    hl.position.set(dx, 0.42, 0.97);
    carGroup.add(hl);
  }
  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.09, 0.06),
    new THREE.MeshBasicMaterial({ color: 0xff2233 }),
  );
  tail.position.set(0, 0.46, -0.97);
  carGroup.add(tail);
  // Wheels (front pair steers visually).
  const wheelGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.16, 18);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.9 });
  const wheels: THREE.Mesh[] = [];
  const frontWheels: THREE.Mesh[] = [];
  for (const [dx, dz, front] of [[-0.5, 0.62, true], [0.5, 0.62, true], [-0.5, -0.62, false], [0.5, -0.62, false]] as Array<[number, number, boolean]>) {
    const pivot = new THREE.Group();
    pivot.position.set(dx, 0.21, dz);
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    pivot.add(wheel);
    carGroup.add(pivot);
    wheels.push(wheel);
    if (front) frontWheels.push(pivot as unknown as THREE.Mesh);
  }
  // Underglow.
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  glow.scale.set(2.6, 1.4, 1);
  glow.position.y = 0.06;
  carGroup.add(glow);
  carGroup.name = 'Streetglow GT';
  carGroup.userData.grabbable = false; // pinch is the gas pedal, not a grab
  world.add(carGroup);
  grabbables.push(carGroup);

  // Easy-mode markers: ghost preview + locked pin.
  const ghost = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.45, 32),
    new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
  );
  ghost.rotation.x = -Math.PI / 2;
  ghost.visible = false;
  world.add(ghost);
  const pin = new THREE.Mesh(
    new THREE.RingGeometry(0.35, 0.55, 32),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.95, side: THREE.DoubleSide }),
  );
  pin.rotation.x = -Math.PI / 2;
  pin.visible = false;
  world.add(pin);

  // Tire smoke: one pooled Points draw call, spawned on slides + hard brakes.
  const smoke = new ParticlePool(240, 0xb8c4d4, 0.4);
  world.add(smoke.points);
  let lastSteer = 0;
  let brakingNow = false;

  const facts = 'Streetglow GT · pinch = gas · release to coast · Space = brake';

  return {
    grabbables,
    background: 0x05070f,
    view: { distance: 13, pitch: 0.95, yaw: 0 },
    setDriveInput(frame: DriveFrameInput): void {
      input = frame;
    },
    setEasyMode(on: boolean): void {
      easy = on;
      if (!on) {
        selected = null;
        driving = false;
      }
    },
    isEasyMode(): boolean {
      return easy;
    },
    update(dt: number): void {
      // Sanitize: a NaN anywhere must degrade to a parked car, never poison
      // the simulation (NaN headings would silently strand every mesh).
      if (!Number.isFinite(input.steer)) input.steer = 0;
      if (
        !Number.isFinite(car.x) ||
        !Number.isFinite(car.z) ||
        !Number.isFinite(car.heading) ||
        !Number.isFinite(car.speed)
      ) {
        car.x = TRACK_A;
        car.z = 0;
        car.heading = 0;
        car.speed = 0;
      }
      if (easy) {
        // Pinch-state machine: drop pin → launch → cancel.
        if (input.actionPressed) {
          if (!selected && input.ground) {
            selected = { ...input.ground };
          } else if (selected && !driving) {
            driving = true;
          } else if (driving) {
            driving = false;
            selected = null;
          }
        }
        if (driving && selected) {
          const dx = selected.x - car.x;
          const dz = selected.z - car.z;
          const dist = Math.hypot(dx, dz);
          // Capture radius generous enough that an overshooting approach
          // still terminates (kills the orbit-the-pin limit cycle); the
          // car then brakes to a stop on the pin.
          if (dist < 0.9) {
            driving = false;
            selected = null;
          } else {
            const desired = Math.atan2(dx, dz);
            const err = wrapPi(desired - car.heading);
            if (Math.abs(err) > 0.45) {
              // Aim phase: rotate toward the pin before driving. Turning
              // needs motion in the arcade model, so a pure slow-down
              // strategy deadlocks — rotate (nearly) in place instead.
              car.heading += Math.sign(err) * 1.9 * dt;
              car.speed += (0 - car.speed) * Math.min(1, 3 * dt);
            } else {
              // Drive phase: straight-line approach with early slowdown.
              const steer = THREE.MathUtils.clamp(err * 2.2, -1, 1);
              const targetSpeed = THREE.MathUtils.clamp((dist - 0.5) * 2.0, 0, 10);
              const go = car.speed < targetSpeed;
              lastSteer = steer;
              brakingNow = !go && car.speed > targetSpeed + 0.5;
              stepCar(
                car,
                {
                  steer,
                  throttle: go ? 1 : 0,
                  brake: brakingNow,
                },
                dt,
              );
            }
          }
        } else {
          stepCar(car, { steer: 0, throttle: 0, brake: true }, dt);
        }
        ghost.visible = !selected && !!input.ground;
        if (input.ground) ghost.position.set(input.ground.x, 0.03, input.ground.z);
        pin.visible = !!selected;
        if (selected) {
          const pulse = 1 + 0.12 * Math.sin(elapsed * 6);
          pin.scale.set(pulse, pulse, 1);
          pin.position.set(selected.x, 0.03, selected.z);
        }
      } else {
        selected = null;
        driving = false;
        ghost.visible = false;
        pin.visible = false;
        const offTrack =
          Math.abs(Math.hypot(car.x / TRACK_A, car.z / TRACK_B) - 1) > 0.32;
        lastSteer = input.steer;
        brakingNow = input.brake;
        stepCar(car, input, dt, offTrack ? 6 : VMAX);
        if (offTrack) car.speed -= car.speed * 2.2 * dt; // grass drag
      }

      // Tire smoke on slides and hard stops (visual only, pooled).
      if ((Math.abs(lastSteer) > 0.45 && Math.abs(car.speed) > 7) || (brakingNow && Math.abs(car.speed) > 8)) {
        const fx = Math.sin(car.heading);
        const fz = Math.cos(car.heading);
        for (const side of [-0.5, 0.5]) {
          smoke.spawn(
            car.x - fx * 0.9 + fz * side,
            0.15,
            car.z - fz * 0.9 - fx * side,
            -fx * car.speed * 0.12 + (Math.random() - 0.5),
            0.9,
            -fz * car.speed * 0.12 + (Math.random() - 0.5),
          );
        }
      }
      smoke.update(dt);

      // Arena clamp.
      const rr = Math.hypot(car.x, car.z);
      if (rr > ARENA_RADIUS) {
        car.x *= ARENA_RADIUS / rr;
        car.z *= ARENA_RADIUS / rr;
        car.speed *= 0.6;
      }

      elapsed += dt;
      laps.update(car.x, car.z, elapsed);

      // Sync meshes.
      carGroup.position.set(car.x, 0, car.z);
      carGroup.rotation.y = car.heading;
      for (const w of wheels) w.rotation.x += (car.speed * dt) / 0.21;
      for (const f of frontWheels) f.rotation.y = input.steer * 0.45;
    },
    reset(): void {
      car.x = TRACK_A;
      car.z = 0;
      car.heading = 0;
      car.speed = 0;
      selected = null;
      driving = false;
      laps.reset(elapsed);
    },
    bodyInfo(): string | null {
      const kmh = Math.round(Math.abs(car.speed) * 7.2);
      const lapLine = `Lap ${laps.laps + 1} · ${formatTime(laps.currentLapTime(elapsed))}` +
        (laps.lastLapTime > 0 ? ` · last ${formatTime(laps.lastLapTime)}` : '');
      if (easy) {
        const hint = driving ? 'pinch to STOP' : selected ? 'pinch again to GO' : 'point + pinch to drop a pin';
        return `Drive · EASY · ${kmh} km/h · ${lapLine} · ${hint}`;
      }
      return `Drive — ${kmh} km/h · ${lapLine} · ${facts}`;
    },
    dispose(): void {
      disposeGroup(world);
    },
  };
}
