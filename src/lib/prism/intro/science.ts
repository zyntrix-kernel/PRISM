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

const PI2=Math.PI*2;

function clamp01(v:number):number {
  return Math.min(1,Math.max(0,v));
}

function smooth(v:number):number {
  const x=clamp01(v);
  return x*x*(3-2*x);
}

function easeOut(v:number):number {
  const x=1-clamp01(v);
  return 1-x*x*x;
}

function pulse(t:number,s:number,o=0):number {
  return 0.5+0.5*Math.sin(t*s+o);
}

function setOpacity(
  material:THREE.Material,
  opacity:number,
):void {
  const candidate=material as THREE.Material & { opacity?:number };
  if(typeof candidate.opacity==="number"){
    candidate.opacity=opacity;
  }
}

function basic(
  color:string,
  opacity=1,
  blending=THREE.AdditiveBlending,
):THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent:opacity<0.999,
    opacity,
    depthWrite:false,
    blending,
  });
}

function pointsMaterial(
  color:string,
  size:number,
  opacity=1,
):THREE.PointsMaterial {
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

function line(
  points:THREE.Vector3[],
  color:string,
  opacity=1,
):THREE.Line {
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
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
    if(mesh.geometry) mesh.geometry.dispose();
    if(mesh.material){
      const materials=Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for(const material of materials) material.dispose();
    }
  });
}

class WaveRibbonSystem {
  readonly group=new THREE.Group();

  private readonly ribbons:Array<{
    line:THREE.Line;
    positions:Float32Array;
    phase:number;
    radius:number;
    tilt:number;
  }>=[];

  constructor(random:SeededRandom,count=5){
    for(let r=0;r<count;r++){
      const samples=84;
      const positions=new Float32Array(samples*3);
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions,3),
      );
      const mesh=new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          color:r%2===0?"#72d6ff":"#547dff",
          transparent:true,
          opacity:0,
          depthWrite:false,
          blending:THREE.AdditiveBlending,
        }),
      );
      this.group.add(mesh);
      this.ribbons.push({
        line:mesh,
        positions,
        phase:random.range(0,PI2),
        radius:random.range(4.2,7.8),
        tilt:random.signed(0.55),
      });
    }
  }

  update(context:ScienceUpdateContext):void {
    const visible=
      context.scene==="physics"
        ? smooth(context.phase)
        : context.scene==="chemistry"
          ? 1-smooth(context.phase*1.35)
          : context.scene==="mathematics"
            ? 0.7
            : context.scene==="synthesis"
              ? 0.72
              : 0;

    for(let r=0;r<this.ribbons.length;r++){
      const ribbon=this.ribbons[r];
      const count=ribbon.positions.length/3;
      for(let i=0;i<count;i++){
        const u=i/(count-1);
        const angle=
          ribbon.phase+
          u*PI2*(1.3+r*0.16)+
          context.time*(0.32+r*0.045);
        const radius=
          ribbon.radius*
          (0.34+0.66*(1-u))+
          Math.sin(
            u*18+
            context.time*(0.8+r*0.11)+
            ribbon.phase,
          )*0.15;

        const i3=i*3;
        ribbon.positions[i3]=Math.cos(angle)*radius;
        ribbon.positions[i3+1]=
          (u-0.5)*
          (8.5+r*0.9)*
          ribbon.tilt+
          Math.sin(context.time*0.7+u*PI2+r)*0.3;
        ribbon.positions[i3+2]=Math.sin(angle)*radius;
      }

      const attribute=ribbon.line.geometry.getAttribute("position") as THREE.BufferAttribute;
      attribute.needsUpdate=true;

      const shimmer=
        0.45+
        0.55*pulse(context.time,0.7,ribbon.phase);
      setOpacity(ribbon.line.material,visible*0.28*shimmer);
      ribbon.line.rotation.y+=context.delta*0.025*(r%2===0?1:-1);
    }
  }

  dispose():void { disposeRoot(this.group); }
}

class CosmicFieldSystem {
  readonly group=new THREE.Group();

