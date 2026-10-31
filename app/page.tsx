"use client";

import { FormEvent, useEffect, useRef, useState,type ReactNode } from "react";
import {ClipboardCheck} from "lucide-react";
import AuditTrail from "./components/AuditTrail";
import OptimizationWorkflow from "./components/OptimizationWorkflow";
import DomainNotice from "./components/DomainNotice";
import type {DomainAssessment} from "./lib/domain";
import {hrtChangeLabel} from "./lib/hrt";
import {readOptimizationResponse,type OptimizationWorkflowState} from "./lib/optimization-workflow";

type Inputs = {
  feedstock:string; feedRate:number; temperature:number; ph:number; olr:number;
  hrt:number; codIn:number; vfa:number; mixing:number;
};
type PlantOutput = {
  gasFlow:number; biogas:number; methanePct:number; methane:number; electricity:number;
  generatorKw:number; carbon:number; co2Pct:number; h2s:number;
};
type BaselinePreview = Pick<PlantOutput,"biogas"|"methane"|"electricity">;
type Recommendation = {
  title:string; detail:string; parameter:string; current:number; target:number; unit:string;
};
type EquipmentState = {label:string;state:string;detail:string;mode:string;tone:string};
type ModelTrace = {
  executionId:string; executedAt:string; endpoint:string; algorithm:string; implementation:string;
  randomized:boolean; inputCount:number; scenarioCount:number; coverageRows:number; status:string;
  stages:{label:string;status:string;detail:string;elapsedMs:number;at:string}[];
  nearestScenarios:{anchor:string;feedstock:string;distance:number;weight:number}[];
  featureInfluence:{label:string;contribution:number;interpretation:string}[];
  inputSensitivity:{label:string;response:number;direction:string;step:number;unit:string;strength:number}[];
  optimization:{candidateCount:number;selectedRank:number;seed:string;strategy:string;objectiveWeights:Record<string,number>};
  limitations:string[];
};
type Prediction = {
  biogas:number; methane:number; electricity:number; pressure:number; h2s:number; stability:number; bestSetpoints:Omit<Inputs,"feedstock">;
  retentionTime:{beforeHours:number;optimizedHours:number;reductionHours:number};
  domainAssessment?:DomainAssessment;optimizedDomainAssessment?:DomainAssessment;
  recommendations:Recommendation[]; baseline:PlantOutput; optimized:PlantOutput;
  recommendedProjection:{biogas:number;methane:number;electricity:number;biogasChange:number;methaneChange:number;electricityChange:number;basis:string};
  equipmentStates:EquipmentState[];
  modelName:string; modelVersion:string; modelFit:string; outOfRange:boolean; extrapolatedInputs?:string[];
  runId:string; createdAt:string; agentMessage:string;
  scenarioPreview:{rank:number;sourceCondition:string;selected:boolean;hrtHours:number;baselineBiogas:number;aiBiogas:number;aiMethane:number;aiElectricity:number}[];
  hourlyForecast:{hour:number;biogas:number;electricity:number;baselineBiogas:number;baselineElectricity:number;ch4:number;co2:number;h2s:number}[];
  modelCurves:{source:string;current:{hrt:number;ph:number;biogas:number;methane:number;electricity:number};hrt:ModelCurvePoint[];ph:ModelCurvePoint[]};
  modelTrace:ModelTrace;
  audit:{saved:boolean;status:string};
};
type ModelCurvePoint = {input:number;biogas:number;methane:number;electricity:number};
type AuthUser = {username:string;role:"admin"|"user"};
type OutputKey = "biogas"|"methane"|"electricity";
type PeriodMode = "line"|"day"|"month"|"year";
type RunRecord = {id:string;time:string;inputs:Inputs;result:Prediction};

