"""Bake animated garment particles in Blender. Input/output paths are CLI arguments."""
import bpy, sys, json, math, struct, zlib, base64
from pathlib import Path
from mathutils import Vector

args=sys.argv[sys.argv.index('--')+1:]
source=json.loads(Path(args[0]).read_text(encoding='utf8'))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.fps=source['fps'];scene.frame_start=1;scene.frame_end=len(source['frames'])
scene.gravity=(0,0,-9.81)
def point(p):return (p[0],-p[2],p[1])
def animate_shape(obj,frames):
 obj.shape_key_add(name='Basis',from_mix=False)
 for i,coordinates in enumerate(frames):
  key=obj.shape_key_add(name='Pose'+str(i),from_mix=False);key.value=0;key.data.foreach_set('co',[v for p in coordinates for v in point(p)])
  for frame,value in [(max(1,i),0),(i+1,1),(i+2,0)]:
   key.value=value;key.keyframe_insert('value',frame=frame)
 if obj.data.shape_keys.animation_data:
  action=obj.data.shape_keys.animation_data.action
  # Blender 4.x/5.x expose different action containers. Linear keys keep anchors smooth.
  curves=list(getattr(action,'fcurves',[]))
  for layer in getattr(action,'layers',[]):
   for strip in layer.strips:
    for bag in getattr(strip,'channelbags',[]):curves.extend(bag.fcurves)
  for curve in curves:
   for key in curve.keyframe_points:key.interpolation='LINEAR'

garments=[]
for index,surface in enumerate(source['surfaces']):
 mesh=bpy.data.meshes.new('Garment');seen=set();triangles=[]
 for tri in surface['triangles']:
  identity=tuple(sorted(tri))
  if identity not in seen:seen.add(identity);triangles.append(tri)
 frames=[f['surfaces'][index] for f in source['frames']]
 mesh.from_pydata([point(p) for p in frames[0]],[],triangles);mesh.update()
 obj=bpy.data.objects.new(surface['name'],mesh);scene.collection.objects.link(obj);animate_shape(obj,frames)
 pin=obj.vertex_groups.new(name='Pin')
 for i,mobility in enumerate(surface['mobility']):
  weight=1 if mobility==0 else max(0,1-mobility/.25)*.5
  if weight:pin.add([i],weight,'REPLACE')
 cloth=obj.modifiers.new('Physical fabric','CLOTH');settings=cloth.settings
 settings.quality=12;settings.mass=.15;settings.air_damping=3;settings.vertex_group_mass=pin.name
 settings.pin_stiffness=1;settings.use_dynamic_mesh=False
 settings.tension_stiffness=25;settings.compression_stiffness=25;settings.shear_stiffness=12
 settings.bending_model='ANGULAR';settings.bending_stiffness={'silk':.3,'cotton':1.1,'structured':2.5}.get(surface.get('fabric',source.get('fabric')),1.1)
 settings.tension_damping=8;settings.compression_damping=8;settings.shear_damping=6
 cloth.collision_settings.use_collision=True;cloth.collision_settings.collision_quality=8
 cloth.collision_settings.distance_min=.003;cloth.collision_settings.use_self_collision=True
 cloth.collision_settings.self_distance_min=.001;cloth.collision_settings.self_friction=.5;cloth.collision_settings.self_impulse_clamp=.5
 cloth.point_cache.frame_start=1-source['fps']*2;cloth.point_cache.frame_end=scene.frame_end
 garments.append((obj,surface,[]))

colliders=[]
for index in range(len(source['frames'][0]['capsules'])):
 objects=[]
 for kind in ['start','end','shaft']:
  if kind=='shaft':bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=1,depth=2)
  else:bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=1)
  obj=bpy.context.object;obj.name='BodyCollider';obj.modifiers.new('Body contact','COLLISION');obj.collision.thickness_outer=.001
  obj.rotation_mode='QUATERNION';objects.append(obj)
 for frame,data in enumerate(source['frames'],1):
  a,b,r=data['capsules'][index];a,b=Vector(point(a)),Vector(point(b));axis=b-a
  for obj,kind in zip(objects,['start','end','shaft']):
   obj.location=a if kind=='start' else b if kind=='end' else (a+b)*.5
   obj.scale=(r,r,r) if kind!='shaft' else (r,r,max(.0001,axis.length/2))
   if kind=='shaft' and axis.length:obj.rotation_quaternion=axis.to_track_quat('Z','Y')
   obj.keyframe_insert('location',frame=frame);obj.keyframe_insert('scale',frame=frame);obj.keyframe_insert('rotation_quaternion',frame=frame)
 colliders.extend(objects)

for frame in range(1-source['fps']*2,1):
 scene.frame_set(frame);deps=bpy.context.evaluated_depsgraph_get()
 for obj,_,_ in garments:
  evaluated=obj.evaluated_get(deps);evaluated.to_mesh();evaluated.to_mesh_clear()
for frame in range(1,scene.frame_end+1):
 scene.frame_set(frame);deps=bpy.context.evaluated_depsgraph_get()
 for obj,surface,positions in garments:
  evaluated=obj.evaluated_get(deps);mesh=evaluated.to_mesh()
  if len(mesh.vertices)!=len(surface['mobility']):raise RuntimeError('Garment topology changed')
  for vertex in mesh.vertices:
   x,y,z=vertex.co;positions.extend((x,z,-y))
  evaluated.to_mesh_clear()
 print(json.dumps({'frame':frame,'total':scene.frame_end}),flush=True)
result={'format':'studio-cloth-cache','version':1,'fps':source['fps'],'startFrame':source['startFrame'],'frames':scene.frame_end,'surfaces':[]}
for obj,surface,positions in garments:
 if not all(math.isfinite(v) and abs(v)<1000 for v in positions):raise RuntimeError('Cloth simulation is unstable')
 data=struct.pack('<'+'f'*len(positions),*positions)
 result['surfaces'].append({'name':surface['name'],'particles':len(surface['mobility']),'data':base64.b64encode(zlib.compress(data,6)).decode('ascii')})
Path(args[1]).write_text(json.dumps(result,separators=(',',':')),encoding='utf8')
print(json.dumps({'complete':True}),flush=True)
