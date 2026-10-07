"""Render an editor snapshot; animation, camera and textures arrive in local glTF."""
import bpy, bmesh, sys, json, math, base64
from pathlib import Path
from mathutils import Matrix,Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from blender_look import apply_look,gpu_cycles
from blender_materials import character_materials
from blender_grade import editor_grade
from blender_physics import configure_cloth,body_contact_surface,inherited_property,restore_gltf_physics

folder=Path(sys.argv[sys.argv.index('--')+1]).resolve();spec=json.loads((folder/'settings.json').read_text(encoding='utf8'))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.fps=spec['fps'];scene.frame_start=1;scene.frame_end=spec['count']
bpy.ops.import_scene.gltf(filepath=str(folder/'scene.glb'),merge_vertices=False)
restore_gltf_physics(folder/'scene.glb')
for obj in bpy.data.objects:
 if obj.type=='MESH' and any(m and m.get('studioToon') for m in obj.data.materials):
  for modifier in obj.modifiers:
   if modifier.type=='ARMATURE':modifier.use_deform_preserve_volume=True
character_materials(spec,folder)

for mat in bpy.data.materials:
 if not mat.use_nodes or 'opq_' not in mat.name.lower():continue
 tree=mat.node_tree
 for emission in list(tree.nodes):
  if emission.type!='EMISSION':continue
  physical=tree.nodes.new('ShaderNodeBsdfPrincipled');physical.inputs['Base Color'].default_value=emission.inputs['Color'].default_value;physical.inputs['Roughness'].default_value=.82;physical.inputs['Emission Color'].default_value=emission.inputs['Color'].default_value;physical.inputs['Emission Strength'].default_value=.32
  for link in list(emission.inputs['Color'].links):tree.links.new(link.from_socket,physical.inputs['Base Color']);tree.links.new(link.from_socket,physical.inputs['Emission Color'])
  for link in list(emission.outputs[0].links):tree.links.new(physical.outputs[0],link.to_socket)
  tree.nodes.remove(emission)

# Unity additive light sprites do not have standard alpha in glTF. Use their
# brightness as transparency instead of importing an opaque white rectangle.
for mat in bpy.data.materials:
 if not mat.use_nodes or not any(word in mat.name.lower() for word in ['add_main','add_fog','lightshaft']):continue
 tree=mat.node_tree;image=next((n.image for n in tree.nodes if n.type=='TEX_IMAGE' and n.image),None)
 tree.nodes.clear();out=tree.nodes.new('ShaderNodeOutputMaterial');transparent=tree.nodes.new('ShaderNodeBsdfTransparent');emission=tree.nodes.new('ShaderNodeEmission');emission.inputs['Strength'].default_value=.8;mix=tree.nodes.new('ShaderNodeMixShader');mix.inputs[0].default_value=.08
 if image:
  texture=tree.nodes.new('ShaderNodeTexImage');texture.image=image;value=tree.nodes.new('ShaderNodeRGBToBW');alpha=tree.nodes.new('ShaderNodeMath');alpha.operation='MULTIPLY';opacity=tree.nodes.new('ShaderNodeMath');opacity.operation='MULTIPLY';opacity.inputs[1].default_value=.12
  tree.links.new(texture.outputs['Color'],value.inputs[0]);tree.links.new(value.outputs[0],alpha.inputs[0]);tree.links.new(texture.outputs['Alpha'],alpha.inputs[1]);tree.links.new(alpha.outputs[0],opacity.inputs[0]);tree.links.new(opacity.outputs[0],mix.inputs[0]);tree.links.new(texture.outputs['Color'],emission.inputs['Color'])
 tree.links.new(transparent.outputs[0],mix.inputs[1]);tree.links.new(emission.outputs[0],mix.inputs[2]);tree.links.new(mix.outputs[0],out.inputs['Surface'])

def actor(obj):
 while obj:
  if obj.name.startswith('Character_'):return obj.name
  obj=obj.parent
 return None

