import * as THREE from "three";
import { clamp01, damp, inverseLerp } from "./easing";
import { SeededRandom } from "./random";
import { ScienceShowcase } from "./science";
import { stagedTravel } from "./motion";
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

const DEFAULT_DURATION=16000;
const DEFAULT_SEED=0x5a17c0de;

const PHASE_LABELS:Record<IntroScene,string>={
  boot:"CALIBRATING THE OBSERVABLE",
  physics:"PHYSICS / MOTION / FORCE",
  chemistry:"CHEMISTRY / ATOMS / BONDS",
  mathematics:"MATHEMATICS / PATTERNS / SPACE",
  synthesis:"SYNTHESIZING THE SCIENCE",
  labs:"ZYNASH LABS",
  prism:"PRISM",
  team:"THE PEOPLE BEHIND THE PROJECTION",
  launch:"ENTERING SPATIAL INTERFACE",
  complete:"PRISM ONLINE",
};

function safeCanvasSize(canvas:HTMLCanvasElement):{width:number;height:number}{
  return {
    width:Math.max(1,canvas.clientWidth||window.innerWidth),
    height:Math.max(1,canvas.clientHeight||window.innerHeight),
  };
}

export class PrismCinematicEngine implements IntroEngine {
  readonly canvas:HTMLCanvasElement;

