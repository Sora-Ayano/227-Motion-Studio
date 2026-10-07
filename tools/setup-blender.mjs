import {spawn} from 'node:child_process';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';import path from 'node:path';
import {findBlender} from './blender-bake.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),config={};
for(const name of ['config.json','config.local.json'])try{Object.assign(config,JSON.parse(await readFile(path.join(root,name),'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;}
const blender=await findBlender(config),catalog=JSON.parse(await readFile(path.join(root,'cache/catalog.json'),'utf8'));
const arguments_=process.argv.slice(2),all=arguments_.includes('--all'),library=arguments_.includes('--library');
const value=(name,fallback)=>{const i=arguments_.indexOf(name);return i>=0?arguments_[i+1]:fallback;};
const body=value('--body','120010100');if(!catalog.models.some(m=>m.family==='body'&&m.id===body))throw new Error('未知服装编号');
const profiles=all?catalog.characters:[catalog.characters.find(p=>p.id===value('--character','10100000'))];if(!profiles[0])throw new Error('未知角色编号');
const destination=path.resolve(value('--output',path.join(root,'blender',all?'characters':'')));await mkdir(destination,{recursive:true});
for(const profile of profiles){
 const output=all?path.join(destination,profile.name):destination;await mkdir(output,{recursive:true});
 const args=['--background','--factory-startup','--python-exit-code','1','--python',path.join(root,'tools/blender-character.py'),'--','--root',root,'--output',output,'--character',profile.id,'--body',body,'--frames',value('--frames','91')];
 if(arguments_.includes('--render'))args.push('--render');if(library)args.push('--library');
 console.log('Building',profile.name);
 await new Promise((resolve,reject)=>{const process=spawn(blender.executable,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let errors='';process.stdout.on('data',chunk=>{const text=String(chunk);if(/"blend"|"wardrobe"/.test(text))console.log(text.trim());});process.stderr.on('data',chunk=>errors=String(chunk).slice(-3000));process.on('error',reject);process.on('exit',code=>code===0?resolve():reject(new Error(errors||'Blender build failed')));});
}
console.log('Saved',destination);
