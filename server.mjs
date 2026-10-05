import {checkGitHubUpdate,prepareGitHubUpdate} from './tools/github-update.mjs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, stat, readdir, access, mkdir, writeFile, copyFile } from 'node:fs/promises';
import {constants} from 'node:fs';
import { createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {encodeMP4} from './tools/mp4.mjs';
import {FrameVideo} from './tools/frame-video.mjs';
import {videoCapabilities} from './tools/video-encoder.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const config=JSON.parse(await readFile(path.join(root,'config.example.json'),'utf8'));
for(const file of ['config.json','config.local.json'])try{Object.assign(config,JSON.parse(await readFile(path.join(root,file),'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;}
if(process.env.STUDIO_PORT)config.port=Number(process.env.STUDIO_PORT);
for(const key of ['assetRoot','gameRoot','catalogDatabase','masterRoot','unityPyVendor','motionRoot','ffmpeg'])if(config[key])config[key]=path.resolve(root,config[key]);
const jobs=new Map();
const savedOutputs=new Map();
const renderedOutputs=new Map();
async function body(req,limit){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw new Error('上传内容超过允许大小');chunks.push(chunk);}return Buffer.concat(chunks);}
const appVersion=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;let pendingUpdate=null;
const startedAt=Date.now();
const writeSession=randomUUID()+randomUUID();
function python(args){return new Promise((resolve,reject)=>{
 const p=spawn(config.python,[path.join(root,'tools/unity_export.py'),...args],{cwd:root,windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'}});
 let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',reject);p.on('close',code=>code===0?resolve(out):reject(new Error(err||`资源转换失败 (${code})`)));
});}
let catalog;try{catalog=JSON.parse(await readFile(path.join(root,'cache/catalog.json'),'utf8'));}catch{try{await access(config.catalogDatabase);await python(['catalog']);catalog=JSON.parse(await readFile(path.join(root,'cache/catalog.json'),'utf8'));}catch{catalog={characters:[],models:[],counts:{body:0,hair:0,face:0,accessory:0,skin:0}};}}
async function scan(dir,base=dir){let out=[];for(const e of await readdir(dir,{withFileTypes:true})){
 if(['studio','node_modules','.git','.npm-cache'].includes(e.name))continue;
 const full=path.join(dir,e.name);if(e.isDirectory())out.push(...await scan(full,base));else if(/\.(vmd|wav|mp3|ogg)$/i.test(e.name))out.push({id:Buffer.from(path.relative(base,full)).toString('base64url'),name:e.name,path:path.relative(base,full).replaceAll('\\','/'),kind:/\.vmd$/i.test(e.name)?'vmd':'audio'});
}return out;}
try{catalog.motions=JSON.parse(await readFile(path.join(root,'web/data/motions.json'),'utf8'));}catch{try{catalog.motions=await scan(config.motionRoot);}catch{catalog.motions=[];}}
try{catalog.gameMotions=JSON.parse(await readFile(path.join(root,'web/data/game-motions.json'),'utf8'));}catch{catalog.gameMotions={motions:[],errors:[]};}
try{catalog.stages=JSON.parse(await readFile(path.join(root,'web/data/stages.json'),'utf8'));}catch{catalog.stages={stages:[],backgrounds:[],errors:[]};}
try{catalog.gameCameras=JSON.parse(await readFile(path.join(root,'web/data/game-cameras.json'),'utf8'));}catch{catalog.gameCameras={cameras:[]};}
try{const songs=new Set(catalog.gameMotions.motions.map(m=>m.id.split('-')[0]));catalog.motions.push(...JSON.parse(await readFile(path.join(root,'web/data/game-audio.json'),'utf8')).audio.filter(a=>songs.has(a.songId)));}catch{}
try{catalog.gameLayouts=JSON.parse(await readFile(path.join(root,'web/data/game-layouts.json'),'utf8'));}catch{catalog.gameLayouts={};}
const importedRoot=path.join(config.assetRoot,'imported');
function localID(id){if(!/^[a-z0-9-]{1,80}$/i.test(id||''))throw new Error('本地资源编号无效');return id;}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.vmd':'application/octet-stream','.wav':'audio/wav','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wasm':'application/wasm','.mp4':'video/mp4','.webm':'video/webm','.jpg':'image/jpeg','.jpeg':'image/jpeg','.glb':'model/gltf-binary','.gltf':'model/gltf+json'};
function inside(base,target){const rel=path.relative(base,target);return !rel.startsWith('..')&&!path.isAbsolute(rel);}
function localWrite(req){if(req.headers['x-studio-session']===writeSession)return;const origin=req.headers.origin;if(!origin)return;let parsed;try{parsed=new URL(origin);}catch{throw new Error('请从 http://127.0.0.1:'+config.port+'/ 打开编辑器后再导入或保存');}const port=new URL('http://'+req.headers.host).port;if(parsed.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname.toLowerCase())||parsed.port!==port)throw new Error('仅允许本机编辑器导入或保存，请使用 http://127.0.0.1:'+config.port+'/');}
async function serve(res,p,req){const s=await stat(p);if(!s.isFile())throw new Error('文件不存在');const h={'Content-Type':mime[path.extname(p)]||'application/octet-stream','Content-Length':s.size,'X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'};
 if(/\.(mp4|webm|ogg|mp3|wav)$/i.test(p)){h['Accept-Ranges']='bytes';const range=req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);if(range&&(range[1]||range[2])){const start=range[1]?Number(range[1]):Math.max(0,s.size-Number(range[2])),end=range[1]?(range[2]?Math.min(s.size-1,Number(range[2])):s.size-1):s.size-1;if(start>=s.size||start>end){res.writeHead(416,{'Content-Range':`bytes */${s.size}`});res.end();return;}h['Content-Range']=`bytes ${start}-${end}/${s.size}`;h['Content-Length']=end-start+1;res.writeHead(206,h);if(req.method==='HEAD')res.end();else createReadStream(p,{start,end}).pipe(res);return;}}
 if(req.method==='HEAD'){res.writeHead(200,h);res.end();return;}res.writeHead(200,h);createReadStream(p).pipe(res);}
const server=http.createServer(async(req,res)=>{
 try{
  res.setHeader('Content-Security-Policy',"default-src 'self' blob:; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self' blob:; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' blob:; object-src 'none'");
  const host=req.headers.host||'';if(!/^((localhost|127\.0\.0\.1)(:\d+)?|\[::1\](:\d+)?)$/.test(host)){res.writeHead(403);res.end('仅允许本机访问');return;}
  const url=new URL(req.url,'http://localhost');const route=decodeURIComponent(url.pathname);
  if(req.method==='GET'&&route==='/api/session'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({token:writeSession}));return;}
  if(req.method==='GET'&&route==='/api/video-capabilities'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(await videoCapabilities(config)));return;}
  if(route==='/api/save-directory'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({directory:path.join(root,'exports')+path.sep}));return;}
  if(req.method==='POST'&&route.startsWith('/api/frame-video/')){localWrite(req);const action=route.slice(17);let result;
   if(action==='start'){if(jobs.has('mp4')||jobs.has('frame-mp4'))throw new Error('已有视频正在导出');jobs.set('frame-mp4',{starting:true});try{const job=await FrameVideo.create(path.join(root,'exports'),JSON.parse((await body(req,4096)).toString()),config);jobs.set('frame-mp4',job);job.onExpire=()=>{if(jobs.get('frame-mp4')===job)jobs.delete('frame-mp4');};result={id:job.id};}catch(e){jobs.delete('frame-mp4');throw e;}}
   else{const job=jobs.get('frame-mp4');if(!job||job.id!==url.searchParams.get('id'))throw new Error('逐帧导出任务不存在或已结束');
    if(action==='frame'){await job.frame(Number(url.searchParams.get('index')),await body(req,32*1048576));result={frames:job.index};}
    else if(action==='audio'){await job.setAudio(await body(req,250*1048576),Number(url.searchParams.get('offset')),Number(url.searchParams.get('gain')));result={audio:true};}
    else if(action==='finish'){try{result=await job.finish();renderedOutputs.set(result.name,job.output);}catch(e){await job.cancel();throw e;}finally{jobs.delete('frame-mp4');}}
    else if(action==='cancel'){try{await job.cancel();result={cancelled:true};}finally{jobs.delete('frame-mp4');}}else throw new Error('未知逐帧操作');
   }res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(result));return;
  }
  if(req.method==='POST'&&route==='/api/shutdown'){localWrite(req);if(jobs.size)throw new Error('请等待正在进行的编码或资源转换完成后关闭');res.writeHead(200,{'Content-Type':'application/json'});res.end('{"stopped":true}');setTimeout(()=>{server.close();server.closeAllConnections();process.exit(0);},300).unref();return;}
  if(req.method==='POST'&&route==='/api/save-output'){
   localWrite(req);
   const target=url.searchParams.get('path')||'';if(!/^[a-z]:\\/i.test(target)||/[\x00-\x1f<>:"|?*]/.test(target.slice(3))||!/^.+\.(json|zip|glb|vmd|png|webm|mp4)$/i.test(target)||/(?:^|[\\/])\.(?:git|agents|codex|aws)(?:[\\/]|$)/i.test(target))throw new Error('请输入合法的本机完整文件路径与导出扩展名');
   const full=path.resolve(target);await mkdir(path.dirname(full),{recursive:true});const source=renderedOutputs.get(url.searchParams.get('render')),overwrite=url.searchParams.get('overwrite')==='true';
   try{if(url.searchParams.has('render')){if(!source)throw new Error('视频保存引用已过期，编码文件仍在 exports');if(full.toLowerCase()!==source.toLowerCase())await copyFile(source,full,overwrite?0:constants.COPYFILE_EXCL);}else{const bytes=await body(req,256*1048576);if(!bytes.length)throw new Error('保存内容为空');await writeFile(full,bytes,{flag:overwrite?'w':'wx'});}}catch(e){if(e.code==='EEXIST')throw new Error('同名文件已存在，请更改文件名或勾选允许覆盖');throw e;}
   const id=randomUUID();savedOutputs.set(id,full);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({name:path.basename(full),path:full,url:'/saved-outputs/'+id}));return;
  }
  if(req.method==='POST'&&route==='/api/render-mp4'){
   localWrite(req);if(jobs.has('mp4')||jobs.has('frame-mp4'))throw new Error('已有 MP4 正在编码，请等待完成');
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>256*1024*1024)throw new Error('视频不能超过 256 MB');chunks.push(chunk);}if(!size)throw new Error('录制的视频为空');
   const directory=path.join(root,'exports');await mkdir(directory,{recursive:true});const stem=Date.now()+'-22-7-preview',input=path.join(directory,stem+'.webm'),output=path.join(directory,stem+'.mp4');await writeFile(input,Buffer.concat(chunks));
   const task=encodeMP4(input,output,{...config,fps:url.searchParams.get('fps')==='60'?60:30,includeAudio:url.searchParams.get('audio')!=='false'});jobs.set('mp4',task);try{await task;}finally{jobs.delete('mp4');}
   res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({url:'/exports/'+encodeURIComponent(stem+'.mp4'),name:stem+'.mp4'}));return;
  }
  if(req.method==='POST'&&route==='/api/update/prepare'){localWrite(req);pendingUpdate=await prepareGitHubUpdate(root,appVersion);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(pendingUpdate));return;}
  if(req.method==='POST'&&route==='/api/update/apply'){localWrite(req);if(!pendingUpdate||url.searchParams.get('token')!==pendingUpdate.token)throw new Error('请先下载并检查更新包');if(jobs.size)throw new Error('资源转换仍在进行，请稍后更新');const helper=spawn(process.execPath,[path.join(root,'tools/apply-update.mjs'),pendingUpdate.token,String(process.pid)],{cwd:root,windowsHide:true,detached:true,stdio:'ignore'});helper.unref();res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({restarting:true,startedAt}));setTimeout(()=>{server.closeAllConnections();server.close(()=>process.exit(0));},500);return;}
  if(req.method==='POST'&&route==='/api/export'){
   localWrite(req);
   const name=url.searchParams.get('name')||'export.json';if(name.length>160||/[\\/\x00-\x1f<>:"|?*]/.test(name)||!/^.+\.(json|zip|glb|vmd|png|webm)$/i.test(name))throw new Error('导出文件名不合法');
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>256*1024*1024)throw new Error('导出文件不能超过 256 MB');chunks.push(chunk);}
   const directory=path.join(root,'exports');await mkdir(directory,{recursive:true});const filename=Date.now()+'-'+name;await writeFile(path.join(directory,filename),Buffer.concat(chunks));res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({url:'/exports/'+encodeURIComponent(filename),name:filename}));return;
  }
  if(req.method==='POST'&&route==='/api/local-asset'){
   localWrite(req);
   const id=localID(url.searchParams.get('id')),name=url.searchParams.get('name')||'';
   if(name.length>160||/[\\/\x00-\x1f<>:"|?*]/.test(name)||/[. ]$/.test(name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)||!/^.+\.(json|glb|gltf|fbx|obj|mtl|pmx|bin|png|jpe?g|bmp|tga|webp|vmd|wav|mp3|ogg|m4a|flac|mp4|webm|mov|hdr|exr)$/i.test(name))throw new Error('导入文件名不合法');
   const directory=path.join(importedRoot,id);await mkdir(directory,{recursive:true});const chunks=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>250*1024*1024)throw new Error('单个导入文件不能超过 250 MB');chunks.push(chunk);}
   await writeFile(path.join(directory,name),Buffer.concat(chunks));res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({url:'/local-assets/'+id+'/'+encodeURIComponent(name),path:'resources/imported/'+id+'/'+name}));return;
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
  if(route==='/api/update/check'){const info=await checkGitHubUpdate(appVersion);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(info));return;}
  if(route==='/api/health'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({app:'227-motion-studio',pid:process.pid,root,startedAt}));return;}
  if(route.startsWith('/saved-outputs/')){const p=savedOutputs.get(route.slice(15));if(!p)throw new Error('保存链接已过期，文件仍在选定目录');await serve(res,p,req);return;}
  if(route.startsWith('/api/local-assets/')){const id=localID(route.slice(18));const files=(await readdir(path.join(importedRoot,id),{withFileTypes:true})).filter(f=>f.isFile()).map(f=>({name:f.name,url:'/local-assets/'+id+'/'+encodeURIComponent(f.name)}));res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({files}));return;}
  if(route.startsWith('/local-assets/')){const p=path.resolve(importedRoot,route.slice(14));if(!inside(importedRoot,p))throw new Error('路径不合法');await serve(res,p,req);return;}
  if(route==='/api/catalog'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(catalog));return;}
  if(route==='/api/component'){
   const key=url.searchParams.get('key');if(!catalog.models.some(m=>m.key===key&&m.available))throw new Error('未知组件');
   const p=path.join(root,'cache/components',key,'model.json');
   try{await access(p);}catch{if(!jobs.has(key)){const job=python(['export',key]).finally(()=>jobs.delete(key));jobs.set(key,job);}await jobs.get(key);}
   await serve(res,p,req);return;
  }
  if(route.startsWith('/api/motion/')){const item=catalog.motions.find(m=>m.id===route.slice(12));if(!item)throw new Error('未知动作');const base=item.url?path.join(root,'web/motions'):path.resolve(config.motionRoot),p=path.resolve(base,item.path);if(!inside(base,p))throw new Error('路径不合法');await serve(res,p,req);return;}
  for(const [prefix,directory] of [['/vision/','@mediapipe/tasks-vision'],['/mmd/','mmd-parser/build'],['/zip/','fflate/esm']])if(route.startsWith(prefix)){const base=path.join(root,'node_modules',directory),p=path.resolve(base,route.slice(prefix.length));if(!inside(base,p))throw new Error('路径不合法');await serve(res,p,req);return;}
  if(route.startsWith('/exports/')){const base=path.join(root,'exports'),p=path.resolve(base,route.slice(9));if(!inside(base,p))throw new Error('路径不合法');res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(path.basename(p))}`);await serve(res,p,req);return;}
  const p=route.startsWith('/vendor/')?path.join(root,'node_modules/three',route.slice(8)):route.startsWith('/cache/')?path.join(root,route):path.join(root,'web',route==='/'?'index.html':route);
  const base=route.startsWith('/vendor/')?path.join(root,'node_modules/three'):route.startsWith('/cache/')?path.join(root,'cache'):path.join(root,'web');
  if(!inside(base,p))throw new Error('路径不合法');await serve(res,p,req);
 }catch(e){if(!res.headersSent){res.writeHead(404,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:e.message}));}else res.destroy();}
});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`端口 ${config.port} 已占用，请修改 config.local.json 的 port。`:e);process.exitCode=1;});
server.listen(config.port,'127.0.0.1',()=>console.log(`22/7 Motion Studio: http://127.0.0.1:${config.port}\n${catalog.characters.length} 个角色 · ${catalog.counts.body} 套服装 · ${catalog.motions.filter(m=>m.kind==='vmd').length} 个 VMD`));
