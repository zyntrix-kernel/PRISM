
import * as THREE from "three";
import {
  EffectComposer,
  RenderPass,
  ShaderPass,
  UnrealBloomPass,
  OutputPass,
} from "three/examples/jsm/postprocessing/EffectComposer.js";
import { IntroDirector } from "./director";
import {
  clamp01,
  damp,
  easeInExpo,
  easeOutExpo,
  easeOutQuint,
  inverseLerp,
  lerp,
  smoothstep,
  smootherstep,
} from "./easing";
import { SeededRandom } from "./random";
import {
  AtmosphereSystem,
  BurstSystem,
  CrystalSystem,
  DustSystem,
  EnergyRibbonSystem,
  PortalSystem,
  SignalOrbitSystem,
  SpatialGridSystem,
  StarFieldSystem,
} from "./systems";
import { CINEMATIC_POST_FRAGMENT } from "./shaders";
import {
  getPhase,
  phaseProgress,
  resolveScene,
  INTRO_CUES,
} from "./timeline";
import {
  createQualityState,
  downgradeQuality,
  qualityLabel,
} from "./quality";
import type {
  IntroEngine,
  IntroEngineOptions,
  IntroMemberIndex,
  IntroPointerState,
  IntroQualityState,
  IntroScene,
} from "./types";

const DEFAULT_SEED = 0x5a17c0de;

const PHASE_LABELS: Record<
  IntroScene,
  string
> = {
  boot: "INITIALIZING SPATIAL ENVIRONMENT",
  field: "BUILDING SPATIAL FIELD",
  crystallize: "STRUCTURING OPTICAL CORE",
  labs: "ZYNASH LABS",
  prism: "PRISM",
  definition: "PROJECTED REALITY INTERACTION & SPATIAL MANIPULATION",
  team: "THE TEAM",
  launch: "ENTERING PRISM",
  complete: "EXPERIENCE",
};

const TOTAL_TIMELINE_MS = 13200;

