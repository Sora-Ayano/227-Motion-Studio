import * as T from 'three';
import {stageLighting,stageLightGLSL} from './stage-lighting.mjs';
import {characterLight,characterLightGLSL} from './character-light.mjs';

export const previewLight={direction:{value:new T.Vector3(-2,4,-3).normalize()},intensity:{value:1},rim:{value:0},ambient:{value:.16},softness:{value:.35},keyColor:{value:new T.Color('#ffffff')},fillColor:{value:new T.Color('#ffffff')},rimColor:{value:new T.Color('#fff0f5')},sheen:{value:0},roughness:{value:.75}};

// TTS/Character/Standard blends two authored colors using half-Lambert and
// ToonLamp. Keep Three's skin/morph shaders, but replace its generic lighting.
export function gameMaterial({name,map,shadowMap,rampMap,lining=false,cloth=false,kind='cloth',color=0xffffff}){
 const mat=new T.MeshToonMaterial({name,map,color,side:T.FrontSide});
 mat.shadowSide=T.FrontSide;
 mat.userData.gameMaterial=true;
 mat.userData.fabric=cloth;mat.userData.surfaceKind=kind;mat.userData.lining=lining;
 mat.studioMaps={shadowMap,rampMap};
 if(lining||/noline|lining|eye_m/i.test(name))mat.userData.outlineParameters={visible:false};
 mat.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,{studioLight:previewLight.direction,studioIntensity:previewLight.intensity,studioRim:previewLight.rim,studioAmbient:previewLight.ambient,studioSoftness:previewLight.softness,
   studioKeyColor:previewLight.keyColor,studioFillColor:previewLight.fillColor,studioRimColor:previewLight.rimColor,studioSheen:previewLight.sheen,studioRoughness:previewLight.roughness,studioShadow:{value:shadowMap||map},studioRamp:{value:rampMap}});
  Object.assign(shader.uniforms,{studioSH:characterLight.sh,studioIBL:characterLight.environment,studioShadowStrength:characterLight.shadow,studioFillStrength:characterLight.fill});
  Object.assign(shader.uniforms,{studioStagePositions:stageLighting.positions,studioStageDirections:stageLighting.directions,studioStageColors:stageLighting.colors,studioStageParameters:stageLighting.parameters});
  shader.fragmentShader=characterLightGLSL+'\n'+stageLightGLSL+'\nuniform vec3 studioLight,studioKeyColor,studioFillColor,studioRimColor;\nuniform float studioIntensity,studioRim,studioAmbient,studioSoftness,studioSheen,studioRoughness;\nuniform sampler2D studioShadow;\nuniform sampler2D studioRamp;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <shadowmap_pars_fragment>','#include <shadowmap_pars_fragment>\n#include <shadowmask_pars_fragment>');
  let shading=`vec3 studioDirection=normalize((viewMatrix*vec4(studioLight,0.0)).xyz);
   float studioHalf=dot(normal,studioDirection)*0.5+0.5;
   float studioBlend=${rampMap?'texture2D(studioRamp,vec2(studioHalf)).r':'smoothstep(0.35,0.65,studioHalf)'};
   studioBlend=mix(studioBlend,smoothstep(0.15,0.85,studioHalf),studioSoftness);
   studioBlend=mix(studioBlend,1.0,studioAmbient);
   studioBlend*=mix(1.,getShadowMask(),studioShadowStrength);
   vec3 studioDark=${map?'texture2D(studioShadow,vMapUv).rgb*diffuse':'diffuseColor.rgb*0.8'};
   ${!shadowMap?'studioDark *= 0.85;':''}
   studioDark=max(studioDark,diffuseColor.rgb*0.42);
   vec3 studioView=normalize(vViewPosition);
   vec3 outgoingLight=${lining?'studioDark':'mix(studioDark*studioFillColor,diffuseColor.rgb*studioKeyColor,studioBlend)'}*studioIntensity;
   vec3 studioWorldNormal=inverseTransformDirection(normal,viewMatrix);
   outgoingLight+=diffuseColor.rgb*(studioIrradiance(studioWorldNormal)*studioIBL+studioFillColor*studioFillStrength*smoothstep(-.6,.9,dot(studioWorldNormal,normalize(vec3(3.,1.,2.)))));
   outgoingLight+=diffuseColor.rgb*studioStageDiffuse(-vViewPosition,normal);
   outgoingLight+=studioRimColor*studioRim*pow(1.-max(0.,dot(normal,studioView)),3.);
   ${kind==='skin'&&!lining?'outgoingLight+=diffuseColor.rgb*studioKeyColor*.025*pow(1.-studioBlend,2.);':''}
   ${cloth&&!lining?`float studioGrazing=pow(1.-max(0.,dot(normal,studioView)),2.);
   float studioSpec=pow(max(0.,dot(normal,normalize(studioDirection+studioView))),mix(90.,7.,studioRoughness));
   outgoingLight+=diffuseColor.rgb*studioSheen*(studioGrazing*.1+studioSpec*.08)*studioKeyColor;`:''}`;
  // Linear blend skinning is not orthogonal at shoulder and elbow seams.
  // Transform normals with its cofactor matrix, rather than its position
  // matrix, so bent joints do not acquire inverted, nearly black normals.
  shader.vertexShader=shader.vertexShader.replace('#include <skinnormal_vertex>',`#ifdef USE_SKINNING
   mat4 skinMatrix=mat4(0.0);
   skinMatrix+=skinWeight.x*boneMatX;skinMatrix+=skinWeight.y*boneMatY;
   skinMatrix+=skinWeight.z*boneMatZ;skinMatrix+=skinWeight.w*boneMatW;
   skinMatrix=bindMatrixInverse*skinMatrix*bindMatrix;
   mat3 skinLinear=mat3(skinMatrix);
   mat3 skinCofactor=mat3(cross(skinLinear[1],skinLinear[2]),cross(skinLinear[2],skinLinear[0]),cross(skinLinear[0],skinLinear[1]));
   float skinDet=dot(skinLinear[0],skinCofactor[0]);
   objectNormal=abs(skinDet)>0.00001?skinCofactor*objectNormal/skinDet:skinLinear*objectNormal;
   #ifdef USE_TANGENT
   objectTangent=skinLinear*objectTangent;
   #endif
   #endif`);
  shader.fragmentShader=shader.fragmentShader.replace('vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',shading);
 };
 mat.customProgramCacheKey=()=>`game-color-v5:${kind}:${!!map}:${!!shadowMap}:${!!rampMap}:${lining}:${cloth}`;
 return mat;
}

// PMX material bit 0 means double-sided. Preserve culling for separate linings.
export const pmxMaterialFlags=material=>material.side===T.DoubleSide?1:0;
export function pmxUV(uv,map){
 const result=new T.Vector2(uv[0],uv[1]);
 if(map){map.updateMatrix();map.transformUv(result);}else result.y=1-result.y;
 return result.toArray();
}
