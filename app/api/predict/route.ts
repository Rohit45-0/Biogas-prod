import {NextResponse} from "next/server";
import {getSession} from "../../lib/auth";
import {InputError,profiles,resolveRequest} from "../../lib/inputs";
import {baselineFor,searchOptimizationCandidates} from "../../lib/model";
import {executeRequest} from "../../lib/execution";
import {getEvidence,verifyEvidence} from "../../lib/audit";
import {manifestHash} from "../../lib/manifest";
import {csvCell} from "../../lib/evidence";
import type {ModelInput} from "../../lib/inputs";
export const runtime="nodejs";
export const maxDuration=60;

export async function GET(req:Request){
  const session=await getSession(req);if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
  const url=new URL(req.url);
  if(url.searchParams.get("format")==="csv"){
    try{
      const id=url.searchParams.get("runId")??url.searchParams.get("seed")??"";
      const record=await getEvidence(id);
      if(!record||record.kind!=="optimization"||(session.role!=="admin"&&record.username!==session.username))return NextResponse.json({error:"Run not found"},{status:404});
      if(!verifyEvidence(record))return NextResponse.json({error:"Stored evidence integrity failed"},{status:409});
      if(record.manifestHash!==manifestHash)return NextResponse.json({error:"Run uses a different model build. Download the original audit JSON instead."},{status:409});
      const response=record.response as {seed:string;modelName:string;modelVersion:string};
      const rows=searchOptimizationCandidates(record.inputs as ModelInput,response.seed,true).scenarioExport??[];
      const headers=["rank","source_condition","selected","feedstock","feed_rate_kg_vs_d","temperature_c","ph","olr_kg_cod_m3_d","model_hrt_days","hrt_hours","cod_in_mg_l","vfa_mg_l","mixing_rpm","baseline_biogas_m3_d","baseline_methane_m3_d","baseline_electricity_kwh_d","ai_biogas_m3_d","ai_methane_m3_d","ai_methane_pct","ai_electricity_kwh_d","score","run_id","model_name","model_version","manifest_hash","data_role"];
      const values=rows.map(r=>[r.rank,r.sourceCondition,r.selected,r.feedstock,r.feedRate,r.temperature,r.ph,r.olr,r.hrt,r.hrtHours,r.codIn,r.vfa,r.mixing,r.baselineBiogas,r.baselineMethane,r.baselineElectricity,r.aiBiogas,r.aiMethane,r.methanePct,r.aiElectricity,r.score,id,response.modelName,response.modelVersion,record.manifestHash,"evaluated_optimization_candidate_not_training_data"]);
      return new Response([headers,...values].map(row=>row.map(csvCell).join(",")).join("\r\n"),{headers:{"Content-Type":"text/csv","Content-Disposition":`attachment; filename="aquaivolt-${id}-2000-scenarios.csv"`,"Cache-Control":"no-store"}});
    }catch{return NextResponse.json({error:"Audit storage unavailable"},{status:503});}
  }
  return NextResponse.json({baseline:baselineFor(profiles[0].inputs),profile:profiles[0]},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(req:Request){
  const session=await getSession(req);if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
  let body:unknown;
  try{const raw=await req.text();if(raw.length>16000)return NextResponse.json({error:"Request too large"},{status:413});body=JSON.parse(raw);}
  catch{return NextResponse.json({error:"Valid JSON is required"},{status:400});}
  if(body&&typeof body==="object"&&"seed" in body&&session.role!=="admin")return NextResponse.json({error:"Fixed-seed tests require Admin access"},{status:403});
  try{
    if(req.headers.get("accept")?.includes("application/x-ndjson")){
      resolveRequest(body);
      let connected=true;
      const encoder=new TextEncoder();
      const stream=new ReadableStream<Uint8Array>({
        async start(controller){
          const send=(event:unknown)=>{if(connected){try{controller.enqueue(encoder.encode(JSON.stringify(event)+"\n"));}catch{connected=false;}}};
          try{send({type:"result",data:await executeRequest(body,session,send)});}
          catch(error){console.error(JSON.stringify({event:"optimization.stream.failed",reason:error instanceof Error?error.message:"Unknown error"}));send({type:"error",error:"Optimization could not finish. Check run history before retrying."});}
          finally{if(connected)controller.close();}
        },
        cancel(){connected=false;},
      });
      return new Response(stream,{headers:{"Content-Type":"application/x-ndjson; charset=utf-8","Cache-Control":"no-store, no-transform","X-Accel-Buffering":"no","Vary":"Accept"}});
    }
    return NextResponse.json(await executeRequest(body,session),{headers:{"Cache-Control":"no-store","Vary":"Accept"}});
  }
  catch(error){if(error instanceof InputError)return NextResponse.json({error:error.message,issues:error.issues},{status:422});throw error;}
}
