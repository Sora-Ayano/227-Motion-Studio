import {BufferAttribute,Vector3,Matrix4,Matrix3,Quaternion} from 'three';
import {capsuleTriangleContact} from './cloth-contact.mjs';
const isCloth=name=>/skirt|スカート|cloth|cape|mantle/i.test(name)&&!/root|親/i.test(name);
function clothWeight(mesh,i){const a=mesh.geometry.attributes;let w=0;for(let k=0;k<4;k++)if(isCloth(mesh.skeleton.bones[a.skinIndex.getComponent(i,k)]?.name||''))w+=a.skinWeight.getComponent(i,k);return w;}

// Refine long cloth edges only. Every attribute, UV seam and skin weight is
// interpolated; simulation particles weld coincident seam vertices separately.
export function prepareCloth(model){for(const mesh of model.meshes||[]){if(!mesh.isSkinnedMesh||mesh.userData.clothSurfaceReady)continue;mesh.userData.clothSurfaceReady=true;
 const old=mesh.geometry;if(!old.index||!old.attributes.skinIndex)continue;
 const weights=Array.from({length:old.attributes.position.count},(_,i)=>clothWeight(mesh,i));if(!weights.some(w=>w>.5))continue;
 const attrs=Object.fromEntries(Object.entries(old.attributes).map(([name,a])=>[name,{a,data:Array.from(a.array)}]));
 const morphs=Object.fromEntries(Object.entries(old.morphAttributes).map(([name,list])=>[name,list.map(a=>({a,data:Array.from(a.array)}))]));
 const midpoints=new Map();const position=i=>new Vector3().fromArray(attrs.position.data,i*3);
 function midpoint(a,b){const key=Math.min(a,b)+':'+Math.max(a,b);if(midpoints.has(key))return midpoints.get(key);const id=weights.length;weights.push((weights[a]+weights[b])/2);midpoints.set(key,id);
  for(const [name,{a:attribute,data}] of Object.entries(attrs)){if(name==='skinIndex'||name==='skinWeight')continue;for(let k=0;k<attribute.itemSize;k++)data.push((data[a*attribute.itemSize+k]+data[b*attribute.itemSize+k])/2);}
  const jointWeights=new Map();for(const vertex of [a,b])for(let k=0;k<4;k++){const joint=attrs.skinIndex.data[vertex*4+k],w=attrs.skinWeight.data[vertex*4+k]*.5;jointWeights.set(joint,(jointWeights.get(joint)||0)+w);}const joints=[...jointWeights].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=joints.reduce((s,j)=>s+j[1],0);for(let k=0;k<4;k++){attrs.skinIndex.data.push(joints[k]?.[0]||0);attrs.skinWeight.data.push((joints[k]?.[1]||0)/sum);}
  for(const list of Object.values(morphs))for(const {a:attribute,data} of list)for(let k=0;k<attribute.itemSize;k++)data.push((data[a*attribute.itemSize+k]+data[b*attribute.itemSize+k])/2);
  return id;
 }
 const indices=[],groups=old.groups.length?old.groups:[{start:0,count:old.index.count,materialIndex:0}],newGroups=[];
 function triangle(a,b,c,depth=0){const p=[position(a),position(b),position(c)],lengths=[p[0].distanceToSquared(p[1]),p[1].distanceToSquared(p[2]),p[2].distanceToSquared(p[0])];let edge=lengths.indexOf(Math.max(...lengths));
  if(depth<7&&Math.min(weights[a],weights[b],weights[c])>.45&&lengths[edge]>.055**2&&weights.length<45000){const v=[a,b,c],x=v[edge],y=v[(edge+1)%3],z=v[(edge+2)%3],m=midpoint(x,y);triangle(x,m,z,depth+1);triangle(m,y,z,depth+1);}else indices.push(a,b,c);
 }
 for(const g of groups){const start=indices.length;for(let i=g.start;i<g.start+g.count;i+=3)triangle(old.index.getX(i),old.index.getX(i+1),old.index.getX(i+2));newGroups.push({...g,start,count:indices.length-start});}
 const geo=old.clone();for(const [name,{a,data}] of Object.entries(attrs))geo.setAttribute(name,new BufferAttribute(new a.array.constructor(data),a.itemSize,a.normalized));geo.setIndex(indices);geo.groups=newGroups;
 for(const [name,list] of Object.entries(morphs))geo.morphAttributes[name]=list.map(({a,data})=>{const attr=new BufferAttribute(new a.array.constructor(data),a.itemSize,a.normalized);attr.name=a.name;return attr;});mesh.geometry=geo;old.dispose();if(geo.attributes.normal)geo.normalizeNormals();
 mesh.userData.clothRestPositions=geo.attributes.position.array.slice();mesh.userData.clothRestNormals=geo.attributes.normal?.array.slice();mesh.userData.clothVertexIds=weights.flatMap((w,i)=>w>.45?[i]:[]);
 const weld=new Map(),particles=[],vertexToParticle=new Map();const p=new Vector3();
 for(const i of mesh.userData.clothVertexIds){p.fromBufferAttribute(geo.attributes.position,i);const key=[p.x,p.y,p.z].map(v=>Math.round(v*1e5)).join(',');let id=weld.get(key);if(id===undefined){id=particles.length;weld.set(key,id);particles.push({vertices:[],rest:p.clone(),x:new Vector3(),velocity:new Vector3(),lastGoal:new Vector3(),goal:new Vector3(),mass:1});}particles[id].vertices.push(i);vertexToParticle.set(i,id);}
 const min=Math.min(...particles.map(p=>p.rest.y)),max=Math.max(...particles.map(p=>p.rest.y));for(const p of particles)p.mass=p.rest.y>max-(max-min)*.035?0:Math.max(.12,Math.min(1,(max-p.rest.y)/Math.max(.001,max-min)));
 const triangles=[],normalFaces=[],edges=new Map();for(let i=0;i<indices.length;i+=3){const vertices=indices.slice(i,i+3),ids=vertices.map(v=>vertexToParticle.get(v));if(ids.some(i=>i===undefined)||new Set(ids).size<3)continue;triangles.push(ids);normalFaces.push(vertices);for(let k=0;k<3;k++){const a=ids[k],b=ids[(k+1)%3],other=ids[(k+2)%3],key=Math.min(a,b)+':'+Math.max(a,b);if(edges.has(key)){edges.get(key).other.push(other);}else edges.set(key,{a,b,other:[other]});}}
 const scale=mesh.getWorldScale(new Vector3()),size=Math.max(Math.abs(scale.x),Math.abs(scale.y),Math.abs(scale.z));
 const constraints=[...edges.values()].map(e=>({...e,length:particles[e.a].rest.distanceTo(particles[e.b].rest)*size,compliance:2e-7,lambda:0}));
 for(const e of edges.values())if(e.other.length===2){const [a,b]=e.other;constraints.push({a,b,length:particles[a].rest.distanceTo(particles[b].rest)*size,compliance:3e-5,lambda:0});}
 mesh.userData.clothSurface={particles,triangles,constraints,normalFaces,vertexToParticle,faces:triangles.map(ids=>({ps:ids.map(i=>particles[i]),normal:new Vector3()})),lastTime:null,lastToken:null};
}model.clothProxies=null;}

