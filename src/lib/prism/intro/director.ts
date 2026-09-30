import * as THREE from "three";
import {
  damp,
  easeInOutCubic,
  easeOutBack,
  easeOutExpo,
  lerp,
  smoothstep,
} from "./easing";
import type {
  IntroPointerState,
  IntroScene,
} from "./types";

export interface DirectorTargets {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
  roll: number;
  fov: number;
}

export class IntroDirector {
  readonly camera: THREE.PerspectiveCamera;

  private readonly targetPosition =
    new THREE.Vector3();

  private readonly targetLook =
    new THREE.Vector3();

  private currentRoll = 0;
  private currentFov = 48;

  constructor(
    aspect: number,
  ) {
    this.camera =
      new THREE.PerspectiveCamera(
        48,
        aspect,
        0.1,
        1600,
      );

    this.camera.position.set(
      0,
      0,
      28,
    );
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(
    elapsedMs: number,
    dt: number,
    scene: IntroScene,
    pointer: IntroPointerState,
    energy: number,
    reducedMotion: boolean,
  ): void {
    const t =
      elapsedMs / 1000;

    let distance = 28;
    let x = 0;
    let y = 0;
    let lookX = 0;
    let lookY = 0;
    let fov = 48;
    let roll = 0;

    switch (scene) {
      case "boot":
        distance = 34;
        y = 1.6;
        fov = 43;
        break;

      case "field":
        distance =
          lerp(
            34,
            24,
            easeOutExpo(
              smoothstep(
                elapsedMs / 1300,
              ),
            ),
          );

        x =
          Math.sin(t * 0.31) *
          1.5;

        y =
          Math.cos(t * 0.42) *
          1.0;

        lookX =
          Math.sin(t * 0.18) *
          0.7;

        lookY =
          Math.cos(t * 0.23) *
          0.45;

        fov = 50;
        break;

      case "crystallize":
        distance =
          lerp(
            24,
            17,
            easeOutExpo(
              smoothstep(
                (elapsedMs - 2200) /
                  1300,
              ),
            ),
          );

        x =
          Math.sin(t * 0.6) *
          1.1;

        y =
          Math.cos(t * 0.47) *
          0.8;

        fov = 52;
        break;

      case "labs":
        distance = 19;
        x =
          Math.sin(t * 0.16) *
          0.65;

        y =
          Math.cos(t * 0.2) *
          0.4;

        fov = 45;
        break;

      case "prism":
        distance =
          lerp(
            20,
            13.5,
            easeOutBack(
              smoothstep(
                (elapsedMs - 5000) /
                  1100,
              ),
            ),
          );

        x =
          Math.sin(t * 0.35) *
          0.45;

        y =
          Math.cos(t * 0.42) *
          0.25;

        fov = 43;
        break;

      case "definition":
        distance = 15;
        x =
          Math.sin(t * 0.22) *
          0.25;

        y =
          Math.cos(t * 0.18) *
          0.18;

        fov = 44;
        break;

      case "team":
        distance = 17;

        x =
          Math.sin(t * 0.14) *
          0.35;

        y =
          Math.cos(t * 0.16) *
          0.22;

        fov = 46;
        break;

      case "launch": {
        const p =
          smoothstep(
            Math.max(
              0,
              Math.min(
                1,
                (elapsedMs - 10950) /
                  2250,
              ),
            ),
          );

        distance =
          lerp(
            17,
            3.5,
            easeInOutCubic(p),
          );

        fov =
          lerp(
            46,
            66,
            p,
          );

        x =
          Math.sin(
            t * 0.8,
          ) *
          (1 - p) *
          0.8;

        y =
          Math.cos(
            t * 0.7,
          ) *
          (1 - p) *
          0.55;

        roll =
          Math.sin(
            t * 1.3,
          ) *
          p *
          0.06;

        break;
      }

      case "complete":
        distance = 3;
        fov = 70;
        break;
    }

    const parallax =
      reducedMotion
        ? 0
        : 1;

    const pointerX =
      pointer.x *
      1.8 *
      parallax;

    const pointerY =
      pointer.y *
      1.2 *
      parallax;

    this.targetPosition.set(
      x + pointerX,
      y + pointerY,
      distance,
    );

    this.targetLook.set(
      lookX +
        pointer.x *
          0.55 *
          parallax,
      lookY -
        pointer.y *
          0.35 *
          parallax,
      energy *
        0.8,
    );

    const spring =
      reducedMotion
        ? 18
        : scene === "launch"
          ? 9
          : 5.6;

    this.camera.position.x =
      damp(
        this.camera.position.x,
        this.targetPosition.x,
        spring,
        dt,
      );

    this.camera.position.y =
      damp(
        this.camera.position.y,
        this.targetPosition.y,
        spring,
        dt,
      );

    this.camera.position.z =
      damp(
        this.camera.position.z,
        this.targetPosition.z,
        spring,
        dt,
      );

    this.currentFov =
      damp(
        this.currentFov,
        fov,
        8,
        dt,
      );

    this.currentRoll =
      damp(
        this.currentRoll,
        roll,
        8,
        dt,
      );

    this.camera.fov =
      this.currentFov;

    this.camera.rotation.z =
      this.currentRoll;

    this.camera.updateProjectionMatrix();

    const look =
      this.targetLook;

    this.camera.lookAt(
      look.x,
      look.y,
      look.z,
    );
  }
}
