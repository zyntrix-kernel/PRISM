import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { clamp01, damp, inverseLerp, smoothstep } from "./easing";
import { SeededRandom } from "./random";
import { ScienceShowcase } from "./science";
import { CINEMATIC_POST_FRAGMENT } from "./shaders";
import {
  INTRO_CUES,
  INTRO_PHASES,
  TOTAL_TIMELINE_MS,
  getPhase,
  resolveScene,
} from "./timeline";
import {
  createQualityState,
  downgradeQuality,
} from "./quality";
import type {
  IntroEngine,
  IntroEngineOptions,
  IntroMemberIndex,
  IntroPointerState,
  IntroQualityState,
  IntroScene,
} from "./types";

const DEFAULT_DURATION = 16000;
const DEFAULT_SEED = 0x5a17c0de;

const PHASE_LABELS: Record<IntroScene, string> = {
  boot: "CALIBRATING THE OBSERVABLE",
  physics: "PHYSICS / MOTION / FORCE",
  chemistry: "CHEMISTRY / ATOMS / BONDS",
  mathematics: "MATHEMATICS / PATTERNS / SPACE",
  synthesis: "SYNTHESIZING THE SCIENCE",
  labs: "ZYNASH LABS",
  prism: "PRISM",
  team: "THE PEOPLE BEHIND THE PROJECTION",
  launch: "ENTERING SPATIAL INTERFACE",
  complete: "PRISM ONLINE",
};

export class PrismCinematicEngine implements IntroEngine {
  readonly canvas: HTMLCanvasElement;

  private readonly options: IntroEngineOptions;
  private readonly scene3d = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
  private readonly pointer: IntroPointerState = {
    targetX: 0,
    targetY: 0,
    x: 0,
    y: 0,
    velocityX: 0,
    velocityY: 0,
  };

  private readonly world = new THREE.Group();
  private readonly science: ScienceShowcase;
  private readonly keyLight: THREE.PointLight;
  private readonly rimLight: THREE.PointLight;
  private readonly random: SeededRandom;

  private renderer: THREE.WebGLRenderer | null = null;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private postPass: ShaderPass | null = null;
  private outputPass: OutputPass | null = null;

  private animationFrame = 0;
  private lastFrameAt = 0;
  private elapsedMs = 0;
  private fps = 60;

  private running = false;
  private paused = false;
  private disposed = false;
  private completed = false;
  private fallback = false;

  private lastScene: IntroScene | null = null;
  private lastMember: IntroMemberIndex = -1;
  private cueIndex = 0;

  private qualityState: IntroQualityState;
  private slowFrameAccumulator = 0;
  private slowFrameSamples = 0;
  private reducedMotion: boolean;
  private previousTimelineTime = -1;
  private scienceFaulted = false;
  private renderFaulted = false;

  private readonly onPointerMove = (event: PointerEvent) => {
    if (this.disposed) return;

    this.pointer.targetX =
      event.clientX / Math.max(1, window.innerWidth) - 0.5;
    this.pointer.targetY =
      event.clientY / Math.max(1, window.innerHeight) - 0.5;
  };

