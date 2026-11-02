import {calculateResearch,researchArtifactHash,researchDataHash,researchManifestHash,researchOutputHash,type ResearchCalculation} from "./hrt-research";
import {getEvidence,storeEvidence,storageProvider,verifyEvidence} from "./audit";
import {fingerprint} from "./evidence";
import type {AquaSession} from "./auth";

export async function executeResearch(body:unknown,session:AquaSession){
  const started=performance.now(),runId=crypto.randomUUID(),createdAt=new Date().toISOString();
  const calculated=calculateResearch(body);
  const response={...calculated,runId,createdAt,outputHash:researchOutputHash(calculated),
    elapsedMs:Number((performance.now()-started).toFixed(3)),
    trace:["Validate explicit units and research bounds","Evaluate the fitted synthetic trajectory","Search 2,000 points against the requested goal","Calculate comparison, recommendations, signed HRT change and energy potential","Fingerprint model, data, request and outputs"],
    deployment:process.env.VERCEL_DEPLOYMENT_ID??process.env.VERCEL_URL??"local-development"};
  try{
    const record=await storeEvidence({id:runId,createdAt,username:session.username,role:session.role,kind:"hrt_research",request:body,inputs:calculated.request,response,
      modelVersion:calculated.modelVersion,manifestHash:researchManifestHash,requestHash:fingerprint(body),inputsHash:fingerprint(calculated.request),responseHash:fingerprint(response),outputHash:response.outputHash});
    return {...response,audit:{saved:true,status:"RECORDED",provider:storageProvider(),recordHash:record.recordHash}};
  }catch{return {...response,audit:{saved:false,status:"NOT RECORDED",provider:storageProvider(),recordHash:null}};}
}
export type ResearchResult=Awaited<ReturnType<typeof executeResearch>>;

export async function verifyResearch(runId:string,session:AquaSession){
  const record=await getEvidence(runId);
  if(!record||record.kind!=="hrt_research")return {http:404,data:{error:"Hours-scale research run not found"}};
  const integrity=verifyEvidence(record);
  if(!integrity)return {http:409,data:{error:"Stored evidence integrity failed"}};
  const saved=record.response as ResearchCalculation&{outputHash:string};
  if(saved.artifactHash!==researchArtifactHash||saved.dataHash!==researchDataHash||saved.manifestHash!==researchManifestHash)return {http:409,data:{error:"This record uses a different research model, dataset or engine build. Preserve and download its original evidence."}};
  const replay=calculateResearch(record.request);
  const checks=[
    {name:"Stored record HMAC and SHA-256",passed:integrity},
    {name:"Current model and source dataset match",passed:saved.artifactHash===researchArtifactHash&&saved.dataHash===researchDataHash},
    {name:"Stored output fingerprint",passed:researchOutputHash(saved)===record.outputHash&&saved.outputHash===record.outputHash},
    {name:"Deterministic backend replay",passed:researchOutputHash(replay)===saved.outputHash},
    {name:"Explicit baseline time conversion",passed:saved.retentionTime.beforeHours===saved.request.baseline.value*(saved.request.baseline.unit==="days"?24:1)},
    {name:"Hours-scale model bounds",passed:saved.selected.hrtHours>=2&&saved.selected.hrtHours<=24},
    {name:"Methane and electricity units",passed:Math.abs(saved.selected.electricityKwhDay-saved.selected.methaneM3Day*9.97*.36)<1e-9},
    {name:"Synthetic research status preserved",passed:saved.mode==="HOURS_RESEARCH"&&saved.validationStatus==="SYNTHETIC AGREEMENT ONLY"},
  ];
  const reportId=crypto.randomUUID(),createdAt=new Date().toISOString();
  const report={runId,reportId,createdAt,status:checks.every(c=>c.passed)?"PASS":"FAIL",checks,meaning:"Software integrity and replay only; not plant validation.",modelVersion:saved.modelVersion};
  try{
    await storeEvidence({id:reportId,createdAt,username:session.username,role:session.role,kind:"hrt_verification",request:{runId},inputs:record.inputs,response:report,
      modelVersion:saved.modelVersion,manifestHash:researchManifestHash,requestHash:fingerprint({runId}),inputsHash:fingerprint(record.inputs),responseHash:fingerprint(report),outputHash:fingerprint(checks)});
    return {http:200,data:{...report,saved:true}};
  }catch{return {http:200,data:{...report,saved:false}};}
}
