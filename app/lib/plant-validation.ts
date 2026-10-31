import {getEvidence,storeEvidence,validRunId,verifyEvidence,type SignedRecord} from "./audit";
import type {AquaSession} from "./auth";
import {fingerprint} from "./evidence";
import {InputError} from "./inputs";
import type {MlResult} from "./ml-execution";

export const measuredOutputs=[
  {key:"gasFlowM3h",label:"Gas flow",unit:"m3/h",min:0},
  {key:"methanePct",label:"Methane content",unit:"%",min:0,max:100},
  {key:"generatorKw",label:"Generator power",unit:"kW",min:0},
] as const;
type Measurements=Record<(typeof measuredOutputs)[number]["key"],number>;
export const validationProtocol={
  version:"plant-holdout-1",status:"INDEPENDENT_PLANT_VALIDATION_PENDING",
  prerequisites:["Equipment commissioned and instruments calibrated","Timestamped operating inputs and measured outputs aligned to the same sampling period","Evaluation samples excluded from model fitting and tuning","Frozen model artifacts and an evaluation protocol agreed before testing"],
  scope:"Operator-reported measurements and descriptive errors only. Independent provenance, holdout separation and acceptance criteria require auditor review.",
  optimizationBenefit:"Not established by prediction errors. Requires measured before-and-after periods with comparable operating conditions and a reviewed study design.",
};
function invalid(field:string,message:string):never{throw new InputError([{field,message}]);}
function object(value:unknown,field:string):Record<string,unknown>{
  if(!value||typeof value!=="object"||Array.isArray(value))invalid(field,"An object is required");
  return value as Record<string,unknown>;
}
function only(body:Record<string,unknown>,allowed:string[]){
  for(const key of Object.keys(body))if(!allowed.includes(key))invalid(key,"Unknown field");
}
function text(body:Record<string,unknown>,key:string,max=200){
  const value=body[key];
  if(typeof value!=="string"||!value.trim()||value.length>max)invalid(key,`Non-empty text up to ${max} characters is required`);
  return value.trim();
}
async function verifiedRecord(id:string,kind:SignedRecord["kind"]){
  if(!validRunId(id))invalid("recordId","A valid record ID is required");
  const record=await getEvidence(id);
  if(!record||record.kind!==kind)invalid("recordId",`A stored ${kind} record is required`);
  if(!verifyEvidence(record))invalid("recordId","Stored record failed integrity verification");
  return record;
}
async function persist(kind:"plant_observation"|"plant_evaluation",request:unknown,response:Record<string,unknown>,inputs:unknown,session:AquaSession,modelVersion:string,manifestHash:string){
  const id=crypto.randomUUID(),createdAt=new Date().toISOString();
  const result={...response,id,createdAt,status:"REVIEW_REQUIRED",protocol:validationProtocol};
  await storeEvidence({id,createdAt,username:session.username,role:session.role,kind,request,inputs,response:result,modelVersion,manifestHash,requestHash:fingerprint(request),inputsHash:fingerprint(inputs),responseHash:fingerprint(result),outputHash:fingerprint(response)});
  console.info(JSON.stringify({event:`${kind}.recorded`,id,modelVersion,manifestHash,status:"REVIEW_REQUIRED"}));
  return {...result,saved:true};
}
type Observation={
  plantId:string;datasetId:string;sampleId:string;measuredAt:string;sourceReference:string;
  runId:string;runRecordHash:string;modelManifestHash:string;
  measured:Measurements;predictions:MlResult["predictions"];declarations:Record<string,true>;
};
export async function recordObservation(value:unknown,session:AquaSession){
  const body=object(value,"request");
  only(body,["action","runId","plantId","datasetId","sampleId","measuredAt","sourceReference","measured","declarations"]);
  const run=await verifiedRecord(text(body,"runId"),"ml_prediction");
  const measuredAt=text(body,"measuredAt",40);
  if(!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(measuredAt)||!Number.isFinite(Date.parse(measuredAt))||Date.parse(measuredAt)>Date.now())invalid("measuredAt","A past or present ISO timestamp including timezone is required");
  const raw=object(body.measured,"measured");only(raw,measuredOutputs.map(f=>f.key));
  for(const f of measuredOutputs){
    const v=raw[f.key];
    if(typeof v!=="number"||!Number.isFinite(v)||v<f.min||("max" in f&&v>f.max))invalid(f.key,`A finite measured value >= ${f.min}${"max" in f?` and <= ${f.max}`:""} ${f.unit} is required`);
    if(v>1e12)invalid(f.key,"Value exceeds the numerical processing limit; this is not a plant operating limit");
  }
  const declarations=object(body.declarations,"declarations");
  const required=["measuredPlantData","equipmentCommissioned","excludedFromTrainingAndTuning","alignedToRunInputs"];
  only(declarations,required);
  for(const key of required)if(declarations[key]!==true)invalid(key,"An explicit operator declaration is required; this is not independently verified");
  const original=run.response as MlResult;
  const observation:Observation={plantId:text(body,"plantId"),datasetId:text(body,"datasetId"),sampleId:text(body,"sampleId"),measuredAt:new Date(measuredAt).toISOString(),sourceReference:text(body,"sourceReference",1000),runId:run.id,runRecordHash:run.recordHash,modelManifestHash:run.manifestHash,measured:raw as Measurements,predictions:original.predictions,declarations:declarations as Record<string,true>};
  return persist("plant_observation",body,observation,run.inputs,session,run.modelVersion,run.manifestHash);
}
export function errorMetrics(actual:number[],predicted:number[]){
  if(actual.length!==predicted.length||!actual.length||![...actual,...predicted].every(Number.isFinite))throw new Error("Invalid metric arrays");
  const n=actual.length,mean=actual.reduce((a,b)=>a+b,0)/n;
  const errors=actual.map((value,i)=>predicted[i]-value);
  const sse=errors.reduce((a,e)=>a+e*e,0),sst=actual.reduce((a,value)=>a+(value-mean)**2,0);
  return {n,mae:errors.reduce((a,e)=>a+Math.abs(e),0)/n,rmse:Math.sqrt(sse/n),bias:errors.reduce((a,e)=>a+e,0)/n,r2:n<2||sst===0?null:1-sse/sst,r2UnavailableReason:n<2?"At least two observations required":sst===0?"Measured outputs are constant":null};
}
export async function evaluateObservations(value:unknown,session:AquaSession){
  const body=object(value,"request");only(body,["action","observationIds"]);
  const ids=body.observationIds;
  if(!Array.isArray(ids)||!ids.length||ids.length>200||!ids.every(id=>typeof id==="string"&&validRunId(id))||new Set(ids).size!==ids.length)invalid("observationIds","Supply 1-200 distinct observation record IDs");
  const records:SignedRecord[]=[];
  for(let i=0;i<ids.length;i+=8)records.push(...await Promise.all(ids.slice(i,i+8).map(id=>verifiedRecord(id,"plant_observation"))));
  const observations=records.map(r=>r.response as Observation);
  for(let i=0;i<observations.length;i+=8)await Promise.all(observations.slice(i,i+8).map(async observation=>{
    const source=await verifiedRecord(observation.runId,"ml_prediction");
    if(source.recordHash!==observation.runRecordHash||source.manifestHash!==observation.modelManifestHash||fingerprint((source.response as MlResult).predictions)!==fingerprint(observation.predictions))invalid("observationIds","Linked prediction evidence no longer matches the saved observation");
  }));
  const first=observations[0];
  if(observations.some(o=>o.plantId!==first.plantId||o.datasetId!==first.datasetId||o.modelManifestHash!==first.modelManifestHash))invalid("observationIds","A report must use one plant, dataset and frozen model build");
  if(new Set(observations.map(o=>o.sampleId)).size!==observations.length||new Set(observations.map(o=>o.runId)).size!==observations.length)invalid("observationIds","Duplicate sample IDs or prediction runs would double-count observations");
  const models=first.predictions.map(model=>({modelId:model.modelId,modelName:model.modelName,artifactHash:model.artifactHash,targetBasis:model.targetBasis,metrics:measuredOutputs.map(field=>{
    const predicted=observations.map(o=>{
      const prediction=o.predictions.find(p=>p.modelId===model.modelId);
      if(!prediction||prediction.artifactHash!==model.artifactHash)invalid("observationIds","Mixed or missing model artifacts");
      return prediction.raw[field.key];
    });
    return {...field,...errorMetrics(observations.map(o=>o.measured[field.key]),predicted)};
  })}));
  const report={plantId:first.plantId,datasetId:first.datasetId,sampleCount:observations.length,observationIds:ids,observationHashes:records.map(r=>({id:r.id,recordHash:r.recordHash})),measurementPeriod:{from:observations.map(o=>o.measuredAt).sort()[0],to:observations.map(o=>o.measuredAt).sort().at(-1)},models,selection:"Operator-selected records; completeness and independence require external review",acceptanceDecision:"NOT ASSESSED - no independent acceptance criteria or approval",optimizationBenefit:"NOT ESTABLISHED",uncertainty:"NOT CALIBRATED"};
  return persist("plant_evaluation",body,report,{observationIds:ids},session,records[0].modelVersion,records[0].manifestHash);
}
