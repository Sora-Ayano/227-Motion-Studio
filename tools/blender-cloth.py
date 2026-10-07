"""Bake animated garment particles in Blender. Input/output paths are CLI arguments."""
import bpy, sys, json, math, struct, zlib, base64
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from blender_physics import configure_cloth,capsule_surface

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
 cloth=obj.modifiers.new('Physical fabric','CLOTH')
 configure_cloth(cloth,pin.name,surface.get('fabric',source.get('fabric')),1-source['fps']*2,scene.frame_end)
 garments.append((obj,surface,[]))

colliders=[]
for index in range(len(source['frames'][0]['capsules'])):
 coordinates=[]
 for data in source['frames']:
  points,faces=capsule_surface(*data['capsules'][index]);coordinates.append(points)
 mesh=bpy.data.meshes.new('Rounded body collider');mesh.from_pydata([point(p) for p in coordinates[0]],[],faces);mesh.update()
 obj=bpy.data.objects.new('BodyCollider',mesh);scene.collection.objects.link(obj);animate_shape(obj,coordinates)
 obj.modifiers.new('Body contact','COLLISION');obj.collision.thickness_outer=.001;obj.collision.cloth_friction=1;colliders.append(obj)

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
