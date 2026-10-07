// Each garment needs its own attachment height, including vertices weighted
// to its root bone. Omitting those vertices creates a false seam mid-skirt.
export function garmentMobility(mesh){
 const a=mesh.geometry.attributes,weights=new Float32Array(a.position.count*2);if(!mesh.isSkinnedMesh||!a.skinIndex)return weights;
 const isCloth=bone=>/skirt|スカート|cloth|cape|mantle/i.test(bone?.name||''),families=mesh.skeleton.bones.map(bone=>{if(!isCloth(bone))return null;while(isCloth(bone.parent))bone=bone.parent;return bone;}),groups=new Map();
 for(let i=0;i<a.position.count;i++){const influences=new Map();for(let k=0;k<4;k++){const family=families[a.skinIndex.getComponent(i,k)],w=a.skinWeight.getComponent(i,k);if(family)influences.set(family,(influences.get(family)||0)+w);}const best=[...influences].sort((a,b)=>b[1]-a[1])[0];if(best?.[1]>.45){if(!groups.has(best[0]))groups.set(best[0],[]);groups.get(best[0]).push(i);}}
 for(const cloth of groups.values()){let low=Infinity,high=-Infinity;for(const i of cloth){const y=a.position.getY(i);low=Math.min(low,y);high=Math.max(high,y);}const span=Math.max(.001,high-low);for(const i of cloth){const depth=(high-a.position.getY(i))/span;weights[i*2]=depth<.035?0:Math.min(1,(depth-.035)/.965);weights[i*2+1]=1;}}return weights;
}
