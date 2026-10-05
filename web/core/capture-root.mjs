import {Matrix3} from 'three';

// Native capture writes pelvis translations. Move the horizontal component to
// the common animation root so placement handles, attachments and bounds agree.
export function extractCapturedRoot(model,hips){
 if(!hips?.userData.rest||!hips.parent)return;
 const root=model.motionRoot;root.updateWorldMatrix(true,true);
 const parentLinear=new Matrix3().setFromMatrix4(hips.parent.matrixWorld);
 const travel=hips.position.clone().sub(hips.userData.rest.position).applyMatrix3(parentLinear);travel.y=0;
 if(travel.lengthSq()<1e-16)return;
 hips.position.sub(travel.clone().applyMatrix3(parentLinear.clone().invert()));
 const placementLinear=new Matrix3().setFromMatrix4(root.parent?.matrixWorld||root.matrixWorld.clone().identity());
 root.position.add(travel.applyMatrix3(placementLinear.invert()));root.updateMatrixWorld(true);
}