  private readonly stars:THREE.Points;
  private readonly positions:Float32Array;
  private readonly baseY:Float32Array;
  private readonly velocity:Float32Array;

  constructor(profile:IntroQualityProfile,random:SeededRandom){
    const count=Math.min(
      1500,
      Math.max(620,Math.round(profile.starCount*0.7)),
    );
    this.positions=new Float32Array(count*3);
    this.baseY=new Float32Array(count);
    this.velocity=new Float32Array(count);

    for(let i=0;i<count;i++){
      const radius=random.range(10,46);
      const dir=randomSphere(random);
      const i3=i*3;
      this.positions[i3]=dir.x*radius;
      this.positions[i3+1]=dir.y*radius*0.72;
      this.positions[i3+2]=dir.z*radius;
      this.baseY[i]=this.positions[i3+1];
      this.velocity[i]=random.range(0.08,0.36);
    }

    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions,3),
    );
    this.stars=new THREE.Points(
      geometry,
      pointsMaterial("#c9efff",0.045,0.62),
    );
    this.stars.frustumCulled=false;
    this.group.add(this.stars);
  }

  update(context:ScienceUpdateContext):void {
    const sceneBoost=
      context.scene==="boot"
        ? 0.2
        : context.scene==="physics" ||
          context.scene==="chemistry" ||
          context.scene==="mathematics" ||
          context.scene==="synthesis"
          ? 1
          : 0.5;

    for(let i=0;i<this.velocity.length;i++){
      const i3=i*3;
      this.positions[i3+2]+=
        context.delta*
        this.velocity[i]*
        (0.6+sceneBoost+context.energy*0.5);

      if(this.positions[i3+2]>46){
        this.positions[i3+2]=-46;
      }

      this.positions[i3+1]=
        this.baseY[i]+
        Math.sin(context.time*0.32+i*0.011)*0.05;
    }

    (
      this.stars.geometry.getAttribute("position") as THREE.BufferAttribute
    ).needsUpdate=true;

    setOpacity(
      this.stars.material,
      sceneBoost*(0.08+context.energy*0.58),
    );

    this.group.rotation.y+=context.delta*0.008;
    this.group.rotation.x=context.pointer.y*0.024;
  }

  dispose():void { disposeRoot(this.group); }
}

class PhysicsSystem {
  readonly group=new THREE.Group();

  private readonly projectile:THREE.Mesh;
  private readonly trail:THREE.Line;
  private readonly pendulum:THREE.Line;
  private readonly bob:THREE.Mesh;
  private readonly orbit:THREE.Group;
  private readonly field:THREE.Points;
  private readonly pendulumPositions=new Float32Array(6);