contacts={};garments=[]
for obj in list(bpy.data.objects):
 if obj.type!='MESH':continue
 family=actor(obj)
 if not family:continue
 uv=obj.data.uv_layers.get('UVMap.001')
 if not uv and len(obj.data.uv_layers)>1:uv=obj.data.uv_layers[1]
 mobility={};faces=[]
 if spec.get('cloth',True) and uv:
  for poly in obj.data.polygons:
   values=[(obj.data.loops[i].vertex_index,uv.data[i].uv) for i in poly.loop_indices]
   if all(p.y<.5 for _,p in values) and any(p.x>.001 for _,p in values):
    faces.append(poly.index)
    for v,p in values:mobility[v]=min(mobility.get(v,1),max(0,min(1,p.x)))
 if faces:
  selected=set(faces);free_vertices={v for p in obj.data.polygons if p.index in selected for v in p.vertices};fixed_vertices={v for p in obj.data.polygons if p.index not in selected for v in p.vertices};anchors=free_vertices & fixed_vertices
  pin=obj.vertex_groups.new(name='StudioPin')
  for vertex in range(len(obj.data.vertices)):
   free=mobility.get(vertex,0);weight=1 if free==0 or vertex in anchors else max(0,(1-free/.18)*.5)
   if weight:pin.add([vertex],weight,'REPLACE')
  loose=obj.copy();loose.data=obj.data.copy();bpy.context.collection.objects.link(loose);loose.name=obj.name+'_Fabric'
  for target,keep in [(loose,True),(obj,False)]:
   bm=bmesh.new();bm.from_mesh(target.data);bm.faces.ensure_lookup_table();selected=set(faces)
   bmesh.ops.delete(bm,geom=[f for f in bm.faces if (f.index in selected)!=keep],context='FACES')
   bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
   if keep:
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
    # Skin-weight boundaries often divide a coarse upper skirt from a dense
    # hem. A uniform physical mesh avoids a hinge along that imported ring.
    long_edges=[edge for edge in bm.edges if edge.calc_length()>.055]
    if long_edges:bmesh.ops.subdivide_edges(bm,edges=long_edges,cuts=2,use_grid_fill=True)
    bmesh.ops.triangulate(bm,faces=list(bm.faces))
   bm.to_mesh(target.data);bm.free();target.data.update()
   if keep:
    if target.data.has_custom_normals:
     with bpy.context.temp_override(object=target,active_object=target):bpy.ops.mesh.customdata_custom_splitnormals_clear()
    for polygon in target.data.polygons:polygon.use_smooth=True
  cloth=loose.modifiers.new('Blender 实体布料','CLOTH')
  fabric=inherited_property(obj,'studioFabric',spec.get('fabric','cotton'))
  configure_cloth(cloth,'StudioPin',fabric,1-spec['fps']*2,scene.frame_end,16 if spec['quality']=='fast' else 20)
  garments.append((family,cloth,loose))
 # Fixed clothes have open edges next to the pinned waist. Making this entire
 # mesh a collider catches the moving skirt on those edges and rolls the hem.
 contact=body_contact_surface(obj,bpy.context.collection)
 if contact:contacts.setdefault(family,[]).append(contact)
 for mat in obj.data.materials:
  if not mat or not mat.use_nodes:continue
  for node in mat.node_tree.nodes:
   if node.type=='BSDF_PRINCIPLED':
    environment=spec.get('environment',{});custom_fabric=environment.get('enabled') and mat.name.endswith('_cloth')
    skin=mat.name.endswith(('_skin','_face'))
    node.inputs['Roughness'].default_value=environment.get('roughness',.75) if custom_fabric else (.58 if skin else .8)
    if 'Sheen Weight' in node.inputs:node.inputs['Sheen Weight'].default_value=environment.get('sheen',.35) if custom_fabric else (.15 if mat.name.endswith('_cloth') else .03)
    if 'Specular IOR Level' in node.inputs:node.inputs['Specular IOR Level'].default_value=.23 if skin else .3
    if skin and 'Subsurface Weight' in node.inputs:
     node.inputs['Subsurface Weight'].default_value=.055;node.inputs['Subsurface Radius'].default_value=(.7,.3,.18);node.inputs['Subsurface Scale'].default_value=.012
