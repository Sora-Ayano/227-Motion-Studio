import {FilesetResolver,PoseLandmarker,FaceLandmarker,HandLandmarker} from '/vision/vision_bundle.mjs';
import {associateDetections} from './pose-tracking.mjs';
let pose,face,hands,lastTimestamp=-1;
self.onmessage=async({data})=>{try{
 if(data.type==='init'){
  const fileset=await FilesetResolver.forVisionTasks('/vision/wasm',true),options=data.options||{},mode=options.mode||'combined',model=options.model==='full'?'full':'heavy',people=Math.max(1,Math.min(5,options.people||1)),factory=(await import(fileset.wasmLoaderPath)).default;
  const create=async delegate=>{try{
   if(mode!=='face'){self.ModuleFactory=factory;pose=await PoseLandmarker.createFromOptions(fileset,{baseOptions:{modelAssetPath:'/models/pose_landmarker_'+model+'.task',delegate},runningMode:'VIDEO',numPoses:people,minPoseDetectionConfidence:.6,minPosePresenceConfidence:.6,minTrackingConfidence:.6});}
   if(mode!=='body'){self.ModuleFactory=factory;face=await FaceLandmarker.createFromOptions(fileset,{baseOptions:{modelAssetPath:'/models/face_landmarker.task',delegate},runningMode:'VIDEO',numFaces:people,outputFaceBlendshapes:true,outputFacialTransformationMatrixes:true,minFaceDetectionConfidence:.6,minFacePresenceConfidence:.6,minTrackingConfidence:.6});}
   if(mode!=='face'&&options.hands){self.ModuleFactory=factory;hands=await HandLandmarker.createFromOptions(fileset,{baseOptions:{modelAssetPath:'/models/hand_landmarker.task',delegate},runningMode:'VIDEO',numHands:people*2,minHandDetectionConfidence:.6,minHandPresenceConfidence:.6,minTrackingConfidence:.6});}
  }catch(e){pose?.close();face?.close();hands?.close();pose=face=hands=null;throw e;}};
  let delegate=options.delegate==='CPU'?'CPU':'GPU';try{await create(delegate);}catch(e){if(options.delegate==='GPU'||delegate==='CPU')throw e;delegate='CPU';await create(delegate);}
  self.postMessage({type:'ready',delegate,model,mode,people,hands:!!hands});
 }
 if(data.type==='frame'){
  if(!pose&&!face)throw new Error('检测模型尚未加载');const timestamp=Math.max(lastTimestamp+1,data.timestamp);lastTimestamp=timestamp;
  const body=pose?.detectForVideo(data.bitmap,timestamp),head=face?.detectForVideo(data.bitmap,timestamp),fingers=hands?.detectForVideo(data.bitmap,timestamp);data.bitmap.close();
  const people=body?associateDetections(body,head,fingers):(head?.faceLandmarks||[]).map((facePoints,i)=>({points:[],world:[],facePoints,blendshapes:head.faceBlendshapes?.[i]?.categories||[],hands:[]}));
  self.postMessage({type:'result',id:data.id,people,world:body?.worldLandmarks[0]||[],points:body?.landmarks[0]||[],facePoints:head?.faceLandmarks[0]||[],blendshapes:head?.faceBlendshapes[0]?.categories||[],faceMatrix:head?.facialTransformationMatrixes[0]?.data||null});
 }
}catch(e){data.bitmap?.close();self.postMessage({type:'error',id:data.id,error:e.message||String(e)});}};
