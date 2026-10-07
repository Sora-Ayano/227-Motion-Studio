export const nativeFilters=['original','clear','warm','cool','cinema','soft','mono','kyoani','pastel','cel','retro','night','sunset','reference-night','reference-petal','anime-pink'];
export function nativeGrade(spec){
 if(spec.green)return '';
 const amount=spec.filterStrength??1,preset={clear:[1.12,1.04,.012],warm:[1,1,0,1.07,1.02,.94],cool:[1,1,0,.94,1.01,1.08],cinema:[.88,1.13,0,1.025,1.012,.982],soft:[.97,.99,-.008],mono:[0,1,0],kyoani:[1.035,1.01,-.006,1.012,1.004,.992],pastel:[.88,.99,-.008,1.014,1.005,1.012],cel:[1.07,1.045,-.004],retro:[.8,.95,.008,1.025,1,.95],night:[1,1,0,.82,.94,1.06],sunset:[1,1,-.005,1.04,.96,.88],'reference-night':[1.02,1,-.005,.965,.98,1.015],'reference-petal':[.96,1,-.008,1.018,1,.98],'anime-pink':[.96,1.015,-.01,1.018,1.002,1.012]}[spec.filter];
 const chain=[];if(preset&&amount>0){const [sat,contrast,brightness,r=1,g=1,b=1]=preset,blend=(v,base=1)=>base+(v-base)*amount;chain.push(`eq=saturation=${blend(sat)}:contrast=${blend(contrast)}:brightness=${brightness*amount}`,`colorchannelmixer=rr=${blend(r)}:gg=${blend(g)}:bb=${blend(b)}`);}
 const vignette=spec.rendering?.enabled?spec.rendering.vignette||0:0;if(vignette)chain.push(`vignette=angle=${vignette*2.5}`);return chain.join(',');
}
export function validateNativeLook(s){
 s.filter??='original';if(!nativeFilters.includes(s.filter))throw new Error('滤镜无效');s.filterStrength??=1;if(!Number.isFinite(s.filterStrength)||s.filterStrength<0||s.filterStrength>1)throw new Error('滤镜强度无效');
 const number=(source,key,min,max,fallback)=>{const n=source?.[key]??fallback;if(!Number.isFinite(n)||n<min||n>max)throw new Error('渲染参数无效：'+key);return n;};
 const render=s.rendering||{};s.rendering={enabled:render.enabled===true,filmic:render.filmic===true,autoFocus:render.autoFocus!==false,exposure:number(render,'exposure',.1,4,1),bloom:number(render,'bloom',0,1.5,0),bloomThreshold:number(render,'bloomThreshold',0,10,1.4),dof:number(render,'dof',0,16,0),focus:number(render,'focus',.1,1000,3),rim:number(render,'rim',0,.5,0),vignette:number(render,'vignette',0,.5,0),style:String(render.style||'original').slice(0,32)};
 const environment=s.environment||{},color=(key,fallback)=>{const c=environment[key]||fallback;if(!/^#[0-9a-f]{6}$/i.test(c))throw new Error('灯光颜色无效');return c;};
 s.environment={enabled:environment.enabled===true,key:color('key','#fff6eb'),fill:color('fill','#cadbff'),rim:color('rim','#ddd5ff'),characterShadow:number(environment,'characterShadow',0,.7,.28),diffuseIntensity:number(environment,'diffuseIntensity',0,.6,.25),intensity:number(environment,'intensity',0,1.5,.3),roughness:number(environment,'roughness',.15,1,.75),sheen:number(environment,'sheen',0,1,.35),stageSoftness:number(environment,'stageSoftness',.1,1,.8)};
 const lighting=s.lighting||{};s.lighting={ambient:number(lighting,'ambient',0,1,.16),softness:number(lighting,'softness',0,1,.6),azimuth:number(lighting,'azimuth',-360,360,-34),elevation:number(lighting,'elevation',-90,90,42),intensity:number(lighting,'intensity',0,10,1)};
 if(s.fabric&&!['silk','cotton','structured'].includes(s.fabric))throw new Error('布料预设无效');return s;
}
