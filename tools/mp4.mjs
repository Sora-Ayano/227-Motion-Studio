import {spawn} from 'node:child_process';
import {access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),bundled=path.join(root,'runtime/ffmpeg/ffmpeg.exe');
export async function ffmpegPath(config={}){if(config.ffmpeg){const executable=path.resolve(root,config.ffmpeg);await access(executable);return executable;}try{await access(bundled);return bundled;}catch{return 'ffmpeg';}}
export async function encodeMP4(input,output,config={}){const exe=await ffmpegPath(config),fps=config.fps===60?60:30;return new Promise((resolve,reject)=>{
 const p=spawn(exe,['-nostdin','-hide_banner','-loglevel','error','-y','-fflags','+genpts','-i',input,'-map','0:v:0',...(config.includeAudio===false?['-an']:['-map','0:a:0?']),'-vf',`fps=${fps}:start_time=0,scale=in_range=auto:out_range=tv,pad=ceil(iw/2)*2:ceil(ih/2)*2`,'-r',String(fps),'-fps_mode','cfr','-video_track_timescale','60000','-c:v','libx264','-profile:v','high','-preset','fast','-crf','18','-pix_fmt','yuv420p','-color_range','tv',...(config.includeAudio===false?[]:['-af','aresample=async=1:first_pts=0','-c:a','aac','-b:a','192k']),'-avoid_negative_ts','make_zero','-movflags','+faststart',output],{windowsHide:true});let error='';p.stderr.on('data',d=>{error=(error+d.toString()).slice(-4000);});p.on('error',e=>reject(new Error(e.code==='ENOENT'?'未找到本地 FFmpeg，请在 config.json 配置 ffmpeg 路径':e.message)));p.on('close',code=>code===0?resolve(output):reject(new Error('MP4 编码失败：'+error)));});}
