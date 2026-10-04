import * as THREE from 'three';
import { captureRest } from './retarget.mjs';
import { gameMaterial } from './materials.mjs';
const textureLoader=new THREE.TextureLoader();
const textures=new Map();
async function texture(url,linear=false){if(!url)return null;const key=url+':'+linear;if(!textures.has(key))textures.set(key,textureLoader.loadAsync(url).then(t=>{t.colorSpace=linear?THREE.NoColorSpace:THREE.SRGBColorSpace;t.wrapS=THREE.RepeatWrapping;t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;if(linear)t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;return t;}));return textures.get(key);}
export async function loadComponent(key){const response=await fetch('/api/component?key='+encodeURIComponent(key));if(!response.ok){const e=await response.json();throw new Error(e.error||'资源加载失败');}return response.json();}
async function blendTexture(base,overlay){const a=await texture(base),b=await texture(overlay);if(!a||!b)return a;const c=document.createElement('canvas');c.width=a.image.width;c.height=a.image.height;const x=c.getContext('2d');x.drawImage(a.image,0,0,c.width,c.height);x.drawImage(b.image,0,0,c.width,c.height);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t;}
export async function createCharacter(components,profile,variants={}){
 const entries=await Promise.all(Object.entries(components).filter(([,id])=>id).map(async([family,id])=>[family,await loadComponent((family.endsWith('Accessory')?'accessory':family)+'/'+id)]));
 const data=Object.fromEntries(entries),motionRoot=new THREE.Group();motionRoot.name='NananijiMotion';
 const group=new THREE.Group();group.name='UnityCharacter';group.scale.setScalar(profile?.bodyScale||1);motionRoot.add(group);
 const model={motionRoot,group,bones:[],bodyBones:[],meshes:[],morphs:[],parts:[],materials:[],profile,components,bindError:0,ownedTextures:[]};
 const skin=data.skin?.textures['skin.png'];
 for(const [family,component] of entries){
  if(!component.meshes.length)continue;
  const part=new THREE.Group();part.name=family;group.add(part);model.parts.push({family,group:part,data:component});
  const bones=component.bones.map((b,i)=>{const node=new THREE.Bone();node.name=b.name;node.position.fromArray(b.position);node.quaternion.fromArray(b.quaternion);node.scale.fromArray(b.scale);node.userData={key:family+'/'+b.name,family,index:i};return node;});
  bones.forEach((b,i)=>{const p=component.bones[i].parent;if(p>=0)bones[p].add(b);else part.add(b);});
  model.bones.push(...bones);if(family==='body')model.bodyBones=bones;
  for(const md of component.meshes){
   const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(md.positions,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(md.normals,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(md.uv,2));
   geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(md.skinIndex,4));geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute(md.skinWeight,4));geo.setIndex(md.indices);md.groups.forEach(g=>geo.addGroup(g.start,g.count,g.materialIndex));
   if(md.morphs.length){geo.morphTargetsRelative=true;geo.morphAttributes.position=md.morphs.map(m=>{const a=new Float32Array(md.positions.length);for(const [id,x,y,z] of m.deltas){a[id*3]=x;a[id*3+1]=y;a[id*3+2]=z;}const attr=new THREE.Float32BufferAttribute(a,3);attr.name=m.name;return attr;});}
   const materials=await Promise.all(md.materials.map(async m=>{const name=m.texture?.split('/').at(-1),set=component.textureSets?.[variants[family]||'01'];let map;
    if(m.skin){const overlay=component.textureSets?.['subwear_'+(variants.subwear||'01')]?.['skinblend.png'];map=overlay?await blendTexture(skin,overlay):await texture(skin);if(overlay&&map)model.ownedTextures.push(map);}else{const replacement=family==='hair'&&name==='defacc.png'?data.accessory?.textures['defacc.png']:null;map=await texture(replacement||set?.[name]||m.texture);}
    // The skirt has separate inward-facing lining triangles. Rendering both
    // sides lets their solid-color UV patch cover the textured outer surface.
    const shadowName=m.shadowTexture?.split('/').at(-1),shadowURL=m.skin?data.skin?.textures['skin_sd.png']:(family==='hair'&&shadowName==='defacc_sd.png'?data.accessory?.textures['defacc_sd.png']:null)||set?.[shadowName]||m.shadowTexture;
    const shadowOverlay=m.skin?component.textureSets?.['subwear_'+(variants.subwear||'01')]?.['skinblend_sd.png']:null;
    const shadowMap=shadowOverlay?await blendTexture(shadowURL||skin,shadowOverlay):await texture(shadowURL),rampMap=await texture(m.rampTexture||data.skin?.textures['toonlamp.png'],true);
    if(shadowOverlay&&shadowMap)model.ownedTextures.push(shadowMap);
    const mat=gameMaterial({name:m.name,map,shadowMap,rampMap,lining:m.lining,color:map?0xffffff:new THREE.Color().fromArray(m.color)});
    // Head meshes contain layered bangs, eyes and lashes. Expanding their
    // backs with a screen-space outline paints black triangles over the face.
    // Their original textures already supply the fine line work.
    if(m.skin||family==='face'||family==='hair'||family.toLowerCase().includes('accessory'))mat.userData.outlineParameters={visible:false};
    model.materials.push({key:family+'/'+m.name,family,material:mat});return mat;}));
   const mesh=md.bones.length?new THREE.SkinnedMesh(geo,materials):new THREE.Mesh(geo,materials);mesh.name=family+'_'+md.name;mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=false;
   part.add(mesh);part.updateMatrixWorld(true);
   if(md.bones.length){const skeleton=new THREE.Skeleton(md.bones.map(i=>bones[i]),md.inverses.map(a=>new THREE.Matrix4().fromArray(a)));mesh.bind(skeleton,new THREE.Matrix4());mesh.normalizeSkinWeights();}
   mesh.updateMorphTargets();model.meshes.push(mesh);
   md.morphs.forEach((m,i)=>model.morphs.push({key:family+'/'+md.name+'/'+m.name,name:m.name,mesh,index:i}));
  }
  model.bindError=Math.max(model.bindError,component.bindError);
 }
 // Reference bones are measured in meters before character-specific body scaling.
 group.scale.setScalar(1);motionRoot.updateMatrixWorld(true);captureRest(motionRoot,model.bones);
 configureAttachments(model,profile);
 group.scale.setScalar(profile?.bodyScale||1);model.updateAttachments();
 model.dispose=()=>{for(const mesh of model.meshes){mesh.geometry.dispose();mesh.skeleton?.dispose();for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])m.dispose();}for(const t of new Set(model.ownedTextures))t.dispose();motionRoot.removeFromParent();};
 return model;
}

