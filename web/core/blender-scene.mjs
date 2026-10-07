import * as T from 'three';
import {clone as cloneRig} from 'three/addons/utils/SkeletonUtils.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {prepareCloth,restoreClothGeometry} from './cloth.mjs';
import {garmentMobility as nativeClothWeights} from './cloth-weights.mjs';
const encodedTextures=new WeakMap();
function texturePNG(texture){
 if(!texture?.image)return null;if(encodedTextures.has(texture.image))return encodedTextures.get(texture.image);
 const image=texture.image,canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);
 const data=canvas.toDataURL('image/png').split(',')[1];encodedTextures.set(image,data);return data;
}
export {garmentMobility as nativeClothWeights} from './cloth-weights.mjs';
// TEXCOORD_1 carries simulation weights through glTF's primitive splitting.
// It is written only on export clones; the editor's UVs and materials stay intact.
export function renderClone(model,index){
 prepareCloth(model);restoreClothGeometry(model);const root=cloneRig(model.motionRoot),original=[],copies=[];model.motionRoot.traverse(o=>original.push(o));root.traverse(o=>copies.push(o));const pairs=[];
 for(let i=0;i<copies.length;i++){
  const src=original[i],dst=copies[i];dst.name='Studio_'+index+'_'+i;pairs.push([src,dst]);dst.userData={};
  if(!dst.isMesh)continue;dst.geometry=src.geometry.clone();const weights=nativeClothWeights(src);
  if(weights.some((value,i)=>i%2===1&&value>0)){const names=src.skeleton.bones.map(b=>b.name);dst.userData.studioFabric=names.filter(name=>/skirt/i.test(name)).length>16?'structured':'cotton';}
  // Detached bows keep their authored bone dynamics until their attachment
  // boundary is known; bone-name matching alone cannot define a cloth pin.
  dst.geometry.setAttribute('uv1',new T.BufferAttribute(weights,2));
  const materials=Array.isArray(src.material)?src.material:[src.material];
  // The game draws a reversed copy as lining. A physical shell must contain
  // only the outer surface; coincident layers fight self-collision at rest.
  const lining=materials.map(mat=>mat.userData.lining||/noline|lining/i.test(mat.name));
  if(dst.geometry.groups.length)dst.geometry.groups=dst.geometry.groups.filter(g=>!lining[g.materialIndex]);else if(lining[0])dst.visible=false;
  dst.material=materials.map(mat=>{const copy=new T.MeshStandardMaterial({name:dst.name+'_'+(mat.userData.surfaceKind||'cloth'),color:mat.color,map:mat.map,opacity:mat.opacity,transparent:mat.transparent,alphaTest:mat.alphaTest,side:mat.side,roughness:mat.userData.surfaceKind==='hair'?.42:.78,metalness:0,visible:mat.visible});if(mat.userData.gameMaterial)copy.userData={studioToon:true,studioShadowPNG:texturePNG(mat.studioMaps?.shadowMap),studioShadowFlipY:mat.studioMaps?.shadowMap?.flipY!==false};return copy;});
  if(!Array.isArray(src.material))dst.material=dst.material[0];
 }
 const parent=new T.Group();parent.name='Character_'+index;model.motionRoot.parent?.updateWorldMatrix(true,false);if(model.motionRoot.parent)model.motionRoot.parent.matrixWorld.decompose(parent.position,parent.quaternion,parent.scale);parent.add(root);return {parent,root,pairs};
}
export async function captureBlenderScene({models,apply,camera,count,fps,cancelled,progress,background,backdrop}){
 const scene=new T.Scene(),entries=models.map(renderClone),tracks=[],samples=new Map(),cameras=[];
 try{
 for(const entry of entries){scene.add(entry.parent);for(const [src,dst]of entry.pairs)samples.set(dst,{src,position:[],quaternion:[],scale:[],morphs:[]});}
 if(background){const clone=cloneRig(background),source=[],copies=[];background.traverse(o=>source.push(o));clone.traverse(o=>copies.push(o));for(let i=0;i<copies.length;i++){const dst=copies[i];dst.name='Stage_'+i;dst.userData={};if(dst.isBone)dst.visible=true;samples.set(dst,{src:source[i],position:[],quaternion:[],scale:[],morphs:[]});}scene.add(clone);}
 const times=[];
 for(let i=0;i<count;i++){
  if(cancelled())throw new Error('已取消导出');const frame=i*30/fps;apply(frame);times.push(i/fps);
  for(const data of samples.values()){data.position.push(...data.src.position.toArray());data.quaternion.push(...data.src.quaternion.toArray());data.scale.push(...data.src.scale.toArray());if(data.src.morphTargetInfluences)data.morphs.push(...data.src.morphTargetInfluences);}
  const c=camera();c.updateWorldMatrix(true,false);cameras.push({matrix:c.matrixWorld.toArray(),fov:c.fov||35,ortho:c.isOrthographicCamera?(c.top-c.bottom)/c.zoom:0,near:c.near,far:c.far});
  if(i%30===0){progress(i,count,'收集骨架、表情与镜头');await new Promise(requestAnimationFrame);}
 }
 for(const [dst,data]of samples){for(const key of ['position','quaternion','scale'])tracks.push(new (key==='quaternion'?T.QuaternionKeyframeTrack:T.VectorKeyframeTrack)(dst.name+'.'+key,times,data[key]));if(data.morphs.length)tracks.push(new T.NumberKeyframeTrack(dst.name+'.morphTargetInfluences',times,data.morphs));}
 scene.updateMatrixWorld(true);const glb=await new GLTFExporter().parseAsync(scene,{binary:true,animations:[new T.AnimationClip('Web timeline',count/fps,tracks)],onlyVisible:true});
 let image=null;if(backdrop?.image){const canvas=document.createElement('canvas');canvas.width=backdrop.image.width;canvas.height=backdrop.image.height;canvas.getContext('2d').drawImage(backdrop.image,0,0);image=canvas.toDataURL('image/png').split(',')[1];}
 return {glb,cameras,backdrop:image};
 }finally{for(const entry of entries)entry.root.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const mat of Array.isArray(o.material)?o.material:[o.material])mat.dispose();}});}
}
