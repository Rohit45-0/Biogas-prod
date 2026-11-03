"use client";

import {useEffect,useRef,useState} from "react";
import {ArrowUpRight,CheckCircle2,Download,FileText,History,Play,ShieldCheck,TriangleAlert} from "lucide-react";
import type {ResearchResult} from "../lib/hrt-research-execution";
import "./research-reports.css";

type Props={result:ResearchResult|null;history:ResearchResult[];busy:boolean;canRun?:boolean;onRun:()=>void;onAudit:(id:string)=>void};
type Verification={runId:string;status:string;saved:boolean;reportId:string;meaning:string;checks:{name:string;passed:boolean}[]};
type Period={label:string;days:number};
const months:Period[]=[{label:"January",days:31},{label:"February",days:28},{label:"March",days:31},{label:"April",days:30},{label:"May",days:31},{label:"June",days:30},{label:"July",days:31},{label:"August",days:31},{label:"September",days:30},{label:"October",days:31},{label:"November",days:30},{label:"December",days:31}];
const number=(value:number|null|undefined,digits=1)=>value===null||value===undefined?"—":value.toLocaleString(undefined,{maximumFractionDigits:digits});
const signed=(value:number)=>`${value>0?"+":""}${number(value,2)}`;

function csvCell(value:unknown){
  let text=String(value??"");
  if(/^[=+@\t\r]/.test(text))text=`'${text}`;
  return `"${text.replaceAll('"','""')}"`;
}

export function researchProjectionCsv(run:ResearchResult,kind:"daily"|"monthly"){
  const periods:Period[]=kind==="monthly"?months:Array.from({length:365},(_,i)=>({label:`Day ${i+1}`,days:1}));
  const columns=["modelled_period","days","comparison_biogas_m3","selected_biogas_m3","comparison_methane_m3","selected_methane_m3","comparison_electricity_kwh","selected_electricity_kwh","comparison_hrt_hours","selected_hrt_hours","selected_h2s_before_ppm","selected_h2s_after_ppm","run_id","model_version","model_artifact_sha256","saved_output_hash","audit_saved","projection_basis","export_authentication"];
  const rows=periods.map(period=>[
    period.label,period.days,run.comparison?run.comparison.biogasM3Day*period.days:null,run.selected.biogasM3Day*period.days,
    run.comparison?run.comparison.methaneM3Day*period.days:null,run.selected.methaneM3Day*period.days,
    run.comparison?run.comparison.electricityKwhDay*period.days:null,run.selected.electricityKwhDay*period.days,
    run.retentionTime.beforeHours,run.selected.hrtHours,run.selected.h2sBeforePpm,run.selected.h2sAfterPpm,
    run.runId,run.modelVersion,run.artifactHash,run.outputHash,run.audit.saved,
    "constant_output_projection_365_day_year_not_measured_history",
    "client_calculated_projection_not_a_server_authenticated_export",
  ]);
  return [columns,...rows].map(row=>row.map(csvCell).join(",")).join("\r\n");
}