  constructor(){
    const v0=7.6;
    const launch=THREE.MathUtils.degToRad(54);
    const g=9.81;
    const total=(2*v0*Math.sin(launch))/g;
    const trajectory:Array<THREE.Vector3>=[];

    for(let i=0;i<96;i++){
      const t=(i/95)*total;
      trajectory.push(
        new THREE.Vector3(
          -5+v0*Math.cos(launch)*t,
          -1.85+v0*Math.sin(launch)*t-0.5*g*t*t,
          0,
        ),
      );
    }

    this.trail=line(trajectory,"#79dcff",0.42);
    this.projectile=new THREE.Mesh(
      new THREE.SphereGeometry(0.115,12,12),
      basic("#effcff",0.95),
    );

    const pendulumGeometry=new THREE.BufferGeometry();
    pendulumGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.pendulumPositions,3),
    );
    this.pendulum=new THREE.Line(
      pendulumGeometry,
      new THREE.LineBasicMaterial({
        color:"#528fff",
        transparent:true,
        opacity:0,
        depthWrite:false,
      }),
    );
    this.bob=new THREE.Mesh(
      new THREE.SphereGeometry(0.23,12,12),
      basic("#a6eaff",0),
    );

    this.orbit=new THREE.Group();
    const sun=new THREE.Mesh(
      new THREE.SphereGeometry(0.42,14,14),
      basic("#fff1a8",0),
    );
    const earth=new THREE.Mesh(
      new THREE.SphereGeometry(0.19,12,12),
      basic("#66c4ff",0),
    );
    const moon=new THREE.Mesh(
      new THREE.SphereGeometry(0.065,8,8),
      basic("#def5ff",0),
    );
    earth.position.x=1.5;
    moon.position.x=1.93;
    const orbitLine=new THREE.Mesh(
      new THREE.TorusGeometry(1.5,0.011,6,96),
      basic("#67baff",0),
    );
    this.orbit.add(sun,earth,moon,orbitLine);
    this.orbit.position.set(-1.4,2.2,-1);

    const fieldCount=36;
    const fieldPositions=new Float32Array(fieldCount*3);
    for(let i=0;i<fieldCount;i++){
      const i3=i*3;
      fieldPositions[i3]=random.range(-7.5,7.5);
      fieldPositions[i3+1]=random.range(-3.5,3.5);
      fieldPositions[i3+2]=random.range(-2,2);
    }
    const fieldGeometry=new THREE.BufferGeometry();
    fieldGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(fieldPositions,3),
    );
    this.field=new THREE.Points(
      fieldGeometry,
      pointsMaterial("#5dafff",0.05,0),
    );

    this.group.add(
      this.trail,
      this.projectile,
      this.pendulum,
      this.bob,
      this.orbit,
      this.field,
    );
  }

  update(context:ScienceUpdateContext):void {
    const visible=
      context.scene==="physics"
        ? easeOut(context.phase*1.9)
        : context.scene==="chemistry"
          ? 1-smooth(context.phase*1.45)
          : context.scene==="synthesis"
            ? 0.05
            : 0;

    setOpacity(this.trail.material,visible*0.8);
    setOpacity(this.projectile.material,visible);

    const v0=7.6;
    const launch=THREE.MathUtils.degToRad(54);
    const g=9.81;
    const total=(2*v0*Math.sin(launch))/g;
    const t=(context.phase*total*0.96)%total;
    this.projectile.position.set(
      -5+v0*Math.cos(launch)*t,
      -1.85+v0*Math.sin(launch)*t-0.5*g*t*t,
      Math.sin(context.time*5)*0.07,
    );

    const pivotX=2.75;
    const pivotY=1.55;
    const length=2.7;
    const angularFrequency=Math.sqrt(g/length);
    const angle=
      THREE.MathUtils.degToRad(27)*
      Math.cos(angularFrequency*context.time*0.9);

    const bobX=pivotX+Math.sin(angle)*length;
    const bobY=pivotY-Math.cos(angle)*length;

    this.pendulumPositions.set([
      pivotX,pivotY,0.12,
      bobX,bobY,0.12,
    ]);
    (
      this.pendulum.geometry.getAttribute("position") as THREE.BufferAttribute
    ).needsUpdate=true;

    this.bob.position.set(bobX,bobY,0.12);
    setOpacity(this.pendulum.material,visible*0.72);
    setOpacity(this.bob.material,visible);

    for(let i=0;i<3;i++){
      const child=this.orbit.children[i];
      if(child instanceof THREE.Mesh){
        setOpacity(child.material,visible*(i===0?0.92:0.65));
      }
    }
    setOpacity(
      (this.orbit.children[3] as THREE.Mesh).material,
      visible*0.42,
    );

    this.orbit.rotation.y=context.time*0.5;
    this.orbit.rotation.x=Math.sin(context.time*0.2)*0.08;
    this.orbit.rotation.z=context.pointer.x*0.04;

    setOpacity(this.field.material,visible*0.44);
    this.field.rotation.z=context.time*0.12;
    this.field.rotation.x=Math.sin(context.time*0.37)*0.12;
  }

  dispose():void { disposeRoot(this.group); }
}

class ChemistrySystem {
  readonly group=new THREE.Group();

