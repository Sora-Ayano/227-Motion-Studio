import {Quaternion,Vector3,Euler} from 'three';
const cache=new Map();
// Keep a complete five-person song in memory. Retargeters also retain their
// active document, so browsing another song cannot evict a playing actor.
function remember(doc){cache.delete(doc.id);cache.set(doc.id,doc);while(cache.size>20)cache.delete(cache.keys().next().value);}
export async function loadGameMotion(id){
 if(!/^\d{8}-[1-5]$/.test(id))throw new Error('游戏动作编号无效');if(cache.has(id))return cache.get(id);
 const response=await fetch('/game-motions/'+id+'.json');if(!response.ok)throw new Error('原游戏舞蹈资源不存在');const doc=await response.json();
 for(const part of ['body','face']){const r=await fetch('/game-motions/'+doc.files[part]);if(!r.ok)throw new Error('游戏动画通道读取失败');const buffer=await new Response(r.body.pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();const data=new Float32Array(buffer),info=doc.parts[part];if(data.length!==info.frames*info.stride)throw new Error('游戏动作帧数与通道不符');info.data=data;}
 remember(doc);return doc;
}
export function getGameMotion(id){return cache.get(id);}
export function registerGameMotion(doc){remember(doc);}
export function sampleGameTrack(part,track,frame){const f=Math.max(0,Math.min(part.frames-1,frame)),a=Math.floor(f),b=Math.min(a+1,part.frames-1),t=f-a,offset=track.offset,p=a*part.stride+offset,q=b*part.stride+offset;
 if(track.kind==='quaternion'){const x=new Quaternion(-part.data[p],-part.data[p+1],part.data[p+2],part.data[p+3]).normalize(),y=new Quaternion(-part.data[q],-part.data[q+1],part.data[q+2],part.data[q+3]).normalize();return x.slerp(y,t);}
 const values=Array.from({length:track.size},(_,i)=>part.data[p+i]+(part.data[q+i]-part.data[p+i])*t);if(track.kind==='position')values[2]*=-1;return values;
}
export function applyGameBones(model,doc,frame,partName='body',overrides={}){
 const part=doc.parts[partName],bones=partName==='body'?model.bodyBones:model.bones.filter(b=>b.userData.family==='face'),byName=new Map(bones.map(b=>[b.name,b]));
 for(const track of part.tracks){const bone=byName.get(track.name);if(!bone||track.kind==='morph'||Object.hasOwn(overrides,bone.userData.key))continue;const sample=sampleGameTrack(part,track,frame),sourceRest=part.rest[track.name],rest=bone.userData.rest;
  // These FBX transforms are the first animated pose, not a T-pose. The game
  // uses the same local bone axes as our native meshes; copying absolute keys
  // retains the authored pose instead of cancelling its first frame.
  if(track.kind==='quaternion')bone.quaternion.copy(sample);
  if(track.kind==='position'){bone.position.fromArray(sample);if(track.name==='BodyPelvis'){const start=part.tracks.find(t=>t.name==='BodyPelvis'&&t.kind==='position');const p=sampleGameTrack(part,start,0);const scale=model.profile?.bodyScale||1;bone.position.x=(bone.position.x-p[0])/scale;bone.position.z=(bone.position.z-p[2])/scale;}}
  if(track.kind==='euler')bone.quaternion.setFromEuler(new Euler(-sample[0]*Math.PI/180,-sample[1]*Math.PI/180,sample[2]*Math.PI/180,'ZXY'));
  // Source FBX scale curves contain its centimetre import scale (100). Keep
  // the target's native units and transfer scale only as a relative ratio.
  if(track.kind==='scale'&&sourceRest)bone.scale.copy(rest.scale).multiply(new Vector3().fromArray(sample).divide(new Vector3().fromArray(sourceRest.scale)));
 }
 model.motionRoot.updateMatrixWorld(true);
}
export function gameMorphValue(doc,name,frame){const part=doc.parts.face;let weight=0;for(const t of part.tracks)if(t.kind==='morph'&&(name===t.name||name.endsWith(t.name.split('.').at(-1))))weight=Math.max(weight,sampleGameTrack(part,t,frame)[0]/100);return Math.max(0,Math.min(1,weight));}

// Unity PelvisBoneAdjuster preserves horizontal stage meters under body scaling.
// Extract the resulting travel once so the entire model and transform handle follow it.
export function extractNativeRoot(model){const pelvis=model.bodyBones.find(b=>b.name==='BodyPelvis');if(!pelvis)return;const scale=model.profile?.bodyScale||1;model.motionRoot.position.x+=pelvis.position.x*scale;model.motionRoot.position.z+=pelvis.position.z*scale;pelvis.position.x=pelvis.position.z=0;model.motionRoot.updateMatrixWorld(true);}
