import {postLocal} from './local-api.mjs';
export function framePlan(duration,fps){const count=Math.max(1,Math.ceil(duration*fps/30));return {count,frame:index=>index*30/fps};}
async function request(action,id,options={}){const r=await postLocal('/api/frame-video/'+action+(id?'?id='+encodeURIComponent(id):''),{method:'POST',...options}),data=await r.json();if(!r.ok)throw new Error(data.error||'逐帧导出失败');return data;}
export async function exportFrameVideo({canvas,width,height,fps,duration,render,audioURL,offset=0,gain=1,encoder='auto',pipeline=4,cancelled,progress}){
 const plan=framePlan(duration,fps);let id,complete=false;
 try{({id}=await request('start',null,{body:JSON.stringify({width,height,fps,count:plan.count,encoder,pipeline})}));
  if(audioURL){progress(0,plan.count,'读取音频');const response=await fetch(audioURL);if(!response.ok)throw new Error('导出音频读取失败');const r=await postLocal('/api/frame-video/audio?id='+id+'&offset='+offset+'&gain='+gain,{method:'POST',body:await response.blob()});if(!r.ok)throw new Error((await r.json()).error);}
  const pending=new Set();let error,done=0;
  for(let index=0;index<plan.count;index++){
   if(cancelled())throw new Error('已取消逐帧导出');if(error)throw error;
   if(pending.size>=pipeline)await Promise.race(pending);if(error)throw error;
   await render(plan.frame(index));
   // toBlob snapshots the current canvas before the next frame is drawn.
   const png=new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('无法读取渲染帧')),'image/png'));
   const task=(async()=>{const r=await postLocal('/api/frame-video/frame?id='+id+'&index='+index,{method:'POST',body:await png});if(!r.ok)throw new Error((await r.json()).error);progress(++done,plan.count,'逐帧渲染 · '+pipeline+' 帧流水线');})().catch(e=>{error??=e;}).finally(()=>pending.delete(task));pending.add(task);
  }
  await Promise.all(pending);if(error)throw error;
  if(cancelled())throw new Error('已取消逐帧导出');progress(plan.count,plan.count,'完成编码与音频合成');const result=await request('finish',id);complete=true;return result;
 }finally{if(id&&!complete)try{await request('cancel',id);}catch{}}
}
