"""Build editable native-rig character scenes. Run with Blender --background --python.

Paths are command-line arguments; textures are packed into the resulting .blend.
No Unity/MMD axis guessing: native local matrices and inverse bind matrices are used.
"""
import bpy, bmesh, json, sys, math, zlib, struct, argparse
from pathlib import Path
from mathutils import Matrix, Quaternion, Vector

parser = argparse.ArgumentParser()
parser.add_argument('--root', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--character', default='10100000')
parser.add_argument('--body', default='120010100')
parser.add_argument('--motion', default='13100001-3')
parser.add_argument('--frames', type=int, default=91)
parser.add_argument('--render', action='store_true')
parser.add_argument('--library', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
root, output = Path(args.root).resolve(), Path(args.output).resolve()
output.mkdir(parents=True, exist_ok=True)
C = Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
CI = C.inverted()
catalog_file=root/'cache/blender-catalog.json'
catalog = json.loads((catalog_file if catalog_file.is_file() else root/'cache/catalog.json').read_text(encoding='utf8'))
profile = next(c for c in catalog['characters'] if c['id'] == args.character)
stats = {'character': profile['name'], 'body': args.body, 'rigs': [], 'garments': [], 'bindError': 0}
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.name = '22-7 · Character Studio'
scene.unit_settings.system = 'METRIC'; scene.unit_settings.scale_length = 1
scene.render.fps = 30; scene.frame_start = 1; scene.frame_end = max(2, args.frames)
scene.gravity = (0,0,-9.81)

def collection(name, parent=None):
    coll=bpy.data.collections.new(name); (parent or scene.collection).children.link(coll); return coll

character = collection(profile['name'] + ' · Native Unity Rig')
collision_collection = collection('身体碰撞体 · 仅解算')
studio = collection('柔光摄影棚')

def move_to(obj, coll):
    for old in list(obj.users_collection): old.objects.unlink(obj)
    coll.objects.link(obj)

def from_array(values):
    return Matrix(tuple(tuple(values[c*4+r] for c in range(4)) for r in range(4)))

def local_matrix(bone):
    q=bone['quaternion']
    return Matrix.LocRotScale(Vector(bone['position']),Quaternion((q[3],q[0],q[1],q[2])),Vector(bone['scale']))

def world_matrices(bones, locals=None):
    result=[]
    for i,b in enumerate(bones):
        local=locals[i] if locals else local_matrix(b)
        result.append(result[b['parent']] @ local if b['parent']>=0 else local)
    return result

def load_component(family, identity):
    data=json.loads((root/'cache/components'/family/identity/'model.json').read_text(encoding='utf8'))
    data['label']=next((m['label'] for m in catalog['models'] if m['key']==family+'/'+identity),'')
    return data

def fabric_class(component):
    label=component.get('label','')
    if any(s in label for s in ['婚纱','荷叶','透纱','夏威夷','silk']):return 'silk'
    if any(s in label for s in ['制服','女仆','哥特','洛丽塔','structured']) or sum('skirt' in b['name'].lower() for b in component.get('bones',[]))>16:return 'structured'
    return 'cotton'

skin_data = load_component('skin', profile['skin'])
body_data = load_component('body', args.body)
body_world = world_matrices(body_data['bones'])
head_id = next(i for i,b in enumerate(body_data['bones']) if b['name']=='BodyHead')
image_cache={}; material_cache={}

def image(url):
    if not url: return None
    if url not in image_cache:
        p=root/url.lstrip('/')
        if not p.is_file(): raise RuntimeError('Texture missing: '+url)
        im=bpy.data.images.load(str(p),check_existing=True); im.pack();im.filepath='//packed/'+p.name;image_cache[url]=im
    return image_cache[url]

def make_material(definition, family, component):
    url = skin_data['textures'].get('skin.png') if definition.get('skin') else definition.get('texture')
    kind='skin' if definition.get('skin') or family=='face' and 'eye' not in definition['name'].lower() else 'hair' if family=='hair' else 'eye' if family=='face' else 'fabric'
    fabric=fabric_class(component);key=(url,kind,definition.get('lining',False),fabric)
    if key in material_cache: return material_cache[key]
    mat=bpy.data.materials.new(family+' · '+definition['name']);mat.use_nodes=True
    nodes,links=mat.node_tree.nodes,mat.node_tree.links
    bs=nodes.get('Principled BSDF');bs.inputs['Roughness'].default_value={'skin':.61,'hair':.42,'eye':.24,'fabric':.76}[kind]
    bs.inputs['Specular IOR Level'].default_value={'skin':.23,'hair':.3,'eye':.28,'fabric':.24}[kind]
    bs.inputs['IOR'].default_value=1.46
    bs.inputs['Base Color'].default_value=(*definition.get('color',[1,1,1]),1)
    if kind=='fabric':
        bs.inputs['Roughness'].default_value=.52 if fabric=='silk' else .76
        bs.inputs['Sheen Weight'].default_value=.26;bs.inputs['Sheen Roughness'].default_value=.72
        uv=nodes.new('ShaderNodeTexCoord');uv.location=(-800,-300)
        noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=600;noise.inputs['Detail'].default_value=2;noise.location=(-600,-300)
        bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.055;bump.inputs['Distance'].default_value=.00025;bump.location=(-200,-280)
        links.new(uv.outputs['Generated'],noise.inputs['Vector']);links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],bs.inputs['Normal'])
    if kind=='skin':
        bs.inputs['Subsurface Weight'].default_value=.035;bs.inputs['Subsurface Radius'].default_value=(.7,.3,.18)
        bs.inputs['Subsurface Scale'].default_value=.012
    if url:
        tex=nodes.new('ShaderNodeTexImage');tex.image=image(url);tex.location=(-500,180);links.new(tex.outputs['Color'],bs.inputs['Base Color'])
        # The source masks contain bangs, lashes and accessory cutouts.
        if family in ('hair','face','accessory'):
            transparent=nodes.new('ShaderNodeBsdfTransparent');mix=nodes.new('ShaderNodeMixShader');mix.location=(300,100)
            links.new(tex.outputs['Alpha'],mix.inputs[0]);links.new(transparent.outputs[0],mix.inputs[1]);links.new(bs.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],nodes.get('Material Output').inputs['Surface'])
    mat['source_texture']=url or '';mat['material_class']=kind
    material_cache[key]=mat;return mat

