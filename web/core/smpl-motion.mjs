import {Matrix3, Matrix4, Quaternion, Vector3} from 'three';
import {autoMap, MMD_PARENT,computeAlignments,canonicalPositions} from './rig.mjs';
import {Retargeter} from './retarget.mjs';
import {emptyClip, linearInterpolation} from './vmd.mjs';

// FACT consumes 120 motion frames (2 s at 60 Hz) plus 35-channel music features.
// Its raw file has xyz + 24 row-major rotation matrices (219 columns); inference
// prepends six zeros (225 columns). Lyrics are not a FACT input. This importer
// implements the numeric format only; it contains no model weights or SMPL mesh.
export const SMPL_JOINTS = Object.freeze([
 'root','lhip','rhip','belly','lknee','rknee','spine','lankle','rankle','chest',
 'ltoes','rtoes','neck','linshoulder','rinshoulder','head','lshoulder','rshoulder',
 'lelbow','relbow','lwrist','rwrist','lhand','rhand'
]);
export const SMPL_PARENTS = Object.freeze([-1,0,0,0,1,2,3,4,5,6,7,8,9,9,9,12,13,14,16,17,18,19,20,21]);
export const SMPL_COORDINATES = Object.freeze({
 'y-up-z-forward': [-1,0,0, 0,1,0, 0,0,-1],
 'y-up-negative-z-forward': [1,0,0, 0,1,0, 0,0,1],
 'z-up-y-forward': [-1,0,0, 0,0,1, 0,-1,0],
 'mmd': [-1,0,0, 0,1,0, 0,0,1]
});
const LIMIT_FRAMES = 30000, LIMIT_BYTES = 128 * 1024 * 1024;
const parsedMotions = new WeakSet();
const finite = (n,label) => {if(typeof n !== 'number'||!Number.isFinite(n))throw new Error(`${label} 含无效数值`);return n;};
const arrayLike = a => Array.isArray(a)||ArrayBuffer.isView(a);
const flatten = (a,out=[]) => {if(!arrayLike(a))throw new Error('SMPL 数组结构无效');for(const v of a)arrayLike(v)?flatten(v,out):out.push(finite(v,'SMPL'));return out;};
const matrix = a => new Matrix4().set(a[0],a[1],a[2],0,a[3],a[4],a[5],0,a[6],a[7],a[8],0,0,0,0,1);
const rotationArray = q => {const e=new Matrix4().makeRotationFromQuaternion(q).elements;return [e[0],e[4],e[8],e[1],e[5],e[9],e[2],e[6],e[10]];};

function coordinateBasis(value){
 const a=typeof value==='string'?SMPL_COORDINATES[value]:value;
 if(!arrayLike(a)||a.length!==9)throw new Error('未知 SMPL 坐标系');
 const m=matrix(Array.from(a,(x)=>finite(x,'坐标轴'))),linear=new Matrix3().setFromMatrix4(m);
 const columns=[new Vector3(a[0],a[3],a[6]),new Vector3(a[1],a[4],a[7]),new Vector3(a[2],a[5],a[8])];
 if(columns.some(v=>Math.abs(v.length()-1)>1e-5)||Math.abs(columns[0].dot(columns[1]))>1e-5||Math.abs(columns[0].dot(columns[2]))>1e-5||Math.abs(columns[1].dot(columns[2]))>1e-5||Math.abs(Math.abs(linear.determinant())-1)>1e-5)throw new Error('坐标变换必须是正交单位基');
 return m;
}