  private readonly atom=new THREE.Group();
  private readonly shells:THREE.Mesh[]=[];
  private readonly electronPositions=new Float32Array(10*3);
  private readonly electrons:THREE.Points;
  private readonly moleculePositions=new Float32Array(7*3);
  private readonly molecules:THREE.Points;
  private readonly bonds:THREE.LineSegments;
  private readonly lattice:THREE.Points;

  constructor(){
    const nucleus=new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.5,1),
      basic("#6baeff",0),
    );
    this.atom.add(nucleus);

    for(let shell=0;shell<3;shell++){
      const ring=new THREE.Mesh(
        new THREE.TorusGeometry(0.95+shell*0.62,0.013,8,100),
        basic(shell%2===0?"#73d1ff":"#4e81ff",0),
      );
      ring.rotation.x=Math.PI/2+shell*0.4;
      ring.rotation.z=shell*0.75;
      this.shells.push(ring);
      this.atom.add(ring);
    }

    const electronGeometry=new THREE.BufferGeometry();
    electronGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.electronPositions,3),
    );
    this.electrons=new THREE.Points(
      electronGeometry,
      pointsMaterial("#ecfdff",0.1,0),
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
      pointsMaterial("#effcff",0.13,0),
    );

    const bondPositions=new Float32Array(8*3);
    const bondGeometry=new THREE.BufferGeometry();
    bondGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(bondPositions,3),
    );
    this.bonds=new THREE.LineSegments(
      bondGeometry,
      new THREE.LineBasicMaterial({
        color:"#83d8ff",
        transparent:true,
        opacity:0,
        depthWrite:false,
        blending:THREE.AdditiveBlending,
      }),
    );

    const latticePositions=new Float32Array(42*3);
    for(let i=0;i<42;i++){
      const x=(i%7)-3;
      const y=Math.floor(i/7)-2;
      const i3=i*3;
      latticePositions[i3]=x*0.75;
      latticePositions[i3+1]=y*0.62;
      latticePositions[i3+2]=Math.sin(x*0.9+y*0.65)*0.18;
    }
    const latticeGeometry=new THREE.BufferGeometry();
    latticeGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(latticePositions,3),
    );
    this.lattice=new THREE.Points(
      latticeGeometry,
      pointsMaterial("#5aaaff",0.055,0),
    );

    this.group.add(this.molecules,this.bonds,this.lattice);
  }

  update(context:ScienceUpdateContext):void {
    const visible=
      context.scene==="chemistry"
        ? easeOut(context.phase*1.7)
        : context.scene==="mathematics"
          ? 1-smooth(context.phase*1.55)
          : context.scene==="synthesis"
            ? 0.08
            : 0;

    for(let shell=0;shell<3;shell++){
      const ring=this.shells[shell];
      ring.rotation.y+=context.delta*(0.17+shell*0.08);
      setOpacity(ring.material,visible*(0.26+context.energy*0.1));
    }

    setOpacity(
      this.atom.children[0] as THREE.Mesh
        .material as THREE.Material,
      visible,
    );

    for(let i=0;i<10;i++){
      const shell=i<2?0:i<6?1:2;
      const count=shell===0?2:shell===1?4:4;
      const radius=0.95+shell*0.62;
      const angle=
        context.time*(0.85+shell*0.2)+
        (i%count)*(PI2/count)+
        shell;
      const i3=i*3;
      this.electronPositions[i3]=Math.cos(angle)*radius;
      this.electronPositions[i3+1]=
        Math.sin(angle*1.45)*
        (0.38+radius*0.08);
      this.electronPositions[i3+2]=Math.sin(angle)*radius;
    }
    (
      this.electrons.geometry.getAttribute("position") as THREE.BufferAttribute
    ).needsUpdate=true;
    setOpacity(this.electrons.material,visible*0.94);

    const nodes=[
      [-3.35,-1.25,0],
      [-3.95,-1.38,0],
      [-2.75,-1.38,0],
      [3.2,-1.25,-0.25],
      [2.4,-1.25,-0.25],
      [4.0,-1.25,-0.25],
      [0,1.0,0],
    ] as const;

    const atomWave=Math.sin(context.time*0.9)*0.045;
    for(let i=0;i<nodes.length;i++){
      const i3=i*3;
      this.moleculePositions[i3]=nodes[i][0];
      this.moleculePositions[i3+1]=nodes[i][1]+atomWave*(1+i*0.03);
      this.moleculePositions[i3+2]=nodes[i][2];
    }
    (
      this.molecules.geometry.getAttribute("position") as THREE.BufferAttribute
    ).needsUpdate=true;

    const bonds=[
      [0,1],[0,2],[3,4],[3,5],
    ] as const;
    const bondAttribute=this.bonds.geometry.getAttribute("position") as THREE.BufferAttribute;
    for(let i=0;i<bonds.length;i++){
      const [a,b]=bonds[i];
      bondAttribute.setXYZ(i*2,nodes[a][0],nodes[a][1],nodes[a][2]);
      bondAttribute.setXYZ(i*2+1,nodes[b][0],nodes[b][1],nodes[b][2]);
    }
    bondAttribute.needsUpdate=true;
    setOpacity(this.molecules.material,visible*0.9);
    setOpacity(this.bonds.material,visible*0.72);

    this.atom.rotation.y=Math.sin(context.time*0.32)*0.08+context.pointer.x*0.08;
    this.atom.rotation.x=context.pointer.y*0.06;

    this.lattice.rotation.y=context.time*0.15;
    this.lattice.rotation.x=Math.sin(context.time*0.25)*0.09;
    setOpacity(this.lattice.material,visible*0.46);
  }

  dispose():void { disposeRoot(this.group); }
}