for family,modifier,_ in garments:
 collection=bpy.data.collections.get(family+'_Contacts') or bpy.data.collections.new(family+'_Contacts')
 if collection.name not in scene.collection.children:scene.collection.children.link(collection)
 for obj in contacts.get(family,[]):
  if obj.name not in collection.objects:collection.objects.link(obj)
 modifier.collision_settings.collection=collection

# The game batches many beam cones into one mesh. Split connected components
# before making closed volumes; a hull around the batch would fill the stage.
beams=[];candidates=[];scene.frame_set(1)
actor_points=[o.matrix_world@Vector(p) for o in bpy.data.objects if o.type=='MESH' and actor(o) for p in o.bound_box]
target=sum(actor_points,Vector())/len(actor_points) if actor_points else Vector((0,0,1))
for obj in list(bpy.data.objects):
 if obj.type!='MESH' or actor(obj) or not obj.data.materials or not all(m and any(k in m.name.lower() for k in ['add_fog','lightshaft']) for m in obj.data.materials) or len(obj.data.vertices)>10000:continue
 bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bm.verts.ensure_lookup_table();bm.verts.index_update();remaining=set(bm.verts)
 while remaining:
  todo=[remaining.pop()];part=set(todo)
  while todo:
   vertex=todo.pop()
   for edge in vertex.link_edges:
    other=edge.other_vert(vertex)
    if other in remaining:remaining.remove(other);part.add(other);todo.append(other)
  points=[obj.matrix_world@v.co for v in part]
  if len(points)<4 or max(max(p[i] for p in points)-min(p[i] for p in points) for i in range(3))<1.8:continue
  center=sum(points,Vector())/len(points);indices={v.index for v in part};copy=bm.copy();copy.verts.ensure_lookup_table();bmesh.ops.delete(copy,geom=[v for v in copy.verts if v.index not in indices],context='VERTS');candidates.append(((center-target).length,obj,copy))
 bm.free()
 # Sprites remain only when geometry cannot be split into usable cones.
 if any(item[1]==obj for item in candidates):obj.hide_render=True
for distance,obj,bm in sorted(candidates,key=lambda item:item[0]):
 if len(beams)>=12:bm.free();continue
 bmesh.ops.delete(bm,geom=list(bm.faces),context='FACES_ONLY')
 try:bmesh.ops.convex_hull(bm,input=list(bm.verts),use_existing_faces=False)
 except Exception:bm.free();continue
 data=bpy.data.meshes.new('闭合光束');bm.to_mesh(data);bm.free()
 if len(data.polygons)<4:bpy.data.meshes.remove(data);continue
 volume=obj.copy();volume.data=data;scene.collection.objects.link(volume);volume.name='真实柔光体积 · '+obj.name;volume.hide_render=False;volume.data.materials.clear();mat=bpy.data.materials.new(volume.name);mat.use_nodes=True;tree=mat.node_tree;tree.nodes.clear();scatter=tree.nodes.new('ShaderNodeVolumeScatter');scatter.inputs['Color'].default_value=(.72,.8,1,1);scatter.inputs['Density'].default_value=.018;scatter.inputs['Anisotropy'].default_value=.35;out=tree.nodes.new('ShaderNodeOutputMaterial');tree.links.new(scatter.outputs[0],out.inputs['Volume']);volume.data.materials.append(mat)
 light=bpy.data.lights.new('舞台体积聚光','SPOT');light.energy=110;light.color=(.72,.83,1);light.spot_blend=.9;light.shadow_soft_size=.08;spot=bpy.data.objects.new(light.name,light);scene.collection.objects.link(spot);beams.append((volume,spot))

