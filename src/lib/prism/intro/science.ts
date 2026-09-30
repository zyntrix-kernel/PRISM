import * as THREE from "three";
import type {
  IntroPointerState,
  IntroQualityProfile,
  IntroScene,
} from "./types";
import { SeededRandom, randomSphere } from "./random";
import {
  PARTICLE_FRAGMENT,
  PARTICLE_VERTEX,
  PRISM_FRAGMENT,
  PRISM_VERTEX,
} from "./showcase-shaders";

export interface ScienceUpdateContext {
  readonly time: number;
  readonly delta: number;
  readonly scene: IntroScene;
  readonly phase: number;
  readonly energy: number;
  readonly pointer: IntroPointerState;
}

const TAU=Math.PI*2;

function clamp01(v:number):number {
  return Math.min(1,Math.max(0,v));
}

function smooth(v:number):number {
  const x=clamp01(v);
  return x*x*(3-2*x);
}

function easeOut(v:number):number {
  const x=clamp01(v);
  const inv=1-x;
  return 1-inv*inv*inv;
}

function pulse(t:number,s:number,offset=0):number {
  return 0.5+0.5*Math.sin(t*s+offset);
}

function setOpacity(material:THREE.Material,opacity:number):void {
  const m=material as THREE.Material & { opacity?:number };
  if(typeof m.opacity==="number")m.opacity=opacity;
}

function basic(color:string,opacity=1):THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent:opacity<0.999,
    opacity,
    depthWrite:false,
    blending:THREE.AdditiveBlending,
  });
}

function pointShaderMaterial(color:string,sizeScale=1):THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms:{
      uTime:{value:0},
      uScale:{value:sizeScale},
      uColor:{value:new THREE.Color(color)},
    },
    vertexShader:PARTICLE_VERTEX,
    fragmentShader:PARTICLE_FRAGMENT,
    transparent:true,
    depthWrite:false,
    blending:THREE.AdditiveBlending,
  });
}

function line(points:THREE.Vector3[],color:string,opacity=1):THREE.Line {
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({
      color,
      transparent:true,
      opacity,
      depthWrite:false,
      blending:THREE.AdditiveBlending,
    }),
  );
}

function disposeRoot(root:THREE.Object3D):void {
  root.traverse((object)=>{
    const mesh=object as THREE.Mesh;
    mesh.geometry?.dispose();
    if(mesh.material){
      const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      for(const material of materials)material.dispose();
    }
  });
}

function addPulseRing(
  group:THREE.Group,
  radius:number,
  color:string,
):THREE.Mesh {
  const ring=new THREE.Mesh(
    new THREE.TorusGeometry(radius,0.012,7,96),
    basic(color,0),
  );
  ring.rotation.x=Math.PI/2;
  group.add(ring);
  return ring;
}

class CosmicContinuum {
  readonly group=new THREE.Group();

  private readonly particles:THREE.Points;
  private readonly positions:Float32Array;
  private readonly phases:Float32Array;
  private readonly sizes:Float32Array;
  private readonly velocities:Float32Array;
  private readonly material:THREE.ShaderMaterial;

  constructor(profile:IntroQualityProfile,random:SeededRandom){
    const count=Math.min(1400,Math.max(620,Math.round(profile.starCount*0.66)));
    this.positions=new Float32Array(count*3);
    this.phases=new Float32Array(count);
    this.sizes=new Float32Array(count);
    this.velocities=new Float32Array(count);

    for(let i=0;i<count;i++){
      const radius=random.range(9,48);
      const dir=randomSphere(random);
      const i3=i*3;
      this.positions[i3]=dir.x*radius;
      this.positions[i3+1]=dir.y*radius*0.74;
      this.positions[i3+2]=dir.z*radius;
      this.phases[i]=random.range(0,1);
      this.sizes[i]=random.range(0.7,1.7);
      this.velocities[i]=random.range(0.07,0.33);
    }

    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.BufferAttribute(this.positions,3));
    geometry.setAttribute("aPhase",new THREE.BufferAttribute(this.phases,1));
    geometry.setAttribute("aSize",new THREE.BufferAttribute(this.sizes,1));

    this.material=pointShaderMaterial("#bfefff",0.9);
    this.particles=new THREE.Points(geometry,this.material);
    this.particles.frustumCulled=false;
    this.group.add(this.particles);
  }

  update(context:ScienceUpdateContext):void {
    const intensity=
      context.scene==="boot"
        ? 0.18
        : context.scene==="physics" ||
          context.scene==="chemistry" ||
          context.scene==="mathematics" ||
          context.scene==="information" ||
          context.scene==="synthesis"
          ? 0.72
          : 0.38;

    for(let i=0;i<this.velocities.length;i++){
      const i3=i*3;
      this.positions[i3+2]+=
        context.delta*
        this.velocities[i]*
        (0.8+context.energy*0.8);
      if(this.positions[i3+2]>48)this.positions[i3+2]=-48;
      this.positions[i3+1]=
        this.positions[i3+1]*0.995+
        Math.sin(context.time*0.34+this.phases[i]*TAU)*0.002;
    }

    (this.particles.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate=true;
    this.material.uniforms.uTime.value=context.time;
    this.material.uniforms.uScale.value=0.9+context.energy*0.3;
    this.material.uniforms.uColor.value.setRGB(0.62,0.88,1);

    this.particles.rotation.y+=context.delta*0.008;
    this.particles.rotation.x=context.pointer.y*0.025;
    setOpacity(this.material,intensity);
  }

  dispose():void{disposeRoot(this.group);}
}

