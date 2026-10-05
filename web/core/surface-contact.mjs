import {Vector3,Triangle} from 'three';
const faceCache=new WeakMap();

// Vertex/triangle narrow phase with a spatial hash. Topological neighbours and
// contacts already present in the authored garment are excluded, so UV seams,
// linings and layered hems do not inflate at rest. All meshes share one grid.
export function solveSurfaceContacts(surfaces,{thickness=.004,passes=2,budget=160000}={}){
 thickness=Math.max(.001,Math.min(.012,thickness));const cell=.05,changed=new Set(),triangle=new Triangle(),closest=new Vector3(),bary=new Vector3(),normal=new Vector3();let checks=0,contacts=0;
 const key=(x,y,z)=>`${x},${y},${z}`,coord=v=>Math.floor(v/cell);
 for(let pass=0;pass<passes;pass++){
  const grid=new Map();
  for(const surface of surfaces)for(const ids of surface.triangles){let face=faceCache.get(ids);if(!face){const ps=ids.map(i=>surface.particles[i]);face={surface,ps,restTriangle:new Triangle(...ps.map(p=>p.collisionRest||p.rest)),excluded:new WeakSet(ps),thickness};faceCache.set(ids,face);}else if(face.thickness!==thickness){face.excluded=new WeakSet(face.ps);face.thickness=thickness;}const ps=face.ps;
   const [a,b,c]=ps.map(p=>p.x),lo=[coord(Math.min(a.x,b.x,c.x)-thickness),coord(Math.min(a.y,b.y,c.y)-thickness),coord(Math.min(a.z,b.z,c.z)-thickness)],hi=[coord(Math.max(a.x,b.x,c.x)+thickness),coord(Math.max(a.y,b.y,c.y)+thickness),coord(Math.max(a.z,b.z,c.z)+thickness)];
   if((hi[0]-lo[0]+1)*(hi[1]-lo[1]+1)*(hi[2]-lo[2]+1)>512)continue;
   for(let x=lo[0];x<=hi[0];x++)for(let y=lo[1];y<=hi[1];y++)for(let z=lo[2];z<=hi[2];z++){const k=key(x,y,z);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(face);}
  }
  for(const surface of surfaces)for(const p of surface.particles){if(!p.mass)continue;
   for(const face of grid.get(key(coord(p.x.x),coord(p.x.y),coord(p.x.z)))||[]){if(face.excluded.has(p))continue;if(++checks>budget)return {changed,checks,contacts,limited:true};
    const [a,b,c]=face.ps;triangle.set(a.x,b.x,c.x);triangle.closestPointToPoint(p.x,closest);const distance=p.x.distanceTo(closest);if(distance>=thickness)continue;
    const restTriangle=face.restTriangle,restPoint=p.collisionRest||p.rest;
    if(restPoint.distanceTo(restTriangle.closestPointToPoint(restPoint,closest))<thickness*1.6){face.excluded.add(p);continue;}
    triangle.closestPointToPoint(p.x,closest);
    triangle.getBarycoord(closest,bary);if(!Number.isFinite(bary.x))continue;
    normal.copy(p.x).sub(closest);if(normal.lengthSq()<1e-12){triangle.getNormal(normal);const reference=restPoint.clone().sub(restTriangle.getMidpoint(new Vector3()));if(normal.dot(reference)<0)normal.negate();}else normal.normalize();
    const weights=bary.toArray(),mass=p.mass+a.mass*weights[0]**2+b.mass*weights[1]**2+c.mass*weights[2]**2;if(mass<1e-9)continue;
    const delta=Math.min(thickness-distance,.006)/mass;p.x.addScaledVector(normal,delta*p.mass);face.ps.forEach((q,i)=>q.x.addScaledVector(normal,-delta*q.mass*weights[i]));changed.add(surface);changed.add(face.surface);contacts++;
   }
  }
 }
 return {changed,checks,contacts,limited:false};
}

// Accessory tips collide with the current cloth surface, including sleeves and
// layered panels; this supplements the body's analytic capsule colliders.
export function projectAccessoryOut(point,surfaces,radius=.009){const tri=new Triangle(),closest=new Vector3(),normal=new Vector3();let moved=false;
 for(const surface of surfaces)for(const ids of surface.triangles){const ps=ids.map(i=>surface.particles[i].x);
  if([0,1,2].some(i=>point.getComponent(i)<Math.min(...ps.map(p=>p.getComponent(i)))-radius||point.getComponent(i)>Math.max(...ps.map(p=>p.getComponent(i)))+radius))continue;
  tri.set(...ps);tri.closestPointToPoint(point,closest);const d=point.distanceTo(closest);if(d>=radius)continue;normal.copy(point).sub(closest);if(normal.lengthSq()<1e-12)tri.getNormal(normal);else normal.normalize();point.addScaledVector(normal,radius-d);moved=true;
 }return moved;
}
