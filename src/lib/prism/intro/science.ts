import * as THREE from "three";
import type {
  IntroPointerState,
  IntroQualityProfile,
  IntroScene,
} from "./types";
import { SeededRandom, randomSphere } from "./random";

export interface ScienceUpdateContext {
  readonly time: number;
  readonly delta: number;
  readonly scene: IntroScene;
  readonly phase: number;
  readonly energy: number;
  readonly pointer: IntroPointerState;
}

function clamp01(v:number):number {
  return Math.min(1, Math.max(0, v));
}

function smooth(v:number):number {
  const x=clamp01(v);
  return x*x*(3-2*x);
}

function pulse(t:number,s:number,o=0):number {
  return 0.5+0.5*Math.sin(t*s+o);
}

function setOpacity(material:THREE.Material, value:number):void {
  const m=material as THREE.Material & { opacity?:number };
  if (typeof m.opacity==="number") {
    m.opacity=value;
    m.transparent=value<0.999;
  }
}

function makeBasic(color:string, opacity=1):THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent:opacity<0.999,
    opacity,
    depthWrite:false,
    blending:THREE.AdditiveBlending,
  });
}

function makePointMaterial(color:string,size:number,opacity=1):THREE.PointsMaterial {
  return new THREE.PointsMaterial({
    color,
    size,
    transparent:opacity<0.999,
    opacity,
    depthWrite:false,
    blending:THREE.AdditiveBlending,
    sizeAttenuation:true,
  });
}

function makeLine(points:THREE.Vector3[],color:string,opacity=1):THREE.Line {
  const geometry=new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      color,
      transparent:opacity<0.999,
      opacity,
      depthWrite:false,
      blending:THREE.AdditiveBlending,
    }),
  );
}

function disposeRoot(root:THREE.Object3D):void {
  root.traverse((object)=>{
    const mesh=object as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      for (const material of materials) material.dispose();
    }
  });
}

export class StarFieldSystem {
  readonly group=new THREE.Group();

  private readonly points:THREE.Points;
  private readonly positions:Float32Array;
  private readonly baseY:Float32Array;
  private readonly velocity:Float32Array;

  constructor(profile:IntroQualityProfile,random:SeededRandom) {
    const count=Math.min(1800,Math.max(700,profile.starCount));
    this.positions=new Float32Array(count*3);
    this.baseY=new Float32Array(count);
    this.velocity=new Float32Array(count);

    for(let i=0;i<count;i++){
      const radius=random.range(9,44);
      const direction=randomSphere(random);
      const i3=i*3;
      this.positions[i3]=direction.x*radius;
      this.positions[i3+1]=direction.y*radius*0.75;
      this.positions[i3+2]=direction.z*radius;
      this.baseY[i]=this.positions[i3+1];
      this.velocity[i]=random.range(0.08,0.42);
    }

    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.BufferAttribute(this.positions,3));

    this.points=new THREE.Points(
      geometry,
      makePointMaterial("#bfeaff",0.05,0.72),
    );
    this.points.frustumCulled=false;
    this.group.add(this.points);
  }

  update(context:ScienceUpdateContext):void {
    const active =
      context.scene==="physics" ||
      context.scene==="chemistry" ||
      context.scene==="mathematics" ||
      context.scene==="synthesis";

    const intensity=active?0.62:context.scene==="boot"?0.14:0.4;
    for(let i=0;i<this.velocity.length;i++){
      const i3=i*3;
      this.positions[i3+2]+=context.delta*this.velocity[i]*(0.6+context.energy);
      if(this.positions[i3+2]>44) this.positions[i3+2]=-44;
      this.positions[i3+1]=this.baseY[i]+Math.sin(context.time*0.3+i*0.013)*0.04;
    }

    (this.points.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate=true;
    setOpacity(this.points.material,intensity);
    this.group.rotation.y+=context.delta*(0.006+context.energy*0.006);
    this.group.rotation.x=context.pointer.y*0.025;
  }

  dispose():void { disposeRoot(this.group); }
}

export class PhysicsSystem {
  readonly group=new THREE.Group();