class MathematicsSystem {
  readonly group=new THREE.Group();

  private readonly spiral:THREE.Line;
  private readonly sine:THREE.Line;
  private readonly parabola:THREE.Line;
  private readonly helix:THREE.Line;
  private readonly movingPoint:THREE.Mesh;
  private readonly torus:THREE.Mesh;

  constructor(){
    const spiralPoints:THREE.Vector3[]=[];
    for(let i=0;i<180;i++){
      const theta=i*0.22;
      const radius=0.028*Math.pow(1.058,i*0.62);
      spiralPoints.push(
        new THREE.Vector3(
          Math.cos(theta)*radius-4.0,
          Math.sin(theta)*radius-0.35,
          Math.sin(theta*1.5)*0.12,
        ),
      );
    }
    this.spiral=line(spiralPoints,"#7edcff",0);

    const sinePoints:THREE.Vector3[]=[];
    const parabolaPoints:THREE.Vector3[]=[];
    const helixPoints:THREE.Vector3[]=[];
    for(let i=0;i<144;i++){
      const x=-3.2+(i/143)*6.4;
      sinePoints.push(new THREE.Vector3(x,Math.sin(x*1.7)*1.0,0.15));
      parabolaPoints.push(new THREE.Vector3(x,0.17*x*x-2.25,-0.82));
      const a=(i/143)*PI2*2.4;
      helixPoints.push(
        new THREE.Vector3(
          Math.cos(a)*1.15+3.7,
          (i/143-0.5)*4.2,
          Math.sin(a)*1.15-0.6,
        ),
      );
    }

    this.sine=line(sinePoints,"#87ddff",0);
    this.parabola=line(parabolaPoints,"#5b91ff",0);
    this.helix=line(helixPoints,"#75b6ff",0);

    this.movingPoint=new THREE.Mesh(
      new THREE.SphereGeometry(0.11,12,12),
      basic("#f0fdff",0),
    );
    this.torus=new THREE.Mesh(
      new THREE.TorusKnotGeometry(1.0,0.17,96,12),
      new THREE.MeshBasicMaterial({
        color:"#5aa8ff",
        transparent:true,
        opacity:0,
        wireframe:true,
        depthWrite:false,
        blending:THREE.AdditiveBlending,
      }),
    );
    this.torus.position.set(3.6,1.05,-0.6);

    this.group.add(
      this.spiral,
      this.sine,
      this.parabola,
      this.helix,
      this.movingPoint,
      this.torus,
    );
  }

