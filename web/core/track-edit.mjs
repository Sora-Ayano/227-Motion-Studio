import {Quaternion,Euler,Vector3} from 'three';
import {sampleGameTrack} from './game-motion.mjs';

// Bake one native channel on demand, leaving the other original channels intact.
// Editing/deleting any key then behaves exactly like an ordinary editable track.
export function nativeBoneKeys(doc,bone,bodyScale=1){
 const part=doc.parts[bone.userData.family==='face'?'face':'body'],tracks=part.tracks.filter(t=>t.name===bone.name&&t.kind!=='morph');
 if(!tracks.length)return [];
 const rest=bone.userData.rest,origin=part.tracks.find(t=>t.name==='BodyPelvis'&&t.kind==='position'),start=origin?sampleGameTrack(part,origin,0):[0,0,0],keys=[];
 for(let frame=0;frame<part.frames;frame++){
  const key={frame,position:rest.position.toArray(),quaternion:rest.quaternion.toArray(),scale:rest.scale.toArray(),curve:[20,20,107,107]};
  for(const t of tracks){const v=sampleGameTrack(part,t,frame);if(t.kind==='position'){key.position=v;if(bone.name==='BodyPelvis'){key.position[0]=(key.position[0]-start[0])/bodyScale;key.position[2]=(key.position[2]-start[2])/bodyScale;}}else if(t.kind==='quaternion')key.quaternion=v.toArray();else if(t.kind==='euler')key.quaternion=new Quaternion().setFromEuler(new Euler(-v[0]*Math.PI/180,-v[1]*Math.PI/180,v[2]*Math.PI/180,'ZXY')).toArray();else if(t.kind==='scale'){const source=part.rest[t.name]?.scale;if(source)key.scale=new Vector3().fromArray(v).divide(new Vector3().fromArray(source)).multiply(rest.scale).toArray();}}
  keys.push(key);
 }
 return keys;
}
export function nativeMorphKeys(doc,morph){const part=doc.parts.face,tracks=part.tracks.filter(t=>t.kind==='morph'&&(morph.name===t.name||morph.name.endsWith(t.name.split('.').at(-1))));if(!tracks.length)return [];return Array.from({length:part.frames},(_,frame)=>({frame,weight:Math.max(0,...tracks.map(t=>sampleGameTrack(part,t,frame)[0]/100))}));}
export function moveKey(keys,key,frame){if(!Number.isFinite(frame))throw new Error('关键帧位置无效');key.frame=Math.max(0,Math.round(frame));const duplicate=keys.find(k=>k!==key&&k.frame===key.frame);if(duplicate)keys.splice(keys.indexOf(duplicate),1);keys.sort((a,b)=>a.frame-b.frame);return key;}
export function clearClipTracks(clip,edits,kind){const eyes=/^(両目|[左右]目)$/;if(kind==='body'||kind==='all'){clip.bones=kind==='all'?{}:Object.fromEntries(Object.entries(clip.bones).filter(([name])=>eyes.test(name)));clip.ik=[];for(const key of Object.keys(edits.bones))if(kind==='all'||!key.startsWith('face/'))delete edits.bones[key];clip.disabledBody=true;}if(kind==='morph'||kind==='all'){clip.morphs={};edits.morphs={};for(const name of Object.keys(clip.bones))if(eyes.test(name))delete clip.bones[name];for(const key of Object.keys(edits.bones))if(key.startsWith('face/'))delete edits.bones[key];clip.disabledFace=true;}}
