import {Vector3,Quaternion} from 'three';
import {autoMap} from './rig.mjs';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const profiles={
 hair:{stiffness:115,damping:18,angle:20,gravity:.7,inertia:.8},
 fringe:{stiffness:180,damping:22,angle:9,gravity:.3,inertia:.45},
 ribbon:{stiffness:90,damping:16,angle:28,gravity:1.3,inertia:.8},
 sleeve:{stiffness:145,damping:20,angle:12,gravity:.7,inertia:.6},
 hanging:{stiffness:130,damping:19,angle:20,gravity:1.6,inertia:.7},
 ornament:{stiffness:170,damping:22,angle:10,gravity:.5,inertia:.5},
 tail:{stiffness:100,damping:18,angle:17,gravity:.6,inertia:.75},
};

function category(bone,nativeFamilies){
 const name=bone.name;
 const native=nativeFamilies.has(bone.userData.family);
 if(!native&&!/^(Hair(Front|Side|Back|Tail|Top|Ahoge|Ribbon)|HeadAcc|FaceAcc|BodyAcc|BiddyAcc)|hair|ponytail|twintail|ribbon|髪|毛束|リボン|tie|necktie|scarf|ネクタイ|スカーフ/i.test(name))return null;
 // Anchors, human joints, and cloth driven by the skirt solver are never moved.
 if(/root|base|attach|end|skirt|cloth|cape|mantle/i.test(name)||/^Body(?!Acc)/i.test(name))return null;
 for(let p=bone.parent;p?.isBone;p=p.parent)if(/skirt|cloth|cape|mantle/i.test(p.name))return null;
 if(!native){if(/ribbon|リボン|tie|necktie|scarf|ネクタイ|スカーフ/i.test(name))return 'ribbon';if(/hair|ponytail|twintail|髪|毛束/i.test(name))return /front|前髪/i.test(name)?'fringe':'hair';}
 if(/^Hair(Front|Side|Back|Tail|Top|Ahoge|Ribbon)/i.test(name))return /ribbon/i.test(name)?'ribbon':/front/i.test(name)?'fringe':'hair';
 if(/^(HeadAcc|FaceAcc|BodyAcc|BiddyAcc)/i.test(name)){
  if(/ribbon/i.test(name))return 'ribbon';
  if(/earrings?|tassel|chain|pendant/i.test(name))return 'hanging';
  if(/tail/i.test(name))return 'tail';
  if(/wing|cap|ponpon|corsage|strap/i.test(name))return 'ornament';
  // Some authored ribbon joints have only directional names and an End child.
  if(/^HeadAcc[LRBT]{1,2}\d*$/i.test(name)&&bone.children.some(c=>c.isBone&&/End/i.test(c.name)))return 'ribbon';
  return null; // A tiara, glasses, a hat base, or a hairpin remains rigid.
 }
 let physicsRoot=false;
 for(let p=bone.parent;p?.isBone;p=p.parent)if(/^Physics__/i.test(p.name)){physicsRoot=true;break;}
 if(!physicsRoot)return null;
 if(/ribbon|tie|tai\d|scarf|muffler/i.test(name))return 'ribbon';
 if(/sleeve|sode|frill/i.test(name))return 'sleeve';
 if(/necklace|neckcharm|neckstar|string|strap/i.test(name))return 'hanging';
 if(/rabbitear|wing/i.test(name))return 'ornament';
 return null;
}

function candidates(model){
 if(model.secondaryChains)return model.secondaryChains;
 // Imported models participate only through named hair/ribbon chains. Human
 // joints, roots and unrecognized ornaments remain under their animation.
 const nativeFamilies=new Set((model.parts||[]).filter(p=>p.data?.bones&&p.data?.key).map(p=>p.family));
 const chains=model.bones.flatMap(bone=>{
  const type=category(bone,nativeFamilies);if(!type)return [];
  const child=bone.children.find(c=>c.isBone&&(c.userData.rest?.position||c.position).lengthSq()>.000025);
  return [{bone,type,offset:child?(child.userData.rest?.position||child.position).clone():null,depth:0,velocity:new Vector3()}];
 });
 const leaves=new Map(chains.filter(c=>!c.offset).map(c=>[c.bone,{chain:c,sum:new Vector3(),weight:0,farthest:new Vector3()}]));
 const point=new Vector3();
 // Terminal weighted joints often have no exported End bone. Infer their tip
 // from native bind-space skinning, which also handles positive-X hair tails.
 for(const mesh of model.meshes||[]){
  if(!mesh.isSkinnedMesh)continue;
  const a=mesh.geometry.attributes;if(!a.skinWeight||!a.skinIndex)continue;
  const slots=mesh.skeleton.bones.map(b=>leaves.get(b));if(!slots.some(Boolean))continue;
  const positions=mesh.userData.clothRestPositions||a.position.array;
  for(let i=0;i<a.position.count;i++)for(let k=0;k<4;k++){
   const weight=a.skinWeight.getComponent(i,k),slot=a.skinIndex.getComponent(i,k),entry=slots[slot];if(!entry||weight<.15)continue;
   point.fromArray(positions,i*3).applyMatrix4(mesh.bindMatrix).applyMatrix4(mesh.skeleton.boneInverses[slot]);
   entry.sum.addScaledVector(point,weight);entry.weight+=weight;
   if(point.lengthSq()>entry.farthest.lengthSq())entry.farthest.copy(point);
  }
 }
 for(const entry of leaves.values())if(entry.weight){
  const tip=entry.sum.divideScalar(entry.weight);
  if(tip.lengthSq()<.000025)tip.copy(entry.farthest);
  if(tip.lengthSq()>.000025){const scale=entry.chain.bone.userData.rest.worldScale||new Vector3(1,1,1),worldLength=tip.clone().multiply(scale).length();if(worldLength>1e-8)entry.chain.offset=tip.multiplyScalar(clamp(worldLength,.01,.3)/worldLength);}
 }
 model.secondaryChains=chains.filter(c=>c.offset&&c.offset.lengthSq()>.000025).map(c=>{
  for(let p=c.bone.parent;p;p=p.parent)c.depth++;
  c.phase=[...c.bone.name].reduce((v,ch)=>((v*31+ch.charCodeAt(0))>>>0),0)%628/100;
  return c;
 }).sort((a,b)=>a.depth-b.depth);
 model.secondaryStats=model.secondaryChains.reduce((stats,c)=>{stats[c.type]=(stats[c.type]||0)+1;return stats;},{});
 return model.secondaryChains;
}

