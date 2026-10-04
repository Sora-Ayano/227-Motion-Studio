import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';
import { Parser } from '../lib/mmdparser.mjs';
import { captureRest } from './retarget.mjs';
import { autoMap } from './rig.mjs';
function fileMap(files){const map=new Map();for(const f of files){map.set(f.name.toLowerCase(),f);map.set((f.webkitRelativePath||f.name).replaceAll('\\','/').toLowerCase(),f);}return map;}
export async function importModel(files){
 const source=files.find(f=>/\.(glb|gltf|fbx|pmx)$/i.test(f.name));if(!source)throw new Error('请选择 GLB、FBX 或 PMX 模型（PMX 可连同贴图一起选择）');if(source.size>250*1024*1024)throw new Error('单个模型不能超过 250 MB');
 const map=fileMap(files),urls=[],manager=new T.LoadingManager();let pending=false,finishTextures;const texturesReady=new Promise(r=>finishTextures=r);manager.onStart=()=>pending=true;manager.onLoad=()=>{pending=false;finishTextures();};manager.setURLModifier(url=>{const path=decodeURIComponent(url).replaceAll('\\','/').toLowerCase(),file=map.get(path)||map.get(path.split('/').at(-1));if(file){const u=URL.createObjectURL(file);urls.push(u);return u;}if(/^(blob:|data:|\/vendor\/)/.test(url))return url;return '/missing-local-texture';});manager.addHandler(/\.tga$/i,new TGALoader(manager));
 const buffer=await source.arrayBuffer();let object,animations=[],mmdPositions=null;
 try{
  if(/\.fbx$/i.test(source.name)){object=new FBXLoader(manager).parse(buffer,'');animations=object.animations||[];}
  else if(/\.pmx$/i.test(source.name)){const data=new Parser().parsePmx(buffer,true);object=await fromPMX(data,map,urls);mmdPositions=Object.fromEntries(data.bones.map(b=>[b.name,[b.position[0],b.position[1],-b.position[2]]]));}
  else{const draco=new DRACOLoader(manager).setDecoderPath('/vendor/examples/jsm/libs/draco/gltf/');try{const gltf=await new GLTFLoader(manager).setDRACOLoader(draco).parseAsync(/\.gltf$/i.test(source.name)?await source.text():buffer,'');object=gltf.scene;animations=gltf.animations;}finally{draco.dispose();}}
  if(pending)await texturesReady;
  const motionRoot=new T.Group(),group=new T.Group();motionRoot.name='ImportedMotion';group.name='ImportedCharacter';motionRoot.add(group);group.add(object);object.updateMatrixWorld(true);
  // Normalize units and orientation once, without changing mesh weights or bind matrices.
  const box=new T.Box3().setFromObject(object),height=box.getSize(new T.Vector3()).y;if(height>4||height<.4)object.scale.multiplyScalar(1.65/Math.max(height,.001));object.updateMatrixWorld(true);
  const bones=[];object.traverse(o=>{if(o.isBone)bones.push(o);});if(!bones.length)throw new Error('模型没有蒙皮骨骼，无法重定向动作');const rig=autoMap(bones),left=rig.human.LeftUpperArm,right=rig.human.RightUpperArm;
  if(left&&right&&left.getWorldPosition(new T.Vector3()).x>right.getWorldPosition(new T.Vector3()).x)object.rotation.y+=Math.PI;
  object.updateMatrixWorld(true);const scaledBox=new T.Box3().setFromObject(object);object.position.y-=scaledBox.min.y;object.updateMatrixWorld(true);
  const seen=new Map();bones.forEach((b,i)=>{const n=seen.get(b.name)||0;seen.set(b.name,n+1);if(n)b.name+='_'+i;b.userData={...b.userData,key:'body/'+b.name,family:'body'};});captureRest(motionRoot,bones);
  const meshes=[],materials=[],morphs=[];object.traverse(o=>{if(!o.isMesh)return;o.frustumCulled=false;o.castShadow=true;o.receiveShadow=false;meshes.push(o);const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats)materials.push({key:'imported/'+m.name,material:m,family:'body'});if(o.morphTargetDictionary)for(const [name,index] of Object.entries(o.morphTargetDictionary))morphs.push({key:'body/'+o.name+'/'+name,name,mesh:o,index});});
  const model={motionRoot,group,bones,bodyBones:bones,meshes,materials,morphs,parts:[],profile:{id:source.name,name:source.name.replace(/\.[^.]+$/,''),bodyScale:1,headScale:1},components:{},bindError:0,head:autoMap(bones).human.Head,animations,object,mmdPositions,updateAttachments(){},dispose(){for(const m of meshes){m.geometry.dispose();for(const mat of Array.isArray(m.material)?m.material:[m.material]){mat.map?.dispose();mat.dispose();}m.skeleton?.dispose();}motionRoot.removeFromParent();}};
  return model;
 }finally{for(const url of urls)URL.revokeObjectURL(url);}
}
export async function fromPMX(data,files,urls){
 const root=new T.Group(),bones=data.bones.map(b=>{const bone=new T.Bone();bone.name=b.name;bone.position.fromArray(b.position);return bone;});
 bones.forEach((b,i)=>{const parent=data.bones[i].parentIndex;if(parent>=0){if(parent===i||parent>=bones.length)throw new Error('PMX 骨骼层级无效');b.position.sub(new T.Vector3().fromArray(data.bones[parent].position));bones[parent].add(b);}else root.add(b);});root.updateMatrixWorld(true);
 const geo=new T.BufferGeometry(),positions=[],normals=[],uv=[],ids=[],weights=[];for(const v of data.vertices){positions.push(...v.position);normals.push(...v.normal);uv.push(v.uv[0],1-v.uv[1]);for(let i=0;i<4;i++){ids.push(Math.max(0,v.skinIndices[i]||0));weights.push(v.skinWeights[i]||0);}}
 geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new T.Float32BufferAttribute(normals,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setAttribute('skinIndex',new T.Uint16BufferAttribute(ids,4));geo.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));geo.setIndex(data.faces.flatMap(f=>f.indices));
 const morphs=data.morphs.filter(m=>m.type===1);if(morphs.length){geo.morphTargetsRelative=true;geo.morphAttributes.position=morphs.map(m=>{const p=new Float32Array(positions.length);for(const e of m.elements)p.set(e.position,e.index*3);const a=new T.Float32BufferAttribute(p,3);a.name=m.name;return a;});}
 let offset=0;const mats=[];for(const m of data.materials){const name=data.textures[m.textureIndex],f=name&&(files.get(name.replaceAll('\\','/').toLowerCase())||files.get(name.replaceAll('\\','/').split('/').at(-1).toLowerCase()));let map=null;if(f){const url=URL.createObjectURL(f);urls.push(url);map=await (/\.tga$/i.test(f.name)?new TGALoader():new T.TextureLoader()).loadAsync(url);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;}
  const mat=new T.MeshToonMaterial({name:m.name,map,color:new T.Color(...m.diffuse.slice(0,3)),opacity:m.diffuse[3],transparent:m.diffuse[3]<1,side:m.flag&1?T.DoubleSide:T.FrontSide});if(/noline|lining/i.test(m.name))mat.userData.outlineParameters={visible:false};mats.push(mat);geo.addGroup(offset,m.faceCount*3,mats.length-1);offset+=m.faceCount*3;}
 const mesh=bones.length?new T.SkinnedMesh(geo,mats):new T.Mesh(geo,mats);mesh.name='PMXMesh';root.add(mesh);root.updateMatrixWorld(true);if(bones.length){mesh.bind(new T.Skeleton(bones));mesh.normalizeSkinWeights();}return root;
}
export async function bakeImportedClip(model,clip,onProgress=()=>{}){const mixer=new T.AnimationMixer(model.object),action=mixer.clipAction(clip);action.play();const edits={bones:{},morphs:{}},duration=Math.round(clip.duration*30);if(duration>30000)throw new Error('动画超过 1000 秒，请分段导入');
 for(let f=0;f<=duration;f++){mixer.setTime(f/30);for(const b of model.bones)(edits.bones[b.userData.key]??=[]).push({frame:f,position:b.position.toArray(),quaternion:b.quaternion.toArray(),curve:[20,20,107,107]});for(const m of model.morphs)(edits.morphs[m.key]??=[]).push({frame:f,weight:m.mesh.morphTargetInfluences[m.index]});if(f%100===0){onProgress(f/duration);await new Promise(r=>setTimeout(r,0));}}
 mixer.stopAllAction();mixer.uncacheRoot(model.object);return {edits,duration};}
