import * as THREE from "three";
import { clamp01, damp, inverseLerp } from "./easing";
import { SeededRandom } from "./random";
import { ScienceShowcase } from "./science";
import { CinematicCameraDirector } from "./director";
import {
  INTRO_CUES,
  TOTAL_TIMELINE_MS,
  getPhase,
  resolveScene,
} from "./timeline";
import { createQualityState, downgradeQuality } from "./quality";
import type {
  IntroEngine,
  IntroEngineOptions,
  IntroMemberIndex,
  IntroPointerState,
  IntroQualityState,
  IntroScene,
} from "./types";

const DEFAULT_DURATION=19200;
const DEFAULT_SEED=0x5a17c0de;

const PHASE_LABELS:Record<IntroScene,string>={
  boot:"FIRST PRINCIPLES / SIGNAL ACQUIRED",
  physics:"PHYSICS / MOTION / FORCE",
  chemistry:"CHEMISTRY / MATTER / BOND",
  mathematics:"MATHEMATICS / PATTERN / FORM",
  information:"INFORMATION / SIGNAL / CONTROL",
  synthesis:"SYNTHESIS / ONE VISUAL LANGUAGE",
  labs:"ZYNASH LABS",
  prism:"PRISM / PROJECT 001",
  team:"THE PEOPLE BEHIND THE PROJECTION",
  launch:"SPATIAL INTERFACE / ONLINE",
  complete:"PRISM ONLINE",
};

function canvasSize(canvas:HTMLCanvasElement):{width:number;height:number}{
  return {
    width:Math.max(1,canvas.clientWidth||window.innerWidth),
    height:Math.max(1,canvas.clientHeight||window.innerHeight),
  };
}

export class PrismCinematicEngine implements IntroEngine {
  readonly canvas:HTMLCanvasElement;

  private readonly options:IntroEngineOptions;
  private readonly scene3d=new THREE.Scene();
  private readonly camera=new THREE.PerspectiveCamera(48,1,0.1,120);
  private readonly world=new THREE.Group();
  private readonly director=new CinematicCameraDirector();
  private readonly pointer:IntroPointerState={
    targetX:0,targetY:0,x:0,y:0,velocityX:0,velocityY:0,
  };
  private readonly random:SeededRandom;
  private readonly science:ScienceShowcase;
  private readonly reducedMotion:boolean;

  private renderer:THREE.WebGLRenderer|null=null;
  private animationFrame=0;
  private lastFrameAt=0;
  private elapsedMs=0;
  private fps=60;
  private running=false;
  private paused=false;
  private disposed=false;
  private completed=false;
  private fallback=false;
  private scienceFaulted=false;
  private renderFaulted=false;

  private lastScene:IntroScene|null=null;
  private lastMember:IntroMemberIndex=-1;
  private cueIndex=0;
  private previousTimelineTime=-1;

  private qualityState:IntroQualityState;
  private slowFrameAccumulator=0;
  private slowFrameSamples=0;

  private readonly onPointerMove=(event:PointerEvent)=>{
    if(this.disposed)return;
    this.pointer.targetX=event.clientX/Math.max(1,window.innerWidth)-0.5;
    this.pointer.targetY=event.clientY/Math.max(1,window.innerHeight)-0.5;
  };

  private readonly onVisibilityChange=()=>{
    if(document.visibilityState==="hidden"){
      this.pause();
    }else if(this.running&&this.paused){
      this.resume();
    }
  };

