import {NextResponse} from "next/server";
import {getSession} from "../../../lib/auth";
import {InputError} from "../../../lib/inputs";
import {mlManifest,mlManifestHash} from "../../../lib/ml-manifest";
import {loadMlModels} from "../../../lib/ml-runtime";
import {executeMl,type MlResult} from "../../../lib/ml-execution";
import {getEvidence,validRunId,verifyEvidence} from "../../../lib/audit";
import {csvCell} from "../../../lib/evidence";

export const runtime="nodejs";
export const maxDuration=60;
const headers={"Cache-Control":"no-store"};
export async function GET(request:Request){
  const session=await getSession(request);
  if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});
  if(session.role!=="admin")return NextResponse.json({error:"Admin access required"},{status:403,headers});
  const url=new URL(request.url);
  try{
    if(url.searchParams.get("format")==="csv"){
      const id=url.searchParams.get("runId")??"";
      if(!validRunId(id))return NextResponse.json({error:"A valid ML run ID is required"},{status:400,headers});
      const record=await getEvidence(id);
      if(!record||record.kind!=="ml_prediction")return NextResponse.json({error:"ML prediction record not found"},{status:404,headers});
      if(!verifyEvidence(record))return NextResponse.json({error:"Record integrity verification failed"},{status:409,headers});
      const result=record.response as MlResult;
      const columns=["run_id","executed_at","model","model_version","artifact_sha256","original_joblib_sha256","gas_flow_m3_h","methane_pct","generator_kw","biogas_m3_day","methane_m3_day","electricity_kwh_day","trained_feature_count","used_inputs_json","context_only_json","physically_plausible","target_basis","validation_status","reference_envelope_status","uncertainty_status","warnings_json"];
      const rows=result.predictions.map(p=>[record.id,record.createdAt,p.modelName,p.modelVersion,p.artifactHash,p.sourceArtifactHash,p.raw.gasFlowM3h,p.raw.methanePct,p.raw.generatorKw,p.derived.biogasM3Day,p.derived.methaneM3Day,p.derived.electricityKwhDay,p.featureCount,JSON.stringify(p.usedInputs),JSON.stringify(p.contextOnly),p.physicallyPlausible,p.targetBasis,result.validationStatus,result.domainAssessment?.status??"NOT_ASSESSED",result.domainAssessment?.uncertainty.status??"NOT_CALIBRATED",JSON.stringify([...p.warnings,...(result.domainAssessment?.warnings??[])])]);
      return new Response([columns,...rows].map(row=>row.map(csvCell).join(",")).join("\r\n"),{headers:{...headers,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="aquaivolt-ml-${id}.csv"`}});
    }
    const runtime=await loadMlModels();
    return NextResponse.json({manifest:mlManifest,manifestHash:mlManifestHash,runtime,status:"LOADED"},{headers});
  }catch(error){
    console.error(JSON.stringify({event:"ml.load.failed",reason:error instanceof Error?error.message:"Unknown error"}));
    return NextResponse.json({error:"Trained models or stored evidence are unavailable. No scenario-model fallback is used."},{status:503,headers});
  }
}
export async function POST(request:Request){
  const session=await getSession(request);
  if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});
  if(session.role!=="admin")return NextResponse.json({error:"Admin access required"},{status:403,headers});
  let body:unknown;
  try{const text=await request.text();if(text.length>16000)return NextResponse.json({error:"Request too large"},{status:413,headers});body=JSON.parse(text);}
  catch{return NextResponse.json({error:"Valid JSON is required"},{status:400,headers});}
  try{return NextResponse.json(await executeMl(body,session),{headers});}
  catch(error){
    if(error instanceof InputError)return NextResponse.json({error:error.message,issues:error.issues},{status:422,headers});
    console.error(JSON.stringify({event:"ml.inference.failed",reason:error instanceof Error?error.message:"Unknown error"}));
    return NextResponse.json({error:"Trained-model inference failed. No reference-engine outputs have been substituted."},{status:503,headers});
  }
}
