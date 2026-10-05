export class PreviewPerformance {
 constructor(){this.scale=1;this.average=16.7;this.samples=0;this.cooldown=0;}
 observe(milliseconds,fps=60){if(!Number.isFinite(milliseconds)||milliseconds<=0)return false;this.average=this.average*.92+milliseconds*.08;if(this.cooldown-->0)return false;if(++this.samples<45)return false;this.samples=0;const before=this.scale,target=1000/fps;if(this.average>target*1.3)this.scale=Math.max(.6,this.scale-.1);else if(this.average<target*1.08)this.scale=Math.min(1,this.scale+.05);if(before!==this.scale){this.cooldown=90;return true;}return false;}
 reset(){this.scale=1;this.samples=0;this.average=16.7;this.cooldown=0;}
}
