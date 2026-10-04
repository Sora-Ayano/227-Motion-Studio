import * as T from 'three';
export const HUMANOID={Hips:'下半身',Spine:'上半身',Chest:'上半身2',UpperChest:'上半身3',Neck:'首',Head:'頭',LeftEye:'左目',RightEye:'右目'};
export const MMD_PARENT={'全ての親':null,'センター':'全ての親','グルーブ':'センター','腰':'グルーブ','下半身':'腰','上半身':'腰','上半身2':'上半身','上半身3':'上半身2','首':'上半身3','頭':'首','両目':'頭','左目':'両目','右目':'両目'};
export const SEGMENT={'上半身':'上半身2','上半身2':'首','首':'頭'};
const ALIASES={Hips:['BodyPelvis','pelvis','hip','Bip001 Pelvis'],Spine:['BodySpine1','spine_01','Bip001 Spine'],Chest:['BodySpine2','spine1','spine_02','Bip001 Spine1'],UpperChest:['spine2','spine_03','Bip001 Spine2'],Neck:['BodyNeck','neck_01'],Head:['BodyHead'],LeftEye:['FaceEyeL','eye_l'],RightEye:['FaceEyeR','eye_r']};
for(const [side,jp,suffix] of [['Left','左','L'],['Right','右','R']]){
 for(const [u,m,a] of [['Shoulder','肩',['BodyShoulder','clavicle']],['UpperArm','腕',['BodyUpperArm','upperarm','arm']],['LowerArm','ひじ',['BodyForeArm','lowerarm','forearm']],['Hand','手首',['BodyHand','hand']],['UpperLeg','足',['BodyUpperLeg','thigh','upleg']],['LowerLeg','ひざ',['BodyLeg','calf','leg']],['Foot','足首',['BodyFoot','foot']],['Toes','つま先',['BodyToe','toe','toebase']]]){
  const name=side+u;HUMANOID[name]=jp+m;ALIASES[name]=a.flatMap(n=>[n+suffix,n+'_'+suffix,n+'_'+suffix.toLowerCase(),side+n,n+side]);
 }
 Object.assign(MMD_PARENT,{[jp+'肩P']:'上半身3',[jp+'肩']:jp+'肩P',[jp+'肩C']:jp+'肩',[jp+'腕']:jp+'肩C',[jp+'腕捩']:jp+'腕',[jp+'ひじ']:jp+'腕捩',[jp+'手捩']:jp+'ひじ',[jp+'手首']:jp+'手捩',[jp+'腰キャンセル']:'下半身',[jp+'足']:jp+'腰キャンセル',[jp+'ひざ']:jp+'足',[jp+'足首']:jp+'ひざ',[jp+'つま先']:jp+'足首'});
 Object.assign(SEGMENT,{[jp+'肩']:jp+'腕',[jp+'腕']:jp+'ひじ',[jp+'ひじ']:jp+'手首',[jp+'足']:jp+'ひざ',[jp+'ひざ']:jp+'足首',[jp+'足首']:jp+'つま先'});
 for(const [finger,j] of [['Thumb','親指'],['Index','人指'],['Middle','中指'],['Ring','薬指'],['Little','小指']])for(let i=0;i<3;i++){
  const u=side+finger+['Proximal','Intermediate','Distal'][i],m=jp+j+['０','１','２','３'][finger==='Thumb'?i:i+1];HUMANOID[u]=m;
  ALIASES[u]=[`BodyFinger${finger==='Little'?'Pinky':finger}${i+1}${suffix}`,`${side}Hand${finger==='Little'?'Pinky':finger}${i+1}`,`${finger.toLowerCase()}_0${i+1}_${suffix.toLowerCase()}`,`Bip001 ${suffix} Finger${['Thumb','Index','Middle','Ring','Little'].indexOf(finger)}${i||''}`];
  MMD_PARENT[m]=i===0?jp+'手首':HUMANOID[side+finger+['Proximal','Intermediate','Distal'][i-1]];
 }
}
const normalize=n=>n.replace(/^.*:/,'').replace(/^(mixamorig|bip\d+|cc_base|armature)/i,'').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
export function autoMap(bones,overrides={}){
 const mapping={},human={},used=new Set(),lookup=new Map();for(const b of bones){const n=normalize(b.name);if(!lookup.has(n))lookup.set(n,b);}
 for(const [u,m] of Object.entries(HUMANOID)){const name=Object.keys(overrides).find(n=>overrides[n]===m),b=name&&bones.find(b=>b.name===name);if(b){mapping[name]=m;human[u]=b;used.add(b);}}
 // Exact standard Japanese names take precedence over aliases.
 for(const [u,m] of Object.entries(HUMANOID)){if(human[u])continue;const candidates=[m,u,...(ALIASES[u]||[])];for(const alias of candidates){const b=lookup.get(normalize(alias));if(b&&!used.has(b)){mapping[b.name]=m;human[u]=b;used.add(b);break;}}}
 for(const [s,jp] of [['L','左'],['R','右']])for(const [native,mmd] of [['BodyUpperArmTwist','腕捩'],['BodyForearmTwist1','手捩']]){const b=bones.find(b=>b.name===native+s);if(b)mapping[b.name]=jp+mmd;}
 return {mapping,human,missing:['Hips','Spine','Head','LeftUpperArm','RightUpperArm','LeftLowerArm','RightLowerArm','LeftHand','RightHand','LeftUpperLeg','RightUpperLeg','LeftLowerLeg','RightLowerLeg','LeftFoot','RightFoot'].filter(n=>!human[n]),extras:bones.filter(b=>!used.has(b)).map(b=>b.name)};
}
export function canonicalPositions(angle=35){
 const p={'下半身':[0,11,0],'上半身':[0,11.5,0],'上半身2':[0,14,0],'上半身3':[0,15,0],'首':[0,16,0],'頭':[0,17,0]};
 for(const [s,sgn] of [['左',1],['右',-1]]){p[s+'肩']=[sgn*.4,15.8,0];p[s+'腕']=[sgn*1.5,15.6,0];const r=angle*Math.PI/180;p[s+'ひじ']=[sgn*(1.5+2.7*Math.cos(r)),15.6-2.7*Math.sin(r),0];p[s+'手首']=[sgn*(1.5+5*Math.cos(r)),15.6-5*Math.sin(r),0];p[s+'足']=[sgn*.9,10.5,0];p[s+'ひざ']=[sgn*.9,5.8,-.1];p[s+'足首']=[sgn*.9,1,0];p[s+'つま先']=[sgn*.9,.4,-1.2];}return p;
}
export function computeAlignments(model,mapping,sourcePositions=canonicalPositions(),convert=p=>new T.Vector3(-p[0],p[1],p[2])){
 const byMMD=new Map(model.bodyBones.filter(b=>mapping[b.name]).map(b=>[mapping[b.name],b])),align={};
 for(const [name,b] of byMMD){const child=byMMD.get(SEGMENT[name]);if(!child||!sourcePositions[name]||!sourcePositions[SEGMENT[name]])continue;
  const target=child.userData.rest.worldPosition.clone().sub(b.userData.rest.worldPosition),source=convert(sourcePositions[SEGMENT[name]]).sub(convert(sourcePositions[name]));if(target.lengthSq()>1e-9&&source.lengthSq()>1e-9)align[b.name]=new T.Quaternion().setFromUnitVectors(target.normalize(),source.normalize());
 }
 // Preserve the wrist's roll convention for twist helpers and fingers.
 for(const b of model.bodyBones){const m=mapping[b.name];if(m&&(/指/.test(m)||/捩/.test(m)||/手首/.test(m))){const side=m[0],anchor=byMMD.get(side+'ひじ');if(anchor&&align[anchor.name])align[b.name]=align[anchor.name].clone();}}
 return align;
}
export function standardUnityModel(){
 const motionRoot=new T.Group(),group=new T.Group();motionRoot.add(group);motionRoot.name='StandardUnityHumanoid';const bones=[],byName={};
 const add=(name,parent,position)=>{const b=new T.Bone();b.name=name;b.userData={key:'body/'+name,family:'body'};(byName[parent]||group).add(b);b.position.fromArray(position);byName[name]=b;bones.push(b);return b;};
 add('Hips',null,[0,.9,0]);add('Spine','Hips',[0,.15,0]);add('Chest','Spine',[0,.18,0]);add('Neck','Chest',[0,.16,0]);add('Head','Neck',[0,.12,0]);
 for(const [s,x] of [['Left',-1],['Right',1]]){add(s+'Shoulder','Chest',[x*.06,.12,0]);add(s+'UpperArm',s+'Shoulder',[x*.12,0,0]);add(s+'LowerArm',s+'UpperArm',[x*.26,0,0]);add(s+'Hand',s+'LowerArm',[x*.23,0,0]);add(s+'UpperLeg','Hips',[x*.09,0,0]);add(s+'LowerLeg',s+'UpperLeg',[0,-.42,-.025]);add(s+'Foot',s+'LowerLeg',[0,-.4,.025]);add(s+'Toes',s+'Foot',[0,-.04,-.13]);
  for(const f of ['Thumb','Index','Middle','Ring','Little'])for(let i=0;i<3;i++)add(s+f+['Proximal','Intermediate','Distal'][i],i?s+f+['Proximal','Intermediate'][i-1]:s+'Hand',[x*(i?.025:.045),0,(f==='Thumb'?-.045:['Index','Middle','Ring','Little'].indexOf(f)*.019-.024)]);
 }
 add('LeftEye','Head',[-.03,.08,-.07]);add('RightEye','Head',[.03,.08,-.07]);
 const helper=new T.SkeletonHelper(group);helper.material.depthTest=false;helper.material.color.set('#a99bff');motionRoot.add(helper);
 return {motionRoot,group,bones,bodyBones:bones,meshes:[],morphs:[],materials:[],parts:[],profile:{id:'unity-standard',name:'标准 Unity 人形',bodyScale:1,headScale:1},components:{},bindError:0,updateAttachments(){},dispose(){helper.dispose();motionRoot.removeFromParent();}};
}
