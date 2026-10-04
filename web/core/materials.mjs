import * as T from 'three';

export const previewLight={direction:{value:new T.Vector3(-2,4,-3).normalize()},intensity:{value:1},rim:{value:0},ambient:{value:.16},softness:{value:.35}};

// TTS/Character/Standard blends two authored colors using half-Lambert and
// ToonLamp. Keep Three's skin/morph shaders, but replace its generic lighting.
export function gameMaterial({name,map,shadowMap,rampMap,lining=false,color=0xffffff}){
 const mat=new T.MeshToonMaterial({name,map,color,side:T.FrontSide});
 mat.shadowSide=T.FrontSide;
 mat.userData.gameMaterial=true;
 mat.studioMaps={shadowMap,rampMap};
 if(lining||/noline|lining|eye_m/i.test(name))mat.userData.outlineParameters={visible:false};
 mat.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,{studioLight:previewLight.direction,studioIntensity:previewLight.intensity,studioRim:previewLight.rim,studioAmbient:previewLight.ambient,studioSoftness:previewLight.softness,
   studioShadow:{value:shadowMap||map},studioRamp:{value:rampMap}});
  shader.fragmentShader='uniform vec3 studioLight;\nuniform float studioIntensity;uniform float studioRim;uniform float studioAmbient;uniform float studioSoftness;\nuniform sampler2D studioShadow;\nuniform sampler2D studioRamp;\n'+shader.fragmentShader;
  let shading=`vec3 studioDirection=normalize((viewMatrix*vec4(studioLight,0.0)).xyz);
   float studioHalf=dot(normal,studioDirection)*0.5+0.5;
   float studioBlend=${rampMap?'texture2D(studioRamp,vec2(studioHalf)).r':'smoothstep(0.35,0.65,studioHalf)'};
   studioBlend=mix(studioBlend,smoothstep(0.15,0.85,studioHalf),studioSoftness);
   studioBlend=mix(studioBlend,1.0,studioAmbient);
   vec3 studioDark=${map?'texture2D(studioShadow,vMapUv).rgb*diffuse':'diffuseColor.rgb*0.8'};
   ${!shadowMap?'studioDark *= 0.85;':''}
   studioDark=max(studioDark,diffuseColor.rgb*0.42);
   vec3 outgoingLight=${lining?'studioDark':'mix(studioDark,diffuseColor.rgb,studioBlend)'}*studioIntensity;outgoingLight+=vec3(1.,.93,.96)*studioRim*pow(1.-max(0.,dot(normal,normalize(vViewPosition))),3.);`;
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
 mat.customProgramCacheKey=()=>`game-color-v2:${!!map}:${!!shadowMap}:${!!rampMap}:${lining}`;
 return mat;
}

// PMX material bit 0 means double-sided. Preserve culling for separate linings.
export const pmxMaterialFlags=material=>material.side===T.DoubleSide?1:0;
export function pmxUV(uv,map){
 const result=new T.Vector2(uv[0],uv[1]);
 if(map){map.updateMatrix();map.transformUv(result);}else result.y=1-result.y;
 return result.toArray();
}
