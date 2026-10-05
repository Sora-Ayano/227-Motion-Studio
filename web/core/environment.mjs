import * as T from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {EXRLoader} from 'three/addons/loaders/EXRLoader.js';
import {Reflector} from 'three/addons/objects/Reflector.js';

export const LIGHTING_PRESETS={
 studio:{key:'#fff6eb',fill:'#cadbff',rim:'#ddd5ff',intensity:1,ambient:.19,softness:.6,azimuth:-34,elevation:42,environment:.3},
 night:{key:'#dddfff',fill:'#879ecb',rim:'#aaa1ff',intensity:.93,ambient:.12,softness:.62,azimuth:-48,elevation:48,environment:.18},
 petal:{key:'#fff0dd',fill:'#d1e8ee',rim:'#ffdbe7',intensity:1,ambient:.24,softness:.76,azimuth:-28,elevation:50,environment:.32},
 pink:{key:'#fff2f5',fill:'#d7e5ff',rim:'#ffc3df',intensity:.96,ambient:.25,softness:.82,azimuth:-32,elevation:46,environment:.32},
};
export function lightingPreset(name){return {...(LIGHTING_PRESETS[name]||LIGHTING_PRESETS.studio),preset:name};}

// A small local PMREM provides filtered image-based light without a network HDRI.
// Its texture belongs to this controller, never to a character material.
export function createEnvironment(renderer,scene,keyLight){
 const generator=new T.PMREMGenerator(renderer),room=new RoomEnvironment();
 const studio=generator.fromScene(room,.08);room.dispose();let imported=null,source=null;
 const fill=new T.DirectionalLight(0xcadbff,.4),rim=new T.DirectionalLight(0xddd5ff,.55);
 fill.position.set(3,2,-2);rim.position.set(1,3,3);scene.add(fill,rim);
 const floor=new Reflector(new T.PlaneGeometry(18,18),{textureWidth:512,textureHeight:512,color:0x464959,clipBias:.003});
 floor.name='可调反射地面';floor.rotation.x=-Math.PI/2;floor.position.y=.004;floor.visible=false;
 floor.material.uniforms.studioReflection={value:.22};
 floor.material.fragmentShader=floor.material.fragmentShader.replace('uniform vec3 color;','uniform vec3 color;\nuniform float studioReflection;').replace('vec4( blendOverlay( base.rgb, color ), 1.0 )','vec4( mix( color * 0.12, blendOverlay( base.rgb, color ), studioReflection ), 1.0 )');
 const reflect=floor.onBeforeRender;let reflectionTick=0,fullReflection=true;floor.onBeforeRender=function(...args){if(!fullReflection&&reflectionTick++%3!==0)return;reflect.apply(this,args);};floor.material.userData.outlineParameters={visible:false};
 scene.add(floor);let stamp='';
 return {
  async load(file){const buffer=await file.arrayBuffer(),texture=/\.exr$/i.test(file.name)?new EXRLoader().parse(buffer):new HDRLoader().parse(buffer);
   const data=new T.DataTexture(texture.data,texture.width,texture.height,texture.format||T.RGBAFormat,texture.type);data.colorSpace=T.LinearSRGBColorSpace;data.minFilter=data.magFilter=T.LinearFilter;data.generateMipmaps=false;data.flipY=texture.flipY??true;data.mapping=T.EquirectangularReflectionMapping;data.needsUpdate=true;
   const next=generator.fromEquirectangular(data);imported?.dispose();source?.dispose();imported=next;source=data;stamp='';},
  clear(){imported?.dispose();source?.dispose();imported=source=null;stamp='';},
  update(options={},green=false){const p=lightingPreset(options.preset||'studio'),enabled=options.enabled===true;
   keyLight.color.set(enabled?(options.key||p.key):'#ffffff');fill.visible=rim.visible=enabled;
   fill.color.set(options.fill||p.fill);fill.intensity=enabled?(options.fillIntensity??.38):0;
   rim.color.set(options.rim||p.rim);rim.intensity=enabled?(options.rimIntensity??.65):0;
   scene.environment=enabled?(imported||studio).texture:null;scene.environmentIntensity=options.intensity??p.environment;
   floor.visible=enabled&&!green&&options.reflection===true;
   floor.material.uniforms.studioReflection.value=Math.min(.65,Math.max(0,options.reflectionStrength??.22));
   fullReflection=options.exporting===true||options.quality==='high';const size=fullReflection?1024:384;if(floor.getRenderTarget().width!==size)floor.getRenderTarget().setSize(size,size);
   const fogStamp=JSON.stringify([enabled&&!green&&options.fog,options.fogColor,options.fogDensity]);if(stamp!==fogStamp){scene.fog=enabled&&!green&&options.fog?new T.FogExp2(options.fogColor||'#343e57',Math.max(0,options.fogDensity??.025)):null;stamp=fogStamp;}
  },
  dispose(){studio.dispose();imported?.dispose();source?.dispose();generator.dispose();floor.getRenderTarget().dispose();floor.geometry.dispose();floor.material.dispose();floor.removeFromParent();fill.removeFromParent();rim.removeFromParent();},
 };
}