  update(context:ScienceUpdateContext):void {
    const visible=
      context.scene==="mathematics"
        ? easeOut(context.phase*1.8)
        : context.scene==="synthesis"
          ? 1-smooth(context.phase*1.35)
          : context.scene==="prism"
            ? 0.035
            : 0;

    setOpacity(this.spiral.material,visible*0.76);
    setOpacity(this.sine.material,visible*0.7);
    setOpacity(this.parabola.material,visible*0.56);
    setOpacity(this.helix.material,visible*0.56);
    setOpacity(this.movingPoint.material,visible);
    setOpacity(this.torus.material,visible*0.68);

    const x=-3.2+((context.time*0.85)%6.4);
    this.movingPoint.position.set(
      x,
      Math.sin(x*1.7)*1.0,
      0.22,
    );

    this.spiral.rotation.z=-context.time*0.07;
    this.helix.rotation.y=context.time*0.33;
    this.torus.rotation.x=context.time*0.24;
    this.torus.rotation.y=context.time*0.42;
    this.group.rotation.y=context.pointer.x*0.045;
  }

  dispose():void { disposeRoot(this.group); }
}

class PrismCoreSystem {
  readonly group=new THREE.Group();

  private readonly shell:THREE.Mesh;
  private readonly inner:THREE.Mesh;
  private readonly rings:THREE.Mesh[]=[];
  private readonly nodes:THREE.Points;
  private readonly nodePositions:Float32Array;
  private readonly shockwaves:THREE.Mesh[]=[];
  private flash=0;

