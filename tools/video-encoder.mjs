import {spawn} from 'node:child_process';
import {ffmpegPath} from './mp4.mjs';
const probes=new Map();
export async function videoCapabilities(config={}){
 const exe=await ffmpegPath(config);
 if(!probes.has(exe))probes.set(exe,new Promise(resolve=>{
  const p=spawn(exe,['-nostdin','-hide_banner','-loglevel','error','-f','lavfi','-i','color=black:s=256x256:r=30','-frames:v','2','-c:v','h264_nvenc','-preset','p4','-f','null','-'],{windowsHide:true});
  const timer=setTimeout(()=>{p.kill();resolve({nvenc:false,preferred:'cpu'});},10000);timer.unref();
  p.once('error',()=>{clearTimeout(timer);resolve({nvenc:false,preferred:'cpu'});});
  p.once('close',code=>{clearTimeout(timer);resolve({nvenc:code===0,preferred:code===0?'nvenc':'cpu'});});
 }));return probes.get(exe);
}
export async function chooseEncoder(requested='auto',config={},spec={}){
 if(!['auto','nvenc','cpu'].includes(requested))throw new Error('未知视频编码器');
 if(requested==='cpu')return 'cpu';
 const available=(await videoCapabilities(config)).nvenc&&(!spec.width||spec.width>=144)&&(!spec.height||spec.height>=144);
 if(requested==='nvenc'&&!available)throw new Error('NVIDIA NVENC 不可用，请检查显卡驱动与 FFmpeg，或改用自动 / CPU 编码');
 return available?'nvenc':'cpu';
}
export function encoderArgs(encoder){return encoder==='nvenc'?['-c:v','h264_nvenc','-preset','p4','-tune','hq','-rc','vbr','-cq','18','-b:v','0','-bf','2']:['-c:v','libx264','-preset','fast','-threads','4','-crf','18'];}
