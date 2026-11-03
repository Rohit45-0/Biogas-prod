import {NextResponse} from "next/server";
import {getSession} from "../../../lib/auth";
import {InputError} from "../../../lib/inputs";
import {researchMetadata,researchRows,type ResearchCalculation} from "../../../lib/hrt-research";
import {executeResearch} from "../../../lib/hrt-research-execution";
import {getEvidence,validRunId,verifyEvidence} from "../../../lib/audit";
import {csvCell,evidenceAuthentication} from "../../../lib/evidence";

export const runtime="nodejs";
export const maxDuration=60;
const headers={"Cache-Control":"no-store"};
export async function GET(request:Request){
  const session=await getSession(request);
  if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});
  const query=new URL(request.url).searchParams,id=query.get("runId");
  if(query.get("view")==="data"&&!id)return NextResponse.json({source:researchMetadata().source,dataHash:researchMetadata().dataHash,rows:researchRows},{headers});
  if(!id)return NextResponse.json(researchMetadata(),{headers});
  if(session.role!=="admin")return NextResponse.json({error:"Admin access required"},{status:403,headers});
  if(!validRunId(id))return NextResponse.json({error:"Invalid run ID"},{status:400,headers});
  try{
    const record=await getEvidence(id);
    if(!record||record.kind!=="hrt_research")return NextResponse.json({error:"Research record not found"},{status:404,headers});
    if(!verifyEvidence(record))return NextResponse.json({error:"Stored evidence integrity failed"},{status:409,headers});
    if(query.get("format")==="csv"){
      const result=record.response as ResearchCalculation;
      const columns=["hrt_hours","biogas_m3_day","methane_pct","methane_m3_day","electricity_kwh_day","temperature_c","ph","feed_rate_kg_vs_day","olr_kg_vs_m3_day","source_stability_index_pct","h2s_before_ppm","h2s_after_ppm","baseline_hrt_hours","hrt_change_hours","run_id","model_version","model_hash","dataset_hash","source_workbook_sha256","scenario_mode","scenario_seed","data_role","authentication_type","independently_verifiable","record_hash","record_hmac"];
      const rows=result.candidates.map(p=>[p.hrtHours,p.biogasM3Day,p.methanePct,p.methaneM3Day,p.electricityKwhDay,p.temperature,p.ph,p.feedRate,p.olr,p.stabilityPct,p.h2sBeforePpm,p.h2sAfterPpm,result.retentionTime.beforeHours,p.hrtHours-result.retentionTime.beforeHours,id,result.modelVersion,result.artifactHash,result.dataHash,result.source.sha256,result.scenario?.mode??"manual",result.scenario?.seed??"","synthetic_research_model_evaluation_not_plant_measurement",evidenceAuthentication.type,false,record.recordHash,record.signature]);
      return new Response([columns,...rows].map(row=>row.map(csvCell).join(",")).join("\r\n"),{headers:{...headers,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="aquaivolt-${id}-hrt-research.csv"`}});
    }
    return NextResponse.json({...record.response as object,audit:{saved:true,status:"RECORDED",recordHash:record.recordHash},integrity:true,authentication:evidenceAuthentication},{headers});
  }catch{return NextResponse.json({error:"Research evidence could not be read"},{status:503,headers});}
}
export async function POST(request:Request){
  const session=await getSession(request);
  if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});
  if(session.role!=="admin")return NextResponse.json({error:"Admin access required to record research runs"},{status:403,headers});
  let body:unknown;
  try{const raw=await request.text();if(raw.length>4000)return NextResponse.json({error:"Request too large"},{status:413,headers});body=JSON.parse(raw);}catch{return NextResponse.json({error:"Valid JSON is required"},{status:400,headers});}
  try{return NextResponse.json(await executeResearch(body,session),{headers});}
  catch(error){if(error instanceof InputError)return NextResponse.json({error:error.message,issues:error.issues},{status:422,headers});console.error("Hours research execution failed",error instanceof Error?error.message:"Unknown error");return NextResponse.json({error:"Research model could not complete this run"},{status:500,headers});}
}
