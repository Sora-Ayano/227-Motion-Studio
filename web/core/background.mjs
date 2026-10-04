import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {MTLLoader} from 'three/addons/loaders/MTLLoader.js';
import {TGALoader} from 'three/addons/loaders/TGALoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {Parser} from '../lib/mmdparser.mjs';
import {fromPMX} from './imports.mjs';
export async function loadBackground(files){
 const source=files.find(f=>/\.(glb|gltf|fbx|obj|pmx)$/i.test(f.name));if(!source)throw new Error('请选择 GLB / glTF / FBX / OBJ / PMX 场景文件及其贴图');if(source.size>250*1024*1024)throw new Error('背景模型不能超过 250 MB');
 const map=new Map(files.map(f=>[f.name.toLowerCase(),f])),urls=[],manager=new T.LoadingManager();let missing=[],pending=false,finishTextures;const texturesReady=new Promise(resolve=>finishTextures=resolve);manager.onStart=()=>pending=true;manager.onLoad=()=>{pending=false;finishTextures();};
 manager.setURLModifier(url=>{const name=decodeURIComponent(url).replaceAll('\\','/').split('/').at(-1).toLowerCase(),file=map.get(name);if(file){const local=URL.createObjectURL(file);urls.push(local);return local;}if(/^(blob:|data:|\/vendor\/)/.test(url))return url;missing.push(name);return '/missing-local-texture';});manager.addHandler(/\.tga$/i,new TGALoader(manager));
 let object;try{
  if(/\.fbx$/i.test(source.name))object=new FBXLoader(manager).parse(await source.arrayBuffer(),'');
  else if(/\.obj$/i.test(source.name)){const loader=new OBJLoader(manager),mtl=files.find(f=>/\.mtl$/i.test(f.name));if(mtl){const materials=new MTLLoader(manager).parse(await mtl.text(),'');materials.preload();loader.setMaterials(materials);}object=loader.parse(await source.text());}
  else if(/\.pmx$/i.test(source.name))object=await fromPMX(new Parser().parsePmx(await source.arrayBuffer(),true),map,urls);
  else{const draco=new DRACOLoader(manager).setDecoderPath('/vendor/examples/jsm/libs/draco/gltf/');try{object=(await new GLTFLoader(manager).setDRACOLoader(draco).parseAsync(/\.gltf$/i.test(source.name)?await source.text():await source.arrayBuffer(),'')).scene;}finally{draco.dispose();}}
  // Wait for textures triggered by FBX/MTL parsers before revoking blob URLs.
  if(pending)await texturesReady;
  const root=new T.Group();root.name='Background';root.add(object);object.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;for(const m of Array.isArray(o.material)?o.material:[o.material]){m.userData.outlineParameters={visible:false};if(m.map)m.map.colorSpace=T.SRGBColorSpace;}}});root.updateMatrixWorld(true);
  return {root,name:source.name,missing:[...new Set(missing)],dispose(){root.traverse(o=>{if(!o.isMesh)return;o.geometry.dispose();o.skeleton?.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}});root.removeFromParent();}};
 }finally{for(const url of urls)URL.revokeObjectURL(url);}
}