const initial:Inputs = {
  feedstock:"Dairy WW", feedRate:846, temperature:36.5, ph:7.2, olr:3.2,
  hrt:22, codIn:7600, vfa:1100, mixing:50,
};
const outputs:Record<OutputKey,{label:string;unit:string;icon:string;color:string;before:(p:Prediction)=>number;after:(p:Prediction)=>number}> = {
  biogas:{label:"Biogas",unit:"m³/day",icon:"◒",color:"#1187f5",before:p=>p.baseline.biogas,after:p=>p.optimized.biogas},
  methane:{label:"Methane",unit:"m³ CH₄/day",icon:"◆",color:"#16a777",before:p=>p.baseline.methane,after:p=>p.optimized.methane},
  electricity:{label:"Electricity",unit:"kWh/day",icon:"ϟ",color:"#e5a51c",before:p=>p.baseline.electricity,after:p=>p.optimized.electricity},
};
export default function Home(){
  const [auth,setAuth]=useState<AuthUser|null>(null);
  const [checking,setChecking]=useState(true);
  const [username,setUsername]=useState("");
  const [password,setPassword]=useState("");
  const [loginError,setLoginError]=useState("");
  const [loginBusy,setLoginBusy]=useState(false);
  const [inputs]=useState(initial);
  const [result,setResult]=useState<Prediction|null>(null);
  const [baselinePreview,setBaselinePreview]=useState<BaselinePreview|null>(null);
  const [lastRunInputs,setLastRunInputs]=useState<Inputs|null>(null);
  const [runs,setRuns]=useState<RunRecord[]>([]);
  const [activeOutput,setActiveOutput]=useState<OutputKey>("biogas");
  const [workspaceView,setWorkspaceView]=useState<"overview"|"audit"|OutputKey>("overview");
  const [loading,setLoading]=useState(false);
  const [predictionError,setPredictionError]=useState("");
  const [workflow,setWorkflow]=useState<OptimizationWorkflowState|null>(null);
  const predictionRequest=useRef<AbortController|null>(null);
  const [chatOpen,setChatOpen]=useState(false);
  const [question,setQuestion]=useState("");
  const [chatBusy,setChatBusy]=useState(false);
  const [messages,setMessages]=useState<{role:"ai"|"user";text:string}[]>([{role:"ai",text:"Run a calculation, then ask me what changed or what input to adjust next."}]);

  useEffect(()=>{void (async()=>{try{const response=await fetch("/api/auth/session",{cache:"no-store"});if(response.ok)setAuth((await response.json()).user);}catch{setLoginError("Could not check the session. Please sign in again.");}finally{setChecking(false);}})();},[]);
  useEffect(()=>()=>predictionRequest.current?.abort(),[]);
  useEffect(()=>{
    if(!auth)return;
    void (async()=>{try{const response=await fetch("/api/predict",{cache:"no-store"});if(!response.ok)throw new Error("Baseline could not be loaded");setBaselinePreview((await response.json()).baseline);}catch{setPredictionError("Baseline could not be loaded. Check the connection and sign in again.");}})();
  },[auth]);

  async function login(event:FormEvent){
    event.preventDefault();setLoginBusy(true);setLoginError("");
    try{const response=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Login failed");setAuth(data.user);setPassword("");}
    catch(error){setLoginError(error instanceof Error?error.message:"Login failed");}
    finally{setLoginBusy(false);}
  }

  async function logout(){try{const response=await fetch("/api/auth/logout",{method:"POST"});if(!response.ok)throw new Error("Logout failed");predictionRequest.current?.abort();predictionRequest.current=null;setLoading(false);setWorkflow(null);setAuth(null);setResult(null);setBaselinePreview(null);setLastRunInputs(null);setPredictionError("");setRuns([]);setWorkspaceView("overview");setChatOpen(false);setQuestion("");setMessages([{role:"ai",text:"Run a calculation, then ask me what changed."}]);}catch{setPredictionError("Could not log out. Check the connection and retry.");}}

  async function predict(submittedInputs:Inputs=inputs){
    if(predictionRequest.current)return;
    const controller=new AbortController(),id=crypto.randomUUID();predictionRequest.current=controller;
    setLoading(true);setPredictionError("");setChatOpen(false);
    setWorkflow({id,startedAt:Date.now(),phase:"running",events:[],result:null,error:""});
    try{
      const previousRun=result?{prediction:{biogas:result.biogas}}:undefined;
      const response=await fetch("/api/predict",{method:"POST",signal:controller.signal,headers:{"Content-Type":"application/json","Accept":"application/x-ndjson"},body:JSON.stringify({profileId:"DAIRY-WW-001",operatingConditions:submittedInputs,...(previousRun?{previousRun}:{})})});
      const data=await readOptimizationResponse<Prediction>(response,event=>setWorkflow(current=>current?.id===id?{...current,events:[...current.events,event]}:current));
      if(predictionRequest.current!==controller)return;
      setResult(data);setLastRunInputs({...submittedInputs});
      setWorkflow(current=>current?.id===id?{...current,phase:"complete",result:data}:current);
      setRuns(current=>[{id:data.runId,time:new Date(data.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),inputs:{...submittedInputs},result:data},...current].slice(0,8));
    }catch(error){if(!controller.signal.aborted){const message=error instanceof Error?error.message:"Prediction failed";setPredictionError(message);setWorkflow(current=>current?.id===id?{...current,phase:"error",error:message}:current);}}
    finally{if(predictionRequest.current===controller){predictionRequest.current=null;setLoading(false);}}
  }

  async function ask(event?:FormEvent){
    event?.preventDefault();const text=question.trim();if(!text||chatBusy)return;
    const next=[...messages,{role:"user" as const,text}];setMessages(next);setQuestion("");setChatBusy(true);
    try{const response=await fetch("/api/copilot",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:text,inputs,prediction:result,history:next})});const data=await response.json();setMessages(current=>[...current,{role:"ai",text:response.ok?data.answer:(data.error||"I could not answer that right now.")}]);}
    catch{setMessages(current=>[...current,{role:"ai",text:"I could not reach the assistant. Your calculation is still available on the dashboard."}]);}
    finally{setChatBusy(false);}
  }

  function openOverviewSection(id?:string){
    setWorkspaceView("overview");
    window.setTimeout(()=>document.getElementById(id||"overview")?.scrollIntoView(),0);
  }

  if(checking)return <main className="loading-screen"><span>◒</span><b>Opening Aquaivolt…</b></main>;
  if(!auth)return <LoginScreen username={username} password={password} error={loginError} busy={loginBusy} onUsername={setUsername} onPassword={setPassword} onSubmit={login}/>;
  const workflowPanel=workflow?<OptimizationWorkflow key={workflow.id} state={workflow} onRun={()=>void predict()} onClose={()=>{setWorkflow(null);window.scrollTo({top:0});}}/>:null;

  return <main className="simple-shell">
    <aside className="simple-sidebar">
      <div className="simple-brand"><span>◒</span><b>AQUAIVOLT<small>WASTE TO ENERGY</small></b></div>
      <nav>
        <button className={workspaceView==="overview"?"active":""} onClick={()=>openOverviewSection()}><span>⌂</span>Overview</button>
        {(Object.keys(outputs) as OutputKey[]).map(key=><button key={key} className={workspaceView===key?"active":""} onClick={()=>{setActiveOutput(key);setWorkspaceView(key);window.scrollTo({top:0});}}><span>{outputs[key].icon}</span>{outputs[key].label}</button>)}
        <button onClick={()=>openOverviewSection("comparison")}><span>⌁</span>Process monitor</button>
        <button onClick={()=>openOverviewSection("recommendations")}><span>✦</span>AI optimizer</button>
        <button onClick={()=>openOverviewSection("history")}><span>≡</span>Run history</button>
        {auth.role==="admin"&&<button className={workspaceView==="audit"?"active":""} onClick={()=>{setWorkspaceView("audit");setChatOpen(false);window.scrollTo({top:0});}}><span><ClipboardCheck size={17} style={{display:"inline",verticalAlign:"middle"}}/></span>Audit Trail</button>}
      </nav>
      <div className="side-note"><b>SYSTEM STATUS</b><span>ADVISORY MODEL</span><small>2,000-candidate engine ready<br/>PLC / IoT not connected</small></div>
      <button className="side-logout" onClick={()=>void logout()}>Log out</button>
    </aside>

    <section className="simple-workspace" id="overview">
      {workspaceView==="audit"&&auth.role==="admin"&&<AuditTrail onOverview={()=>openOverviewSection()}/>}
      {workspaceView!=="overview"&&workspaceView!=="audit"&&<FocusedOutputPage
        outputKey={workspaceView}
        result={result}
        runInputs={lastRunInputs}
        inputs={inputs}
        loading={loading}
        predictionError={predictionError}
        onOutput={key=>{setActiveOutput(key);setWorkspaceView(key);window.scrollTo({top:0});}}
        onCalculate={()=>void predict()}
        onOverview={()=>openOverviewSection()}
        workflow={workflowPanel}
      />}
      <div className={`overview-workspace ${workspaceView==="overview"?"":"workspace-hidden"}`}>
      <header className="simple-header operations-header">
        <div><p>AI PRODUCTION CENTER</p><h1>AQUAIVOLT</h1><span>Baseline and optimized model estimates from one reference-data run.</span></div>
        <div className="header-tools"><span className="system-ready"><i/>Prototype engine</span><span className="plc-status"><i/>PLC not connected</span><button className="copilot-button" onClick={()=>setChatOpen(true)}>✦ Ask Copilot</button><button className="run-ai-button" disabled={loading} onClick={()=>void predict()}>{loading?"Running optimization…":"Run AI optimization"}</button><div className="header-user-actions"><div className="user-chip"><b>{auth.username.slice(0,2).toUpperCase()}</b><span>{auth.username}<small>{auth.role}</small></span></div><button className="header-logout-button" onClick={()=>void logout()} title="Log out" aria-label="Log out">↪</button></div></div>
      </header>

      {workspaceView==="overview"&&workflowPanel}
      <OperationsOverview baselinePreview={baselinePreview} result={result} loading={loading} error={predictionError} activeOutput={activeOutput} runs={runs} onOutput={key=>setActiveOutput(key)} onRun={()=>void predict()} onOpenOutput={key=>{setActiveOutput(key);setWorkspaceView(key);window.scrollTo({top:0});}}/>

      <footer><span>Advisory optimization • Server-owned source profile • No PLC or equipment control</span><b>{result?`${result.modelName} ${result.modelVersion}`:"Ready for first AI run"}</b></footer>
      </div>
    </section>

    {chatOpen&&<Copilot messages={messages} question={question} busy={chatBusy} result={result} onQuestion={setQuestion} onAsk={ask} onClose={()=>setChatOpen(false)}/>}
  </main>;
}

function LoginScreen({username,password,error,busy,onUsername,onPassword,onSubmit}:{username:string;password:string;error:string;busy:boolean;onUsername:(v:string)=>void;onPassword:(v:string)=>void;onSubmit:(e:FormEvent)=>void}){
  return <main className="login-page"><section className="login-story"><div className="simple-brand light"><span>◒</span><b>AQUAIVOLT<small>WASTE TO ENERGY</small></b></div><div><small>AI BIOGAS PLATFORM</small><h1>One optimization action.<br/>Clear production results.</h1><p>Compare biogas, methane and electricity before and after model optimization.</p></div><em>Data optimization prototype • Human approval required</em></section><section className="login-form-wrap"><form onSubmit={onSubmit}><span className="login-icon">✦</span><small>SECURE ACCESS</small><h2>Sign in</h2><p>Use your Aquaivolt admin or user account.</p><label><span>Username</span><input value={username} onChange={event=>onUsername(event.target.value)} autoComplete="username" required/></label><label><span>Password</span><input type="password" value={password} onChange={event=>onPassword(event.target.value)} autoComplete="current-password" required/></label>{error&&<div className="login-error">{error}</div>}<button disabled={busy}>{busy?"Checking…":"Continue →"}</button></form></section></main>;
}