class EnergyRibbonField {
  readonly group=new THREE.Group();

  private readonly ribbons:Array<{
    line:THREE.Line;
    positions:Float32Array;
    phase:number;
    radius:number;
    tilt:number;
  }> = [];

  constructor(random:SeededRandom,count=4){
    for(let r=0;r<count;r++){
      const samples=92;
      const positions=new Float32Array(samples*3);
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));

      const material=new THREE.LineBasicMaterial({
        color:r%2===0?"#73dcff":"#537fff",
        transparent:true,
        opacity:0,
        depthWrite:false,
        blending:THREE.AdditiveBlending,
      });

      const mesh=new THREE.Line(geometry,material);
      this.group.add(mesh);

      this.ribbons.push({
        line:mesh,
        positions,
        phase:random.range(0,TAU),
        radius:random.range(4.1,7.4),
        tilt:random.signed(0.55),
      });
    }
  }

  update(context:ScienceUpdateContext):void{
    const visible=
      context.scene==="physics"
        ? easeOut(context.phase*1.25)
        : context.scene==="chemistry"
          ? 0.62
          : context.scene==="mathematics"
            ? 0.7
            : context.scene==="information"
              ? 0.64
              : context.scene==="synthesis" || context.scene==="prism"
                ? 0.82
                : 0;

    for(let r=0;r<this.ribbons.length;r++){
      const ribbon=this.ribbons[r];
      const count=ribbon.positions.length/3;
      for(let i=0;i<count;i++){
        const u=i/(count-1);
        const angle=
          ribbon.phase+
          u*TAU*(1.05+r*0.17)+
          context.time*(0.3+r*0.07);
        const radius=
          ribbon.radius*(0.32+0.68*(1-u))+
          Math.sin(u*18+context.time*(0.74+r*0.11))*0.18;

        const i3=i*3;
        ribbon.positions[i3]=Math.cos(angle)*radius;
        ribbon.positions[i3+1]=
          (u-0.5)*(8+r*0.8)*ribbon.tilt+
          Math.sin(context.time*0.6+u*TAU+r)*0.24;
        ribbon.positions[i3+2]=Math.sin(angle)*radius;
      }

      (ribbon.line.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate=true;
      const shimmer=0.45+0.55*pulse(context.time,0.66,ribbon.phase);
      setOpacity(ribbon.line.material,visible*(0.22+shimmer*0.1));
      ribbon.line.rotation.y+=context.delta*(r%2===0?0.018:-0.015);
    }
  }

  dispose():void{disposeRoot(this.group);}
}

class PhysicsLaboratory {
  readonly group=new THREE.Group();

  private readonly projectile:THREE.Mesh;
  private readonly projectileTrail:THREE.Line;
  private readonly pendulum:THREE.Line;
  private readonly bob:THREE.Mesh;
  private readonly orbit=new THREE.Group();
  private readonly field:THREE.Points;
  private readonly fieldPositions:Float32Array;
  private readonly pendulumPositions=new Float32Array(6);

