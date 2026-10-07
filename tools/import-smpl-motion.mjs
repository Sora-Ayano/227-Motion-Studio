import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Bone,Group} from 'three';
import {standardUnityModel} from '../web/core/rig.mjs';
import {captureRest,validateProject} from '../web/core/retarget.mjs';
import {parseSMPLMotion,parseSMPLNPY,retargetSMPLMotion} from '../web/core/smpl-motion.mjs';
import {writeVMD} from '../web/core/vmd.mjs';

export function createSMPLTarget(data){
 if(!Array.isArray(data?.bones)||!data.bones.length)throw new Error('目标文件没有 bones 数组');
 const motionRoot=new Group(),group=new Group();motionRoot.add(group);
 const names=new Set();
 const bones=data.bones.map(item=>{
  if(typeof item.name!=='string'||!item.name||names.has(item.name))throw new Error('目标骨骼名称无效或重复');names.add(item.name);
  const scale=item.scale??[1,1,1];for(const [a,length] of [[item.position,3],[item.quaternion,4],[scale,3]])if(!Array.isArray(a)||a.length!==length||a.some(v=>!Number.isFinite(v)))throw new Error('目标骨骼变换无效');
  const bone=new Bone();bone.name=item.name;bone.position.fromArray(item.position);bone.quaternion.fromArray(item.quaternion);if(bone.quaternion.lengthSq()<1e-12||scale.some(v=>Math.abs(v)<1e-9))throw new Error('目标骨骼变换退化');bone.quaternion.normalize();bone.scale.fromArray(scale);bone.userData={key:`body/${item.name}`,family:'body'};return bone;
 });
 for(let i=0;i<bones.length;i++){
  const parent=data.bones[i].parent;if(!Number.isInteger(parent)||parent>=bones.length||parent===i)throw new Error('目标骨骼层级无效');
  const visited=new Set([i]);let ancestor=parent;while(ancestor>=0){if(visited.has(ancestor))throw new Error('目标骨骼存在循环');visited.add(ancestor);ancestor=data.bones[ancestor]?.parent;if(!Number.isInteger(ancestor))throw new Error('目标骨骼父级无效');}
  (parent<0?group:bones[parent]).add(bones[i]);
 }
 captureRest(motionRoot,bones);return {motionRoot,group,bones,bodyBones:bones,meshes:[],morphs:[],profile:{bodyScale:1},updateAttachments(){},dispose(){motionRoot.removeFromParent();}};
}

export async function importSMPLFile(filename,options={}){
 const bytes=await fs.readFile(filename);if(bytes.length>128*1024*1024)throw new Error('输入超过 128 MB');
 if(path.extname(filename).toLowerCase()==='.npy')return parseSMPLNPY(bytes,options);
 if(path.extname(filename).toLowerCase()!=='.json')throw new Error('仅支持 JSON/NPY；不执行 pickle 文件');
 return parseSMPLMotion(JSON.parse(bytes.toString('utf8')),options);
}

async function main(){
 const args={};for(let i=2;i<process.argv.length;i++){const arg=process.argv[i];if(!arg.startsWith('--')||!process.argv[i+1]||process.argv[i+1].startsWith('--'))throw new Error('参数使用 --名称 值');args[arg.slice(2)]=process.argv[++i];}
 if(!args.input||!args.output){console.log('用法：node tools/import-smpl-motion.mjs --input motion.npy --output dance [--target model.json --component body-id] [--project project.nana.json] [--fps 60 --coordinates y-up-z-forward --root relative]');return;}
 const data=await importSMPLFile(args.input,{fps:args.fps?Number(args.fps):undefined,coordinateSystem:args.coordinates,units:args.units});
 const model=args.target?createSMPLTarget(JSON.parse(await fs.readFile(args.target,'utf8'))):standardUnityModel();if(!args.target)captureRest(model.motionRoot,model.bones);
 const template=args.project?JSON.parse(await fs.readFile(args.project,'utf8')):null;if(template)validateProject(template);
 if(template?.profile){model.profile=template.profile;model.group.scale.setScalar(template.profile.bodyScale??1);}
 const result=retargetSMPLMotion(model,data,{name:args.name??'SMPL24 动作',rootMode:args.root??'relative',restPose:args.rest,vmdScale:args.scale?Number(args.scale):.08});
 const project=template??{format:'nananiji-studio',version:1,name:result.motion.name,profile:{id:'unity-standard',name:'标准 Unity 人形',bodyScale:1},components:{body:args.component??'unity-standard'},scene:{cameraMotion:false},retarget:{settings:{rootMotion:true,limbContact:false}}};
 project.motion=result.motion;project.edits=result.edits;project.duration=result.motion.duration;project.name=result.motion.name;if(args.component)project.components.body=args.component;validateProject(project);
 const output=path.resolve(args.output),outputs=[`${output}.nana.json`,`${output}.vmd`];for(const filename of outputs){try{await fs.access(filename);throw new Error('输出已存在；请指定新的输出名称');}catch(error){if(error.code!=='ENOENT')throw error;}}
 await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(outputs[0],JSON.stringify(project),{flag:'wx'});await fs.writeFile(outputs[1],new Uint8Array(writeVMD(result.vmd)),{flag:'wx'});model.dispose();
 console.log(JSON.stringify({outputs,diagnostics:result.diagnostics},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
