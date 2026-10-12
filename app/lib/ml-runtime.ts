import {readFile} from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import {InferenceSession,Tensor,env} from "onnxruntime-node";
import {mlManifest} from "./ml-manifest";
import {mlModelIds,type MlModelId} from "./ml-contract";
import type {ModelInput} from "./inputs";

const sessions=new Map<MlModelId,Promise<{session:InferenceSession;artifactHash:string}>>();
const hash=(bytes:Uint8Array)=>`sha256:${createHash("sha256").update(bytes).digest("hex")}`;
async function loadModel(id:MlModelId){
  let pending=sessions.get(id);
  if(!pending){
    pending=(async()=>{
      const metadata=mlManifest.models[id];
      const bytes=await readFile(path.join(process.cwd(),"ai-workflow","models","onnx",metadata.filename));
      const artifactHash=hash(bytes);
      if(artifactHash!==metadata.artifactHash)throw new Error(`ML artifact integrity failed: ${id}`);
      const session=await InferenceSession.create(bytes,{executionProviders:["cpu"],intraOpNumThreads:1,interOpNumThreads:1,executionMode:"sequential",graphOptimizationLevel:"basic"});
      return {session,artifactHash};
    })();
    sessions.set(id,pending);
    pending.catch(()=>sessions.delete(id));
  }
  return pending;
}
export async function loadMlModels(){
  for(const id of mlModelIds)await loadModel(id);
  return {provider:"cpu",engine:"ONNX Runtime",version:env.versions.node??"unknown",models:mlModelIds};
}
export async function predictTrainedModel(id:MlModelId,inputs:ModelInput){
  const metadata=mlManifest.models[id];
  const {session,artifactHash}=await loadModel(id);
  const feeds:Record<string,Tensor>={};
  const usedInputs:Partial<ModelInput>={},contextOnly:Partial<ModelInput>={};
  for(const feature of metadata.features){
    const value=inputs[feature.key as keyof ModelInput];
    feeds[feature.tensor]=feature.type==="string"?new Tensor("string",[String(value)],[1,1]):new Tensor("float64",new Float64Array([Number(value)]),[1,1]);
    Object.assign(usedInputs,{[feature.key]:value});
  }
  for(const key of metadata.contextOnly)Object.assign(contextOnly,{[key]:inputs[key as keyof ModelInput]});
  const tensors=await session.run(feeds);
  const output=tensors[metadata.outputName];
  if(!output||output.data.length!==3)throw new Error(`Unexpected ML output shape: ${id}`);
  const [gasFlowM3h,methanePct,generatorKw]=Array.from(output.data,Number);
  if(![gasFlowM3h,methanePct,generatorKw].every(Number.isFinite))throw new Error(`Non-finite ML prediction: ${id}`);
  const raw={gasFlowM3h,methanePct,generatorKw};
  const derived={biogasM3Day:gasFlowM3h*24,methaneM3Day:gasFlowM3h*24*methanePct/100,electricityKwhDay:generatorKw*24};
  const physicallyPlausible=gasFlowM3h>=0&&methanePct>=0&&methanePct<=100&&generatorKw>=0;
  const knownCategory=metadata.categories.includes(inputs.feedstock);
  return {modelId:id,modelName:metadata.name,modelVersion:metadata.version,artifactHash,sourceArtifactHash:metadata.sourceArtifactHash,
    sourceArtifact:metadata.sourceArtifact,featureCount:metadata.trainedFeatureCount,usedInputs,contextOnly,raw,derived,
    physicallyPlausible,knownCategory,targetBasis:metadata.targetBasis,
    warnings:[...(!physicallyPlausible?["Raw model outputs are outside physical bounds; they are not clipped or suitable for operation."]:[]),
      ...(!knownCategory?["Feedstock was not observed by this fitted encoder; its trained unknown-category behavior was used."]:[]),
      "Model estimates only. These inputs have not been established as in-distribution plant measurements."]};
}