  constructor(random:SeededRandom){
    const v0=7.4;
    const angle=THREE.MathUtils.degToRad(54);
    const g=9.81;
    const flight=(2*v0*Math.sin(angle))/g;
    const trajectory:THREE.Vector3[]=[];

    for(let i=0;i<100;i++){
      const t=(i/99)*flight;
      trajectory.push(
        new THREE.Vector3(
          -5+v0*Math.cos(angle)*t,
          -1.9+v0*Math.sin(angle)*t-0.5*g*t*t,
          0,
        ),
      );
    }

    this.projectileTrail=line(trajectory,"#80ddff",0);
    this.projectile=new THREE.Mesh(
      new THREE.SphereGeometry(0.12,12,12),
      basic("#effcff",0),
    );

    const pendulumGeometry=new THREE.BufferGeometry();
    pendulumGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.pendulumPositions,3),
    );
    this.pendulum=new THREE.Line(
      pendulumGeometry,
      new THREE.LineBasicMaterial({
        color:"#5d91ff",
        transparent:true,
        opacity:0,
      }),
    );
    this.bob=new THREE.Mesh(
      new THREE.SphereGeometry(0.24,12,12),
      basic("#a8ebff",0),
    );

    const sun=new THREE.Mesh(
      new THREE.SphereGeometry(0.45,14,14),
      basic("#fff1a7",0),
    );
    const planet=new THREE.Mesh(
      new THREE.SphereGeometry(0.2,12,12),
      basic("#66c6ff",0),
    );
    const moon=new THREE.Mesh(
      new THREE.SphereGeometry(0.07,8,8),
      basic("#def7ff",0),
    );
    const orbitRing=new THREE.Mesh(
      new THREE.TorusGeometry(1.55,0.012,7,96),
      basic("#66bbff",0),
    );
    planet.position.x=1.55;
    moon.position.x=1.98;
    this.orbit.add(sun,planet,moon,orbitRing);
    this.orbit.position.set(-1.25,2.2,-1.2);

    this.fieldPositions=new Float32Array(40*3);
    for(let i=0;i<40;i++){
      const i3=i*3;
      this.fieldPositions[i3]=random.range(-8,8);
      this.fieldPositions[i3+1]=random.range(-4,4);
      this.fieldPositions[i3+2]=random.range(-2,2);
    }
    const fieldGeometry=new THREE.BufferGeometry();
    fieldGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.fieldPositions,3),
    );
    this.field=new THREE.Points(
      fieldGeometry,
      basic("#5caeff",0) as unknown as THREE.PointsMaterial,
    );

    this.group.add(
      this.projectileTrail,
      this.projectile,
      this.pendulum,
      this.bob,
      this.orbit,
      this.field,
    );
  }

  update(context:ScienceUpdateContext):void{
    const visible=
      context.scene==="physics"
        ? easeOut(context.phase*1.9)
        : context.scene==="chemistry"
          ? 1-smooth(context.phase*1.2)
          : context.scene==="synthesis"
            ? 0.06
            : 0;

    setOpacity(this.projectileTrail.material,visible*0.74);
    setOpacity(this.projectile.material,visible);

    const v0=7.4;
    const angle=THREE.MathUtils.degToRad(54);
    const g=9.81;
    const flight=(2*v0*Math.sin(angle))/g;
    const t=(context.phase*flight*0.97)%flight;

    this.projectile.position.set(
      -5+v0*Math.cos(angle)*t,
      -1.9+v0*Math.sin(angle)*t-0.5*g*t*t,
      Math.sin(context.time*6)*0.07,
    );

    const pivotX=2.7;
    const pivotY=1.55;
    const length=2.7;
    const omega=Math.sqrt(g/length);
    const swing=
      THREE.MathUtils.degToRad(27)*
      Math.cos(omega*context.time*0.92);

    const bobX=pivotX+Math.sin(swing)*length;
    const bobY=pivotY-Math.cos(swing)*length;

    this.pendulumPositions.set([
      pivotX,pivotY,0.12,
      bobX,bobY,0.12,
    ]);
    (
      this.pendulum.geometry.getAttribute("position") as THREE.BufferAttribute
    ).needsUpdate=true;

    this.bob.position.set(bobX,bobY,0.12);
    setOpacity(this.pendulum.material,visible*0.66);
    setOpacity(this.bob.material,visible);

    for(let i=0;i<3;i++){
      const child=this.orbit.children[i];
      if(child instanceof THREE.Mesh){
        setOpacity(child.material,visible*(i===0?0.9:0.58));
      }
    }
    setOpacity(
      (this.orbit.children[3] as THREE.Mesh).material,
      visible*0.38,
    );

    this.orbit.rotation.y=context.time*0.48;
    this.orbit.rotation.z=context.pointer.x*0.05;
    this.field.rotation.z=context.time*0.13;
    setOpacity(this.field.material,visible*0.38);
  }

  dispose():void{disposeRoot(this.group);}
}

class ChemistryLaboratory {
  readonly group=new THREE.Group();

  private readonly atom=new THREE.Group();
  private readonly shellMeshes:THREE.Mesh[]=[];
  private readonly electrons:THREE.Points;
  private readonly electronPositions=new Float32Array(10*3);

  private readonly molecules:THREE.Points;
  private readonly moleculePositions=new Float32Array(9*3);
  private readonly bonds:THREE.LineSegments;

  private readonly dnaA:THREE.Line;
  private readonly dnaB:THREE.Line;
  private readonly dnaCross:THREE.LineSegments;
  private readonly lattice:THREE.Points;

