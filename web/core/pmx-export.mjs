import {buildPMXPhysics} from './pmx-physics.mjs';
import * as T from 'three';
import { zipSync } from 'fflate';
import { MMD_PARENT } from './rig.mjs';
import { pmxMaterialFlags,pmxUV } from './materials.mjs';
export class PMXWriter{
 constructor(){this.chunks=[];this.size=0;this.encoder=new TextEncoder();}
 bytes(b){this.chunks.push(b);this.size+=b.length;}
 number(method,n,size){const b=new Uint8Array(size);new DataView(b.buffer)[method](0,n,true);this.bytes(b);}
 u8(n){this.number('setUint8',n,1);}u16(n){this.number('setUint16',n,2);}i32(n){this.number('setInt32',n,4);}f(n){this.number('setFloat32',n,4);}
 vec(a){for(const n of a)this.f(n);}
 text(s){s=s||'';const b=new Uint8Array(s.length*2),view=new DataView(b.buffer);for(let i=0;i<s.length;i++)view.setUint16(i*2,s.charCodeAt(i),true);this.i32(b.length);this.bytes(b);}
 finish(){const b=new Uint8Array(this.size);let offset=0;for(const c of this.chunks){b.set(c,offset);offset+=c.length;}return b;}
}
export function encodePMX(data){const w=new PMXWriter();w.bytes(new TextEncoder().encode('PMX '));w.f(2);w.u8(8);w.bytes(new Uint8Array([0,0,4,4,4,4,4,4]));w.text(data.name);w.text(data.name);w.text('22/7 Studio · Unity 原生蒙皮转换 · A 姿势校准\n服装骨骼保留，包含基础 MMD 接触刚体和弹簧关节。');w.text('Converted from the original Unity rig; original weights retained.');
 w.i32(data.vertices.length);for(const v of data.vertices){w.vec(v.position);w.vec(v.normal);w.vec(v.uv);w.u8(2);for(const i of v.bones)w.i32(i);w.vec(v.weights);w.f(1);}
 w.i32(data.indices.length);for(const i of data.indices)w.i32(i);w.i32(data.textures.length);for(const t of data.textures)w.text(t);
 w.i32(data.materials.length);for(const m of data.materials){w.text(m.name);w.text(m.name);w.vec(m.color);w.vec([0,0,0]);w.f(1);w.vec([.45,.45,.45]);w.u8(m.flags??0);w.vec([0,0,0,1]);w.f(0);w.i32(m.texture);w.i32(-1);w.u8(0);w.u8(1);w.u8(0);w.text('');w.i32(m.count);}
 w.i32(data.bones.length);for(const b of data.bones){w.text(b.name);w.text(b.original||b.name);w.vec(b.position);w.i32(b.parent);w.i32(b.ik?1:0);w.u16(2|4|8|16|(b.ik?32:0));w.vec([0,1,0]);if(b.ik){w.i32(b.ik.target);w.i32(40);w.f(.5);w.i32(b.ik.links.length);for(const l of b.ik.links){w.i32(l.index);w.u8(l.knee?1:0);if(l.knee){w.vec([-Math.PI,0,0]);w.vec([-.002,0,0]);}}}}
 w.i32(data.morphs.length);for(const m of data.morphs){w.text(m.name);w.text(m.name);w.u8(4);w.u8(1);w.i32(m.deltas.length);for(const d of m.deltas){w.i32(d.index);w.vec(d.position);}}
 w.i32(2);w.text('Root');w.text('Root');w.u8(1);w.i32(1);w.u8(0);w.i32(0);w.text('表情');w.text('Expressions');w.u8(1);w.i32(data.morphs.length);for(let i=0;i<data.morphs.length;i++){w.u8(1);w.i32(i);}const physics=data.physics||{bodies:[],joints:[]};w.i32(physics.bodies.length);for(const b of physics.bodies){w.text(b.name);w.text(b.name);w.i32(b.bone);w.u8(b.group);w.u16(b.mask);w.u8(b.shape);w.vec(b.size);w.vec(b.position);w.vec(b.rotation);w.f(b.mass);w.f(b.linearDamping);w.f(b.angularDamping);w.f(b.restitution);w.f(b.friction);w.u8(b.mode);}w.i32(physics.joints.length);for(const j of physics.joints){w.text(j.name);w.text(j.name);w.u8(0);w.i32(j.bodyA);w.i32(j.bodyB);for(const k of ['position','rotation','positionMin','positionMax','rotationMin','rotationMax','springPosition','springRotation'])w.vec(j[k]);}return w.finish();}
