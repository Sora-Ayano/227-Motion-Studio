import * as T from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
export async function importCameraAnimation(file){
 const buffer=await file.arrayBuffer();let root,animations;
 if(/\.fbx$/i.test(file.name)){root=new FBXLoader().parse(buffer,'');animations=root.animations;}else{const gltf=await new GLTFLoader().parseAsync(buffer,'');root=gltf.scene;animations=gltf.animations;}
 const cameras=[];root.traverse(o=>{if(o.isCamera)cameras.push(o);});if(!cameras.length)throw new Error('此文件没有相机');const camera=cameras[0],clip=animations[0],mixer=clip?new T.AnimationMixer(root):null;if(clip)mixer.clipAction(clip).play();const duration=clip?.duration||0,keys=[];
 // FBXLoader applies FBX axes. GLB is already in Three's right-handed units.
 for(let frame=0;frame<=Math.ceil(duration*30);frame++){mixer?.setTime(Math.min(frame/30,duration));root.updateMatrixWorld(true);keys.push({frame,position:camera.getWorldPosition(new T.Vector3()).toArray(),quaternion:camera.getWorldQuaternion(new T.Quaternion()).toArray(),fov:camera.fov||35,near:camera.near,far:camera.far,orthographic:camera.isOrthographicCamera,orthographicSize:camera.top||2});}
 mixer?.stopAllAction();root.traverse(o=>{o.geometry?.dispose();for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])m.dispose();});return {format:'nananiji-camera',version:1,name:file.name+' · '+camera.name,coordinates:'three',duration,keys};
}