  constructor(){
    this.atom.add(
      new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.5,1),
        basic("#72b8ff",0),
      ),
    );

    for(let i=0;i<3;i++){
      const shell=new THREE.Mesh(
        new THREE.TorusGeometry(1+i*0.62,0.014,8,100),
        basic(i%2===0?"#74d6ff":"#4e83ff",0),
      );
      shell.rotation.x=Math.PI/2+i*0.4;
      shell.rotation.z=i*0.75;
      this.shellMeshes.push(shell);
      this.atom.add(shell);
    }

    const electronGeometry=new THREE.BufferGeometry();
    electronGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.electronPositions,3),
    );
    this.electrons=new THREE.Points(
      electronGeometry,
      pointShaderMaterial("#e9fdff",1.1),
    );
    this.atom.add(this.electrons);
    this.group.add(this.atom);

    const moleculeGeometry=new THREE.BufferGeometry();
    moleculeGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.moleculePositions,3),
    );
    this.molecules=new THREE.Points(
      moleculeGeometry,
      pointShaderMaterial("#effcff",0.9),
    );

    const bondPositions=new Float32Array(10*3);
    const bondGeometry=new THREE.BufferGeometry();
    bondGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(bondPositions,3),
    );
    this.bonds=new THREE.LineSegments(
      bondGeometry,
      new THREE.LineBasicMaterial({
        color:"#7ed4ff",
        transparent:true,
        opacity:0,
        depthWrite:false,
      }),
    );

    this.group.add(this.molecules,this.bonds);

    const dnaSamples=96;
    const dnaAPosition=new Float32Array(dnaSamples*3);
    const dnaBPosition=new Float32Array(dnaSamples*3);
    const crossPosition=new Float32Array(48*2*3);
    const geoA=new THREE.BufferGeometry();
    const geoB=new THREE.BufferGeometry();
    const geoCross=new THREE.BufferGeometry();

    geoA.setAttribute("position",new THREE.BufferAttribute(dnaAPosition,3));
    geoB.setAttribute("position",new THREE.BufferAttribute(dnaBPosition,3));
    geoCross.setAttribute("position",new THREE.BufferAttribute(crossPosition,3));

    this.dnaA=new THREE.Line(geoA,new THREE.LineBasicMaterial({
      color:"#6ebfff",transparent:true,opacity:0,depthWrite:false,
      blending:THREE.AdditiveBlending,
    }));
    this.dnaB=new THREE.Line(geoB,new THREE.LineBasicMaterial({
      color:"#b5efff",transparent:true,opacity:0,depthWrite:false,
      blending:THREE.AdditiveBlending,
    }));
    this.dnaCross=new THREE.LineSegments(geoCross,new THREE.LineBasicMaterial({
      color:"#5f98ff",transparent:true,opacity:0,depthWrite:false,
      blending:THREE.AdditiveBlending,
    }));

    const latticePositions=new Float32Array(49*3);
    for(let i=0;i<49;i++){
      const x=(i%7)-3;
      const y=Math.floor(i/7)-3;
      const i3=i*3;
      latticePositions[i3]=x*0.72;
      latticePositions[i3+1]=y*0.62;
      latticePositions[i3+2]=Math.sin(x*0.8+y*0.55)*0.2;
    }
    const latticeGeometry=new THREE.BufferGeometry();
    latticeGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(latticePositions,3),
    );
    this.lattice=new THREE.Points(
      latticeGeometry,
      pointShaderMaterial("#5ca8ff",0.74),
    );

    this.group.add(this.dnaA,this.dnaB,this.dnaCross,this.lattice);
  }

  update(context:ScienceUpdateContext):void{
    const visible=
      context.scene==="chemistry"
        ? easeOut(context.phase*1.75)
        : context.scene==="mathematics"
          ? 1-smooth(context.phase*1.45)
          : context.scene==="synthesis"
            ? 0.08
            : 0;

    const time=context.time;

    for(let shell=0;shell<3;shell++){
      const ring=this.shellMeshes[shell];
      ring.rotation.y+=context.delta*(0.2+shell*0.07);
      setOpacity(ring.material,visible*(0.24+context.energy*0.12));
    }

    setOpacity(
      (this.atom.children[0] as THREE.Mesh).material,
      visible*0.9,
    );

    for(let i=0;i<10;i++){
      const shell=i<2?0:i<6?1:2;
      const count=shell===0?2:shell===1?4:4;
      const radius=1+shell*0.62;
      const angle=time*(0.86+shell*0.17)+(i%count)*(TAU/count)+shell;
      const i3=i*3;
      this.electronPositions[i3]=Math.cos(angle)*radius;
      this.electronPositions[i3+1]=Math.sin(angle*1.47)*(0.44+radius*0.08);
      this.electronPositions[i3+2]=Math.sin(angle)*radius;
    }
    (this.electrons.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate=true;
    const eMat=this.electrons.material as THREE.ShaderMaterial;
    eMat.uniforms.uTime.value=time;
    eMat.uniforms.uScale.value=1.2;
    setOpacity(eMat,visible*0.9);

    const nodes=[
      [-3.45,-1.2,0],
      [-4.12,-1.35,0],
      [-2.78,-1.35,0],
      [3.18,-1.2,-0.3],
      [2.38,-1.2,-0.3],
      [3.98,-1.2,-0.3],
      [0,0.9,0],
      [0.6,0.9,0],
      [-0.6,0.9,0],
    ] as const;

    for(let i=0;i<nodes.length;i++){
      const i3=i*3;
      this.moleculePositions[i3]=nodes[i][0];
      this.moleculePositions[i3+1]=nodes[i][1]+Math.sin(time*0.9+i)*0.04;
      this.moleculePositions[i3+2]=nodes[i][2];
    }

    (this.molecules.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate=true;
    const mMat=this.molecules.material as THREE.ShaderMaterial;
    mMat.uniforms.uTime.value=time;
    setOpacity(mMat,visible*0.86);

    const pairs=[
      [0,1],[0,2],[3,4],[3,5],[6,7],
    ] as const;
    const bondAttribute=this.bonds.geometry.getAttribute("position") as THREE.BufferAttribute;
    for(let i=0;i<pairs.length;i++){
      const [a,b]=pairs[i];
      bondAttribute.setXYZ(i*2,nodes[a][0],nodes[a][1],nodes[a][2]);
      bondAttribute.setXYZ(i*2+1,nodes[b][0],nodes[b][1],nodes[b][2]);
    }
    bondAttribute.needsUpdate=true;
    setOpacity(this.bonds.material,visible*0.68);

    const samples=this.dnaA.geometry.getAttribute("position").count;
    const dnaA=this.dnaA.geometry.getAttribute("position") as THREE.BufferAttribute;
    const dnaB=this.dnaB.geometry.getAttribute("position") as THREE.BufferAttribute;
    for(let i=0;i<samples;i++){
      const u=i/(samples-1);
      const y=(u-0.5)*6.2;
      const a=u*TAU*3.4+time*0.8;
      dnaA.setXYZ(i,-4.7+Math.cos(a)*0.72,y,-0.7+Math.sin(a)*0.72);
      dnaB.setXYZ(i,-4.7+Math.cos(a+Math.PI)*0.72,y,-0.7+Math.sin(a+Math.PI)*0.72);
    }
    dnaA.needsUpdate=true;
    dnaB.needsUpdate=true;

    const cross=this.dnaCross.geometry.getAttribute("position") as THREE.BufferAttribute;
    for(let i=0;i<48;i++){
      const u=i/47;
      const y=(u-0.5)*6.2;
      const a=u*TAU*3.4+time*0.8;
      cross.setXYZ(i*2,-4.7+Math.cos(a)*0.72,y,-0.7+Math.sin(a)*0.72);
      cross.setXYZ(i*2+1,-4.7+Math.cos(a+Math.PI)*0.72,y,-0.7+Math.sin(a+Math.PI)*0.72);
    }
    cross.needsUpdate=true;

    setOpacity(this.dnaA.material,visible*0.54);
    setOpacity(this.dnaB.material,visible*0.48);
    setOpacity(this.dnaCross.material,visible*0.32);

    const lMat=this.lattice.material as THREE.ShaderMaterial;
    lMat.uniforms.uTime.value=time;
    lMat.uniforms.uScale.value=0.76;
    setOpacity(lMat,visible*0.44);

    this.atom.rotation.y=context.pointer.x*0.1;
    this.atom.rotation.x=context.pointer.y*0.06;
    this.dnaA.rotation.y=time*0.18;
    this.dnaB.rotation.y=time*0.18;
    this.dnaCross.rotation.y=time*0.18;
    this.lattice.rotation.y=time*0.12;
  }

  dispose():void{disposeRoot(this.group);}
}

class MathematicsLaboratory {
  readonly group=new THREE.Group();

  private readonly sine:THREE.Line;
  private readonly cosine:THREE.Line;
  private readonly parabola:THREE.Line;
  private readonly spiral:THREE.Line;
  private readonly lissajous:THREE.Line;
  private readonly knot:THREE.Mesh;
  private readonly graphPoint:THREE.Mesh;
  private readonly axes:THREE.Group;

  constructor(){
    const material=(color:string,opacity:number)=>new THREE.LineBasicMaterial({
      color,transparent:true,opacity,depthWrite:false,
      blending:THREE.AdditiveBlending,
    });

    const sinePoints:THREE.Vector3[]=[];
    const cosinePoints:THREE.Vector3[]=[];
    const parabolaPoints:THREE.Vector3[]=[];
    const spiralPoints:THREE.Vector3[]=[];
    const lissajousPoints:THREE.Vector3[]=[];

    for(let i=0;i<180;i++){
      const u=i/179;
      const x=-4+u*8;
      sinePoints.push(new THREE.Vector3(x,Math.sin(x*1.5)*0.9,-0.1));
      cosinePoints.push(new THREE.Vector3(x,Math.cos(x*1.15)*0.55,0.1));
      parabolaPoints.push(new THREE.Vector3(x,0.15*x*x-2.5,-0.75));
      const theta=u*TAU*2.15;
      const radius=0.055*Math.pow(1.055,i*0.6);
      spiralPoints.push(new THREE.Vector3(
        Math.cos(theta)*radius-4.4,
        Math.sin(theta)*radius+0.35,
        Math.sin(theta*1.3)*0.1,
      ));
      const l=u*TAU*2.6;
      lissajousPoints.push(new THREE.Vector3(
        Math.sin(3*l)*1.1+3.3,
        Math.sin(4*l)*0.9,
        Math.cos(2*l)*0.7-0.5,
      ));
    }

    this.sine=new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(sinePoints),
      material("#86e1ff",0),
    );
    this.cosine=new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(cosinePoints),
      material("#5e9eff",0),
    );
    this.parabola=new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(parabolaPoints),
      material("#5185ff",0),
    );
    this.spiral=new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(spiralPoints),
      material("#93eaff",0),
    );
    this.lissajous=new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(lissajousPoints),
      material("#68b6ff",0),
    );

    this.knot=new THREE.Mesh(
      new THREE.TorusKnotGeometry(1.05,0.18,128,16),
      new THREE.MeshBasicMaterial({
        color:"#6aafff",
        transparent:true,
        opacity:0,
        wireframe:true,
        depthWrite:false,
        blending:THREE.AdditiveBlending,
      }),
    );
    this.knot.position.set(3.55,1.0,-0.5);

    this.graphPoint=new THREE.Mesh(
      new THREE.SphereGeometry(0.105,10,10),
      basic("#efffff",0),
    );

    this.axes=new THREE.Group();
    const axisX=line([
      new THREE.Vector3(-4.2,0,0.2),
      new THREE.Vector3(4.2,0,0.2),
    ],"#5a8dff",0);
    const axisY=line([
      new THREE.Vector3(0,-3.2,0.2),
      new THREE.Vector3(0,3.2,0.2),
    ],"#6bc1ff",0);
    this.axes.add(axisX,axisY);

    this.group.add(
      this.sine,
      this.cosine,
      this.parabola,
      this.spiral,
      this.lissajous,
      this.knot,
      this.graphPoint,
      this.axes,
    );
  }

  update(context:ScienceUpdateContext):void{
    const visible=
      context.scene==="mathematics"
        ? easeOut(context.phase*1.7)
        : context.scene==="information"
          ? 0.48
          : context.scene==="synthesis"
            ? 1-smooth(context.phase*1.25)
            : context.scene==="prism"
              ? 0.035
              : 0;

    setOpacity(this.sine.material,visible*0.78);
    setOpacity(this.cosine.material,visible*0.44);
    setOpacity(this.parabola.material,visible*0.58);
    setOpacity(this.spiral.material,visible*0.76);
    setOpacity(this.lissajous.material,visible*0.44);
    setOpacity(this.knot.material,visible*0.64);
    setOpacity(this.graphPoint.material,visible);

    const x=-4+((context.time*1.1)%8);
    this.graphPoint.position.set(x,Math.sin(x*1.5)*0.9,0.18);

    this.spiral.rotation.z=-context.time*0.08;
    this.knot.rotation.x=context.time*0.28;
    this.knot.rotation.y=context.time*0.46;
    this.lissajous.rotation.y=context.time*0.28;
    this.axes.rotation.y=context.pointer.x*0.03;
    setOpacity((this.axes.children[0] as THREE.Line).material,visible*0.22);
    setOpacity((this.axes.children[1] as THREE.Line).material,visible*0.22);
  }

  dispose():void{disposeRoot(this.group);}
}

