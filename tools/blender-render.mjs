import {spawn} from 'node:child_process';import {mkdir,writeFile,stat,rm} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import path from 'node:path';
import {findBlender} from './blender-bake.mjs';import {validateFrameVideo} from './frame-video.mjs';import {chooseEncoder,encoderArgs} from './video-encoder.mjs';import {ffmpegPath} from './mp4.mjs';
import {nativeGrade,validateNativeLook} from './native-look.mjs';
export function validateRender(value){
 const s={...value,...validateFrameVideo(value)};
 if(!['fast','balanced','quality'].includes(s.quality)||!['neutral','warm','pink','film'].includes(s.look)||!Array.isArray(s.cameras)||s.cameras.length!==s.count)throw new Error('Blender 渲染预设或镜头数量无效');
 if(s.cameras.some(c=>!Array.isArray(c.matrix)||c.matrix.length!==16||c.matrix.some(v=>!Number.isFinite(v)||Math.abs(v)>10000)||!Number.isFinite(c.fov)||c.fov<=0||c.fov>=175||!Number.isFinite(c.ortho)||c.ortho<0||c.ortho>10000||!Number.isFinite(c.near)||!Number.isFinite(c.far)||c.near<=0||c.far<=c.near||c.far>100000))throw new Error('Blender 镜头参数无效');
 for(const [key,min,max,default_]of [['exposure',-3,2,-.35],['ambient',0,.5,.08],['light',.1,3,1]]){s[key]??=default_;if(!Number.isFinite(s[key])||s[key]<min||s[key]>max)throw new Error('Blender 光照参数无效');}
 if(s.backdrop&&(!/^[A-Za-z0-9+/=]+$/.test(s.backdrop)||s.backdrop.length>24*1048576))throw new Error('背景图片无效');
 delete s.environmentImage;s.pipeline=2;s.background=s.green?[0,1,0]:[.025,.03,.045];return validateNativeLook(s);
}
export class BlenderRender{
 constructor(root,config){this.root=root;this.config=config;this.jobs=new Map();}
 async create(value){if(this.busy())throw new Error('已有 Blender 视频任务，请等待或取消');const spec=validateRender(value),blender=await findBlender(this.config),id=randomUUID(),directory=path.join(this.root,'cache/blender-render',id);await mkdir(directory,{recursive:true});await writeFile(path.join(directory,'settings.json'),JSON.stringify(spec));const job={id,directory,spec,blender,status:'queued',frame:0,total:spec.count,lastActivity:Date.now()};this.jobs.set(id,job);return this.status(id);}
 get(id){const job=this.jobs.get(id);if(!job)throw new Error('未知 Blender 渲染任务');return job;}
 status(id){const {directory,spec,blender,process,...safe}=this.get(id);return safe;}
 async scene(id,bytes){const j=this.get(id);if(j.status!=='queued'||bytes.length<20||bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw new Error('glTF 场景文件无效');await writeFile(path.join(j.directory,'scene.glb'),bytes);j.hasScene=true;j.lastActivity=Date.now();return {uploaded:true};}
 async audio(id,bytes,offset=0,gain=1){const j=this.get(id);if(j.status!=='queued'||!Number.isFinite(offset)||Math.abs(offset)>10000||!Number.isFinite(gain)||gain<0||gain>1)throw new Error('音频参数无效');await writeFile(path.join(j.directory,'audio'),bytes);j.audio={offset,gain};j.lastActivity=Date.now();return {uploaded:true};}
 async environment(id,bytes,kind){const j=this.get(id),valid=kind==='exr'?bytes.length>16&&bytes.readUInt32LE(0)===0x01312f76:kind==='hdr'&&/^#\?(RADIANCE|RGBE)/.test(bytes.subarray(0,16).toString('ascii'));if(j.status!=='queued'||!valid||bytes.length>128*1048576)throw new Error('HDR / EXR 环境文件无效');const name='environment.'+kind;await writeFile(path.join(j.directory,name),bytes);j.spec.environmentImage=name;await writeFile(path.join(j.directory,'settings.json'),JSON.stringify(j.spec));j.lastActivity=Date.now();return {uploaded:true};}
 async run(id){const j=this.get(id);if(j.status!=='queued'||!j.hasScene)throw new Error('请先上传场景');j.status='rendering';this.execute(j).catch(e=>{if(j.status!=='cancelled'){j.status='failed';j.error=e.message;}delete j.process;});return this.status(id);}
 async command(j,exe,args,progress=false){await new Promise((resolve,reject)=>{const p=spawn(exe,args,{windowsHide:true});j.process=p;let tail='',error='';p.stdout.on('data',chunk=>{tail+=chunk;const lines=tail.split(/\r?\n/);tail=lines.pop();for(const line of lines)if(progress)try{const data=JSON.parse(line);if(data.frame)j.frame=data.frame;if(data.device)j.device=data.device;if(data.phase)j.phase=data.phase;if(data.garments!==undefined)j.garments=data.garments;if(data.beams!==undefined)j.beams=data.beams;}catch{}});p.stderr.on('data',chunk=>error=(error+chunk).slice(-2400));p.on('error',reject);p.on('close',code=>code===0?resolve():reject(new Error(j.status==='cancelled'?'已取消渲染':error||'Blender 渲染失败')));});}
 async execute(j){
  await this.command(j,j.blender.executable,['--background','--factory-startup','--python-exit-code','1','--python',path.join(this.root,'tools/blender-render.py'),'--',j.directory],true);if(j.status==='cancelled')return;
  j.status='encoding';const exe=await ffmpegPath(this.config),encoder=await chooseEncoder(j.spec.encoder,this.config,j.spec),name=j.id+'-22-7-blender.mp4',output=path.join(this.root,'exports',name);await mkdir(path.dirname(output),{recursive:true});const args=['-hide_banner','-loglevel','error','-y','-framerate',String(j.spec.fps),'-i',path.join(j.directory,'frames/%06d.png')];
  const filters=[];if(j.audio){args.push('-i',path.join(j.directory,'audio'));filters.push(`[1:a]atrim=start=${Math.max(0,-j.audio.offset)},asetpts=PTS-STARTPTS,adelay=${Math.round(Math.max(0,j.audio.offset)*1000)}:all=1,volume=${j.audio.gain},apad[a]`);}
  const grade=j.spec.pipeline===2?'':nativeGrade(j.spec);if(j.spec.green)filters.push('color=c=0x00ff00:s='+j.spec.width+'x'+j.spec.height+':r='+j.spec.fps+'[bg];[bg][0:v]overlay=shortest=1[v]');else if(grade)filters.push('[0:v]'+grade+'[v]');
  if(filters.length)args.push('-filter_complex',filters.join(';'));args.push('-map',j.spec.green||grade?'[v]':'0:v');if(j.audio)args.push('-map','[a]','-c:a','aac','-b:a','192k');

  args.push(...encoderArgs(encoder),'-pix_fmt','yuv420p','-fps_mode','cfr','-t',String(j.spec.count/j.spec.fps),'-movflags','+faststart',output);await this.command(j,exe,args);if(j.status==='cancelled')return;j.status='completed';j.encoder=encoder;j.result={name,url:'/exports/'+name,size:(await stat(output)).size,frames:j.spec.count,fps:j.spec.fps,duration:j.spec.count/j.spec.fps,width:j.spec.width,height:j.spec.height,device:j.device,encoder,serverRender:true};delete j.process;
  // Only this task's generated frame directory is removed after successful encoding.
  const frames=path.resolve(j.directory,'frames'),base=path.resolve(this.root,'cache/blender-render');if(frames.startsWith(base+path.sep))await rm(frames,{recursive:true,force:true});
 }
 cancel(id){const j=this.get(id);if(!['completed','failed','cancelled'].includes(j.status)){j.status='cancelled';j.process?.kill();}return this.status(id);}
 busy(){for(const j of this.jobs.values())if(j.status==='queued'&&Date.now()-j.lastActivity>15*60*1000){j.status='cancelled';j.error='上传任务超时，请重新导出';}return [...this.jobs.values()].some(j=>['rendering','encoding','queued'].includes(j.status));}
}