const faceSamples=[[1/3,1/3,1/3],[.5,.5,0],[0,.5,.5],[.5,0,.5]];
function capsuleData([a,b,r,open]){const ab=b.clone().sub(a),length=ab.length();return {a,b,r,open,ab,invLengthSq:1/Math.max(ab.lengthSq(),1e-9),axis:ab.clone().divideScalar(length||1),length,minX:Math.min(a.x,b.x)-r,maxX:Math.max(a.x,b.x)+r,minY:Math.min(a.y,b.y)-r,maxY:Math.max(a.y,b.y)+r,minZ:Math.min(a.z,b.z)-r,maxZ:Math.max(a.z,b.z)+r};}
function overlaps(p0,p1,p2,c){return Math.max(p0.x,p1.x,p2.x)>=c.minX&&Math.min(p0.x,p1.x,p2.x)<=c.maxX&&Math.max(p0.y,p1.y,p2.y)>=c.minY&&Math.min(p0.y,p1.y,p2.y)<=c.maxY&&Math.max(p0.z,p1.z,p2.z)>=c.minZ&&Math.min(p0.z,p1.z,p2.z)<=c.maxZ;}
function collide(p,capsules,preferred){let moved=0;for(const c of capsules){const {a,ab,r,open,axis}=c;if(p.x<c.minX||p.x>c.maxX||p.y<c.minY||p.y>c.maxY||p.z<c.minZ||p.z>c.maxZ)continue;const raw=((p.x-a.x)*ab.x+(p.y-a.y)*ab.y+(p.z-a.z)*ab.z)*c.invLengthSq;if(open&&raw<0)continue;const t=Math.max(0,Math.min(1,raw)),cx=a.x+ab.x*t,cy=a.y+ab.y*t,cz=a.z+ab.z*t;let dx=p.x-cx,dy=p.y-cy,dz=p.z-cz;const d=Math.hypot(dx,dy,dz);if(d<r){if(d<1e-8){dx=preferred?.x||0;dy=preferred?.y||0;dz=preferred?.z||-1;}else{dx/=d;dy/=d;dz/=d;}if(preferred&&dx*preferred.x+dy*preferred.y+dz*preferred.z<.2){const dot=preferred.dot(axis);dx=preferred.x-axis.x*dot;dy=preferred.y-axis.y*dot;dz=preferred.z-axis.z*dot;const n=Math.hypot(dx,dy,dz);if(n>1e-8){dx/=n;dy/=n;dz/=n;}else{dx=preferred.x;dy=preferred.y;dz=preferred.z;}}moved=Math.max(moved,r-d);p.set(cx+dx*r,cy+dy*r,cz+dz*r);}}return moved;}
function tether(p){if(!p.mass){p.x.copy(p.goal);return;}const dx=p.x.x-p.goal.x,dy=p.x.y-p.goal.y,dz=p.x.z-p.goal.z,d=Math.hypot(dx,dy,dz),limit=p.nativeAnchor?.06:.45+.25*p.mass;if(d>limit){const t=limit/d;p.x.set(p.goal.x+dx*t,p.goal.y+dy*t,p.goal.z+dz*t);}}
function collideFace(ps,capsules,normal){let moved=0;const p0=ps[0].x,p1=ps[1].x,p2=ps[2].x;
 for(const c of capsules){if(!overlaps(p0,p1,p2,c))continue;const {a,b,r,axis,length}=c;if(length<1e-8)continue;let contact=null;
  for(const w of faceSamples){const x=p0.x*w[0]+p1.x*w[1]+p2.x*w[2],y=p0.y*w[0]+p1.y*w[1]+p2.y*w[2],z=p0.z*w[0]+p1.z*w[1]+p2.z*w[2],t=Math.max(0,Math.min(length,(x-a.x)*axis.x+(y-a.y)*axis.y+(z-a.z)*axis.z)),cx=a.x+axis.x*t,cy=a.y+axis.y*t,cz=a.z+axis.z*t;if((x-cx)**2+(y-cy)**2+(z-cz)**2<r*r-1e-10){contact=new Vector3(cx,cy,cz);break;}}
  contact??=capsuleTriangleContact(a,b,r,p0,p1,p2);if(!contact)continue;
  const outward=normal.clone().addScaledVector(axis,-normal.dot(axis));if(outward.lengthSq()<1e-8)continue;outward.normalize();
  for(const p of ps){if(!p.mass)continue;const depth=r-((p.x.x-contact.x)*outward.x+(p.x.y-contact.y)*outward.y+(p.x.z-contact.z)*outward.z);if(depth>0){const d=Math.min(depth,.035);p.x.addScaledVector(outward,d);moved=Math.max(moved,d);}}
 }return moved;
}