def make_rig(data, family, coll, part_matrix=Matrix.Identity(4)):
    arm=bpy.data.armatures.new(family+' · Unity Skeleton');rig=bpy.data.objects.new(family+' · 原生骨架',arm);coll.objects.link(rig)
    rig.matrix_world=Matrix.Scale(profile.get('bodyScale',1),4) @ C @ part_matrix @ CI
    rig.show_in_front=True;arm.display_type='STICK'
    bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    worlds=world_matrices(data['bones'])
    for i,b in enumerate(data['bones']):
        eb=arm.edit_bones.new(b['name']);world=C @ worlds[i] @ CI
        if b['parent']>=0:eb.parent=arm.edit_bones[data['bones'][b['parent']]['name']]
        eb.head=(0,0,0);eb.tail=(0,.035 if 'Finger' in b['name'] else .065,0);eb.matrix=world
        eb.use_connect=False
    bpy.ops.object.mode_set(mode='OBJECT');rig.select_set(False)
    rig['native_unity_skeleton']=True;rig['source_component']=data['key']
    stats['rigs'].append({'family':family,'bones':len(data['bones'])})
    return rig,worlds

def vertex_weights(md,data,index):
    if not md['bones']: return {}
    out={}
    for slot in range(4):
        w=md['skinWeight'][index*4+slot]
        if w:
            bone=data['bones'][md['bones'][md['skinIndex'][index*4+slot]]]['name'];out[bone]=out.get(bone,0)+w
    total=sum(out.values())
    return {name:w/total for name,w in out.items()} if total else {}

