"""Physical studio lighting and color management shared by Blender workflows."""
import bpy, math
from mathutils import Vector

PRESETS={
 'neutral': {'key':(1,.94,.88),'fill':(.72,.82,1),'rim':(1,.84,.9),'exposure':-.35},
 'warm': {'key':(1,.88,.77),'fill':(.7,.8,1),'rim':(1,.77,.8),'exposure':-.4},
 'pink': {'key':(1,.86,.89),'fill':(.76,.83,1),'rim':(1,.63,.79),'exposure':-.4},
 'film': {'key':(1,.87,.7),'fill':(.52,.72,1),'rim':(.7,.83,1),'exposure':-.5},
}
def apply_look(scene,settings=None,center=(0,0,1),span=1,folder=None):
 settings=settings or {};p=PRESETS.get(settings.get('look'),PRESETS['neutral'])
 render=settings.get('rendering',{});environment=settings.get('environment',{});lighting=settings.get('lighting',{})
 native='cameras' in settings
 anime=render.get('enabled') and render.get('style') in ['anime','anime-pink','kyoani','reference-petal']
 scene.view_settings.view_transform='Standard' if native or anime else 'AgX';scene.view_settings.look='None' if native or anime else 'AgX - Medium High Contrast'
 scene.view_settings.exposure=0 if native else settings.get('exposure',p['exposure'])+(math.log2(max(.1,render.get('exposure',1))) if render.get('enabled') else 0)
 scene.render.use_persistent_data=True
 world=scene.world or bpy.data.worlds.new('22-7 柔光环境');world.use_nodes=True;scene.world=world
 nodes=world.node_tree.nodes;nodes.clear();out=nodes.new('ShaderNodeOutputWorld');light=nodes.new('ShaderNodeBackground');light.inputs['Color'].default_value=(.28,.34,.45,1);light.inputs['Strength'].default_value=settings.get('ambient',.08)+(environment.get('diffuseIntensity',.25)*.3 if environment.get('enabled') else 0)
 if folder and settings.get('environmentImage') in ['environment.hdr','environment.exr'] and environment.get('enabled'):
  texture=nodes.new('ShaderNodeTexEnvironment');texture.image=bpy.data.images.load(str(folder/settings['environmentImage']));world.node_tree.links.new(texture.outputs['Color'],light.inputs['Color']);light.inputs['Strength'].default_value=environment.get('intensity',.3)
 bg=nodes.new('ShaderNodeBackground');bg.inputs['Color'].default_value=tuple(settings.get('background',[.025,.03,.045]))+(1,);bg.inputs['Strength'].default_value=1
 ray=nodes.new('ShaderNodeLightPath');mix=nodes.new('ShaderNodeMixShader');links=world.node_tree.links;links.new(ray.outputs['Is Camera Ray'],mix.inputs[0]);links.new(light.outputs[0],mix.inputs[1]);links.new(bg.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],out.inputs[0])
 for obj in list(bpy.data.objects):
  if obj.type=='LIGHT' and obj.get('studio_softbox'):bpy.data.objects.remove(obj,do_unlink=True)
 def rgb(key,default):
  color=environment.get(key)
  if not environment.get('enabled') or not color:return default
  encoded=[int(color[i:i+2],16)/255 for i in [1,3,5]]
  linear=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in encoded]
  return tuple(v*.65+d*.35 for v,d in zip(linear,default))
 azimuth=math.radians(lighting.get('azimuth',-34));elevation=math.radians(lighting.get('elevation',42));key_offset=(4*math.sin(azimuth)*math.cos(elevation),4*math.cos(azimuth)*math.cos(elevation),4*math.sin(elevation))
 for name,offset,power,color,size in [('主光',key_offset,300,rgb('key',p['key']),3),('补光',(2.5,2,1.2),160,rgb('fill',p['fill']),3.5),('轮廓',(1.2,-1.8,1.8),150*(1+render.get('rim',0)*4),rgb('rim',p['rim']),2.5),('暖色反光板',(0,2.1,-.35),45,(1,.88,.8),2.4)]:
  data=bpy.data.lights.new('柔光 · '+name,'AREA');data.energy=power*span*span*settings.get('light',1)*lighting.get('intensity',1);data.color=color;data.shape='DISK';data.size=size*span*(.75+lighting.get('softness',.6)*.5)
  obj=bpy.data.objects.new(data.name,data);scene.collection.objects.link(obj);obj['studio_softbox']=True;obj.location=Vector(center)+Vector(offset)*span;obj.rotation_euler=(Vector(center)-obj.location).to_track_quat('-Z','Y').to_euler()
  if name=='暖色反光板' and hasattr(data,'specular_factor'):data.specular_factor=0
 return p

def gpu_cycles(scene):
 preferences=bpy.context.preferences.addons['cycles'].preferences
 for backend in ['OPTIX','CUDA','HIP','ONEAPI','METAL']:
  try:
   preferences.compute_device_type=backend;preferences.get_devices()
   for device in preferences.devices:device.use=device.type==backend
   if any(d.use for d in preferences.devices):scene.cycles.device='GPU';return backend
  except Exception:pass
 scene.cycles.device='CPU';return 'CPU'
