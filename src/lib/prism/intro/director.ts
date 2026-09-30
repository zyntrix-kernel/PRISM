import * as THREE from "three";
import { damp, smoothstep } from "./easing";
import { stagedTravel } from "./motion";
import type { IntroPointerState, IntroScene } from "./types";

type CameraPose = {
  x:number;
  y:number;
  z:number;
  lookX:number;
  lookY:number;
  lookZ:number;
  fov:number;
  roll:number;
};

const POSES:Record<IntroScene,CameraPose>={
  boot:{x:0,y:0.35,z:15.5,lookX:0,lookY:0,lookZ:0,fov:48,roll:0},
  physics:{x:-1.2,y:0.65,z:11.8,lookX:-0.15,lookY:0.1,lookZ:0,fov:52,roll:-0.01},
  chemistry:{x:0.35,y:0.05,z:10.4,lookX:0.1,lookY:0.1,lookZ:0,fov:51,roll:0.008},
  mathematics:{x:0.75,y:0.55,z:10.9,lookX:0.15,lookY:0.12,lookZ:0,fov:52,roll:-0.008},
  information:{x:0,y:0.3,z:9.7,lookX:0,lookY:0.1,lookZ:0,fov:50,roll:0},
  synthesis:{x:0,y:0.05,z:8.5,lookX:0,lookY:0,lookZ:0,fov:46,roll:0},
  labs:{x:0,y:0.1,z:10.5,lookX:0,lookY:0.08,lookZ:0,fov:49,roll:0},
  prism:{x:0,y:0.05,z:7.9,lookX:0,lookY:0,lookZ:0,fov:46,roll:0},
  team:{x:0.18,y:0.3,z:10.4,lookX:0,lookY:0.05,lookZ:0,fov:53,roll:0.006},
  launch:{x:0,y:0.2,z:13.8,lookX:0,lookY:0,lookZ:0,fov:48,roll:0},
  complete:{x:0,y:0,z:3.1,lookX:0,lookY:0,lookZ:0,fov:70,roll:0},
};

export class CinematicCameraDirector {
  private readonly target=new THREE.Vector3();
  private readonly look=new THREE.Vector3();
  private localTime=0;

  update(
    camera:THREE.PerspectiveCamera,
    scene:IntroScene,
    timelineTime:number,
    delta:number,
    pointer:IntroPointerState,
    reducedMotion:boolean,
  ):void {
    const pose=POSES[scene];
    const launchT=stagedTravel(Math.min(1,Math.max(0,(timelineTime-18100)/900)));
    const finalApproach=smoothstep(Math.min(1,Math.max(0,(timelineTime-18800)/400)));

    let targetX=pose.x;
    let targetY=pose.y;
    let targetZ=pose.z;
    let targetFov=pose.fov;

    if(scene==="launch"||scene==="complete"){
      targetZ=THREE.MathUtils.lerp(13.8,3.15,scene==="complete"?1:launchT);
      targetY=THREE.MathUtils.lerp(0.8,-0.05,scene==="complete"?1:launchT);
      targetFov=THREE.MathUtils.lerp(48,70,scene==="complete"?1:launchT);
    }

    const pointerX=pointer.x*1.05;
    const pointerY=pointer.y*-0.72;

    camera.position.x=damp(
      camera.position.x,
      targetX+pointerX,
      reducedMotion?18:4.8,
      delta,
    );
    camera.position.y=damp(
      camera.position.y,
      targetY+pointerY,
      reducedMotion?18:4.8,
      delta,
    );
    camera.position.z=damp(
      camera.position.z,
      targetZ,
      reducedMotion?18:4.1,
      delta,
    );

    this.target.set(
      pose.lookX+pointerX*0.25,
      pose.lookY+pointerY*0.2,
      pose.lookZ,
    );
    camera.lookAt(this.target);

    camera.fov=damp(
      camera.fov,
      targetFov,
      reducedMotion?18:4.2,
      delta,
    );
    camera.updateProjectionMatrix();

    const baseRoll=pose.roll;
    const impactRoll=
      scene==="physics"
        ? Math.sin(this.localTime*1.5)*0.006
        : scene==="synthesis"
          ? Math.sin(this.localTime*1.1)*0.009
          : scene==="launch"
            ? launchT*0.16
            : 0;

    camera.rotation.z=damp(
      camera.rotation.z,
      baseRoll+pointer.x*0.015+impactRoll,
      reducedMotion?18:4.3,
      delta,
    );

    this.localTime+=delta;
    void finalApproach;
  }
}