def mobility(weights):
    skirt=sum(w for name,w in weights.items() if any(s in name.lower() for s in ('skirt','cloth','cape','mantle')) and 'root' not in name.lower())
    ribbon=sum(w for name,w in weights.items() if any(s in name.lower() for s in ('ribbon','tie','bow')) and 'root' not in name.lower())
    return max(skirt,min(.55,ribbon))

def make_mesh(md,data,family,rig,coll,faces,physical=False):
    # Weld positions while retaining per-loop UVs. Cloth must not split at atlas seams.
    original_ids=sorted({v for face,_ in faces for v in face});lookup={};mapping={};coordinates=[];weights=[];old_per_new=[]
    for old in original_ids:
        p=md['positions'][old*3:old*3+3];key=tuple(round(v,6) for v in p) if physical else (old,)
        if key not in lookup:
            lookup[key]=len(coordinates);coordinates.append(tuple(C.to_3x3() @ Vector(p)));weights.append(vertex_weights(md,data,old));old_per_new.append(old)
        mapping[old]=lookup[key]
    unique=set();valid=[]
    for face,mi in faces:
        indices=tuple(mapping[v] for v in face);identity=tuple(sorted(indices))
        if len(set(indices))<3 or identity in unique:continue
        unique.add(identity);valid.append((indices,face,mi))
    mesh=bpy.data.meshes.new(md['name']);mesh.from_pydata(coordinates,[],[v[0] for v in valid]);mesh.update()
    obj=bpy.data.objects.new(family+' · '+md['name']+(' · 布料解算' if physical else ''),mesh);coll.objects.link(obj);obj.parent=rig
    for d in md['materials']:mesh.materials.append(make_material(d,family,data))
    uv=mesh.uv_layers.new(name='Unity UV')
    for polygon,(_,original,mi) in zip(mesh.polygons,valid):
        polygon.material_index=mi;polygon.use_smooth=True
        for loop,old in zip(polygon.loop_indices,original):uv.data[loop].uv=md['uv'][old*2:old*2+2]
    groups={}
    for i,values in enumerate(weights):
        for name,w in values.items():
            group=groups.setdefault(name,obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name));group.add([i],w,'REPLACE')
    for morph in md.get('morphs',[]):
        if not obj.data.shape_keys:obj.shape_key_add(name='Basis',from_mix=False)
        shape=obj.shape_key_add(name=morph['name'],from_mix=False);shape.value=0
        for old,x,y,z in morph['deltas']:
            if old in mapping:shape.data[mapping[old]].co+=C.to_3x3() @ Vector((x,y,z))
    if md['bones']:
        modifier=obj.modifiers.new('01 · 原 Unity 蒙皮','ARMATURE');modifier.object=rig;modifier.use_deform_preserve_volume=False
    if physical:
        pin=obj.vertex_groups.new(name='固定边界 · 腰口/领口')
        loose=[mobility(w) for w in weights]
        high=max((coordinates[i][2] for i,w in enumerate(loose) if w>.45),default=0)
        low=min((coordinates[i][2] for i,w in enumerate(loose) if w>.45),default=high)
        for i,w in enumerate(loose):
            if w>.55:
                ratio=(high-coordinates[i][2])/max(.001,high-low)
                amount=1 if ratio<.06 else max(.12,.88*(1-ratio)**2)
            else:amount=1 if w<.05 else max(.78,1-w)
            pin.add([i],amount,'REPLACE')
        bm=bmesh.new();bm.from_mesh(mesh)
        bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=1,use_grid_fill=True)
        bm.to_mesh(mesh);bm.free();mesh.update()
        cloth=obj.modifiers.new('02 · 衣料 · 原生布料/自碰撞','CLOTH');s=cloth.settings
        s.quality=16;s.mass=.075;s.air_damping=3;s.vertex_group_mass=pin.name;s.pin_stiffness=1;s.use_dynamic_mesh=True
        fabric=fabric_class(data)
        stiffness={'silk':(30,15,.3),'cotton':(45,20,1.1),'structured':(60,25,2.5)}[fabric]
        s.tension_stiffness=stiffness[0];s.compression_stiffness=stiffness[0];s.shear_stiffness=stiffness[1];s.bending_model='ANGULAR';s.bending_stiffness=stiffness[2]
        s.tension_damping=10;s.compression_damping=10;s.shear_damping=8;s.bending_damping=1.5
        cc=cloth.collision_settings;cc.use_collision=True;cc.collision_quality=12;cc.distance_min=.0025
        cc.use_self_collision=True;cc.self_distance_min=.002;cc.self_friction=5
        cc.collection=collision_collection
        cloth.point_cache.frame_start=1;cloth.point_cache.frame_end=scene.frame_end
        obj['fabric']=fabric;obj['collision_clearance_m']=.0025
        stats['garments'].append({'mesh':obj.name,'vertices':len(mesh.vertices),'free_vertices_before_refinement':sum(w>.45 for w in loose)})
    obj['source_component']=data['key']
    return obj