export function configureAttachments(model,profile=model.profile){
 const group=model.group,head=model.bodyBones.find(b=>b.name==='BodyHead');model.head=head;
 for(const part of model.parts){if(!part.data.attachmentMatrix)continue;const joint=model.bones.find(b=>b.userData.family===part.family&&/__Body/.test(b.name)),name=joint?.name.split('__').at(-1),target=model.bodyBones.find(b=>b.name===name);part.anchor=target||head;part.referenceMatrix=target?joint.matrixWorld.clone():new THREE.Matrix4().fromArray(part.data.attachmentMatrix);part.headAttachment=!target||name==='BodyHead';}
 model.updateAttachments=()=>{
  group.updateMatrixWorld(true);
  for(const part of model.parts){if(!part.data.attachmentMatrix)continue;
   if(!part.anchor)continue;const anchorInGroup=group.matrixWorld.clone().invert().multiply(part.anchor.matrixWorld),size=part.headAttachment?(profile?.headScale||1):1;
   const matrix=anchorInGroup.multiply(new THREE.Matrix4().makeScale(size,size,size)).multiply(part.referenceMatrix.clone().invert());
   matrix.decompose(part.group.position,part.group.quaternion,part.group.scale);part.group.updateMatrixWorld(true);
  }
 };
}
