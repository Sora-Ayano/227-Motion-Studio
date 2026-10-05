import {Vector3,Quaternion} from 'three';
import {autoMap} from './rig.mjs';
import {setWorldQuaternion} from './retarget.mjs';
import {projectOutCapsule,clothCapsules} from './cloth.mjs';

// Optional contact correction for foreign VMD / captured motion. Native game
// poses retain their authored transforms. CCD rotates joints, never bind poses
// or bone lengths. Correction is bounded to avoid explosive pose changes.
export function resolveLimbContact(model,mapping,strength=.7){const h=autoMap(model.bodyBones,mapping).human;if(!h.Hips)return;
 const colliders=clothCapsules(model,mapping,.008),chest=h.Chest||h.Spine,neck=h.Neck;
 if(chest&&neck)colliders.push([h.Hips.getWorldPosition(new Vector3()).lerp(chest.getWorldPosition(new Vector3()),.25),neck.getWorldPosition(new Vector3()),.095]);
 for(const side of ['Left','Right']){const upper=h[side+'UpperArm'],lower=h[side+'LowerArm'],hand=h[side+'Hand'];if(!upper||!lower||!hand)continue;
  const origin=hand.getWorldPosition(new Vector3()),target=origin.clone();for(const [a,b,r] of colliders)projectOutCapsule(target,a,b,r+.016);const distance=target.distanceTo(origin);if(distance<1e-6)continue;target.lerp(origin,1-strength);const correction=target.clone().sub(origin).clampLength(0,.075);target.copy(origin).add(correction);
  for(let pass=0;pass<5;pass++)for(const joint of [lower,upper]){const anchor=joint.getWorldPosition(new Vector3()),from=hand.getWorldPosition(new Vector3()).sub(anchor),to=target.clone().sub(anchor);if(from.lengthSq()<1e-9||to.lengthSq()<1e-9)continue;const turn=new Quaternion().setFromUnitVectors(from.normalize(),to.normalize()),angle=new Quaternion().angleTo(turn);if(angle>.12)turn.identity().slerp(new Quaternion().setFromUnitVectors(from,to),.12/angle);setWorldQuaternion(joint,turn.multiply(joint.getWorldQuaternion(new Quaternion())));}
 }
}