  constructor(random:SeededRandom){
    this.shell=new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.15,2),
      new THREE.MeshBasicMaterial({
        color:"#62beff",
        transparent:true,
        opacity:0,
        wireframe:true,
        depthWrite:false,
        blending:THREE.AdditiveBlending,
      }),
    );
    this.inner=new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.56,1),
      new THREE.MeshBasicMaterial({
        color:"#d9f8ff",
        transparent:true,
        opacity:0,
        wireframe:true,
        depthWrite:false,
        blending:THREE.AdditiveBlending,
      }),
    );
    this.group.add(this.shell,this.inner);

    for(let i=0;i<7;i++){
      const ring=new THREE.Mesh(
        new THREE.TorusGeometry(2.7+i*0.38,0.011+i*0.002,7,80),
        basic(i%2===0?"#8be7ff":"#558eff",0),
      );
      ring.rotation.x=Math.PI/2+i*0.22;
      ring.rotation.z=i*0.74;
      this.rings.push(ring);
      this.group.add(ring);
    }

    this.nodePositions=new Float32Array(36*3);
    for(let i=0;i<36;i++){
      const dir=randomSphere(random);
      const radius=random.range(3.0,6.7);
      const i3=i*3;
      this.nodePositions[i3]=dir.x*radius;
      this.nodePositions[i3+1]=dir.y*radius;
      this.nodePositions[i3+2]=dir.z*radius;
    }
    const nodeGeometry=new THREE.BufferGeometry();
    nodeGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.nodePositions,3),
    );
    this.nodes=new THREE.Points(
      nodeGeometry,
      pointsMaterial("#9aeaff",0.065,0),
    );
    this.group.add(this.nodes);

    for(let i=0;i<3;i++){
      const shock=new THREE.Mesh(
        new THREE.TorusGeometry(1.0,0.009,6,96),
        basic("#a9efff",0),
      );
      shock.rotation.x=Math.PI/2;
      this.shockwaves.push(shock);
      this.group.add(shock);
    }
  }

  triggerFlash():void {
    this.flash=1;
  }

  update(context:ScienceUpdateContext):void {
    const visible=
      context.scene==="synthesis"
        ? easeOut(context.phase*2)
        : context.scene==="labs"
          ? 1-smooth(context.phase*1.6)
          : context.scene==="prism"
            ? 0.88
            : context.scene==="definition"
              ? 0.52
              : context.scene==="team"
                ? 0.1
                : context.scene==="launch"
                  ? 1
                  : 0;

    const breath=0.95+0.08*Math.sin(context.time*1.8);
    const heroScale=0.55+visible*0.68+context.energy*0.08;

    this.group.scale.setScalar(heroScale*breath);
    this.group.rotation.x=-0.18+Math.sin(context.time*0.19)*0.08;
    this.group.rotation.y=context.time*0.34;
    this.group.rotation.z=context.pointer.x*0.05;

    setOpacity(this.shell.material,visible*0.48);
    setOpacity(this.inner.material,visible*0.24);

    for(let i=0;i<this.rings.length;i++){
      const ring=this.rings[i];
      ring.rotation.y+=context.delta*(0.12+i*0.028);
      ring.rotation.x+=context.delta*0.005*(i+1);
      const shimmer=0.5+0.5*Math.sin(context.time*(0.7+i*0.09)+i);
      setOpacity(ring.material,visible*(0.035+shimmer*0.12));
    }

    for(let i=0;i<36;i++){
      const i3=i*3;
      const baseRadius=3.0+(i%9)*0.44;
      const angle=context.time*(0.12+i*0.001)+i*0.67;
      this.nodePositions[i3]=Math.cos(angle)*baseRadius;
      this.nodePositions[i3+1]=
        Math.sin(context.time*(0.32+i*0.002)+i*0.55)*
        (1.7+context.energy*1.6);
      this.nodePositions[i3+2]=Math.sin(angle)*baseRadius;
    }
    (
      this.nodes.geometry.getAttribute("position") as THREE.BufferAttribute
    ).needsUpdate=true;
    setOpacity(this.nodes.material,visible*(0.08+context.energy*0.18));

    this.flash=Math.max(0,this.flash-context.delta*2.6);
    for(let i=0;i<this.shockwaves.length;i++){
      const wave=this.shockwaves[i];
      const local=clamp01((1-this.flash)+i*0.08);
      wave.scale.setScalar(1+local*5.6);
      setOpacity(
        wave.material,
        visible*this.flash*(1-i*0.23),
      );
      wave.rotation.z+=context.delta*(0.18+i*0.07);
    }

    this.corePulse(context);
  }

  private corePulse(context:ScienceUpdateContext):void {
    const core=this.inner;
    const p=1.0+pulse(context.time,2.4)*0.18+context.energy*0.16;
    core.scale.setScalar(p);
  }

  dispose():void { disposeRoot(this.group); }
}

export class ScienceShowcase {
  readonly group=new THREE.Group();

  private readonly cosmos:CosmicFieldSystem;
  private readonly waves:WaveRibbonSystem;
  private readonly physics:PhysicsSystem;
  private readonly chemistry:ChemistrySystem;
  private readonly mathematics:MathematicsSystem;
  private readonly core:PrismCoreSystem;

  constructor(
    profile:IntroQualityProfile,
    random:SeededRandom,
  ){
    this.cosmos=new CosmicFieldSystem(profile,random);
    this.waves=new WaveRibbonSystem(random,5);
    this.physics=new PhysicsSystem();
    this.chemistry=new ChemistrySystem();
    this.mathematics=new MathematicsSystem();
    this.core=new PrismCoreSystem(random);

    this.group.add(
      this.cosmos.group,
      this.waves.group,
      this.physics.group,
      this.chemistry.group,
      this.mathematics.group,
      this.core.group,
    );
  }

  triggerCoreFlash():void {
    this.core.triggerFlash();
  }

  update(context:ScienceUpdateContext):void {
    this.cosmos.update(context);
    this.waves.update(context);
    this.physics.update(context);
    this.chemistry.update(context);
    this.mathematics.update(context);
    this.core.update(context);

    this.group.rotation.y=context.pointer.x*0.022;
    this.group.rotation.x=context.pointer.y*0.015;
  }

  dispose():void {
    disposeRoot(this.group);
  }
}
