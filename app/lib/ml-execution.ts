import {storeEvidence,storageProvider} from "./audit";
import type {AquaSession} from "./auth";
import {fingerprint} from "./evidence";
import {resolveMlRequest,mlModelIds} from "./ml-contract";
import {mlManifest,mlManifestHash} from "./ml-manifest";
import {loadMlModels,predictTrainedModel} from "./ml-runtime";

export async function calculateMl(body:unknown){
  const started=performance.now();
  const trace:{label:string;detail:string;at:string;elapsedMs:number}[]=[];
  const mark=(label:string,detail:string)=>trace.push({label,detail,at:new Date().toISOString(),elapsedMs:Number((performance.now()-started).toFixed(3))});
  const {operatingConditions}=resolveMlRequest(body);
  mark("Validate request","Nine explicit operating values validated; no default profile substituted");
  const runtime=await loadMlModels();
  mark("Load trained artifacts","Both exported fitted pipelines passed SHA-256 checks and loaded into ONNX Runtime CPU");
  const predictions=[];
  for(const id of mlModelIds){
    const prediction=await predictTrainedModel(id,operatingConditions);
    predictions.push(prediction);
    mark(`Execute ${prediction.modelName}`,`${prediction.featureCount} trained features passed through the fitted encoder, scaler and regressor; three model outputs returned`);
  }
  mark("Derive daily outputs","Biogas = gas flow x 24; methane = biogas x CH4/100; electricity = generator kW x 24. No scenario-engine values substituted.");
  return {effectiveInputs:operatingConditions,predictions,runtime,trace,outputHash:fingerprint(predictions)};
}
export async function executeMl(body:unknown,session:AquaSession){
  const runId=crypto.randomUUID(),createdAt=new Date().toISOString();
  const calculated=await calculateMl(body);
  const result={runId,createdAt,...calculated,mode:"TRAINED_ML_INFERENCE",modelVersion:mlManifest.version,manifestHash:mlManifestHash,
    requestHash:fingerprint(body),inputsHash:fingerprint(calculated.effectiveInputs),
    deployment:process.env.VERCEL_DEPLOYMENT_ID??process.env.VERCEL_URL??"local-development",
    comparisonMeaning:mlManifest.comparisonMeaning,validationStatus:"NOT INDEPENDENTLY PLANT VALIDATED"};
  try{
    const record=await storeEvidence({id:runId,createdAt,username:session.username,role:session.role,kind:"ml_prediction",
      request:body,inputs:result.effectiveInputs,response:result,modelVersion:result.modelVersion,manifestHash:mlManifestHash,
      requestHash:result.requestHash,inputsHash:result.inputsHash,responseHash:fingerprint(result),outputHash:result.outputHash});
    console.info(JSON.stringify({event:"ml.prediction.completed",runId,manifestHash:mlManifestHash,models:result.predictions.map(p=>({id:p.modelId,artifactHash:p.artifactHash})),inputHash:result.inputsHash,outputHash:result.outputHash,audit:"RECORDED"}));
    return {...result,audit:{saved:true,status:"RECORDED",provider:storageProvider(),recordHash:record.recordHash}};
  }catch{
    console.error(JSON.stringify({event:"ml.audit.write.failed",runId,manifestHash:mlManifestHash}));
    return {...result,audit:{saved:false,status:"NOT RECORDED",provider:storageProvider(),error:"Prediction executed, but persistent evidence could not be confirmed."}};
  }
}
export type MlResult=Awaited<ReturnType<typeof executeMl>>;
