import * as T from 'three';
import {sampleCamera,bracket,bezier} from './vmd.mjs';
import {sampleGameTrack} from './game-motion.mjs';
const cache=new Map(),hierarchies=new WeakMap();
export async function loadGameCamera(id){
 if(cache.has(id))return cache.get(id);if(!/^\d{8}$/.test(id))throw new Error('镜头编号无效');
 const r=await fetch('/game-cameras/'+id+'.json');if(!r.ok)throw new Error('原游戏镜头不存在');const doc=await r.json();
 const channels=await fetch('/game-cameras/'+doc.file);if(!channels.ok)throw new Error('镜头通道读取失败');doc.data=new Float32Array(await new Response(channels.body.pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
 if(doc.data.length!==doc.frames*doc.stride)throw new Error('镜头通道尺寸异常');cache.set(id,doc);return doc;
}
export function focalFov(length,height=24){return 2*Math.atan(height/(2*Math.max(.01,length)))*180/Math.PI;}
export function unityGateFov(length,lens,aspect=16/9){const height=lens.sensorHeight||24,sensorAspect=(lens.sensorWidth||36)/height,mode=lens.gateFit??1;let effective=height;if(mode===2)effective=height*sensorAspect/aspect;else if(mode===3)effective=height*Math.min(1,sensorAspect/aspect);else if(mode===4)effective=height*Math.max(1,sensorAspect/aspect);return focalFov(length,effective);}
export function fitDistance(size,aspect,fov=35){const tangent=Math.tan(fov*Math.PI/360);return Math.max(.3,Math.max(size.y,size.x/Math.max(.05,aspect))/(2*tangent)*1.15+size.z/2);}
export function gameCameraFrame(doc,frame){const latch=doc.tracks.find(t=>doc.nodes[t.node].name==='Latch'&&t.kind==='position');if(!latch)return frame;let f=Math.min(doc.frames-1,Math.max(0,Math.floor(frame)));if(sampleGameTrack(doc,latch,f)[0]>=-1e-5)return frame;while(f>0&&sampleGameTrack(doc,latch,f)[0]<-1e-5)f--;return f;}
export function gameCameraScale(doc,frame,scales={}){const active=[];for(let slot=1;slot<=5;slot++){const t=doc.tracks.find(t=>doc.nodes[t.node].name==='Ch0'+slot&&t.kind==='position');if(t&&sampleGameTrack(doc,t,frame)[0]<-1e-5)active.push(scales[slot]||1);}return active.length?active.reduce((a,b)=>a+b,0)/active.length:1;}
export function sampleUnityCamera(doc,frame,aspect=16/9,scales={}){frame=gameCameraFrame(doc,frame);
 let h=hierarchies.get(doc);if(!h){const root=new T.Group(),nodes=doc.nodes.map(n=>{const o=new T.Group();o.position.fromArray(n.position);o.quaternion.fromArray(n.quaternion);o.scale.fromArray(n.scale);return o;});nodes.forEach((n,i)=>(doc.nodes[i].parent<0?root:nodes[doc.nodes[i].parent]).add(n));h={root,nodes};hierarchies.set(doc,h);}
 let focal=doc.lens.focalLength;const floor=Math.floor(Math.max(0,Math.min(doc.frames-1,frame)));let sampleFrame=frame;if(frame>floor&&floor<doc.frames-1)for(const track of doc.tracks){if(!['position','quaternion'].includes(track.kind))continue;const a=sampleGameTrack(doc,track,floor),b=sampleGameTrack(doc,track,floor+1),jump=track.kind==='quaternion'?a.angleTo(b)>.6:Math.hypot(...a.map((v,i)=>v-b[i]))>.7;if(jump){sampleFrame=floor;break;}}
 for(const track of doc.tracks){const value=sampleGameTrack(doc,track,sampleFrame),node=h.nodes[track.node];if(track.kind==='position')node.position.fromArray(value);else if(track.kind==='quaternion')node.quaternion.copy(value);else if(track.kind==='scale')node.scale.fromArray(value);else if(track.kind==='focalLength')focal=value[0];else if(track.kind==='euler')node.quaternion.setFromEuler(new T.Euler(-value[0]*Math.PI/180,-value[1]*Math.PI/180,value[2]*Math.PI/180,'ZXY'));}
 h.root.updateMatrixWorld(true);const node=h.nodes[doc.cameraNode];return {position:node.getWorldPosition(new T.Vector3()).multiplyScalar(gameCameraScale(doc,sampleFrame,scales)),quaternion:node.getWorldQuaternion(new T.Quaternion()),fov:unityGateFov(focal,doc.lens,aspect),near:doc.lens.near,far:doc.lens.far,orthographic:doc.lens.orthographic,orthographicSize:doc.lens.orthographicSize};
}
export function mmdCameraPose(keys,frame,scale=.08){
 const c=sampleCamera(keys,frame);if(!c)return null;
 // VMD angles use XYZ; reflect X just as the character retargeter does.
 const pair=bracket(keys,frame),[a,b,t]=pair,cut=b.cut&&frame<b.frame||b.frame-a.frame===1&&frame<b.frame,ease=bezier(t,b.interpolation?.length===24?[b.interpolation[12],b.interpolation[14],b.interpolation[13],b.interpolation[15]]:[20,20,107,107]),convert=k=>new T.Quaternion().setFromEuler(new T.Euler(-k.rotation[0],k.rotation[1],k.rotation[2],'XYZ')),q=convert(a).slerp(convert(b),cut?0:ease);if(cut){c.position=a.position;c.distance=a.distance;c.fov=a.fov;}
 const target=new T.Vector3(-c.position[0],c.position[1],c.position[2]).multiplyScalar(scale),position=new T.Vector3(0,0,c.distance*scale).applyQuaternion(q).add(target);
 const camera=new T.PerspectiveCamera();camera.position.copy(position);camera.up.set(0,1,0).applyQuaternion(q);camera.lookAt(target);
 const perspective=pair?.[0]?.perspective??0;
 return {position,quaternion:camera.quaternion.clone(),target,fov:c.fov,orthographic:perspective===1,orthographicSize:Math.max(.01,Math.abs(c.distance*scale)*Math.tan(c.fov*Math.PI/360))};
}
export function validateCameraTrack(doc){
 if(doc?.format==='mmd-camera'&&Array.isArray(doc.keys)&&doc.keys.length){for(const k of doc.keys)if(k.position?.length!==3||k.rotation?.length!==3||![k.frame,k.distance,k.fov,...k.position,...k.rotation].every(Number.isFinite)||k.frame<0||k.fov<=0||k.fov>=180)throw new Error('MMD 镜头关键帧无效');doc.keys.sort((a,b)=>a.frame-b.frame);return doc;}
 if(doc?.format!=='nananiji-camera'||!Array.isArray(doc.keys)||!doc.keys.length)throw new Error('请选择相机 VMD 或 nananiji-camera JSON');
 if(doc.keys.length>1000000)throw new Error('相机关键帧过多');for(const k of doc.keys){if(![k.frame,k.fov,...(k.position||[]),...(k.quaternion||[])].every(Number.isFinite)||k.position?.length!==3||k.quaternion?.length!==4||k.frame<0||k.fov<=0||k.fov>=180||Math.hypot(...k.quaternion)<1e-8)throw new Error('Unity 相机关键帧无效');k.quaternion=new T.Quaternion().fromArray(k.quaternion).normalize().toArray();}doc.keys.sort((a,b)=>a.frame-b.frame);return doc;
}
export function sampleCameraTrack(track,frame,scale=.08,aspect=16/9,characterScales={}){
 if(track?.format==='mmd-camera')return mmdCameraPose(track.keys,frame,scale);
 if(track?.format==='nananiji-unity-camera')return sampleUnityCamera(track,frame,aspect,characterScales);
 if(track?.format!=='nananiji-camera')return null;
 const pair=bracket(track.keys,frame);if(!pair)return null;const [a,b,t]=pair,cut=b.cut===true&&frame<b.frame,weight=cut?0:t;
 const position=new T.Vector3().fromArray(a.position).lerp(new T.Vector3().fromArray(b.position),weight),quaternion=new T.Quaternion().fromArray(a.quaternion).slerp(new T.Quaternion().fromArray(b.quaternion),weight);
 if(track.coordinates!=='three'){position.z*=-1;quaternion.set(-quaternion.x,-quaternion.y,quaternion.z,quaternion.w);}
 return {position,quaternion,fov:a.fov+(b.fov-a.fov)*weight,near:a.near??.01,far:a.far??200,orthographic:!!a.orthographic,orthographicSize:a.orthographicSize??2};
}