def place_beams():
 deps=bpy.context.evaluated_depsgraph_get()
 for source,spot in beams:
  evaluated=source.evaluated_get(deps);mesh=evaluated.to_mesh();points=[source.matrix_world@v.co for v in mesh.vertices];evaluated.to_mesh_clear()
  axis=max(range(3),key=lambda i:max(p[i] for p in points)-min(p[i] for p in points));low=min(p[axis] for p in points);high=max(p[axis] for p in points);groups=[[p for p in points if p[axis]<low+(high-low)*.15],[p for p in points if p[axis]>high-(high-low)*.15]]
  centers=[sum(group,Vector())/len(group) for group in groups];radii=[max((p-center).length for p in group) for group,center in zip(groups,centers)];apex=0 if radii[0]<radii[1] else 1;direction=centers[1-apex]-centers[apex]
  if direction.length<.01:continue
  spot.location=centers[apex]-direction.normalized()*.05;spot.rotation_euler=direction.to_track_quat('-Z','Y').to_euler();spot.data.spot_size=min(math.radians(70),max(math.radians(12),2*math.atan(max(radii)/direction.length)))

camera_data=bpy.data.cameras.new('Web 镜头');camera=bpy.data.objects.new('Web 镜头',camera_data);scene.collection.objects.link(camera);scene.camera=camera
conversion=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
def place_camera(index):
 pose=spec['cameras'][index];a=pose['matrix'];camera.matrix_world=conversion@Matrix([[a[c*4+r] for c in range(4)] for r in range(4)])
 camera_data.clip_start=pose.get('near',.01);camera_data.clip_end=pose.get('far',200)
 if pose.get('ortho'):camera_data.type='ORTHO';camera_data.ortho_scale=pose['ortho']*max(1,spec['width']/spec['height'])
 else:camera_data.type='PERSP';camera_data.sensor_fit='VERTICAL';camera_data.sensor_height=24;camera_data.lens=12/math.tan(math.radians(pose.get('fov',35))/2)
 rendering=spec.get('rendering',{});camera_data.dof.use_dof=bool(rendering.get('enabled') and rendering.get('dof',0)>0)
 if camera_data.dof.use_dof:
  camera_data.dof.focus_distance=rendering.get('focus',3);camera_data.dof.aperture_fstop=max(2,24/max(1,rendering.get('dof',0)))
  if rendering.get('autoFocus',True):
   deps=bpy.context.evaluated_depsgraph_get();points=[o.matrix_world@Vector(p) for o in bpy.data.objects if o.type=='MESH' and actor(o) for p in o.evaluated_get(deps).bound_box]
   if points:camera_data.dof.focus_distance=max(.1,-(camera.matrix_world.inverted()@(sum(points,Vector())/len(points))).z)
place_camera(0)
scene.frame_set(1);deps=bpy.context.evaluated_depsgraph_get();bounds=[]
for obj in bpy.data.objects:
 if obj.type=='MESH' and actor(obj):bounds.extend(obj.matrix_world@Vector(p) for p in obj.evaluated_get(deps).bound_box)
if bounds:
 lo=Vector(tuple(min(v[i] for v in bounds) for i in range(3)));hi=Vector(tuple(max(v[i] for v in bounds) for i in range(3)));center=(lo+hi)*.5;span=max(1,(hi-lo).x/3,(hi-lo).z/1.7)
else:center=Vector((0,0,1));span=1
apply_look(scene,spec,center,span,folder)
if not spec.get('hasStage') and not spec.get('green'):
 bpy.ops.mesh.primitive_plane_add(size=200,location=(center.x,center.y,0));floor=bpy.context.object;floor.name='柔灰摄影棚地面';mat=bpy.data.materials.new('摄影棚地面');mat.use_nodes=True;shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.08,.1,.14,1);shader.inputs['Roughness'].default_value=.87;floor.data.materials.append(mat)
