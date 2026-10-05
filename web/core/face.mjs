const clamp=x=>Math.max(0,Math.min(1,x||0));
const suffix=name=>name.replace(/^.*BS_/,'').toLowerCase();
export class FaceSolver{
 constructor(model,{smoothing=.35,mirror=false,faceMapping={}}={}){this.model=model;this.smoothing=smoothing;this.mirror=mirror;this.mapping=faceMapping;this.last=new Map();this.matched=new Set();}
 frame(categories,frame){
  const scores=Object.fromEntries(categories.map(c=>[c.categoryName,clamp(c.score)])),s=n=>scores[this.mirror?n.replace(/Left|Right/g,x=>x==='Left'?'Right':'Left'):n]||0;
  const left=s('eyeBlinkLeft'),right=s('eyeBlinkRight'),smile=(s('mouthSmileLeft')+s('mouthSmileRight'))/2;
  const aliases={eyelid_blink:(left+right)/2,eyelid_blink_l:left,eyelid_blink_r:right,'まばたき':(left+right)/2,'ウィンク':left,'ウィンク右':right,
   mouth_a:s('jawOpen')*(1-s('mouthPucker')),mouth_o:s('jawOpen')*s('mouthFunnel'),mouth_u:s('mouthPucker'),mouth_i:smile*.5,mouth_smile:smile,'あ':s('jawOpen')*(1-s('mouthPucker')),'お':s('jawOpen')*s('mouthFunnel'),'う':s('mouthPucker'),'にこり':smile,
   eyebrow_sad:s('browInnerUp'),eyebrow_angry:(s('browDownLeft')+s('browDownRight'))/2,eyebrow_amazed:(s('browOuterUpLeft')+s('browOuterUpRight'))/2,'困る':s('browInnerUp'),'怒り':(s('browDownLeft')+s('browDownRight'))/2,'驚き':s('browInnerUp')};
  const names=new Set(this.model.morphs.map(m=>suffix(m.name))),separate=names.has('eyelid_blink_l')&&names.has('eyelid_blink_r');
  const keys={};for(const m of this.model.morphs){const n=suffix(m.name),direct=Object.keys(scores).find(k=>k.toLowerCase()===n);if(!direct&&!Object.hasOwn(aliases,n)&&!this.mapping[m.key]?.source)continue;
   const custom=this.mapping[m.key];if(custom?.source==='disabled')continue;
   let weight=direct?s(direct):aliases[n];if(custom?.source)weight=s(custom.source)*(custom.gain??1)+(custom.offset??0);if(separate&&n==='eyelid_blink'&&!custom?.source)weight=0;const previous=this.last.get(m.key);if(previous!==undefined)weight=previous*this.smoothing+weight*(1-this.smoothing);this.last.set(m.key,weight);this.matched.add(m.key);keys[m.key]={frame,weight:clamp(weight)};
  }return keys;
 }
}
