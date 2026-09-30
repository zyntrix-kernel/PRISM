// PrismScene shell: renderer, camera rig, bloom composer, hand cursor,
// preset loading. World content lives in src/presets/* behind WorldAPI.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { PrismConfig, type QualityTier } from './config';
import { pinchRingScale, setEmissiveBoost } from './highlight';
import { buildAtom } from './presets/atom';
import { buildBlocks } from './presets/blocks';
import { buildDrive } from './presets/drive';
import { buildSingularity } from './presets/singularity';
import { buildVoxel } from './presets/voxel';
import { buildSolar } from './presets/solar';
import { buildTest } from './presets/test';
import { buildGunGame } from './presets/gun';
import { buildSupernova } from './presets/supernova';
import { buildNebula } from './presets/nebula';
import { disposeGroup, type PresetId, type WorldAPI, type WorldBuilder, type WorldView } from './presets/types';
import { buildGlowTexture, buildNebulaTexture, buildPlanetTextures, type PlanetTextureSet } from './textures';

export type CursorMode = 'hidden' | 'point' | 'hover' | 'pinch' | 'grab';

const STAR_VERTEX = /* glsl */ `
  attribute float aBrightness;
  attribute float aPhase;
  attribute float aFreq;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vBrightness;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    float twinkle = 0.7 + 0.3 * sin(uTime * aFreq + aPhase);
    vBrightness = aBrightness * twinkle;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float baseSize = 1.6 + aBrightness * 4.2;
    float dist = max(1.0, -mvPosition.z);
    gl_PointSize = baseSize * uPixelRatio * (240.0 / dist);
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  varying float vBrightness;
  varying vec3 vColor;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float dist = length(uv);
    if (dist > 0.5) discard;
    float falloff = smoothstep(0.5, 0.0, dist);
    float core = smoothstep(0.28, 0.0, dist);
    vec3 col = vColor * vBrightness * (0.55 + 0.6 * core);
    float alpha = falloff * clamp(vBrightness, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
  }
`;