class InformationLaboratory {
  readonly group=new THREE.Group();

  private readonly bars:THREE.InstancedMesh;
  private readonly signal:THREE.Line;
  private readonly particles:THREE.Points;
  private readonly signalPositions=new Float32Array(120*3);
  private readonly dummy=new THREE.Object3D();
  private readonly colorA=new THREE.Color("#4f8bff");
  private readonly colorB=new THREE.Color("#a8ecff");

  constructor(){
    const barGeometry=new THREE.BoxGeometry(0.16,0.16,0.16);
    const barMaterial=new THREE.MeshBasicMaterial({
      color:"#5aaeff",
      transparent:true,
      opacity:0.48,
      depthWrite:false,
      blending:THREE.AdditiveBlending,
    });

    this.bars=new THREE.InstancedMesh(barGeometry,barMaterial,81);
    this.group.add(this.bars);

    const signalPoints:THREE.Vector3[]=[];
    for(let i=0;i<140;i++){
      const x=-4.8+(i/139)*9.6;
      signalPoints.push(new THREE.Vector3(
        x,
        Math.sin(x*2.7)*0.5,
        Math.cos(x*1.1)*0.2,
      ));
    }
    this.signal=line(signalPoints,"#73d8ff",0);
    this.group.add(this.signal);

    for(let i=0;i<120;i++){
      const i3=i*3;
      this.signalPositions[i3]=-5+(i%30)*0.34;
      this.signalPositions[i3+1]=-2.8+Math.floor(i/30)*1.85;
      this.signalPositions[i3+2]=(i%5)*0.25-0.5;
    }

    const particleGeometry=new THREE.BufferGeometry();
    particleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.signalPositions,3),
    );
    this.particles=new THREE.Points(
      particleGeometry,
      pointShaderMaterial("#6ac4ff",0.7),
    );
    this.group.add(this.particles);

    let index=0;
    for(let y=0;y<9;y++){
      for(let x=0;x<9;x++){
        this.dummy.position.set(
          (x-4)*0.55,
          (y-4)*0.55,
          0,
        );
        this.dummy.scale.set(1,1,1);
        this.dummy.updateMatrix();
        this.bars.setMatrixAt(index,this.dummy.matrix);

        const t=(x+y)/16;
        this.bars.setColorAt(index,this.colorA.clone().lerp(this.colorB,t));
        index++;
      }
    }
    this.bars.instanceMatrix.needsUpdate=true;
    if(this.bars.instanceColor)this.bars.instanceColor.needsUpdate=true;
    this.bars.position.y=-0.15;
    this.bars.position.z=-0.5;
  }

  update(context:ScienceUpdateContext):void{
    const visible=
      context.scene==="information"
        ? easeOut(context.phase*1.8)
        : context.scene==="synthesis"
          ? 1-smooth(context.phase*1.55)
          : context.scene==="mathematics"
            ? 0.08
            : 0;

    const matrix=this.bars.instanceMatrix;
    for(let i=0;i<81;i++){
      const x=i%9;
      const y=Math.floor(i/9);
      const wave=0.5+0.5*Math.sin(
        context.time*2.2+
        x*0.55+
        y*0.4,
      );
      this.dummy.position.set(
        (x-4)*0.55,
        (y-4)*0.55,
        wave*(0.15+context.energy*0.5),
      );
      const scale=0.34+wave*0.95;
      this.dummy.scale.set(1,1,scale);
      this.dummy.rotation.set(
        wave*0.18,
        context.time*0.18*(x%2===0?1:-1),
        (x-y)*0.01,
      );
      this.dummy.updateMatrix();
      this.bars.setMatrixAt(i,this.dummy.matrix);
    }
    matrix.needsUpdate=true;
    setOpacity(this.bars.material,visible*0.55);

    const signalAttribute=this.signal.geometry.getAttribute("position") as THREE.BufferAttribute;
    for(let i=0;i<signalAttribute.count;i++){
      const x=-4.8+(i/(signalAttribute.count-1))*9.6;
      signalAttribute.setY(
        i,
        Math.sin(x*2.7-context.time*3.1)*0.45+
        Math.sin(x*5.3+context.time*1.7)*0.12,
      );
      signalAttribute.setZ(
        i,
        Math.cos(x*1.1+context.time)*0.18,
      );
    }
    signalAttribute.needsUpdate=true;
    setOpacity(this.signal.material,visible*0.7);

    const pos=this.particles.geometry.getAttribute("position") as THREE.BufferAttribute;
    for(let i=0;i<120;i++){
      const i3=i*3;
      pos.setX(
        i,
        this.signalPositions[i3]+
          Math.sin(context.time*0.8+i*0.07)*0.035,
      );
      pos.setY(
        i,
        this.signalPositions[i3+1]+
          Math.sin(context.time*1.2+i*0.12)*0.04,
      );
    }
    pos.needsUpdate=true;
    const pMat=this.particles.material as THREE.ShaderMaterial;
    pMat.uniforms.uTime.value=context.time;
    setOpacity(pMat,visible*0.42);

    this.group.rotation.y=context.pointer.x*0.04;
    this.group.rotation.x=context.pointer.y*0.03;
  }

  dispose():void{disposeRoot(this.group);}
}

