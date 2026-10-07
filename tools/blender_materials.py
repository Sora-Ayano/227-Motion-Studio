"""Native game shadow colors with real EEVEE lighting and fabric highlights."""
import bpy,base64

def character_materials(spec,folder):
 environment=spec.get('environment',{});render=spec.get('rendering',{})
 for index,mat in enumerate(bpy.data.materials):
  if not mat.use_nodes or not mat.get('studioToon'):continue
  tree=mat.node_tree;shader=next((n for n in tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
  if not shader:continue
  shader.inputs['Roughness'].default_value=environment.get('roughness',.75)
  if 'Sheen Weight' in shader.inputs and mat.name.endswith('_cloth'):shader.inputs['Sheen Weight'].default_value=environment.get('sheen',.35)
  base=shader.inputs['Base Color']
  if base.links:color=base.links[0].from_socket
  else:
   rgb=tree.nodes.new('ShaderNodeRGB');rgb.outputs[0].default_value=base.default_value;color=rgb.outputs[0]
  # Cycles retains its physical BSDF, with a low albedo floor for anime skin.
  if spec['quality']!='fast':
   tree.links.new(color,shader.inputs['Emission Color']);shader.inputs['Emission Strength'].default_value=.025;continue
  original=list(shader.outputs['BSDF'].links)
  diffuse=tree.nodes.new('ShaderNodeBsdfDiffuse');diffuse.inputs['Color'].default_value=(1,1,1,1);diffuse.inputs['Roughness'].default_value=1
  light=tree.nodes.new('ShaderNodeShaderToRGB');tree.links.new(diffuse.outputs[0],light.inputs[0]);luma=tree.nodes.new('ShaderNodeRGBToBW');tree.links.new(light.outputs[0],luma.inputs[0])
  ramp=tree.nodes.new('ShaderNodeMapRange');ramp.interpolation_type='SMOOTHERSTEP';ramp.clamp=True;ramp.inputs['From Min'].default_value=.012;ramp.inputs['From Max'].default_value=.25
  shadow=environment.get('characterShadow',.28) if environment.get('enabled') else .28
  ramp.inputs['To Min'].default_value=max(spec.get('lighting',{}).get('ambient',.16),1-shadow/.7);ramp.inputs['To Max'].default_value=1;tree.links.new(luma.outputs[0],ramp.inputs['Value'])
  dark=color;data=mat.get('studioShadowPNG')
  if data:
   filename=folder/('shadow-%d.png'%index);filename.write_bytes(base64.b64decode(data));texture=tree.nodes.new('ShaderNodeTexImage');texture.image=bpy.data.images.load(str(filename));uv=tree.nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap';vector=uv.outputs[0]
   if mat.get('studioShadowFlipY',True):
    flip=tree.nodes.new('ShaderNodeVectorMath');flip.operation='MULTIPLY';flip.inputs[1].default_value=(1,-1,1);tree.links.new(vector,flip.inputs[0]);shift=tree.nodes.new('ShaderNodeVectorMath');shift.operation='ADD';shift.inputs[1].default_value=(0,1,0);tree.links.new(flip.outputs[0],shift.inputs[0]);vector=shift.outputs[0]
   tree.links.new(vector,texture.inputs['Vector']);dark=texture.outputs['Color']
  floor=tree.nodes.new('ShaderNodeMixRGB');floor.blend_type='MULTIPLY';floor.inputs[0].default_value=1;floor.inputs[2].default_value=(.55,.55,.55,1);tree.links.new(color,floor.inputs[1]);bounded=tree.nodes.new('ShaderNodeMixRGB');bounded.blend_type='LIGHTEN';bounded.inputs[0].default_value=1;tree.links.new(dark,bounded.inputs[1]);tree.links.new(floor.outputs[0],bounded.inputs[2]);mix=tree.nodes.new('ShaderNodeMixRGB');tree.links.new(ramp.outputs[0],mix.inputs[0]);tree.links.new(bounded.outputs[0],mix.inputs[1]);tree.links.new(color,mix.inputs[2])
  emission=tree.nodes.new('ShaderNodeEmission');tree.links.new(mix.outputs[0],emission.inputs['Color']);emission.inputs['Strength'].default_value=.5
  final=tree.nodes.new('ShaderNodeMixShader');final.inputs[0].default_value=.88 if mat.name.endswith('_cloth') else .8;tree.links.new(emission.outputs[0],final.inputs[1]);tree.links.new(shader.outputs[0],final.inputs[2])
  for link in original:tree.links.new(final.outputs[0],link.to_socket)
