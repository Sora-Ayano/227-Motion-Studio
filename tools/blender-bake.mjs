import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile,access} from 'node:fs/promises';
import path from 'node:path';import {randomUUID} from 'node:crypto';
const exec=promisify(execFile);
export async function findBlender(config={}){
 const candidates=[config.blender,process.env.BLENDER_EXECUTABLE].filter(Boolean);
 if(process.platform==='win32'){
  const script="$paths=@('HKLM:/SOFTWARE/Microsoft/Windows/CurrentVersion/Uninstall/*','HKCU:/SOFTWARE/Microsoft/Windows/CurrentVersion/Uninstall/*');foreach($p in $paths){Get-ItemProperty -Path $p -ErrorAction SilentlyContinue | Where-Object {$_.DisplayName -like '*Blender*' -and $_.InstallLocation} | ForEach-Object {Join-Path $_.InstallLocation 'blender.exe'}}";
  try{const result=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:10000});candidates.push(...result.stdout.trim().split(/\r?\n/).filter(Boolean));}catch{}
 }
 for(const candidate of [...candidates,'blender'])try{const result=await exec(candidate,['--version'],{windowsHide:true,timeout:10000});if(/^Blender \d/m.test(result.stdout))return {executable:candidate,version:result.stdout.split(/\r?\n/)[0]};}catch{}
 throw new Error('未找到 Blender。可在本机 config.local.json 设置 blender 可执行程序路径');
}
export function validateBake(data){
 if(!Array.isArray(data.frames)||data.frames.length<2||data.frames.length>Math.min(451,data.fps*15+1)||![15,30,60].includes(data.fps)||!Number.isFinite(data.startFrame)||data.startFrame<0||!Array.isArray(data.surfaces)||!data.surfaces.length||data.surfaces.length>12)throw new Error('烘焙最多 15 秒、451 帧、12 个布料网格');
 let vertices=0;for(const [i,s]of data.surfaces.entries()){
  if(s.fabric!==undefined&&!['silk','cotton','structured'].includes(s.fabric))throw new Error('布料预设无效');
  if(!s.mobility?.length||s.mobility.length>16000||!Array.isArray(s.triangles))throw new Error('布料网格无效');vertices+=s.mobility.length;
  for(const triangle of s.triangles)if(triangle.length!==3||triangle.some(n=>!Number.isInteger(n)||n<0||n>=s.mobility.length))throw new Error('布料索引无效');
  for(const f of data.frames)if(f.surfaces?.[i]?.length!==s.mobility.length||f.surfaces[i].some(p=>p.length!==3||p.some(v=>!Number.isFinite(v)||Math.abs(v)>1000)))throw new Error('布料顶点数据无效');
 }
 if(vertices>24000)throw new Error('布料网格过大');
 const capsuleCount=data.frames[0].capsules?.length;
 for(const f of data.frames)if(!Array.isArray(f.capsules)||f.capsules.length!==capsuleCount||f.capsules.length>16||f.capsules.some(c=>c.length!==3||c[0].length!==3||c[1].length!==3||[...c[0],...c[1],c[2]].some(v=>!Number.isFinite(v)||Math.abs(v)>1000)||c[2]<=0||c[2]>2))throw new Error('身体碰撞体无效');
 return data;
}
export class BlenderBake{
 constructor(root,config){this.root=root;this.config=config;this.jobs=new Map();}
 async start(value){
  const data=validateBake(value),blender=await findBlender(this.config),id=randomUUID();
  const directory=path.join(this.root,'cache/cloth-bakes',id),outputDir=path.join(this.root,'exports/cloth-bakes');await mkdir(directory,{recursive:true});await mkdir(outputDir,{recursive:true});
  const input=path.join(directory,'input.json'),output=path.join(outputDir,id+'.json');await writeFile(input,JSON.stringify(data));
  const job={id,status:'running',frame:0,total:data.frames.length,url:'/exports/cloth-bakes/'+id+'.json'};this.jobs.set(id,job);
  const process=spawn(blender.executable,['--background','--factory-startup','--python-exit-code','1','--python',path.join(this.root,'tools/blender-cloth.py'),'--',input,output],{windowsHide:true});job.process=process;let tail='';
  process.stdout.on('data',chunk=>{tail+=chunk;const lines=tail.split(/\r?\n/);tail=lines.pop();for(const line of lines)try{const progress=JSON.parse(line);if(progress.frame)job.frame=progress.frame;}catch{}});
  process.stderr.on('data',chunk=>job.error=String(chunk).slice(-1000));
  process.on('error',error=>{job.status='failed';job.error=error.message;});
  process.on('exit',async code=>{if(job.status==='cancelled')return;try{await access(output);job.status=code===0?'completed':'failed';}catch{job.status='failed';}if(job.status==='failed')job.error||='Blender 解算失败';delete job.process;});
  return this.status(id);
 }
 status(id){const job=this.jobs.get(id);if(!job)throw new Error('未知布料烘焙任务');const {process,...publicJob}=job;return publicJob;}
 cancel(id){const job=this.jobs.get(id);if(!job)throw new Error('未知任务');job.status='cancelled';job.process?.kill();return this.status(id);}
 busy(){return [...this.jobs.values()].some(job=>job.status==='running');}
}
