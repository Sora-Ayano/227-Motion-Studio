import {Vector3,Quaternion,Matrix4} from 'three';
import {autoMap} from './rig.mjs';
import {resetBones,setWorldQuaternion} from './retarget.mjs';
export const HAND_LINKS=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const fingers=[['Thumb',1],['Index',5],['Middle',9],['Ring',13],['Little',17]],segments=['Proximal','Intermediate','Distal'];
function basis(across,forward){const x=across.normalize(),z=x.clone().cross(forward).normalize(),y=z.clone().cross(x).normalize();if(z.lengthSq()<1e-8)return null;return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x,y,z));}
export class HandSolver{
 constructor(model,{mapping={},mirror=false,smoothing=.35}={}){this.model=model;this.human=autoMap(model.bodyBones,mapping).human;this.mirror=mirror;this.smoothing=smoothing;this.last=new Map();this.matched=new Set();}
 frame(hands,frame,bodyKeys={}){const keys={},model=this.model,previous=model.bones.map(b=>({b,p:b.position.clone(),q:b.quaternion.clone()})),root=model.motionRoot,placement=root.parent,rootP=root.position.clone(),rootQ=root.quaternion.clone();
  try{root.removeFromParent();root.position.set(0,0,0);root.quaternion.identity();resetBones(model.bones);for(const b of model.bodyBones){const key=bodyKeys[b.userData.key];if(key){b.position.fromArray(key.position);b.quaternion.fromArray(key.quaternion);}}model.motionRoot.updateMatrixWorld(true);
   for(const hand of hands){if(hand.world?.length!==21||(hand.score??1)<.55)continue;const side=this.mirror?(hand.side==='Left'?'Right':'Left'):hand.side,h=this.human,wrist=h[side+'Hand'];if(!wrist)continue;
    const p=hand.world.map(v=>new Vector3((this.mirror?1:-1)*v.x,-v.y,v.z)),index=h[side+'IndexProximal'],little=h[side+'LittleProximal'],middle=h[side+'MiddleProximal'];
    if(index&&little&&middle){const rest=basis(index.userData.rest.worldPosition.clone().sub(little.userData.rest.worldPosition),middle.userData.rest.worldPosition.clone().sub(wrist.userData.rest.worldPosition)),source=basis(p[5].clone().sub(p[17]),p[9].clone().sub(p[0]));if(rest&&source)setWorldQuaternion(wrist,source.multiply(rest.invert()).multiply(wrist.userData.rest.worldQuaternion));}
    this.write(wrist,frame,keys);
    for(const [finger,start] of fingers)for(let j=0;j<3;j++){const bone=h[side+finger+segments[j]];if(!bone)continue;const child=h[side+finger+segments[j+1]]||bone.children.find(b=>b.isBone),rest=child?.userData.rest?.worldPosition.clone().sub(bone.userData.rest.worldPosition)||bone.userData.rest.worldPosition.clone().sub(bone.parent.userData.rest?.worldPosition||bone.userData.rest.worldPosition),direction=p[start+j+1].clone().sub(p[start+j]);
     if(rest.lengthSq()<1e-10||direction.lengthSq()<1e-10)continue;const inherited=bone.getWorldQuaternion(new Quaternion()),axis=rest.applyQuaternion(bone.userData.rest.worldQuaternion.clone().invert()).normalize().applyQuaternion(inherited);setWorldQuaternion(bone,new Quaternion().setFromUnitVectors(axis,direction.normalize()).multiply(inherited));this.write(bone,frame,keys);
    }
   }return keys;
  }finally{for(const {b,p,q} of previous){b.position.copy(p);b.quaternion.copy(q);}root.position.copy(rootP);root.quaternion.copy(rootQ);placement?.add(root);root.updateWorldMatrix(true,true);}
 }
 write(bone,frame,keys){const previous=this.last.get(bone.userData.key),q=previous?previous.clone().slerp(bone.quaternion,1-this.smoothing):bone.quaternion.clone();bone.quaternion.copy(q);bone.updateWorldMatrix(false,true);this.last.set(bone.userData.key,q);this.matched.add(bone.userData.key);keys[bone.userData.key]={frame,position:bone.userData.rest.position.toArray(),quaternion:q.toArray(),curve:[20,20,107,107]};}
}