function readRotation(values,representation,diagnostics){
 if(representation==='axis-angle'){
  const v=new Vector3(...values),angle=v.length();return angle<1e-12?new Quaternion():new Quaternion().setFromAxisAngle(v.multiplyScalar(1/angle),angle);
 }
 if(representation==='quaternion'){
  const q=new Quaternion(...values);if(q.lengthSq()<1e-12)throw new Error('SMPL 四元数为零');return q.normalize();
 }
 // Network regression does not guarantee orthogonal matrices. Rebuild a proper
 // right-handed basis; reject degenerate outputs instead of producing NaNs.
 const x=new Vector3(values[0],values[3],values[6]),y=new Vector3(values[1],values[4],values[7]),z0=new Vector3(values[2],values[5],values[8]);
 if(x.lengthSq()<1e-12||y.lengthSq()<1e-12||z0.lengthSq()<1e-12)throw new Error('SMPL 旋转矩阵退化');
 const error=Math.max(Math.abs(x.length()-1),Math.abs(y.length()-1),Math.abs(z0.length()-1),Math.abs(x.dot(y)),Math.abs(x.dot(z0)),Math.abs(y.dot(z0)));
 x.normalize();y.addScaledVector(x,-x.dot(y));if(y.lengthSq()<1e-12)throw new Error('SMPL 旋转矩阵轴重合');y.normalize();const z=x.clone().cross(y);
 if(error>1e-5||z.dot(z0)<0)diagnostics.repairedMatrices++;
 return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x,y,z)).normalize();
}

/** Read FACT features or {smpl_poses,smpl_trans,smpl_scaling}; no pickle execution. */
export function parseSMPLMotion(data,options={}){
 if(parsedMotions.has(data))return data;
 if(!data||typeof data!=='object')throw new Error('不是 SMPL 动作数据');
 const fps=finite(options.fps??data.fps??60,'帧率');if(fps<=0||fps>240)throw new Error('SMPL 帧率应为 1–240');
 const coordinateSystem=options.coordinateSystem??data.coordinateSystem??'y-up-z-forward';
 coordinateBasis(options.basis??data.basis??coordinateSystem);
 const unit=options.units??data.units??'m',unitScale={m:1,cm:.01,mm:.001}[unit];if(!unitScale)throw new Error('SMPL 单位应为 m、cm 或 mm');
 const bodyScale=finite(data.smpl_scaling??1,'SMPL 比例');if(bodyScale<=0)throw new Error('SMPL 比例必须大于零');
 const translationScale=finite(options.translationScale??1,'位移比例')*unitScale/bodyScale;
 if(translationScale<=0)throw new Error('位移比例必须大于零');
 const features=Array.isArray(data)?data:data.features??data.motion??data.pred_motion;
 let poses,translations,representation=options.representation??data.representation??'axis-angle',dimension=null;
 if(features&&arrayLike(features[0])&&[219,225].includes(features[0].length)){
  dimension=features[0].length;representation='matrix';poses=[];translations=[];
  if(features.length>LIMIT_FRAMES)throw new Error('SMPL 动作超过 30000 帧');
  for(const row of features){if(!arrayLike(row)||row.length!==dimension)throw new Error('FACT 每帧维度不一致');const values=flatten(row),start=dimension===225?6:0;translations.push(values.slice(start,start+3));poses.push(values.slice(start+3));}
 }else{
  poses=data.smpl_poses??data.poses??data.rotations;
  translations=data.smpl_trans??data.translations??data.pred_trans;
  if(!poses&&features){poses=features;representation='matrix';}
 }
 if(!arrayLike(poses)||!poses.length||poses.length>LIMIT_FRAMES)throw new Error('缺少 SMPL24 姿态或帧数无效');
 if(!translations)translations=Array.from({length:poses.length},()=>[0,0,0]);
 if(!arrayLike(translations)||translations.length!==poses.length)throw new Error('姿态和根位移帧数不同');
 const width={'axis-angle':3,quaternion:4,matrix:9}[representation];if(!width)throw new Error('SMPL 旋转格式应为 axis-angle、quaternion 或 matrix');
 const diagnostics={frames:poses.length,sourceDimension:dimension,repairedMatrices:0};
 const frames=Array.from(poses,(pose,index)=>{
  const values=flatten(pose),translation=flatten(translations[index]);
  if(values.length!==24*width||translation.length!==3)throw new Error(`SMPL 第 ${index+1} 帧不是 24 个关节`);
  return {translation:translation.map(v=>v*translationScale),quaternions:Array.from({length:24},(_,j)=>readRotation(values.slice(j*width,(j+1)*width),representation,diagnostics).toArray())};
 });
 const parsed={kind:'smpl-motion-v1',fps,coordinateSystem,basis:Array.from(options.basis??data.basis??SMPL_COORDINATES[coordinateSystem]),restPose:data.restPose,restPositions:data.restPositions,frames,diagnostics};parsedMotions.add(parsed);return parsed;
}

