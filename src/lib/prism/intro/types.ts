import type * as THREE from "three";

export type IntroQuality = "auto" | "ultra" | "high" | "medium" | "low";

export type IntroScene =
  | "boot"
  | "physics"
  | "chemistry"
  | "mathematics"
  | "information"
  | "synthesis"
  | "labs"
  | "prism"
  | "team"
  | "launch"
  | "complete";

export type IntroMemberIndex = -1 | 0 | 1 | 2 | 3;

export interface IntroTeamMember {
  readonly handle: string;
  readonly name: string;
  readonly role?: string;
}

export interface IntroTimelineCue {
  readonly id: string;
  readonly at: number;
  readonly scene: IntroScene;
  readonly member?: IntroMemberIndex;
  readonly label?: string;
}

export interface IntroQualityProfile {
  readonly pixelRatio: number;
  readonly starCount: number;
  readonly dustCount: number;
  readonly lineCount: number;
  readonly bloomStrength: number;
  readonly bloomRadius: number;
  readonly bloomThreshold: number;
  readonly postFx: boolean;
  readonly motionScale: number;
}

export interface IntroEngineOptions {
  readonly canvas: HTMLCanvasElement;
  readonly durationMs: number;
  readonly quality?: IntroQuality;
  readonly reducedMotion?: boolean;
  readonly seed?: number;
  readonly onSceneChange?: (
    scene: IntroScene,
    member: IntroMemberIndex,
  ) => void;
  readonly onProgress?: (
    progress: number,
    label: string,
  ) => void;
  readonly onComplete?: () => void;
}

export interface IntroPointerState {
  targetX: number;
  targetY: number;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
}

export interface IntroQualityState {
  profile: IntroQualityProfile;
  actualTier: Exclude<IntroQuality, "auto">;
  fps: number;
  dpr: number;
}

export interface IntroEngine {
  readonly isRunning: boolean;
  readonly scene: IntroScene;
  readonly member: IntroMemberIndex;
  readonly progress: number;
  readonly quality: IntroQualityState;

  start(): void;
  pause(): void;
  resume(): void;
  skip(): void;
  dispose(): void;
}

export type IntroMesh = THREE.Object3D;