def import_part(data,family,part_matrix=Matrix.Identity(4)):
    rig,worlds=make_rig(data,family,character,part_matrix);meshes=[]
    for md in data['meshes']:
        # Confirm inverse bind matrices describe exactly this native rest skeleton.
        for slot,index in enumerate(md['bones']):
            err=max(abs(v) for row in (worlds[index] @ from_array(md['inverses'][slot])-Matrix.Identity(4)) for v in row)
            stats['bindError']=max(stats['bindError'],err)
        physical=[];fixed=[]
        weights=[vertex_weights(md,data,i) for i in range(len(md['positions'])//3)]
        for group in md['groups']:
            definition=md['materials'][group['materialIndex']]
            # Original reversed lining occupies the same surface. A physical shell
            # must have one surface, otherwise self-collision explodes at frame 1.
            if definition.get('lining'):continue
            for n in range(group['start'],group['start']+group['count'],3):
                face=md['indices'][n:n+3]
                loose=family=='body' and not definition.get('skin') and any(mobility(weights[v])>.05 for v in face)
                (physical if loose else fixed).append((face,group['materialIndex']))
        for faces,simulate in [(fixed,False),(physical,True)]:
            if faces:meshes.append(make_mesh(md,data,family,rig,character,faces,simulate))
    return rig,meshes

body_rig,body_meshes=import_part(body_data,'body')
part_rigs={};part_meshes={}
for family in ['face','hair']:
    data=load_component(family,profile[family]);ref=from_array(data['attachmentMatrix'])
    placement=body_world[head_id] @ Matrix.Scale(profile.get('headScale',1),4) @ ref.inverted()
    rig,meshes=import_part(data,family,placement)
    follow=rig.constraints.new('CHILD_OF');follow.name='跟随 BodyHead · 保留原绑定';follow.target=body_rig;follow.subtarget='BodyHead'
    follow.inverse_matrix=(body_rig.matrix_world @ body_rig.data.bones['BodyHead'].matrix_local).inverted()
    part_rigs[family]=rig;part_meshes[family]=meshes

def capsule_mesh(name,start,end,radius,bone):
    start,end=Vector(start),Vector(end);axis=end-start;length=axis.length;center=(start+end)*.5
    basis=axis.to_track_quat('Z','Y').to_matrix() if length>1e-8 else Matrix.Identity(3)
    vertices=[];rings=[];segments=16
    for z,r in [(-length/2-radius*.98,radius*.15),(-length/2-radius*.7,radius*.71),(-length/2,radius),(length/2,radius),(length/2+radius*.7,radius*.71),(length/2+radius*.98,radius*.15)]:
        ring=[]
        for i in range(segments):
            p=center+basis @ Vector((r*math.cos(i*math.tau/segments),r*math.sin(i*math.tau/segments),z));ring.append(len(vertices));vertices.append(tuple(p))
        rings.append(ring)
    faces=[]
    for a,b in zip(rings,rings[1:]):
        for i in range(segments):faces.append((a[i],a[(i+1)%segments],b[(i+1)%segments],b[i]))
    faces.extend([tuple(reversed(rings[0])),tuple(rings[-1])])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);collision_collection.objects.link(obj);obj.parent=body_rig;obj.hide_render=True;obj.display_type='WIRE'
    vg=obj.vertex_groups.new(name=bone);vg.add(list(range(len(vertices))),1,'REPLACE')
    arm=obj.modifiers.new('骨架带动碰撞体','ARMATURE');arm.object=body_rig
    obj.modifiers.new('身体/衣服碰撞','COLLISION');obj.collision.thickness_outer=.001;obj.collision.cloth_friction=5
    return obj

by_name={b['name']:i for i,b in enumerate(body_data['bones'])}
for side in ['L','R']:
    for a,b,r in [('BodyUpperLeg','BodyLeg',.073),('BodyLeg','BodyFoot',.043),('BodyUpperArm','BodyForeArm',.036),('BodyForeArm','BodyHand',.027)]:
        ai,bi=by_name[a+side],by_name[b+side];start=(C @ body_world[ai]).translation;end=(C @ body_world[bi]).translation
        # Start below the fixed hip/waist seam; the actual thigh starts inside it.
        if a=='BodyUpperLeg':start=start.lerp(end,.21)
        capsule_mesh('碰撞 · '+a+side,start,end,r,a+side)
    fi=by_name['BodyFoot'+side];foot=(C @ body_world[fi]).translation
    capsule_mesh('碰撞 · 鞋'+side,foot+Vector((0,-.025,-.035)),foot+Vector((0,-.13,-.035)),.041,'BodyFoot'+side)
capsule_mesh('碰撞 · 胸腰',(C @ body_world[by_name['BodySpine1']]).translation,(C @ body_world[by_name['BodySpine2']]).translation,.065,'BodySpine1')

def linear_keys(action):
    if not action:return
    curves=list(getattr(action,'fcurves',[]))
    for layer in getattr(action,'layers',[]):
        for strip in layer.strips:
            for bag in getattr(strip,'channelbags',[]):curves.extend(bag.fcurves)
    for curve in curves:
        for key in curve.keyframe_points:key.interpolation='LINEAR'

def animate_native(rig,data,doc,part_name):
    info=doc['parts'][part_name];binary=zlib.decompress((root/'web/game-motions'/doc['files'][part_name]).read_bytes())
    values=struct.unpack('<'+'f'*(len(binary)//4),binary);name_ids={b['name']:i for i,b in enumerate(data['bones'])}
    if part_name=='face':
        for obj in part_meshes['face']:
            if obj.data.shape_keys:
                for key in obj.data.shape_keys.key_blocks[1:]:key.value=0;key.keyframe_insert('value',frame=1)
    first_position={t['name']:values[t['offset']:t['offset']+3] for t in info['tracks'] if t['kind']=='position'}
    for frame in range(1,scene.frame_end+1):
        # 15 frames of rest allows the fabric to settle before the native dance.
        sample=max(0,frame-16);locals=[local_matrix(b) for b in data['bones']]
        transition=min(1,(frame-1)/15)
        if transition>0:
            for track in info['tracks']:
                n=track['name'];kind=track['kind'];offset=min(info['frames']-1,sample)*info['stride']+track['offset'];v=values[offset:offset+track['size']]
                if kind=='morph' and part_name=='face':
                    for obj in part_meshes['face']:
                        shape=obj.data.shape_keys.key_blocks.get(n) if obj.data.shape_keys else None
                        if shape:shape.value=min(1,max(0,v[0]/100))*transition;shape.keyframe_insert('value',frame=frame)
                    continue
                if n not in name_ids:continue
                i=name_ids[n];position,rotation,scale=locals[i].decompose()
                if kind=='quaternion':rotation=Quaternion((v[3],-v[0],-v[1],v[2]));rotation.normalize()
                elif kind=='position':
                    position=Vector((v[0],v[1],-v[2]))
                    if n=='BodyPelvis':position.x=0;position.z=0
                elif kind=='scale':
                    reference=info['rest'].get(n,{}).get('scale',[1,1,1]);scale=Vector([data['bones'][i]['scale'][k]*v[k]/reference[k] if reference[k] else 1 for k in range(3)])
                rp,rq,rs=local_matrix(data['bones'][i]).decompose()
                locals[i]=Matrix.LocRotScale(rp.lerp(position,transition),rq.slerp(rotation,transition),rs.lerp(scale,transition))
        for i,b in enumerate(data['bones']):
            pb=rig.pose.bones[b['name']];pb.rotation_mode='QUATERNION'
            rest_local=rig.data.bones[b['name']].matrix_local
            if b['parent']>=0:rest_local=rig.data.bones[data['bones'][b['parent']]['name']].matrix_local.inverted() @ rest_local
            pb.matrix_basis=rest_local.inverted() @ C @ locals[i] @ CI
            pb.keyframe_insert('location',frame=frame);pb.keyframe_insert('rotation_quaternion',frame=frame);pb.keyframe_insert('scale',frame=frame)
    linear_keys(rig.animation_data.action);rig.animation_data.action.name=doc['id']+' · '+part_name+' · 原生 Unity 动作'
    if part_name=='face':
        for obj in part_meshes['face']:
            if obj.data.shape_keys and obj.data.shape_keys.animation_data:linear_keys(obj.data.shape_keys.animation_data.action)

motion_path=root/'web/game-motions'/(args.motion+'.json')
if args.frames>2 and motion_path.is_file():
    doc=json.loads(motion_path.read_text(encoding='utf8'));animate_native(body_rig,body_data,doc,'body')
    animate_native(part_rigs['face'],load_component('face',profile['face']),doc,'face')
    stats['motion']=args.motion

def area(name,location,power,color,size,target):
    light=bpy.data.lights.new(name,'AREA');light.energy=power;light.color=color;light.shape='DISK';light.size=size
    obj=bpy.data.objects.new(name,light);studio.objects.link(obj);obj.location=location;obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    return obj

area('柔光 · 主灯',(-2.6,3.3,3.5),210,(1,.9,.84),3,(0,0,1))
area('柔光 · 天空补光',(2.5,2,2.2),135,(.8,.88,1),3.5,(0,0,1))
area('柔光 · 轮廓',(1.2,-1.8,2.8),290,(1,.84,.92),2.5,(0,0,1))
world=bpy.data.worlds.new('天空 · 柔和环境');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.38,.42,.5,1);world.node_tree.nodes['Background'].inputs[1].default_value=.3;scene.world=world
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.008));floor=bpy.context.object;floor.name='摄影棚地面';move_to(floor,studio)
floor_mat=bpy.data.materials.new('柔灰背景');floor_mat.diffuse_color=(.22,.24,.29,1);floor_mat.use_nodes=True;floor_mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.22,.24,.29,1);floor_mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.85;floor.data.materials.append(floor_mat)
camera_data=bpy.data.cameras.new('人像镜头');camera=bpy.data.objects.new('人像镜头',camera_data);studio.objects.link(camera);camera.location=(1.65,4.2,1.9);target=Vector((0,0,.83));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.type='ORTHO';camera_data.ortho_scale=1.93;camera_data.lens=55;scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True;scene.cycles.use_adaptive_sampling=True
try:
    cp=bpy.context.preferences.addons['cycles'].preferences;cp.compute_device_type='OPTIX'
    if args.render:
        cp.get_devices()
        for device in cp.devices:device.use=device.type=='OPTIX'
        if any(d.type=='OPTIX' for d in cp.devices):scene.cycles.device='GPU';stats['render_device']='OptiX'
    else:scene.cycles.device='GPU';stats['render_device']='OptiX preferred'