function createTriangularPrism():THREE.BufferGeometry{
  const vertices=new Float32Array([
    -1.25,-0.76,-0.68,
     1.25,-0.76,-0.68,
     0,1.12,-0.68,
    -1.25,-0.76,0.68,
     1.25,-0.76,0.68,
     0,1.12,0.68,
  ]);

  const indices=[
    0,1,2,
    3,5,4,
    0,3,4, 0,4,1,
    1,4,5, 1,5,2,
    2,5,3, 2,3,0,
  ];

  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.BufferAttribute(vertices,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

class PrismSynthesisLaboratory {
  readonly group=new THREE.Group();

  private readonly prism:THREE.Mesh;
  private readonly innerPrism:THREE.Mesh;
  private readonly rings:THREE.Mesh[]=[];
  private readonly rays:Array<{
    line:THREE.Line;
    positions:Float32Array;
    hue:number;
  }>=[];
  private readonly nodes:THREE.Points;
  private readonly nodePositions=new Float32Array(64*3);
  private flash=0;

  constructor(random:SeededRandom){
    const prismGeometry=createTriangularPrism();

    this.prism=new THREE.Mesh(
      prismGeometry,
      new THREE.ShaderMaterial({
        uniforms:{
          uTime:{value:0},
          uEnergy:{value:0},
          uFlash:{value:0},
          uBreath:{value:1},
        },
        vertexShader:PRISM_VERTEX,
        fragmentShader:PRISM_FRAGMENT,
        transparent:true,
        depthWrite:false,
        side:THREE.DoubleSide,
        blending:THREE.AdditiveBlending,
      }),
    );
    this.prism.scale.setScalar(1.45);
    this.group.add(this.prism);

    this.innerPrism=new THREE.Mesh(
      createTriangularPrism(),
      new THREE.MeshBasicMaterial({
        color:"#e8fbff",
        transparent:true,
        opacity:0,
        wireframe:true,
        depthWrite:false,
        blending:THREE.AdditiveBlending,
      }),
    );
    this.innerPrism.scale.setScalar(1.02);
    this.group.add(this.innerPrism);

    for(let i=0;i<8;i++){
      const ring=addPulseRing(
        this.group,
        2.6+i*0.42,
        i%2===0?"#8de7ff":"#5688ff",
      );
      ring.rotation.x=Math.PI/2+i*0.18;
      ring.rotation.z=i*0.62;
      this.rings.push(ring);
    }

    for(let r=0;r<5;r++){
      const samples=42;
      const positions=new Float32Array(samples*3);
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions,3),
      );
      const mesh=new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          color:r===0?"#eafcff":r%2===0?"#68d8ff":"#648fff",
          transparent:true,
          opacity:0,
          depthWrite:false,
          blending:THREE.AdditiveBlending,
        }),
      );
      this.group.add(mesh);
      this.rays.push({
        line:mesh,
        positions,
        hue:r,
      });
    }

    for(let i=0;i<64;i++){
      const dir=randomSphere(random);
      const radius=random.range(2.9,6.9);
      const i3=i*3;
      this.nodePositions[i3]=dir.x*radius;
      this.nodePositions[i3+1]=dir.y*radius*0.8;
      this.nodePositions[i3+2]=dir.z*radius;
    }
    const nodeGeometry=new THREE.BufferGeometry();
    nodeGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.nodePositions,3),
    );
    this.nodes=new THREE.Points(
      nodeGeometry,
      pointShaderMaterial("#9aeaff",0.8),
    );
    this.group.add(this.nodes);
  }

  triggerFlash():void{
    this.flash=1;
  }

  update(context:ScienceUpdateContext):void{
    const visible=
      context.scene==="synthesis"
        ? easeOut(context.phase*2.3)
        : context.scene==="labs"
          ? 1-smooth(context.phase*1.65)
          : context.scene==="prism"
            ? 0.95
            : context.scene==="team"
              ? 0.08
              : context.scene==="launch"
                ? 1
                : 0;

    const shader=this.prism.material as THREE.ShaderMaterial;
    shader.uniforms.uTime.value=context.time;
    shader.uniforms.uEnergy.value=context.energy;
    shader.uniforms.uFlash.value=this.flash;
    shader.uniforms.uBreath.value=0.9+pulse(context.time,1.8)*0.16;

    setOpacity(shader,visible*0.68);
    setOpacity(this.innerPrism.material,visible*0.38);

    const scale=
      (0.78+visible*0.54+context.energy*0.06)*
      (0.98+0.03*Math.sin(context.time*2));
    this.group.scale.setScalar(scale);
    this.group.rotation.x=-0.16+Math.sin(context.time*0.22)*0.08;
    this.group.rotation.y=context.time*0.38;
    this.group.rotation.z=context.pointer.x*0.04;

    for(let i=0;i<this.rings.length;i++){
      const ring=this.rings[i];
      ring.rotation.y+=context.delta*(0.11+i*0.024);
      ring.rotation.x+=context.delta*0.004*(i+1);
      const shimmer=0.5+0.5*Math.sin(context.time*(0.7+i*0.08)+i);
      setOpacity(ring.material,visible*(0.035+shimmer*0.1));
    }

    for(let i=0;i<this.rays.length;i++){
      const ray=this.rays[i];
      const count=ray.positions.length/3;
      for(let j=0;j<count;j++){
        const u=j/(count-1);
        const pre=Math.min(u/0.42,1);
        const post=Math.max((u-0.42)/0.58,0);
        const startX=-5.4+pre*4.8;
        const baseY=(i-2)*0.22;

        let x=startX;
        let y=baseY;

        if(u>0.42){
          x=-0.55+post*5.4;
          const spread=(i-2)*0.24;
          const bend=post*post*1.05*(i%2===0?1:-1);
          y=baseY+spread*post+bend;
        }

        const i3=j*3;
        ray.positions[i3]=x;
        ray.positions[i3+1]=y+Math.sin(context.time*1.2+u*7+i)*0.025;
        ray.positions[i3+2]=0.55+Math.sin(post*Math.PI)*0.45;
      }
      (
        ray.line.geometry.getAttribute("position") as THREE.BufferAttribute
      ).needsUpdate=true;
      setOpacity(
        ray.line.material,
        visible*(0.14+(ray.hue===0?0.2:0.08))*(
          0.55+0.45*pulse(context.time,1.4,ray.hue)
        ),
      );
    }

    for(let i=0;i<64;i++){
      const i3=i*3;
      const radius=3.1+(i%16)*0.22+context.energy*0.7;
      const angle=context.time*(0.1+i*0.001)+i*0.53;
      this.nodePositions[i3]=Math.cos(angle)*radius;
      this.nodePositions[i3+1]=Math.sin(
        context.time*0.35+i*0.13,
      )*(1.45+context.energy*1.6);
      this.nodePositions[i3+2]=Math.sin(angle)*radius;
    }
    (
      this.nodes.geometry.getAttribute("position") as THREE.BufferAttribute
    ).needsUpdate=true;

    const nMat=this.nodes.material as THREE.ShaderMaterial;
    nMat.uniforms.uTime.value=context.time;
    nMat.uniforms.uScale.value=0.85;
    setOpacity(nMat,visible*(0.07+context.energy*0.16));

    this.flash=Math.max(0,this.flash-context.delta*2.8);
  }

  dispose():void{disposeRoot(this.group);}
}

