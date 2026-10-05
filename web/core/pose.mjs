import * as T from 'three';
import { autoMap } from './rig.mjs';
import { resetBones,setWorldQuaternion } from './retarget.mjs';
export const POSE_LINKS=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,31],[28,32],[0,7],[0,8]];
const SEGMENTS={LeftUpperArm:[11,13],LeftLowerArm:[13,15],LeftHand:[15,19],RightUpperArm:[12,14],RightLowerArm:[14,16],RightHand:[16,20],LeftUpperLeg:[23,25],LeftLowerLeg:[25,27],LeftFoot:[27,31],RightUpperLeg:[24,26],RightLowerLeg:[26,28],RightFoot:[28,32]};
const CHILD={LeftUpperArm:'LeftLowerArm',LeftLowerArm:'LeftHand',RightUpperArm:'RightLowerArm',RightLowerArm:'RightHand',LeftUpperLeg:'LeftLowerLeg',LeftLowerLeg:'LeftFoot',LeftFoot:'LeftToes',RightUpperLeg:'RightLowerLeg',RightLowerLeg:'RightFoot',RightFoot:'RightToes'};
function bodyBasis(across,up){if(across.lengthSq()<1e-8||up.lengthSq()<1e-8)return new T.Quaternion();const x=across.normalize(),z=x.clone().cross(up).normalize(),y=z.clone().cross(x).normalize();return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z));}
const PAIRS=[[1,4],[2,5],[3,6],[7,8],[9,10],[11,12],[13,14],[15,16],[17,18],[19,20],[21,22],[23,24],[25,26],[27,28],[29,30],[31,32]];
export class PoseSolver{
 constructor(model,options={}){
  this.model=model;this.human=autoMap(model.bodyBones,options.mapping||{}).human;this.options={smoothing:.35,mirror:false,rootMotion:false,...options};this.last=new Map();this.firstHip=null;
  const h=this.human,at=n=>h[n]?.userData.rest.worldPosition.clone(),left=at('LeftUpperLeg'),right=at('RightUpperLeg'),hip=at('Hips'),head=at('Head');
  this.restBasis=left&&right&&hip&&head?bodyBasis(right.sub(left),head.sub(hip)):new T.Quaternion();this.height=Math.max(.1,(at('Head')?.y??1.6)-(at('LeftFoot')?.y??0));
 }
 frame(world,points,frame,facePoints=[]){
  const model=this.model,keys={};if(world.length<33)return keys;
  const previous=model.bones.map(b=>({b,p:b.position.clone(),q:b.quaternion.clone()})),root=model.motionRoot,rootP=root.position.clone(),rootQ=root.quaternion.clone(),placement=root.parent;
  try{
   root.removeFromParent();resetBones(model.bones);root.position.set(0,0,0);root.quaternion.identity();root.updateMatrixWorld(true);
   let source=world;if(this.options.mirror){source=world.slice();for(const [a,b] of PAIRS){source[a]=world[b];source[b]=world[a];}}
   const p=source.map(v=>new T.Vector3((this.options.mirror?1:-1)*v.x,-v.y,v.z)),hips=p[23].clone().add(p[24]).multiplyScalar(.5),shoulders=p[11].clone().add(p[12]).multiplyScalar(.5),spine=shoulders.clone().sub(hips).normalize();
   const delta=bodyBasis(p[24].clone().sub(p[23]),spine.clone()).multiply(this.restBasis.clone().invert());
   for(const name of ['Hips','Spine','Chest','Neck','Head']){const b=this.human[name];if(b)setWorldQuaternion(b,delta.clone().multiply(b.userData.rest.worldQuaternion));}
   if(facePoints.length>=468&&this.human.Head){const f=facePoints.map(v=>new T.Vector3((this.options.mirror?1:-1)*v.x,-v.y/(this.options.aspect||1),v.z)),across=(this.options.mirror?f[263].clone().sub(f[33]):f[33].clone().sub(f[263])),q=bodyBasis(across,f[10].clone().sub(f[152])).multiply(this.restBasis.clone().invert());setWorldQuaternion(this.human.Head,q.multiply(this.human.Head.userData.rest.worldQuaternion));}
   for(const [name,[a,z]] of Object.entries(SEGMENTS)){
    const b=this.human[name],c=this.human[CHILD[name]];if(!b||!c||[a,z].some(i=>(source[i].visibility??1)<.6))continue;
    const rest=c.userData.rest.worldPosition.clone().sub(b.userData.rest.worldPosition),dir=p[z].clone().sub(p[a]);if(rest.lengthSq()<1e-8||dir.lengthSq()<1e-8)continue;
    // Retain the target's local axes and inherited roll without changing bind poses or limb lengths.
    const inherited=b.getWorldQuaternion(new T.Quaternion()),localAxis=rest.applyQuaternion(b.userData.rest.worldQuaternion.clone().invert()).normalize(),currentAxis=localAxis.applyQuaternion(inherited);
    setWorldQuaternion(b,new T.Quaternion().setFromUnitVectors(currentAxis,dir.normalize()).multiply(inherited));
   }
   const tracked=new Set([...Object.keys(SEGMENTS),'Hips','Spine','Chest','Neck','Head']);
   for(const name of tracked){const b=this.human[name];if(!b)continue;const last=this.last.get(name),indices=SEGMENTS[name],visible=(indices||[11,12,23,24]).every(i=>(source[i].visibility??1)>.6);let q=b.quaternion.clone();if(last)q=visible?last.clone().slerp(q,1-this.options.smoothing):last.clone();this.last.set(name,q.clone());keys[b.userData.key]={frame,position:b.userData.rest.position.toArray(),quaternion:q.toArray(),curve:[20,20,107,107]};}
   if(this.options.rootMotion&&this.human.Hips&&points.length>=33){const h={x:(points[23].x+points[24].x)/2,y:(points[23].y+points[24].y)/2};this.firstHip??={...h,height:Math.max(.15,Math.abs((points[27].y+points[28].y)/2-points[0].y))};const key=keys[this.human.Hips.userData.key],scale=this.height/this.firstHip.height;key.position[0]+=(h.x-this.firstHip.x)*scale*(this.options.mirror?1:-1);key.position[1]+=(this.firstHip.y-h.y)*scale;}
   return keys;
  }finally{for(const {b,p,q} of previous){b.position.copy(p);b.quaternion.copy(q);}root.position.copy(rootP);root.quaternion.copy(rootQ);placement?.add(root);root.updateWorldMatrix(true,true);}
 }
}
export class LocalPoseDetector{
 constructor(options={}){this.worker=new Worker('/core/pose-worker.mjs',{type:'module'});this.pending=new Map();this.id=0;this.ready=new Promise((resolve,reject)=>{this.rejectReady=reject;this.worker.onmessage=({data})=>{if(data.type==='ready'){this.info=data;resolve(data);}else if(data.type==='error'){if(data.id)this.pending.get(data.id)?.reject(new Error(data.error));else reject(new Error(data.error));this.pending.delete(data.id);}else if(data.type==='result'){this.pending.get(data.id)?.resolve(data);this.pending.delete(data.id);}};this.worker.onerror=e=>{reject(new Error(e.message||'姿态工作线程初始化失败'));for(const p of this.pending.values())p.reject(new Error(e.message));this.pending.clear();};});this.worker.postMessage({type:'init',options});}
 async detect(video,time){await this.ready;const bitmap=await createImageBitmap(video),id=++this.id;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.worker.postMessage({type:'frame',id,timestamp:time*1000,bitmap},[bitmap]);});}
 dispose(){this.rejectReady?.(new Error('已停止提取'));this.worker.terminate();for(const p of this.pending.values())p.reject(new Error('已停止提取'));this.pending.clear();}
}
export function drawPose(canvas,points,facePoints=[]){const x=canvas.getContext('2d');x.clearRect(0,0,canvas.width,canvas.height);if(!points?.length&&!facePoints.length)return;x.strokeStyle='#c5ffbc';x.fillStyle='#b2a0ff';x.lineWidth=3;for(const [a,b] of points?.length?POSE_LINKS:[]){if((points[a].visibility??1)<.45||(points[b].visibility??1)<.45)continue;x.beginPath();x.moveTo(points[a].x*canvas.width,points[a].y*canvas.height);x.lineTo(points[b].x*canvas.width,points[b].y*canvas.height);x.stroke();}for(const p of points||[]){if((p.visibility??1)<.45)continue;x.beginPath();x.arc(p.x*canvas.width,p.y*canvas.height,4,0,Math.PI*2);x.fill();}x.fillStyle='#ffdda8';for(const p of facePoints){x.beginPath();x.arc(p.x*canvas.width,p.y*canvas.height,1.3,0,Math.PI*2);x.fill();}}