const CA_VIGNETTE_SHADER = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uIntensity: { value: 0.4 }, uVignette: { value: 0.25 } },
  vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uIntensity; uniform float uVignette; varying vec2 vUv; void main(){vec2 uv=vUv;vec2 o=uv-vec2(.5);float d=length(o);float a=uIntensity*.012*d*d;vec3 c;if(a>1e-6){vec2 dir=o/max(d,1e-5);c.r=texture2D(tDiffuse,uv-dir*a).r;c.g=texture2D(tDiffuse,uv).g;c.b=texture2D(tDiffuse,uv+dir*a).b;}else c=texture2D(tDiffuse,uv).rgb;c*=1.0-uVignette*d*d;gl_FragColor=vec4(c,1.0);}`,
};

const BUILDERS: Record<PresetId, WorldBuilder> = {
  space: buildSolar,
  blocks: buildBlocks,
  test: buildTest,
  singularity: buildSingularity,
  drive: buildDrive,
  atom: buildAtom,
  voxel: buildVoxel,
  gun: buildGunGame,
  supernova: buildSupernova,
  nebula: buildNebula,
};

export class CameraRig {
  readonly target = new THREE.Vector3();
  yaw = 0;
  pitch = 0.4;
  distance = 13;
  autoRotate = false;
  private readonly home = { yaw: 0, pitch: 0.4, distance: 13, target: new THREE.Vector3() };
  private readonly tmpOffset = new THREE.Vector3();
  private trauma = 0;
  shakeScale = 1;

  setHome(view: WorldView): void { this.home.yaw=view.yaw; this.home.pitch=view.pitch; this.home.distance=view.distance; this.home.target.set(0,0,0); this.resetToHome(); }
  resetToHome(): void { this.yaw=this.home.yaw; this.pitch=this.home.pitch; this.distance=this.home.distance; this.target.copy(this.home.target); }
  orbitBy(dxPixels:number,dyPixels:number):void{const s=PrismConfig.cameraRig.orbitSpeed;this.yaw-=dxPixels*s;this.pitch=THREE.MathUtils.clamp(this.pitch+dyPixels*s,.03,1.52);}
  dolly(factor:number):void{const c=PrismConfig.cameraRig;this.distance=THREE.MathUtils.clamp(this.distance*factor,c.minDistance,c.maxDistance);}
  panBy(dxPixels:number,dyPixels:number,camera:THREE.Camera):void{const scale=this.distance*PrismConfig.cameraRig.panSpeed/10;const right=this.tmpOffset.setFromMatrixColumn(camera.matrix,0);const up=new THREE.Vector3().setFromMatrixColumn(camera.matrix,1);this.target.addScaledVector(right,-dxPixels*scale).addScaledVector(up,dyPixels*scale);this.target.y=THREE.MathUtils.clamp(this.target.y,-6,6);}
  setView(name:'overview'|'top'|'edge'):void{if(name==='top'){this.pitch=1.5;this.yaw=0;}else if(name==='edge')this.pitch=.06;else this.resetToHome();}
  addShake(amount:number):void{this.trauma=Math.min(1,this.trauma+Math.max(0,amount));}
  get traumaLevel():number{return this.trauma;}
  update(dt:number,camera:THREE.PerspectiveCamera):void{if(this.autoRotate)this.yaw+=dt*PrismConfig.cameraRig.autoRotateSpeed;const cp=Math.cos(this.pitch);const x=this.target.x+this.distance*cp*Math.sin(this.yaw);const y=this.target.y+this.distance*Math.sin(this.pitch);const z=this.target.z+this.distance*cp*Math.cos(this.yaw);const damp=1-Math.exp(-dt*10);camera.position.x+=(x-camera.position.x)*damp;camera.position.y+=(y-camera.position.y)*damp;camera.position.z+=(z-camera.position.z)*damp;if(this.trauma>0){const s=this.trauma*this.trauma*.4*this.shakeScale;camera.position.x+=(Math.random()-.5)*2*s;camera.position.y+=(Math.random()-.5)*2*s;camera.position.z+=(Math.random()-.5)*2*s;this.trauma*=Math.exp(-dt*2.2);if(this.trauma<=.003)this.trauma=0;}camera.lookAt(this.target);}
}

export class PrismScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly rig = new CameraRig();
  readonly world = new THREE.Group();
  readonly labelLayer = new THREE.Group();
  readonly cursor: THREE.Mesh;
  private api: WorldAPI | null = null;
  private presetId: PresetId = 'space';
  private quality: QualityTier = 'medium';
  private readonly cursorMat: THREE.MeshBasicMaterial;
  private readonly cursorRing: THREE.Mesh;
  private readonly cursorRingMat: THREE.MeshBasicMaterial;
  private readonly ringCyan = new THREE.Color(0x9adcff);
  private readonly ringMagenta = new THREE.Color(0xffa8d8);
  private readonly rayLine: THREE.Line;
  private readonly rayPositions: Float32Array;
  private readonly nebula: THREE.Mesh;
  private stars!: THREE.Points;
  private starMat!: THREE.ShaderMaterial;
  private readonly composer: EffectComposer;
  private readonly caPass: ShaderPass;
  private readonly glowTex: THREE.Texture;
  private readonly nebulaTex: THREE.Texture;
  private readonly planetTex: PlanetTextureSet;
  private readonly tmpVec = new THREE.Vector3();
  private hovered: THREE.Object3D | null = null;
  private worldAccumulator = 0;

  constructor(container: HTMLElement, quality: QualityTier, preset: PresetId) {
    this.quality=quality;
    const useAA=quality==='high'||quality==='ultra';
    this.renderer=new THREE.WebGLRenderer({antialias:useAA,powerPreference:'high-performance',stencil:false,failIfMajorPerformanceCaveat:false});
    this.renderer.setSize(container.clientWidth,container.clientHeight);
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.15;
    this.renderer.shadowMap.enabled=false;
    this.applyPixelRatio();
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('role','img');
    this.renderer.domElement.setAttribute('aria-label','Interactive 3D scene. Move the mouse to point, hold to grab, or enable the camera for hand control. Press H for all controls.');
    this.scene.background=new THREE.Color(0x04060d);
    this.scene.fog=new THREE.Fog(0x04060d,20,70);
    this.camera=new THREE.PerspectiveCamera(55,container.clientWidth/Math.max(1,container.clientHeight),.1,300);
    this.camera.position.set(0,4.6,12);
    this.scene.add(new THREE.AmbientLight(0xbfd4ff,.5));
    const key=new THREE.DirectionalLight(0xffffff,.8);key.position.set(3,5,4);this.scene.add(key);
    const fill=new THREE.DirectionalLight(0x8899bb,.3);fill.position.set(-3,2,-4);this.scene.add(fill);
    this.glowTex=buildGlowTexture();this.nebulaTex=buildNebulaTexture();this.planetTex=buildPlanetTextures();this.buildStarfield();
    this.nebula=new THREE.Mesh(new THREE.SphereGeometry(120,24,16),new THREE.MeshBasicMaterial({map:this.nebulaTex,side:THREE.BackSide,depthWrite:false,fog:false}));
    this.nebula.visible=false;this.scene.add(this.nebula);
    this.cursorMat=new THREE.MeshBasicMaterial({color:0x9adcff,transparent:true,opacity:.95});this.cursor=new THREE.Mesh(new THREE.OctahedronGeometry(.09),this.cursorMat);this.cursor.visible=false;this.scene.add(this.cursor);
    this.cursorRingMat=new THREE.MeshBasicMaterial({color:0x9adcff,transparent:true,opacity:.25,side:THREE.DoubleSide,depthTest:false});this.cursorRing=new THREE.Mesh(new THREE.RingGeometry(.13,.16,24),this.cursorRingMat);this.cursorRing.visible=false;this.cursorRing.renderOrder=5;this.scene.add(this.cursorRing);
    this.rayPositions=new Float32Array(6);const rayGeo=new THREE.BufferGeometry();rayGeo.setAttribute('position',new THREE.BufferAttribute(this.rayPositions,3));this.rayLine=new THREE.Line(rayGeo,new THREE.LineBasicMaterial({color:0x9adcff,transparent:true,opacity:.35}));this.rayLine.visible=false;this.rayLine.frustumCulled=false;this.scene.add(this.rayLine);
    this.scene.add(this.world);this.scene.add(this.labelLayer);
    this.composer=new EffectComposer(this.renderer);this.composer.addPass(new RenderPass(this.scene,this.camera));const bloom=new UnrealBloomPass(new THREE.Vector2(container.clientWidth,container.clientHeight),PrismConfig.bloom.strength,PrismConfig.bloom.radius,PrismConfig.bloom.threshold);this.composer.addPass(bloom);this.caPass=new ShaderPass(CA_VIGNETTE_SHADER);this.composer.addPass(this.caPass);this.composer.addPass(new OutputPass());
    this.loadPreset(preset);
  }

  get currentPreset():PresetId{return this.presetId;}
  get currentWorld():WorldAPI|null{return this.api;}
  trackPointer(ndcX:number,ndcY:number):void{this.api?.updatePointer?.(ndcX,ndcY,this.camera);}
  capturesPointer():boolean{return this.api?.capturesPointer?.()??false;}
  pointerFocus(out:THREE.Vector3):boolean{return this.api?.pointerFocus?.(out)??false;}
  get grabbables():THREE.Object3D[]{return this.api?.grabbables??[];}

  loadPreset(id:PresetId):void{
    if(this.api){this.api.dispose();this.world.clear();this.labelLayer.clear();}
    this.presetId=id;this.world.scale.setScalar(1);this.world.rotation.set(0,0,0);this.world.position.set(0,0,0);
    const builder=BUILDERS[id];this.api=builder({world:this.world,labelLayer:this.labelLayer,glowTex:this.glowTex,nebulaTex:this.nebulaTex,planetTex:this.planetTex,shakeCamera:(amount:number)=>this.shakeCamera(amount),quality:this.quality});
    const bg=this.api.background;if(bg==='nebula'){this.scene.background=null;this.nebula.visible=true;}else{this.nebula.visible=false;this.scene.background=new THREE.Color(bg);}this.stars.visible=this.api.stars??true;this.rig.setHome(this.api.view);this.setHover(null);this.applyTextureMaps();
  }
  setOrbitFromPoint(mesh:THREE.Mesh,localPoint:THREE.Vector3):void{this.api?.setOrbitFromPoint?.(mesh,localPoint);}
  bodyInfo(name:string|null):string|null{return this.api?.bodyInfo?.(name)??null;}
  shakeCamera(amount:number):void{this.rig.addShake(amount);}

  private applyPixelRatio():void{const ratio=PrismConfig.quality[this.quality]?.pixelRatio??1.5;const pr=Math.min(window.devicePixelRatio||1,ratio);this.renderer.setPixelRatio(pr);this.composer?.setPixelRatio(pr);if(this.starMat)this.starMat.uniforms.uPixelRatio.value=pr;}
  private applyTextureMaps():void{const on=this.quality==='high'||this.quality==='ultra';this.world.traverse((obj)=>{const mesh=obj as THREE.Mesh;const mat=mesh.material as (THREE.MeshStandardMaterial|THREE.MeshBasicMaterial)|undefined;const texMap=mat?.userData.texMap as THREE.Texture|undefined;if(mat&&texMap){mat.map=on?texMap:null;mat.needsUpdate=true;}});}
  applyQuality(tier:QualityTier):void{this.quality=tier;this.applyPixelRatio();this.applyTextureMaps();}
  resize(width:number,height:number):void{this.camera.aspect=width/Math.max(1,height);this.camera.updateProjectionMatrix();this.renderer.setSize(width,height);this.composer.setSize(width,height);}

  private buildStarfield():void{
    const tier=this.quality;const count=tier==='ultra'?1500:tier==='high'?1000:tier==='medium'?400:300;const positions=new Float32Array(count*3);const brightness=new Float32Array(count);const phase=new Float32Array(count);const freq=new Float32Array(count);const color=new Float32Array(count*3);
    const classes:Array<{weight:number;rgb:[number,number,number]}>=[{weight:.15,rgb:[.62,.72,1]},{weight:.2,rgb:[1,1,1]},{weight:.3,rgb:[1,.97,.85]},{weight:.25,rgb:[1,.78,.55]},{weight:.1,rgb:[1,.55,.42]}];
    for(let i=0;i<count;i++){const r=60+Math.random()*60,theta=Math.random()*Math.PI*2,phi=Math.acos(2*Math.random()-1);positions[i*3]=r*Math.sin(phi)*Math.cos(theta);positions[i*3+1]=r*Math.cos(phi);positions[i*3+2]=r*Math.sin(phi)*Math.sin(theta);brightness[i]=.3+Math.random()*.7;phase[i]=Math.random()*Math.PI*2;freq[i]=.5+Math.random()*2.5;const roll=Math.random();let acc=0,chosen=classes[2];for(const c of classes){acc+=c.weight;if(roll<=acc){chosen=c;break;}}color[i*3]=chosen.rgb[0];color[i*3+1]=chosen.rgb[1];color[i*3+2]=chosen.rgb[2];}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('aBrightness',new THREE.BufferAttribute(brightness,1));geo.setAttribute('aPhase',new THREE.BufferAttribute(phase,1));geo.setAttribute('aFreq',new THREE.BufferAttribute(freq,1));geo.setAttribute('aColor',new THREE.BufferAttribute(color,3));
    this.starMat=new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uPixelRatio:{value:this.renderer.getPixelRatio()}},vertexShader:STAR_VERTEX,fragmentShader:STAR_FRAGMENT,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});this.stars=new THREE.Points(geo,this.starMat);this.scene.add(this.stars);
  }

  setHover(mesh:THREE.Object3D|null):void{if(this.hovered===mesh)return;if(this.hovered)setEmissiveBoost(this.hovered,this.hovered.userData.grabbed?.9:null);this.hovered=mesh;if(this.hovered)setEmissiveBoost(this.hovered,.85);}
  markGrabbed(mesh:THREE.Object3D|null):void{for(const obj of this.grabbables){obj.userData.grabbed=obj===mesh;if(obj!==this.hovered)setEmissiveBoost(obj,obj===mesh?.9:null);}}
  setCursor(worldPos:THREE.Vector3|null,mode:CursorMode,sizeScale=1,closeness=0):void{if(!worldPos){this.cursor.visible=false;this.cursorRing.visible=false;this.rayLine.visible=false;return;}this.cursor.visible=true;this.cursor.position.copy(worldPos);this.cursor.scale.setScalar(sizeScale);const c=Math.min(1,Math.max(0,closeness));this.cursorRing.visible=true;this.cursorRing.position.copy(worldPos);this.cursorRing.lookAt(this.camera.position);this.cursorRing.scale.setScalar(pinchRingScale(c));this.cursorRingMat.opacity=.22+.68*c;this.cursorRingMat.color.copy(this.ringCyan).lerp(this.ringMagenta,c);const colors:Record<CursorMode,number>={hidden:0x9adcff,point:0x9adcff,hover:0xa8ffc9,pinch:0xffa8d8,grab:0xffd2a8};this.cursorMat.color.setHex(colors[mode]);(this.rayLine.material as THREE.LineBasicMaterial).color.setHex(colors[mode]);this.tmpVec.copy(worldPos).sub(this.camera.position).normalize();this.rayPositions[0]=this.camera.position.x;this.rayPositions[1]=this.camera.position.y;this.rayPositions[2]=this.camera.position.z;this.rayPositions[3]=worldPos.x+this.tmpVec.x*10;this.rayPositions[4]=worldPos.y+this.tmpVec.y*10;this.rayPositions[5]=worldPos.z+this.tmpVec.z*10;(this.rayLine.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate=true;this.rayLine.visible=true;}

  update(dt:number,elapsed:number):void{
    const cam=this.api?.cinematicCamera;if(cam){this.rig.yaw=cam.yaw;this.rig.pitch=cam.pitch;this.rig.distance=cam.distance;}
    this.rig.update(dt,this.camera);
    // Mobile/low tier keeps the display loop at full cadence while simulation
    // and particle/physics updates run at a capped 30Hz. This cuts CPU work
    // without making camera/hand cursor motion feel 30fps.
    this.worldAccumulator+=dt;
    if(this.quality==='low'){
      if(this.worldAccumulator<1/30)return;
      const worldDt=this.worldAccumulator;this.worldAccumulator=0;this.api?.update(worldDt,elapsed);
    }else{
      this.worldAccumulator=0;this.api?.update(dt,elapsed);
    }
    this.cursor.rotation.y+=dt*2.2;
    this.starMat.uniforms.uTime.value=elapsed;
  }

  render():void{if(this.quality==='high'||this.quality==='ultra')this.composer.render();else this.renderer.render(this.scene,this.camera);}
  get drawCalls():number{return this.renderer.info.render.calls;}
  get triangles():number{return this.renderer.info.render.triangles;}
  dispose():void{disposeGroup(this.world);disposeGroup(this.labelLayer);this.stars?.geometry.dispose();this.starMat?.dispose();(this.caPass?.material as THREE.ShaderMaterial|undefined)?.dispose();this.composer?.dispose();this.renderer.dispose();}
}