  private readonly trail:THREE.Line;
  private readonly projectile:THREE.Mesh;
  private readonly pendulum:THREE.Line;
  private readonly pendulumBob:THREE.Mesh;
  private readonly orbit:THREE.Group;
  private readonly field:THREE.Points;

  private readonly pendulumPositions:Float32Array;

  constructor(random:SeededRandom) {
    const points:THREE.Vector3[]=[];
    const v0=7.8;
    const launch=THREE.MathUtils.degToRad(53);
    const g=9.81;
    const tMax=(2*v0*Math.sin(launch))/g;

    for(let i=0;i<96;i++){
      const t=(i/95)*tMax;
      points.push(new THREE.Vector3(
        -4.8+v0*Math.cos(launch)*t,
        -1.7+v0*Math.sin(launch)*t-0.5*g*t*t,
        0,
      ));
    }

    this.trail=makeLine(points,"#73d6ff",0.72);
    this.projectile=new THREE.Mesh(
      new THREE.SphereGeometry(0.12,10,10),
      makeBasic("#effcff",0.95),
    );
    this.group.add(this.trail,this.projectile);

    this.pendulumPositions=new Float32Array(6);
    const pendulumGeometry=new THREE.BufferGeometry();
    pendulumGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.pendulumPositions,3),
    );
    this.pendulum=new THREE.Line(
      pendulumGeometry,
      new THREE.LineBasicMaterial({
        color:"#4d9eff",
        transparent:true,
        opacity:0.62,
        depthWrite:false,
      }),
    );
    this.pendulumBob=new THREE.Mesh(
      new THREE.SphereGeometry(0.22,10,10),
      makeBasic("#9be3ff",0.9),
    );
    this.group.add(this.pendulum,this.pendulumBob);

    this.orbit=new THREE.Group();
    const sun=new THREE.Mesh(new THREE.SphereGeometry(0.38,10,10),makeBasic("#fff0a5",0.95));
    const earth=new THREE.Mesh(new THREE.SphereGeometry(0.18,10,10),makeBasic("#6dbfff",0.95));
    const moon=new THREE.Mesh(new THREE.SphereGeometry(0.07,8,8),makeBasic("#d9f4ff",0.9));
    earth.position.x=1.45;
    moon.position.x=1.88;
    this.orbit.add(
      sun,
      earth,
      moon,
      new THREE.Mesh(
        new THREE.TorusGeometry(1.45,0.012,6,72),
        makeBasic("#65b9ff",0.35),
      ),
    );
    this.orbit.position.set(-1.25,2.05,-0.8);
    this.group.add(this.orbit);

    const count=28;
    const positions=new Float32Array(count*3);
    for(let i=0;i<count;i++){
      const i3=i*3;
      positions[i3]=random.range(-8,8);
      positions[i3+1]=random.range(-4,4);
      positions[i3+2]=random.range(-2,2);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));
    this.field=new THREE.Points(geometry,makePointMaterial("#5aafff",0.045,0.34));
    this.group.add(this.field);
  }

  update(context:ScienceUpdateContext):void {
    const visible =
      context.scene==="physics"
        ? smooth(Math.min(1,context.phase*2.6))
        : context.scene==="chemistry"
          ? 1-smooth(Math.min(1,context.phase*1.6))
          : context.scene==="synthesis" ? 0.07 : 0;

    setOpacity(this.trail.material,visible*0.76);
    setOpacity(this.projectile.material,visible);
    setOpacity(this.pendulum.material,visible*0.72);
    setOpacity(this.pendulumBob.material,visible);
    for(const child of this.orbit.children){
      if(child instanceof THREE.Mesh) setOpacity(child.material,visible*(child===this.orbit.children[0]?0.94:0.55));
    }
    setOpacity(this.field.material,visible*0.5);

    const v0=7.8;
    const launch=THREE.MathUtils.degToRad(53);
    const g=9.81;
    const tMax=(2*v0*Math.sin(launch))/g;
    const t=(context.phase*tMax*0.96)%tMax;
    this.projectile.position.set(
      -4.8+v0*Math.cos(launch)*t,
      -1.7+v0*Math.sin(launch)*t-0.5*g*t*t,
      Math.sin(context.time*5)*0.08,
    );

    const pivotX=2.7;
    const pivotY=1.45;
    const length=2.65;
    const omega=Math.sqrt(g/length);
    const angle=THREE.MathUtils.degToRad(26)*Math.cos(omega*context.time*0.9);
    const bobX=pivotX+Math.sin(angle)*length;
    const bobY=pivotY-Math.cos(angle)*length;

    this.pendulumPositions[0]=pivotX;
    this.pendulumPositions[1]=pivotY;
    this.pendulumPositions[2]=0.1;
    this.pendulumPositions[3]=bobX;
    this.pendulumPositions[4]=bobY;
    this.pendulumPositions[5]=0.1;
    (this.pendulum.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate=true;
    this.pendulumBob.position.set(bobX,bobY,0.1);

    this.orbit.rotation.y=context.time*0.44;
    this.orbit.rotation.x=Math.sin(context.time*0.2)*0.08;
    this.field.rotation.z=context.time*0.11;
  }

  dispose():void { disposeRoot(this.group); }
}

