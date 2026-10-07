import {Vector3} from 'three';import {unzlibSync} from 'fflate';
import {writeSurface} from './cloth-surface.mjs';
export function clothPoseSignature(clip,edits,settings,calibration={}){
 const text=JSON.stringify(['cloth-full-garment-3',clip,edits,settings,calibration.mapping,calibration.sourcePositions]);let hash=2166136261;
 for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);return text.length+':'+(hash>>>0).toString(16);
}
export function attachClothBake(model,data,clip){
 if(data.format!=='studio-cloth-cache'||data.version!==1||!Number.isInteger(data.frames)||data.frames<2||data.frames>451||![15,30,60].includes(data.fps)||!Number.isFinite(data.startFrame)||data.startFrame<0||!Array.isArray(data.surfaces)||!data.surfaces.length||data.surfaces.length>12)throw new Error('布料缓存格式无效');
 const surfaces=[];
 for(const source of data.surfaces){const mesh=model.meshes.find(m=>m.name===source.name),sim=mesh?.userData.clothSurface;
 if(!sim||sim.particles.length!==source.particles||source.particles>16000)throw new Error('缓存与当前服装网格不匹配，请重新烘焙');
  const bytes=Uint8Array.from(atob(source.data),c=>c.charCodeAt(0)),raw=unzlibSync(bytes,{out:new Uint8Array(data.frames*source.particles*12)});
  if(raw.length!==data.frames*source.particles*12)throw new Error('缓存数据长度无效');const positions=new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4);
  if(!positions.every(Number.isFinite))throw new Error('缓存含无效顶点');surfaces.push({mesh,sim,positions});
 }
 model.clothBake={...data,surfaces,clip};
}
export function applyClothBake(model,frame,clip){
 const cache=model.clothBake;if(!cache||cache.clip!==clip)return false;const t=(frame-cache.startFrame)*cache.fps/30;
 if(t<0||t>cache.frames-1)return false;const a=Math.floor(t),b=Math.min(a+1,cache.frames-1),fraction=t-a,point=new Vector3(),next=new Vector3();
 model.motionRoot.parent?.updateWorldMatrix(true,false);const transform=model.motionRoot.parent?.matrixWorld;
 for(const {mesh,sim,positions}of cache.surfaces){const size=sim.particles.length*3;for(let i=0;i<sim.particles.length;i++){
  point.fromArray(positions,a*size+i*3).lerp(next.fromArray(positions,b*size+i*3),fraction);if(transform)point.applyMatrix4(transform);sim.particles[i].x.copy(point);
 }writeSurface(mesh,sim,{advance:false,dt:1/cache.fps,friction:0});}
 return true;
}
