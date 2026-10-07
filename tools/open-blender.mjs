import {spawn} from 'node:child_process';import {readFile,access} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath} from 'node:url';import {findBlender} from './blender-bake.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),config={};
for(const name of ['config.json','config.local.json'])try{Object.assign(config,JSON.parse(await readFile(path.join(root,name),'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;}
const file=path.resolve(process.argv[2]||path.join(root,'blender/22-7-Character-Studio.blend'));await access(file);
const blender=await findBlender(config);spawn(blender.executable,[file],{detached:true,stdio:'ignore',windowsHide:false}).unref();
