import * as T from 'three';
// Three small passes replace the multi-scale bloom pyramid in live preview.
export function createSoftBloom(renderer){
 const options={type:T.HalfFloatType,depthBuffer:false,stencilBuffer:false};
 const a=new T.WebGLRenderTarget(1,1,options),b=new T.WebGLRenderTarget(1,1,options);
 const uniforms={image:{value:null},pixel:{value:new T.Vector2()},direction:{value:new T.Vector2()},threshold:{value:1.4},extract:{value:false}};
 const material=new T.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms,
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader:`varying vec2 vUv;uniform sampler2D image;uniform vec2 pixel,direction;uniform float threshold;uniform bool extract;
   void main(){vec3 c;if(extract){c=texture2D(image,vUv).rgb;float l=max(c.r,max(c.g,c.b));c*=max(0.,l-threshold)/max(l,.0001);}
   else {vec2 d=pixel*direction;c=texture2D(image,vUv).rgb*.227027;c+=(texture2D(image,vUv+d*1.384615).rgb+texture2D(image,vUv-d*1.384615).rgb)*.316216;c+=(texture2D(image,vUv+d*3.230769).rgb+texture2D(image,vUv-d*3.230769).rgb)*.070270;}
   gl_FragColor=vec4(c,1.);}`});
 const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,0,1);scene.add(new T.Mesh(new T.PlaneGeometry(2,2),material));
 return {render(input,threshold=1.4,preview=true){const width=Math.max(1,Math.floor(input.width/(preview?4:2))),height=Math.max(1,Math.floor(input.height/(preview?4:2)));if(a.width!==width||a.height!==height){a.setSize(width,height);b.setSize(width,height);}const old=renderer.getRenderTarget();uniforms.image.value=input.texture;uniforms.extract.value=true;uniforms.threshold.value=threshold;renderer.setRenderTarget(a);renderer.render(scene,camera);uniforms.extract.value=false;uniforms.pixel.value.set(1/width,1/height);uniforms.direction.value.set(1,0);uniforms.image.value=a.texture;renderer.setRenderTarget(b);renderer.render(scene,camera);uniforms.direction.value.set(0,1);uniforms.image.value=b.texture;renderer.setRenderTarget(a);renderer.render(scene,camera);renderer.setRenderTarget(old);return a.texture;},dispose(){a.dispose();b.dispose();material.dispose();scene.children[0].geometry.dispose();}};
}
