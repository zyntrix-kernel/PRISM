"use client";

import { useEffect, useRef, useState } from "react";
import type {
  IntroMemberIndex,
  IntroQuality,
  IntroScene,
} from "@/lib/prism/intro/types";
import { PrismCinematicEngine } from "@/lib/prism/intro/engine";
import "./PrismCinematicIntro.css";

type IntroProps={
  onComplete?:()=>void;
  showSkip?:boolean;
  duration?:number;
  quality?:IntroQuality;
};

const TEAM=[
  {
    handle:"Zyntrix.krnl.sys",
    name:"Tanay Bhandari",
    role:"LEAD",
  },
  {
    handle:"Ash Collector",
    name:"Ashwin Nagaranjan Ramnath",
    role:"SCIENCE / BUILD",
  },
  {
    handle:"distortus_rexx",
    name:"Debroop Mojumder",
    role:"ENGINEERING / DESIGN",
  },
  {
    handle:"Unknown",
    name:"Maaz Mozzam",
    role:"TEAM",
  },
] as const;

const CHAPTERS:Array<{
  scene:IntroScene;
  index:string;
  title:string;
}>=[
  {scene:"physics",index:"01",title:"PHYSICS"},
  {scene:"chemistry",index:"02",title:"CHEMISTRY"},
  {scene:"mathematics",index:"03",title:"MATHEMATICS"},
  {scene:"information",index:"04",title:"INFORMATION"},
];

const SCENE_CLASS:Record<IntroScene,string>={
  boot:"scene-boot",
  physics:"scene-physics",
  chemistry:"scene-chemistry",
  mathematics:"scene-mathematics",
  information:"scene-information",
  synthesis:"scene-synthesis",
  labs:"scene-labs",
  prism:"scene-prism",
  team:"scene-team",
  launch:"scene-launch",
  complete:"scene-complete",
};

function ChapterRail({scene}:{scene:IntroScene}){
  return (
    <nav className="intro-chapter-rail" aria-label="PRISM chapters">
      {CHAPTERS.map((chapter)=>(
        <span
          key={chapter.scene}
          className={scene===chapter.scene?"active":""}
        >
          <i>{chapter.index}</i>
          <b>{chapter.title}</b>
        </span>
      ))}
    </nav>
  );
}

function MetricStack({scene}:{scene:IntroScene}){
  const metrics:Record<IntroScene,Array<[string,string]>>={
    boot:[["OPTICS","REFRACTION"],["SIGNAL","ACQUIRE"],["STATE","READY"]],
    physics:[["g","9.81 m·s⁻²"],["p","mv"],["Δt","MEASURED"]],
    chemistry:[["H₂O","104.5°"],["CO₂","LINEAR"],["e⁻","LEVELS"]],
    mathematics:[["φ","1.618033…"],["y","sin x"],["Σ","SERIES"]],
    information:[["DATA","8 BIT"],["SIGNAL","ENCODE"],["STATE","CONTROL"]],
    synthesis:[["MODEL","COHERENT"],["SYSTEM","UNIFIED"],["STATE","SYNTHESIS"]],
    labs:[["ZL","PROJECT 001"],["MODE","REALTIME"],["BUILD","ACTIVE"]],
    prism:[["ID","PRISM / 001"],["MODE","SPATIAL"],["STATE","READY"]],
    team:[["PROJECT","001"],["TEAM","04"],["BUILD","COLLABORATIVE"]],
    launch:[["INPUT","HAND + POINTER"],["ENGINE","THREE.JS"],["STATE","LIVE"]],
    complete:[["SYSTEM","PRISM"],["STATE","ONLINE"],["SESSION","READY"]],
  };
  return (
    <aside className="intro-metric-stack" aria-label="Scientific chapter telemetry">
      {metrics[scene].map(([label,value])=>(
        <span key={label}><small>{label}</small><b>{value}</b></span>
      ))}
    </aside>
  );
}

