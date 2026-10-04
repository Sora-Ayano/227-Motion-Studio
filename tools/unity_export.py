"""Read original bundles, preserve prefab hierarchy, bind poses, BDEF4 and morphs.
Only derived files under studio/cache are written. Game files are read-only.
"""
from __future__ import annotations
import argparse, csv, json, sqlite3, sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
from types import SimpleNamespace
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
CFG = json.loads((ROOT/'config.example.json').read_text(encoding='utf8'))
for config_name in ['config.json','config.local.json']:
    if (ROOT/config_name).is_file(): CFG.update(json.loads((ROOT/config_name).read_text(encoding='utf8')))
for key in ['assetRoot','gameRoot','catalogDatabase','masterRoot','unityPyVendor','motionRoot','ffmpeg']:
    if CFG.get(key):CFG[key]=str((ROOT/CFG[key]).resolve())
sys.path.insert(0, CFG['unityPyVendor'])
sys.path.insert(0, str(ROOT/'python-libs'))
import UnityPy
from UnityPy.helpers.MeshHelper import MeshHandler
C = np.diag([1.,1.,-1.,1.])

def dump(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp=path.with_suffix('.tmp')
    temp.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'),allow_nan=False),encoding='utf8')
    temp.replace(path)

def table(name):
    p=Path(CFG['masterRoot'])/(name+'.bytes')
    if not p.is_file(): return []
    with p.open(encoding='utf-8-sig', newline='') as f:
        rows=list(csv.DictReader(f))
    return [r for r in rows[1:] if next(iter(r.values()),'') not in ('0','1')]

def resolve_bundle(path):
    normalized=str(path).replace('\\','/')
    if '/resources/source-game/' in normalized:suffix=normalized.split('/resources/source-game/',1)[1]
    elif 'com.aniplex.nananiji/' in normalized:suffix=normalized.rsplit('com.aniplex.nananiji/',1)[1]
    else:suffix=normalized
    candidates=[Path(CFG['gameRoot'])/suffix,ROOT/path,Path(path),Path(CFG['assetRoot'])/'com.aniplex.nananiji.7z'/'com.aniplex.nananiji'/suffix]
    return str(next((p for p in candidates if p.is_file()),candidates[0]))

def catalog():
    db=sqlite3.connect(f"file:{Path(CFG['catalogDatabase']).as_posix()}?mode=ro",uri=True)
    rows=db.execute('SELECT la.logical_path,wr.local_path FROM logical_assets la JOIN wire_resources wr USING(cache_key,path_md5) WHERE la.logical_path LIKE ? ORDER BY la.logical_path',('charactermodels/%',)).fetchall()
    db.close()
    raw={}
    for logical,bundle in rows:
        parts=logical.split('/'); key='/'.join(parts[1:3])
        if parts[1] not in ['body','face','hair','accessory','skin']: continue
        found=resolve_bundle(bundle)
        entry=raw.setdefault(key,{'bundle':found,'paths':[]})
        if Path(found).is_file(): entry['bundle']=found
        if logical not in entry['paths']: entry['paths'].append(logical)
    dump(ROOT/'cache/raw-catalog.json',raw)
    chars={r['id']:r for r in table('character')}
    face={r['id']:r['prefab_id'] for r in table('model_face')}
    hair={r['id']:r['prefab_id'] for r in table('model_hair')}
    # These tables contain legitimate id=1 rows after their sentinel row.
    def alltable(name):
        p=Path(CFG['masterRoot'])/(name+'.bytes')
        if not p.is_file(): return []
        with p.open(encoding='utf-8-sig',newline='') as f: return list(csv.DictReader(f))[2:]
    face={r['id']:r['prefab_id'] for r in alltable('model_face')}
    hair={r['id']:r['prefab_id'] for r in alltable('model_hair')}
    skins={r['id']:r['material_id'] for r in alltable('model_skin')}
    characters=[]
    for r in table('model_character_settings'):
        f=face.get(r['face_model_id']); h=hair.get(r['hair_model_id'])
        if f'face/{f}' not in raw or f'hair/{h}' not in raw:continue
        char=chars.get(r['master_character_id'],{})
        characters.append({'id':r['master_character_id'],'name':char.get('name',f), 'color':char.get('unique_color','#a5a7e7'),
            'face':f,'hair':h,'skin':skins.get(r['skin_texture_id'],'30000000'),
            'bodyScale':float(r['body_scale']),'headScale':float(r['head_scale'])})
    costumes=table('model_costume')
    models=[]
    for key,e in raw.items():
        family,mid=key.split('/')
        labels=[r['name'] for r in costumes if str(int(r.get('master_model_id') or '0')//100*100)==mid and r.get('model_costume_type') in (['BODY'] if family=='body' else ['HEAD','FACE','BACK'])] if family in ['body','accessory'] else []
        owner=next((p for p in characters if p.get(family)==mid),None) if family in ['hair','face'] else None
        label=owner['name']+(' · 发型' if family=='hair' else ' · 脸部') if owner else labels[0] if labels else {'30000000':'暖肤色','30000100':'浅肤色','30000200':'自然肤色'}.get(mid,mid)
        models.append({'key':key,'family':family,'id':mid,'label':label,'available':Path(e['bundle']).is_file(),
            'variants':[{'id':str(int(r['master_model_id'])%100).zfill(2),'label':r['name']} for r in costumes if family in ['body','accessory'] and str(int(r.get('master_model_id') or '0')//100*100)==mid]})
    result={'version':1,'characters':characters,'models':models,'counts':{f:sum(m['family']==f and m['available'] for m in models) for f in ['body','face','hair','accessory','skin']}}
    dump(ROOT/'cache/catalog.json',result)
    return result

def matrix(t):
    p,q,s=t.m_LocalPosition,t.m_LocalRotation,t.m_LocalScale
    x,y,z,w=q.x,q.y,q.z,q.w
    return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),p.x],
        [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),p.y],
        [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y),p.z],[0,0,0,1]])@np.diag([s.x,s.y,s.z,1])

def flat(m): return m.T.flatten().round(9).tolist()
def bind_matrix(b): return np.array([[getattr(b,f'e{r}{c}') for c in range(4)] for r in range(4)])

def export(key):
    raw=json.loads((ROOT/'cache/raw-catalog.json').read_text(encoding='utf8'))
    entry=raw[key]; family,mid=key.split('/')
    bundle=resolve_bundle(entry['bundle'])
    if not Path(bundle).is_file():raise FileNotFoundError(bundle)
    env=UnityPy.load(bundle)
    gos={o.path_id:o.read().m_Name for o in env.objects if o.type.name=='GameObject'}
    ts={o.path_id:o.read() for o in env.objects if o.type.name=='Transform'}
    gt={t.m_GameObject.path_id:k for k,t in ts.items()}
    worlds={}
    def world(k):
        if k not in worlds:
            t=ts[k]; worlds[k]=(world(t.m_Father.path_id) if t.m_Father.path_id else np.eye(4))@matrix(t)
        return worlds[k]
    renderers={}
    filters={o.read().m_GameObject.path_id:o.read().m_Mesh for o in env.objects if o.type.name=='MeshFilter'}
    for o in env.objects:
        if o.type.name=='SkinnedMeshRenderer':r=o.read()
        elif o.type.name=='MeshRenderer':
            renderer=o.read(); mesh=filters.get(renderer.m_GameObject.path_id)
            if mesh is None:continue
            r=SimpleNamespace(m_Mesh=mesh,m_GameObject=renderer.m_GameObject,m_Materials=renderer.m_Materials,m_Bones=[])
        else:continue
        if not r.m_Mesh.path_id:continue
        previous=renderers.get(r.m_Mesh.path_id)
        if previous is None or np.linalg.norm(world(gt[r.m_GameObject.path_id])[:3,3])>np.linalg.norm(world(gt[previous.m_GameObject.path_id])[:3,3]):
            renderers[r.m_Mesh.path_id]=r
    # Include ancestors, not just weighted bones; do not flatten or rename the rig.
    used=set()
    for r in renderers.values():
        for p in r.m_Bones:
            k=p.path_id
            while k and k not in used:
                used.add(k); k=ts[k].m_Father.path_id
    ordered=[]; pending=set(used)
    while pending:
        ready=sorted(k for k in pending if ts[k].m_Father.path_id not in pending)
        if not ready:raise ValueError('Transform hierarchy cycle')
        ordered.extend(ready); pending.difference_update(ready)
    index={k:i for i,k in enumerate(ordered)}
    bones=[]
    for k in ordered:
        t=ts[k]; p,q,s=t.m_LocalPosition,t.m_LocalRotation,t.m_LocalScale
        bones.append({'name':gos[t.m_GameObject.path_id],'parent':index.get(t.m_Father.path_id,-1),
            'position':[p.x,p.y,-p.z],'quaternion':[-q.x,-q.y,q.z,q.w],'scale':[s.x,s.y,s.z]})
    outdir=ROOT/'cache/components'/family/mid
    outdir.mkdir(parents=True,exist_ok=True)
    textures={}; texture_objects={}; texture_sets={}
    for logical,o in env.container.items():
        if o.type.name!='Texture2D':continue
        path=Path(str(logical)); name=path.name.lower()
        if name.endswith('_outline.png'):continue
        rel='/'.join(path.parts[3:]); target=outdir/rel
        target.parent.mkdir(parents=True,exist_ok=True)
        if not target.is_file():o.read().image.save(target)
        url=f'/cache/components/{family}/{mid}/{rel}'
        textures.setdefault(name,url); texture_objects[o.path_id]=url
        if '/material/' in str(logical) or '/materials/' in str(logical):
            folder=path.parent.name
            texture_sets.setdefault(folder,{})[name]=url
        if '/subwear/' in str(logical):
            texture_sets.setdefault('subwear_'+path.parent.name,{})[name]=url
    meshes=[]; max_bind_error=0.
    for r in renderers.values():
        mesh=r.m_Mesh.read(); h=MeshHandler(mesh); h.process()
        rw=world(gt[r.m_GameObject.path_id]); w=C@rw
        verts=np.array(h.m_Vertices,dtype=float)
        positions=(np.c_[verts,np.ones(len(verts))]@w.T)[:,:3]
        source_normals=np.array(h.m_Normals or [(0,1,0)]*len(verts))[:,:3]
        ids=np.array(h.m_BoneIndices or [[0,0,0,0]]*len(verts),dtype=int)
        weights=np.array(h.m_BoneWeights or [[1,0,0,0]]*len(verts),dtype=float)
        ids=ids[:,:4]; weights=weights[:,:4]
        sums=weights.sum(axis=1); weights/=np.maximum(sums[:,None],1e-9)
        weights[sums<1e-9]=[1,0,0,0]
        invs=[]; slots=[]; original_pose_error=0.; skin_matrices=[]
        for i,p in enumerate(r.m_Bones):
            slots.append(index[p.path_id])
            native_world=C@world(p.path_id)@C
            original_inv=C@bind_matrix(mesh.m_BindPose[i])@np.linalg.inv(rw)@C
            original_pose_error=max(original_pose_error,float(np.max(np.abs(native_world@original_inv-np.eye(4)))))
            skin_matrices.append(C@world(p.path_id)@bind_matrix(mesh.m_BindPose[i]))
            # Some prefabs adjust ribbon bones after binding. Bake that original
            # Unity deformation once, then rebind to the preserved native pose.
            inv=np.linalg.inv(native_world)
            invs.append(flat(inv))
            max_bind_error=max(max_bind_error,float(np.max(np.abs(native_world@inv-np.eye(4)))))
        if skin_matrices:
            skin_matrices=np.array(skin_matrices)
            blended=np.sum(skin_matrices[ids]*weights[:,:,None,None],axis=1)
            positions=np.einsum('nij,nj->ni',blended,np.c_[verts,np.ones(len(verts))])[:,:3]
            linear=blended[:,:3,:3]
            normals=np.einsum('nij,nj->ni',np.transpose(np.linalg.pinv(linear),(0,2,1)),source_normals)
        else:
            linear=None; normals=source_normals@np.linalg.inv(w[:3,:3])
        normals/=np.maximum(np.linalg.norm(normals,axis=1,keepdims=True),1e-9)
        mats=[];indices=[];groups=[]
        for slot,triangles in enumerate(h.get_triangles()):
            start=len(indices)
            for a,b,c in triangles:indices.extend([a,c,b])
            mat=r.m_Materials[slot].read() if slot<len(r.m_Materials) and r.m_Materials[slot].path_id else None
            name=mat.m_Name if mat else f'material_{slot}'
            tex=None
            if mat:
                for prop,texenv in mat.m_SavedProperties.m_TexEnvs:
                    if prop in ['_BaseTex','_MainTex'] and texenv.m_Texture.path_id:
                        tex=texture_objects.get(texenv.m_Texture.path_id)
            lower=name.lower()
            if not tex:
                candidates=(['eye.png'] if 'eye' in lower else ['face.png']) if family=='face' else (['defacc.png'] if 'defacc' in lower else ['hair.png']) if family=='hair' else ['faceacc.png','bodyacc.png','headacc.png','defacc.png','acc.png'] if family=='accessory' else ['cos.png','body.png']
                if 'skin' not in lower:tex=next((textures[n] for n in candidates if n in textures),None)
            # The prefab has placeholder Standard materials. The game swaps in
            # the authored BaseTex / ShadowTex / ToonRamp material at runtime.
            tex_name=Path(tex).name if tex else None
            shadow_name=tex_name.replace('.png','_sd.png') if tex_name else None
            mats.append({'name':name,'texture':tex,'shadowTexture':textures.get(shadow_name),
                'rampTexture':textures.get('toonlamp.png'),'lining':'noline' in lower or 'lining' in lower,
                'skin':'skin' in lower,'color':[1,1,1] if tex else [1,.86,.8] if 'skin' in lower else [1,1,1]})
            groups.append({'start':start,'count':len(indices)-start,'materialIndex':slot})
        morphs=[]
        shapes=mesh.m_Shapes
        for channel in shapes.channels:
            shape=shapes.shapes[channel.frameIndex+channel.frameCount-1]
            delta=[]
            for v in shapes.vertices[shape.firstVertex:shape.firstVertex+shape.vertexCount]:
                d=(linear[v.index] if linear is not None else w[:3,:3])@np.array([v.vertex.x,v.vertex.y,v.vertex.z])
                delta.append([v.index,*d.round(9).tolist()])
            morphs.append({'name':channel.name,'deltas':delta})
        meshes.append({'name':mesh.m_Name,'positions':positions.round(8).flatten().tolist(),'normals':normals.round(7).flatten().tolist(),
            'uv':np.array(h.m_UV0 or [(0,0)]*len(verts))[:,:2].round(7).flatten().tolist(),'indices':indices,
            'skinIndex':ids.flatten().tolist(),'skinWeight':weights.round(8).flatten().tolist(),'bones':slots,'inverses':invs,
            'materials':mats,'groups':groups,'morphs':morphs,'sourceBindError':round(original_pose_error,7)})
    result={'version':5,'key':key,'bones':bones,'meshes':meshes,'textures':textures,'textureSets':texture_sets,'bindError':round(max_bind_error,7),
        'attachmentMatrix':flat(C@np.array([[0,0,-1,0],[-1,0,0,1.41],[0,1,0,.005],[0,0,0,1]])@C) if family in ['face','hair','accessory'] else None}
    dump(outdir/'model.json',result)
    return {'key':key,'bones':len(bones),'meshes':len(meshes),'morphs':sum(len(m['morphs']) for m in meshes),'bindError':result['bindError']}

if __name__=='__main__':
    p=argparse.ArgumentParser(); p.add_argument('command',choices=['catalog','export','bulk']); p.add_argument('key',nargs='?'); args=p.parse_args()
    if args.command=='bulk':
        c=catalog(); keys=[m['key'] for m in c['models'] if m['available']]; failures=[]
        with ProcessPoolExecutor(max_workers=3) as pool:
            jobs={pool.submit(export,k):k for k in keys}
            for n,future in enumerate(as_completed(jobs),1):
                try:future.result()
                except Exception as e:failures.append({'key':jobs[future],'error':str(e)})
                if n%15==0 or n==len(keys):print(json.dumps({'done':n,'total':len(keys),'failures':len(failures)}),flush=True)
        dump(ROOT/'cache/bulk-report.json',{'total':len(keys),'exported':len(keys)-len(failures),'failures':failures})
        sys.exit(bool(failures))
    print(json.dumps(catalog()['counts'] if args.command=='catalog' else export(args.key),ensure_ascii=False))