  constructor(options:IntroEngineOptions){
    this.options=options;
    this.canvas=options.canvas;
    this.reducedMotion=Boolean(
      options.reducedMotion ??
      (typeof window!=="undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches),
    );
    this.random=new SeededRandom(options.seed??DEFAULT_SEED);
    this.qualityState=createQualityState(
      options.quality??"auto",
      this.reducedMotion,
    );
    this.science=new ScienceShowcase(this.qualityState.profile,this.random);

    this.setupScene();
    this.setupEvents();
  }

  get isRunning():boolean{
    return this.running&&!this.paused&&!this.completed;
  }

  get scene():IntroScene{
    return this.lastScene??"boot";
  }

  get member():IntroMemberIndex{
    return this.lastMember;
  }

  get progress():number{
    return clamp01(
      this.elapsedMs/
      Math.max(1,this.options.durationMs||DEFAULT_DURATION),
    );
  }

  get quality():IntroQualityState{
    return this.qualityState;
  }

  start():void{
    if(this.running||this.completed||this.disposed)return;
    this.running=true;
    this.paused=false;
    this.lastFrameAt=performance.now();
    this.animationFrame=requestAnimationFrame(this.tick);
  }

  pause():void{
    if(!this.running||this.paused)return;
    this.paused=true;
    if(this.animationFrame){
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame=0;
    }
  }

  resume():void{
    if(!this.running||!this.paused||this.disposed)return;
    this.paused=false;
    this.lastFrameAt=performance.now();
    this.animationFrame=requestAnimationFrame(this.tick);
  }

  skip():void{
    if(this.disposed||this.completed)return;

    this.elapsedMs=this.options.durationMs||DEFAULT_DURATION;
    this.completed=true;
    this.running=false;
    this.lastScene="complete";
    this.lastMember=3;

    if(this.animationFrame){
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame=0;
    }

    this.options.onSceneChange?.("complete",3);
    this.options.onProgress?.(1,PHASE_LABELS.complete);
    this.options.onComplete?.();
  }

  dispose():void{
    if(this.disposed)return;

    this.disposed=true;
    this.running=false;

    if(this.animationFrame){
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame=0;
    }

    window.removeEventListener("resize",this.resize);
    window.removeEventListener("pointermove",this.onPointerMove);
    document.removeEventListener("visibilitychange",this.onVisibilityChange);

    this.science.dispose();
    this.renderer?.dispose();
    this.scene3d.clear();
  }

  private setupScene():void{
    this.scene3d.fog=new THREE.FogExp2("#010712",0.017);
    this.scene3d.add(this.world);
    this.world.add(this.science.group);

    try{
      this.renderer=new THREE.WebGLRenderer({
        canvas:this.canvas,
        alpha:true,
        antialias:false,
        powerPreference:"high-performance",
        preserveDrawingBuffer:false,
        stencil:false,
        depth:true,
      });

      this.renderer.setPixelRatio(this.qualityState.dpr);
      this.renderer.setClearColor(0x000000,0);
      this.renderer.outputColorSpace=THREE.SRGBColorSpace;
      this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure=1.08;
    }catch(error){
      this.renderer=null;
      this.fallback=true;
      console.error("[PRISM] cinematic WebGL initialization failed",error);
    }

    this.resize();
    this.options.onSceneChange?.("boot",-1);
  }

  private setupEvents():void{
    window.addEventListener("resize",this.resize,{passive:true});
    window.addEventListener("pointermove",this.onPointerMove,{passive:true});
    document.addEventListener("visibilitychange",this.onVisibilityChange);
  }

  private readonly resize=()=>{
    const size=canvasSize(this.canvas);
    this.camera.aspect=size.width/size.height;
    this.camera.updateProjectionMatrix();

    if(this.renderer){
      this.renderer.setPixelRatio(this.qualityState.dpr);
      this.renderer.setSize(size.width,size.height,false);
    }
  };

  private readonly tick=(now:number)=>{
    if(this.disposed||!this.running||this.paused)return;

    try{
      this.runFrame(now);
    }catch(error){
      console.error("[PRISM] cinematic frame recovered",error);
      this.fallback=true;
      this.renderFaulted=true;
      this.elapsedMs+=16.67;

      const duration=this.options.durationMs||DEFAULT_DURATION;
      const progress=clamp01(this.elapsedMs/Math.max(1,duration));
      const timelineTime=progress*TOTAL_TIMELINE_MS;
      const resolved=resolveScene(timelineTime);

      this.commitScene(resolved.scene,resolved.member);
      this.options.onProgress?.(progress,PHASE_LABELS[resolved.scene]);

      if(progress>=1){
        this.completed=true;
        this.running=false;
        this.options.onSceneChange?.("complete",3);
        this.options.onProgress?.(1,PHASE_LABELS.complete);
        this.options.onComplete?.();
        return;
      }
    }

    if(
      this.running&&
      !this.paused&&
      !this.completed&&
      !this.disposed
    ){
      this.animationFrame=requestAnimationFrame(this.tick);
    }
  };

  private runFrame=(now:number)=>{
    const delta=Math.min(
      0.05,
      Math.max(0.001,(now-this.lastFrameAt)/1000),
    );
    this.lastFrameAt=now;
    this.fps+=(1/delta-this.fps)*0.05;

    this.slowFrameAccumulator+=this.fps;
    this.slowFrameSamples+=1;

    if(this.slowFrameSamples>=90){
      const average=this.slowFrameAccumulator/this.slowFrameSamples;
      this.slowFrameAccumulator=0;
      this.slowFrameSamples=0;

      if(
        average<42 &&
        this.qualityState.actualTier!=="low"
      ){
        this.qualityState=downgradeQuality(this.qualityState);
        this.renderer?.setPixelRatio(this.qualityState.dpr);
      }
    }

    this.elapsedMs+=delta*1000;

    const duration=this.options.durationMs||DEFAULT_DURATION;
    const progress=clamp01(this.elapsedMs/Math.max(1,duration));
    const timelineTime=progress*TOTAL_TIMELINE_MS;

    const resolved=resolveScene(timelineTime);
    const phase=getPhase(timelineTime);
    const phaseProgress=clamp01(
      (timelineTime-phase.start)/
      Math.max(1,phase.end-phase.start),
    );

    this.commitScene(resolved.scene,resolved.member);
    this.emitCues(timelineTime);

    this.pointer.x=damp(
      this.pointer.x,
      this.pointer.targetX,
      this.reducedMotion?18:7,
      delta,
    );
    this.pointer.y=damp(
      this.pointer.y,
      this.pointer.targetY,
      this.reducedMotion?18:7,
      delta,
    );

    const energy=this.computeEnergy(timelineTime);

    if(!this.scienceFaulted){
      try{
        this.science.update({
          time:timelineTime/1000,
          delta,
          scene:resolved.scene,
          phase:phaseProgress,
          energy,
          pointer:this.pointer,
        });
      }catch(error){
        this.scienceFaulted=true;
        console.error("[PRISM] science systems disabled",error);
      }
    }

    this.director.update(
      this.camera,
      resolved.scene,
      timelineTime,
      delta,
      this.pointer,
      this.reducedMotion,
    );

    if(!this.fallback&&!this.renderFaulted&&this.renderer){
      try{
        this.renderer.render(this.scene3d,this.camera);
      }catch(error){
        this.renderFaulted=true;
        this.fallback=true;
        console.error("[PRISM] cinematic WebGL render disabled",error);
      }
    }

    this.options.onProgress?.(
      progress,
      PHASE_LABELS[resolved.scene],
    );

    if(this.elapsedMs>=duration&&!this.completed){
      this.completed=true;
      this.running=false;
      this.options.onSceneChange?.("complete",3);
      this.options.onProgress?.(1,PHASE_LABELS.complete);
      this.options.onComplete?.();
    }
  };

  private computeEnergy(timelineTime:number):number{
    const values=[
      inverseLerp(500,3300,timelineTime)*0.88,
      inverseLerp(3000,5800,timelineTime)*0.94,
      inverseLerp(5500,8500,timelineTime),
      inverseLerp(8200,10000,timelineTime)*0.95,
      inverseLerp(9800,11900,timelineTime),
      inverseLerp(13100,14700,timelineTime)*0.92,
      inverseLerp(17900,19200,timelineTime),
    ];
    return clamp01(Math.max(...values));
  }

  private commitScene(
    scene:IntroScene,
    member:IntroMemberIndex,
  ):void{
    const changed=scene!==this.lastScene;
    this.lastScene=scene;
    this.lastMember=member;

    if(changed&&scene!=="boot"){
      this.science.triggerCoreFlash();
    }

    this.options.onSceneChange?.(scene,member);
  }

  private emitCues(timelineTime:number):void{
    if(
      this.previousTimelineTime>=0&&
      timelineTime<this.previousTimelineTime
    ){
      this.cueIndex=0;
    }

    while(
      this.cueIndex<INTRO_CUES.length&&
      timelineTime>=INTRO_CUES[this.cueIndex].at
    ){
      const cue=INTRO_CUES[this.cueIndex];
      window.dispatchEvent(
        new CustomEvent("prism:intro-cue",{
          detail:{
            id:cue.id,
            scene:cue.scene,
            member:cue.member??-1,
            label:cue.label??PHASE_LABELS[cue.scene],
          },
        }),
      );
      this.cueIndex+=1;
    }

    this.previousTimelineTime=timelineTime;
  }
}