export function buildPMXBones(model,retarget){
 const scale=1/retarget.settings.scale,world=v=>[-v.x*scale,v.y*scale,v.z*scale],bones=[],byObject=new Map(),byName=new Map();
 const add=(name,position,parent,original='')=>{if(byName.has(name))name+='_'+bones.length;const b={name,position,parent,original};byName.set(name,bones.length);bones.push(b);return bones.length-1;};
 add('全ての親',[0,0,0],-1);add('センター',[0,9,0],0);add('グルーブ',[0,9,0],1);add('腰',[0,10,0],2);
 model.motionRoot.updateMatrixWorld(true);for(const b of model.bones){const m=retarget.mapping[b.name],id=add(m||b.name,world(b.getWorldPosition(new T.Vector3())),3,b.name);byObject.set(b,id);}
 for(const b of model.bones){const id=byObject.get(b),name=bones[id].name;let p=MMD_PARENT[name];while(p&&!byName.has(p))p=MMD_PARENT[p];
  const part=model.parts.find(part=>part.family===b.userData.family);
  // A component root's Three parent is a Group, but its animated parent is
  // the body anchor. Preserve that relationship in PMX's bone-only hierarchy.
  bones[id].parent=p?byName.get(p):byObject.get(b.parent)??byObject.get(part?.anchor)??3;
 }
 for(const s of ['左','右']){const foot=byName.get(s+'足首'),knee=byName.get(s+'ひざ'),hip=byName.get(s+'足');if(foot===undefined||knee===undefined||hip===undefined)continue;const id=add(s+'足ＩＫ',bones[foot].position.slice(),0);bones[id].ik={target:foot,links:[{index:knee,knee:true},{index:hip}]};}
 return {bones,byObject,byName};
}
export async function exportPMXPackage(model,retarget,name,onProgress=()=>{}){
 const scale=1/retarget.settings.scale,world=v=>[-v.x*scale,v.y*scale,v.z*scale],{bones,byObject,byName}=buildPMXBones(model,retarget);
 const vertices=[],indices=[],materials=[],textureNames=[],images={},morphs=[],textureMap=new Map();
 async function saveTexture(map){if(!map?.image)return -1;if(textureMap.has(map))return textureMap.get(map);const id=textureNames.length,path='textures/texture_'+id+'.png',c=document.createElement('canvas');c.width=map.image.width;c.height=map.image.height;const x=c.getContext('2d');x.drawImage(map.image,0,0);const blob=await new Promise(r=>c.toBlob(r,'image/png'));if(!blob)throw new Error('材质贴图无法打包');images[path]=new Uint8Array(await blob.arrayBuffer());textureNames.push(path);textureMap.set(map,id);return id;}
 for(let mi=0;mi<model.meshes.length;mi++){const mesh=model.meshes[mi],geo=mesh.geometry,start=vertices.length;mesh.updateMatrixWorld(true);mesh.skeleton?.update();const pos=[],p=new T.Vector3();
  for(let i=0;i<geo.attributes.position.count;i++){mesh.getVertexPosition(i,p);p.applyMatrix4(mesh.matrixWorld);pos.push(...world(p));const skin=geo.attributes.skinIndex,weight=geo.attributes.skinWeight,ids=[],weights=[],part=model.parts.find(part=>{for(let p=mesh.parent;p;p=p.parent)if(p===part.group)return true;return false;});for(let j=0;j<4;j++){const b=skin&&mesh.skeleton?.bones[skin.getComponent(i,j)];ids.push(byObject.get(b)??byObject.get(part?.anchor)??byName.get('頭')??3);weights.push(weight&&mesh.skeleton?weight.getComponent(i,j):(j===0?1:0));}const uv=geo.attributes.uv;vertices.push({position:pos.slice(-3),normal:[0,1,0],uv:uv?[uv.getX(i),1-uv.getY(i)]:[0,0],bones:ids,weights});}
  const normalGeo=new T.BufferGeometry();normalGeo.setAttribute('position',new T.Float32BufferAttribute(pos,3));const sourceIndices=geo.index?Array.from(geo.index.array):Array.from({length:geo.attributes.position.count},(_,i)=>i),reversed=[];for(let i=0;i<sourceIndices.length;i+=3)reversed.push(sourceIndices[i],sourceIndices[i+2],sourceIndices[i+1]);normalGeo.setIndex(reversed);normalGeo.computeVertexNormals();for(let i=0;i<geo.attributes.position.count;i++)vertices[start+i].normal=new T.Vector3().fromBufferAttribute(normalGeo.attributes.normal,i).toArray();normalGeo.dispose();
  const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material],groups=geo.groups.length?geo.groups:[{start:0,count:sourceIndices.length,materialIndex:0}];for(const g of groups){const m=mats[g.materialIndex]||mats[0];if(!m?.visible)continue;const texture=await saveTexture(m.map);materials.push({name:mesh.name+' / '+m.name,color:[...m.color.toArray(),m.opacity],texture,flags:pmxMaterialFlags(m),count:g.count});for(let i=g.start;i<g.start+g.count;i+=3){indices.push(start+sourceIndices[i],start+sourceIndices[i+2],start+sourceIndices[i+1]);for(const id of sourceIndices.slice(i,i+3)){const uv=geo.attributes.uv;if(uv)vertices[start+id].uv=pmxUV([uv.getX(id),uv.getY(id)],m.map);}}}
  for(const morph of model.morphs.filter(m=>m.mesh===mesh)){const attr=geo.morphAttributes.position?.[morph.index];if(!attr)continue;const deltas=[];for(let i=0;i<attr.count;i++){const d=new T.Vector3().fromBufferAttribute(attr,i);if(d.lengthSq()<1e-12)continue;const base=new T.Vector3().fromBufferAttribute(geo.attributes.position,i),to=base.clone().add(d);if(mesh.isSkinnedMesh){mesh.applyBoneTransform(i,base);mesh.applyBoneTransform(i,to);}base.applyMatrix4(mesh.matrixWorld);to.applyMatrix4(mesh.matrixWorld);d.copy(to).sub(base);deltas.push({index:start+i,position:world(d)});}if(deltas.length)morphs.push({name:morph.name,deltas});}
  onProgress((mi+1)/model.meshes.length);await new Promise(r=>setTimeout(r,0));
 }
 const physics=buildPMXPhysics(bones,scale),pmx=encodePMX({name,bones,vertices,indices,materials,textures:textureNames,morphs,physics});images[name+'.pmx']=pmx;images['bone-map.json']=new TextEncoder().encode(JSON.stringify({mapping:retarget.mapping,sourceReference:retarget.sourcePositions,unitsPerMeter:scale,bones:bones.map(b=>({name:b.name,original:b.original,parent:b.parent}))},null,2));images['说明.txt']=new TextEncoder().encode('使用 '+name+'.pmx；textures 文件夹需保持在旁边。\n保留四权重蒙皮、顶点表情、服装骨骼；带标准 MMD 腿部 IK。\n已自动生成身体接触刚体、衣服/头发/配饰动态刚体与弹簧关节。复杂服装可在 PMX Editor 调整尺寸、刚度和碰撞组。网页 XPBD 与 MMD 刚体引擎不同，效果需在 MMD 中核对。\n转换使用当前的源骨架参考校准 A / T 姿势。');return zipSync(images,{level:1});
}
