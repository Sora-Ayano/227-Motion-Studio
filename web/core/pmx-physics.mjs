import {Vector3,Quaternion,Euler} from 'three';
const dynamic=name=>/skirt|スカート|hair|髪|ribbon|リボン|tie|ネクタイ|cape|mantle|tassel|earring|tail/i.test(name)&&!/root|base|attach|end|親|__Body/i.test(name);
export function buildPMXPhysics(bones,unitsPerMeter=12.5){const bodies=[],joints=[],byBone=new Map(),point=i=>new Vector3().fromArray(bones[i].position);
 function add(bone,child,{mode=0,group=0,radius=.035,mass=0}={}){const a=point(bone),b=child===undefined?a.clone():point(child),length=a.distanceTo(b),rotation=new Euler().setFromQuaternion(length>1e-6?new Quaternion().setFromUnitVectors(new Vector3(0,1,0),b.clone().sub(a).normalize()):new Quaternion());
  const id=bodies.length;bodies.push({name:bones[bone].original||bones[bone].name,bone,group,mask:mode?0xffff^(1<<group):0xffff,shape:length>.02*unitsPerMeter?2:0,size:[radius*unitsPerMeter,Math.max(.001,length-2*radius*unitsPerMeter),radius*unitsPerMeter],position:a.clone().lerp(b,.5).toArray(),rotation:[rotation.x,rotation.y,rotation.z],mass,linearDamping:.72,angularDamping:.8,restitution:0,friction:.5,mode});byBone.set(bone,id);return id;}
 const childOf=i=>bones.findIndex((b,j)=>j!==i&&b.parent===i&&!b.ik);
 // Conservative torso/head/limb volumes follow animation (PMX type 0).
 for(let i=0;i<bones.length;i++){const n=bones[i].name;if(/^(下半身|上半身2?|首|頭|[左右](腕|ひじ|足|ひざ|足首))$/.test(n)){let child=childOf(i);const radius=n==='頭'?.065:/上半身|下半身/.test(n)?.08:/腕|ひじ/.test(n)?.025:/足首/.test(n)?.035:/ひざ/.test(n)?.035:.055;add(i,child<0?undefined:child,{radius});}}
 for(let i=0;i<bones.length;i++){const bone=bones[i],n=bone.original||bone.name;if(!dynamic(n))continue;const child=childOf(i),skirt=/skirt|スカート|cape|mantle/i.test(n),group=skirt?2:/hair|髪/i.test(n)?1:3;
  const parent=bone.parent;if(parent<0)continue;let anchor=byBone.get(parent);if(anchor===undefined)anchor=add(parent,undefined,{radius:.008});
  const body=add(i,child<0?undefined:child,{mode:2,group,radius:skirt?.014:.009,mass:skirt?.12:.035});
  const angle=skirt?.45:.32;joints.push({name:n+' 接触弹簧',bodyA:anchor,bodyB:body,position:bone.position.slice(),rotation:[0,0,0],positionMin:[0,0,0],positionMax:[0,0,0],rotationMin:[-angle,-angle*.4,-angle],rotationMax:[angle,angle*.4,angle],springPosition:[0,0,0],springRotation:skirt?[45,65,45]:[18,25,18]});
 }
 return {bodies,joints};
}
