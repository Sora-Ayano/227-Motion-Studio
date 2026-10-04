import * as T from 'three';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
export const FILTERS=[['original','原色'],['clear','清透'],['warm','暖色'],['cool','冷色'],['cinema','电影'],['soft','柔光'],['mono','黑白'],['kyoani','京阿尼风格 · 通透暖光'],['pastel','粉彩日系'],['cel','清晰赛璐璐'],['retro','复古胶片'],['night','蓝调夜景'],['sunset','落日琥珀']];
// The filter is rendered into the canvas, so screenshots and MP4 capture it too.
export function createFilters(renderer){
 const target=new T.WebGLRenderTarget(1,1,{samples:2,type:T.HalfFloatType});target.depthTexture=new T.DepthTexture(1,1);const bloom=new UnrealBloomPass(new T.Vector2(1,1),.18,.25,.85);let bloomSize='';const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,0,1);
 const material=new T.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{image:{value:target.texture},preset:{value:0},strength:{value:1},green:{value:false},depth:{value:target.depthTexture},pixel:{value:new T.Vector2()},focus:{value:3},blur:{value:0},near:{value:.01},far:{value:200},orthographic:{value:false},exposure:{value:1},filmic:{value:false},vignette:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',fragmentShader:`
  uniform sampler2D image;uniform int preset;uniform float strength;uniform bool green;uniform sampler2D depth;uniform vec2 pixel;uniform float focus,blur,near,far,exposure,vignette;uniform bool orthographic,filmic;varying vec2 vUv;
  float distanceAt(vec2 uv){float z=texture2D(depth,uv).x;return orthographic?mix(near,far,z):near*far/(far-(far-near)*z);}
  vec3 aces(vec3 v){return clamp((v*(2.51*v+.03))/(v*(2.43*v+.59)+.14),0.,1.);}
  void main(){vec4 raw=texture2D(image,vUv);bool keyGreen=green&&raw.g>.98&&raw.r<.001&&raw.b<.001;if(blur>0.&&!keyGreen){float center=distanceAt(vUv),radius=min(1.,abs(center-focus)/max(focus,.1))*blur;vec3 sum=raw.rgb;float weights=1.;for(int i=0;i<12;i++){float angle=float(i)*2.399963;vec2 uv=clamp(vUv+vec2(cos(angle),sin(angle))*pixel*radius*sqrt((float(i)+.5)/12.),vec2(0.),vec2(1.));float sampleDistance=distanceAt(uv);float w=sampleDistance<focus*.7&&center>focus*1.2?.05:1.;sum+=texture2D(image,uv).rgb*w;weights+=w;}raw.rgb=sum/weights;}raw.rgb*=exposure;if(filmic)raw.rgb=aces(raw.rgb);vec3 c=sRGBTransferOETF(raw).rgb,graded=c;float l=dot(c,vec3(.2126,.7152,.0722));
   if(preset==1){graded=(mix(vec3(l),c,1.12)-.5)*1.04+.52;}
   if(preset==2)graded=c*vec3(1.07,1.02,.94);
   if(preset==3)graded=c*vec3(.94,1.01,1.08);
   if(preset==4){graded=(mix(vec3(l),c,.88)-.5)*1.13+.5;graded+=vec3(.025,.012,-.018);graded*=1.-.22*pow(length(vUv-.5),2.);}
   if(preset==5){graded=mix(vec3(l),c,.97);graded*=1.-.06*smoothstep(.55,1.,l);graded+=vec3(.007)*smoothstep(.25,0.,l);}
   if(preset==6)graded=vec3(l);
   if(preset==7){float high=smoothstep(.45,.98,l),shadow=1.-smoothstep(.05,.48,l);graded=mix(vec3(l),c,1.035);graded+=vec3(.012,.004,-.008)*high+vec3(-.007,.003,.012)*shadow;graded*=1.-.055*high;}
   if(preset==8){graded=mix(vec3(l),c,.88);graded+=vec3(.014,.005,.012)*(1.-l);graded*=1.-.055*smoothstep(.6,1.,l);}
   if(preset==9){graded=(mix(vec3(l),c,1.07)-.5)*1.045+.5;graded*=1.-.035*smoothstep(.75,1.,l);}
   if(preset==10){graded=mix(vec3(l),c,.8);graded=graded*.95+vec3(.018,.011,.004);graded*=vec3(1.025,1.,.95);}
   if(preset==11){graded=c*vec3(.82,.94,1.06);graded+=vec3(.008,.005,.025)*(1.-l);}
   if(preset==12){graded=c*vec3(1.04,.96,.88);graded+=vec3(.016,.005,0.)*(1.-l);graded*=1.-.05*smoothstep(.6,1.,l);}
   vec3 result=clamp(mix(c,graded,strength),0.,1.);result*=1.-vignette*smoothstep(.15,.7,length(vUv-.5));if(keyGreen||green&&distance(c,vec3(0.,1.,0.))<.015)result=vec3(0.,1.,0.);gl_FragColor=vec4(result,raw.a);
  }`});scene.add(new T.Mesh(new T.PlaneGeometry(2,2),material));
 return {render(draw,preset='original',strength=1,green=false,options={},viewCamera=null){const index=FILTERS.findIndex(f=>f[0]===preset);if(index<=0&&!options.enabled){draw();return;}const size=renderer.getDrawingBufferSize(new T.Vector2());if(target.width!==size.x||target.height!==size.y)target.setSize(size.x,size.y);renderer.setRenderTarget(target);draw();if(options.enabled&&!green&&options.bloom>0){const stamp=size.x+'x'+size.y;if(stamp!==bloomSize){bloom.setSize(Math.max(1,size.x/2),Math.max(1,size.y/2));bloomSize=stamp;}bloom.strength=options.bloom;bloom.radius=.3;bloom.threshold=options.bloomThreshold??1.4;bloom.render(renderer,null,target,0,false);}renderer.setRenderTarget(null);const u=material.uniforms;u.pixel.value.set(1/size.x,1/size.y);u.focus.value=options.focus??3;u.blur.value=options.enabled?options.dof||0:0;u.exposure.value=options.enabled?options.exposure??1:1;u.filmic.value=options.enabled&&options.filmic===true;u.vignette.value=options.enabled?options.vignette??0:0;u.near.value=viewCamera?.near||.01;u.far.value=viewCamera?.far||200;u.orthographic.value=!!viewCamera?.isOrthographicCamera;material.uniforms.preset.value=Math.max(0,index);material.uniforms.strength.value=strength;material.uniforms.green.value=green;renderer.autoClear=true;renderer.render(scene,camera);}};
}

export function renderPreset(style){const common={enabled:true,style,autoFocus:true,filmic:false,exposure:.98,bloom:0,bloomThreshold:1.4,dof:0,focus:3,rim:.025,vignette:0};if(style==='anime')return {...common,bloom:.025,rim:.025};if(style==='kyoani')return {...common,exposure:.97,bloom:.02,rim:.025};if(style==='cinematic')return {...common,filmic:true,exposure:.88,bloom:.04,dof:1,rim:.04,vignette:.12};return {...common,enabled:false,exposure:1,rim:0};}
