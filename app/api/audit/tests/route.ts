import {NextResponse} from "next/server";
import {getSession} from "../../../lib/auth";
import {auditStoreReady,getEvidence,storageProvider,storeEvidence,validRunId,verifyEvidence} from "../../../lib/audit";
import {profiles,resolveRequest,validateInputs} from "../../../lib/inputs";
import {manifest,manifestHash} from "../../../lib/manifest";
import {fingerprint} from "../../../lib/evidence";
import {runModel} from "../../../lib/model";
import {outputFingerprint} from "../../../lib/execution";

export const runtime="nodejs";
export const maxDuration=60;
const headers={"Cache-Control":"no-store"};
export async function GET(request:Request){
  const session=await getSession(request);
  if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});
  if(session.role!=="admin")return NextResponse.json({error:"Admin access required"},{status:403,headers});
  return NextResponse.json({profiles,manifest,manifestHash,storage:{provider:storageProvider(),available:await auditStoreReady()},validation:{status:"NOT PLANT-VALIDATED",detail:"These tests verify software execution and record integrity. They do not establish prediction accuracy or realized plant gains."}},{headers});
}
export async function POST(request:Request){
  const session=await getSession(request);
  if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});
  if(session.role!=="admin")return NextResponse.json({error:"Admin access required"},{status:403,headers});
  let body:{runId?:string};
  try{body=await request.json();}catch{return NextResponse.json({error:"Invalid JSON"},{status:400,headers});}
  if(typeof body?.runId!=="string"||!validRunId(body.runId))return NextResponse.json({error:"A valid run ID is required"},{status:400,headers});
  try{
    const record=await getEvidence(body.runId);
    if(!record||record.kind!=="optimization")return NextResponse.json({error:"Optimization record not found"},{status:404,headers});
    if(!verifyEvidence(record))return NextResponse.json({error:"Record integrity verification failed",status:"FAIL"},{status:409,headers});
    if(record.manifestHash!==manifestHash)return NextResponse.json({error:"This record belongs to a different model build. Original evidence is available, but replay requires its original build.",status:"NOT TESTED"},{status:409,headers});
    const inputs=validateInputs(record.inputs);
    const resolved=resolveRequest(record.request);
    const original=record.response as Awaited<ReturnType<typeof runModel>>&{seed:string};
    const replay=await runModel({...inputs,previousRun:resolved.request.previousRun??undefined},{seed:original.seed});
    const checks:{name:string;status:"PASS"|"FAIL";expected:string;observed:string}[]=[];
    const check=(name:string,ok:boolean,expected:string,observed:string)=>checks.push({name,status:ok?"PASS":"FAIL",expected,observed});
    check("Persisted record integrity",true,"Matching SHA-256 and HMAC-SHA256",record.recordHash);
    check("Request to effective inputs",fingerprint(resolved.inputs)===record.inputsHash,"All nine values match the resolved request",record.inputsHash);
    check("Active model build",record.modelVersion===manifest.model.version,"Version "+manifest.model.version,record.modelVersion+" / "+record.manifestHash);
    const replayHash=outputFingerprint(replay);
    check("Fixed-seed reproducibility",replayHash===record.outputHash,record.outputHash,replayHash);
    const numeric=Object.values(original.baseline).concat(Object.values(original.optimized));
    check("Finite model outputs",numeric.every(n=>typeof n==="number"&&Number.isFinite(n)),"Every baseline and optimized KPI is finite",`${numeric.length} numeric KPI values checked`);
    check("Candidate search",original.modelTrace.optimization.candidateCount===2000&&original.modelTrace.optimization.selectedRank===1,"2,000 evaluated; highest score selected",`${original.modelTrace.optimization.candidateCount} candidates; selected rank ${original.modelTrace.optimization.selectedRank}`);
    const selected=original.scenarioPreview.find(p=>p.selected);
    const consistent=selected&&Math.abs(selected.aiBiogas-original.optimized.biogas)<.011&&Math.abs(selected.aiMethane-original.optimized.methane)<.011&&Math.abs(selected.aiElectricity-original.optimized.electricity)<.011;
    check("Selected scenario to outputs",Boolean(consistent),"Selected scenario equals displayed output within rounding",selected?`Rank ${selected.rank}`:"No selected scenario");
    check("HRT unit consistency",Math.abs(inputs.hrt*24-original.retentionTime.beforeHours)<.011&&Math.abs(original.bestSetpoints.hrt*24-original.retentionTime.optimizedHours)<.011,"Hours = model days x 24",`${original.retentionTime.beforeHours} to ${original.retentionTime.optimizedHours} hours`);
    const sum=original.optimized.methanePct+original.optimized.co2Pct+original.optimized.h2s/10000;
    check("Gas composition units",Math.abs(sum-100)<.0001,"CH4 + CO2 + H2S(ppm)/10000 = 100%",`${sum.toFixed(4)}%`);
    const reportId=crypto.randomUUID(),createdAt=new Date().toISOString();
    const report={reportId,runId:record.id,createdAt,modelVersion:record.modelVersion,manifestHash,checks,status:checks.every(c=>c.status==="PASS")?"PASS":"FAIL",scope:"Software execution, consistency and persistence only. Independent plant validation remains outstanding."};
    const saved=await storeEvidence({id:reportId,createdAt,username:session.username,role:session.role,kind:"verification",request:body,inputs,response:report,modelVersion:record.modelVersion,manifestHash,requestHash:fingerprint(body),inputsHash:fingerprint(inputs),responseHash:fingerprint(report),outputHash:fingerprint(checks)});
    console.info(JSON.stringify({event:"audit.verification.completed",runId:record.id,reportId,status:report.status,recordHash:saved.recordHash}));
    return NextResponse.json({...report,saved:true,recordHash:saved.recordHash},{headers});
  }catch{return NextResponse.json({error:"Verification or persistence failed. No passing report has been issued.",status:"FAIL"},{status:503,headers});}
}