  private readonly onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      this.pause();
      return;
    }

    if (this.running && this.paused) {
      this.resume();
    }
  };

  constructor(options: IntroEngineOptions) {
    this.options = options;
    this.canvas = options.canvas;
    this.reducedMotion = Boolean(
      options.reducedMotion ??
        (typeof window !== "undefined" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches),
    );

    this.random = new SeededRandom(options.seed ?? DEFAULT_SEED);
    this.qualityState = createQualityState(
      options.quality ?? "auto",
      this.reducedMotion,
    );

    this.science = new ScienceShowcase(
      this.qualityState.profile,
      this.random,
    );

    this.keyLight = new THREE.PointLight("#a7dcff", 18, 38, 1.8);
    this.keyLight.position.set(0, 4, 8);

    this.rimLight = new THREE.PointLight("#3169ff", 12, 32, 2);
    this.rimLight.position.set(-8, -2, -4);

    this.setupScene();
    this.setupEvents();
  }

  get isRunning(): boolean {
    return this.running && !this.paused && !this.completed;
  }

  get scene(): IntroScene {
    return this.lastScene ?? "boot";
  }

  get member(): IntroMemberIndex {
    return this.lastMember;
  }

  get progress(): number {
    return clamp01(
      this.elapsedMs / Math.max(1, this.options.durationMs || DEFAULT_DURATION),
    );
  }

  get quality(): IntroQualityState {
    return this.qualityState;
  }

  start(): void {
    if (this.running || this.completed || this.disposed) return;

    this.running = true;
    this.paused = false;
    this.lastFrameAt = performance.now();
    this.animationFrame = requestAnimationFrame(this.tick);
  }

  pause(): void {
    if (!this.running || this.paused) return;

    this.paused = true;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }
  }

  resume(): void {
    if (!this.running || !this.paused || this.disposed) return;

    this.paused = false;
    this.lastFrameAt = performance.now();
    this.animationFrame = requestAnimationFrame(this.tick);
  }

  skip(): void {
    if (this.disposed || this.completed) return;

    this.elapsedMs = this.options.durationMs || DEFAULT_DURATION;
    this.lastScene = "complete";
    this.lastMember = 3;
    this.completed = true;
    this.running = false;

    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }

    this.options.onSceneChange?.("complete", 3);
    this.options.onProgress?.(1, PHASE_LABELS.complete);
    this.options.onComplete?.();
  }

  dispose(): void {
    if (this.disposed) return;

    this.disposed = true;
    this.running = false;

    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }

    window.removeEventListener("resize", this.resize);
    window.removeEventListener("pointermove", this.onPointerMove);
    document.removeEventListener(
      "visibilitychange",
      this.onVisibilityChange,
    );

    this.science.dispose();
    this.composer?.dispose();
    this.renderer?.dispose();
    this.scene3d.clear();
  }

  private setupScene(): void {
    this.camera.position.set(0, 1.8, 14);
    this.camera.lookAt(0, 0, 0);

    this.scene3d.fog = new THREE.FogExp2("#020916", 0.024);
    this.scene3d.add(
      this.world,
      this.keyLight,
      this.rimLight,
    );
    this.world.add(this.science.group);

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false,
        stencil: false,
        depth: true,
      });

      this.renderer.setPixelRatio(this.qualityState.dpr);
      this.renderer.setSize(
        Math.max(1, this.canvas.clientWidth || window.innerWidth),
        Math.max(1, this.canvas.clientHeight || window.innerHeight),
        false,
      );
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.18;

      if (this.qualityState.profile.postFx) {
        this.setupPostFx();
      }
    } catch {
      this.fallback = true;
      this.renderer = null;
    }

    this.resize();
    this.options.onSceneChange?.("boot", -1);
  }

  private setupPostFx(): void {
    if (!this.renderer) return;

    try {
      const size = new THREE.Vector2(
        Math.max(1, window.innerWidth),
        Math.max(1, window.innerHeight),
      );

      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(
        new RenderPass(this.scene3d, this.camera),
      );

      this.bloom = new UnrealBloomPass(
        size,
        this.qualityState.profile.bloomStrength,
        this.qualityState.profile.bloomRadius,
        this.qualityState.profile.bloomThreshold,
      );

      this.postPass = new ShaderPass({
        uniforms: {
          tDiffuse: { value: null },
          uResolution: { value: size.clone() },
          uTime: { value: 0 },
          uChromatic: { value: 0.003 },
          uVignette: { value: 0.2 },
          uFlash: { value: 0 },
        },
        vertexShader: [
          "varying vec2 vUv;",
          "void main() {",
          "  vUv = uv;",
          "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
          "}",
        ].join("\n"),
        fragmentShader: CINEMATIC_POST_FRAGMENT,
      });

      this.outputPass = new OutputPass();

      this.composer.addPass(this.bloom);
      this.composer.addPass(this.postPass);
      this.composer.addPass(this.outputPass);
    } catch {
      this.composer = null;
      this.bloom = null;
      this.postPass = null;
      this.outputPass = null;
    }
  }

  private readonly resize = () => {
    const width = Math.max(
      1,
      this.canvas.clientWidth || window.innerWidth,
    );
    const height = Math.max(
      1,
      this.canvas.clientHeight || window.innerHeight,
    );

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    if (!this.renderer) return;

    this.renderer.setPixelRatio(this.qualityState.dpr);
    this.renderer.setSize(width, height, false);
    this.composer?.setSize(width, height);
    this.bloom?.setSize(width, height);

    const resolution = this.postPass?.uniforms.uResolution?.value;
    if (resolution instanceof THREE.Vector2) {
      resolution.set(width, height);
    }
  };

  private readonly tick = (now: number) => {
    if (this.disposed || !this.running || this.paused) return;

    try {
      this.runFrame(now);
    } catch (error) {
      /*
       * Last-resort circuit breaker: keep the cinematic timeline alive even
       * when an unexpected browser/GPU issue escapes a subsystem guard.
       */
      console.error("[PRISM] cinematic frame recovered from runtime error", error);
      this.fallback = true;
      this.elapsedMs += 16.67;

      const duration = this.options.durationMs || DEFAULT_DURATION;
      const progress = clamp01(this.elapsedMs / Math.max(1, duration));
      const timelineTime = progress * TOTAL_TIMELINE_MS;
      const resolved = resolveScene(timelineTime);

      this.commitScene(resolved.scene, resolved.member);
      this.options.onProgress?.(progress, PHASE_LABELS[resolved.scene]);

      if (progress >= 1) {
        this.completed = true;
        this.running = false;
        this.options.onSceneChange?.("complete", 3);
        this.options.onProgress?.(1, PHASE_LABELS.complete);
        this.options.onComplete?.();
        return;
      }
    }

    if (this.running && !this.paused && !this.completed && !this.disposed) {
      this.animationFrame = requestAnimationFrame(this.tick);
    }
  };

  private runFrame = (now: number) => {
    const delta = Math.min(
      0.05,
      Math.max(0.0001, (now - this.lastFrameAt) / 1000),
    );
    this.lastFrameAt = now;

    this.fps += (1 / delta - this.fps) * 0.05;
    this.slowFrameAccumulator += this.fps;
    this.slowFrameSamples += 1;

    if (this.slowFrameSamples >= 120) {
      const average = this.slowFrameAccumulator / this.slowFrameSamples;
      this.slowFrameAccumulator = 0;
      this.slowFrameSamples = 0;

      if (
        average < 38 &&
        this.qualityState.actualTier !== "low"
      ) {
        this.qualityState = downgradeQuality(this.qualityState);
        this.renderer?.setPixelRatio(this.qualityState.dpr);

        if (!this.qualityState.profile.postFx && this.composer) {
          this.composer.dispose();
          this.composer = null;
          this.bloom = null;
          this.postPass = null;
          this.outputPass = null;
        }
      }
    }

    this.elapsedMs += delta * 1000;

    const normalizedProgress = clamp01(
      this.elapsedMs /
        Math.max(
          1,
          this.options.durationMs || DEFAULT_DURATION,
        ),
    );
    const timelineTime = normalizedProgress * TOTAL_TIMELINE_MS;
    const resolved = resolveScene(timelineTime);
    const phase = getPhase(timelineTime);
    const phaseProgress = clamp01(
      (timelineTime - phase.start) /
        Math.max(1, phase.end - phase.start),
    );

    this.commitScene(resolved.scene, resolved.member);
    this.emitCues(timelineTime);

    this.pointer.x = damp(
      this.pointer.x,
      this.pointer.targetX,
      this.reducedMotion ? 18 : 7,
      delta,
    );
    this.pointer.y = damp(
      this.pointer.y,
      this.pointer.targetY,
      this.reducedMotion ? 18 : 7,
      delta,
    );

    const energy = this.computeEnergy(timelineTime);

    if (!this.scienceFaulted) {
      try {
        this.science.update({
          time: timelineTime / 1000,
          delta,
          scene: resolved.scene,
          phase: phaseProgress,
          energy,
          pointer: this.pointer,
        });
      } catch (error) {
        /*
         * The intro is a presentation layer. A failure in one procedural
         * visual system must never kill the semantic timeline or handoff.
         */
        this.scienceFaulted = true;
        console.error("[PRISM] science showcase disabled after runtime error", error);
      }
    }

    this.animateCamera(timelineTime, delta, resolved.scene, energy);
    this.animateLights(timelineTime, resolved.scene, energy);
    this.updatePostFx(timelineTime, energy, resolved.scene);

    if (!this.fallback && !this.renderFaulted) {
      try {
        if (
          this.composer &&
          this.qualityState.profile.postFx
        ) {
          this.composer.render();
        } else {
          this.renderer?.render(this.scene3d, this.camera);
        }
      } catch (error) {
        this.renderFaulted = true;
        this.fallback = true;
        console.error("[PRISM] WebGL render path disabled after runtime error", error);
      }
    }

    this.options.onProgress?.(
      normalizedProgress,
      PHASE_LABELS[resolved.scene],
    );

    if (
      this.elapsedMs >=
        (this.options.durationMs || DEFAULT_DURATION) &&
      !this.completed
    ) {
      this.completed = true;
      this.running = false;
      this.options.onSceneChange?.("complete", 3);
      this.options.onProgress?.(1, PHASE_LABELS.complete);
      this.options.onComplete?.();
      return;
    }

  };

  private computeEnergy(timelineTime: number): number {
    const physics = inverseLerp(700, 3000, timelineTime);
    const chemistry = inverseLerp(2750, 5250, timelineTime);
    const math = inverseLerp(5000, 7500, timelineTime);
    const synthesis = inverseLerp(7300, 9500, timelineTime);
    const prism = inverseLerp(10250, 11850, timelineTime);
    const launch = inverseLerp(14500, 16000, timelineTime);

    return clamp01(
      Math.max(
        physics * 0.92,
        chemistry * 0.9,
        math * 0.96,
        synthesis,
        prism * 0.76,
        launch,
      ),
    );
  }

  private commitScene(
    scene: IntroScene,
    member: IntroMemberIndex,
  ): void {
    if (
      scene === this.lastScene &&
      member === this.lastMember
    ) {
      return;
    }

    this.lastScene = scene;
    this.lastMember = member;
    this.options.onSceneChange?.(scene, member);
  }

  private emitCues(timelineTime: number): void {
    while (
      this.cueIndex <
        INTRO_CUES.length &&
      timelineTime >=
        INTRO_CUES[this.cueIndex].at
    ) {
      const cue = INTRO_CUES[this.cueIndex];

      window.dispatchEvent(
        new CustomEvent("prism:intro-cue", {
          detail: {
            id: cue.id,
            scene: cue.scene,
            member: cue.member ?? -1,
            label: cue.label ?? PHASE_LABELS[cue.scene],
          },
        }),
      );

      this.cueIndex += 1;
    }

    if (
      this.previousTimelineTime >= 0 &&
      timelineTime < this.previousTimelineTime
    ) {
      this.cueIndex = 0;
    }

    this.previousTimelineTime = timelineTime;
  }

  private animateCamera(
    timelineTime: number,
    delta: number,
    scene: IntroScene,
    energy: number,
  ): void {
    const p = clamp01(
      (timelineTime - 14800) / 1200,
    );

    let targetX = 0;
    let targetY = 0.3;
    let targetZ = 13.4;
    let targetFov = 50;

    if (scene === "physics") {
      targetX = -1.3;
      targetY = 0.6;
      targetZ = 12.4;
      targetFov = 53;
    } else if (scene === "chemistry") {
      targetX = 0.35;
      targetY = 0.15;
      targetZ = 10.9;
      targetFov = 51;
    } else if (scene === "mathematics") {
      targetX = 0.9;
      targetY = 0.5;
      targetZ = 11.2;
      targetFov = 52;
    } else if (scene === "synthesis") {
      targetY = 0.1;
      targetZ = 9.6;
      targetFov = 47;
    } else if (scene === "labs") {
      targetZ = 10.8;
      targetFov = 50;
    } else if (scene === "prism") {
      targetY = 0.15;
      targetZ = 8.8;
      targetFov = 48;
    } else if (scene === "team") {
      targetX = 0.25;
      targetY = 0.35;
      targetZ = 10.8;
      targetFov = 52;
    } else if (scene === "launch" || scene === "complete") {
      const cinematic = smoothstep(p);
      targetZ = THREE.MathUtils.lerp(14.5, 3.8, cinematic);
      targetY = THREE.MathUtils.lerp(1.5, 0.05, cinematic);
      targetFov = THREE.MathUtils.lerp(47, 67, cinematic);
    }

    const pointerX = this.pointer.x * 1.15;
    const pointerY = this.pointer.y * -0.8;

    this.camera.position.x = damp(
      this.camera.position.x,
      targetX + pointerX,
      this.reducedMotion ? 20 : 4.2,
      delta,
    );
    this.camera.position.y = damp(
      this.camera.position.y,
      targetY + pointerY,
      this.reducedMotion ? 20 : 4.2,
      delta,
    );
    this.camera.position.z = damp(
      this.camera.position.z,
      targetZ,
      this.reducedMotion ? 20 : 3.8,
      delta,
    );

    const lookAt = new THREE.Vector3(
      pointerX * 0.32,
      0.15 + Math.sin(timelineTime * 0.00055) * 0.08,
      0,
    );
    this.camera.lookAt(lookAt);

    this.camera.fov = damp(
      this.camera.fov,
      targetFov,
      this.reducedMotion ? 20 : 3.6,
      delta,
    );
    this.camera.updateProjectionMatrix();

    this.world.rotation.y = damp(
      this.world.rotation.y,
      pointerX * 0.028,
      4.5,
      delta,
    );
    this.world.rotation.x = damp(
      this.world.rotation.x,
      pointerY * 0.018 + Math.sin(timelineTime * 0.00017) * 0.01,
      4.5,
      delta,
    );

    if (scene === "launch" || scene === "complete") {
      this.world.rotation.z = damp(
        this.world.rotation.z,
        p * 0.24,
        2.8,
        delta,
      );
    } else {
      this.world.rotation.z = damp(
        this.world.rotation.z,
        0,
        2.8,
        delta,
      );
    }

    this.rimLight.intensity = 9 + energy * 8;
  }

  private animateLights(
    timelineTime: number,
    scene: IntroScene,
    energy: number,
  ): void {
    const chemistryPulse = scene === "chemistry"
      ? 1 + Math.sin(timelineTime * 0.0044) * 0.35
      : 1;

    this.keyLight.intensity = 9 + energy * 15;
    this.keyLight.position.x =
      Math.sin(timelineTime * 0.00033) * 7;
    this.keyLight.position.z =
      6 + Math.cos(timelineTime * 0.00027) * 3;

    this.rimLight.intensity =
      (8 + energy * 11) * chemistryPulse;
    this.rimLight.position.y =
      -1 + Math.sin(timelineTime * 0.0004) * 3;
  }

  private updatePostFx(
    timelineTime: number,
    energy: number,
    scene: IntroScene,
  ): void {
    if (!this.postPass) return;

    const phase = getPhase(timelineTime);
    const local = clamp01(
      (timelineTime - phase.start) /
        Math.max(1, phase.end - phase.start),
    );

    const boundary =
      phaseProgressPulse(local) *
      (scene === "boot" ? 0.2 : 0.55);

    this.postPass.uniforms.uTime.value = timelineTime / 1000;
    this.postPass.uniforms.uChromatic.value =
      0.0024 +
      energy * 0.0022 +
      boundary * 0.012;
    this.postPass.uniforms.uVignette.value =
      0.16 +
      energy * 0.2;
    this.postPass.uniforms.uFlash.value =
      boundary * 0.46 +
      (scene === "launch" ? energy * 0.22 : 0);

    if (this.bloom) {
      this.bloom.strength =
        this.qualityState.profile.bloomStrength *
        (0.72 + energy * 0.62);
      this.bloom.radius =
        this.qualityState.profile.bloomRadius;
    }
  }
}

function phaseProgressPulse(progress: number): number {
  const edgeIn = Math.min(progress / 0.12, 1);
  const edgeOut = Math.min((1 - progress) / 0.12, 1);
  return Math.max(
    smoothstep(edgeIn) * (1 - smoothstep(edgeIn * 0.82)),
    smoothstep(edgeOut) * (1 - smoothstep(edgeOut * 0.82)),
  );
}
