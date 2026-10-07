import {Vector3} from 'three';
const edge=new Vector3(),u=new Vector3(),v=new Vector3(),n1=new Vector3(),n2=new Vector3(),cross=new Vector3();
const q=[new Vector3(),new Vector3(),new Vector3(),new Vector3()];
function normals(a,b,c,d){
 edge.copy(b).sub(a);u.copy(c).sub(a);v.copy(c).sub(b);n1.crossVectors(u,v);
 u.copy(d).sub(b);v.copy(d).sub(a);n2.crossVectors(u,v);
 return edge.lengthSq()>1e-12&&n1.lengthSq()>1e-14&&n2.lengthSq()>1e-14;
}
export function hingeAngle(a,b,c,d){
 if(!normals(a,b,c,d))return 0;
 n1.normalize();n2.normalize();cross.crossVectors(n1,n2);
 return Math.atan2(cross.dot(edge)/edge.length(),n1.dot(n2));
}
// Signed dihedral XPBD avoids the artificial stretching of opposite-vertex springs.
export function solveHinge(particles,hinge,dt,compliance,native=false){
 const ids=[hinge.a,hinge.b,hinge.c,hinge.d],ps=ids.map(i=>particles[i]);
 const target=native?hingeAngle(...ps.map(p=>p.stepGoal)):hinge.restAngle;
 if(!normals(...ps.map(p=>p.x)))return;
 const length=edge.length(),lengthSq=length*length;
 q[2].copy(n1).multiplyScalar(-length/n1.lengthSq());q[3].copy(n2).multiplyScalar(-length/n2.lengthSq());
 q[0].copy(q[2]).multiplyScalar(u.copy(ps[2].x).sub(ps[1].x).dot(edge)/lengthSq).addScaledVector(q[3],u.copy(ps[3].x).sub(ps[1].x).dot(edge)/lengthSq);
 q[1].copy(q[2]).multiplyScalar(-u.copy(ps[2].x).sub(ps[0].x).dot(edge)/lengthSq).addScaledVector(q[3],-u.copy(ps[3].x).sub(ps[0].x).dot(edge)/lengthSq);
 n1.normalize();n2.normalize();cross.crossVectors(n1,n2);
 const angle=Math.atan2(cross.dot(edge)/length,n1.dot(n2));let error=angle-target;
 error=Math.atan2(Math.sin(error),Math.cos(error));
 const alpha=compliance/(dt*dt),denominator=ps.reduce((sum,p,i)=>sum+p.mass*q[i].lengthSq(),alpha);
 if(denominator<1e-10)return;
 const dl=(-error-alpha*hinge.lambda)/denominator;hinge.lambda+=dl;
 for(let i=0;i<4;i++)ps[i].x.addScaledVector(q[i],Math.max(-.015,Math.min(.015,dl*ps[i].mass)));
}
