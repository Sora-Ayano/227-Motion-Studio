import {Vector3,Triangle,Ray} from 'three';
const tri=new Triangle(),ray=new Ray(),hit=new Vector3(),edgePoint=new Vector3();
// Closest points of finite segments, including parallel and zero-length cases.
export function closestSegments(a,b,c,d){const u=b.clone().sub(a),v=d.clone().sub(c),w=a.clone().sub(c),uu=u.dot(u),vv=v.dot(v),uv=u.dot(v),uw=u.dot(w),vw=v.dot(w);let s=0,t=0;if(uu<1e-12)t=vv<1e-12?0:Math.max(0,Math.min(1,vw/vv));else if(vv<1e-12)s=Math.max(0,Math.min(1,-uw/uu));else{const den=uu*vv-uv*uv;s=den>1e-12?Math.max(0,Math.min(1,(uv*vw-uw*vv)/den)):0;t=(uv*s+vw)/vv;if(t<0){t=0;s=Math.max(0,Math.min(1,-uw/uu));}else if(t>1){t=1;s=Math.max(0,Math.min(1,(uv-uw)/uu));}}return [a.clone().addScaledVector(u,s),c.clone().addScaledVector(v,t)];}
export function capsuleTriangleContact(a,b,r,p0,p1,p2,openStart=false){
 const axis=b.clone().sub(a),length=axis.length(),center=p0.clone().add(p1).add(p2).multiplyScalar(1/3),bound=Math.max(center.distanceTo(p0),center.distanceTo(p1),center.distanceTo(p2)),t=Math.max(0,Math.min(1,center.clone().sub(a).dot(axis)/Math.max(axis.lengthSq(),1e-12))),near=a.clone().addScaledVector(axis,t);if(near.distanceToSquared(center)>(bound+r)**2)return null;
 if(openStart&&[p0,p1,p2].every(p=>p.clone().sub(a).dot(axis)<0))return null;
 tri.set(p0,p1,p2);if(length>1e-9){ray.set(a,axis.clone().divideScalar(length));if(ray.intersectTriangle(p0,p1,p2,false,hit)&&hit.distanceTo(a)<=length)return hit.clone();}
 for(const endpoint of [a,b]){tri.closestPointToPoint(endpoint,edgePoint);if(openStart&&edgePoint.clone().sub(a).dot(axis)<0)continue;if(edgePoint.distanceToSquared(endpoint)<r*r-1e-10)return endpoint.clone();}
 for(const [c,d] of [[p0,p1],[p1,p2],[p2,p0]]){const [q,e]=closestSegments(a,b,c,d);if(openStart&&e.clone().sub(a).dot(axis)<0)continue;if(q.distanceToSquared(e)<r*r-1e-10)return q;}return null;
}
