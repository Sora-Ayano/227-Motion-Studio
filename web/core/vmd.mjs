import { Quaternion } from 'three';
const decoder=new TextDecoder('shift-jis');
const LINEAR=[20,20,107,107];
export function parseVMD(buffer,name='motion.vmd'){
 const bytes=new Uint8Array(buffer), view=new DataView(buffer);let p=0;
 const ensure=n=>{if(p+n>bytes.length)throw new Error(`VMD 文件不完整（字节 ${p}）`);};
 const str=n=>{ensure(n);const v=decoder.decode(bytes.subarray(p,p+n).slice(0,bytes.subarray(p,p+n).indexOf(0)<0?n:bytes.subarray(p,p+n).indexOf(0)));p+=n;return v;};
 const u8=()=>{ensure(1);return view.getUint8(p++);};
 const u32=()=>{ensure(4);const v=view.getUint32(p,true);p+=4;return v;};
 const f32=()=>{ensure(4);const v=view.getFloat32(p,true);p+=4;if(!Number.isFinite(v))throw new Error('VMD 含无效数值');return v;};
 const count=size=>{const n=u32();if(n>1000000||n*size>bytes.length-p)throw new Error('VMD 记录数量与文件长度不符');return n;};
 const header=str(30);if(!header.startsWith('Vocaloid Motion Data'))throw new Error('不是有效的 VMD 动作文件');
 const model=str(header.includes('0002')?20:10);
 const clip={version:1,name,model,bones:{},morphs:{},cameras:[],lights:[],shadows:[],ik:[],duration:0};
 const add=(dict,k,v)=>{(dict[k]??=[]).push(v);clip.duration=Math.max(clip.duration,v.frame);};
 for(let n=count(111);n--;){const bone=str(15),frame=u32(),position=[f32(),f32(),f32()],quaternion=[f32(),f32(),f32(),f32()];ensure(64);const interpolation=Array.from(bytes.subarray(p,p+64));p+=64;
  const q=new Quaternion().fromArray(quaternion);if(q.lengthSq()<1e-12)q.identity();else q.normalize();add(clip.bones,bone,{frame,position,quaternion:q.toArray(),interpolation});}
 if(p<bytes.length)for(let n=count(23);n--;){const morph=str(15),frame=u32(),weight=f32();add(clip.morphs,morph,{frame,weight});}
 if(p<bytes.length)for(let n=count(61);n--;){const frame=u32(),distance=f32(),position=[f32(),f32(),f32()],rotation=[f32(),f32(),f32()];ensure(24);const interpolation=Array.from(bytes.subarray(p,p+24));p+=24;const fov=u32(),perspective=u8();clip.cameras.push({frame,distance,position,rotation,interpolation,fov,perspective});clip.duration=Math.max(clip.duration,frame);}
 if(p<bytes.length)for(let n=count(28);n--;){clip.lights.push({frame:u32(),color:[f32(),f32(),f32()],position:[f32(),f32(),f32()]});}
 if(p<bytes.length)for(let n=count(9);n--;){clip.shadows.push({frame:u32(),mode:u8(),distance:f32()});}
 if(p<bytes.length)for(let n=count(9);n--;){const frame=u32(),visible=u8(),items=[];for(let j=count(21);j--;)items.push({name:str(20),enabled:u8()});clip.ik.push({frame,visible,items});clip.duration=Math.max(clip.duration,frame);}
 for(const list of [...Object.values(clip.bones),...Object.values(clip.morphs),clip.cameras,clip.lights,clip.shadows,clip.ik]){
  list.sort((a,b)=>a.frame-b.frame);for(let i=list.length-2;i>=0;i--)if(list[i].frame===list[i+1].frame)list.splice(i,1);
 }
 return clip;
}
export function bracket(keys,frame){
 if(!keys?.length)return null;
 if(frame<=keys[0].frame)return [keys[0],keys[0],0];
 if(frame>=keys.at(-1).frame)return [keys.at(-1),keys.at(-1),0];
 let lo=0,hi=keys.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(keys[mid].frame<=frame)lo=mid;else hi=mid;}
 return [keys[lo],keys[hi],(frame-keys[lo].frame)/(keys[hi].frame-keys[lo].frame)];
}
export function bezier(t,curve=LINEAR){
 const [x1,y1,x2,y2]=curve.map(v=>v/127), cubic=(s,a,b)=>3*(1-s)**2*s*a+3*(1-s)*s*s*b+s*s*s;
 let lo=0,hi=1;for(let i=0;i<16;i++){const mid=(lo+hi)*.5;if(cubic(mid,x1,x2)<t)lo=mid;else hi=mid;}return t===0?0:t===1?1:cubic((lo+hi)*.5,y1,y2);
}
export function sampleBone(keys,frame){
 const pair=bracket(keys,frame);if(!pair)return {position:[0,0,0],quaternion:[0,0,0,1]};
 const [a,b,t]=pair;const position=a.position.map((v,i)=>{const c=b.interpolation||[];return v+(b.position[i]-v)*bezier(t,c.length>=16?[c[i],c[i+4],c[i+8],c[i+12]]:LINEAR);});
 const c=b.interpolation||[],q=new Quaternion().fromArray(a.quaternion).slerp(new Quaternion().fromArray(b.quaternion),bezier(t,c.length>=16?[c[3],c[7],c[11],c[15]]:LINEAR));
 return {position,quaternion:q.toArray()};
}
export function sampleMorph(keys,frame){const p=bracket(keys,frame);return p?p[0].weight+(p[1].weight-p[0].weight)*p[2]:0;}
export function sampleCamera(keys,frame){const p=bracket(keys,frame);if(!p)return null;const [a,b,t]=p;
 const ease=i=>bezier(t,b.interpolation?.length===24?[b.interpolation[i*4],b.interpolation[i*4+2],b.interpolation[i*4+1],b.interpolation[i*4+3]]:LINEAR);
 return {position:a.position.map((v,i)=>v+(b.position[i]-v)*ease(i)),rotation:a.rotation.map((v,i)=>v+(b.rotation[i]-v)*ease(3)),distance:a.distance+(b.distance-a.distance)*ease(4),fov:a.fov+(b.fov-a.fov)*ease(5),perspective:a.perspective};
}
let encoding;
function encodeSJIS(str,size){
 if(!encoding){encoding=new Map();for(let i=0;i<256;i++){const s=decoder.decode(Uint8Array.of(i));if(s!=='�')encoding.set(s,[i]);}
  for(let a=0x81;a<=0xfc;a++){if(a>0x9f&&a<0xe0)continue;for(let b=0x40;b<=0xfc;b++){if(b===0x7f)continue;const s=decoder.decode(Uint8Array.of(a,b));if(s.length===1&&s!=='�'&&!encoding.has(s))encoding.set(s,[a,b]);}}
 }
 const out=new Uint8Array(size);let p=0;for(const ch of str){const v=encoding.get(ch)||[63];if(p+v.length>size)break;out.set(v,p);p+=v.length;}return out;
}
export function linearInterpolation(){const out=new Array(64).fill(0);for(let i=0;i<4;i++){out[i]=20;out[i+4]=20;out[i+8]=107;out[i+12]=107;}for(let i=16;i<64;i++)out[i]=out[i%16];return out;}
export function writeVMD(clip){
 const boneRecords=Object.entries(clip.bones).flatMap(([name,keys])=>keys.map(k=>({name,...k}))), morphRecords=Object.entries(clip.morphs).flatMap(([name,keys])=>keys.map(k=>({name,...k})));
 const size=50+4+boneRecords.length*111+4+morphRecords.length*23+4+(clip.cameras?.length||0)*61+4+(clip.lights?.length||0)*28+4+(clip.shadows?.length||0)*9+4+(clip.ik||[]).reduce((s,k)=>s+9+k.items.length*21,0);
 const buffer=new ArrayBuffer(size),out=new Uint8Array(buffer),v=new DataView(buffer);let p=0;
 const text=(s,n)=>{out.set(encodeSJIS(s,n),p);p+=n;};const u8=n=>{v.setUint8(p++,n);};const u32=n=>{v.setUint32(p,n,true);p+=4;};const f32=n=>{v.setFloat32(p,n,true);p+=4;};const arr=a=>a.forEach(f32);
 text('Vocaloid Motion Data 0002',30);text(clip.model||'22/7 Unity',20);
 u32(boneRecords.length);for(const k of boneRecords){text(k.name,15);u32(k.frame);arr(k.position);arr(k.quaternion);out.set(k.interpolation||linearInterpolation(),p);p+=64;}
 u32(morphRecords.length);for(const k of morphRecords){text(k.name,15);u32(k.frame);f32(k.weight);}
 u32(clip.cameras?.length||0);for(const k of clip.cameras||[]){u32(k.frame);f32(k.distance);arr(k.position);arr(k.rotation);out.set(k.interpolation,p);p+=24;u32(k.fov);u8(k.perspective);}
 u32(clip.lights?.length||0);for(const k of clip.lights||[]){u32(k.frame);arr(k.color);arr(k.position);}
 u32(clip.shadows?.length||0);for(const k of clip.shadows||[]){u32(k.frame);u8(k.mode);f32(k.distance);}
 u32(clip.ik?.length||0);for(const k of clip.ik||[]){u32(k.frame);u8(k.visible);u32(k.items.length);for(const i of k.items){text(i.name,20);u8(i.enabled);}}
 return buffer;
}
export function emptyClip(){return {version:1,name:'新建动作',model:'22/7 Unity',duration:300,bones:{},morphs:{},cameras:[],lights:[],shadows:[],ik:[]};}
