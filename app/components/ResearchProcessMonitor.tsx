"use client";

import {useState,type CSSProperties} from "react";
import {Activity,ArrowRight,CheckCircle2,ChevronRight,Clock3,Cpu,Database,Droplets,Factory,Flame,FlaskConical,Play,ShieldCheck,SlidersHorizontal,Unplug,Zap} from "lucide-react";
import type {ResearchResult} from "../lib/hrt-research-execution";
import type {ResearchPoint} from "../lib/hrt-research";
import "./research-process-monitor.css";

type Props={result:ResearchResult|null;busy:boolean;canRun?:boolean;onRun:()=>void;onAudit:(id:string)=>void};
const number=(value:number|null|undefined,digits=1)=>value===null||value===undefined?"—":value.toLocaleString(undefined,{maximumFractionDigits:digits});
const stageIcons=[ShieldCheck,SlidersHorizontal,Cpu,Database,Activity,ShieldCheck];
const conditionRows:{key:keyof ResearchPoint;label:string;unit:string;digits:number}[]=[
  {key:"hrtHours",label:"HRT",unit:"hours",digits:2},
  {key:"temperature",label:"Temperature",unit:"°C",digits:1},
  {key:"ph",label:"pH",unit:"",digits:2},
  {key:"olr",label:"Organic loading",unit:"kg VS/m³/day",digits:2},
  {key:"feedRate",label:"Feed rate",unit:"kg VS/day",digits:1},
];