except Exception as error:stats['render_device']='CPU';print('GPU unavailable',error,flush=True)
sys.path.insert(0,str(Path(__file__).resolve().parent))
from blender_look import apply_look
for light in list(bpy.data.objects):
    if light.type=='LIGHT' and light.name.startswith('柔光'):bpy.data.objects.remove(light,do_unlink=True)
apply_look(scene,{'look':'neutral','exposure':-.35,'ambient':.08},(0,0,1))
floor_mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.08,.1,.14,1)
scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.timeline_markers.new('静止姿态 · 检查绑定',frame=1);scene.timeline_markers.new('原 Unity 舞蹈开始',frame=16)
guide=bpy.data.texts.new('使用说明 · 22-7 Character Studio')
guide.write('22/7 Motion Studio · Blender model setup\n\n原生 Unity 骨架、蒙皮、UV、贴图均保留。贴图已打包，工程可独立打开。\n1–15 帧为静止和布料预滚动；16 帧后为原游戏动作。\n衣服修改器顺序：Armature → Cloth。固定边界顶点组控制腰口/领口/蝴蝶结。\n身体碰撞体在专用集合中，仅解算、不出现在渲染中。\n从第 1 帧顺序播放或先在物理属性烘焙，直接跳帧不能生成完整布料历史。\n修改动作、服装或固定区域后清除并重算缓存。\n本文件是调校工程：极端动作仍可能需要手动修正固定权重/碰撞距离。\nWeb 可使用编辑器内的 Blender 布料烘焙，glTF 本身不会保留 Cloth 解算器。\nComfyUI 仅留作后续风格生成，当前不参与骨架/物理制作。\n')
scene.frame_set(1);bpy.context.view_layer.update()
# Check actual evaluated bind positions, including the armature modifier.
max_error=0
for obj in body_meshes+part_meshes['face']+part_meshes['hair']:
    evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
    object_error=max(((a.co-b.co).length for a,b in zip(obj.data.vertices,mesh.vertices)),default=0)
    print('REST',obj.name,object_error,flush=True);max_error=max(max_error,object_error)
    evaluated.to_mesh_clear()