/** Numeric C-order NumPy v1/v2/v3, shape (N,219|225), float32/float64 only. */
export function parseSMPLNPY(input,options={}){
 const bytes=input instanceof ArrayBuffer?new Uint8Array(input):new Uint8Array(input.buffer,input.byteOffset,input.byteLength);
 if(bytes.byteLength>LIMIT_BYTES||bytes.length<12||bytes[0]!==0x93||String.fromCharCode(...bytes.slice(1,6))!=='NUMPY')throw new Error('不是支持的 NumPy 动作文件');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),version=bytes[6];if(![1,2,3].includes(version))throw new Error('不支持的 NumPy 版本');
 const prefix=version===1?10:12,length=version===1?view.getUint16(8,true):view.getUint32(8,true);if(prefix+length>bytes.length)throw new Error('NumPy 头部不完整');
 const header=new TextDecoder(version===3?'utf-8':'latin1').decode(bytes.slice(prefix,prefix+length));
 const dtype=header.match(/['"]descr['"]\s*:\s*['"]([<>=|])f([48])['"]/),order=header.match(/['"]fortran_order['"]\s*:\s*(True|False)/),shape=header.match(/['"]shape['"]\s*:\s*\(\s*(\d+)\s*,\s*(\d+)\s*,?\s*\)/);
 if(!dtype||order?.[1]!=='False'||!shape)throw new Error('仅支持 C 顺序 float32/float64 的 FACT 二维数组');
 const rows=Number(shape[1]),cols=Number(shape[2]),size=Number(dtype[2]),offset=prefix+length;
 if(rows<1||rows>LIMIT_FRAMES||![219,225].includes(cols)||offset+rows*cols*size!==bytes.length)throw new Error('NumPy 动作尺寸无效或文件不完整');
 const little=dtype[1]!=='>';const features=Array.from({length:rows},(_,i)=>Array.from({length:cols},(_,j)=>finite(size===4?view.getFloat32(offset+(i*cols+j)*size,little):view.getFloat64(offset+(i*cols+j)*size,little),'NumPy')));
 return parseSMPLMotion({features,fps:options.fps??60},options);
}

function sourceWorld(frame){
 const worlds=[];for(let j=0;j<24;j++)worlds[j]=(SMPL_PARENTS[j]<0?new Quaternion():worlds[SMPL_PARENTS[j]].clone()).multiply(new Quaternion().fromArray(frame.quaternions[j]));return worlds;
}
const sourceForTarget={Hips:0,Spine:3,Chest:6,UpperChest:9,Neck:12,Head:15,LeftShoulder:13,RightShoulder:14,LeftUpperArm:16,RightUpperArm:17,LeftLowerArm:18,RightLowerArm:19,LeftHand:20,RightHand:21,LeftUpperLeg:1,RightUpperLeg:2,LeftLowerLeg:4,RightLowerLeg:5,LeftFoot:7,RightFoot:8,LeftToes:10,RightToes:11};
const restMatrix = r => new Matrix4().compose(r.worldPosition,r.worldQuaternion,r.worldScale??new Vector3(1,1,1));

/** Return {motion,edits,vmd,diagnostics}; native edits preserve the target bind axes. */
export function retargetSMPLMotion(model,input,options={}){
 const data=parseSMPLMotion(input,options),rig=autoMap(model.bodyBones,options.mapping??{}),hips=rig.human.Hips;
 if(!hips?.userData.rest)throw new Error('目标模型缺少已校准的 Hips 骨骼');
 const bones=model.bodyBones,bodySet=new Set(bones),mapped=bones.filter(b=>rig.mapping[b.name]),selected=new Map();
 for(const [name,index] of Object.entries(sourceForTarget))if(rig.human[name])selected.set(rig.human[name],name==='Chest'&&!rig.human.UpperChest?9:index);
 for(const b of bones)if(!b.userData.rest)throw new Error('目标模型尚未记录绑定姿势');
 const rootMode=options.rootMode??'relative';if(!['relative','absolute'].includes(rootMode))throw new Error('rootMode 应为 relative 或 absolute');
 const vmdScale=finite(options.vmdScale??.08,'VMD 比例');if(vmdScale<=0)throw new Error('VMD 比例必须大于零');
 // Character loading records rest transforms at unit body scale, then applies
 // the profile scale. Compensate pelvis-local translations so metres stay metres.
 const bodyScale=finite(model.profile?.bodyScale??1,'目标身高比例');if(bodyScale<=0)throw new Error('目标身高比例必须大于零');
 const basis=coordinateBasis(data.basis),inverseBasis=basis.clone().invert(),basisLinear=new Matrix3().setFromMatrix4(basis);
 const restPose=options.restPose??data.restPose??'t-pose';if(!['t-pose','bind'].includes(restPose))throw new Error('restPose 应为 t-pose 或 bind');
 let sourcePositions=null;const restPositions=options.sourceRestPositions??data.restPositions;
 if(restPositions){
  if(!Array.isArray(restPositions)||restPositions.length!==24)throw new Error('源绑定位置应为 24 个三维坐标');
  const points=restPositions.map(p=>{const a=flatten(p);if(a.length!==3)throw new Error('源绑定位置应为三维坐标');return new Vector3(...a).applyMatrix3(basisLinear).toArray();});sourcePositions={};
  for(const [name,index] of Object.entries(sourceForTarget))if(rig.human[name])sourcePositions[rig.mapping[rig.human[name].name]]=points[name==='Chest'&&!rig.human.UpperChest?9:index];
 }
 // SMPL's neutral arms are a T pose; Unity imports commonly use an A pose.
 // Calibrate segment directions before applying motion, instead of copying
 // rotation numbers into differently rolled or angled target bind bones.
 const sourceAlignment=restPose==='bind'?{}:computeAlignments(model,rig.mapping,sourcePositions??canonicalPositions(0),sourcePositions?p=>new Vector3(...p):undefined);
 const hipRest=hips.userData.rest,hipParent=restMatrix(hipRest).multiply(new Matrix4().compose(hipRest.position,hipRest.quaternion,hipRest.scale).invert());
 const parentLinear=new Matrix3().setFromMatrix4(hipParent).invert().multiplyScalar(1/bodyScale),edits={bones:{},morphs:{}},motion=emptyClip(),vmd=emptyClip();
 const retargeter=new Retargeter(model),alignment=retargeter.alignments(),origin=rootMode==='relative'?new Vector3(...data.frames[0].translation):new Vector3();
 const previous=new Map(),minimum=new Vector3(Infinity,Infinity,Infinity),maximum=new Vector3(-Infinity,-Infinity,-Infinity);
 const stride=Math.floor(finite(options.keyStride??1,'关键帧间隔'));if(stride<1)throw new Error('关键帧间隔必须大于零');
 const indices=[];for(let i=0;i<data.frames.length;i+=stride)indices.push(i);if(indices.at(-1)!==data.frames.length-1)indices.push(data.frames.length-1);
 const vmdErrors=new Map();
 const appendVMD=(name,key,exactFrame)=>{const keys=(vmd.bones[name]??=[]),error=Math.abs(key.frame-exactFrame);if(keys.at(-1)?.frame===key.frame){if(error<(vmdErrors.get(name)??Infinity))keys[keys.length-1]=key;else return;}else keys.push(key);vmdErrors.set(name,error);};
 for(const index of indices){
  const sample=data.frames[index],frame=index*30/data.fps,worlds=sourceWorld(sample),root=new Vector3(...sample.translation).sub(origin).applyMatrix3(basisLinear),desired=new Map(),resolved=new Map();minimum.min(root);maximum.max(root);
  for(const [bone,source] of selected){const q=new Quaternion().setFromRotationMatrix(basis.clone().multiply(new Matrix4().makeRotationFromQuaternion(worlds[source])).multiply(inverseBasis));desired.set(bone,q.multiply(sourceAlignment[bone.name]??new Quaternion()).multiply(bone.userData.rest.worldQuaternion));}
  const worldFor=bone=>{if(resolved.has(bone))return resolved.get(bone);let q=desired.get(bone);if(!q){if(bodySet.has(bone.parent))q=worldFor(bone.parent).clone().multiply(bone.userData.rest.quaternion);else q=bone.userData.rest.worldQuaternion.clone();}resolved.set(bone,q);return q;};
  const deltas=new Map();
  for(const bone of mapped){
   const r=bone.userData.rest,world=worldFor(bone),parentQ=bodySet.has(bone.parent)?worldFor(bone.parent):r.worldQuaternion.clone().multiply(r.quaternion.clone().invert());
   const q=parentQ.clone().invert().multiply(world).normalize(),key=bone.userData.key??`body/${bone.name}`,last=previous.get(key);if(last&&q.dot(last)<0)q.set(-q.x,-q.y,-q.z,-q.w);previous.set(key,q.clone());
   const position=r.position.clone();if(bone===hips)position.add(root.clone().applyMatrix3(parentLinear));
   (edits.bones[key]??=[]).push({frame,position:position.toArray(),quaternion:q.toArray(),curve:[20,20,107,107]});
   const delta=world.clone().multiply(r.worldQuaternion.clone().invert()).multiply(alignment[bone.name]?.clone().invert()??new Quaternion());deltas.set(rig.mapping[bone.name],delta);
  }
  for(const bone of mapped){const name=rig.mapping[bone.name];let parent=MMD_PARENT[name];while(parent&&!deltas.has(parent))parent=MMD_PARENT[parent];const q=(deltas.get(parent)?.clone().invert()??new Quaternion()).multiply(deltas.get(name));appendVMD(name,{frame:Math.round(frame),position:[0,0,0],quaternion:[q.x,-q.y,-q.z,q.w],interpolation:linearInterpolation()},frame);}
  appendVMD('センター',{frame:Math.round(frame),position:[-root.x/vmdScale,root.y/vmdScale,root.z/vmdScale],quaternion:[0,0,0,1],interpolation:linearInterpolation()},frame);
 }
 const duration=(data.frames.length-1)*30/data.fps;motion.name=vmd.name=options.name??'SMPL24 动作';motion.duration=duration;vmd.duration=Math.round(duration);
 // Existing captured-root handling moves hips-local travel to the common root,
 // so placement controls and attachments follow the same character trajectory.
 motion.capture={rootSpace:'hips-local',source:'smpl24',fps:data.fps,coordinateSystem:data.coordinateSystem};
 const warnings=['SMPL24 不包含表情、独立手指、头发或布料轨道；碰撞与布料需另行解算。'];
 if(!rig.human.UpperChest)warnings.push('目标只有两节躯干：SMPL spine/chest 的累计旋转合并到 Chest。');
 if(rig.missing.length)warnings.push(`目标缺少关节：${rig.missing.join('、')}`);
 if(data.fps>30)warnings.push('VMD 固定 30 帧；已重采样到整数帧，原生轨道保留源时间。');
 return {motion,edits,vmd,diagnostics:{...data.diagnostics,nativeTracks:Object.keys(edits.bones).length,sourceJoints:24,mappedJoints:selected.size,rootMode,restPose,sourceRootOrigin:origin.toArray(),rootRangeMeters:maximum.sub(minimum).toArray(),warnings}};
}

/** FACT packing utility used by callers preparing a separately licensed model. */
export function packFACTMotion(input,{padded=false,...options}={}){
 const data=parseSMPLMotion(input,options);return data.frames.map(frame=>[...(padded?[0,0,0,0,0,0]:[]),...frame.translation,...frame.quaternions.flatMap(a=>rotationArray(new Quaternion().fromArray(a)))]);
}
