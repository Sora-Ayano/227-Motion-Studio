import {randomUUID} from 'node:crypto';
export function localComfyEndpoint(value='http://127.0.0.1:8188'){
 const url=new URL(value);
 if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('请输入本机 ComfyUI 地址，例如 http://127.0.0.1:8188');
 return url.origin;
}
const requiredH3=['UNETLoader','CLIPLoader','VAELoader','MiniMaxH3ImageToVideo','MiniMaxH3ReferenceToVideo','RandomNoise','BasicGuider','KSamplerSelect','BasicScheduler','SamplerCustomAdvanced','VAEDecode','VAEDecodeAudio','CreateVideo','SaveVideo'];
export function modelChoices(info,node,field){const spec=info[node]?.input?.required?.[field];return Array.isArray(spec?.[0])?spec[0]:spec?.[1]?.options||[];}
export function buildH3Workflow(options,info){
 const missing=requiredH3.filter(n=>!info[n]);if(missing.length)throw new Error('ComfyUI 缺少节点：'+missing.join('、'));
 const mode=options.mode||'image',ref=mode==='reference',images=options.images||[];
 if(mode!=='text'&&!images.length)throw new Error('请上传参考图片或捕获当前视口');
 const pick=(node,field,pattern,provided)=>{const list=modelChoices(info,node,field);const name=provided||list.find(v=>pattern.test(v));if(!name||!list.includes(name))throw new Error('未找到模型：'+pattern.source);return name;};
 const model=pick('UNETLoader','unet_name',ref ? /minimax.*h3.*ref2va/i : /minimax.*h3.*fl2va/i,options.model);
 const clip=pick('CLIPLoader','clip_name',/minimax.*h3/i,options.textEncoder);
 const videoVAE=pick('VAELoader','vae_name',/minimax.*h3.*video.*vae/i,options.videoVAE),audioVAE=pick('VAELoader','vae_name',/minimax.*h3.*audio.*vae/i,options.audioVAE);
 const width=Math.max(256,Math.min(1344,Math.round((Number(options.width)||768)/32)*32)),height=Math.max(256,Math.min(1344,Math.round((Number(options.height)||448)/32)*32));
 const requested=Math.round(Math.max(.2,Math.min(15,Number(options.duration)||3))*24),length=Math.max(5,requested)+((5-requested%17+17)%17);
 const seed=Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,Math.trunc(Number(options.seed)||227))),steps=Math.max(1,Math.min(40,Number(options.steps)||(ref?4:8)));
 const graph={};const node=(id,class_type,inputs)=>graph[id]={class_type,inputs};
 node('1','UNETLoader',{unet_name:model,weight_dtype:'default'});node('2','CLIPLoader',{clip_name:clip,type:'minimax',device:'default'});
 node('3','VAELoader',{vae_name:videoVAE});node('4','VAELoader',{vae_name:audioVAE});
 let modelLink=['1',0];const lora=modelChoices(info,'LoraLoaderModelOnly','lora_name').find(n=>(ref ? /h3.*ref2v.*turbo/i : /h3.*fl2v.*turbo/i).test(n));
 if(lora&&options.turbo!==false){node('5','LoraLoaderModelOnly',{model:modelLink,lora_name:lora,strength_model:1});modelLink=['5',0];}
 const conditioning={clip:['2',0],prompt:String(options.prompt||'').slice(0,24000),width,height,length};
 if(!conditioning.prompt.trim())throw new Error('请输入视频描述');
 images.slice(0,ref?9:2).forEach((image,i)=>{node(String(20+i),'LoadImage',{image});if(ref)conditioning['ref_images.ref_image_'+i]=[String(20+i),0];else conditioning[i?'last_frame':'first_frame']=[String(20+i),0];});
 conditioning.vae=['3',0];if(ref){conditioning.audio_vae=['4',0];conditioning.ref_image_size='match';}
 node('6',ref?'MiniMaxH3ReferenceToVideo':'MiniMaxH3ImageToVideo',conditioning);
 node('7','RandomNoise',{noise_seed:seed});node('8','BasicGuider',{model:modelLink,conditioning:['6',0]});node('9','KSamplerSelect',{sampler_name:'res_multistep'});
 node('10','BasicScheduler',{model:modelLink,scheduler:'simple',steps,denoise:1});node('11','SamplerCustomAdvanced',{noise:['7',0],guider:['8',0],sampler:['9',0],sigmas:['10',0],latent_image:['6',1]});
 node('12','VAEDecode',{samples:['11',0],vae:['3',0]});node('13','VAEDecodeAudio',{samples:['11',0],vae:['4',0]});
 node('14','CreateVideo',{images:['12',0],audio:['13',0],fps:24,bit_depth:8,color_space:'sRGB',codec:'h264'});
 node('15','SaveVideo',{video:['14',0],filename_prefix:'227-Motion-Studio/H3',format:'mp4','format.codec':'h264','format.codec.encoding':'auto'});
 return graph;
}
export function validateAPIWorkflow(value){
 const graph=value.prompt||value;if(!graph||Array.isArray(graph)||typeof graph!=='object'||graph.nodes)throw new Error('请导入 ComfyUI 的“导出 API”格式 JSON；普通画布 JSON 请先在 ComfyUI 导出为 API 格式');
 const entries=Object.entries(graph);if(!entries.length||entries.length>600||entries.some(([id,n])=>!id||!n?.class_type||!n.inputs||typeof n.inputs!=='object'))throw new Error('工作流格式无效');
 return structuredClone(graph);
}
function outputs(history){const result=[];for(const [node,value] of Object.entries(history.outputs||{}))for(const category of ['images','videos','gifs','audio'])for(const item of value[category]||[]){
 if(!item.filename||/[\\/]|^\.\.?$/.test(item.filename)||!['input','output','temp'].includes(item.type||'output')||String(item.subfolder||'').split(/[\\/]/).includes('..'))continue;
 if(!result.some(v=>v.filename===item.filename&&v.subfolder===item.subfolder))result.push({...item,node,category,type:item.type||'output'});
 }return result;}