export class ChemistrySystem {
  readonly group=new THREE.Group();

  private readonly atomGroup=new THREE.Group();
  private readonly shellMeshes:THREE.Mesh[]=[];
  private readonly electrons:THREE.Points;
  private readonly electronPositions:Float32Array;
  private readonly moleculePoints:THREE.Points;
  private readonly moleculePositions:Float32Array;
  private readonly moleculeBonds:THREE.LineSegments;
  private readonly lattice:THREE.Points;

  constructor() {
    const nucleus=new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.55,1),
      makeBasic("#6caeff",0.95),
    );
    this.atomGroup.add(nucleus);

    for(let i=0;i<3;i++){
      const ring=new THREE.Mesh(
        new THREE.TorusGeometry(0.95+i*0.56,0.012,6,72),
        makeBasic(i%2===0?"#73cfff":"#477dff",0.4),
      );
      ring.rotation.x=Math.PI/2+i*0.42;
      ring.rotation.z=i*0.8;
      this.shellMeshes.push(ring);
      this.atomGroup.add(ring);
    }

    this.electronPositions=new Float32Array(8*3);
    const electronGeometry=new THREE.BufferGeometry();
    electronGeometry.setAttribute("position",new THREE.BufferAttribute(this.electronPositions,3));
    this.electrons=new THREE.Points(electronGeometry,makePointMaterial("#e6fbff",0.10,0.9));
    this.atomGroup.add(this.electrons);
    this.group.add(this.atomGroup);

    this.moleculePositions=new Float32Array(7*3);
    const moleculeGeometry=new THREE.BufferGeometry();
    moleculeGeometry.setAttribute("position",new THREE.BufferAttribute(this.moleculePositions,3));
    this.moleculePoints=new THREE.Points(moleculeGeometry,makePointMaterial("#d9f6ff",0.12,0.82));

    const bondPositions=new Float32Array(8*3);
    const bondGeometry=new THREE.BufferGeometry();
    bondGeometry.setAttribute("position",new THREE.BufferAttribute(bondPositions,3));
    this.moleculeBonds=new THREE.LineSegments(
      bondGeometry,
      new THREE.LineBasicMaterial({
        color:"#78cfff",
        transparent:true,
        opacity:0.62,
        depthWrite:false,
        blending:THREE.AdditiveBlending,
      }),
    );
    this.group.add(this.moleculePoints,this.moleculeBonds);

    const latticePositions=new Float32Array(35*3);
    for(let i=0;i<35;i++){
      const x=(i%7)-3;
      const y=Math.floor(i/7)-2;
      const i3=i*3;
      latticePositions[i3]=x*0.82;
      latticePositions[i3+1]=y*0.68;
      latticePositions[i3+2]=Math.sin(x*0.8+y)*0.22;
    }
    const latticeGeometry=new THREE.BufferGeometry();
    latticeGeometry.setAttribute("position",new THREE.BufferAttribute(latticePositions,3));
    this.lattice=new THREE.Points(latticeGeometry,makePointMaterial("#569dff",0.06,0.42));
    this.group.add(this.lattice);
  }

  update(context:ScienceUpdateContext):void {
    const visible =
      context.scene==="chemistry"
        ? smooth(Math.min(1,context.phase*2.4))
        : context.scene==="mathematics"
          ? 1-smooth(Math.min(1,context.phase*1.35))
          : context.scene==="synthesis" ? 0.08 : 0;

    for(let i=0;i<3;i++){
      const ring=this.shellMeshes[i];
      ring.rotation.y+=context.delta*(0.22+i*0.08);
      setOpacity(ring.material,visible*(0.26+context.energy*0.12));
    }

    for(let i=0;i<8;i++){
      const shell=i<2?0:i<6?1:2;
      const n=shell===0?2:shell===1?4:2;
      const r=0.95+shell*0.56;
      const angle=context.time*(0.8+shell*0.22)+(i%n)*(Math.PI*2/n)+shell;
      const i3=i*3;
      this.electronPositions[i3]=Math.cos(angle)*r;
      this.electronPositions[i3+1]=Math.sin(angle*1.5)*(0.45+r*0.08);
      this.electronPositions[i3+2]=Math.sin(angle)*r;
    }
    (this.electrons.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate=true;
    setOpacity(this.electrons.material,visible*0.92);
    setOpacity(this.atomGroup.children[0].material,visible);

    const water=[
      new THREE.Vector3(-3.3,-1.35,0),
      new THREE.Vector3(-3.92,-1.48,0),
      new THREE.Vector3(-2.68,-1.48,0),
      new THREE.Vector3(3.15,-1.25,-0.2),
      new THREE.Vector3(2.37,-1.25,-0.2),
      new THREE.Vector3(3.93,-1.25,-0.2),
      new THREE.Vector3(0,1.0,0),
    ];

    const bondPairs=[
      [0,1],[0,2],[3,4],[3,5],
    ];

    for(let i=0;i<water.length;i++){
      const i3=i*3;
      this.moleculePositions[i3]=water[i].x;
      this.moleculePositions[i3+1]=water[i].y+Math.sin(context.time*0.55+i)*0.035;
      this.moleculePositions[i3+2]=water[i].z;
    }
    const bp=this.moleculeBonds.geometry.getAttribute("position") as THREE.BufferAttribute;
    for(let i=0;i<bondPairs.length;i++){
      const [a,b]=bondPairs[i];
      bp.setXYZ(i*2,water[a].x,water[a].y,water[a].z);
      bp.setXYZ(i*2+1,water[b].x,water[b].y,water[b].z);
    }
    (this.moleculePoints.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate=true;
    bp.needsUpdate=true;
    setOpacity(this.moleculePoints.material,visible*0.86);
    setOpacity(this.moleculeBonds.material,visible*0.64);
    setOpacity(this.lattice.material,visible*0.55);
    this.lattice.rotation.y=context.time*0.14;
    this.atomGroup.rotation.y=Math.sin(context.time*0.35)*0.1+context.pointer.x*0.08;
  }

  dispose():void { disposeRoot(this.group); }
}

export class MathematicsSystem {
  readonly group=new THREE.Group();

  private readonly spiral:THREE.Line;
  private readonly sine:THREE.Line;
  private readonly parabola:THREE.Line;
  private readonly movingPoint:THREE.Mesh;
  private readonly torus:THREE.Mesh;
  private readonly vectors:THREE.Points;
  private readonly vectorPositions:Float32Array;

  constructor() {
    const material=()=>new THREE.LineBasicMaterial({
      color:"#8bdfff",
      transparent:true,
      opacity:0.72,
      depthWrite:false,
      blending:THREE.AdditiveBlending,
    });

    const spiralPoints:THREE.Vector3[]=[];
    for(let i=0;i<160;i++){
      const theta=i*0.24;
      const radius=0.045*Math.pow(1.055,i*0.64);
      spiralPoints.push(new THREE.Vector3(
        Math.cos(theta)*radius-4.15,
        Math.sin(theta)*radius-0.2,
        Math.sin(theta*1.4)*0.1,
      ));
    }
    this.spiral=makeLine(spiralPoints,"#72cfff",0.72);
    this.spiral.material=material();
    this.group.add(this.spiral);

    const sinePoints:THREE.Vector3[]=[];
    const parabolaPoints:THREE.Vector3[]=[];
    for(let i=0;i<130;i++){
      const x=-3+(i/129)*6;
      sinePoints.push(new THREE.Vector3(x,Math.sin(x*1.8)*0.95,0.1));
      parabolaPoints.push(new THREE.Vector3(x,0.17*x*x-2.15,-0.85));
    }
    this.sine=makeLine(sinePoints,"#7fd8ff",0.72);
    this.parabola=makeLine(parabolaPoints,"#568dff",0.54);
    this.group.add(this.sine,this.parabola);

    this.movingPoint=new THREE.Mesh(new THREE.SphereGeometry(0.11,10,10),makeBasic("#f2fdff",0.95));
    this.group.add(this.movingPoint);

    this.torus=new THREE.Mesh(
      new THREE.TorusKnotGeometry(1.0,0.17,96,12),
      new THREE.MeshBasicMaterial({
        color:"#5ba9ff",
        transparent:true,
        opacity:0.58,
        wireframe:true,
        depthWrite:false,
        blending:THREE.AdditiveBlending,
      }),
    );
    this.torus.position.set(3.7,1.0,-0.5);
    this.group.add(this.torus);

    this.vectorPositions=new Float32Array(25*3);
    for(let i=0;i<25;i++){
      const i3=i*3;
      this.vectorPositions[i3]=-2.0+(i%5)*1.0;
      this.vectorPositions[i3+1]=1.8+Math.floor(i/5)*0.42;
      this.vectorPositions[i3+2]=0;
    }
    const vectorGeometry=new THREE.BufferGeometry();
    vectorGeometry.setAttribute("position",new THREE.BufferAttribute(this.vectorPositions,3));
    this.vectors=new THREE.Points(vectorGeometry,makePointMaterial("#7ad5ff",0.07,0.5));
    this.group.add(this.vectors);
  }

  update(context:ScienceUpdateContext):void {
    const visible =
      context.scene==="mathematics"
        ? smooth(Math.min(1,context.phase*2.5))
        : context.scene==="synthesis"
          ? 1-smooth(Math.min(1,context.phase*1.15))
          : context.scene==="prism" ? 0.045 : 0;

    setOpacity(this.spiral.material,visible*0.85);
    setOpacity(this.sine.material,visible*0.78);
    setOpacity(this.parabola.material,visible*0.66);
    setOpacity(this.movingPoint.material,visible);
    setOpacity(this.torus.material,visible*0.72);
    setOpacity(this.vectors.material,visible*0.62);

    const x=-3.0+((context.time*0.85)%6);
    this.movingPoint.position.set(x,Math.sin(x*1.8)*0.95,0.18);

    this.spiral.rotation.z=-context.time*0.065;
    this.torus.rotation.x=context.time*0.28;
    this.torus.rotation.y=context.time*0.47;
    this.vectors.rotation.z=context.time*0.08;

    for(let i=0;i<25;i++){
      const i3=i*3;
      this.vectorPositions[i3+2]=Math.sin(context.time*1.1+i*0.45)*0.22;
    }
    (this.vectors.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate=true;
  }

  dispose():void { disposeRoot(this.group); }
}

export class SynthesisSystem {
  readonly group=new THREE.Group();

  private readonly shell:THREE.Mesh;
  private readonly core:THREE.Mesh;
  private readonly rings:THREE.Mesh[]=[];
  private readonly shards:THREE.Points;
  private readonly shardPositions:Float32Array;

  constructor(random:SeededRandom) {
    this.shell=new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.25,2),
      new THREE.MeshBasicMaterial({
        color:"#4eafff",
        transparent:true,
        opacity:0.34,
        wireframe:true,
        depthWrite:false,
        blending:THREE.AdditiveBlending,
      }),
    );
    this.core=new THREE.Mesh(
      new THREE.SphereGeometry(0.58,18,18),
      makeBasic("#eefcff",0.92),
    );
    this.group.add(this.shell,this.core);

    for(let i=0;i<5;i++){
      const ring=new THREE.Mesh(
        new THREE.TorusGeometry(2.8+i*0.42,0.012,6,72),
        makeBasic(i%2===0?"#8ce5ff":"#538eff",0.18),
      );
      ring.rotation.x=Math.PI/2+i*0.2;
      ring.rotation.z=i*0.82;
      this.rings.push(ring);
      this.group.add(ring);
    }

    this.shardPositions=new Float32Array(90*3);
    for(let i=0;i<90;i++){
      const dir=randomSphere(random);
      const radius=random.range(3.0,7.5);
      const i3=i*3;
      this.shardPositions[i3]=dir.x*radius;
      this.shardPositions[i3+1]=dir.y*radius*0.72;
      this.shardPositions[i3+2]=dir.z*radius;
    }
    const shardGeometry=new THREE.BufferGeometry();
    shardGeometry.setAttribute("position",new THREE.BufferAttribute(this.shardPositions,3));
    this.shards=new THREE.Points(shardGeometry,makePointMaterial("#7fd7ff",0.055,0.48));
    this.group.add(this.shards);
  }

  update(context:ScienceUpdateContext):void {
    const visible =
      context.scene==="synthesis"
        ? smooth(Math.min(1,context.phase*2.2))
        : context.scene==="labs" ? 1-smooth(Math.min(1,context.phase*1.5))
        : context.scene==="prism" ? 0.36
        : context.scene==="team" ? 0.055
        : context.scene==="launch" ? 0.18
        : 0;

    this.group.scale.setScalar(0.24+visible*0.78+context.energy*0.05);
    this.group.rotation.y=context.time*0.34;
    this.group.rotation.x=-0.2+Math.sin(context.time*0.2)*0.08;

    setOpacity(this.shell.material,visible*0.42);
    setOpacity(this.core.material,visible*0.92);

    const p=0.88+pulse(context.time,2.5)*0.18+context.energy*0.12;
    this.core.scale.setScalar(p);

    for(let i=0;i<this.rings.length;i++){
      const ring=this.rings[i];
      ring.rotation.y+=context.delta*(0.18+i*0.03);
      setOpacity(ring.material,visible*(0.05+pulse(context.time,0.9,i)*0.14));
    }

    for(let i=0;i<90;i++){
      const i3=i*3;
      const radius=3.1+(i%13)*0.28+context.energy*1.2;
      const angle=context.time*(0.11+i*0.001)+i*0.47;
      this.shardPositions[i3]=Math.cos(angle)*radius;
      this.shardPositions[i3+1]=Math.sin(context.time*0.32+i*0.15)*(1.4+context.energy*1.6);
      this.shardPositions[i3+2]=Math.sin(angle)*radius;
    }
    (this.shards.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate=true;
    setOpacity(this.shards.material,visible*(0.12+pulse(context.time,1.6)*0.23));
  }

  dispose():void { disposeRoot(this.group); }
}

export class ScienceShowcase {
  readonly group=new THREE.Group();

  private readonly stars:StarFieldSystem;
  private readonly physics:PhysicsSystem;
  private readonly chemistry:ChemistrySystem;
  private readonly mathematics:MathematicsSystem;
  private readonly synthesis:SynthesisSystem;

  constructor(profile:IntroQualityProfile,random:SeededRandom){
    this.stars=new StarFieldSystem(profile,random);
    this.physics=new PhysicsSystem(random);
    this.chemistry=new ChemistrySystem();
    this.mathematics=new MathematicsSystem();
    this.synthesis=new SynthesisSystem(random);

    this.group.add(
      this.stars.group,
      this.physics.group,
      this.chemistry.group,
      this.mathematics.group,
      this.synthesis.group,
    );
  }

  update(context:ScienceUpdateContext):void {
    this.stars.update(context);
    this.physics.update(context);
    this.chemistry.update(context);
    this.mathematics.update(context);
    this.synthesis.update(context);

    this.group.rotation.y=context.pointer.x*0.025;
    this.group.rotation.x=context.pointer.y*0.018;
  }

  dispose():void { disposeRoot(this.group); }
}
