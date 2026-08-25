import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";
import { listKpiObservations, recordKpiObservation, type StoredKpiObservation } from "../../../lib/audit";

export const maxDuration = 30;

type Period = "hour"|"day"|"month";

function periodKey(value:number, period:Period) {
  const date=new Date(value);
  if(period==="hour") return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}-${String(date.getUTCDate()).padStart(2,"0")} ${String(date.getUTCHours()).padStart(2,"0")}:00 UTC`;
  if(period==="day") return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}-${String(date.getUTCDate()).padStart(2,"0")}`;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}`;
}

function round(value:number) { return Math.round(value*1000)/1000; }

function aggregate(rows:StoredKpiObservation[], period:Period) {
  const groups=new Map<string,{period:string; observations:number; biogasM3Day:number; methaneM3Day:number; electricityKwhDay:number; methanePctTotal:number; co2PctTotal:number; h2sPpmTotal:number; modelled:number; imported:number}>();
  rows.forEach((row)=>{
    const key=periodKey(row.observed_at,period);
    const current=groups.get(key)??{period:key,observations:0,biogasM3Day:0,methaneM3Day:0,electricityKwhDay:0,methanePctTotal:0,co2PctTotal:0,h2sPpmTotal:0,modelled:0,imported:0};
    current.observations+=1; current.biogasM3Day+=row.biogas_m3_day; current.methaneM3Day+=row.methane_m3_day; current.electricityKwhDay+=row.electricity_kwh_day;
    current.methanePctTotal+=row.methane_pct; current.co2PctTotal+=row.co2_pct; current.h2sPpmTotal+=row.h2s_ppm;
    if(row.source==="csv_import")current.imported+=1;else current.modelled+=1;
    groups.set(key,current);
  });
  return Array.from(groups.values()).sort((a,b)=>a.period.localeCompare(b.period)).map((item)=>({
    period:item.period, observations:item.observations, biogasM3Day:round(item.biogasM3Day), methaneM3Day:round(item.methaneM3Day), electricityKwhDay:round(item.electricityKwhDay),
    methanePct:round(item.methanePctTotal/item.observations), co2Pct:round(item.co2PctTotal/item.observations), h2sPpm:round(item.h2sPpmTotal/item.observations),
    sources:{modelledPrediction:item.modelled,csvImport:item.imported},
  }));
}

function toNumber(value:unknown) { const parsed=Number(value); return Number.isFinite(parsed)?parsed:NaN; }

export async function GET(request:Request) {
  const session=await getSession(request);
  if(!session||session.role!=="admin")return NextResponse.json({error:"Admin access required"},{status:403});
  const url=new URL(request.url); const period=(url.searchParams.get("period")==="hour"||url.searchParams.get("period")==="month"?url.searchParams.get("period"):"day") as Period;
  const source=url.searchParams.get("source")==="csv_import"?"csv_import":url.searchParams.get("source")==="modelled_prediction"?"modelled_prediction":undefined;
  const {observations,persistence}=await listKpiObservations({limit:10000,source,from:url.searchParams.get("from")||undefined,to:url.searchParams.get("to")||undefined,digesterId:url.searchParams.get("digester")||undefined});
  return NextResponse.json({
    period, source:source??"all", persistence, observations:observations.slice(0,200), aggregates:aggregate(observations,period),
    sourceBoundary:"Modelled prediction records are saved from dashboard calculations. They are not real plant meter readings. CSV-imported observations remain separately labelled for audit.",
  },{headers:{"Cache-Control":"no-store"}});
}

export async function POST(request:Request) {
  const session=await getSession(request);
  if(!session||session.role!=="admin")return NextResponse.json({error:"Admin access required"},{status:403});
  const body=await request.json(); const rows=Array.isArray(body.rows)?body.rows:[];
  if(!rows.length||rows.length>1000)return NextResponse.json({error:"Provide 1 to 1,000 timestamped CSV rows"},{status:400});
  let persistent=true; let accepted=0;
  for(const row of rows) {
    const observedAt=new Date(String(row.observedAt||row.observed_at||""));
    const values={biogas:toNumber(row.biogas??row.biogas_m3_day),methane:toNumber(row.methane??row.methane_m3_day),electricity:toNumber(row.electricity??row.electricity_kwh_day),methanePct:toNumber(row.methanePct??row.methane_pct),co2Pct:toNumber(row.co2Pct??row.co2_pct),h2s:toNumber(row.h2s??row.h2s_ppm)};
    if(Number.isNaN(observedAt.getTime())||Object.values(values).some(Number.isNaN))return NextResponse.json({error:"Each row needs observedAt, biogas, methane, electricity, methanePct, co2Pct and h2s values"},{status:400});
    const saved=await recordKpiObservation({id:crypto.randomUUID(),observedAt:observedAt.toISOString(),source:"csv_import",digesterId:String(row.digesterId||row.digester_id||"manual-digester"),...values,metadata:{import:"admin CSV/API"},createdBy:session.username});
    accepted+=1; persistent=persistent&&saved;
  }
  return NextResponse.json({accepted,persistence:persistent?"supabase":"volatile",source:"csv_import"},{status:201});
}