export class ComfyBridge{
 constructor(endpoint){this.endpoint=localComfyEndpoint(endpoint);this.client=randomUUID();this.jobs=new Map();this.uploads=new Set();}
 async api(route,{method='GET',body,headers={},timeout=15000}={}){
  let response;try{response=await fetch(this.endpoint+route,{method,body:body&&!(body instanceof FormData)?JSON.stringify(body):body,headers:{...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{}),...headers},signal:AbortSignal.timeout(timeout),redirect:'error'});}catch{throw new Error('无法连接本机 ComfyUI，请启动服务并检查端口');}
  if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error?.message||JSON.stringify(data.node_errors||data.error||('ComfyUI HTTP '+response.status)));}return response;
 }
 async connect(endpoint){
  if([...this.jobs.values()].some(j=>!['completed','failed','cancelled'].includes(j.status)))throw new Error('请等待本编辑器的任务结束后再切换连接');
  this.endpoint=localComfyEndpoint(endpoint);const stats=await(await this.api('/system_stats')).json();this.info=await(await this.api('/object_info')).json();this.attachSocket();
  return {connected:true,version:stats.system?.comfyui_version,devices:(stats.devices||[]).map(d=>({name:d.name,vram:d.vram_total})),h3Ready:requiredH3.every(n=>this.info[n]),missingNodes:requiredH3.filter(n=>!this.info[n]),models:{diffusion:modelChoices(this.info,'UNETLoader','unet_name').filter(n=>/minimax.*h3/i.test(n)),text:modelChoices(this.info,'CLIPLoader','clip_name').filter(n=>/minimax.*h3/i.test(n)),vae:modelChoices(this.info,'VAELoader','vae_name').filter(n=>/minimax.*h3/i.test(n))}};
 }
 attachSocket(){
  this.socket?.close();const url=this.endpoint.replace('http:','ws:')+'/ws?clientId='+this.client;
  this.socket=new WebSocket(url);this.socket.addEventListener('error',()=>{});this.socket.addEventListener('message',event=>{
   if(typeof event.data!=='string')return;let message;try{message=JSON.parse(event.data);}catch{return;}
   const data=message.data||{},job=this.jobs.get(data.prompt_id||this.active);if(!job)return;
   if(message.type==='execution_start'){this.active=data.prompt_id;job.status='running';}
   if(message.type==='executing'&&data.node){job.status='running';job.node=data.node;}
   if(message.type==='progress'){job.progress={value:data.value,max:data.max};}
   if(message.type==='execution_error'){job.status='failed';job.error=String(data.exception_message||'执行失败').slice(0,2000);}
   if(message.type==='execution_interrupted')job.status='cancelled';
  });
 }
 async upload(bytes,name,type='image/png'){
  if(!this.info)await this.connect(this.endpoint);if(bytes.length>24*1024*1024)throw new Error('图片超过 24 MB');
  const ext=/\.(png|jpe?g|webp)$/i.exec(name)?.[0]?.toLowerCase();if(!ext)throw new Error('请选择 PNG、JPEG 或 WebP 图片');
  const filename='studio-'+randomUUID()+ext,form=new FormData();form.append('image',new Blob([bytes],{type}),filename);form.append('type','input');form.append('overwrite','false');
  const value=await(await this.api('/upload/image',{method:'POST',body:form})).json();const image=(value.subfolder?value.subfolder+'/':'')+value.name;this.uploads.add(image);return {image,name};
 }
 async submit(options){
  if(!this.info)await this.connect(this.endpoint);for(const image of options.images||[])if(!this.uploads.has(image))throw new Error('参考图片未通过本编辑器上传');
  const graph=options.workflow?validateAPIWorkflow(options.workflow):buildH3Workflow(options,this.info);
  const result=await(await this.api('/prompt',{method:'POST',body:{prompt:graph,client_id:this.client},timeout:30000})).json();
  if(result.node_errors&&Object.keys(result.node_errors).length)throw new Error(JSON.stringify(result.node_errors));
  const job={id:result.prompt_id,status:'queued',number:result.number,outputs:[],createdAt:Date.now()};this.jobs.set(job.id,job);return job;
 }
 async status(id){const job=this.jobs.get(id);if(!job)throw new Error('未知任务');
  const history=(await(await this.api('/history/'+encodeURIComponent(id))).json())[id];
  if(history){job.outputs=outputs(history);const error=history.status?.messages?.find(m=>m[0]==='execution_error');if(error){job.status='failed';job.error=error[1]?.exception_message;}else if(history.status?.completed)job.status='completed';}
  return {...job,outputs:job.outputs.map((o,index)=>({name:o.filename,category:o.category,url:'/api/comfy/media?job='+encodeURIComponent(id)+'&index='+index}))};
 }
 async cancel(id){
  const job=this.jobs.get(id);if(!job)throw new Error('未知任务');const queue=await(await this.api('/queue')).json();
  if(queue.queue_running?.some(row=>row[1]===id))await this.api('/interrupt',{method:'POST',body:{prompt_id:id}});
  else if(queue.queue_pending?.some(row=>row[1]===id))await this.api('/queue',{method:'POST',body:{delete:[id]}});
  job.status='cancelled';return {cancelled:true};
 }
 async media(id,index,range){const job=this.jobs.get(id),item=job?.outputs?.[index];if(!item)throw new Error('任务输出尚未就绪');const query=new URLSearchParams({filename:item.filename,subfolder:item.subfolder||'',type:item.type});return this.api('/view?'+query,{headers:range?{Range:range}:{},timeout:60000});}
 close(){this.socket?.close();}
}
