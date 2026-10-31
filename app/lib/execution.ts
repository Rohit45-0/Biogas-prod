import {runModel} from "./model";
import {resolveRequest} from "./inputs";
import {fingerprint} from "./evidence";
import {manifestHash} from "./manifest";
import {storageProvider,storeEvidence} from "./audit";
import type {AquaSession} from "./auth";
import type {OptimizationStepId,WorkflowEvent} from "./optimization-workflow";

export function outputFingerprint(result:Awaited<ReturnType<typeof runModel>>) {
  return fingerprint({baseline:result.baseline,optimized:result.optimized,setpoints:result.bestSetpoints,hrt:result.retentionTime,scenarios:result.scenarioPreview});
}
export async function executeRequest(body:unknown,session:AquaSession,onProgress?:(event:WorkflowEvent)=>void) {
  const started=performance.now();
  const report=(step:OptimizationStepId,status:WorkflowEvent["status"],detail:string,stamp?:{at:string;elapsedMs:number})=>onProgress?.({type:"progress",step,status,detail,at:stamp?.at??new Date().toISOString(),elapsedMs:stamp?.elapsedMs??Number((performance.now()-started).toFixed(3))});
  report("conditions","running","Reading submitted operating conditions");
  const resolved=resolveRequest(body);
  report("conditions","complete",`${resolved.inputs.feedstock} / ${resolved.inputSource}`);
  report("validation","running","Checking the operating input contract");
  report("validation","complete","Nine effective operating values validated against the request contract");
  report("candidates","running","Scenario engine executing the bounded candidate search");
  const modelOffset=performance.now()-started;
  const result=await runModel({...resolved.inputs,previousRun:resolved.request.previousRun??undefined},{seed:resolved.request.seed});
  // The fast model returns its own recorded stage timestamps in one batch.
  // Publish those confirmed events without changing inference or adding delays.
  const traceSteps=[
    {label:"Search setpoints",step:"candidates",next:"production",detail:"Calculating baseline and selected-candidate outputs"},
    {label:"Calculate comparison",step:"production",next:"diagnostics",detail:"Calculating process KPIs and recommendations"},
    {label:"Calculate diagnostics",step:"diagnostics",next:"evidence",detail:"Assembling the run evidence and fingerprints"},
  ] as const;
  for(const item of traceSteps){
    const stage=result.modelTrace.stages.find(s=>s.label===item.label);
    if(stage){const stamp={at:stage.at,elapsedMs:Number((modelOffset+stage.elapsedMs).toFixed(3))};report(item.step,"complete",stage.detail,stamp);report(item.next,"running",item.detail,stamp);}
  }
  const response={...result,inputSource:resolved.inputSource,profileId:resolved.profileId,manifestHash,
    seed:result.modelTrace.optimization.seed,requestHash:fingerprint(body),inputsHash:fingerprint(result.effectiveInputs),outputHash:outputFingerprint(result),
    deployment:process.env.VERCEL_DEPLOYMENT_ID??process.env.VERCEL_URL??"local-development"};
  report("evidence","complete",`Run ${result.runId}; model ${result.modelVersion}; request and output SHA-256 fingerprints calculated`);
  report("storage","running","Writing server-authenticated audit evidence and confirming a storage readback");
  const finish=<T,>(value:T)=>{report("results","running","Preparing the final response");report("results","complete","Production estimates, selected settings and recommendations ready");return value;};
  try{
    const record=await storeEvidence({id:result.runId,createdAt:result.createdAt,username:session.username,role:session.role,kind:"optimization",
      request:body,inputs:result.effectiveInputs,response,modelVersion:result.modelVersion,manifestHash,
      requestHash:response.requestHash,inputsHash:response.inputsHash,responseHash:fingerprint(response),outputHash:response.outputHash});
    console.info(JSON.stringify({event:"optimization.completed",runId:result.runId,modelVersion:result.modelVersion,manifestHash,inputHash:record.inputsHash,outputHash:record.outputHash,audit:"RECORDED"}));
    report("storage","complete",`RECORDED / ${storageProvider()} / server HMAC verified after readback`);
    return finish({...response,audit:{runId:result.runId,createdAt:result.createdAt,saved:true,status:"RECORDED",provider:storageProvider(),recordHash:record.recordHash,retrievalUrl:`/api/audit?runId=${result.runId}`}});
  }catch{
    console.error(JSON.stringify({event:"audit.write.failed",runId:result.runId,modelVersion:result.modelVersion}));
    report("storage","warning","NOT RECORDED: the storage write or verified readback failed. Predictions remain available, but saved audit evidence is not confirmed.");
    return finish({...response,audit:{runId:result.runId,createdAt:result.createdAt,saved:false,status:"NOT RECORDED",provider:storageProvider(),error:"Storage write or independent readback failed. Retain this response and retry."}});
  }
}