if spec.get('green'):scene.render.film_transparent=True
if not spec.get('green'):
 if hasattr(scene,'compositing_node_group'):
  tree=bpy.data.node_groups.new('22-7 柔光合成','CompositorNodeTree');scene.compositing_node_group=tree;tree.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor');out=tree.nodes.new('NodeGroupOutput')
 else:
  scene.use_nodes=True;tree=scene.node_tree;tree.nodes.clear();out=tree.nodes.new('CompositorNodeComposite')
 layers=tree.nodes.new('CompositorNodeRLayers');glow=tree.nodes.new('CompositorNodeGlare')
 if 'Type' in glow.inputs:
  rendering=spec.get('rendering',{});glow.inputs['Type'].default_value='Fog Glow';glow.inputs['Quality'].default_value='Medium';glow.inputs['Threshold'].default_value=rendering.get('bloomThreshold',1.2);glow.inputs['Strength'].default_value=rendering.get('bloom',.07) if rendering.get('enabled') else .07;glow.inputs['Size'].default_value=.12
 else:glow.glare_type='FOG_GLOW';glow.quality='MEDIUM';glow.threshold=1.2;glow.size=6;glow.mix=-.93
 tree.links.new(layers.outputs['Image'],glow.inputs['Image']);result=glow.outputs['Image']
 if spec.get('backdrop'):
  (folder/'backdrop.png').write_bytes(base64.b64decode(spec['backdrop']));scene.render.film_transparent=True;image=tree.nodes.new('CompositorNodeImage');image.image=bpy.data.images.load(str(folder/'backdrop.png'));over=tree.nodes.new('CompositorNodeAlphaOver');tree.links.new(image.outputs['Image'],over.inputs[1]);tree.links.new(result,over.inputs[2]);result=over.outputs['Image']
 result=editor_grade(tree,result,spec);tree.links.new(result,out.inputs['Image'])
if hasattr(scene.render,'compositor_device'):scene.render.compositor_device='GPU'
engines=scene.render.bl_rna.properties['engine'].enum_items.keys()
scene.render.engine=('BLENDER_EEVEE' if 'BLENDER_EEVEE' in engines else 'BLENDER_EEVEE_NEXT') if spec['quality']=='fast' else 'CYCLES'
device='GPU (EEVEE)'
if spec['quality']=='fast':
 scene.eevee.taa_render_samples=32;scene.eevee.volumetric_samples=32
if scene.render.engine=='CYCLES':
 scene.cycles.samples=24 if spec['quality']=='balanced' else 64;scene.cycles.use_denoising=True;scene.cycles.use_adaptive_sampling=True;scene.cycles.adaptive_threshold=.05;device=gpu_cycles(scene)
scene.render.resolution_x=spec['width'];scene.render.resolution_y=spec['height'];scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA' if scene.render.film_transparent else 'RGB';scene.render.image_settings.compression=10
print(json.dumps({'phase':'ready','device':device,'garments':len(garments),'beams':len(beams)}),flush=True)
for frame in range(1-spec['fps']*2,1):
 scene.frame_set(frame);deps=bpy.context.evaluated_depsgraph_get()
 for _,cloth,owner in garments:
  evaluated=owner.evaluated_get(deps);evaluated.to_mesh();evaluated.to_mesh_clear()
frames=folder/'frames';frames.mkdir(exist_ok=True)
for index in range(spec['count']):
 scene.frame_set(index+1);place_camera(index);place_beams();scene.render.filepath=str(frames/('%06d.png'%index));bpy.ops.render.render(write_still=True)
 print(json.dumps({'frame':index+1,'total':spec['count'],'phase':'render','device':device}),flush=True)
print(json.dumps({'complete':True,'device':device}),flush=True)
