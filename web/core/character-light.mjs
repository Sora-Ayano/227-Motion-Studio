import {Vector3} from 'three';
export const characterLight={
 sh:{value:Array.from({length:9},()=>new Vector3())},
 environment:{value:.16},shadow:{value:.28},fill:{value:.12},
};
// Third-order irradiance from the actual environment, evaluated in world space.
export const characterLightGLSL=`
uniform vec3 studioSH[9];uniform float studioIBL,studioShadowStrength,studioFillStrength;
vec3 studioIrradiance(vec3 n){float x=n.x,y=n.y,z=n.z;
 vec3 result=0.886227*studioSH[0]+1.023328*(studioSH[1]*y+studioSH[2]*z+studioSH[3]*x)
 +0.858086*(studioSH[4]*x*y+studioSH[5]*y*z+studioSH[7]*x*z)
 +studioSH[6]*(0.743125*z*z-0.247708)+studioSH[8]*0.429043*(x*x-y*y);
 return clamp(result/3.141593,vec3(0.),vec3(2.));
}`;