// XPBD distance constraints, animated tethers, damping and body collisions.
// Seeks reset velocity; repeated evaluation of a paused frame is deterministic.
export function simulateCloth(model,capsules,{time=0,token=null,inertia=.65,wind=0,pelvis,native=false}={}){
 const colliders=capsules.map(capsuleData);const heading=pelvis?pelvis.getWorldQuaternion(new Quaternion()).multiply(pelvis.userData.rest.worldQuaternion.clone().invert()):model.motionRoot.quaternion;
 for(const mesh of model.meshes||[]){const sim=mesh.userData.clothSurface;if(!sim)continue;const {particles,triangles,constraints,faces}=sim;mesh.updateWorldMatrix(true,false);mesh.skeleton.update();
  for(const p of particles){p.anchorMass??=p.mass;p.mass=p.anchorMass||(native?.04:0);p.nativeAnchor=native&&p.anchorMass===0;p.goal.set(0,0,0);for(const i of p.vertices)p.goal.add(mesh.getVertexPosition(i,new Vector3()).applyMatrix4(mesh.matrixWorld));p.goal.divideScalar(p.vertices.length);p.normal=new Vector3(p.rest.x,0,p.rest.z).normalize().applyQuaternion(heading);p.oldOffset=p.x.clone().sub(p.lastGoal);}
  const elapsed=time-(sim.lastTime??time),advance=sim.lastToken===token&&elapsed>1e-7&&elapsed<=.12,dt=advance?Math.max(1/240,elapsed):1/60;
  for(const p of particles){if(!advance||native)p.x.copy(p.goal);else{const delta=p.goal.clone().sub(p.lastGoal);p.x.addScaledVector(delta,1-p.mass*inertia*.4).addScaledVector(p.velocity,dt*Math.exp(-9*dt));if(p.mass){p.x.y-=.7*dt*dt*p.mass;p.x.x+=wind*dt*dt*p.mass*Math.sin(time*2+p.rest.y*9);}}
   if(!p.mass)p.x.copy(p.goal);p.lastGoal.copy(p.goal);
  }
  // No-contact native poses need no simulation or inverse-skinning rewrite.
  if(native&&!faces.some(({ps})=>ps.some(p=>p.mass)&&colliders.some(c=>{const a=ps[0].goal,b=ps[1].goal,d=ps[2].goal;return overlaps(a,b,d,c)&&capsuleTriangleContact(c.a,c.b,c.r,a,b,d,c.open);}))){sim.lastTime=time;sim.lastToken=token;for(const p of particles)p.velocity.set(0,0,0);continue;}
  for(const c of constraints)c.lambda=0;
  const diff=new Vector3();for(let iteration=0;iteration<(native?0:7);iteration++){
   for(const c of constraints){const a=particles[c.a],b=particles[c.b];diff.copy(a.x).sub(b.x);const length=diff.length(),alpha=c.compliance/(dt*dt),mass=a.mass+b.mass;if(length<1e-8||!mass)continue;const dl=(-(length-c.length)-alpha*c.lambda)/(mass+alpha);c.lambda+=dl;diff.multiplyScalar(dl/length);a.x.addScaledVector(diff,a.mass);b.x.addScaledVector(diff,-b.mass);}
   for(const p of particles){if(!p.mass){p.x.copy(p.goal);continue;}p.x.lerp(p.goal,.04+(1-p.mass)*.12);collide(p.x,colliders,p.normal);}
  }
  // Project triangle interiors too: a leg can pass through a large face even
  // when all three vertices lie outside its capsule.
  for(const face of faces){face.normal.copy(face.ps[0].normal).add(face.ps[1].normal).add(face.ps[2].normal).normalize();}
  for(let pass=0;pass<32;pass++){let correction=0;
   for(const {ps,normal} of faces)correction=Math.max(correction,collideFace(ps,colliders,normal));
   // Collision and fabric constraints must converge together. The former
   // collision-only final passes moved pinned seams and stretched the hem.
   for(const p of particles){if(p.mass)correction=Math.max(correction,collide(p.x,colliders,p.normal));tether(p);}
   for(let sweep=0;sweep<(pass>=26?0:4);sweep++)for(const c of constraints){if(c.compliance>1e-6)continue;const a=particles[c.a],b=particles[c.b];diff.copy(a.x).sub(b.x);const length=diff.length(),mass=a.mass+b.mass,limit=Math.max(c.length*1.35,a.goal.distanceTo(b.goal)*1.15)+.004;if(!mass||length<=limit)continue;correction=Math.max(correction,length-limit);diff.multiplyScalar((length-limit)/length/mass);a.x.addScaledVector(diff,-a.mass);b.x.addScaledVector(diff,b.mass);}
   for(const p of particles)tether(p);
   if(correction<1e-5)break;
  }
  const a=mesh.geometry.attributes,blended=new Matrix4(),boneMatrix=new Matrix4(),world=new Matrix4(),normalMatrix=new Matrix3();
  const normals=a.normal?new Float32Array(a.position.count*3):null;
  if(normals)for(const face of sim.normalFaces){const p=face.map(i=>particles[sim.vertexToParticle.get(i)].x),normal=p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0]));for(const i of face){normals[i*3]+=normal.x;normals[i*3+1]+=normal.y;normals[i*3+2]+=normal.z;}}
  for(const p of particles){if(advance)p.velocity.copy(p.x).sub(p.goal).sub(p.oldOffset).divideScalar(dt).clampLength(0,.35);else p.velocity.set(0,0,0);
   for(const i of p.vertices){blended.elements.fill(0);for(let j=0;j<4;j++){const w=a.skinWeight.getComponent(i,j);if(!w)continue;const id=a.skinIndex.getComponent(i,j);boneMatrix.fromArray(mesh.skeleton.boneMatrices,id*16);for(let k=0;k<16;k++)blended.elements[k]+=boneMatrix.elements[k]*w;}world.copy(mesh.matrixWorld).multiply(mesh.bindMatrixInverse).multiply(blended).multiply(mesh.bindMatrix);if(Math.abs(world.determinant())<1e-10)continue;normalMatrix.setFromMatrix4(world).transpose();world.invert();const local=p.x.clone().applyMatrix4(world);a.position.setXYZ(i,local.x,local.y,local.z);if(normals){const normal=new Vector3().fromArray(normals,i*3);if(normal.lengthSq()>1e-12){normal.applyMatrix3(normalMatrix).normalize();a.normal.setXYZ(i,normal.x,normal.y,normal.z);}}}
  }
  a.position.needsUpdate=true;if(a.normal)a.normal.needsUpdate=true;sim.lastTime=time;sim.lastToken=token;
 }
}