export default function ResearchProcessMonitor({result,busy,canRun=true,onRun,onAudit}:Props){
  const [selectedStage,setSelectedStage]=useState(0);
  const current=result?.comparison,selected=result?.selected;
  const activeStage=result?Math.min(selectedStage,Math.max(0,result.trace.length-1)):0;
  const stability=current?.stabilityPct;
  const ringStyle={"--rpm-index":`${Math.max(0,Math.min(100,stability??0))*3.6}deg`} as CSSProperties;
  const traceDetails=result?[
    "The backend checks the supplied time units, scenario settings and supported model bounds before calculating results.",
    result.scenario?.mode==="automatic"?`This run generated an HRT input of ${number(current?.hrtHours,2)} hours and saved the scenario seed for replay.`:`This run uses the entered comparison HRT of ${number(result.retentionTime.beforeHours,2)} hours.`,
    `The fitted ${result.modelVersion} model calculates production from the HRT input. Process conditions vary together along its synthetic trajectory.`,
    `${number(result.candidateCount,0)} fitted-model evaluations are compared against the selected research objective. These are candidate evaluations, not new training measurements.`,
    `The AI selected HRT is ${number(selected?.hrtHours,2)} hours. The signed HRT change is ${result.retentionTime.changeHours>0?"+":""}${number(result.retentionTime.changeHours,2)} hours (${result.retentionTime.direction}).`,
    "The backend fingerprints the model, source data, resolved inputs and outputs so the saved run can be checked and replayed.",
  ]:[];
  const equipment=[
    {title:"Feed preparation",Icon:Droplets,label:"Modelled feed rate",value:number(current?.feedRate),unit:"kg VS/day",detail:"Feed pump and inlet sensors"},
    {title:"Anaerobic digestion",Icon:Factory,label:"Modelled retention time",value:number(current?.hrtHours,2),unit:"hours",detail:"Digester, mixer and temperature sensors"},
    {title:"Gas conditioning",Icon:Flame,label:"Estimated H₂S after treatment",value:number(current?.h2sAfterPpm),unit:"ppm",detail:"Gas analyser and treatment equipment"},
    {title:"Electricity generation",Icon:Zap,label:"Predicted electricity potential",value:number(current?.electricityKwhDay),unit:"kWh/day",detail:"Generator and electricity meter"},
  ];

  return <div className="rpm-workspace">
    <section className="rpm-execution-hero" aria-label="Model execution overview">
      <div className="rpm-hero-heading"><div><span className="rpm-eyebrow">PROCESS MONITOR</span><h2>AI execution is visible</h2><p>Follow the model calculation and inspect the corresponding process estimates.</p></div><span className="rpm-disconnected"><Unplug size={17}/>PLC / IoT not connected</span></div>
      <div className="rpm-hero-stats">
        <div><Cpu size={21}/><span>Backend state</span><strong>{busy?"Calculating":result?"Calculation complete":"Ready to run"}</strong></div>
        <div><Database size={21}/><span>Evaluated scenarios</span><strong>{result?number(result.candidateCount,0):"—"}</strong></div>
        <div><Clock3 size={21}/><span>Calculation duration</span><strong>{result?`${number(result.elapsedMs,1)} ms`:"—"}</strong></div>
        <div><ShieldCheck size={21}/><span>Audit storage</span><strong>{result?result.audit.status:"No completed run"}</strong></div>
      </div>
      <div className="rpm-hero-actions"><p>{busy?(result?"A new backend calculation is running. Values below belong to the previous completed run.":"The backend is calculating the first scenario. Results will appear when the calculation completes."):result?`Completed ${new Date(result.createdAt).toLocaleString()} · Run ${result.runId.slice(0,8)}`:"Run the model to populate this view with its calculated results."}</p><button className="rpm-run" onClick={onRun} disabled={busy||!canRun}><Play size={17}/>{busy?"Calculating…":"Run AI optimization"}</button></div>
    </section>

    <section className="rpm-panel rpm-process" aria-label="Process equipment overview">
      <header><div><span className="rpm-eyebrow">PROCESS VIEW</span><h2>From feedstock to electricity</h2><p>{busy&&result?"Previous completed scenario estimates":"Current scenario estimates"} · equipment telemetry is unavailable</p></div><span className="rpm-model-label"><FlaskConical size={16}/>Model estimates</span></header>
      <div className="rpm-equipment-flow">{equipment.map(({title,Icon,label,value,unit,detail},index)=><article className="rpm-equipment" key={title}>
        <div className="rpm-equipment-top"><span className="rpm-equipment-icon"><Icon size={28}/></span><span className="rpm-equipment-number">0{index+1}</span></div>
        <h3>{title}</h3><span className="rpm-device-status"><Unplug size={13}/>NOT CONNECTED</span>
        <div className="rpm-equipment-value"><span>{label}</span><strong>{value} <small>{unit}</small></strong></div>
        <p>{detail}</p><footer>Sensor readings unavailable</footer>{index<equipment.length-1&&<ArrowRight className="rpm-flow-arrow" size={20}/>}</article>)}</div>
      <p className="rpm-panel-note">These values come from the fitted synthetic model. No live device measurements or equipment commands are available.</p>
    </section>

    <div className="rpm-analysis-grid">
      <section className="rpm-panel rpm-conditions" aria-label="Current and AI selected process conditions">
        <header><div><h2>Process conditions</h2><p>Current scenario and AI selected recommendation</p></div><SlidersHorizontal size={22}/></header>
        <div className="rpm-table-scroll"><table><thead><tr><th>Parameter</th><th>Current scenario</th><th>AI selected</th></tr></thead><tbody>{conditionRows.map(row=><tr key={row.key}><th scope="row">{row.label}</th><td>{number(current?.[row.key],row.digits)} <span>{row.unit}</span></td><td>{number(selected?.[row.key],row.digits)} <span>{row.unit}</span></td></tr>)}</tbody></table></div>
        <p className="rpm-panel-note">Temperature, pH, feed rate and loading vary together along the workbook trajectory. Their independent control effects are not established.</p>
      </section>
      <section className="rpm-panel rpm-stability" aria-label="Synthetic workbook stability index">
        <header><div><h2>Workbook stability index</h2><p>Current scenario · synthetic model estimate</p></div><Activity size={23}/></header>
        <div className="rpm-stability-content"><div className="rpm-index-ring" style={ringStyle}><div><strong>{number(stability,1)}</strong><span>out of 100</span></div></div><div className="rpm-stability-text"><h3>Modelled process index</h3><p>The source workbook supplies this index. It is not a calibrated safety rating or prediction confidence.</p><dl><div><dt>Current HRT</dt><dd>{number(current?.hrtHours,2)} hours</dd></div><div><dt>AI selected index</dt><dd>{number(selected?.stabilityPct,1)} / 100</dd></div><div><dt>Live sensor status</dt><dd>Unavailable</dd></div></dl></div></div>
      </section>
    </div>

    <section className="rpm-panel rpm-trace" aria-label="Backend execution trace">
      <header><div><span className="rpm-eyebrow">ACTUAL BACKEND TRACE</span><h2>Model execution stages</h2><p>Select a completed stage to inspect what the backend calculated.</p></div><span className="rpm-trace-status">{busy?"Waiting for backend response":result?`${result.trace.length} completed stages`:"No completed run"}</span></header>
      {busy?<div className="rpm-pending" role="status"><Cpu size={32}/><h3>Calculation in progress</h3><p>Completed stages will appear when the backend returns its result. No stage progress is assumed while waiting.</p></div>:result?<>
        <div className="rpm-stage-grid">{result.trace.map((label,index)=>{const Icon=stageIcons[index]??Cpu;return <button type="button" key={`${index}-${label}`} className={`rpm-stage${activeStage===index?" selected":""}`} aria-pressed={activeStage===index} aria-controls="rpm-stage-detail" onClick={()=>setSelectedStage(index)}><span className="rpm-stage-number">0{index+1}<CheckCircle2 size={16}/></span><Icon size={25}/><strong>{label}</strong><span className="rpm-stage-link">Inspect stage <ChevronRight size={14}/></span></button>;})}</div>
        <div className="rpm-stage-detail" id="rpm-stage-detail" aria-live="polite"><span className="rpm-stage-detail-icon"><CheckCircle2 size={24}/></span><div><span>COMPLETED STAGE {activeStage+1}</span><h3>{result.trace[activeStage]}</h3><p>{traceDetails[activeStage]??"This completed stage is recorded in the backend response for the current run."}</p></div></div>
        <div className="rpm-trace-footer"><p><Clock3 size={17}/>Total calculation time: <strong>{number(result.elapsedMs,1)} ms</strong><span>Reported by the backend</span></p><button type="button" onClick={()=>onAudit(result.runId)} disabled={!result.audit.saved}><ShieldCheck size={16}/>{result.audit.saved?"Open saved audit record":"Audit record not saved"}<ArrowRight size={15}/></button></div>
      </>:<div className="rpm-pending"><Cpu size={34}/><h3>No execution trace yet</h3><p>Run AI optimization to inspect the actual calculation, its elapsed time and the saved audit evidence.</p><button className="rpm-run" onClick={onRun} disabled={!canRun}><Play size={17}/>Run AI optimization</button></div>}
    </section>

    {result&&<details className="rpm-identifiers"><summary><ShieldCheck size={18}/>Model and audit identifiers</summary><dl><div><dt>Run ID</dt><dd>{result.runId}</dd></div><div><dt>Model version</dt><dd>{result.modelVersion}</dd></div><div><dt>Model artifact</dt><dd>{result.artifactHash}</dd></div><div><dt>Source dataset</dt><dd>{result.dataHash}</dd></div><div><dt>Output fingerprint</dt><dd>{result.outputHash}</dd></div></dl><p>Saved records use SHA-256 and server-held HMAC authentication. These checks verify software evidence, not measured plant performance.</p></details>}
  </div>;
}