function colliderDefinitions(model){
 if(model.secondaryColliders)return model.secondaryColliders;
 const bones=new Map(model.bodyBones.map(b=>[b.name,b])),human=autoMap(model.bodyBones).human;const aliases={BodyHead:'Head',BodyNeck:'Neck',BodyPelvis:'Hips',BodySpine1:'Spine',BodySpine2:'Chest',BodyUpperArmL:'LeftUpperArm',BodyUpperArmR:'RightUpperArm',BodyForeArmL:'LeftLowerArm',BodyForeArmR:'RightLowerArm',BodyHandL:'LeftHand',BodyHandR:'RightHand'};for(const [n,k] of Object.entries(aliases))if(!bones.has(n)&&human[k])bones.set(n,human[k]);const head=bones.get('BodyHead'),neck=bones.get('BodyNeck'),colliders=[];
 const capsule=(a,b,radius)=>{if(a&&b)colliders.push({a,b,radius,referenceScale:a.userData.rest.worldScale?.clone()||a.getWorldScale(new Vector3())});};
 if(head&&neck){
  const height=head.userData.rest.worldPosition.distanceTo(neck.userData.rest.worldPosition);
  const up=head.userData.rest.worldPosition.clone().sub(neck.userData.rest.worldPosition).normalize();
  // Small inner head volume: bangs remain at their authored rest clearance.
  const offset=up.multiplyScalar(clamp(height*.78,.075,.13)).applyQuaternion(head.userData.rest.worldQuaternion.clone().invert());
  const referenceScale=head.userData.rest.worldScale?.clone()||head.getWorldScale(new Vector3());offset.divide(referenceScale);colliders.push({a:head,offset,referenceScale,radius:clamp(height*.68,.065,.10)});
 }
 capsule(bones.get('BodyPelvis'),bones.get('BodySpine2'),.095);
 capsule(bones.get('BodySpine1'),neck,.09);
 for(const side of ['L','R']){
  capsule(bones.get('BodyUpperArm'+side),bones.get('BodyForeArm'+side),.026);
  capsule(bones.get('BodyForeArm'+side),bones.get('BodyHand'+side),.021);
 }
 return model.secondaryColliders=colliders;
}

function worldColliders(model){
 return colliderDefinitions(model).map((c,id)=>{
  const a=c.offset?c.offset.clone().applyMatrix4(c.a.matrixWorld):c.a.getWorldPosition(new Vector3());
  const b=c.b?c.b.getWorldPosition(new Vector3()):a.clone(),scale=c.a.getWorldScale(new Vector3());
  return {a,b,id,radius:c.radius*Math.max(Math.abs(scale.x/c.referenceScale.x),Math.abs(scale.y/c.referenceScale.y),Math.abs(scale.z/c.referenceScale.z))};
 });
}

function closest(point,collider){
 const ab=collider.b.clone().sub(collider.a),t=clamp(point.clone().sub(collider.a).dot(ab)/Math.max(ab.lengthSq(),1e-12),0,1);
 return collider.a.clone().addScaledVector(ab,t);
}