export class ScienceShowcase {
  readonly group=new THREE.Group();

  private readonly cosmos:CosmicContinuum;
  private readonly ribbons:EnergyRibbonField;
  private readonly physics:PhysicsLaboratory;
  private readonly chemistry:ChemistryLaboratory;
  private readonly mathematics:MathematicsLaboratory;
  private readonly information:InformationLaboratory;
  private readonly synthesis:PrismSynthesisLaboratory;

  constructor(
    profile:IntroQualityProfile,
    random:SeededRandom,
  ){
    this.cosmos=new CosmicContinuum(profile,random);
    this.ribbons=new EnergyRibbonField(random,4);
    this.physics=new PhysicsLaboratory(random);
    this.chemistry=new ChemistryLaboratory();
    this.mathematics=new MathematicsLaboratory();
    this.information=new InformationLaboratory();
    this.synthesis=new PrismSynthesisLaboratory(random);

    this.group.add(
      this.cosmos.group,
      this.ribbons.group,
      this.physics.group,
      this.chemistry.group,
      this.mathematics.group,
      this.information.group,
      this.synthesis.group,
    );
  }

  triggerCoreFlash():void{
    this.synthesis.triggerFlash();
  }

  update(context:ScienceUpdateContext):void{
    this.cosmos.update(context);
    this.ribbons.update(context);
    this.physics.update(context);
    this.chemistry.update(context);
    this.mathematics.update(context);
    this.information.update(context);
    this.synthesis.update(context);

    this.group.rotation.y=context.pointer.x*0.022;
    this.group.rotation.x=context.pointer.y*0.014;
  }

  dispose():void{disposeRoot(this.group);}
}