function SceneCopy({
  scene,
  member,
}:{
  scene:IntroScene;
  member:IntroMemberIndex;
}){
  if(scene==="boot"){
    return (
      <section className="intro-scene-copy copy-boot">
        <div className="boot-overline">ZYNASH LABS / SPATIAL RESEARCH UNIT</div>
        <div className="boot-title">
          <span>OBSERVE</span>
          <strong>WHAT MOVES</strong>
        </div>
        <div className="boot-line" />
        <div className="boot-caption">
          <span>MATTER</span>
          <span>ENERGY</span>
          <span>INFORMATION</span>
        </div>
        <div className="boot-status">OBSERVATION WINDOW OPEN</div>
      </section>
    );
  }

  if(scene==="physics"){
    return (
      <section className="intro-scene-copy copy-discipline copy-physics">
        <div className="discipline-top">
          <span>01 / PHYSICS</span>
          <span>MECHANICS / ORBIT / OSCILLATION</span>
        </div>
        <div className="discipline-title">
          <span>MOTION</span>
          <span>IS <em>MEASURED.</em></span>
        </div>
        <div className="formula-line">
          <span>F = ma</span>
          <span>p = mv</span>
          <span>v² = u² + 2as</span>
        </div>
        <p>
          Force, momentum, gravity, and time become visible as motion.
        </p>
      </section>
    );
  }

  if(scene==="chemistry"){
    return (
      <section className="intro-scene-copy copy-discipline copy-chemistry">
        <div className="discipline-top">
          <span>02 / CHEMISTRY</span>
          <span>ATOM / BOND / STRUCTURE</span>
        </div>
        <div className="discipline-title">
          <span>MATTER</span>
          <span>IS <em>STRUCTURED.</em></span>
        </div>
        <div className="molecule-strip">
          <div><b>H₂O</b><small>BOND ANGLE / 104.5°</small></div>
          <div><b>CO₂</b><small>LINEAR MOLECULE</small></div>
          <div><b>e⁻</b><small>ENERGY LEVELS</small></div>
        </div>
        <p>Structure sets the conditions for observable behavior.</p>
      </section>
    );
  }

  if(scene==="mathematics"){
    return (
      <section className="intro-scene-copy copy-discipline copy-mathematics">
        <div className="discipline-top">
          <span>03 / MATHEMATICS</span>
          <span>FUNCTION / RATIO / GEOMETRY</span>
        </div>
        <div className="discipline-title">
          <span>PATTERN</span>
          <span>BECOMES <em>GEOMETRY.</em></span>
        </div>
        <div className="formula-line">
          <span>φ = 1.618033988…</span>
          <span>y = sin x</span>
          <span>Σ aₙeⁱⁿˣ</span>
        </div>
        <p>Geometry turns relationships into positions, paths, and space.</p>
      </section>
    );
  }

  if(scene==="information"){
    return (
      <section className="intro-scene-copy copy-information">
        <div className="discipline-top">
          <span>04 / INFORMATION</span>
          <span>SIGNAL / LOGIC / CONTROL</span>
        </div>
        <div className="info-title">
          <span>IDEA</span>
          <strong>→</strong>
          <span>SIGNAL</span>
          <strong>→</strong>
          <span>ACTION</span>
        </div>
        <div className="info-readout">
          <span>01001000</span>
          <span>00110010</span>
          <span>01010010</span>
          <span>00100001</span>
        </div>
        <p>Encode a signal, preserve its meaning, and turn information into control.</p>
      </section>
    );
  }

  if(scene==="synthesis"){
    return (
      <section className="intro-scene-copy copy-synthesis">
        <div className="synthesis-overline">ONE SYSTEM / MANY LANGUAGES</div>
        <div className="synthesis-title">
          <span>PHYSICS</span>
          <i>×</i>
          <span>CHEMISTRY</span>
          <i>×</i>
          <span>MATHEMATICS</span>
          <i>×</i>
          <span>INFORMATION</span>
        </div>
        <div className="synthesis-divider" />
        <strong>ONE INTERFACE / MANY DISCIPLINES.</strong>
      </section>
    );
  }

  if(scene==="labs"){
    return (
      <section className="intro-scene-copy copy-labs">
        <div className="labs-overline">ZYNASH LABS / EXPERIMENTAL INTERFACE</div>
        <div className="labs-title">
          <span>ZYNASH</span>
          <strong>LABS</strong>
        </div>
        <div className="labs-statement">MEASURED. MODELED. INTERACTIVE.</div>
      </section>
    );
  }

  if(scene==="prism"){
    return (
      <section className="intro-scene-copy copy-prism">
        <div className="prism-project">PROJECT / 001</div>
        <div className="prism-title">PRISM</div>
        <div className="prism-full">
          PROJECTED REALITY INTERACTION<br />
          &amp; SPATIAL MANIPULATION
        </div>
        <div className="prism-tagline">MEASURED. MODELED. INTERACTIVE.</div>
      </section>
    );
  }

  if(scene==="team"){
    const safe=Math.max(0,Math.min(3,member));
    const person=TEAM[safe];
    return (
      <section className="intro-scene-copy copy-team">
        <div className="team-overline">CORE TEAM / PROJECT 001</div>
        <div className="team-count">{String(safe+1).padStart(2,"0")} / 04</div>
        <div className="team-handle">{person.handle}</div>
        <div className="team-name">{person.name}</div>
        <div className="team-role">{person.role}</div>
        <div className="team-progress">
          {TEAM.map((_,index)=>(
            <span key={index} className={index===safe?"active":""} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="intro-scene-copy copy-launch">
      <div className="launch-overline">ZYNASH LABS / PRISM</div>
      <div className="launch-title">ENTER<br /><em>PRISM.</em></div>
      <div className="launch-sub">PROJECTED REALITY INTERACTION &amp; SPATIAL MANIPULATION</div>
      <div className="launch-cta">SPATIAL INTERFACE / READY</div>
    </section>
  );
}

export default function PrismCinematicIntro({
  onComplete,
  showSkip=true,
  duration=19200,
  quality="auto",
}:IntroProps){
  const rootRef=useRef<HTMLDivElement>(null);
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const progressRef=useRef<HTMLDivElement>(null);
  const engineRef=useRef<PrismCinematicEngine|null>(null);
  const completionTimerRef=useRef<number|null>(null);
  const onCompleteRef=useRef(onComplete);

  const [scene,setScene]=useState<IntroScene>("boot");
  const [member,setMember]=useState<IntroMemberIndex>(-1);
  const [exiting,setExiting]=useState(false);

  useEffect(()=>{ onCompleteRef.current=onComplete; },[onComplete]);

  useEffect(()=>{
    const canvas=canvasRef.current;
    const root=rootRef.current;
    if(!canvas||!root)return;

    let lastProgress=-1;

    const engine=new PrismCinematicEngine({
      canvas,
      durationMs:duration,
      quality,
      seed:0x5a17c0de,
      reducedMotion:window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      onSceneChange:(nextScene,nextMember)=>{
        setScene(nextScene);
        setMember(nextMember);
        root.dataset.scene=nextScene;
        root.dataset.member=String(nextMember);
      },
      onProgress:(progress,label)=>{
        root.style.setProperty("--intro-progress",String(progress));
        root.dataset.phase=label;

        const rounded=Math.round(progress*100);
        if(progressRef.current&&rounded!==lastProgress){
          lastProgress=rounded;
          progressRef.current.textContent=String(rounded).padStart(3,"0")+"%";
        }
      },
      onComplete:()=>{
        setExiting(true);
        completionTimerRef.current=window.setTimeout(()=>{
          onCompleteRef.current?.();
        },650);
      },
    });

    engineRef.current=engine;
    engine.start();

    return ()=>{
      if(completionTimerRef.current!==null){
        window.clearTimeout(completionTimerRef.current);
        completionTimerRef.current=null;
      }
      engine.dispose();
      engineRef.current=null;
    };
  },[duration,quality]);

  useEffect(()=>{
    if(!showSkip)return;
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==="Escape")engineRef.current?.skip();
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[showSkip]);

  return (
    <div
      ref={rootRef}
      className={
        "prism-cinematic "+SCENE_CLASS[scene]+
        (exiting?" is-exiting":"")
      }
      data-scene={scene}
      data-member={member}
      data-phase="FIRST PRINCIPLES / SIGNAL ACQUIRED"
    >
      <canvas
        ref={canvasRef}
        className="prism-canvas"
        aria-hidden="true"
      />

      <div className="intro-field intro-field-a" aria-hidden="true" />
      <div className="intro-field intro-field-b" aria-hidden="true" />
      <div className="intro-light-sweep" aria-hidden="true" />
      <div className="intro-vignette" aria-hidden="true" />
      <div className="intro-grain" aria-hidden="true" />
      <div className="intro-scan" aria-hidden="true" />

      <header className="intro-topbar">
        <div className="intro-brand">
          <span className="intro-brand-mark">Z</span>
          <span>
            <strong>ZYNASH LABS</strong>
            <small>PRISM / SPATIAL SCIENCE</small>
          </span>
        </div>

        <div className="intro-mode">
          <span className="mode-live" />
          <span>REALTIME / 3D</span>
          <i />
          <span>{scene.toUpperCase()}</span>
        </div>

        {showSkip&&!exiting&&(
          <button
            type="button"
            className="intro-skip"
            onClick={()=>engineRef.current?.skip()}
          >
            <span>SKIP</span><kbd>ESC</kbd>
          </button>
        )}
      </header>

      <ChapterRail scene={scene} />

      <main className="intro-content">
        <SceneCopy scene={scene} member={member} />
      </main>

      <MetricStack scene={scene} />

      <footer className="intro-bottombar">
        <div className="bottom-left">
          <span>PROJECT 001</span><i /> <span>2026</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" />
        </div>
        <div className="bottom-progress" ref={progressRef}>000%</div>
      </footer>

      <div className="intro-corner corner-tl" aria-hidden="true" />
      <div className="intro-corner corner-tr" aria-hidden="true" />
      <div className="intro-corner corner-bl" aria-hidden="true" />
      <div className="intro-corner corner-br" aria-hidden="true" />

      <div className="launch-flare" aria-hidden="true" />
    </div>
  );
}
