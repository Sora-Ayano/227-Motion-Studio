import {spawn} from 'node:child_process';
import {mkdir,writeFile,stat,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {ffmpegPath} from './mp4.mjs';
import {chooseEncoder,encoderArgs} from './video-encoder.mjs';

export function validateFrameVideo({width,height,fps,count,pipeline=1,encoder='cpu'}){
 if(![width,height,fps,count].every(Number.isInteger)||width<2||height<2||width>3840||height>3840||width%2||height%2||width*height>3840*2160||![30,60].includes(fps)||count<1||count>60000)throw new Error('逐帧视频尺寸、帧率或总帧数无效');
 if(![1,2,4].includes(pipeline)||!['auto','nvenc','cpu'].includes(encoder))throw new Error('视频加速参数无效');return {width,height,fps,count,pipeline,encoder};
}
function run(exe,args){return new Promise((resolve,reject)=>{const p=spawn(exe,args,{windowsHide:true});let error='';p.stderr.on('data',d=>error=(error+d).slice(-4000));p.on('error',reject);p.on('close',code=>code===0?resolve():reject(new Error('逐帧编码失败：'+error)));});}
export class FrameVideo{
 static async create(directory,options,config={}){const spec=validateFrameVideo(options);await mkdir(directory,{recursive:true});spec.encoder=await chooseEncoder(spec.encoder,config,spec);const job=new FrameVideo(directory,spec,await ffmpegPath(config));await job.ready;return job;}
 constructor(directory,spec,exe){Object.assign(this,spec);this.id=randomUUID();this.stem=this.id+'-22-7-frames';this.video=path.join(directory,this.stem+'-video.mp4');this.output=path.join(directory,this.stem+'.mp4');this.audio=path.join(directory,this.stem+'-audio');this.exe=exe;this.index=0;this.busy=false;this.queue=new Map();this.closed=false;this.error=null;
  this.process=spawn(exe,['-hide_banner','-loglevel','error','-y','-f','image2pipe','-vcodec','png','-framerate',String(this.fps),'-i','pipe:0','-an',...encoderArgs(this.encoder),'-pix_fmt','yuv420p','-fps_mode','cfr','-video_track_timescale','60000','-movflags','+faststart',this.video],{windowsHide:true});let log='';this.process.stderr.on('data',d=>log=(log+d).slice(-4000));
  this.ready=new Promise((r,j)=>{this.process.once('spawn',r);this.process.once('error',j);});this.done=new Promise((r,j)=>{this.process.on('error',j);this.process.on('close',code=>code===0?r():j(new Error('逐帧编码失败：'+log)));});this.done.catch(e=>{this.error=e;this.rejectQueue(e);});this.process.stdin.on('error',e=>{this.error=e;this.rejectQueue(e);});this.touch();
 }
 touch(){clearTimeout(this.timer);this.timer=setTimeout(()=>{this.cancel().catch(()=>{});this.onExpire?.();},180000);this.timer.unref();}
 async frame(index,bytes){
  if(this.closed||this.error)throw this.error||new Error('逐帧任务已结束');
  if(!Number.isInteger(index)||index<this.index||index>=this.count||index>=this.index+this.pipeline||this.queue.has(index))throw new Error('视频帧顺序或数量不正确');
  if(bytes.length<24||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==this.width||bytes.readUInt32BE(20)!==this.height)throw new Error('视频帧尺寸与选定输出不一致');
  this.touch();return new Promise((resolve,reject)=>{this.queue.set(index,{bytes,resolve,reject});this.drain();});
 }
 async drain(){if(this.busy)return;this.busy=true;try{
  while(!this.closed&&this.queue.has(this.index)){const item=this.queue.get(this.index);await new Promise((r,j)=>this.process.stdin.write(item.bytes,e=>e?j(e):r()));this.queue.delete(this.index);this.index++;item.resolve();}
 }catch(e){this.error=e;this.rejectQueue(e);}finally{this.busy=false;}}
 rejectQueue(error){for(const item of this.queue.values())item.reject(error);this.queue.clear();}
 async setAudio(bytes,offset=0,gain=1){if(this.closed||!Number.isFinite(offset)||!Number.isFinite(gain)||Math.abs(offset)>10000||gain<0||gain>1)throw new Error('音频参数无效');this.touch();await writeFile(this.audio,bytes);this.hasAudio=true;this.offset=offset;this.gain=gain;}
 async finish(){if(this.closed||this.busy||this.index!==this.count)throw new Error('尚未收到所有视频帧，不能完成导出');this.closed=true;clearTimeout(this.timer);this.process.stdin.end();await this.done;const duration=this.count/this.fps;
  if(this.hasAudio){const trim=Math.max(0,-this.offset),delay=Math.round(Math.max(0,this.offset)*1000);await run(this.exe,['-nostdin','-hide_banner','-loglevel','error','-y','-i',this.video,'-i',this.audio,'-filter_complex',`[1:a]atrim=start=${trim},asetpts=PTS-STARTPTS,volume=${this.gain},adelay=${delay}:all=1,apad[a]`,'-map','0:v:0','-map','[a]','-c:v','copy','-c:a','aac','-b:a','192k','-t',String(duration),'-movflags','+faststart',this.output]);}else{await run(this.exe,['-nostdin','-hide_banner','-loglevel','error','-y','-i',this.video,'-map','0:v:0','-c','copy','-movflags','+faststart',this.output]);}
  await this.cleanup(false);return {name:path.basename(this.output),url:'/exports/'+path.basename(this.output),size:(await stat(this.output)).size,frames:this.count,fps:this.fps,duration,width:this.width,height:this.height,encoder:this.encoder,pipeline:this.pipeline,serverRender:true};
 }
 async cleanup(all){for(const p of [this.video,this.audio,...(all?[this.output]:[])])try{await unlink(p);}catch(e){if(e.code!=='ENOENT')throw e;}}
 async cancel(){this.closed=true;clearTimeout(this.timer);this.rejectQueue(new Error('逐帧任务已取消'));this.process.kill();try{await this.done;}catch{}await this.cleanup(true);}
}
