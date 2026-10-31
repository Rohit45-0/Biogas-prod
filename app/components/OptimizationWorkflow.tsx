"use client";

import {useEffect,useRef,useState} from "react";
import {ArrowRight,Check,CheckCheck,ChartNoAxesCombined,ClipboardList,Database,Download,FileCheck2,Gauge,GitBranch,LoaderCircle,LocateFixed,Pause,Play,RotateCcw,ShieldCheck,TriangleAlert,X} from "lucide-react";
import {optimizationSteps,type OptimizationWorkflowState} from "../lib/optimization-workflow";
import "./optimization-workflow.css";

const icons=[ClipboardList,ShieldCheck,GitBranch,ChartNoAxesCombined,Gauge,FileCheck2,Database,CheckCheck];
const number=(value:number)=>value.toLocaleString(undefined,{maximumFractionDigits:1});
const milliseconds=(value:number)=>value<1?"<1 ms":`${number(value)} ms`;
export default function OptimizationWorkflow({state,onClose,onRun}:{state:OptimizationWorkflowState;onClose:()=>void;onRun:()=>void}){
  const root=useRef<HTMLElement>(null);
  const [selected,setSelected]=useState<number|null>(null),[replay,setReplay]=useState<number|null>(null),[paused,setPaused]=useState(false);
  const [now,setNow]=useState(state.startedAt);
  const running=state.phase==="running",replaying=replay!==null;
  const latest=optimizationSteps.map(step=>state.events.findLast(e=>e.step===step.id));
  const terminal=(status:string|undefined)=>status==="complete"||status==="warning";
  const pendingIndex=latest.findIndex(e=>!terminal(e?.status));
  const active=pendingIndex<0?7:pendingIndex;
  const selectedIndex=selected??(replaying?Math.min(replay,7):active);
  const detailEvent=latest[selectedIndex],selectedStep=optimizationSteps[selectedIndex];
  const completeCount=latest.filter(e=>e?.status==="complete").length;
  const warningCount=latest.filter(e=>e?.status==="warning").length;
  const reportedCount=completeCount+warningCount;
  const serverMs=state.events.at(-1)?.elapsedMs;
  const status=running?"Execution in progress":state.phase==="error"?"Execution interrupted":state.result?.audit.saved?"Run complete":"Complete with audit warning";
  const elapsed=running?Math.max(0,(now-state.startedAt)/1000):serverMs===undefined?null:serverMs/1000;

  useEffect(()=>{root.current?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});},[]);
  useEffect(()=>{if(!running)return;const timer=window.setInterval(()=>setNow(Date.now()),250);return()=>window.clearInterval(timer);},[running]);
  useEffect(()=>{
    if(!replaying||paused)return;
    const timer=window.setInterval(()=>setReplay(index=>index===null||index>=8?null:index+1),650);
    return()=>window.clearInterval(timer);
  },[replaying,paused]);

  function stageStatus(index:number){
    if(replaying){if(index<replay)return latest[index]?.status??"pending";return index===replay?"replaying":"pending";}
    if(state.phase==="error"&&index===(pendingIndex<0?7:pendingIndex))return "failed";
    if(index===0&&running&&!state.events.length)return "connecting";
    return latest[index]?.status??"pending";
  }
  function stageLabel(value:string){return ({complete:"Completed",running:"In progress",warning:"Not recorded",failed:"Interrupted",pending:"Pending",connecting:"Connecting",replaying:paused?"Replay paused":"Replaying"} as Record<string,string>)[value];}
  const detailStatus=stageStatus(selectedIndex);
  const displayedCount=replaying?Math.min(replay,8):reportedCount;
  return <section ref={root} className="optimization-workflow" aria-label="AI optimization workflow">
    <header className="ow-header">
      <div><p className="ow-eyebrow">AQUAIVOLT / MODEL EXECUTION</p><h2>AI optimization workflow</h2><p className="ow-model">{state.result?`${state.result.modelName} ${state.result.modelVersion}`:"Multi-Input Scenario Ensemble"} <span>POST /api/predict</span></p></div>
      <div className="ow-header-status"><span className={`ow-badge ${state.phase==="error"?"error":warningCount?"warning":running?"active":"success"}`} role="status">{running?<LoaderCircle size={14} className="ow-spin"/>:state.phase==="error"||warningCount?<TriangleAlert size={14}/>:<CheckCheck size={14}/>} {status}</span><div className="ow-count"><strong>{String(displayedCount).padStart(2,"0")}</strong><span>of 08 <small>{replaying?"replayed":"reported"}</small></span></div>{!running&&<button className="ow-icon-button" title="Dismiss workflow" aria-label="Dismiss workflow" onClick={onClose}><X size={18}/></button>}</div>
    </header>
    <div className="ow-progress" role="progressbar" aria-label={replaying?"Trace replay progress":"Reported execution stages"} aria-valuemin={0} aria-valuemax={8} aria-valuenow={displayedCount} aria-valuetext={`${displayedCount} of 8 stages ${replaying?"replayed":"reported"}${warningCount?`, ${warningCount} warning`:""}`}><span style={{width:`${displayedCount/8*100}%`}}/>{running&&reportedCount<8&&<i style={{left:`${reportedCount/8*100}%`}}/>}</div>
    <div className="ow-source"><div><Database size={15}/><strong>Reference operating data</strong><span>9 input values</span></div><span>PLC / IoT not connected</span></div>
    <ol className="ow-stages">{optimizationSteps.map((step,index)=>{
      const Icon=icons[index],value=stageStatus(index);
      return <li key={step.id} className={`ow-stage ${value}`}><button type="button" aria-pressed={selectedIndex===index} aria-label={`Step ${index+1}: ${step.title}. ${stageLabel(value)}`} onClick={()=>setSelected(index)}>
        <span className="ow-stage-top"><span className="ow-step-number">{String(index+1).padStart(2,"0")}</span>{value==="complete"?<Check size={16}/>:value==="running"||value==="connecting"?<LoaderCircle size={16} className="ow-spin"/>:value==="warning"||value==="failed"?<TriangleAlert size={16}/>:<Icon size={16}/>}</span>
        <strong>{step.title}</strong><span className="ow-stage-bottom"><span>{stageLabel(value)}</span><small>{terminal(latest[index]?.status)&&(!replaying||index<replay)?milliseconds(latest[index]!.elapsedMs):""}</small></span>
      </button>{index<7&&<ArrowRight size={13} className="ow-connector" aria-hidden="true"/>}</li>;
    })}</ol>
    <div className="ow-inspector">
      <div className="ow-step-detail"><span className={`ow-detail-icon ${detailStatus}`}><span>{String(selectedIndex+1).padStart(2,"0")}</span></span><div><p className="ow-eyebrow">{replaying?"RECORDED TRACE REPLAY":"EXECUTION STAGE"}</p><h3>{selectedStep.title}</h3><p>{detailStatus==="failed"?state.error:detailEvent?.detail??(detailStatus==="connecting"?"Awaiting the authenticated server response.":selectedStep.detail)}</p><small>{detailEvent?`${new Date(detailEvent.at).toLocaleTimeString()} / ${milliseconds(detailEvent.elapsedMs)} from server request start`:"No server confirmation yet"}</small></div>{selected!==null&&<button className="ow-icon-button" title="Follow latest stage" aria-label="Follow latest stage" onClick={()=>setSelected(null)}><LocateFixed size={17}/></button>}</div>
      <aside><p className="ow-eyebrow">{replaying?"REPLAY STATUS":"RUN STATUS"}</p><strong>{replaying?(paused?"Trace replay paused":"Replaying a completed run"):status}</strong><p>{state.phase==="error"?"The final result was not confirmed. Previous dashboard results have not been replaced.":running?"Waiting for server-confirmed stages and audit storage.":state.result?.audit.saved?"Server-authenticated audit record saved and read back.":"Outputs are available. Persistent audit evidence was not confirmed."}</p><small>{elapsed===null?"Server timing unavailable":running?`${elapsed.toFixed(1)} s elapsed`:`${serverMs!<1000?milliseconds(serverMs!):`${elapsed.toFixed(1)} s`} server execution`}</small></aside>
    </div>
    {state.error&&<div className="ow-error" role="alert"><TriangleAlert size={17}/><span>{state.error}</span></div>}
    {state.result&&<dl className="ow-result-strip"><div><dt>Biogas</dt><dd>{number(state.result.biogas)} <small>m3/day</small></dd></div><div><dt>Methane</dt><dd>{number(state.result.methane)} <small>m3/day</small></dd></div><div><dt>Electricity</dt><dd>{number(state.result.electricity)} <small>kWh/day</small></dd></div><div className="ow-run-id"><dt>Run ID</dt><dd><code>{state.result.runId}</code></dd></div></dl>}
    <div className="ow-footer"><div className="ow-actions">{state.phase==="complete"&&reportedCount===8&&<>
      {replaying?<button onClick={()=>setPaused(value=>!value)}>{paused?<Play size={15}/>:<Pause size={15}/>} {paused?"Resume replay":"Pause replay"}</button>:<button onClick={()=>{setSelected(null);setPaused(false);setReplay(0);}}><RotateCcw size={15}/>Replay trace</button>}
      {replaying&&<button className="ow-icon-button" title="End trace replay" aria-label="End trace replay" onClick={()=>setReplay(null)}><X size={16}/></button>}
    </>}{running&&<span className="ow-footnote">Server-reported progress; no equipment commands</span>}{!running&&<button onClick={onRun}><Play size={15}/>{state.phase==="error"?"Retry optimization":"Run again"}</button>}</div>
      <div className="ow-actions">{state.result?.audit.saved&&<a href={`/api/predict?runId=${encodeURIComponent(state.result.runId)}&format=csv`} download><Download size={15}/>Export 2,000 scenarios</a>}{state.result&&<button className="ow-primary" onClick={onClose}>View results<ArrowRight size={16}/></button>}</div>
    </div>
  </section>;
}
