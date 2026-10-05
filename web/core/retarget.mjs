import {resolveLimbContact} from './limb-contact.mjs';
import { Quaternion, Vector3, Matrix4 } from 'three';
import { sampleBone, sampleMorph, bracket, bezier } from './vmd.mjs';
import { autoMap, computeAlignments, canonicalPositions, MMD_PARENT } from './rig.mjs';
import { resolveCloth,restoreClothGeometry,prepareCloth } from './cloth.mjs';
import {getGameMotion,applyGameBones,gameMorphValue,extractNativeRoot} from './game-motion.mjs';
import {secondaryMotion} from './secondary.mjs';
import {extractCapturedRoot} from './capture-root.mjs';
export const MAPPING={
 BodyPelvis:'下半身',BodySpine1:'上半身',BodySpine2:'上半身2',BodyNeck:'首',BodyHead:'頭',
 BodyShoulderL:'左肩',BodyShoulderR:'右肩',BodyUpperArmL:'左腕',BodyUpperArmR:'右腕',BodyUpperArmTwistL:'左腕捩',BodyUpperArmTwistR:'右腕捩',
 BodyForeArmL:'左ひじ',BodyForeArmR:'右ひじ',BodyForearmTwist1L:'左手捩',BodyForearmTwist1R:'右手捩',BodyHandL:'左手首',BodyHandR:'右手首',
 BodyUpperLegL:'左足',BodyUpperLegR:'右足',BodyLegL:'左ひざ',BodyLegR:'右ひざ',BodyFootL:'左足首',BodyFootR:'右足首',FaceEyeL:'左目',FaceEyeR:'右目'
};
const parent={'下半身':null,'上半身':null,'上半身2':'上半身','首':'上半身2','頭':'首','両目':'頭','左目':'両目','右目':'両目'};
for(const [side,suffix] of [['左','L'],['右','R']]){
 Object.assign(parent,{[side+'肩']:'上半身2',[side+'腕']:side+'肩',[side+'腕捩']:side+'腕',[side+'ひじ']:side+'腕捩',[side+'手捩']:side+'ひじ',[side+'手首']:side+'手捩',[side+'足']:'下半身',[side+'ひざ']:side+'足',[side+'足首']:side+'ひざ'});
 for(const [en,jp] of [['Thumb','親指'],['Index','人指'],['Middle','中指'],['Ring','薬指'],['Pinky','小指']])for(let n=1;n<=3;n++){
  const name=side+jp+['０','１','２','３'][en==='Thumb'?n-1:n];MAPPING[`BodyFinger${en}${n}${suffix}`]=name;
  parent[name]=n===1?side+'手首':side+jp+['０','１','２','３'][en==='Thumb'?n-2:n-1];
 }
}
export const MORPH_MAPPING={'まばたき':'Eyelid_Blink','ウィンク':'Eyelid_Blink_L','ウィンク右':'Eyelid_Blink_R','ウィンク２':'Eyelid_Smile_L','ウィンク２右':'Eyelid_Smile_R','笑い':'Eyelid_Smile','じと目':'Eyelid_Jito','あ':'Mouth_A','い':'Mouth_I','う':'Mouth_U','え':'Mouth_E','お':'Mouth_O','ん':'Mouth_M','にこり':'Mouth_Smile','困る':'Eyebrow_Sad','怒り':'Eyebrow_Angry','驚き':'Eyebrow_Amazed'};
export function fromMMDQuaternion(a){return new Quaternion(a[0],-a[1],-a[2],a[3]).normalize();}
export function fromMMDPosition(a,scale){return new Vector3(-a[0]*scale,a[1]*scale,a[2]*scale);}
export function captureRest(object,bones){object.updateMatrixWorld(true);for(const b of bones){b.quaternion.normalize();b.userData.rest={position:b.position.clone(),quaternion:b.quaternion.clone(),scale:b.scale.clone(),worldQuaternion:b.getWorldQuaternion(new Quaternion()).normalize(),worldScale:b.getWorldScale(new Vector3()),worldPosition:b.getWorldPosition(new Vector3())};}}
export function resetBones(bones){for(const b of bones){const r=b.userData.rest;b.position.copy(r.position);b.quaternion.copy(r.quaternion);b.scale.copy(r.scale);}}
export function setWorldQuaternion(bone,q){bone.parent.updateWorldMatrix(true,false);bone.quaternion.copy(bone.parent.getWorldQuaternion(new Quaternion()).invert().multiply(q));bone.updateWorldMatrix(false,true);}
export class Retargeter{
 constructor(model){this.model=model;this.rig=autoMap(model.bodyBones);this.mapping={...MAPPING,...this.rig.mapping};this.settings={scale:.08,ik:true,rootMotion:true,armAngle:35,cloth:true,clothMargin:.006,selfCollision:true,clothThickness:.004,clothFriction:.35,clothQuality:'balanced',limbContact:false};this.sourcePositions=model.mmdPositions||null;this.restFeet={};for(const s of ['L','R']){const jp=s==='L'?'左':'右',f=model.bodyBones.find(b=>this.mapping[b.name]===jp+'足首');if(f)this.restFeet[s]=f.userData.rest.worldPosition.clone().multiplyScalar(model.profile?.bodyScale||1);}}
 calibrate(positions=null){this.sourcePositions=positions;this._alignmentSignature='';}
 alignments(){const signature=JSON.stringify([this.mapping,this.settings.armAngle,this.sourcePositions]);if(signature!==this._alignmentSignature){this._alignments=computeAlignments(this.model,this.mapping,this.sourcePositions||canonicalPositions(this.settings.armAngle));this._alignmentSignature=signature;}return this._alignments;}
 diagnostics(clip){this.rig=autoMap(this.model.bodyBones,this.mapping);const known=new Set([...Object.values(this.mapping),...Object.keys(MMD_PARENT),...Object.keys(parent),'全ての親','センター','グルーブ','左足ＩＫ','右足ＩＫ','左足IK','右足IK','左足D','右足D','左ひざD','右ひざD','左足首D','右足首D']);
  return {mapped:Object.entries(this.mapping).filter(([u,m])=>this.model.bones.some(b=>b.name===u)&&clip.bones[m]?.length).length,unmapped:Object.keys(clip.bones).filter(n=>!known.has(n)&&clip.bones[n].some(k=>k.position.some(v=>Math.abs(v)>1e-6)||k.quaternion.slice(0,3).some(v=>Math.abs(v)>1e-6))),morphs:Object.keys(clip.morphs).filter(n=>clip.morphs[n].some(k=>Math.abs(k.weight)>1e-6)&&!this.model.morphs.some(m=>m.name.endsWith('BS_'+MORPH_MAPPING[n])||m.name===n))};}
 apply(clip,frame,edits={bones:{},morphs:{}}){
  const model=this.model,placementQ=model.motionRoot.parent?.getWorldQuaternion(new Quaternion())||new Quaternion();restoreClothGeometry(model);model.motionRoot.position.set(0,0,0);model.motionRoot.quaternion.identity();resetBones(model.bones);model.motionRoot.updateMatrixWorld(true);prepareCloth(model);
  const rootNames=['全ての親','センター','グルーブ'];let rootQ=new Quaternion(),rootP=new Vector3();
  for(const n of rootNames){const k=sampleBone(clip.bones[n],frame);if(this.settings.rootMotion)rootP.add(fromMMDPosition(k.position,this.settings.scale).applyQuaternion(rootQ));rootQ.multiply(fromMMDQuaternion(k.quaternion));}
  model.motionRoot.position.copy(rootP);model.motionRoot.quaternion.copy(rootQ);model.motionRoot.updateMatrixWorld(true);
  const deltas=new Map();const delta=n=>{if(!n||['全ての親','センター','グルーブ'].includes(n))return new Quaternion();if(deltas.has(n))return deltas.get(n);const p=MMD_PARENT[n]??parent[n];const q=delta(p).clone().multiply(fromMMDQuaternion(sampleBone(clip.bones[n],frame).quaternion));deltas.set(n,q);return q;};
  const alignment=Object.keys(clip.bones).length?this.alignments():{};
  // MMD torso branches at the groove; Unity's spine is a child of the pelvis.
  // Solve desired world rotations, then derive local transforms in Unity's hierarchy.
  for(const b of model.bodyBones){const source=this.mapping[b.name];if(!source)continue;
   let rotation=delta(source);if(/^[左右](足|ひざ|足首)$/.test(source)&&clip.bones[source+'D']?.length)rotation=delta(source.replace(/D$/,'')).multiply(fromMMDQuaternion(sampleBone(clip.bones[source+'D'],frame).quaternion));
   const desired=placementQ.clone().multiply(rootQ).multiply(rotation).multiply(alignment[b.name]||new Quaternion()).multiply(b.userData.rest.worldQuaternion);setWorldQuaternion(b,desired);
  }
  if(this.settings.ik)for(const s of ['L','R']){
   const jp=s==='L'?'左':'右',keys=clip.bones[jp+'足ＩＫ']||clip.bones[jp+'足IK'];if(!keys?.length)continue;
   let enabled=true;const switches=bracket(clip.ik,frame);if(switches){const entry=switches[0].items.find(i=>i.name===jp+'足ＩＫ'||i.name===jp+'足IK');if(entry)enabled=!!entry.enabled;}
   if(!enabled)continue;
   const k=sampleBone(keys,frame),all=sampleBone(clip.bones['全ての親'],frame);
   const target=this.restFeet[s].clone().add(fromMMDPosition(k.position,this.settings.scale)).applyQuaternion(fromMMDQuaternion(all.quaternion)).add(fromMMDPosition(all.position,this.settings.scale));
   if(model.motionRoot.parent)target.applyMatrix4(model.motionRoot.parent.matrixWorld);this.solveLeg(s,target,placementQ.clone().multiply(fromMMDQuaternion(all.quaternion).multiply(fromMMDQuaternion(k.quaternion))));
  }
  const game=clip.gameMotion&&(this._game?.id===clip.gameMotion.id?this._game:getGameMotion(clip.gameMotion.id));this._game=game;if(game&&!clip.disabledBody)applyGameBones(model,game,frame,'body',edits.bones);
  // Native keyframes are absolute local transforms and win over retargeted motion.
  for(const b of model.bodyBones){const keys=edits.bones[b.userData.key],k=sampleNative(keys,frame);if(k){b.position.fromArray(k.position);b.quaternion.fromArray(k.quaternion);if(k.scale)b.scale.fromArray(k.scale);b.updateMatrixWorld(true);}else if(keys){b.position.copy(b.userData.rest.position);b.quaternion.copy(b.userData.rest.quaternion);b.scale.copy(b.userData.rest.scale);b.updateMatrixWorld(true);}}
  if(game&&!clip.disabledBody)extractNativeRoot(model);
  else if(clip.capture?.rootSpace==='hips-local'||clip.choreography?.rootSpace==='hips-local'||/视频捕捉/.test(clip.name||''))extractCapturedRoot(model,this.rig.human.Hips);
  if(this.settings.limbContact&&!game)resolveLimbContact(model,this.mapping);
  if(this.settings.cloth)resolveCloth(model,this.mapping,this.settings.clothMargin??.006,{time:frame/30,token:clip,native:!!game,inertia:game?0:this.settings.clothInertia??.65,wind:game?0:this.settings.clothWind??0,selfCollision:this.settings.selfCollision!==false,thickness:this.settings.clothThickness??.004,friction:this.settings.clothFriction??.35,quality:this.settings.clothQuality||'balanced',fabric:this.settings.clothFabric||'cotton'});
  model.updateAttachments();
  if(game&&!clip.disabledFace)applyGameBones(model,game,frame,'face',edits.bones);
  for(const b of model.bones.filter(b=>!model.bodyBones.includes(b))){const source=this.mapping[b.name];
   if(source&&(!game||clip.bones[source]?.length||clip.bones['両目']?.length)){const k=sampleBone(clip.bones[source],frame);const both=sampleBone(clip.bones['両目'],frame);const axis=b.userData.rest.worldQuaternion;const correction=axis.clone().invert().multiply(fromMMDQuaternion(both.quaternion).multiply(fromMMDQuaternion(k.quaternion))).multiply(axis);b.quaternion.copy(b.userData.rest.quaternion).multiply(correction);}
   const k=sampleNative(edits.bones[b.userData.key],frame);if(k){b.position.fromArray(k.position);b.quaternion.fromArray(k.quaternion);if(k.scale)b.scale.fromArray(k.scale);}
  }

  for(const m of model.morphs){let weight=game&&!clip.disabledFace?gameMorphValue(game,m.name,frame):0;for(const [n,keys] of Object.entries(clip.morphs))if(m.name===n||m.name.endsWith('BS_'+MORPH_MAPPING[n]))weight+=sampleMorph(keys,frame);
   if(Object.hasOwn(edits.morphs,m.key))weight=sampleMorph(edits.morphs[m.key],frame);m.mesh.morphTargetInfluences[m.index]=Math.min(1,Math.max(0,weight));}
  model.motionRoot.updateMatrixWorld(true);if(this.settings.secondary!==false)secondaryMotion(model,{time:frame/30,token:clip,strength:this.settings.secondaryStrength??.65,wind:this.settings.clothWind??0,clothContact:this.settings.accessoryContact!==false});
 }
 solveLeg(s,target,orientation){
  const side=s==='L'?'左':'右',find=n=>this.model.bodyBones.find(b=>this.mapping[b.name]===side+n);const hip=find('足'),knee=find('ひざ'),foot=find('足首');if(!hip||!knee||!foot)return;
  const h=hip.getWorldPosition(new Vector3()),k=knee.getWorldPosition(new Vector3()),f=foot.getWorldPosition(new Vector3());
  const l1=h.distanceTo(k),l2=k.distanceTo(f),dir=target.clone().sub(h),dist=Math.min(l1+l2-1e-6,Math.max(Math.abs(l1-l2)+1e-6,dir.length()));dir.normalize();
  // Knee flexion follows the animated pelvis, including turns in 下半身.
  const pelvis=this.model.bodyBones.find(b=>this.mapping[b.name]==='下半身');
  const heading=pelvis?pelvis.getWorldQuaternion(new Quaternion()).multiply(pelvis.userData.rest.worldQuaternion.clone().invert()):this.model.motionRoot.quaternion;
  const pole=new Vector3(0,0,-1).applyQuaternion(heading);pole.addScaledVector(dir,-pole.dot(dir));if(pole.lengthSq()<1e-8)pole.set(0,1,0).addScaledVector(dir,-dir.y);pole.normalize();
  const along=(l1*l1-l2*l2+dist*dist)/(2*dist),height=Math.sqrt(Math.max(0,l1*l1-along*along));const desiredKnee=h.clone().addScaledVector(dir,along).addScaledVector(pole,height);
  const dq=new Quaternion().setFromUnitVectors(k.clone().sub(h).normalize(),desiredKnee.clone().sub(h).normalize());setWorldQuaternion(hip,dq.multiply(hip.getWorldQuaternion(new Quaternion())));
  const nk=knee.getWorldPosition(new Vector3()),nf=foot.getWorldPosition(new Vector3());const q=new Quaternion().setFromUnitVectors(nf.sub(nk).normalize(),target.clone().sub(nk).normalize());setWorldQuaternion(knee,q.multiply(knee.getWorldQuaternion(new Quaternion())));
  setWorldQuaternion(foot,orientation.clone().multiply(foot.userData.rest.worldQuaternion));
 }
}
export function sampleNative(keys,frame){const p=bracket(keys,frame);if(!p)return null;const [a,b,raw]=p,t=bezier(raw,b.curve);return {position:a.position.map((v,i)=>v+(b.position[i]-v)*t),quaternion:new Quaternion().fromArray(a.quaternion).slerp(new Quaternion().fromArray(b.quaternion),t).toArray(),scale:a.scale?.map((v,i)=>v+((b.scale?.[i]??v)-v)*t)};}
export function validateProject(p){if(p?.format!=='nananiji-studio'||p.version!==1||!p.components?.body||!p.motion?.bones||!p.motion?.morphs||!p.edits?.bones||!p.edits?.morphs)throw new Error('不是兼容的 22/7 Studio 工程');
 for(const lists of [p.motion.bones,p.motion.morphs,p.edits.bones,p.edits.morphs])for(const keys of Object.values(lists)){if(!Array.isArray(keys)||keys.length>1000000)throw new Error('工程关键帧无效');for(const k of keys)if(!Number.isFinite(k.frame)||k.frame<0)throw new Error('工程帧数无效');}
 return p;}
