import * as T from 'three';
import {sampleGameTrack} from './game-motion.mjs';

// The stage keeps its original metre units and hierarchy. Moving the returned
// root therefore moves meshes, skeletal fixtures and their lights together.
export async function loadBuiltinStage(item){
 const response=await fetch(item.url);
 if(!response.ok)throw new Error('原游戏舞台资源读取失败');
 const doc=await response.json(),root=new T.Group();root.name=item.name||doc.id;
 const missing=[],textures=new Set(),materials=new Set(),geometries=new Set(),skeletons=new Set(),scrolls=[],lights=[],textureCache=new Map(),loader=new T.TextureLoader();
 let disposed=false;
 const dispose=()=>{if(disposed)return;disposed=true;root.removeFromParent();for(const s of skeletons)s.dispose();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();};
 async function texture(url,{lightmap=false,repeat=[1,1],offset=[0,0],scroll=[0,0]}={}){
  if(!url)return null;
  const key=JSON.stringify([url,lightmap,repeat,offset,scroll]);
  if(!textureCache.has(key))textureCache.set(key,loader.loadAsync(url).then(t=>{
   // UnityPy exports the same PNG orientation used by the character loader;
   // Three's default flipY=true matches these unmodified Unity mesh UVs.
   textures.add(t);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;t.channel=lightmap?1:0;
   t.wrapS=t.wrapT=lightmap?T.ClampToEdgeWrapping:T.RepeatWrapping;t.repeat.fromArray(repeat);t.offset.fromArray(offset);
   t.updateMatrix();if(!lightmap&&scroll.some(v=>v!==0))scrolls.push({texture:t,start:offset.slice(),speed:scroll});return t;
  }).catch(()=>{missing.push(url);return null;}));
  return textureCache.get(key);
 }
 const nodes=doc.nodes.map(n=>{const o=new T.Bone();o.name=n.name;o.position.fromArray(n.position);o.quaternion.fromArray(n.quaternion).normalize();o.scale.fromArray(n.scale);o.visible=n.active!==false;return o;});
 nodes.forEach((node,i)=>{const parent=doc.nodes[i].parent;(parent>=0?nodes[parent]:root).add(node);});root.updateMatrixWorld(true);
 async function material(source,mesh){
  const map=await texture(source.texture,{repeat:source.repeat,offset:source.offset,scroll:Array.isArray(source.scroll)?source.scroll:[source.scroll||0,0]});
  const lightmap=mesh.lightmap&&source.useLightmap!==false&&!source.additive?await texture(mesh.lightmap,{lightmap:true}):null;
  const common={name:source.name||'Stage',map,color:new T.Color().fromArray(source.color||[1,1,1]),opacity:Math.max(0,Math.min(1,source.opacity??1)),transparent:!!source.transparent,side:source.doubleSide?T.DoubleSide:T.FrontSide,depthWrite:!source.transparent};
  // Unity's authored stage surfaces are unlit shaders with optional baked
  // lightmaps. Keep those independent of the editor's character key light.
  const m=source.name==='Default-Material'?new T.MeshStandardMaterial({...common,roughness:1,metalness:0}):new T.MeshBasicMaterial(common);
  materials.add(m);m.userData.outlineParameters={visible:false};
  if(source.additive){m.blending=T.AdditiveBlending;m.transparent=true;m.depthWrite=false;m.toneMapped=false;}
  if(lightmap){
   m.lightMap=lightmap;
   // Three's Basic shader divides irradiance by pi; Unity's dLDR stores
   // [0,2] gamma (2^2.2 linear) in an ETC1 RGB texture.
   // https://docs.unity3d.com/cn/2021.3/Manual/Lightmaps-TechnicalInformation.html
   m.lightMapIntensity=Math.PI*(doc.lightmapEncodings?.[mesh.lightmap]==='dLDR'?4.59482:1);
   m.userData.bakedIntensity=m.lightMapIntensity;
   if(doc.lightmapEncodings?.[mesh.lightmap]==='RGBM'){
    m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('lightMapTexel.rgb * lightMapIntensity','lightMapTexel.rgb * pow(5.0 * lightMapTexel.a, 2.2) * lightMapIntensity');};
    m.customProgramCacheKey=()=> 'stage-rgbm';
   }
  }
  const second=await texture(source.secondTexture,{repeat:source.secondRepeat,offset:source.secondOffset,scroll:source.secondScroll});
  if(second&&map){
   const previous=m.onBeforeCompile;
   m.onBeforeCompile=shader=>{previous(shader);shader.uniforms.stageSecondMap={value:second};shader.uniforms.stageSecondTransform={value:second.matrix};
    shader.vertexShader='varying vec2 stageRawUV;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nstageRawUV=uv;');
    shader.fragmentShader='varying vec2 stageRawUV;\nuniform sampler2D stageSecondMap;\nuniform mat3 stageSecondTransform;\n'+shader.fragmentShader;
    // Blend the two authored scrolling colour layers. Unity's custom
    // post-effect bloom remains an approximation in the web renderer.
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n#ifdef USE_MAP\nvec2 secondUV=(stageSecondTransform * vec3(stageRawUV,1.0)).xy;\nvec4 secondSample=texture2D(stageSecondMap,secondUV);\ndiffuseColor.rgb=mix(diffuseColor.rgb,diffuse*secondSample.rgb,0.5);\n#endif');
   };m.customProgramCacheKey=()=> 'stage-two-layers-'+(doc.lightmapEncodings?.[mesh.lightmap]||'none');
  }
  return m;
 }
 try{
  for(const source of doc.meshes){
   const geometry=new T.BufferGeometry();geometries.add(geometry);
   geometry.setAttribute('position',new T.Float32BufferAttribute(source.positions,3));
   if(source.normals?.length)geometry.setAttribute('normal',new T.Float32BufferAttribute(source.normals,3));
   geometry.setAttribute('uv',new T.Float32BufferAttribute(source.uv,2));if(source.uv1?.length)geometry.setAttribute('uv1',new T.Float32BufferAttribute(source.uv1,2));
   geometry.setIndex(source.indices);if(!source.normals?.length)geometry.computeVertexNormals();for(const g of source.groups)geometry.addGroup(g.start,g.count,g.materialIndex);
   const mats=await Promise.all(source.materials.map(m=>material(m,source))),skinned=source.bones?.length>0;
   if(skinned){geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(source.skinIndex,4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(source.skinWeight,4));}
   const mesh=skinned?new T.SkinnedMesh(geometry,mats):new T.Mesh(geometry,mats);mesh.name=source.name;mesh.visible=source.enabled!==false;mesh.castShadow=!mats.every(m=>m.transparent);mesh.receiveShadow=mats.some(m=>m.isMeshStandardMaterial);mesh.frustumCulled=!skinned;nodes[source.node].add(mesh);root.updateMatrixWorld(true);
   if(skinned){const skeleton=new T.Skeleton(source.bones.map(i=>nodes[i]),source.inverses.map(a=>new T.Matrix4().fromArray(a)));skeletons.add(skeleton);mesh.bind(skeleton,mesh.matrixWorld);mesh.normalizeSkinWeights();}
   geometry.computeBoundingSphere();
  }
  // Preserve every light's metadata; baked lights are already represented by
  // the lightmaps. At most eight active realtime lights are rendered.
  const activeInHierarchy=index=>{for(let i=index;i>=0;i=doc.nodes[i].parent)if(doc.nodes[i].active===false)return false;return true;};
  const candidates=doc.lights.filter(l=>l.enabled&&!l.baked&&activeInHierarchy(l.node)).sort((a,b)=>b.intensity-a.intensity).slice(0,8);
  for(const source of candidates){
   const color=new T.Color().fromArray(source.color),intensity=Math.min(8,Math.max(0,source.intensity))*2;let light;
   if(source.type===0){light=new T.SpotLight(color,intensity,Math.max(.1,source.range),T.MathUtils.degToRad(Math.min(170,source.angle))/2,.65,2);light.target.position.set(0,0,-1);nodes[source.node].add(light.target);}
   else if(source.type===1){light=new T.DirectionalLight(color,intensity);light.target.position.set(0,0,-1);nodes[source.node].add(light.target);}
   else if(source.type===2)light=new T.PointLight(color,intensity,Math.max(.1,source.range),2);
   else continue;
   light.name='原舞台灯光';light.castShadow=false;light.userData.baseIntensity=intensity;nodes[source.node].add(light);lights.push(light);
  }
  const animations=[];
  for(const animation of doc.animations||[]){
   if(animation.active===false)continue;
   try{const r=await fetch(animation.url);if(!r.ok)throw new Error('clip');const buffer=await new Response(r.body.pipeThrough(new DecompressionStream('deflate'))).arrayBuffer(),data=new Float32Array(buffer);if(data.length!==animation.frames*animation.stride)throw new Error('channels');animations.push({...animation,data});}
   catch{missing.push(animation.url);}
  }
  function update(time){
   const seconds=Math.max(0,Number.isFinite(time)?time:0);
   for(const animation of animations){
    const frame=(seconds*(animation.fps||30))%Math.max(1,animation.frames-1);
    for(const track of animation.tracks){const node=nodes[track.node];if(!node)continue;const value=sampleGameTrack(animation,track,frame);
     if(track.kind==='position')node.position.fromArray(value);
     else if(track.kind==='quaternion')node.quaternion.copy(value);
     else if(track.kind==='scale')node.scale.fromArray(value);
     else if(track.kind==='euler')node.quaternion.setFromEuler(new T.Euler(-value[0]*Math.PI/180,-value[1]*Math.PI/180,value[2]*Math.PI/180,'ZXY'));
    }
   }
   for(const entry of scrolls){entry.texture.offset.set(entry.start[0]+entry.speed[0]*seconds,entry.start[1]+entry.speed[1]*seconds);entry.texture.updateMatrix();}
   root.updateMatrixWorld(true);
  }
  function setLights(enabled=true,strength=1){const value=enabled?Math.max(0,Math.min(3,Number.isFinite(strength)?strength:1)):0;for(const light of lights){light.visible=enabled;light.intensity=light.userData.baseIntensity*value;}for(const material of materials)if(material.userData.bakedIntensity!==undefined)material.lightMapIntensity=material.userData.bakedIntensity*value;}
  update(0);
  return {root,name:item.name||doc.id,id:doc.id,builtin:true,missing:[...new Set(missing)],update,setLights,dispose,lightCount:doc.lights.length,realtimeLightCount:lights.length,animationCount:animations.length,ambient:doc.ambient,fog:doc.fog};
 }catch(error){dispose();throw error;}
}