stats['evaluated_rest_error_m']=max_error
if stats['bindError']>.002 or max_error>.002:raise RuntimeError('Native bind verification failed: '+str(stats))
for obj in bpy.context.selected_objects:obj.select_set(False)
body_rig.select_set(True);bpy.context.view_layer.objects.active=body_rig
for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type=='VIEW_3D':
            a.spaces.active.region_3d.view_distance=2.6;a.spaces.active.region_3d.view_location=(0,0,.85)
            a.spaces.active.region_3d.view_rotation=camera.rotation_euler.to_quaternion();a.spaces.active.shading.type='MATERIAL'
bpy.ops.outliner.orphans_purge(do_local_ids=True,do_linked_ids=True,do_recursive=True)
blend_path=output/'22-7-Character-Studio.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
if args.render:
    scene.render.filepath=str(output/'character-studio-preview.png');bpy.ops.render.render(write_still=True)
stats['blend']=blend_path.name;stats['textures_packed']=len(image_cache)
(output/'model-setup-report.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(stats,ensure_ascii=True),flush=True)

if args.library:
    # Standalone wardrobe assets. Each includes its own native deform skeleton;
    # garment fitting can be rebuilt for any character via --character/--body.
    library=set();items=[];main_collection=character
    for item in catalog['models']:
        if item['family']!='body':continue
        character=collection(item['label']+' · '+item['id'])
        before=len(stats['garments']);data=load_component('body',item['id'])
        rig,meshes=import_part(data,'body')
        for obj in meshes:
            for mod in obj.modifiers:
                if mod.type=='CLOTH':mod.collision_settings.collection=None
        character['source_component']=item['key'];character['needs_body_collision_assignment']=True
        character.asset_mark();character.asset_data.description='原生 Unity 骨架/打包贴图/衣料材质/固定边界。搭配完整角色后指定该角色的身体碰撞集合并烘焙。'
        character.asset_data.author='Sora-Ayano';character.use_fake_user=True
        scene.collection.children.unlink(character);library.add(character)
        items.append({'id':item['id'],'label':item['label'],'meshes':len(meshes),'physical_surfaces':len(stats['garments'])-before})
        print(json.dumps({'wardrobe':len(items),'total':140}),flush=True)
    bpy.data.libraries.write(str(output/'22-7-Wardrobe-Library.blend'),library,path_remap='RELATIVE_ALL',fake_user=True,compress=True)
    (output/'wardrobe-library.json').write_text(json.dumps({'count':len(items),'items':items},ensure_ascii=False,indent=2),encoding='utf8')
