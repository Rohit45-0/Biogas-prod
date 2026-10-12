import {NextResponse} from "next/server";
import {getSession} from "../../../lib/auth";
import {getEvidence,storeEvidence,verifyEvidence,validRunId} from "../../../lib/audit";
import {mlManifest,mlManifestHash} from "../../../lib/ml-manifest";
import {calculateMl,type MlResult} from "../../../lib/ml-execution";
import {fingerprint} from "../../../lib/evidence";
import {resolveMlRequest,mlModelIds} from "../../../lib/ml-contract";

export const runtime="nodejs";
export const maxDuration=60;
const headers={"Cache-Control":"no-store"};
export async function POST(request:Request){
  const session=await getSession(request);
  if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});
  if(session.role!=="admin")return NextResponse.json({error:"Admin access required"},{status:403,headers});
  let body:{runId?:string};
  try{body=await request.json();}catch{return NextResponse.json({error:"Invalid JSON"},{status:400,headers});}
  if(typeof body?.runId!=="string"||!validRunId(body.runId))return NextResponse.json({error:"A valid ML run ID is required"},{status:400,headers});
  try{
    const record=await getEvidence(body.runId);
    if(!record||record.kind!=="ml_prediction")return NextResponse.json({error:"ML prediction record not found"},{status:404,headers});
    if(!verifyEvidence(record))return NextResponse.json({error:"Record integrity verification failed",status:"FAIL"},{status:409,headers});
    if(record.manifestHash!==mlManifestHash)return NextResponse.json({error:"This ML run uses another model build. Its original evidence is available, but replay requires that build.",status:"NOT TESTED"},{status:409,headers});
    const resolved=resolveMlRequest(record.request);
    const original=record.response as MlResult;
    const replay=await calculateMl(record.request);
    const checks:{name:string;status:"PASS"|"FAIL";expected:string;observed:string}[]=[];
    const check=(name:string,ok:boolean,expected:string,observed:string)=>checks.push({name,status:ok?"PASS":"FAIL",expected,observed});
    const tolerance=mlManifest.parityTolerance;
    const near=(a:number,b:number)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tolerance.absolute+tolerance.relative*Math.abs(b);
    check("Persisted record integrity",true,"SHA-256 and server HMAC match",record.recordHash);
    check("Submitted inputs",fingerprint(resolved.operatingConditions)===record.inputsHash&&fingerprint(original.effectiveInputs)===record.inputsHash,"No silently defaulted input values",record.inputsHash);
    check("Active ML build",record.modelVersion===mlManifest.version,"Current trained model manifest",record.manifestHash);
    for(const id of mlModelIds){
      const model=mlManifest.models[id];
      const old=original.predictions.find(p=>p.modelId===id),fresh=replay.predictions.find(p=>p.modelId===id);
      check(`${model.name}: artifact`,Boolean(old&&fresh&&old.artifactHash===model.artifactHash&&fresh.artifactHash===model.artifactHash),model.artifactHash,old?.artifactHash??"Missing");
      const features=Object.fromEntries(model.features.map(f=>[f.key,resolved.operatingConditions[f.key as keyof typeof resolved.operatingConditions]]));
      check(`${model.name}: trained inputs`,Boolean(old&&fingerprint(old.usedInputs)===fingerprint(features)),`${model.trainedFeatureCount} trained features; remaining values are context`,old?Object.keys(old.usedInputs).join(", "):"Missing");
      const differences=old&&fresh?Object.keys(old.raw).map(k=>Math.abs(old.raw[k as keyof typeof old.raw]-fresh.raw[k as keyof typeof fresh.raw])):[];
      const matches=old&&fresh&&Object.keys(old.raw).every(k=>near(old.raw[k as keyof typeof old.raw],fresh.raw[k as keyof typeof fresh.raw]));
      check(`${model.name}: repeat prediction`,Boolean(matches),`Absolute tolerance ${tolerance.absolute} + relative ${tolerance.relative}`,differences.length?`Maximum absolute difference ${Math.max(...differences)}`:"Missing model result");
      const units=old&&near(old.derived.biogasM3Day,old.raw.gasFlowM3h*24)&&near(old.derived.methaneM3Day,old.raw.gasFlowM3h*24*old.raw.methanePct/100)&&near(old.derived.electricityKwhDay,old.raw.generatorKw*24);
      check(`${model.name}: daily units`,Boolean(units),"Daily outputs derived from the actual raw ML predictions",old?JSON.stringify(old.derived):"Missing");
    }
    const reportId=crypto.randomUUID(),createdAt=new Date().toISOString();
    const report={reportId,runId:record.id,createdAt,manifestHash:mlManifestHash,checks,status:checks.every(c=>c.status==="PASS")?"PASS":"FAIL",scope:"Trained-artifact execution, repeatability and evidence integrity. This does not establish plant accuracy or optimization gains."};
    await storeEvidence({id:reportId,createdAt,username:session.username,role:session.role,kind:"ml_verification",request:body,inputs:resolved.operatingConditions,response:report,modelVersion:mlManifest.version,manifestHash:mlManifestHash,requestHash:fingerprint(body),inputsHash:fingerprint(resolved.operatingConditions),responseHash:fingerprint(report),outputHash:fingerprint(checks)});
    console.info(JSON.stringify({event:"ml.verification.completed",runId:record.id,reportId,status:report.status,manifestHash:mlManifestHash}));
    return NextResponse.json({...report,saved:true},{headers});
  }catch(error){
    console.error(JSON.stringify({event:"ml.verification.failed",runId:body.runId,reason:error instanceof Error?error.message:"Unknown error"}));
    return NextResponse.json({error:"ML replay or persistent verification failed. No passing report has been issued.",status:"FAIL"},{status:503,headers});
  }
}
