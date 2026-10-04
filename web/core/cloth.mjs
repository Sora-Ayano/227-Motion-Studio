import { Vector3,Quaternion,Matrix4 } from 'three';
import { setWorldQuaternion } from './retarget.mjs';
import {prepareCloth,simulateCloth} from './cloth-surface.mjs';
export {prepareCloth} from './cloth-surface.mjs';
export function projectOutCapsule(point,a,b,r,openStart=false){const ab=b.clone().sub(a),raw=point.clone().sub(a).dot(ab)/Math.max(ab.lengthSq(),1e-9);if(openStart&&raw<0)return false;const t=Math.max(0,Math.min(1,raw)),closest=a.clone().addScaledVector(ab,t),d=point.clone().sub(closest),len=d.length();if(len>=r)return false;if(len<1e-7)d.set(0,0,-1);else d.divideScalar(len);point.copy(closest).addScaledVector(d,r);return true;}
export const MAX_CLOTH_ANGLE=25*Math.PI/180;
export function restoreClothGeometry(model){for(const mesh of model.meshes||[]){const rest=mesh.userData.clothRestPositions;if(rest){mesh.geometry.attributes.position.array.set(rest);mesh.geometry.attributes.position.needsUpdate=true;const normals=mesh.userData.clothRestNormals;if(normals){mesh.geometry.attributes.normal.array.set(normals);mesh.geometry.attributes.normal.needsUpdate=true;}}}}
function surfaceRadius(model,bone,child,fallback){
 model.clothRadii??=new Map();if(!model.clothRadii.has(bone)){
  const axis=child.userData.rest.worldPosition.clone().sub(bone.userData.rest.worldPosition).applyQuaternion(bone.userData.rest.worldQuaternion.clone().invert()).normalize(),radii=[];
  for(const mesh of model.meshes||[]){if(!mesh.isSkinnedMesh)continue;const slot=mesh.skeleton.bones.indexOf(bone);if(slot<0)continue;const a=mesh.geometry.attributes,rest=mesh.userData.clothRestPositions||a.position.array;
   for(let i=0;i<a.position.count;i++){let weight=0;for(let j=0;j<4;j++)if(a.skinIndex.getComponent(i,j)===slot)weight+=a.skinWeight.getComponent(i,j);if(weight<.4)continue;const p=new Vector3().fromArray(rest,i*3).applyMatrix4(mesh.bindMatrix).applyMatrix4(mesh.skeleton.boneInverses[slot]);radii.push(p.addScaledVector(axis,-p.dot(axis)).length());}
  }
  radii.sort((a,b)=>a-b);model.clothRadii.set(bone,radii.length?radii[Math.floor((radii.length-1)*.98)]:null);
 }
 const radius=model.clothRadii.get(bone),scale=bone.getWorldScale(new Vector3());return radius?radius*Math.max(Math.abs(scale.x),Math.abs(scale.y),Math.abs(scale.z)):fallback;
}
export function clothCapsules(model,mapping,margin=.006){
 const lookup=new Map(model.bodyBones.map(b=>[mapping[b.name],b])),capsules=[],clearance=Math.max(0,Math.min(.025,margin));
 for(const side of ['左','右']){const hip=lookup.get(side+'足'),knee=lookup.get(side+'ひざ'),foot=lookup.get(side+'足首');if(!hip||!knee||!foot)continue;const h=hip.getWorldPosition(new Vector3()),k=knee.getWorldPosition(new Vector3()),f=foot.getWorldPosition(new Vector3()),radius=surfaceRadius(model,hip,knee,h.distanceTo(k)*.20)+clearance;
  // The hip belongs inside the fixed waistband. A hemisphere centered on
  // the hip incorrectly collided with closed waist caps and bikini seams.
  const start=h.clone().add(k.clone().sub(h).setLength(Math.min(h.distanceTo(k)*.4,radius+.035)));
  capsules.push([start,k,radius],[k,f,surfaceRadius(model,knee,foot,k.distanceTo(f)*.12)+clearance]);const shoe=shoeCollider(model,foot);if(shoe){const scale=foot.getWorldScale(new Vector3());capsules.push([shoe.a.clone().applyMatrix4(foot.matrixWorld),shoe.b.clone().applyMatrix4(foot.matrixWorld),shoe.radius*Math.max(Math.abs(scale.x),Math.abs(scale.y),Math.abs(scale.z))+clearance]);}}
 return capsules;
}
function shoeCollider(model,foot){model.shoeColliders??=new Map();if(model.shoeColliders.has(foot))return model.shoeColliders.get(foot);const points=[];
 for(const mesh of model.meshes||[]){if(!mesh.isSkinnedMesh)continue;const slot=mesh.skeleton.bones.indexOf(foot);if(slot<0)continue;const attr=mesh.geometry.attributes,positions=mesh.userData.clothRestPositions||attr.position.array;for(let i=0;i<attr.position.count;i++){let weight=0;for(let j=0;j<4;j++)if(attr.skinIndex.getComponent(i,j)===slot)weight+=attr.skinWeight.getComponent(i,j);if(weight<.5)continue;points.push(new Vector3().fromArray(positions,i*3).applyMatrix4(mesh.bindMatrix).applyMatrix4(mesh.skeleton.boneInverses[slot]));}}
 if(!points.length){model.shoeColliders.set(foot,null);return null;}const min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity);for(const p of points){min.min(p);max.max(p);}const size=max.clone().sub(min),axis=size.toArray().indexOf(Math.max(...size.toArray())),center=min.clone().add(max).multiplyScalar(.5),radii=points.map(p=>{const d=p.clone().sub(center);d.setComponent(axis,0);return d.length();}).sort((a,b)=>a-b),radius=Math.max(.015,radii[Math.floor((radii.length-1)*.99)]),a=center.clone(),b=center.clone();a.setComponent(axis,min.getComponent(axis)+radius*.25);b.setComponent(axis,max.getComponent(axis)-radius*.25);const collider={a,b,radius};model.shoeColliders.set(foot,collider);return collider;
}
function proxies(model){
 if(model.clothProxies)return model.clothProxies;
 const groups=new Map();
 for(const mesh of model.meshes||[]){if(!mesh.isSkinnedMesh)continue;const ids=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight,positions=mesh.geometry.attributes.position;if(!ids||!weights)continue;
  for(let i=0;i<positions.count;i++){let j=0;for(let k=1;k<4;k++)if(weights.getComponent(i,k)>weights.getComponent(i,j))j=k;const bone=mesh.skeleton.bones[ids.getComponent(i,j)];if(!bone||!/skirt|スカート/i.test(bone.name)||/root|親/i.test(bone.name)||weights.getComponent(i,j)<.4)continue;const p=new Vector3().fromBufferAttribute(positions,i),cell=[Math.round(p.x/.04),Math.round(p.y/.045),Math.round(p.z/.04)].join(',');if(!groups.has(bone))groups.set(bone,new Map());groups.get(bone).set(cell,{mesh,index:i});}
 }
 return model.clothProxies=[...groups].map(([bone,points])=>({bone,points:[...points.values()].slice(0,80)}));
}
// Start each pose from native transforms, average corrections per panel and
// limit total deflection. Independent rotations per vertex fanned the skirt.
export function resolveCloth(model,mapping,margin=.006,simulation={}){
 const panels=proxies(model),original=new Map(panels.map(({bone})=>[bone,bone.quaternion.clone()]));
 const capsules=clothCapsules(model,mapping,margin);
 // Native animations already author the skirt bones; correct only contacts
 // on their animated surface instead of replacing these bone curves.
 for(let pass=0;pass<(simulation.native?0:3);pass++)for(const {bone,points} of panels){
  const origin=bone.getWorldPosition(new Vector3()),torque=new Vector3();let weight=0;
  for(const {mesh,index} of points){const point=mesh.getVertexPosition(index,new Vector3()).applyMatrix4(mesh.matrixWorld),target=point.clone();let changed=false;for(const [a,b,r,open] of capsules)changed=projectOutCapsule(target,a,b,r,open)||changed;if(!changed)continue;
   const from=point.clone().sub(origin),to=target.clone().sub(origin);if(from.lengthSq()<1e-5||to.lengthSq()<1e-5)continue;
   const penetration=point.distanceTo(target),q=new Quaternion().setFromUnitVectors(from.normalize(),to.normalize()),angle=2*Math.acos(Math.min(1,Math.abs(q.w))),axis=new Vector3(q.x,q.y,q.z);if(axis.lengthSq()<1e-10)continue;
   torque.addScaledVector(axis.normalize(),angle*penetration);weight+=penetration;
  }
  if(!weight||torque.lengthSq()<1e-10)continue;torque.divideScalar(weight);const correction=new Quaternion().setFromAxisAngle(torque.clone().normalize(),Math.min(torque.length()*.7,8*Math.PI/180));
  setWorldQuaternion(bone,correction.multiply(bone.getWorldQuaternion(new Quaternion())));
  const base=original.get(bone),angle=base.angleTo(bone.quaternion);if(angle>MAX_CLOTH_ANGLE)bone.quaternion.copy(base.clone().slerp(bone.quaternion,MAX_CLOTH_ANGLE/angle));bone.updateWorldMatrix(false,true);
 }
 simulateCloth(model,capsules,{...simulation,pelvis:model.bodyBones.find(b=>mapping[b.name]==='下半身')});

}