function downloadProjection(run:ResearchResult,kind:"daily"|"monthly"){
  const file=new Blob(["\ufeff",researchProjectionCsv(run,kind)],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(file),link=document.createElement("a");
  link.href=url;link.download=`aquaivolt-${run.runId}-${kind==="daily"?"daily":"12-month"}-projection.csv`;
  document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export default function ResearchReports({result,history,busy,canRun=true,onRun,onAudit}:Props){
  const [selectedId,setSelectedId]=useState("");
  const [verification,setVerification]=useState<Verification|null>(null),[verifying,setVerifying]=useState(false);
  const [error,setError]=useState<{runId:string;message:string}|null>(null);
  const activeVerification=useRef(false),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{setSelectedId("");setError(null);},[result?.runId]);
  const available=[...new Map([...(result?[result]:[]),...history].map(item=>[item.runId,item])).values()].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
  const saved=available.filter(item=>item.audit.saved);
  const run=available.find(item=>item.runId===selectedId)??result??available[0]??null;
  const shownVerification=verification?.runId===run?.runId?verification:null;
  const shownError=error?.runId===run?.runId?error.message:"";

  async function verify(){
    if(!run?.audit.saved||activeVerification.current)return;
    const runId=run.runId;activeVerification.current=true;setVerifying(true);setError(null);
    try{
      const response=await fetch("/api/research/hrt/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({runId})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"The saved report could not be verified.");
      if(mounted.current)setVerification(data);
    }catch(cause){if(mounted.current)setError({runId,message:cause instanceof Error?cause.message:"The saved report could not be verified."});}
    finally{activeVerification.current=false;if(mounted.current)setVerifying(false);}
  }

  return <section className="rr-workspace" aria-label="AI and KPI reports">
    <header className="rr-heading"><div><p className="rr-eyebrow">AI + KPI REPORT</p><h2>Saved optimization results</h2><p>Every run keeps its current scenario, AI recommendation and export evidence together.</p></div><button className="rr-primary" onClick={onRun} disabled={busy||!canRun}><Play size={16}/>{busy?"Calculating…":"Generate new report"}</button></header>
    {run?<>
      {selectedId&&selectedId!==result?.runId&&<div className="rr-history-notice" role="status"><History size={17}/><span>Viewing saved run {run.runId.slice(0,8)} from {new Date(run.createdAt).toLocaleString()}.</span><button onClick={()=>{setSelectedId("");setError(null);}}>Return to latest run</button></div>}
      <div className="rr-totals" aria-label="Yearly production projections">
        <article><span>Yearly current methane</span><strong>{number(run.comparison?run.comparison.methaneM3Day*365:null,0)}</strong><small>m³ CH₄/year</small></article>
        <article className="rr-ai-total"><span>Yearly AI selected methane</span><strong>{number(run.selected.methaneM3Day*365,0)}</strong><small>m³ CH₄/year</small></article>
        <article><span>Yearly current electricity</span><strong>{number(run.comparison?run.comparison.electricityKwhDay*365:null,0)}</strong><small>kWh/year</small></article>
        <article className="rr-ai-total"><span>Yearly AI selected electricity</span><strong>{number(run.selected.electricityKwhDay*365,0)}</strong><small>kWh/year</small></article>
      </div>
      <p className="rr-projection-note">Constant-output projections, not measured history. Totals assume 365 operating days at the saved daily estimates, with no downtime or seasonal adjustment.</p>
      <div className="rr-recommendation"><div><span className="rr-eyebrow">AI SELECTED RECOMMENDATION</span><h3>HRT {number(run.retentionTime.beforeHours,2)} → {number(run.selected.hrtHours,2)} hours</h3><p>HRT change: {signed(run.retentionTime.changeHours)} hours ({run.retentionTime.direction}). Selected output: <strong>{number(run.selected.biogasM3Day)} m³ biogas/day</strong>, {number(run.selected.methaneM3Day)} m³ CH₄/day and {number(run.selected.electricityKwhDay)} kWh/day.</p><p>Advisory model estimates. Plant performance remains to be validated.</p></div><dl><div><dt>Model evaluations</dt><dd>{number(run.candidateCount,0)}</dd></div><div><dt>Audit status</dt><dd className={run.audit.saved?"rr-success":"rr-warning"}>{run.audit.status}</dd></div></dl></div>
      <section className="rr-table-panel" aria-label="Twelve-month projection">
        <header><div><h3>12-month production projection</h3><p>Illustrative 365-day year using calendar month lengths.</p></div><span>{run.modelVersion}</span></header>
        <div className="rr-table-scroll" tabIndex={0} role="region" aria-label="Monthly scenario comparison table">
          <table><thead><tr><th scope="col">Modelled period</th><th scope="col">Current biogas<br/><small>m³</small></th><th scope="col">AI selected biogas<br/><small>m³</small></th><th scope="col">AI selected methane<br/><small>m³ CH₄</small></th><th scope="col">AI selected electricity<br/><small>kWh</small></th><th scope="col">H₂S concentration decrease<br/><small>ppm, model estimate</small></th></tr></thead>
            <tbody>{months.map(month=><tr key={month.label}><th scope="row">{month.label}<small>{month.days} days</small></th><td>{number(run.comparison?run.comparison.biogasM3Day*month.days:null,0)}</td><td className="rr-selected-value">{number(run.selected.biogasM3Day*month.days,0)}</td><td className="rr-selected-value">{number(run.selected.methaneM3Day*month.days,0)}</td><td className="rr-selected-value">{number(run.selected.electricityKwhDay*month.days,0)}</td><td>{number(run.selected.h2sBeforePpm-run.selected.h2sAfterPpm,1)}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="rr-table-note">H₂S is the modelled before/after concentration difference for the selected scenario; it is not a monthly accumulated amount. {run.comparison?"Current and AI selected columns use the same fitted hours model.":"The comparison HRT is outside model coverage, so current production is unavailable."}</p>
        <div className="rr-export-actions">
          {run.audit.saved&&<a href={`/api/research/hrt?runId=${run.runId}&format=csv`} download><Download size={16}/>Export 2,000 model evaluations</a>}
          <button onClick={()=>downloadProjection(run,"daily")}><Download size={16}/>Export daily projection</button>
          <button onClick={()=>downloadProjection(run,"monthly")}><Download size={16}/>Export 12-month projection</button>
        </div>
        <p className="rr-export-note">Projection CSVs are calculated in your browser from this run. The authenticated record and model-evaluation export remain available separately below.</p>
      </section>
      <section className="rr-evidence" aria-label="Report evidence">
        <header><div><ShieldCheck size={22}/><div><h3>Saved report evidence</h3><p>Server-authenticated audit exports use SHA-256 and server-held HMAC.</p></div></div><span className={run.audit.saved?"rr-success":"rr-warning"}>{run.audit.saved?"RECORD AVAILABLE":"STORAGE NOT CONFIRMED"}</span></header>
        <dl className="rr-identifiers"><div><dt>Run ID</dt><dd>{run.runId}</dd></div><div><dt>Created</dt><dd>{new Date(run.createdAt).toLocaleString()}</dd></div><div><dt>Model</dt><dd>{run.modelVersion}</dd></div></dl>
        <div className="rr-evidence-actions"><button disabled={!run.audit.saved||verifying} onClick={()=>void verify()}><ShieldCheck size={16}/>{verifying?"Verifying…":"Verify saved run"}</button>{run.audit.saved&&<><a href={`/api/audit?runId=${run.runId}&format=json`} download><Download size={16}/>Audit JSON</a><button onClick={()=>onAudit(run.runId)}>Open in Audit Trail <ArrowUpRight size={16}/></button></>}</div>
        <p className="rr-export-note">Server integrity checks are not independent public-key verification or proof of plant accuracy.</p>
        {shownError&&<div className="rr-error" role="alert"><TriangleAlert size={18}/>{shownError}</div>}
        {shownVerification&&<div className={`rr-verification${shownVerification.status==="PASS"?"":" rr-failed"}`} role="status"><h4>{shownVerification.status} · {shownVerification.checks.filter(item=>item.passed).length}/{shownVerification.checks.length} checks</h4><p>{shownVerification.meaning} {shownVerification.saved?"Verification report saved.":"Verification report was not saved."}</p><ul>{shownVerification.checks.map(item=><li key={item.name}>{item.passed?<CheckCircle2 size={16}/>:<TriangleAlert size={16}/>}<span>{item.name}</span></li>)}</ul></div>}
      </section>
    </>:<div className="rr-empty"><FileText size={36}/><h3>No report generated yet</h3><p>Run AI optimization to create a scenario comparison, production projections and retrievable audit evidence.</p><button className="rr-primary" disabled={busy||!canRun} onClick={onRun}><Play size={16}/>{busy?"Calculating…":"Generate first report"}</button></div>}
    <section className="rr-history" aria-label="Saved report history"><header><div><h3>Saved report history</h3><p>Reports from this session. Earlier saved runs remain available in Audit Trail.</p></div><span>{saved.length} {saved.length===1?"recorded run":"recorded runs"}</span></header>{saved.length?<ul>{saved.map(item=><li key={item.runId} className={item.runId===run?.runId?"rr-active-report":""}><button className="rr-history-select" aria-pressed={item.runId===run?.runId} onClick={()=>{setSelectedId(item.runId);setError(null);}}><History size={18}/><span><strong>{new Date(item.createdAt).toLocaleString()}</strong><small>Run {item.runId.slice(0,8)} · {number(item.candidateCount,0)} evaluations · {number(item.retentionTime.beforeHours,2)} → {number(item.selected.hrtHours,2)} h</small></span></button><span className="rr-history-output">{number(item.selected.biogasM3Day)} <small>m³/day AI selected</small></span><a href={`/api/research/hrt?runId=${item.runId}&format=csv`} download aria-label={`Download model evaluations for run ${item.runId.slice(0,8)}`}><Download size={16}/>CSV</a><button onClick={()=>onAudit(item.runId)} aria-label={`Open evidence for run ${item.runId.slice(0,8)}`}>Evidence <ArrowUpRight size={15}/></button></li>)}</ul>:<p className="rr-history-empty">A report appears here after its audit record is confirmed in storage.</p>}</section>
  </section>;
}