export class PrismCinematicEngine
  implements IntroEngine
{
  readonly canvas: HTMLCanvasElement;

  private readonly options: IntroEngineOptions;
  private readonly scene3d =
    new THREE.Scene();
  private readonly director: IntroDirector;

  private readonly pointer: IntroPointerState = {
    targetX: 0,
    targetY: 0,
    x: 0,
    y: 0,
    velocityX: 0,
    velocityY: 0,
  };

  private readonly world =
    new THREE.Group();

  private readonly systems: Array<{
    update: (
      time: number,
      energy: number,
      scene: IntroScene,
    ) => void;
    dispose: () => void;
  }> = [];

  private readonly atmosphere:
    AtmosphereSystem;

  private readonly starfield:
    StarFieldSystem;

  private readonly dust:
    DustSystem;

  private readonly grid:
    SpatialGridSystem;

  private readonly ribbons:
    EnergyRibbonSystem;

  private readonly crystal:
    CrystalSystem;

  private readonly signal:
    SignalOrbitSystem;

  private readonly burst:
    BurstSystem;

  private readonly portal:
    PortalSystem;

  private readonly random:
    SeededRandom;

  private renderer:
    THREE.WebGLRenderer | null = null;

  private composer:
    EffectComposer | null = null;

  private bloom:
    UnrealBloomPass | null = null;

  private postPass:
    ShaderPass | null = null;

  private outputPass:
    OutputPass | null = null;

  private animationFrame =
    0;

  private lastFrameAt = 0;
  private elapsedMs = 0;
  private fps = 60;

  private running = false;
  private paused = false;
  private disposed = false;
  private fallback = false;
  private completed = false;

  private lastScene:
    IntroScene | null = null;

  private lastMember:
    IntroMemberIndex = -1;

  private cueIndex = 0;

  private qualityState:
    IntroQualityState;

  private slowFrameAccumulator = 0;
  private slowFrameSamples = 0;

  private readonly reducedMotion: boolean;

  private readonly onPointerMove =
    (event: PointerEvent) => {
      if (this.disposed) return;

      this.pointer.targetX =
        event.clientX /
          Math.max(
            1,
            window.innerWidth,
          ) -
        0.5;

      this.pointer.targetY =
        event.clientY /
          Math.max(
            1,
            window.innerHeight,
          ) -
        0.5;
    };

  private readonly onVisibilityChange =
    () => {
      if (
        document.visibilityState ===
        "hidden"
      ) {
        this.pause();
      } else if (
        this.running &&
        this.paused
      ) {
        this.resume();
      }
    };

  constructor(
    options: IntroEngineOptions,
  ) {
    this.options =
      options;

    this.canvas =
      options.canvas;

    this.reducedMotion =
      Boolean(
        options.reducedMotion ??
          (
            typeof window !==
            "undefined" &&
            window.matchMedia(
              "(prefers-reduced-motion: reduce)",
            ).matches
          ),
      );

    this.random =
      new SeededRandom(
        options.seed ??
          DEFAULT_SEED,
      );

    this.qualityState =
      createQualityState(
        options.quality ??
          "auto",
        this.reducedMotion,
      );

    this.director =
      new IntroDirector(
        this.aspect(),
      );

    /*
     * Build all cinematic systems
     * before starting the clock.
     */
    this.atmosphere =
      new AtmosphereSystem();

    this.starfield =
      new StarFieldSystem(
        this.qualityState.profile,
        this.random,
      );

    this.dust =
      new DustSystem(
        this.qualityState.profile,
        this.random,
      );

    this.grid =
      new SpatialGridSystem();

    this.ribbons =
      new EnergyRibbonSystem(
        this.qualityState.profile
          .lineCount,
        this.random,
      );

    this.crystal =
      new CrystalSystem(
        this.random,
      );

    this.signal =
      new SignalOrbitSystem(
        this.qualityState.profile,
        this.random,
      );

    this.burst =
      new BurstSystem(
        this.random,
      );

    this.portal =
      new PortalSystem();

    this.setupScene();
    this.setupEvents();
  }

  get isRunning(): boolean {
    return (
      this.running &&
      !this.paused &&
      !this.completed
    );
  }

  get scene(): IntroScene {
    return (
      this.lastScene ??
      "boot"
    );
  }

  get member(): IntroMemberIndex {
    return this.lastMember;
  }

  get progress(): number {
    return clamp01(
      this.elapsedMs /
        Math.max(
          1,
          this.options.durationMs,
        ),
    );
  }

  get quality(): IntroQualityState {
    return this.qualityState;
  }

  /* =======================================================
     SETUP
     ======================================================= */

  private setupScene(): void {
    this.scene3d.add(
      this.world,
    );

    this.world.add(
      this.starfield.points,
      this.dust.points,
      this.grid.group,
      this.ribbons.group,
      this.signal.group,
      this.crystal.group,
      this.burst.points,
    );

    this.scene3d.add(
      this.atmosphere.group,
    );

    this.scene3d.add(
      this.portal.mesh,
    );

    this.atmosphere.plane &&
      void this.atmosphere.plane;

    try {
      this.renderer =
        new THREE.WebGLRenderer({
          canvas:
            this.canvas,
          alpha: true,
          antialias: true,
          powerPreference:
            "high-performance",
          preserveDrawingBuffer:
            false,
          stencil: false,
          depth: true,
        });

      this.renderer.setPixelRatio(
        this.qualityState.dpr,
      );

      this.renderer.setSize(
        this.canvas.clientWidth ||
          window.innerWidth,
        this.canvas.clientHeight ||
          window.innerHeight,
        false,
      );

      this.renderer.setClearColor(
        0x000000,
        0,
      );

      this.renderer.outputColorSpace =
        THREE.SRGBColorSpace;

      this.renderer.toneMapping =
        THREE.ACESFilmicToneMapping;

      this.renderer.toneMappingExposure =
        1.14;

      if (
        this.qualityState.profile.postFx
      ) {
        this.setupPostFx();
      }
    } catch {
      /*
       * The typography timeline remains
       * fully functional without WebGL.
       */
      this.fallback = true;
      this.renderer = null;
    }

    this.resize();

    this.options.onSceneChange?.(
      "boot",
      -1,
    );
  }

  private setupPostFx(): void {
    if (!this.renderer) return;

    try {
      this.composer =
        new EffectComposer(
          this.renderer,
        );

      const renderPass =
        new RenderPass(
          this.scene3d,
          this.director.camera,
        );

      this.bloom =
        new UnrealBloomPass(
          new THREE.Vector2(
            window.innerWidth,
            window.innerHeight,
          ),
          this.qualityState.profile
            .bloomStrength,
          this.qualityState.profile
            .bloomRadius,
          this.qualityState.profile
            .bloomThreshold,
        );

      this.postPass =
        new ShaderPass({
          uniforms: {
            tDiffuse: {
              value: null,
            },
            uResolution: {
              value:
                new THREE.Vector2(
                  window.innerWidth,
                  window.innerHeight,
                ),
            },
            uTime: {
              value: 0,
            },
            uChromatic: {
              value: 0.0055,
            },
            uVignette: {
              value: 0.25,
            },
            uFlash: {
              value: 0,
            },
          },
          vertexShader: [
            "varying vec2 vUv;",
            "void main() {",
            "  vUv = uv;",
            "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
            "}",
          ].join("\n"),
          fragmentShader:
            CINEMATIC_POST_FRAGMENT,
        });

      this.outputPass =
        new OutputPass();

      this.composer.addPass(
        renderPass,
      );

      this.composer.addPass(
        this.bloom,
      );

      this.composer.addPass(
        this.postPass,
      );

      this.composer.addPass(
        this.outputPass,
      );
    } catch {
      this.composer = null;
      this.bloom = null;
      this.postPass = null;
      this.outputPass = null;
    }
  }

  private setupEvents(): void {
    window.addEventListener(
      "resize",
      this.resize,
      { passive: true },
    );

    window.addEventListener(
      "pointermove",
      this.onPointerMove,
      { passive: true },
    );

    document.addEventListener(
      "visibilitychange",
      this.onVisibilityChange,
    );
  }

  /* =======================================================
     LIFECYCLE
     ======================================================= */

  start(): void {
    if (
      this.running ||
      this.disposed ||
      this.completed
    ) {
      return;
    }

    this.running = true;
    this.paused = false;
    this.lastFrameAt =
      performance.now();

    this.animationFrame =
      requestAnimationFrame(
        this.tick,
      );
  }

  pause(): void {
    if (
      !this.running ||
      this.paused
    ) {
      return;
    }

    this.paused = true;

    if (this.animationFrame) {
      cancelAnimationFrame(
        this.animationFrame,
      );
      this.animationFrame = 0;
    }
  }

  resume(): void {
    if (
      !this.running ||
      !this.paused ||
      this.disposed
    ) {
      return;
    }

    this.paused = false;
    this.lastFrameAt =
      performance.now();

    this.animationFrame =
      requestAnimationFrame(
        this.tick,
      );
  }

  skip(): void {
    if (
      this.completed ||
      this.disposed
    ) {
      return;
    }

    this.elapsedMs =
      this.options.durationMs;

    this.lastScene =
      "complete";

    this.lastMember = 2;

    this.running = false;
    this.completed = true;

    if (this.animationFrame) {
      cancelAnimationFrame(
        this.animationFrame,
      );
      this.animationFrame = 0;
    }

    this.options.onSceneChange?.(
      "complete",
      2,
    );

    this.options.onProgress?.(
      1,
      PHASE_LABELS.complete,
    );

    this.options.onComplete?.();
  }

  dispose(): void {
    if (this.disposed) return;

    this.disposed = true;
    this.running = false;

    if (this.animationFrame) {
      cancelAnimationFrame(
        this.animationFrame,
      );
    }

    window.removeEventListener(
      "resize",
      this.resize,
    );

    window.removeEventListener(
      "pointermove",
      this.onPointerMove,
    );

    document.removeEventListener(
      "visibilitychange",
      this.onVisibilityChange,
    );

    this.atmosphere.dispose();
    this.starfield.dispose();
    this.dust.dispose();
    this.grid.dispose();
    this.ribbons.dispose();
    this.crystal.dispose();
    this.signal.dispose();
    this.burst.dispose();
    this.portal.dispose();

    this.composer?.dispose();

    this.renderer?.dispose();

    this.scene3d.clear();
  }

  /* =======================================================
     RESIZE
     ======================================================= */

  private readonly resize =
    () => {
      const width =
        Math.max(
          1,
          this.canvas.clientWidth ||
            window.innerWidth,
        );

      const height =
        Math.max(
          1,
          this.canvas.clientHeight ||
            window.innerHeight,
        );

      this.director.resize(
        width / height,
      );

      if (!this.renderer) return;

      this.renderer.setPixelRatio(
        this.qualityState.dpr,
      );

      this.renderer.setSize(
        width,
        height,
        false,
      );

      this.composer?.setSize(
        width,
        height,
      );

      if (this.bloom) {
        this.bloom.setSize(
          width,
          height,
        );
      }

      const resolution =
        this.postPass?.uniforms
          .uResolution
          ?.value;

      if (
        resolution instanceof
        THREE.Vector2
      ) {
        resolution.set(
          width,
          height,
        );
      }
    };

  private aspect(): number {
    return (
      Math.max(
        1,
        window.innerWidth,
      ) /
      Math.max(
        1,
        window.innerHeight,
      )
    );
  }

  /* =======================================================
     FRAME LOOP
     ======================================================= */

  private readonly tick =
    (now: number) => {
      if (
        this.disposed ||
        !this.running ||
        this.paused
      ) {
        return;
      }

      const dt =
        Math.min(
          0.05,
          Math.max(
            0.0001,
            (now -
              this.lastFrameAt) /
              1000,
          ),
        );

      this.lastFrameAt =
        now;

      this.fps +=
        (
          1 / dt -
          this.fps
        ) *
        0.05;

      this.slowFrameAccumulator +=
        this.fps;

      this.slowFrameSamples++;

      if (
        this.slowFrameSamples >=
        120
      ) {
        const average =
          this.slowFrameAccumulator /
          this.slowFrameSamples;

        this.slowFrameAccumulator = 0;
        this.slowFrameSamples = 0;

        if (
          average < 38 &&
          this.qualityState
            .actualTier !==
            "low"
        ) {
          this.qualityState =
            downgradeQuality(
              this.qualityState,
            );

          this.applyQuality();
        }
      }

      /*
       * Use normalized progress to
       * make duration customization
       * deterministic.
       */
      const timelineTime =
        clamp01(
          this.elapsedMs /
            Math.max(
              1,
              this.options.durationMs,
            ),
        ) *
        TOTAL_TIMELINE_MS;

      this.elapsedMs +=
        dt * 1000;

      const resolved =
        resolveScene(
          timelineTime,
        );

      this.commitScene(
        resolved.scene,
        resolved.member,
      );

      this.emitCues(
        timelineTime,
      );

      const phase =
        getPhase(
          timelineTime,
        );

      const phaseT =
        phaseProgress(
          timelineTime,
        );

      const phaseEnergy =
        this.computeEnergy(
          timelineTime,
        );

      const launchProgress =
        resolved.scene ===
        "launch" ||
        resolved.scene ===
        "complete"
          ? smoothstep(
              inverseLerp(
                10950,
                12550,
                timelineTime,
              ),
            )
          : 0;

      this.pointer.x =
        damp(
          this.pointer.x,
          this.pointer.targetX,
          this.reducedMotion
            ? 20
            : 7,
          dt,
        );

      this.pointer.y =
        damp(
          this.pointer.y,
          this.pointer.targetY,
          this.reducedMotion
            ? 20
            : 7,
          dt,
        );

      this.pointer.velocityX =
        damp(
          this.pointer.velocityX,
          (
            this.pointer.targetX -
            this.pointer.x
          ) /
            Math.max(
              0.001,
              dt,
            ),
          5,
          dt,
        );

      this.pointer.velocityY =
        damp(
          this.pointer.velocityY,
          (
            this.pointer.targetY -
            this.pointer.y
          ) /
            Math.max(
              0.001,
              dt,
            ),
          5,
          dt,
        );

      /*
       * System choreography.
       */
      this.atmosphere.update(
        timelineTime / 1000,
        phaseEnergy,
        this.pointer,
      );

      this.starfield.update(
        timelineTime / 1000,
        phaseEnergy,
        dt,
        resolved.scene,
      );

      this.dust.update(
        timelineTime / 1000,
        phaseEnergy,
      );

      this.grid.update(
        timelineTime / 1000,
        phaseEnergy,
        resolved.scene,
      );

      this.ribbons.update(
        timelineTime / 1000,
        phaseEnergy,
        resolved.scene,
      );

      this.signal.update(
        timelineTime / 1000,
        phaseEnergy,
        resolved.scene,
      );

      this.crystal.update(
        timelineTime / 1000,
        phaseEnergy,
        resolved.scene,
        launchProgress,
      );

      this.burst.update(
        dt,
        phaseEnergy *
          (
            resolved.scene ===
              "launch"
              ? 1
              : 0
          ),
      );

      this.portal.update(
        timelineTime / 1000,
        launchProgress,
      );

      this.director.update(
        timelineTime,
        dt,
        resolved.scene,
        this.pointer,
        phaseEnergy,
        this.reducedMotion,
      );

      this.updatePostFx(
        timelineTime,
        phaseEnergy,
        launchProgress,
      );

      if (!this.fallback) {
        this.render();
      }

      const progress =
        clamp01(
          this.elapsedMs /
            Math.max(
              1,
              this.options.durationMs,
            ),
        );

      const label =
        phase.id === "complete"
          ? PHASE_LABELS.complete
          : PHASE_LABELS[
              resolved.scene
            ];

      this.options.onProgress?.(
        progress,
        label,
      );

      if (
        this.elapsedMs >=
          this.options.durationMs &&
        !this.completed
      ) {
        this.completed =
          true;

        this.running =
          false;

        this.options.onSceneChange?.(
          "complete",
          2,
        );

        this.options.onProgress?.(
          1,
          PHASE_LABELS.complete,
        );

        this.options.onComplete?.();

        return;
      }

      this.animationFrame =
        requestAnimationFrame(
          this.tick,
        );
    };

  private computeEnergy(
    timelineTime: number,
  ): number {
    const boot =
      inverseLerp(
        0,
        900,
        timelineTime,
      );

    const field =
      inverseLerp(
        900,
        2200,
        timelineTime,
      );

    const crystal =
      inverseLerp(
        2200,
        3500,
        timelineTime,
      );

    const labs =
      inverseLerp(
        3500,
        5000,
        timelineTime,
      );

    const prism =
      inverseLerp(
        5000,
        6250,
        timelineTime,
      );

    const definition =
      inverseLerp(
        6250,
        7700,
        timelineTime,
      );

    const launch =
      inverseLerp(
        10950,
        12550,
        timelineTime,
      );

    const launchFall =
      easeInExpo(
        launch,
      );

    const formation =
      easeOutQuint(
        crystal,
      );

    return clamp01(
      Math.max(
        boot * 0.12,
        field * 0.48,
        formation * 0.88,
        labs * 0.92,
        prism,
        definition * 0.72,
        (1 -
          launchFall) *
          0.92,
      ),
    );
  }

  private commitScene(
    scene: IntroScene,
    member: IntroMemberIndex,
  ): void {
    if (
      scene ===
        this.lastScene &&
      member ===
        this.lastMember
    ) {
      return;
    }

    const changedScene =
      scene !==
      this.lastScene;

    this.lastScene =
      scene;

    this.lastMember =
      member;

    if (
      changedScene ||
      member !==
        this.lastMember
    ) {
      this.options
        .onSceneChange?.(
          scene,
          member,
        );
    }

    this.options
      .onSceneChange?.(
        scene,
        member,
      );
  }

  private emitCues(
    timelineTime: number,
  ): void {
    while (
      this.cueIndex <
        INTRO_CUES.length &&
      timelineTime >=
        INTRO_CUES[
          this.cueIndex
        ].at
    ) {
      const cue =
        INTRO_CUES[
          this.cueIndex
        ];

      if (
        cue.id ===
        "launch.collapse"
      ) {
        this.burst.trigger();
      }

      if (
        typeof window !==
        "undefined"
      ) {
        window.dispatchEvent(
          new CustomEvent(
            "prism:intro-cue",
            {
              detail: {
                id: cue.id,
                scene: cue.scene,
                member:
                  cue.member ??
                  -1,
              },
            },
          ),
        );
      }

      this.cueIndex++;
    }
  }

  private updatePostFx(
    timeMs: number,
    energy: number,
    launch: number,
  ): void {
    if (
      !this.postPass
    ) {
      return;
    }

    this.postPass.uniforms.uTime.value =
      timeMs / 1000;

    this.postPass.uniforms.uChromatic.value =
      lerp(
        0.003,
        0.014,
        launch,
      );

    this.postPass.uniforms.uVignette.value =
      lerp(
        0.2,
        0.36,
        1 -
          energy,
      );

    this.postPass.uniforms.uFlash.value =
      Math.pow(
        Math.max(
          0,
          Math.sin(
            (
              timeMs -
              10950
            ) *
              0.008,
          ),
        ),
        9,
      ) *
      launch;
  }

  private render(): void {
    if (!this.renderer) return;

    if (
      this.composer
    ) {
      this.composer.render();
      return;
    }

    this.renderer.render(
      this.scene3d,
      this.director.camera,
    );
  }

  private applyQuality(): void {
    if (!this.renderer) return;

    this.qualityState.dpr =
      Math.min(
        this.qualityState.dpr,
        this.qualityState.profile
          .pixelRatio,
      );

    this.renderer.setPixelRatio(
      this.qualityState.dpr,
    );

    this.starfield.setPixelRatio(
      this.qualityState.dpr,
    );

    if (this.bloom) {
      this.bloom.strength =
        this.qualityState.profile
          .bloomStrength;

      this.bloom.radius =
        this.qualityState.profile
          .bloomRadius;

      this.bloom.threshold =
        this.qualityState.profile
          .bloomThreshold;
    }

    this.options.onProgress?.(
      this.progress,
      "ADAPTIVE " +
        qualityLabel(
          this.qualityState,
        ),
    );
  }
}