function constrain(position,anchor,goal,length,limit,colliders,clearances){
 const wanted=goal.clone().sub(anchor).normalize(),identity=new Quaternion();
 for(let pass=0;pass<5;pass++){
  for(const collider of colliders){
   // Preserve overlaps already present in the authored pose. The proxy may be
   // broader than a particular costume or face and must not push its rest pose.
   const radius=Math.min(collider.radius,clearances?.[collider.id]??Math.max(0,goal.distanceTo(closest(goal,collider))-.003));
   if(radius<=.001)continue;
   for(const t of [1,.6]){
    const sample=anchor.clone().lerp(position,t),reference=anchor.clone().lerp(goal,t);
    const sampleRadius=radius*t;
    const center=closest(sample,collider),normal=sample.sub(center),distance=normal.length();
    if(distance>=sampleRadius||sampleRadius<=.001)continue;
    if(distance<1e-7)normal.copy(reference).sub(closest(reference,collider));
    if(normal.lengthSq()>1e-12)position.addScaledVector(normal.normalize(),(sampleRadius-distance)/t);
   }
  }
  const direction=position.clone().sub(anchor);
  if(direction.lengthSq()<1e-12)direction.copy(wanted);else direction.normalize();
  const turn=new Quaternion().setFromUnitVectors(wanted,direction),angle=identity.angleTo(turn);
  if(angle>limit)turn.copy(identity).slerp(new Quaternion().setFromUnitVectors(wanted,direction),limit/angle);
  position.copy(wanted).applyQuaternion(turn).multiplyScalar(length).add(anchor);
 }
}

export function secondaryMotion(model,{time=0,token=null,strength=.65,wind=0}={}){
 strength=clamp(Number.isFinite(strength)?strength:.65,0,1);wind=clamp(Number.isFinite(wind)?wind:0,-2,2);
 const chains=candidates(model),elapsed=time-(model.secondaryTime??time);
 const continuous=model.secondaryToken===token&&elapsed>0&&elapsed<=.12&&strength>0,dt=continuous?elapsed:0;
 const colliders=worldColliders(model);
 for(const c of chains){
  const bone=c.bone;bone.updateWorldMatrix(true,false);
  const anchor=bone.getWorldPosition(new Vector3()),baseRotation=bone.getWorldQuaternion(new Quaternion());
  const goal=c.offset.clone().applyMatrix4(bone.matrixWorld),length=anchor.distanceTo(goal);
  if(!continuous||!c.position||c.lastAnchor.distanceTo(anchor)>Math.max(.25,length*3)){
   c.position=goal.clone();c.lastGoal=goal.clone();c.lastAnchor=anchor.clone();c.velocity.set(0,0,0);continue;
  }
  const p=profiles[c.type],limit=p.angle*Math.PI/180*strength;
  if(!c.clearances){const reference=c.offset.clone().applyQuaternion(bone.userData.rest.worldQuaternion).add(bone.userData.rest.worldPosition);const definitions=colliderDefinitions(model);c.clearances=colliders.map((collider,id)=>{const d=definitions[id],a=d.offset?d.offset.clone().multiply(d.referenceScale).applyQuaternion(d.a.userData.rest.worldQuaternion).add(d.a.userData.rest.worldPosition):d.a.userData.rest.worldPosition,b=d.b?.userData.rest.worldPosition||a;return Math.max(0,reference.distanceTo(closest(reference,{a,b}))-.002);});}
  const nearby=colliders.filter(collider=>goal.distanceTo(closest(goal,collider))<collider.radius+length*.75+.02);
  const steps=Math.max(1,Math.ceil(dt*120)),h=dt/steps;
  const carry=anchor.clone().sub(c.lastAnchor).multiplyScalar((1-p.inertia*strength)/steps);
  for(let step=1;step<=steps;step++){
   const alpha=step/steps,a=c.lastAnchor.clone().lerp(anchor,alpha),target=c.lastGoal.clone().lerp(goal,alpha);
   const old=c.position.clone();
   if(h>0){
    c.position.add(carry);
    const force=target.clone().sub(c.position).multiplyScalar(p.stiffness*(1.3-.3*strength));
    force.y-=p.gravity*strength;
    force.x+=Math.sin((time-dt+step*h)*2.3+c.phase)*wind*strength*1.7;
    force.z+=Math.cos((time-dt+step*h)*1.7+c.phase)*wind*strength*.65;
    c.velocity.addScaledVector(force,h).multiplyScalar(Math.exp(-p.damping*h));
    c.position.addScaledVector(c.velocity,h);
   }
   constrain(c.position,a,target,a.distanceTo(target),limit,nearby,c.clearances);
   if(h>0)c.velocity.copy(c.position).sub(old).sub(carry).divideScalar(h).clampLength(0,length*10+.15);
  }
  const desired=goal.clone().sub(anchor).normalize(),actual=c.position.clone().sub(anchor).normalize();
  const turn=new Quaternion().setFromUnitVectors(desired,actual),parent=bone.parent.getWorldQuaternion(new Quaternion());
  bone.quaternion.copy(parent.invert().multiply(turn.multiply(baseRotation))).normalize();
  bone.updateWorldMatrix(false,true);
  c.position.copy(c.offset).applyMatrix4(bone.matrixWorld);c.lastAnchor.copy(anchor);c.lastGoal.copy(goal);
 }
 model.secondaryTime=time;model.secondaryToken=token;
}