function OperationsOverview({baselinePreview,result,loading,error,activeOutput,runs,onOutput,onRun,onOpenOutput}:{baselinePreview:BaselinePreview|null;result:Prediction|null;loading:boolean;error:string;activeOutput:OutputKey;runs:RunRecord[];onOutput:(key:OutputKey)=>void;onRun:()=>void;onOpenOutput:(key:OutputKey)=>void}){
  const [periodMode,setPeriodMode]=useState<PeriodMode>("day");
  const periodOptions:Record<PeriodMode,{label:string;factor:number;description:string;gasUnit:string;methaneUnit:string;electricityUnit:string;carbonUnit:string}>={
    line:{label:"Line",factor:1,description:"Current modeled production-line rate",gasUnit:"m³/day",methaneUnit:"m³ CH₄/day",electricityUnit:"kWh/day",carbonUnit:"kg/day"},
    day:{label:"Day",factor:1,description:"24-hour modeled production total",gasUnit:"m³/day",methaneUnit:"m³ CH₄/day",electricityUnit:"kWh/day",carbonUnit:"kg/day"},
    month:{label:"Month",factor:30,description:"30-day modeled production projection",gasUnit:"m³/month",methaneUnit:"m³ CH₄/month",electricityUnit:"kWh/month",carbonUnit:"kg/month"},
    year:{label:"Year",factor:365,description:"365-day modeled production projection",gasUnit:"m³/year",methaneUnit:"m³ CH₄/year",electricityUnit:"kWh/year",carbonUnit:"kg/year"},
  };
  const period=periodOptions[periodMode];
  const scaled=(value:number|undefined|null)=>value===undefined||value===null?value:value*period.factor;
  const optimized=result?.optimized;
  const baseline=result?.baseline;
  const extraBiogas=result&&optimized&&baseline?optimized.biogas-baseline.biogas:null;
  const h2sRemoved=result&&optimized&&baseline?baseline.h2s-optimized.h2s:null;
  const co2Avoided=result&&optimized&&baseline?(optimized.carbon-baseline.carbon)*1000:null;
  const kpis=[
    {key:"biogas" as const,label:result?"AI biogas":"Baseline biogas",value:scaled(optimized?.biogas??baselinePreview?.biogas),unit:period.gasUnit,note:baseline?`Baseline ${formatPeriodValue(scaled(baseline.biogas)!)} ${period.gasUnit}`:"Before AI optimization",icon:"◒",tone:"blue"},
    {key:"methane" as const,label:result?"AI methane":"Baseline methane",value:scaled(optimized?.methane??baselinePreview?.methane),unit:period.methaneUnit,note:baseline?`Baseline ${formatPeriodValue(scaled(baseline.methane)!)} ${period.methaneUnit}`:"Before AI optimization",icon:"◆",tone:"green"},
    {key:"electricity" as const,label:result?"AI electricity":"Baseline electricity",value:scaled(optimized?.electricity??baselinePreview?.electricity),unit:period.electricityUnit,note:baseline?`Baseline ${formatPeriodValue(scaled(baseline.electricity)!)} ${period.electricityUnit}`:"Before AI optimization",icon:"ϟ",tone:"blue"},
  ];
  const secondary=[
    {label:"Recommended HRT",value:result?.retentionTime.optimizedHours,unit:"hours",note:result?`${format(result.retentionTime.beforeHours)} → ${format(result.retentionTime.optimizedHours)} hours after AI`:"Model days converted to hours",icon:"◷",tone:"green"},
    {label:"Extra biogas",value:scaled(extraBiogas),unit:period.gasUnit,note:`AI output above ${periodMode} baseline`,icon:"↗",tone:"green",signed:true},
    {label:"H₂S removed",value:h2sRemoved,unit:"ppm",note:"Before-versus-after estimate",icon:"◎",tone:"amber"},
    {label:"CO₂e avoided",value:scaled(co2Avoided),unit:period.carbonUnit,note:`Derived ${periodMode} estimate`,icon:"♧",tone:"green"},
    {label:"AI scenarios",value:result?.modelTrace.optimization.candidateCount,unit:"candidates",note:result?`Selected rank #${result.modelTrace.optimization.selectedRank}`:"New search on every run",icon:"▦",tone:"blue"},
  ];
  const recommendations=result?.recommendations.slice(0,4)||[];
  const improvements=result&&baseline&&optimized?[
    {label:"Biogas production",value:`+${formatPeriodValue((optimized.biogas-baseline.biogas)*period.factor)} ${period.gasUnit}`,detail:`${format((optimized.biogas/baseline.biogas-1)*100)}% above baseline`},
    {label:"Methane production",value:`+${formatPeriodValue((optimized.methane-baseline.methane)*period.factor)} ${period.methaneUnit}`,detail:`${format((optimized.methane/baseline.methane-1)*100)}% above baseline`},
    {label:"Electricity output",value:`+${formatPeriodValue((optimized.electricity-baseline.electricity)*period.factor)} ${period.electricityUnit}`,detail:`${format((optimized.electricity/baseline.electricity-1)*100)}% above baseline`},
    {label:"HRT change",value:hrtChangeLabel(result.retentionTime.beforeHours,result.retentionTime.optimizedHours),detail:`Selected HRT ${format(result.retentionTime.optimizedHours)} hours`},
  ]:[];
  return <div className="operations-overview">
    <section className="operations-period-bar"><div><b>Production totals</b><span>{period.description}</span></div><nav aria-label="Production period">{(Object.keys(periodOptions) as PeriodMode[]).map(mode=><button type="button" key={mode} className={periodMode===mode?"active":""} aria-pressed={periodMode===mode} onClick={()=>setPeriodMode(mode)}>{periodOptions[mode].label}</button>)}</nav><small>{result?`Run ${result.runId.split("-")[0].toUpperCase()} · ${new Date(result.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}`:"No completed run yet"}</small></section>
    {error&&<div className="operations-error">{error}<button onClick={onRun}>Try again</button></div>}

    <section className="operations-kpi-grid" aria-live="polite">
      {kpis.map(item=><button key={item.key} className={`operations-kpi ${item.tone}`} onClick={()=>onOpenOutput(item.key)}><span>{item.icon}</span><div><small>{item.label}</small><b>{item.value===undefined||item.value===null?"—":formatPeriodValue(item.value)} <em>{item.value===undefined||item.value===null?"":item.unit}</em></b><p><i/>{item.note}</p></div></button>)}
      {secondary.map(item=><article key={item.label} className={`operations-kpi ${item.tone}`}><span>{item.icon}</span><div><small>{item.label}</small><b>{item.value===undefined||item.value===null?"—":`${item.signed&&item.value>=0?"+":""}${formatPeriodValue(item.value)}`} <em>{item.value===undefined||item.value===null?"":item.unit}</em></b><p><i/>{item.note}</p></div></article>)}
    </section>

    <section className="overview-ai-summary" aria-live="polite">
      <header><div><small>AI RECOMMENDATION</small><h2>Estimated changes and proposed settings</h2></div><span>{result?`Based on run ${result.runId.split("-")[0].toUpperCase()}`:"Waiting for optimization"}</span></header>
      {result?<div className="overview-ai-summary-body">
        <div className="overview-improvements"><h3>Estimated model differences</h3>{improvements.map(item=><article key={item.label}><i>↗</i><p><b>{item.label}</b><span>{item.detail}</span></p><strong>{item.value}</strong></article>)}</div>
        <div className="overview-actions"><h3>Proposed operating changes</h3>{recommendations.map(item=><article key={item.parameter}><i>✓</i><p><b>{item.parameter}</b><span>{item.detail}</span></p><strong>{format(item.current)} → {format(item.target)} <em>{item.unit}</em></strong></article>)}</div>
      </div>:<div className="overview-ai-summary-empty"><span>✦</span><div><b>Run AI optimization to generate recommendations</b><p>Estimated production differences, HRT change, and proposed operating settings. Plant benefits are not yet demonstrated.</p></div><button disabled={loading} onClick={onRun}>{loading?"Optimization running…":"Run AI optimization"}</button></div>}
      {result&&<DomainNotice assessment={result.optimizedDomainAssessment} title="Recommended candidate support"/>}
    </section>

    <section className="scenario-preview-panel" aria-live="polite">
      <header><div><small>RANKED MODEL RESULTS</small><h2>Baseline vs AI scenario preview</h2><p>Highest-ranked candidates; CSV includes all evaluated rows and the producing model version</p></div><div className="scenario-preview-actions"><span>{result?`Top ${result.scenarioPreview.length} of ${result.modelTrace.optimization.candidateCount} candidates`:"Run AI optimization to populate"}</span>{result?.audit.saved?<a href={`/api/predict?format=csv&runId=${encodeURIComponent(result.runId)}`} download>Export 2,000 scenarios ↓</a>:<button disabled>Export 2,000 scenarios ↓</button>}</div></header>
      <div className="scenario-table-scroll"><table><thead><tr><th>Rank</th><th>Source condition</th><th>HRT</th><th>Baseline biogas</th><th>AI biogas</th><th>AI methane</th><th>AI electricity</th></tr></thead><tbody>{result?.scenarioPreview.length?result.scenarioPreview.map(row=><tr key={row.sourceCondition} className={row.selected?"selected":""}><td><b>#{row.rank}</b>{row.selected&&<em>Selected</em>}</td><td>{row.sourceCondition}</td><td>{format(row.hrtHours)} h</td><td>{formatPeriodValue(row.baselineBiogas)} m³/d</td><td><strong>{formatPeriodValue(row.aiBiogas)} m³/d</strong></td><td>{formatPeriodValue(row.aiMethane)} m³/d</td><td>{formatPeriodValue(row.aiElectricity)} kWh/d</td></tr>):<tr className="empty"><td colSpan={7}>Run AI optimization to compare the highest-ranked baseline and AI scenarios.</td></tr>}</tbody></table></div>
    </section>

    <section className="operations-chart-panel" id="comparison">
      <header><div><h2>Baseline vs AI {outputs[activeOutput].label}</h2><p>Paired model outputs from the latest bounded optimization run</p></div><nav>{(Object.keys(outputs) as OutputKey[]).map(key=><button key={key} className={activeOutput===key?"active":""} onClick={()=>onOutput(key)}>{outputs[key].label}</button>)}</nav></header>
      {loading?<Working/>:result?<OperationsPerformanceChart result={result} outputKey={activeOutput} periodMode={periodMode} periodFactor={period.factor}/>:<div className="operations-chart-empty"><span>✦</span><b>Run the AI model to compare baseline and optimized production</b><p>Each run evaluates 2,000 bounded operating candidates.</p></div>}
    </section>

    <div className="operations-detail-grid" id="recommendations">
      <section className="operations-panel stability-panel"><header><h2>Process stability</h2><span>Model estimate</span></header><div className="stability-body"><div className="stability-ring" style={{"--score":result?.stability||0} as React.CSSProperties}><b>{result?format(result.stability):"—"}</b><small>/ 100</small></div><dl><div><dt>pH</dt><dd>{result?format(result.bestSetpoints.ph):"—"}</dd></div><div><dt>Temperature</dt><dd>{result?`${format(result.bestSetpoints.temperature)} °C`:"—"}</dd></div><div><dt>OLR</dt><dd>{result?format(result.bestSetpoints.olr):"—"}</dd></div><div><dt>HRT after AI</dt><dd>{result?`${format(result.retentionTime.optimizedHours)} hours`:"—"}</dd></div></dl></div></section>
      <section className="operations-panel recommendations-panel"><header><h2>AI recommendations</h2><span>{result?`Rank #${result.modelTrace.optimization.selectedRank}`:"Waiting for model"}</span></header><div className="recommendation-table"><div><b>Parameter</b><b>Current</b><b>AI recommended</b></div>{recommendations.length?recommendations.map((item,index)=><div key={`${item.parameter}-${index}`}><b>{item.parameter}</b><span>{format(item.current)} {item.unit}</span><strong>{format(item.target)} {item.unit}</strong></div>):<p>Run AI optimization to calculate recommended setpoints.</p>}</div></section>
      <section className="operations-panel gains-panel"><header><h2>Estimated differences</h2><span>{period.description}</span></header>{result&&baseline&&optimized?<dl><div><dt>Extra biogas</dt><dd>+{formatPeriodValue((optimized.biogas-baseline.biogas)*period.factor)} {period.gasUnit}</dd></div><div><dt>Extra methane</dt><dd>+{formatPeriodValue((optimized.methane-baseline.methane)*period.factor)} {period.methaneUnit}</dd></div><div><dt>Extra electricity</dt><dd>+{formatPeriodValue((optimized.electricity-baseline.electricity)*period.factor)} {period.electricityUnit}</dd></div><div><dt>H₂S removed</dt><dd>{format(baseline.h2s-optimized.h2s)} ppm</dd></div></dl>:<p>Expected gains appear after the model run.</p>}<button disabled={loading} onClick={onRun}>{loading?"Optimization running…":"Run AI optimization"}</button></section>
    </div>

    <div className="operations-evidence-grid">
      <section className="operations-panel model-health"><header><h2>AI model health</h2><span>Auditable facts</span></header><dl><div><dt>Model</dt><dd>{result?.modelName||"Multi-Input Scenario Ensemble"}</dd></div><div><dt>Calculations</dt><dd>{result?.modelTrace.optimization.candidateCount||2000}</dd></div><div><dt>Source mode</dt><dd>Server profile</dd></div><div><dt>PLC / IoT</dt><dd className="warning">Not connected</dd></div></dl><strong>✓ Calculation route available</strong></section>
      <section className="operations-panel recent-actions" id="history"><header><h2>Recent AI actions</h2><span>{runs.length} current-session run{runs.length===1?"":"s"}</span></header>{runs.length?<div>{runs.slice(0,5).map((run,index)=><article key={run.id}><span>{String(index+1).padStart(2,"0")}</span><b>{run.id.slice(0,8).toUpperCase()}</b><p>{format(run.result.baseline.biogas)} → <strong>{format(run.result.optimized.biogas)} m³/day</strong></p><em>Rank #{run.result.modelTrace.optimization.selectedRank}</em></article>)}</div>:<p>No optimization actions yet.</p>}</section>
    </div>
  </div>;
}

function OperationsPerformanceChart({result,outputKey,periodMode,periodFactor}:{result:Prediction;outputKey:OutputKey;periodMode:PeriodMode;periodFactor:number}){
  const meta=outputs[outputKey];
  const optimized=result.hourlyForecast.map(point=>(outputKey==="biogas"?point.biogas:outputKey==="electricity"?point.electricity:point.biogas*point.ch4/100)*periodFactor);
  const baseline=result.hourlyForecast.map(point=>(outputKey==="biogas"?point.baselineBiogas:outputKey==="electricity"?point.baselineElectricity:point.baselineBiogas*result.baseline.methanePct/100)*periodFactor);
  const values=[...optimized,...baseline],min=Math.min(...values)*.96,max=Math.max(...values)*1.04,width=1000,height=245,pad=42;
  const points=(series:number[])=>series.map((value,index)=>`${pad+index*((width-pad*2)/(series.length-1))},${height-pad-(value-min)/Math.max(max-min,.01)*(height-pad*2)}`).join(" ");
  const axisLabels:Record<PeriodMode,[string,string,string]>={line:["Start","12h","24h"],day:["00h","12h","24h"],month:["Day 1","Day 15","Day 30"],year:["Jan","Jun","Dec"]};
  const chartUnit=outputKey==="electricity"?(periodMode==="month"?"kWh/month":periodMode==="year"?"kWh/year":"kWh/day"):(outputKey==="methane"?`m³ CH₄/${periodMode==="month"?"month":periodMode==="year"?"year":"day"}`:`m³/${periodMode==="month"?"month":periodMode==="year"?"year":"day"}`);
  return <div className="operations-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Baseline versus AI ${meta.label} for ${periodMode}`}><g>{[0,1,2,3].map(index=><line key={index} x1={pad} x2={width-pad} y1={pad+index*48} y2={pad+index*48}/>)}</g><polyline className="operations-baseline" points={points(baseline)}/><polyline className="operations-optimized" style={{stroke:meta.color}} points={points(optimized)}/><text x={pad} y={height-8}>{axisLabels[periodMode][0]}</text><text x={width/2} y={height-8} textAnchor="middle">{axisLabels[periodMode][1]}</text><text x={width-pad} y={height-8} textAnchor="end">{axisLabels[periodMode][2]}</text></svg><footer><span><i className="baseline"/>Baseline / no AI</span><span><i style={{background:meta.color}}/>AI optimized</span><b>{chartUnit}</b></footer></div>;
}

function AiRecommendationPanel({result,onApply}:{result:Prediction;onApply:()=>void}){
  const projection=result.recommendedProjection;
  const gain=projection.biogasChange;
  const actions=result.recommendations.slice(0,3);
  return <section className="ai-recommendation-panel" aria-label="AI recommendation to increase biogas">
    <header><div className="recommendation-ai-mark"><i/><span>✦</span><i/></div><div><small>AI RECOMMENDATION READY</small><h2>How to increase biogas in the next simulation</h2><p>The model tested its recommended setpoints through the same prediction engine.</p></div><span className="recommendation-verified">CALCULATED • NOT RANDOM</span></header>
    <div className="recommendation-hero">
      <div className="recommendation-production-flow">
        <article><small>CURRENT PREDICTION</small><b>{format(result.optimized.biogas)}</b><span>m³ biogas/day</span></article>
        <div className="recommendation-ai-step"><i/><span>AI</span><b>Apply modeled setpoints</b><i/></div>
        <article className="recommended-production"><small>RECOMMENDED SIMULATION</small><b>{format(projection.biogas)}</b><span>m³ biogas/day</span></article>
        <aside className={gain>0?"positive":"neutral"}><small>{gain>0?"POSSIBLE EXTRA BIOGAS":"CURRENT RESULT STATUS"}</small><b>{gain>0?"+":""}{format(gain)} <em>m³/day</em></b><span>{gain>0?"Model-estimated opportunity":"Current inputs already meet the modeled recommendation"}</span></aside>
      </div>
      <div className="recommendation-output-effects"><article><span>◆</span><p><small>Methane after recommendation</small><b>{format(projection.methane)} m³ CH₄/day</b></p><em>{projection.methaneChange>=0?"+":""}{format(projection.methaneChange)}</em></article><article><span>ϟ</span><p><small>Electricity after recommendation</small><b>{format(projection.electricity)} kWh/day</b></p><em>{projection.electricityChange>=0?"+":""}{format(projection.electricityChange)}</em></article></div>
    </div>
    <div className="recommendation-actions">
      <div><small>AI ACTION PLAN</small><h3>{result.recommendations[0]?.title||"Maintain the modeled settings"}</h3><p>{result.recommendations[0]?.detail||"The current scenario is already close to the recommended operating point."}</p></div>
      <div className="recommendation-action-list">{actions.map((item,index)=><article key={`${item.parameter}-${index}`}><span>{String(index+1).padStart(2,"0")}</span><p><b>{item.parameter}</b><small>{item.title}</small></p><div><em>Current</em><b>{format(item.current)} {item.unit}</b></div><i>→</i><div><em>AI target</em><b>{format(item.target)} {item.unit}</b></div></article>)}</div>
      <button onClick={onApply}><span>✦</span><div><b>Apply recommendations & simulate again</b><small>Copies the modeled targets and runs a new visible AI analysis</small></div><i>→</i></button>
    </div>
    <footer><span>MODEL BASIS</span><p>{projection.basis}. This is a decision-support estimate; an operator must approve changes before real equipment is adjusted.</p></footer>
  </section>;
}

function Comparison({outputKey,result}:{outputKey:OutputKey;result:Prediction}){
  const meta=outputs[outputKey];const before=meta.before(result);const after=meta.after(result);const extra=after-before;const max=Math.max(before,after)*1.08;
  return <><div className="comparison-head"><div><small>CURRENT CALCULATION</small><h2>{meta.label}: before and after</h2><p>A longer coloured bar means more production.</p></div><span className="coverage-word">{result.outOfRange?"Estimated from nearest pattern":"Matched to supplied patterns"}</span></div><div className="comparison-layout"><div className="big-bars"><div className="bar-row"><span>Before AI</span><div><i className="before" style={{width:`${before/max*100}%`}}/></div><b>{format(before)}<small>{meta.unit}</small></b></div><div className="bar-row"><span>After AI</span><div><i className="after" style={{width:`${after/max*100}%`,background:meta.color}}/></div><b>{format(after)}<small>{meta.unit}</small></b></div><div className="extra-callout"><span>Extra {meta.label.toLowerCase()}</span><b>+{format(extra)} <small>{meta.unit}</small></b><p>This is the direct difference between the two bars.</p></div></div><div className="recommendation-box"><small>WHAT TO DO NEXT</small><h3>{result.recommendations[0]?.title||"Keep the current inputs"}</h3><p>{result.recommendations[0]?.detail||"The current scenario is close to the supplied reference case."}</p>{result.recommendations[0]&&<div><span>{result.recommendations[0].parameter}</span><b>{format(result.recommendations[0].current)} {result.recommendations[0].unit}</b><i>→</i><b>{format(result.recommendations[0].target)} {result.recommendations[0].unit}</b></div>}<em>Review with the plant operator before changing equipment.</em></div></div></>;
}

function ProductionDetail({outputKey,result,inputs}:{outputKey:OutputKey;result:Prediction;inputs:Inputs}){
  const meta=outputs[outputKey];
  const before=meta.before(result);
  const after=meta.after(result);
  const extra=after-before;
  const conditions=[
    {label:"Temperature",current:inputs.temperature,target:result.bestSetpoints.temperature,unit:"°C",tolerance:.5,min:30,max:45},
    {label:"pH",current:inputs.ph,target:result.bestSetpoints.ph,unit:"",tolerance:.1,min:6,max:8},
    {label:"Retention time",current:inputs.hrt,target:result.bestSetpoints.hrt,unit:"days",tolerance:1,min:5,max:40},
  ];
  const actionItems=result.recommendations.slice(0,3);
  const conditionsClose=conditions.filter(condition=>Math.abs(condition.current-condition.target)<=condition.tolerance).length;
  const improvement=before>0?extra/before:0;
  const resultLabel=extra<=0?"No improvement in this run":improvement>=.15?"Strong improvement":improvement>=.05?"Clear improvement":"Small improvement";
  return <>
    <header className="production-detail-head" style={{"--detail-accent":meta.color} as React.CSSProperties}>
      <div><small>PRODUCTION BOARD</small><h2>{meta.label} made simple</h2><p>Everything here belongs to the latest completed calculation.</p></div>
      <div className="production-total"><span>Predicted production</span><b>{format(after)} <em>{meta.unit}</em></b><small>Run {result.runId.split("-")[0].toUpperCase()}</small></div>
    </header>
    <div className="production-glance" style={{"--detail-accent":meta.color} as React.CSSProperties}>
      <div className="production-summary">
        <article><small>Before AI</small><b>{format(before)}</b><span>{meta.unit}</span></article>
        <i>→</i>
        <article className="summary-predicted"><small>Predicted</small><b>{format(after)}</b><span>{meta.unit}</span></article>
        <article className="summary-extra"><small>Extra production</small><b>{extra>=0?"+":""}{format(extra)}</b><span>{meta.unit}</span></article>
      </div>
      <aside className="plain-result-card">
        <small>WHAT THIS RESULT MEANS</small>
        <b>{resultLabel}</b>
        <p>{extra>0?`The model estimates ${format(extra)} ${meta.unit} more ${meta.label.toLowerCase()} than the baseline.`:`This scenario does not produce more ${meta.label.toLowerCase()} than the baseline.`}</p>
        <span><i style={{width:`${conditionsClose/conditions.length*100}%`,background:meta.color}}/></span>
        <em>{conditionsClose} of {conditions.length} key inputs are close to the modeled target</em>
      </aside>
    </div>
    <div className="production-detail-grid">
      <section className="modeled-conditions">
        <div className="detail-section-title"><div><small>MODELED SETPOINTS</small><h3>Best modeled conditions</h3></div><span>Operator review needed</span></div>
        <div className="best-condition-list">
          {conditions.map(condition=><div key={condition.label}><i style={{background:meta.color}}/><span>{condition.label}<small>Recommended input</small></span><b>{format(condition.target)} <em>{condition.unit}</em></b></div>)}
        </div>
      </section>
      <section className="attention-list">
        <div className="detail-section-title"><div><small>NEXT ACTIONS</small><h3>Inputs needing attention</h3></div></div>
        {actionItems.length?<div className="action-rows">{actionItems.map((item,index)=><div key={`${item.parameter}-${index}`}><span>{index+1}</span><p><b>{item.title}</b><small>{item.parameter}: {format(item.current)} {item.unit} → {format(item.target)} {item.unit}</small></p></div>)}</div>:<div className="no-attention"><b>Keep the current inputs</b><span>This scenario is already close to the modeled setpoints.</span></div>}
      </section>
      <aside className="condition-status">
        <div className="detail-section-title"><div><small>CURRENT VS TARGET</small><h3>Input check</h3></div></div>
        {conditions.map(condition=>{
          const difference=Math.abs(condition.current-condition.target);
          const close=difference<=condition.tolerance;
          const span=Math.max(condition.max-condition.min,1);
          const currentPosition=Math.max(2,Math.min(98,((condition.current-condition.min)/span)*100));
          const targetPosition=Math.max(2,Math.min(98,((condition.target-condition.min)/span)*100));
          return <div className="condition-status-card" key={condition.label}>
            <div><b>{condition.label}</b><span className={close?"condition-good":"condition-review"}>{close?"Near target":"Review"}</span></div>
            <p>Current <b>{format(condition.current)} {condition.unit}</b><span>Target <b>{format(condition.target)} {condition.unit}</b></span></p>
            <div className="condition-track" aria-label={`${condition.label}: current ${format(condition.current)} ${condition.unit}, target ${format(condition.target)} ${condition.unit}`}><i className="current-marker" style={{left:`${currentPosition}%`}}/><i className="target-marker" style={{left:`${targetPosition}%`,background:meta.color}}/></div>
            <small><i/>Current input <i style={{background:meta.color}}/>Modeled target</small>
          </div>;
        })}
      </aside>
    </div>
  </>;
}

function FocusedOutputPage({outputKey,result,runInputs,inputs,loading,predictionError,onOutput,onCalculate,onOverview,workflow}:{outputKey:OutputKey;result:Prediction|null;runInputs:Inputs|null;inputs:Inputs;loading:boolean;predictionError:string;onOutput:(key:OutputKey)=>void;onCalculate:()=>void;onOverview:()=>void;workflow:ReactNode}){
  const meta=outputs[outputKey];
  const completedInputs=runInputs||inputs;
  const conditionsClose=result?[
    Math.abs(completedInputs.temperature-result.bestSetpoints.temperature)<=.5,
    Math.abs(completedInputs.ph-result.bestSetpoints.ph)<=.1,
    Math.abs(result.retentionTime.optimizedHours-result.retentionTime.beforeHours)<=24,
  ].filter(Boolean).length:0;
  const curveValue=(point:ModelCurvePoint)=>point[outputKey];
  return <div className="focused-output-page" style={{"--focus-accent":meta.color} as React.CSSProperties}>
    <header className="focused-output-header">
      <div><small>AQUAIVOLT PRODUCTION CENTER</small><h1>{meta.label} Yield Optimization Dashboard</h1><p>A dedicated view for {meta.label.toLowerCase()} prediction, operating targets and supplied validation evidence.</p></div>
      <div><button onClick={onOverview}>← Back to overview</button><button className="focused-run-ai" disabled={loading} onClick={onCalculate}>{loading?"Running…":"Run AI optimization"}</button></div>
    </header>
    {workflow}

    <nav className="focused-output-tabs" aria-label="Production dashboards">
      {(Object.keys(outputs) as OutputKey[]).map(key=><button key={key} className={outputKey===key?"active":""} style={{"--tab-accent":outputs[key].color} as React.CSSProperties} onClick={()=>onOutput(key)}><span>{outputs[key].icon}</span><b>{outputs[key].label}</b><small>Production</small></button>)}
    </nav>

    <div className="focused-kpis">
      <article><small>Current predicted {meta.label.toLowerCase()}</small><b>{result?format(meta.after(result)):"Waiting"}</b><span>{result?meta.unit:"Run calculation"}</span></article>
      <article><small>Recommended retention time</small><b>{result?format(result.retentionTime.optimizedHours):"—"}</b><span>{result?`hours · ${hrtChangeLabel(result.retentionTime.beforeHours,result.retentionTime.optimizedHours)}`:"Run calculation"}</span></article>
      <article><small>Optimal pH</small><b>{result?format(result.bestSetpoints.ph):"—"}</b><span>{result?"modeled target":"Run calculation"}</span></article>
    </div>

    {predictionError&&<div className="focused-error">{predictionError}</div>}
    <div className="focused-output-content no-filters">
      <main className="focused-output-main">
        {loading?<Working/>:result?<ReferenceOutputBoard outputKey={outputKey} result={result} inputs={completedInputs} conditionsClose={conditionsClose}/>:<WaitingReferenceBoard outputKey={outputKey}/>}

        <section className="focused-visualizations">
          <header><div><small>DYNAMIC VISUALIZATIONS</small><h2>{meta.label} response to this calculation</h2><p>{result?result.modelCurves.source:"Run AI optimization to generate model curves."}</p></div><span>{result?"Latest scenario":"Waiting"}</span></header>
          {result?<div className="focused-chart-grid">
            <DynamicTrendChart outputKey={outputKey} result={result}/>
            <MiniScatterChart title={`Retention time vs ${meta.label}`} xValues={result.modelCurves.hrt.map(point=>point.input)} yValues={result.modelCurves.hrt.map(curveValue)} color={meta.color} xUnit="hours" yUnit={meta.unit} currentX={result.retentionTime.beforeHours} currentY={result.modelCurves.current[outputKey]}/>
            <MiniScatterChart title={`pH vs ${meta.label}`} xValues={result.modelCurves.ph.map(point=>point.input)} yValues={result.modelCurves.ph.map(curveValue)} color={meta.color} xUnit="pH" yUnit={meta.unit} currentX={result.modelCurves.current.ph} currentY={result.modelCurves.current[outputKey]}/>
          </div>:<div className="dynamic-chart-waiting"><span>⌁</span><b>Dynamic charts are waiting</b><p>Run AI optimization to calculate the server-owned source profile. No placeholder curve is shown.</p></div>}
        </section>
        {result&&!loading&&<ModelEvidencePanel result={result} inputs={completedInputs}/>}
      </main>
    </div>
  </div>;
}

function WaitingReferenceBoard({outputKey}:{outputKey:OutputKey}){
  const meta=outputs[outputKey];
  return <section className="reference-output-board reference-waiting" style={{"--reference-accent":meta.color} as React.CSSProperties}>
    <header className="reference-output-head"><div><small>CLIENT PRODUCTION VIEW</small><h3>{meta.label} production — waiting for calculation</h3></div><div><span>Total predicted {meta.label.toLowerCase()}</span><b>Waiting</b><small>Run AI optimization</small></div></header>
    <div className="reference-output-layout"><div className="potential-stack"><section className="potential-card"><header><div><small>TOP POTENTIAL</small><h4>AI-optimized scenario</h4></div><span>Waiting</span></header><div className="waiting-lines"><i/><i/><i/></div></section><section className="potential-card least-potential"><header><div><small>LEAST POTENTIAL</small><h4>Baseline scenario</h4></div><span>Waiting</span></header><div className="waiting-lines"><i/><i/><i/></div></section></div><aside className="reference-controls"><section className="reference-control-card"><header><h4>Temperature of digester</h4><span>Waiting</span></header><p>Run a calculation to see current and target values.</p><div className="reference-scale"/></section><section className="reference-control-card"><header><h4>pH of feed</h4><span>Waiting</span></header><p>Run a calculation to see current and target values.</p><div className="reference-scale"/></section></aside></div>
  </section>;
}

function DynamicTrendChart({outputKey,result}:{outputKey:OutputKey;result:Prediction}){
  const meta=outputs[outputKey];
  const optimized=result.hourlyForecast.map(point=>outputKey==="biogas"?point.biogas:outputKey==="electricity"?point.electricity:point.biogas*point.ch4/100);
  const baseline=result.hourlyForecast.map(point=>outputKey==="biogas"?point.baselineBiogas:outputKey==="electricity"?point.baselineElectricity:point.baselineBiogas*result.baseline.methanePct/100);
  const all=[...optimized,...baseline];const min=Math.min(...all)*.97,max=Math.max(...all)*1.03;const width=500,height=180,pad=30;
  const points=(values:number[])=>values.map((value,index)=>`${pad+index*((width-pad*2)/(values.length-1))},${height-pad-(value-min)/Math.max(max-min,.01)*(height-pad*2)}`).join(" ");
  return <article className="focused-line-chart"><h3>Illustrative daily profile</h3><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${meta.label} calculated 24-hour baseline and optimized forecast`}><g>{[0,1,2].map(index=><line key={index} x1={pad} x2={width-pad} y1={pad+index*55} y2={pad+index*55}/>)}</g><polyline className="dynamic-baseline" points={points(baseline)}/><polyline className="dynamic-optimized" style={{stroke:meta.color}} points={points(optimized)}/><text x={pad} y={height-7}>Now</text><text x={width-pad} y={height-7} textAnchor="end">24h</text></svg><div><span><i className="baseline-key"/>Modeled baseline</span><span><i style={{background:meta.color}}/>Illustrative optimized profile</span><b>{meta.unit}</b></div></article>;
}

function MiniScatterChart({title,xValues,yValues,color,xUnit,yUnit,currentX,currentY}:{title:string;xValues:number[];yValues:number[];color:string;xUnit:string;yUnit:string;currentX:number;currentY:number}){
  const width=300,height=165,pad=28;
  const minX=Math.min(...xValues,currentX),maxX=Math.max(...xValues,currentX),minY=Math.min(...yValues,currentY),maxY=Math.max(...yValues,currentY);
  const x=(value:number)=>pad+(value-minX)/Math.max(maxX-minX,.01)*(width-pad*2);
  const y=(value:number)=>height-pad-(value-minY)/Math.max(maxY-minY,.01)*(height-pad*2);
  const curvePoints=xValues.map((value,index)=>`${x(value)},${y(yValues[index])}`).join(" ");
  return <article className="mini-scatter"><h3>{title}</h3><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} calculated by sweeping one input through the current model scenario`}><g>{[0,1,2].map(index=><line key={index} x1={pad} x2={width-pad} y1={pad+index*54} y2={pad+index*54}/>)}</g><polyline points={curvePoints} style={{stroke:color}}/>{xValues.map((value,index)=><circle key={index} cx={x(value)} cy={y(yValues[index])} r="4" style={{fill:color}}/>)}<circle className="current-scenario-point" cx={x(currentX)} cy={y(currentY)} r="7" style={{fill:color}}/><text x={pad} y={height-7}>{format(minX)}</text><text x={width-pad} y={height-7} textAnchor="end">{format(maxX)} {xUnit}</text></svg><p><i style={{background:color}}/> Current input: {format(currentX)} {xUnit} · {format(currentY)} {yUnit}</p></article>;
}

function ReferenceOutputBoard({outputKey,result,inputs,conditionsClose}:{outputKey:OutputKey;result:Prediction;inputs:Inputs;conditionsClose:number}){
  const meta=outputs[outputKey];
  const before=meta.before(result);
  const after=meta.after(result);
  const extra=after-before;
  const improvement=before>0?extra/before:0;
  const potential=extra<=0?"Low":improvement>=.15?"High":"Medium";
  const gaps=[
    {label:"Retention time",current:result.retentionTime.beforeHours,target:result.retentionTime.optimizedHours,unit:"hours",width:Math.min(100,Math.abs(result.retentionTime.reductionHours)/result.retentionTime.beforeHours*100)},
    {label:"pH",current:inputs.ph,target:result.bestSetpoints.ph,unit:"",width:Math.min(100,Math.abs(inputs.ph-result.bestSetpoints.ph)*100)},
    {label:"Temperature",current:inputs.temperature,target:result.bestSetpoints.temperature,unit:"°C",width:Math.min(100,Math.abs(inputs.temperature-result.bestSetpoints.temperature)/5*100)},
  ];
  const controlCards=[
    {label:"Temperature of digester",current:inputs.temperature,target:result.bestSetpoints.temperature,unit:"°C",min:25,max:45},
    {label:"pH of feed",current:inputs.ph,target:result.bestSetpoints.ph,unit:"",min:6,max:8},
  ];
  return <section className="reference-output-board" style={{"--reference-accent":meta.color} as React.CSSProperties}>
    <header className="reference-output-head">
      <div><small>CLIENT PRODUCTION VIEW</small><h3>{meta.label} production — latest calculation</h3></div>
      <div><span>Total predicted {meta.label.toLowerCase()}</span><b>{format(after)} <em>{meta.unit}</em></b><small>Run {result.runId.split("-")[0].toUpperCase()}</small></div>
    </header>

    <div className="reference-output-layout">
      <div className="potential-stack">
        <section className="potential-card top-potential">
          <header><div><small>TOP POTENTIAL</small><h4>AI-optimized scenario</h4></div><span>{potential}</span></header>
          <div className="potential-row"><i/><p><b>Predicted output</b><small>Latest model result</small></p><strong>{format(after)} <em>{meta.unit}</em></strong></div>
          <div className="potential-row"><i/><p><b>Extra production</b><small>Compared with baseline</small></p><strong>{extra>=0?"+":""}{format(extra)} <em>{meta.unit}</em></strong></div>
          <div className="potential-row"><i/><p><b>Key conditions close</b><small>Temperature, pH and retention time</small></p><strong>{conditionsClose} of 3</strong></div>
        </section>

        <section className="potential-card least-potential">
          <header><div><small>LEAST POTENTIAL</small><h4>Baseline scenario</h4></div><span>Before AI</span></header>
          <div className="potential-row"><i/><p><b>Baseline output</b><small>Starting production estimate</small></p><strong>{format(before)} <em>{meta.unit}</em></strong></div>
          <div className="potential-row"><i/><p><b>Inputs still needing attention</b><small>Distance from modeled targets</small></p><strong>{3-conditionsClose} of 3</strong></div>
          <div className="potential-row"><i/><p><b>Pattern evidence</b><small>How the scenario was calculated</small></p><strong>{result.outOfRange?"Nearest pattern":"Supplied pattern"}</strong></div>
        </section>
      </div>

      <aside className="reference-controls">
        {controlCards.map(card=>{
          const position=Math.max(2,Math.min(98,(card.current-card.min)/(card.max-card.min)*100));
          const targetPosition=Math.max(2,Math.min(98,(card.target-card.min)/(card.max-card.min)*100));
          return <section className="reference-control-card" key={card.label}>
            <header><h4>{card.label}</h4><span>Target {format(card.target)} {card.unit}</span></header>
            <p>Current input <b>{format(card.current)} {card.unit}</b></p>
            <div className="reference-scale"><i className="reference-current" style={{left:`${position}%`}}/><i className="reference-target" style={{left:`${targetPosition}%`}}/></div>
            <footer><span>{card.min} {card.unit}</span><span>Current</span><span>{card.max} {card.unit}</span></footer>
          </section>;
        })}
      </aside>
    </div>

    <div className="reference-insights">
      <section>
        <small>OPTIMIZATION INSIGHT</small>
        <h4>{result.recommendations[0]?.title||"Keep the current inputs"}</h4>
        <p>{result.recommendations[0]?.detail||"The current inputs are close to the modeled operating point."}</p>
        <em>Review with the plant operator before applying any setpoint.</em>
      </section>
      <section className="target-gap-card">
        <small>DISTANCE TO MODELED TARGET</small>
        {gaps.map(gap=><div key={gap.label}><span>{gap.label}<small>{format(gap.current)} {gap.unit} → {format(gap.target)} {gap.unit}</small></span><i><b style={{width:`${Math.max(5,gap.width)}%`,background:meta.color}}/></i></div>)}
      </section>
    </div>
  </section>;
}

function VirtualMonitoring({result,inputs}:{result:Prediction;inputs:Inputs}){
  const state=(label:string)=>result.equipmentStates?.find(item=>item.label===label);
  const feedValve=state("Wastewater feed valve");
  const mixer=state("Mixer drive");
  const outlet=state("Biogas outlet valve");
  const generator=state("Generator");
  return <div className="virtual-monitor">
    <div className="monitor-runline"><span><i/>SIMULATION COMPLETE</span><b>Run {result.runId.split("-")[0].toUpperCase()}</b><em>Calculated {new Date(result.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</em></div>
    <div className="process-flow">
      <article className="process-stage feed-stage">
        <div className="stage-title"><span>01</span><div><small>MANUAL INPUT</small><h3>Wastewater tank</h3></div></div>
        <div className="tank-shape"><div/><b>COD</b><strong>{format(inputs.codIn)}</strong><small>mg/L</small></div>
        <dl><div><dt>Feedstock</dt><dd>{inputs.feedstock}</dd></div><div><dt>Feed rate</dt><dd>{format(inputs.feedRate)} kg VS/day</dd></div><div><dt>Feed valve</dt><dd className={feedValve?.tone==="warning"?"state-warning":"state-good"}>{feedValve?.state||"PULSED"}</dd></div></dl>
      </article>
      <div className="process-link"><span>FLOW</span><i/><b>→</b></div>
      <article className="process-stage digester-stage">
        <div className="stage-title"><span>02</span><div><small>MANUAL INPUT</small><h3>Biogas digester</h3></div></div>
        <div className="digester-shape"><i/><b>AQUAIVOLT</b><span>MIXING</span></div>
        <dl><div><dt>Temperature</dt><dd>{format(inputs.temperature)} °C</dd></div><div><dt>pH</dt><dd>{format(inputs.ph)}</dd></div><div><dt>Retention time</dt><dd>{format(inputs.hrt)} days</dd></div><div><dt>Mixer</dt><dd className={mixer?.tone==="warning"?"state-warning":"state-good"}>{mixer?.state||"ON"} · {format(inputs.mixing)} RPM</dd></div></dl>
      </article>
      <div className="process-link"><span>GAS</span><i/><b>→</b></div>
      <article className="process-stage output-stage">
        <div className="stage-title"><span>03</span><div><small>MODEL OUTPUT</small><h3>Gas and energy</h3></div></div>
        <div className="storage-shape"><div/><b>BIOGAS</b><strong>{format(result.optimized.biogas)}</strong><small>m³/day</small></div>
        <dl><div><dt>Methane</dt><dd>{format(result.optimized.methane)} m³ CH₄/day</dd></div><div><dt>Electricity</dt><dd>{format(result.optimized.electricity)} kWh/day</dd></div><div><dt>Pressure</dt><dd>{format(result.pressure)} mbar</dd></div><div><dt>H₂S</dt><dd>{format(result.h2s)} ppm</dd></div></dl>
      </article>
    </div>
    <div className="monitor-command-row">
      <div><small>SIMULATED OUTLET VALVE</small><b className={outlet?.tone==="warning"?"state-warning":"state-good"}>{outlet?.state||"OPEN"}</b><span>{outlet?.detail||`Pressure ${format(result.pressure)} mbar`}</span></div>
      <div><small>SIMULATED GENERATOR</small><b className={generator?.tone==="warning"?"state-warning":"state-good"}>{generator?.state||"ENABLED"}</b><span>{generator?.detail||`Estimated ${format(result.optimized.generatorKw)} kW`}</span></div>
      <p>These are model estimates and simulated states. They do not read sensors or send commands to hardware.</p>
    </div>
  </div>;
}

function RunTable({runs,outputKey}:{runs:RunRecord[];outputKey:OutputKey}){
  const meta=outputs[outputKey];
  if(!runs.length)return <div className="empty-history"><span>≡</span><b>No calculations yet</b><p>Your recent input and output comparisons will appear here.</p></div>;
  return <div className="run-table"><div className="run-row run-head"><span>Run</span><span>Inputs</span><span>Before</span><span>After</span><span>Extra</span><span>Recommendation</span></div>{runs.map(run=>{const before=meta.before(run.result),after=meta.after(run.result);return <div className="run-row" key={run.id}><b>{run.time}<small>{run.inputs.feedstock}</small></b><span>{run.inputs.temperature}°C • pH {run.inputs.ph} • {run.inputs.hrt} days</span><span>{format(before)} {meta.unit}</span><strong>{format(after)} {meta.unit}</strong><em>+{format(after-before)} {meta.unit}</em><span>{run.result.recommendations[0]?.title||"Hold inputs"}</span></div>})}</div>;
}

function CompletedWorkflowCanvas({result,inputs}:{result:Prediction;inputs:Inputs}){
  const [selected,setSelected]=useState(0);
  const selectedTrace=result.modelTrace.stages[Math.min(selected,result.modelTrace.stages.length-1)];
  return <div className="completed-workflow">
    <div className="completed-workflow-toolbar"><div><span>✓</span><p><b>Completed backend workflow</b><small>Actual server trace / {inputs.feedstock}</small></p></div><code>{result.modelTrace.endpoint}</code><em>{result.audit.status}</em></div>
    <div className="completed-workflow-canvas">{result.modelTrace.stages.map((item,index)=><div className="completed-node-wrap" key={item.label}><button type="button" className={selected===index?"selected":""} onClick={()=>setSelected(index)} aria-pressed={selected===index}><span>✓</span><small>STEP {index+1}</small><b>{item.label}</b><em>{item.elapsedMs} ms</em></button>{index<result.modelTrace.stages.length-1&&<i><b/></i>}</div>)}</div>
    {selectedTrace&&<div className="completed-workflow-inspector"><header><span>✓</span><div><small>SERVER TRACE</small><h3>{selectedTrace.label}</h3><p>{selectedTrace.detail}</p></div></header><div><p><span>Event timestamp</span><b>{selectedTrace.at}</b></p><p><span>Elapsed time</span><b>{selectedTrace.elapsedMs} ms</b></p></div><aside><small>RUN ID</small><code>{result.runId}</code><em>{result.audit.status}</em></aside></div>}
  </div>;
}

function ModelEvidencePanel({result,inputs}:{result:Prediction;inputs:Inputs}){
  const sensitivity=(result.modelTrace.inputSensitivity||[]).slice(0,6);
  const nearest=result.modelTrace.nearestScenarios||[];
  return <section className="model-evidence-panel" aria-label="Completed AI model evidence">
    <header><div><small>EXPLAINABLE AI</small><h2>What the model did with this run</h2><p>Returned execution trace and model diagnostics.</p></div><span><i/>Calculation returned</span></header>
    <CompletedWorkflowCanvas result={result} inputs={inputs}/>
    <div className="evidence-grid">
      <section className="sensitivity-card"><div className="evidence-card-title"><div><small>INPUT RESPONSE CHECK</small><h3>Which profile values moved the model most?</h3></div><span>Local model re-runs</span></div><p className="evidence-help">Each bar comes from re-running the model slightly above and below the server-owned profile value. It is a local response check, not a claim of physical causation.</p><div className="sensitivity-bars">{sensitivity.map((item,index)=><div key={item.label}><span><b>{index+1}. {item.label}</b><small>{item.direction==="scenario switch"?"Compared across feedstock categories":`${item.direction==="increase"?"Higher":"Lower"} test produced the larger result`}</small></span><i><b style={{width:`${Math.max(4,item.strength)}%`}}/></i><strong>{format(item.response)}<small>m³/day response</small></strong></div>)}</div></section>
      <aside className="scenario-evidence-card"><div className="evidence-card-title"><div><small>DATA MATCH</small><h3>Supplied scenarios used</h3></div><span>{result.modelTrace.scenarioCount} anchors</span></div><div className="scenario-match-list">{nearest.map((scenario,index)=><div key={scenario.anchor}><span>{index+1}</span><p><b>{scenario.anchor}</b><small>{scenario.feedstock}</small></p><em>{index===0?"Closest match":"Supporting match"}</em></div>)}</div><dl><div><dt>Algorithm</dt><dd>{result.modelTrace.algorithm}</dd></div><div><dt>Optimizer sampling</dt><dd>{result.modelTrace.optimization.candidateCount} candidates</dd></div><div><dt>Selected rank</dt><dd>#{result.modelTrace.optimization.selectedRank}</dd></div><div><dt>Execution</dt><dd>{result.runId.split("-")[0].toUpperCase()}</dd></div></dl></aside>
    </div>
    <footer><div><span>INPUTS</span><i/> <span>SCENARIO MATCHING</span><i/> <span>BASELINE</span><i/> <span>OPTIMIZED OUTPUTS</span><i/> <span>RECOMMENDATIONS</span></div><p>Operator review is still required before changing real plant equipment.</p></footer>
  </section>;
}

function EmptyResult(){return <div className="empty-result"><span>1</span><i>→</i><span>2</span><i>→</i><span>3</span><div><b>Enter inputs</b><b>Run calculation</b><b>Compare results</b></div><p>No placeholder numbers are shown. Results appear only after the model runs.</p></div>}
function Working(){return <div className="working"><span className="agent-orb">✦</span><h2>AI Analysis Center is running</h2><p>Awaiting the server response.</p><div><i/><i/><i/></div></div>}

function Copilot({messages,question,busy,result,onQuestion,onAsk,onClose}:{messages:{role:"ai"|"user";text:string}[];question:string;busy:boolean;result:Prediction|null;onQuestion:(v:string)=>void;onAsk:(e?:FormEvent)=>void;onClose:()=>void}){
  return <aside className="chat-panel"><header><div><small>DATA-AWARE ASSISTANT</small><h2>Aqua Copilot</h2></div><button onClick={onClose}>×</button></header><div className="chat-context"><span>{result?`Ready to explain run ${result.runId.split("-")[0].toUpperCase()}`:"Run AI optimization for a specific answer"}</span></div><div className="chat-messages">{messages.map((message,index)=><div key={index} className={message.role}>{message.text}</div>)}{busy&&<div className="ai">Thinking…</div>}</div><form onSubmit={onAsk}><input value={question} onChange={event=>onQuestion(event.target.value)} placeholder="Ask what changed or why…"/><button disabled={busy||!question.trim()}>↑</button></form></aside>;
}

function format(value:number){return Math.abs(value)>=100?value.toFixed(0):Math.abs(value)>=10?value.toFixed(1):value.toFixed(2)}
function formatPeriodValue(value:number){return Math.abs(value)>=1_000_000?`${(value/1_000_000).toFixed(2)}M`:Math.abs(value)>=10_000?Math.round(value).toLocaleString("en-US"):format(value)}