  private readonly options:IntroEngineOptions;
  private readonly scene3d=new THREE.Scene();
  private readonly camera=new THREE.PerspectiveCamera(50,1,0.1,120);
  private readonly pointer:IntroPointerState={
    targetX:0,targetY:0,x:0,y:0,velocityX:0,velocityY:0,
  };
  private readonly world=new THREE.Group();
  private readonly science:ScienceShowcase;
  private readonly random:SeededRandom;
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
      (typeof window!=="undefined"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches),
    );
    this.random=new SeededRandom(options.seed??DEFAULT_SEED);
    this.qualityState=createQualityState(options.quality??"auto",this.reducedMotion);
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
    return clamp01(this.elapsedMs/Math.max(1,this.options.durationMs||DEFAULT_DURATION));
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
    this.camera.position.set(0,1.4,14);
    this.camera.lookAt(0,0,0);

    this.scene3d.fog=new THREE.FogExp2("#010712",0.018);
    this.scene3d.add(this.world);
    this.world.add(this.science.group);

    try{
      this.renderer=new THREE.WebGLRenderer({
        canvas:this.canvas,
        alpha:true,
        antialias:true,
        powerPreference:"high-performance",
        preserveDrawingBuffer:false,
        stencil:false,
        depth:true,
      });
      this.renderer.setPixelRatio(this.qualityState.dpr);
      const size=safeCanvasSize(this.canvas);
      this.renderer.setSize(size.width,size.height,false);
      this.renderer.setClearColor(0x000000,0);
      this.renderer.outputColorSpace=THREE.SRGBColorSpace;
      this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure=1.08;
    }catch(error){
      this.fallback=true;
      this.renderer=null;
      console.error("[PRISM] WebGL cinematic renderer unavailable",error);
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
    const size=safeCanvasSize(this.canvas);
    this.camera.aspect=size.width/size.height;
    this.camera.updateProjectionMatrix();
    this.renderer?.setPixelRatio(this.qualityState.dpr);
    this.renderer?.setSize(size.width,size.height,false);
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

    if(this.running&&!this.paused&&!this.completed&&!this.disposed){
      this.animationFrame=requestAnimationFrame(this.tick);
    }
  };

  private runFrame=(now:number)=>{
    const delta=Math.min(0.05,Math.max(0.001,(now-this.lastFrameAt)/1000));
    this.lastFrameAt=now;
    this.fps+=(1/delta-this.fps)*0.05;

    this.slowFrameAccumulator+=this.fps;
    this.slowFrameSamples+=1;

    if(this.slowFrameSamples>=90){
      const average=this.slowFrameAccumulator/this.slowFrameSamples;
      this.slowFrameAccumulator=0;
      this.slowFrameSamples=0;

      if(average<42&&this.qualityState.actualTier!=="low"){
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
      (timelineTime-phase.start)/Math.max(1,phase.end-phase.start),
    );

    this.commitScene(resolved.scene,resolved.member);
    this.emitCues(timelineTime);

    this.pointer.x=damp(
      this.pointer.x,this.pointer.targetX,
      this.reducedMotion?18:7,delta,
    );
    this.pointer.y=damp(
      this.pointer.y,this.pointer.targetY,
      this.reducedMotion?18:7,delta,
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
        console.error("[PRISM] science showcase disabled after runtime error",error);
      }
    }

    this.animateCamera(timelineTime,delta,resolved.scene,energy);
    this.animatePostSafe(timelineTime,energy);

    if(!this.fallback&&!this.renderFaulted&&this.renderer){
      try{
        this.renderer.render(this.scene3d,this.camera);
      }catch(error){
        this.renderFaulted=true;
        this.fallback=true;
        console.error("[PRISM] WebGL render path disabled after runtime error",error);
      }
    }

    this.options.onProgress?.(progress,PHASE_LABELS[resolved.scene]);

    if(this.elapsedMs>=duration&&!this.completed){
      this.completed=true;
      this.running=false;
      this.options.onSceneChange?.("complete",3);
      this.options.onProgress?.(1,PHASE_LABELS.complete);
      this.options.onComplete?.();
    }
  };

  private animateCamera(
    timelineTime:number,
    delta:number,
    scene:IntroScene,
    energy:number,
  ):void{
    const launchProgress=stagedTravel(
      clamp01((timelineTime-14800)/1200),
    );

    let targetX=0;
    let targetY=0.25;
    let targetZ=13.8;
    let targetFov=50;

    switch(scene){
      case "physics":
        targetX=-1.0;
        targetY=0.65;
        targetZ=11.9;
        targetFov=54;
        break;
      case "chemistry":
        targetX=0.35;
        targetY=0.1;
        targetZ=10.6;
        targetFov=52;
        break;
      case "mathematics":
        targetX=0.75;
        targetY=0.55;
        targetZ=11.1;
        targetFov=52;
        break;
      case "synthesis":
        targetY=0.05;
        targetZ=9.6;
        targetFov=48;
        break;
      case "labs":
        targetZ=10.7;
        targetFov=50;
        break;
      case "prism":
        targetY=0.1;
        targetZ=8.6;
        targetFov=48;
        break;
      case "team":
        targetX=0.2;
        targetY=0.3;
        targetZ=10.6;
        targetFov=53;
        break;
      case "launch":
      case "complete":
        targetZ=THREE.MathUtils.lerp(14.5,3.6,launchProgress);
        targetY=THREE.MathUtils.lerp(1.3,0.05,launchProgress);
        targetFov=THREE.MathUtils.lerp(47,68,launchProgress);
        break;
    }

    const pointerX=this.pointer.x*1.1;
    const pointerY=this.pointer.y*-0.78;

    this.camera.position.x=damp(
      this.camera.position.x,targetX+pointerX,
      this.reducedMotion?20:4.6,delta,
    );
    this.camera.position.y=damp(
      this.camera.position.y,targetY+pointerY,
      this.reducedMotion?20:4.6,delta,
    );
    this.camera.position.z=damp(
      this.camera.position.z,targetZ,
      this.reducedMotion?20:4.0,delta,
    );

    this.camera.lookAt(
      pointerX*0.3,
      0.1+Math.sin(timelineTime*0.00055)*0.07,
      0,
    );

    this.camera.fov=damp(
      this.camera.fov,targetFov,
      this.reducedMotion?20:4.0,delta,
    );
    this.camera.updateProjectionMatrix();

    this.world.rotation.y=damp(
      this.world.rotation.y,pointerX*0.025,
      4.5,delta,
    );
    this.world.rotation.x=damp(
      this.world.rotation.x,pointerY*0.016,
      4.5,delta,
    );
    this.world.rotation.z=damp(
      this.world.rotation.z,
      scene==="launch"||scene==="complete"?launchProgress*0.18:0,
      3.0,delta,
    );

    void energy;
  };

  private animatePostSafe(timelineTime:number,energy:number):void{
    /*
     * No EffectComposer in the hot path. The intro intentionally relies on
     * buffer geometry + additive materials + CSS optics for a stable expo FPS.
     */
    void timelineTime;
    void energy;
  }

  private computeEnergy(timelineTime:number):number{
    const physics=inverseLerp(700,3000,timelineTime);
    const chemistry=inverseLerp(2750,5250,timelineTime);
    const math=inverseLerp(5000,7500,timelineTime);
    const synthesis=inverseLerp(7300,9500,timelineTime);
    const prism=inverseLerp(10250,11850,timelineTime);
    const launch=inverseLerp(14500,16000,timelineTime);

    return clamp01(
      Math.max(
        physics*0.92,
        chemistry*0.9,
        math*0.96,
        synthesis,
        prism*0.76,
        launch,
      ),
    );
  }

  private commitScene(scene:IntroScene,member:IntroMemberIndex):void{
    if(scene===this.lastScene&&member===this.lastMember)return;
    const sceneChanged=scene!==this.lastScene;
    this.lastScene=scene;
    this.lastMember=member;

    if(sceneChanged && scene!=="boot"){
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
