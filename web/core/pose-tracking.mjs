const center=person=>{const points=person.points;if(points?.length>=25)return {x:(points[23].x+points[24].x)*.5,y:(points[23].y+points[24].y)*.5};return {x:person.facePoints[1].x,y:person.facePoints[1].y};};
export class PersonTracker{
 constructor(max=5){this.max=max;this.tracks=[];this.tick=0;}
 update(people){this.tick++;if(!this.tracks.length){people=[...people].sort((a,b)=>center(a).x-center(b).x);this.tracks=people.slice(0,this.max).map((person,id)=>({id,last:center(person),velocity:{x:0,y:0},seen:this.tick}));return people.slice(0,this.max).map((p,id)=>({...p,id}));}
  const tracks=this.tracks,used=new Set();let best=null;
  function assign(i,cost,choices){if(best&&cost>=best.cost)return;if(i===tracks.length){best={cost,choices:choices.slice()};return;}const t=tracks[i],pred={x:t.last.x+t.velocity.x,y:t.last.y+t.velocity.y};assign(i+1,cost+.11,[...choices,-1]);for(let j=0;j<people.length;j++){if(used.has(j))continue;const p=center(people[j]),d=(p.x-pred.x)**2+(p.y-pred.y)**2;if(d>.11)continue;used.add(j);assign(i+1,cost+d,[...choices,j]);used.delete(j);}}
  assign(0,0,[]);const result=[];for(let i=0;i<tracks.length;i++){const j=best.choices[i];if(j<0)continue;const t=tracks[i],p=center(people[j]);used.add(j);t.velocity={x:(p.x-t.last.x)*.7,y:(p.y-t.last.y)*.7};t.last=p;t.seen=this.tick;result.push({...people[j],id:t.id});}
  for(let j=0;j<people.length&&tracks.length<this.max;j++)if(!used.has(j)){const id=tracks.length;tracks.push({id,last:center(people[j]),velocity:{x:0,y:0},seen:this.tick});result.push({...people[j],id});}return result;
 }
}
export function associateDetections(body,head,hands){const people=(body?.landmarks||[]).map((points,i)=>({points,world:body.worldLandmarks[i],facePoints:[],blendshapes:[],hands:[]}));
 for(let i=0;i<(head?.faceLandmarks?.length||0);i++){const points=head.faceLandmarks[i],nose=points[1];let person=null,d=.15**2;for(const p of people){const n=p.points[0],dist=(n.x-nose.x)**2+(n.y-nose.y)**2;if(dist<d){d=dist;person=p;}}if(person){person.facePoints=points;person.blendshapes=head.faceBlendshapes?.[i]?.categories||[];}}
 for(let i=0;i<(hands?.landmarks?.length||0);i++){const points=hands.landmarks[i],wrist=points[0];let person=null,side=null,d=.15**2;for(const p of people)for(const [s,k] of [['Left',15],['Right',16]]){const w=p.points[k],dist=(w.x-wrist.x)**2+(w.y-wrist.y)**2;if((w.visibility??1)>.45&&dist<d){d=dist;person=p;side=s;}}if(person)person.hands.push({side,points,world:hands.worldLandmarks[i],score:hands.handedness?.[i]?.[0]?.score??1});}
 return people;
}
