"use client";

import { FormEvent, useEffect, useState } from "react";

type Inputs = {
  feedstock:string; feedRate:number; temperature:number; ph:number; olr:number;
  hrt:number; codIn:number; vfa:number; mixing:number;
};
type PlantOutput = {
  gasFlow:number; biogas:number; methanePct:number; methane:number; electricity:number;
  generatorKw:number; carbon:number; co2Pct:number; h2s:number;
};
type Recommendation = {
  title:string; detail:string; parameter:string; current:number; target:number; unit:string;
};
type EquipmentState = {label:string;state:string;detail:string;mode:string;tone:string};
type ModelTrace = {
  executionId:string; executedAt:string; endpoint:string; algorithm:string; implementation:string;
  randomized:boolean; inputCount:number; scenarioCount:number; coverageRows:number; status:string;
  stages:{label:string;status:string;detail:string;tool?:string}[];
  nearestScenarios:{anchor:string;feedstock:string;distance:number;weight:number}[];
  featureInfluence:{label:string;contribution:number;interpretation:string}[];
  inputSensitivity:{label:string;response:number;direction:string;step:number;unit:string;strength:number}[];
  limitations:string[];
};
type Prediction = {
  biogas:number; methane:number; electricity:number; pressure:number; h2s:number; bestSetpoints:Omit<Inputs,"feedstock">;
  recommendations:Recommendation[]; baseline:PlantOutput; optimized:PlantOutput;
  recommendedProjection:{biogas:number;methane:number;electricity:number;biogasChange:number;methaneChange:number;electricityChange:number;basis:string};
  equipmentStates:EquipmentState[];
  modelName:string; modelVersion:string; modelFit:string; outOfRange:boolean; extrapolatedInputs?:string[];
  runId:string; createdAt:string; agentMessage:string;
  hourlyForecast:{hour:number;biogas:number;electricity:number;baselineBiogas:number;baselineElectricity:number;ch4:number;co2:number;h2s:number}[];
  modelCurves:{source:string;current:{hrt:number;ph:number;biogas:number;methane:number;electricity:number};hrt:ModelCurvePoint[];ph:ModelCurvePoint[]};
  modelTrace:ModelTrace;
  audit:{saved:boolean;status:string};
};
type ModelCurvePoint = {input:number;biogas:number;methane:number;electricity:number};
type AuthUser = {username:string;role:"admin"|"user"};
type OutputKey = "biogas"|"methane"|"electricity";
type RunRecord = {id:string;time:string;inputs:Inputs;result:Prediction};
type AdminSettings = {
  methaneMinimum:number; h2sWarning:number; pressureMinimum:number; pressureMaximum:number;
  facilityName:string; facilityLocation:string;
};
type AuditEvaluation = {
  evaluationDate:string; manifestFingerprint:string; evaluatedModels:string[];
  optimizationAnchorResults:{model:string;nmae:number;gasMae:number;methaneMae:number;powerMae:number;role:string;artifact?:string;artifactSha256?:string}[];
  selection:{numericalWinner:string;numericalWinnerNmae:number;deployedModel:string;deployedModelNmae:number;reason:string;neuralNetworkDecision:string;approvalRequired?:boolean};
  dataAudit:{shortHrtRows:number;candidateModels:number;validationFolds:number;realPlantRows:number;projectedRowsUsedForTraining:boolean;sourceClassification:string;missingCoverage:string};
  limitations:string[];
  runtime?:{implementation?:string;artifacts?:Record<string,string>;frameworkVersions?:Record<string,string>};
  liveEvidence:{inferenceEndpoint:string;modelCardEndpoint:string;evaluationEndpoint:string;auditEndpoint:string;kpiReportEndpoint?:string;implementation:string;deterministic:boolean};
};
type AuditModelData = {
  model:{name:string;version:string;fit:string;inputMode:string};
  card:{algorithm:string;implementation:string;status:string;randomized:boolean;inputCount:number;scenarioCount:number;coverageRows:number;features:{key:string;label:string;unit:string;range:string;role:string}[];limitations:string[]};
};
type AuditRun = {id:string;created_at:number;username:string;role:string;feedstock:string;model_version:string;audit_status:string};
type BatchPreview = {scenario_id:string;rank:number;source_run_id?:string;candidate_profile?:string;feedstock:string;feed_rate_kg_vs_day:number;temperature_c:number;ph:number;olr_kg_vs_m3_day:number;hrt_days:number;hrt_hours:number;cod_in_mg_l:number;vfa_mg_l:number;mixer_rpm:number;baseline_biogas_m3_day:number;baseline_methane_m3_day:number;baseline_electricity_kwh_day:number;optimized_biogas_m3_day:number;methane_m3_day:number;electricity_kwh_day:number;co2_fraction_pct:number;estimated_co2e_avoided_kg_day:number;h2s_before_ppm:number;h2s_ppm:number;h2s_removed_ppm:number;scenario_coverage_score:number;biogas_increase_pct:number;ch4_content_pct:number;ai_model_coverage_pct:number;process_stability_estimate_pct:number;is_farmer_input:boolean;ai_recommendation:string};
type ShortHrtInputs = {feedRate:number;temperature:number;ph:number;olr:number;hrtHours:number};
type ModelledDailyProjectionRow = {modelled_day:number;source_conditions_aggregated:number;baseline_biogas_m3_day:number;optimized_biogas_m3_day:number;baseline_methane_m3_day:number;optimized_methane_m3_day:number;baseline_electricity_kwh_day:number;optimized_electricity_kwh_day:number;h2s_removed_ppm:number;estimated_co2e_avoided_kg_day:number;model_coverage_pct:number;process_stability_estimate_pct:number};
type ModelledMonthlyProjectionRow = {modelled_month:number;month_label:string;source_conditions_aggregated:number;baseline_biogas_m3:number;optimized_biogas_m3:number;baseline_methane_m3:number;optimized_methane_m3:number;baseline_electricity_kwh:number;optimized_electricity_kwh:number;biogas_increase_pct:number;h2s_removed_ppm:number;estimated_co2e_avoided_kg:number};
type BatchProjection = {basis:string;sourceRows:number;selectedCandidates:number;dailyMean:{baselineBiogasM3Day:number;optimizedBiogasM3Day:number;baselineMethaneM3Day:number;optimizedMethaneM3Day:number;baselineElectricityKwhDay:number;optimizedElectricityKwhDay:number;h2sRemovedPpm:number;estimatedCo2eAvoidedKgDay:number;modelCoveragePct:number;processStabilityEstimatePct:number};dailyRows:ModelledDailyProjectionRow[];monthlyRows:ModelledMonthlyProjectionRow[];monthlyEquivalent:{baselineBiogasM3:number;optimizedBiogasM3:number;baselineMethaneM3:number;optimizedMethaneM3:number;baselineElectricityKwh:number;optimizedElectricityKwh:number;estimatedCo2eAvoidedKg:number};annualized:{baselineBiogasM3:number;optimizedBiogasM3:number;baselineMethaneM3:number;optimizedMethaneM3:number;baselineElectricityKwh:number;optimizedElectricityKwh:number;estimatedCo2eAvoidedKg:number}};
type BatchSummary = {totalRows:number;inputCount:number;sourceInput:Inputs;shortHrtInput?:ShortHrtInputs;farmerInput:{baselineBiogasM3Day:number;optimizedBiogasM3Day:number;methaneM3Day:number;electricityKwhDay:number};bestScenario:BatchPreview;bestVsFarmer:{biogasM3Day:number;methaneM3Day:number;electricityKwhDay:number;hrtHours:number};withinNormalModelCoverage:number;sourceNote:string;safetyNote:string;projection?:BatchProjection};
type BatchWorkflowStage = {label:string;detail:string};
type BatchResult = {id:string;createdAt:string;persisted:boolean;persistence:"supabase"|"volatile";definition:{cohort:"farm_optimization"|"hours_research"|"under_6_hours"|"short_hrt_batch";rowCount:number;schemaVersion:string;baseInput:Inputs;shortHrtInput?:ShortHrtInputs};summary:BatchSummary;preview:BatchPreview[];workflow?:BatchWorkflowStage[];notes:string[]};
type BatchReportRecord = {id:string;created_at:number;username:string;role:string;cohort:string;row_count:number;model_version:string;audit_status:string;definition:{cohort:string;rowCount:number};summary:BatchSummary};
type KpiAggregate = {period:string;observations:number;biogasM3Day:number;methaneM3Day:number;electricityKwhDay:number;methanePct:number;co2Pct:number;h2sPpm:number;sources:{modelledPrediction:number;csvImport:number}};

const initial:Inputs = {
  feedstock:"Dairy WW", feedRate:871, temperature:37, ph:6.91, olr:4.57,
  hrt:24, codIn:7000, vfa:1100, mixing:50,
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
  const [inputs,setInputs]=useState(initial);
  const [result,setResult]=useState<Prediction|null>(null);
  const [lastRunInputs,setLastRunInputs]=useState<Inputs|null>(null);
  const [runs,setRuns]=useState<RunRecord[]>([]);
  const [activeOutput,setActiveOutput]=useState<OutputKey>("biogas");
  const [workspaceView,setWorkspaceView]=useState<"overview"|OutputKey|"audit"|"batch"|"kpi">("overview");
  const [loading,setLoading]=useState(false);
  const [analysisStage,setAnalysisStage]=useState(0);
  const [analysisPaused,setAnalysisPaused]=useState(false);
  const [predictionError,setPredictionError]=useState("");
  const [chatOpen,setChatOpen]=useState(false);
  const [question,setQuestion]=useState("");
  const [chatBusy,setChatBusy]=useState(false);
  const [messages,setMessages]=useState<{role:"ai"|"user";text:string}[]>([{role:"ai",text:"Run a calculation, then ask me what changed or which plant value to adjust next."}]);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [settings,setSettings]=useState<AdminSettings|null>(null);
  const [settingsMessage,setSettingsMessage]=useState("");

  useEffect(()=>{void (async()=>{try{const response=await fetch("/api/auth/session",{cache:"no-store"});if(response.ok)setAuth((await response.json()).user);}finally{setChecking(false);}})();},[]);
  useEffect(()=>{
    if(!loading||analysisPaused||analysisStage>=7)return;
    const timer=window.setTimeout(()=>setAnalysisStage(current=>Math.min(7,current+1)),750);
    return()=>window.clearTimeout(timer);
  },[loading,analysisPaused,analysisStage]);

  const dirty=Boolean(result&&lastRunInputs&&JSON.stringify(inputs)!==JSON.stringify(lastRunInputs));

  const update=(key:keyof Inputs,value:string)=>setInputs(current=>({...current,[key]:key==="feedstock"?value:Number(value)}));

  async function login(event:FormEvent){
    event.preventDefault();setLoginBusy(true);setLoginError("");
    try{const response=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Login failed");setAuth(data.user);setPassword("");}
    catch(error){setLoginError(error instanceof Error?error.message:"Login failed");}
    finally{setLoginBusy(false);}
  }

  async function logout(){try{await fetch("/api/auth/logout",{method:"POST"});}finally{setAuth(null);setResult(null);setRuns([]);setSettingsOpen(false);setChatOpen(false);setWorkspaceView("overview");}}

  async function predict(submittedInputs:Inputs=inputs){
    setAnalysisStage(0);setAnalysisPaused(false);setLoading(true);setPredictionError("");
    try{
      const previousRun=result&&lastRunInputs?{prediction:result,inputs:lastRunInputs}:null;
      const [response]=await Promise.all([
        fetch("/api/predict",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...submittedInputs,previousRun})}),
        new Promise(resolve=>setTimeout(resolve,6500)),
      ]);
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Prediction service is unavailable");
      setResult(data);setLastRunInputs({...submittedInputs});
      setRuns(current=>[{id:data.runId,time:new Date(data.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),inputs:{...submittedInputs},result:data},...current].slice(0,8));
    }catch(error){setPredictionError(error instanceof Error?error.message:"Prediction failed");}
    finally{setLoading(false);}
  }

  async function ask(event?:FormEvent){
    event?.preventDefault();const text=question.trim();if(!text||chatBusy)return;
    const next=[...messages,{role:"user" as const,text}];setMessages(next);setQuestion("");setChatBusy(true);
    try{const response=await fetch("/api/copilot",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:text,inputs,prediction:result,history:next})});const data=await response.json();setMessages(current=>[...current,{role:"ai",text:response.ok?data.answer:(data.error||"I could not answer that right now.")}]);}
    catch{setMessages(current=>[...current,{role:"ai",text:"I could not reach the assistant. Your calculation is still available on the dashboard."}]);}
    finally{setChatBusy(false);}
  }

  async function openSettings(){
    if(auth?.role!=="admin")return;
    setSettingsOpen(true);setSettingsMessage("");
    const response=await fetch("/api/settings",{cache:"no-store"});if(response.ok)setSettings((await response.json()).settings);
  }

  async function saveSettings(event:FormEvent){
    event.preventDefault();if(!settings)return;
    const response=await fetch("/api/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(settings)});
    setSettingsMessage(response.ok?"Settings saved.":"Settings could not be saved.");
  }

  function openOverviewSection(id?:string){
    setWorkspaceView("overview");
    window.setTimeout(()=>document.getElementById(id||"overview")?.scrollIntoView(),0);
  }

  if(checking)return <main className="loading-screen"><span>◒</span><b>Opening dashboard…</b></main>;
  if(!auth)return <LoginScreen username={username} password={password} error={loginError} busy={loginBusy} onUsername={setUsername} onPassword={setPassword} onSubmit={login}/>;

  return <OperationsDashboard auth={auth} onLogout={()=>void logout()}/>;

}

type OperationsTab="overview"|"optimizer"|"workflow"|"reports"|"audit";

function OperationsDashboard({auth,onLogout,onSettings}:{auth:AuthUser;onLogout:()=>void;onSettings?:()=>void}){
  const stages:BatchWorkflowStage[]=[
    {label:"Read online conditions",detail:"Read the modelled online operating conditions. Physical IoT sensors are not connected in this prototype."},
    {label:"Validate plant values",detail:"Check feed rate, temperature, pH, OLR and HRT in hours for every operating condition."},
    {label:"Prepare model features",detail:"Transform the five operational values into the format used by the deployed prediction model."},
    {label:"Calculate baseline",detail:"Calculate a condition-specific baseline so the AI result has a fair comparison point."},
    {label:"Create AI candidates",detail:"Create bounded alternative operating setpoints from each online condition."},
    {label:"Run production model",detail:"Run every candidate through the deployed deterministic short-HRT Ridge model."},
    {label:"Calculate six KPIs",detail:"Build biogas, methane, electricity, H₂S removal and CO₂e output values."},
    {label:"Build reports",detail:"Rank options, prepare the daily and monthly modelled reports, and save audit evidence when storage is available."},
  ];
  const [tab,setTab]=useState<OperationsTab>("overview");
  const [report,setReport]=useState<BatchResult|null>(null);
  const [pendingReport,setPendingReport]=useState<BatchResult|null>(null);
  const [working,setWorking]=useState(false);
  const [paused,setPaused]=useState(false);
  const [stage,setStage]=useState(0);
  const [selectedStage,setSelectedStage]=useState(0);
  const [approved,setApproved]=useState(false);
  const [metric,setMetric]=useState<"biogas"|"methane"|"electricity">("methane");
  const [message,setMessage]=useState("");

  useEffect(()=>{void (async()=>{
    try{
      const response=await fetch("/api/reports/batch?limit=1",{cache:"no-store"});
      const data=await response.json();
      const latest=data.reports?.[0] as BatchReportRecord|undefined;
      if(latest?.summary) setReport({id:latest.id,createdAt:new Date(latest.created_at).toISOString(),persisted:data.persistence==="supabase",persistence:data.persistence==="supabase"?"supabase":"volatile",definition:latest.definition as BatchResult["definition"],summary:latest.summary,preview:[],workflow:stages,notes:[]});
    }catch{/* The dashboard can still run a new model calculation. */}
  })();},[]);

  useEffect(()=>{
    if(!working||paused)return;
    if(stage<stages.length-1){
      const timer=window.setTimeout(()=>setStage(current=>Math.min(stages.length-1,current+1)),760);
      return()=>window.clearTimeout(timer);
    }
    if(pendingReport){
      const timer=window.setTimeout(()=>{setReport(pendingReport);setPendingReport(null);setWorking(false);setApproved(false);setMessage("2,000 new deterministic model calculations are ready to review and export.");},650);
      return()=>window.clearTimeout(timer);
    }
  },[working,paused,stage,pendingReport,stages.length]);

  async function generate(){
    if(working)return;
    setTab("workflow");setWorking(true);setPaused(false);setStage(0);setSelectedStage(0);setPendingReport(null);setMessage("");setApproved(false);
    try{
      const [response]=await Promise.all([
        fetch("/api/reports/batch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cohort:"short_hrt_batch",rowCount:2000})}),
        new Promise(resolve=>window.setTimeout(resolve,6000)),
      ]);
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"The AI calculation could not be completed.");
      setPendingReport(data as BatchResult);
    }catch(error){setWorking(false);setMessage(error instanceof Error?error.message:"The AI calculation could not be completed.");}
  }

  const projection=report?.summary.projection;
  const daily=projection?.dailyMean;
  const annual=projection?.annualized;
  const best=report?.summary.bestScenario;
  const start=report?.definition.shortHrtInput;
  const displayStage=working?stage:report?stages.length-1:0;
  const graphValue=(row:ModelledMonthlyProjectionRow,kind:"baseline"|"ai")=>metric==="biogas"?(kind==="baseline"?row.baseline_biogas_m3:row.optimized_biogas_m3):metric==="methane"?(kind==="baseline"?row.baseline_methane_m3:row.optimized_methane_m3):(kind==="baseline"?row.baseline_electricity_kwh:row.optimized_electricity_kwh);
  const graphMax=Math.max(1,...(projection?.monthlyRows.flatMap(row=>[graphValue(row,"baseline"),graphValue(row,"ai")])||[1]));
  const metricName=metric==="methane"?"Methane":metric==="electricity"?"Electricity":"Biogas";
  const metricUnit=metric==="electricity"?"kWh / 30 modelled days":metric==="methane"?"m³ CH₄ / 30 modelled days":"m³ / 30 modelled days";
  const kpis=[
    ["Baseline biogas",daily?.baselineBiogasM3Day,"m³/day","baseline"],
    ["AI biogas",daily?.optimizedBiogasM3Day,"m³/day","ai"],
    ["AI methane",daily?.optimizedMethaneM3Day,"m³ CH₄/day","ai"],
    ["AI electricity",daily?.optimizedElectricityKwhDay,"kWh/day","power"],
    ["H₂S removed",daily?.h2sRemovedPpm,"ppm","safety"],
    ["CO₂e avoided",daily?.estimatedCo2eAvoidedKgDay,"kg/day","climate"],
  ] as const;
  const adjustments=best&&start?[
    ["Feed rate",start.feedRate,best.feed_rate_kg_vs_day,"kg VS/day"],
    ["Temperature",start.temperature,best.temperature_c,"°C"],
    ["pH",start.ph,best.ph,""],
    ["OLR",start.olr,best.olr_kg_vs_m3_day,"kg VS/m³·d"],
    ["HRT",start.hrtHours,best.hrt_hours,"hours"],
  ] as const:[];

  return <main className="ops-shell">
    <aside className="ops-sidebar">
      <div className="ops-brand"><span>◒</span><div><b>AQUAIVOLT</b><small>WASTEWATER TO OPTIMIZED ENERGY</small></div></div>
      <nav aria-label="Dashboard navigation">
        <button className={tab==="overview"?"active":""} onClick={()=>setTab("overview")}><span>▦</span>Overview</button>
        <button className={tab==="optimizer"?"active":""} onClick={()=>setTab("optimizer")}><span>✦</span>AI Optimizer</button>
        <button className={tab==="workflow"?"active":""} onClick={()=>setTab("workflow")}><span>◌</span>AI Workflow</button>
        <button className={tab==="reports"?"active":""} onClick={()=>setTab("reports")}><span>▤</span>Reports</button>
        {auth.role==="admin"&&<button className={tab==="audit"?"active":""} onClick={()=>setTab("audit")}><span>✓</span>Model audit</button>}
        {onSettings&&<button onClick={onSettings}><span>⚙</span>Settings</button>}
      </nav>
      <div className="ops-side-status"><i/><b>MODEL READY</b><span>Online reading mode</span><small>IoT/SCADA connector is reserved for future sensor integration.</small></div>
      <button className="ops-logout" onClick={onLogout}>Log out</button>
    </aside>

    <section className="ops-main">
      <header className="ops-header"><div><h1>AQUAIVOLT <span>— AI Wastewater-to-Energy Command Center</span></h1><p>Online-reading optimisation workspace</p></div><div><span className="ops-status"><i/>Plant model online</span><span className="ops-status"><i/>AI supervised</span><button onClick={()=>void generate()} disabled={working}>{working?"AI is working…":"Generate 2,000 AI outputs"}</button><div className="ops-user"><b>{auth.username.slice(0,2).toUpperCase()}</b><span>{auth.username}<small>{auth.role}</small></span></div></div></header>
      {message&&<div className={`ops-message ${message.includes("could not")?"error":""}`}>{message}</div>}

      {tab==="overview"&&<section className="ops-view ops-overview">
        <div className="ops-view-heading"><div><small>ONLINE-READING AI OPTIMISATION</small><h2>Production at a glance</h2><p>Run the deployed model to calculate all dashboard values.</p></div><button onClick={()=>void generate()} disabled={working}>{working?"AI calculation running…":"Run AI model"}</button></div>
        <div className="ops-kpi-grid">{kpis.map(([label,value,unit,tone])=><article key={label} className={`ops-kpi ${tone}`}><small>{label}</small><b>{value===undefined?"—":format(value)}</b><span>{value===undefined?"Run model":unit}</span></article>)}</div>
        <section className="ops-chart-card"><header><div><small>MODELLED COMPARISON</small><h2>Baseline vs AI-optimised {metricName}</h2><p>Each column is a 30-day modelled period generated by the online-reading calculation.</p></div><div className="ops-metric-tabs">{(["biogas","methane","electricity"] as const).map(item=><button key={item} className={metric===item?"active":""} onClick={()=>setMetric(item)}>{item[0].toUpperCase()+item.slice(1)}</button>)}</div></header>{projection?<><div className="ops-bar-chart">{projection.monthlyRows.map(row=><article key={row.modelled_month}><small>{row.month_label.slice(0,3)}</small><div><i className="baseline" style={{height:`${Math.max(4,graphValue(row,"baseline")/graphMax*100)}%`}}/><i className="ai" style={{height:`${Math.max(4,graphValue(row,"ai")/graphMax*100)}%`}}/></div></article>)}</div><footer><span><i className="baseline"/>Baseline</span><span><i className="ai"/>AI-optimised</span><b>{metricUnit}</b></footer></>:<div className="ops-chart-empty"><span>✦</span><b>Ready to calculate the modelled comparison</b><p>Generate the AI outputs to show values here.</p></div>}</section>
        <div className="ops-overview-bottom"><section className="ops-health-card"><header><small>PROCESS VALUES USED</small><b>Online-reading model</b></header>{best?<dl><div><dt>Feed rate</dt><dd>{format(best.feed_rate_kg_vs_day)} kg VS/day</dd></div><div><dt>Temperature</dt><dd>{format(best.temperature_c)} °C</dd></div><div><dt>pH</dt><dd>{format(best.ph)}</dd></div><div><dt>OLR</dt><dd>{format(best.olr_kg_vs_m3_day)} kg VS/m³·d</dd></div><div><dt>HRT</dt><dd>{format(best.hrt_hours)} hours</dd></div></dl>:<p>After calculation, the ranked AI operating condition is shown here.</p>}</section><section className="ops-insight-card"><small>AI RECOMMENDATION</small><h3>{best?"Use the top-ranked operating condition for review":"Recommendation is waiting"}</h3><p>{best?.ai_recommendation||"The AI recommendation will be calculated after the online-reading model runs."}</p><button onClick={()=>setTab("optimizer")} disabled={!best}>Review AI recommendation →</button></section><section className="ops-workflow-mini"><small>VISIBLE AI WORKFLOW</small><b>{working?`Running stage ${displayStage+1} of ${stages.length}`:report?"Completed and ready for audit":"Waiting to start"}</b><div>{stages.map((_,index)=><i key={index} className={index<=displayStage?"done":""}/>)}</div><button onClick={()=>setTab("workflow")}>Open workflow →</button></section></div>
      </section>}

      {tab==="optimizer"&&<section className="ops-view ops-optimizer"><div className="ops-view-heading"><div><small>AI OPTIMIZER</small><h2>Recommended operating action</h2><p>Every target comes from the highest-ranked deterministic model result.</p></div><button onClick={()=>void generate()} disabled={working}>Run again</button></div>{best&&start?<><section className="ops-recommendation"><div><small>EXPECTED AI OUTPUT</small><b>{format(best.optimized_biogas_m3_day)} <em>m³ biogas/day</em></b><span>AI methane {format(best.methane_m3_day)} m³ CH₄/day • electricity {format(best.electricity_kwh_day)} kWh/day</span></div><p>{best.ai_recommendation}</p><button className={approved?"approved":""} onClick={()=>setApproved(true)}>{approved?"AI action approved ✓":"Approve AI action"}</button></section><section className="ops-adjustment-table"><header><span>Parameter</span><span>Current</span><span>Recommended</span><span>Change</span></header>{adjustments.map(([label,current,target,unit])=><div key={label}><b>{label}</b><span>{format(current)} {unit}</span><strong>{format(target)} {unit}</strong><em>{target>current?"Increase":target<current?"Reduce":"Keep"}</em></div>)}</section><section className="ops-optimizer-footer"><article><small>MODEL ACTION</small><b>Advisory only</b><p>The recommendation changes no equipment. An operator must validate and apply any physical adjustment.</p></article><article><small>SHORT-HRT TARGET</small><b>{format(best.hrt_hours)} hours</b><p>The candidate score balances lower HRT with modelled biogas, methane and electricity production.</p></article><article><small>MODEL SCOPE</small><b>Five operating values</b><p>Feed rate, temperature, pH, OLR and HRT are the values evaluated by this deployed route.</p></article></section></>:<div className="ops-empty"><span>✦</span><h3>No AI recommendation yet</h3><p>Generate the 2,000 online-reading model outputs first.</p><button onClick={()=>void generate()}>Generate AI outputs</button></div>}</section>}

      {tab==="workflow"&&<section className="ops-view ops-workflow-view"><div className="ops-workflow-head"><div><small>{paused?"PAUSED AUDITOR VIEW":"LIVE AI + MODEL WORKFLOW"}</small><h2>AI execution is visible</h2><p>One stage at a time: online conditions → prediction model → KPI outputs → reports.</p></div><div><button onClick={()=>setPaused(current=>!current)} disabled={!working}>{paused?"▶ Resume workflow":"Ⅱ Pause workflow"}</button><b>{String(displayStage+1).padStart(2,"0")} <small>of {String(stages.length).padStart(2,"0")}</small></b></div></div><div className="ops-workflow-progress"><i style={{width:`${(displayStage+1)/stages.length*100}%`}}/></div><div className="ops-workflow-source"><span><i/>Online reading</span><b>Simulated operating conditions</b><em>IoT sensors can connect here in a future deployment.</em></div><div className="ops-nodes">{stages.map((item,index)=>{const state=index<displayStage?"done":index===displayStage?(working?(paused?"paused":"active"):report?"done":"ready"):"queued";return <button key={item.label} className={state} onClick={()=>setSelectedStage(index)}><span>{String(index+1).padStart(2,"0")}</span><b>{item.label}</b><small>{state==="done"?"Completed":state==="active"?"Running now":state==="paused"?"Paused for audit":state==="ready"?"Ready":"Waiting"}</small></button>;})}</div><section className="ops-node-detail"><span>{String(selectedStage+1).padStart(2,"0")}</span><div><small>IMPLEMENTED MODEL STAGE</small><h3>{stages[selectedStage].label}</h3><p>{stages[selectedStage].detail}</p></div><aside><small>LIVE STATUS</small><b>{working?(paused?"Workflow paused for auditor review":"Calculation in progress"):report?"Model run complete":"Ready to begin"}</b><p>{report?"The completed report is available in the Reports tab and can be exported as CSV.":"No output is displayed until the server returns the model calculation."}</p></aside></section><div className="ops-workflow-actions"><button onClick={()=>void generate()} disabled={working}>{working?"AI calculation running…":"Start 2,000 AI calculations"}</button>{report&&<button onClick={()=>setTab("reports")}>Open AI reports →</button>}</div></section>}

      {tab==="reports"&&<section className="ops-view ops-reports"><div className="ops-view-heading"><div><small>AI + KPI REPORT</small><h2>Daily and monthly modelled reports</h2><p>Exports contain the 2,000 calculated scenarios and the aggregated comparisons.</p></div><button onClick={()=>void generate()} disabled={working}>Generate new report</button></div>{report&&projection&&daily&&annual?<><div className="ops-report-widgets"><article><small>YEARLY BASELINE METHANE</small><b>{format(annual.baselineMethaneM3)} <em>m³ CH₄/year</em></b></article><article><small>YEARLY AI METHANE</small><b>{format(annual.optimizedMethaneM3)} <em>m³ CH₄/year</em></b></article><article><small>YEARLY BASELINE ELECTRICITY</small><b>{format(annual.baselineElectricityKwh)} <em>kWh/year</em></b></article><article><small>YEARLY AI ELECTRICITY</small><b>{format(annual.optimizedElectricityKwh)} <em>kWh/year</em></b></article></div><div className="ops-report-table"><header><span>Modelled period</span><span>Baseline biogas</span><span>AI biogas</span><span>AI methane</span><span>AI electricity</span><span>H₂S removed</span></header>{projection.monthlyRows.map(row=><div key={row.modelled_month}><b>{row.month_label}</b><span>{format(row.baseline_biogas_m3)} m³</span><strong>{format(row.optimized_biogas_m3)} m³</strong><span>{format(row.optimized_methane_m3)} m³</span><span>{format(row.optimized_electricity_kwh)} kWh</span><span>{format(row.h2s_removed_ppm)} ppm</span></div>)}</div><div className="ops-export-row"><a href={`/api/reports/batch?id=${report.id}&format=csv`}>Export 2,000 AI scenarios ↓</a><a href={`/api/reports/batch?id=${report.id}&format=daily`}>Export daily comparison ↓</a><a href={`/api/reports/batch?id=${report.id}&format=projection`}>Export 12-month comparison ↓</a></div></>:<div className="ops-empty"><span>▤</span><h3>No generated report yet</h3><p>Run the online-reading AI model to create reports and exports.</p><button onClick={()=>void generate()}>Generate AI report</button></div>}</section>}

      {tab==="audit"&&<section className="ops-view ops-audit"><div className="ops-view-heading"><div><small>MODEL AUDIT</small><h2>Auditor-ready model evidence</h2><p>Technical facts for the implemented online-reading calculation.</p></div><button onClick={()=>setTab("workflow")}>Inspect workflow</button></div><div className="ops-audit-grid"><article><small>MODEL</small><b>Quadratic Ridge regression</b><p>Deterministic deployed coefficients evaluate five operating values for every candidate.</p></article><article><small>AI ORCHESTRATION</small><b>LangGraph StateGraph</b><p>Validates values, prepares features, calculates baseline, ranks candidates and records an audit trace.</p></article><article><small>RUNTIME OUTPUT</small><b>2,000 new calculations</b><p>Each output is calculated by the server model; workbook target cells are excluded from inference.</p></article><article><small>OPERATING LIMIT</small><b>Decision support only</b><p>IoT/SCADA control is not connected. Operator review is required before plant changes.</p></article></div>{report?<section className="ops-audit-run"><div><small>LATEST REPORT</small><b>{report.id}</b><span>{new Date(report.createdAt).toLocaleString()}</span></div><div><small>STATUS</small><b>{report.persisted?"Saved server-side":"Temporary server report"}</b><span>{report.summary.totalRows.toLocaleString()} calculated candidates</span></div><div><small>MODEL RESULT</small><b>{format(report.summary.bestScenario.optimized_biogas_m3_day)} m³/day biogas</b><span>Highest-ranked option</span></div></section>:<div className="ops-empty compact"><span>✓</span><h3>Run a report to create audit evidence</h3><p>The execution record and CSV exports appear after a model run.</p></div>}<div className="ops-audit-links"><a href="/api/model" target="_blank">Open model card JSON ↗</a><a href="/api/evaluation" target="_blank">Open model evaluation JSON ↗</a><a href="/api/audit?format=csv" download>Download server audit log ↓</a></div></section>}
    </section>
  </main>;
}

function LoginScreen({username,password,error,busy,onUsername,onPassword,onSubmit}:{username:string;password:string;error:string;busy:boolean;onUsername:(v:string)=>void;onPassword:(v:string)=>void;onSubmit:(e:FormEvent)=>void}){
  return <main className="login-page"><section className="login-story"><small className="login-story-kicker">SECURE BIODIGESTER MODEL</small><div><small>AI BIOGAS PLATFORM</small><h1>Biogas production.<br/>Emission reduction.</h1><p>Understand modeled biogas output and estimated emissions avoided from each calculation.</p></div><em>Synthetic scenario prototype • Human approval required</em></section><section className="login-form-wrap"><form onSubmit={onSubmit}><span className="login-icon">✦</span><small>SECURE ACCESS</small><h2>Sign in</h2><p>Use your administrator or user account.</p><label><span>Username</span><input value={username} onChange={event=>onUsername(event.target.value)} autoComplete="username" required/></label><label><span>Password</span><input type="password" value={password} onChange={event=>onPassword(event.target.value)} autoComplete="current-password" required/></label>{error&&<div className="login-error">{error}</div>}<button disabled={busy}>{busy?"Checking…":"Continue →"}</button></form></section></main>;
}

function ModelAuditPage({result,runInputs,loading,onVerify,onOverview}:{result:Prediction|null;runInputs:Inputs|null;loading:boolean;onVerify:()=>void;onOverview:()=>void}){
  const [modelData,setModelData]=useState<AuditModelData|null>(null);
  const [evaluation,setEvaluation]=useState<AuditEvaluation|null>(null);
  const [auditRuns,setAuditRuns]=useState<AuditRun[]>([]);
  const [auditPersistence,setAuditPersistence]=useState<"checking"|"supabase"|"volatile">("checking");
  const [loadError,setLoadError]=useState("");
  useEffect(()=>{void (async()=>{
    try{
      const [modelResponse,evaluationResponse,auditResponse]=await Promise.all([
        fetch("/api/model",{cache:"no-store"}),fetch("/api/evaluation",{cache:"no-store"}),fetch("/api/audit?limit=12",{cache:"no-store"}),
      ]);
      if(!modelResponse.ok||!evaluationResponse.ok||!auditResponse.ok)throw new Error("Auditor evidence could not be loaded");
      const auditData=await auditResponse.json();
      setModelData(await modelResponse.json());setEvaluation(await evaluationResponse.json());setAuditRuns(auditData.runs||[]);setAuditPersistence(auditData.persistence==="supabase"?"supabase":"volatile");
    }catch(error){setLoadError(error instanceof Error?error.message:"Auditor evidence could not be loaded");}
  })();},[result]);
  const trace=result?.modelTrace;
  const latestInputs=runInputs;
  const anchorMax=Math.max(1,...(evaluation?.optimizationAnchorResults.map(item=>item.nmae)||[1]));
  return <div className="audit-workspace">
    <header className="audit-header"><button onClick={onOverview}>← Dashboard</button><div><small>ADMIN • AUDITOR EVIDENCE</small><h1>Model and AI audit center</h1><p>Live backend proof, evaluation results and execution evidence in one place.</p></div><span><i/>Server model available</span></header>
    <div className="audit-truth"><b>What this proves</b><span>The application invokes a server-side LangGraph StateGraph, processes five short-HRT plant values, runs the exported Ridge model, searches bounded lower-HRT candidates and records a deterministic execution trace.</span><em>Operator review remains required before a real plant adjustment.</em></div>
    {loadError&&<div className="audit-error">{loadError}</div>}

    <section className="audit-status-grid">
      <article><small>INFERENCE ENDPOINT</small><b>POST /api/predict</b><span>Live server calculation</span></article>
      <article><small>MODEL VERSION</small><b>{modelData?.model.version||result?.modelVersion||"Loading"}</b><span>{modelData?.model.name||result?.modelName||"Model metadata"}</span></article>
      <article><small>MODEL VALUES PROCESSED</small><b>{modelData?.card.inputCount??5} trained features</b><span>Every entered plant value is processed</span></article>
      <article><small>RANDOM VALUES</small><b>{modelData?.card.randomized===false?"Not used":"Checking"}</b><span>Identical plant conditions return identical outputs</span></article>
    </section>

    <section className="audit-live-section">
      <div className="audit-section-title"><div><small>LIVE VERIFICATION</small><h2>Run the actual backend in front of the auditor</h2><p>This button calls the same endpoint used by the production dashboard.</p></div><button disabled={loading} onClick={onVerify}>{loading?"Backend is calculating…":result?"Run verification again →":"Run verification calculation →"}</button></div>
      {result&&trace&&latestInputs?<div className="audit-live-grid">
        <article className="audit-execution-card"><header><div><small>EXECUTION COMPLETE</small><h3>{trace.executionId}</h3></div><span>VERIFIED</span></header><dl><div><dt>Executed</dt><dd>{new Date(trace.executedAt).toLocaleString()}</dd></div><div><dt>Endpoint</dt><dd>{trace.endpoint}</dd></div><div><dt>Implementation</dt><dd>{trace.implementation}</dd></div><div><dt>Algorithm</dt><dd>{trace.algorithm}</dd></div></dl><div className="audit-input-proof"><b>Five submitted plant values</b><p>{format(latestInputs.feedRate)} kg VS/d • {format(latestInputs.temperature)} °C • pH {format(latestInputs.ph)} • OLR {format(latestInputs.olr)} • HRT {format(latestInputs.hrt)} hours</p></div></article>
        <article className="audit-output-proof"><small>RETURNED OUTPUTS</small><div><span>Biogas<b>{format(result.optimized.biogas)} m³/day</b></span><span>Methane<b>{format(result.optimized.methane)} m³ CH₄/day</b></span><span>Electricity<b>{format(result.optimized.electricity)} kWh/day</b></span></div><p>Run ID in the interface and execution ID in the server trace are the same: <b>{result.runId}</b></p></article>
        <article className="audit-stage-proof"><small>SERVER EXECUTION TRACE</small>{trace.stages.map((stage,index)=><div key={stage.label}><span>✓</span><p><b>{String(index+1).padStart(2,"0")} {stage.label}</b><small>{stage.detail}</small></p></div>)}</article>
        <article className="audit-pattern-proof"><small>NEAREST SUPPLIED PATTERNS</small>{trace.nearestScenarios.map(item=><div key={item.anchor}><span>{item.anchor}</span><p><b>{item.feedstock}</b><small>Distance {item.distance}</small></p><em>{item.weight}% weight</em></div>)}</article>
      </div>:<div className="audit-waiting"><span>◎</span><b>No verification run yet</b><p>Select Run verification calculation to create an execution ID, process the five short-HRT plant values and display the returned server evidence.</p></div>}
    </section>

    <section className="audit-evaluation-section">
      <div className="audit-section-title"><div><small>MODEL COMPARISON</small><h2>What was evaluated and why this model was retained</h2><p>Lower normalized MAE is better. Every candidate is evaluated with the same reproducible five-fold split.</p></div><span>{evaluation?`${evaluation.evaluatedModels.length} approaches evaluated`:"Loading evaluation"}</span></div>
      {evaluation&&<div className="audit-evaluation-grid"><div className="audit-ranking"><header><span>Model</span><span>5-fold NMAE</span></header>{evaluation.optimizationAnchorResults.map(item=><div key={item.model} className={item.model===evaluation.selection.deployedModel?"deployed":item.model===evaluation.selection.numericalWinner?"winner":""}><p><b>{item.model}</b><small>{item.role}{item.artifact?` • ${item.artifact}`:""}</small></p><i><b style={{width:`${Math.max(4,item.nmae/anchorMax*100)}%`}}/></i><strong>{item.nmae.toFixed(3)}</strong></div>)}</div><aside className="audit-selection"><small>SELECTION DECISION</small><h3>Numerical winner</h3><b>{evaluation.selection.numericalWinner} • {evaluation.selection.numericalWinnerNmae.toFixed(3)}</b><h3>Deployed model</h3><b>{evaluation.selection.deployedModel} • {evaluation.selection.deployedModelNmae.toFixed(3)}</b><p>{evaluation.selection.reason}.</p><em>{evaluation.selection.neuralNetworkDecision}.</em></aside></div>}
    </section>

    <section className="audit-provenance">
      <div><small>DATA PROVENANCE</small><h2>Dataset facts shown honestly</h2><div className="audit-fact-grid"><article><b>{evaluation?.dataAudit.shortHrtRows??"—"}</b><span>supplied short-HRT synthetic rows</span></article><article><b>{evaluation?.dataAudit.candidateModels??"—"}</b><span>candidate ML models evaluated</span></article><article><b>{evaluation?.dataAudit.validationFolds??"—"}</b><span>cross-validation folds</span></article><article><b>{evaluation?.dataAudit.realPlantRows??"—"}</b><span>real plant rows supplied</span></article></div><p>{evaluation?.dataAudit.sourceClassification}</p><em>{evaluation?.dataAudit.missingCoverage}</em></div>
      <aside><small>DOWNLOADABLE AUDIT EVIDENCE</small><a href="/api/model" target="_blank">Open model card JSON <span>↗</span></a><a href="/api/evaluation" target="_blank">Open evaluation JSON <span>↗</span></a><a href="/api/audit?format=csv" download>Download server run log CSV <span>↓</span></a><a href="/api/reports/kpi?period=day" target="_blank">Open daily KPI report JSON <span>↗</span></a><p>Manifest fingerprint</p><code>{evaluation?.manifestFingerprint||"Loading…"}</code><em>{auditPersistence==="supabase"?"Supabase persistence is active. Plant values, outputs and execution traces are saved server-side.":auditPersistence==="checking"?"Checking durable report storage…":"Report storage is not configured; this serverless log is volatile."}</em></aside>
    </section>

    <section className="audit-run-log"><div className="audit-section-title"><div><small>RECENT SERVER RUNS</small><h2>Audit log returned by the backend</h2></div><span>{auditPersistence==="supabase"?"Supabase report store":"Volatile demo store"} • {auditRuns.length} run{auditRuns.length===1?"":"s"}</span></div>{auditRuns.length?<div className="audit-run-table"><div><span>Run ID</span><span>Time</span><span>Operator</span><span>Feedstock</span><span>Model</span><span>Status</span></div>{auditRuns.map(run=><div key={run.id}><b>{run.id.slice(0,12)}</b><span>{new Date(Number(run.created_at)).toLocaleString()}</span><span>{run.username} ({run.role})</span><span>{run.feedstock}</span><span>{run.model_version}</span><em>{run.audit_status}</em></div>)}</div>:<div className="audit-empty-log">No saved report is available yet. Run the live verification calculation; when Supabase is active, its plant values, outputs and trace will persist here.</div>}</section>
    <footer className="audit-footer"><span>Prototype evidence center • Admin access only • No equipment control</span><button onClick={onOverview}>Return to production dashboard</button></footer>
  </div>;
}

function LegacyBatchReportsPage({baseInput,onOverview}:{baseInput:Inputs;onOverview:()=>void}){
  const [rowCount,setRowCount]=useState<1000|10000>(1000);
  const cohort="hours_research" as const;
  const [working,setWorking]=useState(false);const [error,setError]=useState("");
  const [report,setReport]=useState<BatchResult|null>(null);const [reports,setReports]=useState<BatchReportRecord[]>([]);
  const [persistence,setPersistence]=useState<"checking"|"supabase"|"volatile">("checking");
  async function loadReports(){try{const response=await fetch("/api/reports/batch?limit=8",{cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not load reports");setReports(data.reports||[]);setPersistence(data.persistence==="supabase"?"supabase":"volatile");}catch(error){setError(error instanceof Error?error.message:"Could not load reports");setPersistence("volatile");}}
  useEffect(()=>{void loadReports();},[]);
  const shortHrtInput:ShortHrtInputs={feedRate:baseInput.feedRate,temperature:baseInput.temperature,ph:baseInput.ph,olr:baseInput.olr,hrtHours:baseInput.hrt};
  async function generate(){setWorking(true);setError("");try{const response=await fetch("/api/reports/batch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({rowCount,cohort,baseInput,shortHrtInput})});const data=await response.json();if(!response.ok)throw new Error(data.error||"AI report could not be generated");setReport(data);setPersistence(data.persistence==="supabase"?"supabase":"volatile");await loadReports();}catch(error){setError(error instanceof Error?error.message:"AI report could not be generated");}finally{setWorking(false);}}
  const summary=report?.summary;const cohortLabel="2–24 hour trained short-HRT model";
  return <div className="batch-workspace">
    <header className="batch-header"><button onClick={onOverview}>← Plant readjustment</button><div><small>ADMIN • REPRODUCIBLE MODEL SEARCH</small><h1>AI reports</h1><p>Generate {rowCount.toLocaleString()} trained-model improvement scenarios from the current plant readjustment condition.</p></div><span className={persistence==="supabase"?"stored":"volatile"}>{persistence==="supabase"?"Supabase report store":"Storage check"}</span></header>
    <section className="batch-truth"><b>What runs</b><p>Every option starts from the current plant readjustment, then evaluates a deterministic nearby variation through the trained five-value short-HRT Ridge model. No Excel rows or random values are shown.</p><em>Options are alternatives, not a production time series. Review and pilot-validate an option before changing a plant.</em></section>
    <section className="batch-controls"><div><small>STEP 1</small><h2>Current plant readjustment condition</h2><p>{format(baseInput.feedRate)} kg VS/day • {format(baseInput.temperature)} °C • pH {format(baseInput.ph)} • OLR {format(baseInput.olr)} kg VS/m³·d • HRT {format(baseInput.hrt)} hours</p></div><div className="batch-control-grid"><fieldset><legend>AI model evaluations</legend><button className={rowCount===1000?"selected":""} onClick={()=>setRowCount(1000)}>1,000 runs</button><button className={rowCount===10000?"selected":""} onClick={()=>setRowCount(10000)}>10,000 runs</button></fieldset><button className="batch-generate" onClick={()=>void generate()} disabled={working}>{working?<><i className="loader"/>Running {rowCount.toLocaleString()} AI scenarios…</>:<>Run {rowCount.toLocaleString()} AI scenarios →</>}</button></div>{error&&<p className="batch-error">{error}</p>}</section>
    {summary?<><section className="batch-summary"><header><div><small>STEP 2 • RANKED MODEL OUTPUT</small><h2>Best HRT-aware candidate compared with the current input</h2><p>{summary.totalRows.toLocaleString()} separate model evaluations • {summary.inputCount} learned features per row • {summary.withinNormalModelCoverage.toLocaleString()} candidates inside the 2–24 hour training range.</p></div><a href={`/api/reports/batch?id=${report?.id}&format=csv`}>Download CSV export ↓</a></header><div className="batch-metric-grid"><article><small>Current biogas</small><b>{format(summary.farmerInput.optimizedBiogasM3Day)}<em>m³/day</em></b><span>Current Plant inputs through the model</span></article><article><small>Best candidate biogas</small><b>{format(summary.bestScenario.optimized_biogas_m3_day)}<em>m³/day</em></b><span>Rank #1 candidate</span></article><article><small>HRT change</small><b>{summary.bestVsFarmer.hrtHours>=0?"+":""}{format(summary.bestVsFarmer.hrtHours)}<em>hours</em></b><span>Negative means lower retention time</span></article><article><small>Best methane</small><b>{format(summary.bestScenario.methane_m3_day)}<em>m³ CH₄/day</em></b><span>Rank #1 candidate</span></article><article><small>Best electricity</small><b>{format(summary.bestScenario.electricity_kwh_day)}<em>kWh/day</em></b><span>Rank #1 candidate</span></article><article><small>Best H₂S estimate</small><b>{format(summary.bestScenario.h2s_ppm)}<em>ppm</em></b><span>Modelled after-filter value</span></article></div><div className="batch-reconcile"><div><small>RECOMMENDED INPUT CHANGE</small><b>{format(summary.bestScenario.temperature_c)} °C • pH {format(summary.bestScenario.ph)} • OLR {format(summary.bestScenario.olr_kg_vs_m3_day)}</b><span>HRT {format(summary.bestScenario.hrt_hours)} hours • feed {format(summary.bestScenario.feed_rate_kg_vs_day)} kg VS/day</span></div><div><small>MODEL BASIS</small><b>{cohortLabel}</b><span>Plant-input starting values plus deterministic nearby variations are passed through the exported trained-model coefficients on the server.</span></div><div><small>REPORT RECORD</small><b>{report?.persisted?"Saved server-side":"Temporary server report"}</b><span>{report?.id}</span></div></div><div className="batch-notes"><b>Source boundary</b><span>{summary.sourceNote}</span><em>{summary.safetyNote}</em></div></section><section className="batch-preview"><header><div><small>STEP 3 • TOP MODEL OPTIONS</small><h2>Best 12 of {summary.totalRows.toLocaleString()} candidate inputs</h2><p>The export includes every candidate input, output, rank and recommendation.</p></div><span>No RNG used</span></header><div className="batch-table"><div><span>Rank</span><span>Candidate input</span><span>HRT hours</span><span>Biogas: before → after</span><span>Methane</span><span>Electricity</span><span>Recommendation</span></div>{report?.preview.map(row=><div key={`${row.scenario_id}-${row.rank}`}><b>#{row.rank} {row.is_farmer_input?"• Current":""}</b><span>{format(row.feed_rate_kg_vs_day)} kg VS/day • {format(row.temperature_c)} °C • pH {format(row.ph)} • OLR {format(row.olr_kg_vs_m3_day)}</span><span>{format(row.hrt_hours)} h</span><span>{format(row.baseline_biogas_m3_day)} → {format(row.optimized_biogas_m3_day)} m³/d</span><span>{format(row.methane_m3_day)} m³/d</span><span>{format(row.electricity_kwh_day)} kWh/d</span><em>{row.ai_recommendation}</em></div>)}</div></section></>:<section className="batch-empty"><span>▤</span><h2>No AI report run yet</h2><p>Set the five Plant inputs, then explicitly run the 1,000 or 10,000-scenario AI report.</p></section>}
    <section className="batch-history"><header><div><small>SAVED REPORT HISTORY</small><h2>Reports available to the auditor</h2></div><button onClick={()=>void loadReports()}>Refresh</button></header>{reports.length?<div className="batch-history-table"><div><span>Report</span><span>Created</span><span>Mode</span><span>Runs</span><span>Best biogas</span><span>Export</span></div>{reports.map(item=><div key={item.id}><b>{item.id.slice(0,12)}</b><span>{new Date(item.created_at).toLocaleString()}</span><span>{item.cohort==="farm_optimization"?"Farm input":item.cohort==="hours_research"?"Trained 2–24 h ML":"<6 h research"}</span><span>{item.row_count.toLocaleString()}</span><span>{format(item.summary?.bestScenario?.optimized_biogas_m3_day||0)} m³/day</span><a href={`/api/reports/batch?id=${item.id}&format=csv`}>CSV ↓</a></div>)}</div>:<p className="batch-history-empty">No saved model-search reports yet. Run one above; Supabase stores the inputs, generation definition and ranked summary, then recreates the same CSV on download.</p>}</section>
  </div>;
}

function BatchReportsPage({onOverview,embedded=false}:{onOverview:()=>void;embedded?:boolean}){
  const [working,setWorking]=useState(false);
  const [error,setError]=useState("");
  const [report,setReport]=useState<BatchResult|null>(null);
  const [pendingReport,setPendingReport]=useState<BatchResult|null>(null);
  const [reports,setReports]=useState<BatchReportRecord[]>([]);
  const [persistence,setPersistence]=useState<"checking"|"supabase"|"volatile">("checking");
  const [selectedStage,setSelectedStage]=useState(0);
  const [revealedStage,setRevealedStage]=useState(0);
  const [batchAnalysisStage,setBatchAnalysisStage]=useState(0);
  const [batchAnalysisPaused,setBatchAnalysisPaused]=useState(false);
  const [approved,setApproved]=useState(false);
  const [monthlyMetric,setMonthlyMetric]=useState<"biogas"|"methane"|"electricity">("methane");
  const defaultWorkflow:BatchWorkflowStage[]=[
    {label:"Read online operating conditions",detail:"Simulated short-HRT operating conditions are read as the online-reading source; workbook output columns are excluded."},
    {label:"Validate five plant values",detail:"Feed rate, temperature, pH, OLR and HRT in hours are checked for each operating row."},
    {label:"Prepare model values",detail:"Only the five trained values are prepared. Workbook output columns are excluded."},
    {label:"Calculate baseline",detail:"A documented condition-responsive baseline is calculated for comparison."},
    {label:"Prepare AI candidate values",detail:"Deterministic, bounded candidate setpoints are created from the online operating conditions."},
    {label:"Run trained Ridge model",detail:"All 2,000 candidates are passed through the deployed five-value short-HRT model."},
    {label:"Calculate six KPI outputs",detail:"Biogas, methane, electricity, H₂S removal and CO₂e estimate are prepared as labelled model outputs/derivations."},
    {label:"Build daily and monthly reports",detail:"The system selects a model-ranked option per operating condition and creates daily drill-down plus 12 labelled 30-day model periods."},
  ];
  const workflow=report?.workflow?.length?report.workflow:defaultWorkflow;
  const selected=workflow[Math.min(selectedStage,workflow.length-1)]||workflow[0];
  async function loadReports(){
    try { const response=await fetch("/api/reports/batch?limit=8",{cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not load reports");setReports(data.reports||[]);setPersistence(data.persistence==="supabase"?"supabase":"volatile"); }
    catch(loadError){ setError(loadError instanceof Error?loadError.message:"Could not load reports");setPersistence("volatile"); }
  }
  useEffect(()=>{void loadReports();},[]);
  useEffect(()=>{
    if(!working||batchAnalysisPaused||batchAnalysisStage>=defaultWorkflow.length-1)return;
    const timer=window.setTimeout(()=>setBatchAnalysisStage(current=>Math.min(defaultWorkflow.length-1,current+1)),800);
    return()=>window.clearTimeout(timer);
  },[working,batchAnalysisPaused,batchAnalysisStage,defaultWorkflow.length]);
  useEffect(()=>{
    if(!working||batchAnalysisPaused||batchAnalysisStage<defaultWorkflow.length-1||!pendingReport)return;
    const completed=pendingReport;
    setReport(completed);setPendingReport(null);setApproved(false);setPersistence(completed.persistence==="supabase"?"supabase":"volatile");setRevealedStage((completed.workflow?.length||defaultWorkflow.length)-1);setSelectedStage((completed.workflow?.length||defaultWorkflow.length)-1);setWorking(false);void loadReports();
  },[working,batchAnalysisPaused,batchAnalysisStage,pendingReport,defaultWorkflow.length]);
  async function generate(){
    if(working)return;
    setWorking(true);setError("");setPendingReport(null);setApproved(false);setBatchAnalysisStage(0);setBatchAnalysisPaused(false);setSelectedStage(0);setRevealedStage(0);
    try {
      const [response]=await Promise.all([
        fetch("/api/reports/batch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cohort:"short_hrt_batch",rowCount:2000})}),
        new Promise(resolve=>window.setTimeout(resolve,6500)),
      ]);
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Online-reading AI report could not be generated");
      setPendingReport(data);
    } catch(runError) { setError(runError instanceof Error?runError.message:"Online-reading AI report could not be generated");setWorking(false); }
  }
  const summary=report?.summary;
  const projection=summary?.projection;
  const complete=Boolean(report);
  return <div className={`batch-workspace batch-presentation-workspace ${embedded?"batch-overview-report":""}`} id={embedded?"ai-kpi-report":undefined}>
    {embedded?<header className="batch-overview-header"><div><small>AI OPTIMISATION + KPI REPORT</small><h2>Run AI from online reading</h2><p>The application processes simulated operating conditions through the deployed model, then prepares 2,000 new AI optimisation results for review and export.</p></div><span className={persistence==="supabase"?"stored":"volatile"}>{persistence==="supabase"?"Report store ready":"Storage check"}</span></header>:<header className="batch-header batch-presentation-header"><button onClick={onOverview}>← Overview</button><div><small>AQUAIVOLT • AUDITABLE AI OPTIMISATION</small><h1>Farm biodigester AI report</h1><p>Wastewater to Optimized Energy • online reading → trained model → AI reports.</p></div><span className={persistence==="supabase"?"stored":"volatile"}>{persistence==="supabase"?"Supabase report store":"Storage check"}</span></header>}
    <section className="batch-truth"><b>Online reading → AI model → operator review → reports</b><p><b>Hours-Scale AI Synthetic 500</b> provides operating conditions for the model. The application generates 2,000 fresh deterministic results; it does not copy workbook target/output values. <b>AI Biogas 10 Run Dataset</b> remains a validation and KPI comparison reference.</p><em>The source conditions are synthetic and timestamp-free. HRT is processed in hours; 12 month labels are readable 30-day modelled periods, not real calendar observations.</em></section>
    <DataSourceRail active="batch" compact/>

    {!embedded&&<section className="batch-audit-flow" aria-label="Paused online-reading AI workflow">
      <header><div><small>PAUSED AUDITOR VIEW</small><h2>Online-reading AI data flow</h2><p>Advance one stage at a time so the auditor can inspect the implemented flow.</p></div><div><button onClick={()=>setRevealedStage(current=>Math.max(0,current-1))} disabled={revealedStage===0||working}>Previous</button><button onClick={()=>setRevealedStage(current=>Math.min(workflow.length-1,current+1))} disabled={revealedStage>=workflow.length-1||working}>Next stage</button><button className="batch-generate compact" onClick={()=>void generate()} disabled={working}>{working?"Running 2,000 model evaluations…":"Generate AI model output"}</button></div></header>
      <div className="batch-flow-nodes">{workflow.map((stage,index)=><button type="button" key={stage.label} className={`${index<=revealedStage?"revealed":""} ${index===selectedStage?"selected":""} ${complete?"complete":""}`} onClick={()=>index<=revealedStage&&setSelectedStage(index)} disabled={index>revealedStage}><span>{String(index+1).padStart(2,"0")}</span><b>{stage.label}</b><em>{complete?"Completed":index===revealedStage?"Paused here":"Waiting"}</em></button>)}</div>
      <div className="batch-flow-inspector"><span>{String(selectedStage+1).padStart(2,"0")}</span><div><small>{complete?"SERVER AI TRACE":"AUDITOR-READY STAGE"}</small><h3>{selected.label}</h3><p>{selected.detail}</p></div><aside><b>{complete?"Completed by model run":"Paused for review"}</b><span>{complete?`${summary?.totalRows.toLocaleString()} calculated candidate rows available for export.`:"Nothing runs until Generate AI model output is selected."}</span>{complete&&summary?.bestScenario&&<em><strong>Current AI action:</strong> {summary.bestScenario.ai_recommendation}</em>}</aside></div>
    </section>}

    <section className="batch-controls batch-source-summary"><div><small>ONLINE READING</small><p>Each operating condition contributes feed rate, temperature, pH, OLR and HRT in hours. These five trained model values enter the AI calculation.</p></div><div className="batch-source-counts"><span className="primary"><b>2,000</b>AI model outputs</span></div><div className="batch-source-action"><button className="batch-generate" onClick={()=>void generate()} disabled={working}>{working?"Running 2,000 AI model evaluations…":"Generate AI model output"}</button>{report&&<a className="batch-scenario-export" href={`/api/reports/batch?id=${report.id}&format=csv`}>Download generated 2,000-scenario CSV ↓</a>}{error&&<p className="batch-error">{error}</p>}</div></section>

    {embedded&&<details className="batch-audit-details" open><summary>Auditor view: inspect the stopped online-reading AI flow</summary><section className="batch-audit-flow" aria-label="Paused online-reading AI workflow">
      <header><div><small>PAUSED AUDITOR VIEW</small><h2>Online-reading AI data flow</h2><p>Advance one stage at a time so the auditor can inspect the implemented flow.</p></div><div><button onClick={()=>setRevealedStage(current=>Math.max(0,current-1))} disabled={revealedStage===0||working}>Previous</button><button onClick={()=>setRevealedStage(current=>Math.min(workflow.length-1,current+1))} disabled={revealedStage>=workflow.length-1||working}>Next stage</button></div></header>
      <div className="batch-flow-nodes">{workflow.map((stage,index)=><button type="button" key={stage.label} className={`${index<=revealedStage?"revealed":""} ${index===selectedStage?"selected":""} ${complete?"complete":""}`} onClick={()=>index<=revealedStage&&setSelectedStage(index)} disabled={index>revealedStage}><span>{String(index+1).padStart(2,"0")}</span><b>{stage.label}</b><em>{complete?"Completed":index===revealedStage?"Paused here":"Waiting"}</em></button>)}</div>
      <div className="batch-flow-inspector"><span>{String(selectedStage+1).padStart(2,"0")}</span><div><small>{complete?"SERVER AI TRACE":"AUDITOR-READY STAGE"}</small><h3>{selected.label}</h3><p>{selected.detail}</p></div><aside><b>{complete?"Completed by model run":"Paused for review"}</b><span>{complete?`${summary?.totalRows.toLocaleString()} calculated candidate rows available for export.`:"Nothing runs until Generate AI model output is selected."}</span>{complete&&summary?.bestScenario&&<em><strong>Current AI action:</strong> {summary.bestScenario.ai_recommendation}</em>}</aside></div>
    </section></details>}

    {summary&&projection?<>
      <section className="batch-yearly-widgets batch-daily-widgets"><header><div><small>DAILY AI MODEL OUTPUT</small><h2>What the AI model predicts per day</h2><p>Clear daily values from online reading. Baseline is the documented counterfactual; AI is the trained-model output. Approve the recommendation to unlock report exports.</p></div><div className="batch-export-actions"><button type="button" className={approved?"approved":""} onClick={()=>setApproved(true)} disabled={approved}>{approved?"Approved ✓":"Approve AI action"}</button><a className={approved?"":"locked"} aria-disabled={!approved} onClick={event=>{if(!approved)event.preventDefault();}} href={`/api/reports/batch?id=${report?.id}&format=csv`}>Export 2,000 AI scenarios ↓</a><a className={approved?"":"locked"} aria-disabled={!approved} onClick={event=>{if(!approved)event.preventDefault();}} href={`/api/reports/batch?id=${report?.id}&format=daily`}>Export daily baseline vs AI ↓</a><a className={approved?"":"locked"} aria-disabled={!approved} onClick={event=>{if(!approved)event.preventDefault();}} href={`/api/reports/batch?id=${report?.id}&format=projection`}>Export 12-month comparison ↓</a></div></header><div className="year-widget-grid"><YearWidget label="Baseline methane" value={projection.dailyMean.baselineMethaneM3Day} comparisonValue={projection.dailyMean.optimizedMethaneM3Day} unit="m³ CH₄/day" tone="baseline" period="daily"/><YearWidget label="AI-optimised methane" value={projection.dailyMean.optimizedMethaneM3Day} comparisonValue={projection.dailyMean.baselineMethaneM3Day} unit="m³ CH₄/day" tone="optimized" period="daily"/><YearWidget label="Baseline electricity" value={projection.dailyMean.baselineElectricityKwhDay} comparisonValue={projection.dailyMean.optimizedElectricityKwhDay} unit="kWh/day" tone="baseline" period="daily"/><YearWidget label="AI-optimised electricity" value={projection.dailyMean.optimizedElectricityKwhDay} comparisonValue={projection.dailyMean.baselineElectricityKwhDay} unit="kWh/day" tone="optimized" period="daily"/></div></section>
      <MonthlyImpactBoard projection={projection} metric={monthlyMetric} onMetric={setMonthlyMetric}/>
      <section className="batch-summary batch-kpi-summary"><header><div><small>SIX MODELLED KPI OUTPUTS</small><h2>AI result and recommendation</h2><p>Absolute values with units. Blue is baseline; green is AI-optimised; amber is a derived estimate.</p></div><span>2,000 calculated candidates</span></header><div className="batch-metric-grid"><article><small>Baseline biogas</small><b>{format(projection.dailyMean.baselineBiogasM3Day)}<em>m³/day</em></b><span>Modelled daily mean</span></article><article><small>AI biogas</small><b>{format(projection.dailyMean.optimizedBiogasM3Day)}<em>m³/day</em></b><span>Best-per-condition mean</span></article><article><small>AI methane</small><b>{format(projection.dailyMean.optimizedMethaneM3Day)}<em>m³ CH₄/day</em></b><span>Modelled daily mean</span></article><article><small>AI electricity</small><b>{format(projection.dailyMean.optimizedElectricityKwhDay)}<em>kWh/day</em></b><span>Modelled daily mean</span></article><article><small>H₂S removed</small><b>{format(projection.dailyMean.h2sRemovedPpm)}<em>ppm</em></b><span>Derived before–after estimate</span></article><article><small>Estimated CO₂e avoided</small><b>{format(projection.dailyMean.estimatedCo2eAvoidedKgDay)}<em>kg/day</em></b><span>Uses 0.708 kg/kWh assumption</span></article></div><div className={`batch-action-gate ${approved?"approved":""}`}><div><small>OPERATOR ACTION</small><b>{approved?"AI recommendation approved for report generation":"Review the AI recommendation before generating reports"}</b><span>{approved?"Optimised values are now marked as approved in this browser session. No physical equipment command is sent.":"This is advisory only. Approval changes report status, not plant hardware."}</span></div><button type="button" onClick={()=>setApproved(true)} disabled={approved}>{approved?"Approved for reporting ✓":"Approve AI recommendation"}</button></div><div className="batch-reconcile"><div><small>TOP AI RECOMMENDATION</small><b>{summary.bestScenario.candidate_profile||"Model-balanced option"}</b><span>{summary.bestScenario.ai_recommendation}</span></div><div><small>OPTIMISED BIOGAS LEVEL</small><b>{format(summary.bestScenario.optimized_biogas_m3_day)} m³/day</b><span>Rank #1 candidate: source {summary.bestScenario.source_run_id} • HRT {format(summary.bestScenario.hrt_hours)} hours</span></div><div><small>REPORT EVIDENCE</small><b>{report?.persisted?"Saved server-side":"Temporary server report"}</b><span>{report?.id}</span></div></div><div className="batch-notes"><b>Projection basis</b><span>{projection.basis}</span><em>{summary.safetyNote}</em></div></section>
      <details className="batch-report-details" open={!embedded}><summary>Auditor detail: inspect the top 12 of 2,000 AI calculations</summary><section className="batch-preview"><header><div><small>TOP RANKED OUTPUTS</small><h2>Best 12 of 2,000 AI calculations</h2><p>The export includes source ID, candidate profile, all plant values, baseline, model output, H₂S calculation and recommendation.</p></div><span>No random output values</span></header><div className="batch-table"><div><span>Rank / source</span><span>AI profile</span><span>HRT</span><span>Biogas: baseline → AI</span><span>Methane</span><span>Electricity</span><span>Recommendation</span></div>{report?.preview.map(row=><div key={`${row.scenario_id}-${row.rank}`}><b>#{row.rank} • {row.source_run_id}</b><span>{row.candidate_profile}</span><span>{format(row.hrt_hours)} h</span><span>{format(row.baseline_biogas_m3_day)} → {format(row.optimized_biogas_m3_day)} m³/day</span><span>{format(row.methane_m3_day)} m³/day</span><span>{format(row.electricity_kwh_day)} kWh/day</span><em>{row.ai_recommendation}</em></div>)}</div></section></details>
    </>:<section className="batch-empty"><span>▤</span><h2>Online-reading AI result is waiting</h2><p>Inspect the paused AI workflow above, then generate 2,000 fresh AI predictions from the simulated operating conditions.</p></section>}

    <details className="batch-report-details" open={!embedded}><summary>Auditor detail: saved AI report history</summary><section className="batch-history"><header><div><small>AUDIT REPORT HISTORY</small><h2>Saved AI reports</h2></div><button onClick={()=>void loadReports()}>Refresh</button></header>{reports.length?<div className="batch-history-table"><div><span>Report</span><span>Created</span><span>Mode</span><span>Outputs</span><span>Best biogas</span><span>Export</span></div>{reports.map(item=><div key={item.id}><b>{item.id.slice(0,12)}</b><span>{new Date(item.created_at).toLocaleString()}</span><span>{item.cohort==="short_hrt_batch"?"Online-reading Ridge model":item.cohort==="hours_research"?"Plant readjustment short-HRT ML":"Other"}</span><span>{item.row_count.toLocaleString()}</span><span>{format(item.summary?.bestScenario?.optimized_biogas_m3_day||0)} m³/day</span><a href={`/api/reports/batch?id=${item.id}&format=csv`}>CSV ↓</a></div>)}</div>:<p className="batch-history-empty">No AI report has been recorded yet. Generate the online-reading AI result above; Supabase stores the definition and summary when configured.</p>}</section></details>
    {working&&<BatchAiAnalysisCenter stages={defaultWorkflow} stage={batchAnalysisStage} paused={batchAnalysisPaused} onTogglePause={()=>setBatchAnalysisPaused(current=>!current)}/>}
  </div>;
}

function YearWidget({label,value,comparisonValue,unit,tone,period="daily"}:{label:string;value:number;comparisonValue:number;unit:string;tone:"baseline"|"optimized";period?:string}){
  const ring=Math.max(12,Math.min(100,Math.round(value/Math.max(1,value,comparisonValue)*100)));
  return <article className={`year-widget ${tone}`}><div className="year-ring" style={{"--ring":`${ring}%`} as React.CSSProperties}><b>{tone==="baseline"?"BASE":"AI"}</b><small>{period}</small></div><div><small>{label}</small><b>{format(value)}</b><span>{unit}</span></div></article>;
}

function BatchProjectionBoard({projection,period,onPeriod}:{projection:BatchProjection;period:"monthly"|"daily";onPeriod:(period:"monthly"|"daily")=>void}){
  const monthly=projection.monthlyEquivalent;
  const daily=projection.dailyMean;
  const metrics=period==="monthly"?[
    ["Biogas",format(monthly.baselineBiogasM3),format(monthly.optimizedBiogasM3),"m³ / 30 modelled days"],
    ["Methane",format(monthly.baselineMethaneM3),format(monthly.optimizedMethaneM3),"m³ CH₄ / 30 modelled days"],
    ["Electricity",format(monthly.baselineElectricityKwh),format(monthly.optimizedElectricityKwh),"kWh / 30 modelled days"],
    ["H₂S removed","—",format(daily.h2sRemovedPpm),"average ppm removed"],
    ["CO₂e avoided","—",format(monthly.estimatedCo2eAvoidedKg),"kg / 30 modelled days"],
    ["Organic/COD value","OLR only","Not predicted","the 500-row HRT online-reading model contains no COD concentration"],
    ["Biogas increase","—",`${format((monthly.optimizedBiogasM3-monthly.baselineBiogasM3)/Math.max(.001,monthly.baselineBiogasM3)*100)}%`,"derived from baseline and AI output"],
    ["CH₄ content","—",`${format(monthly.optimizedMethaneM3/Math.max(.001,monthly.optimizedBiogasM3)*100)}%`,"methane ÷ optimised biogas"],
    ["Model coverage","—",`${format(daily.modelCoveragePct)}%`,"range coverage; not predictive confidence"],
    ["Process stability estimate","—",`${format(daily.processStabilityEstimatePct)}%`,"derived index; not sensor measurement"],
  ]:[
    ["Biogas",format(daily.baselineBiogasM3Day),format(daily.optimizedBiogasM3Day),"m³/day mean"],
    ["Methane",format(daily.baselineMethaneM3Day),format(daily.optimizedMethaneM3Day),"m³ CH₄/day mean"],
    ["Electricity",format(daily.baselineElectricityKwhDay),format(daily.optimizedElectricityKwhDay),"kWh/day mean"],
    ["H₂S removed","—",format(daily.h2sRemovedPpm),"average ppm removed"],
    ["CO₂e avoided","—",format(daily.estimatedCo2eAvoidedKgDay),"kg/day mean"],
    ["Organic/COD value","OLR only","Not predicted","the 500-row HRT online-reading model contains no COD concentration"],
    ["Biogas increase","—",`${format((daily.optimizedBiogasM3Day-daily.baselineBiogasM3Day)/Math.max(.001,daily.baselineBiogasM3Day)*100)}%`,"derived from baseline and AI output"],
    ["CH₄ content","—",`${format(daily.optimizedMethaneM3Day/Math.max(.001,daily.optimizedBiogasM3Day)*100)}%`,"methane ÷ optimised biogas"],
    ["Model coverage","—",`${format(daily.modelCoveragePct)}%`,"range coverage; not predictive confidence"],
    ["Process stability estimate","—",`${format(daily.processStabilityEstimatePct)}%`,"derived index; not sensor measurement"],
  ];
  return <section className="batch-projection-board"><header><div><small>AI + KPI REPORT</small><h2>Clear baseline-to-AI comparison</h2><p>{period==="monthly"?"Monthly-equivalent summary from the 30 deterministic modelled operating-day groups.":"Daily mean summary. The downloadable CSV contains all 30 modelled operating-day groups."}</p></div><div className="projection-period"><button className={period==="monthly"?"active":""} onClick={()=>onPeriod("monthly")}>Monthly view</button><button className={period==="daily"?"active":""} onClick={()=>onPeriod("daily")}>Daily view</button></div></header><div className="kpi-spreadsheet"><div className="kpi-spreadsheet-head"><span>Metric</span><span>Baseline</span><span>AI model output</span><span>Unit / note</span></div>{metrics.map(([metric,baseline,optimized,note],index)=><div key={metric} className={index>=3?"derived":""}><b>{metric}</b><span>{baseline}</span><strong>{optimized}</strong><em>{note}</em></div>)}</div><p className="kpi-projection-note">Modelled from online reading; no workbook output cells are copied into the 2,000 scenarios. “Model coverage” is not predictive confidence, and “process stability” is a derived estimate—not a sensor measurement. COD is explicitly unavailable because it is not a field in the 500-row short-HRT online-reading model.</p></section>;
}

function MonthlyImpactBoard({projection,metric,onMetric}:{projection:BatchProjection;metric:"biogas"|"methane"|"electricity";onMetric:(metric:"biogas"|"methane"|"electricity")=>void}){
  const labels={biogas:"Biogas",methane:"Methane",electricity:"Electricity"} as const;
  const unit=metric==="electricity"?"kWh / 30 modelled days":metric==="methane"?"m³ CH₄ / 30 modelled days":"m³ / 30 modelled days";
  const value=(row:ModelledMonthlyProjectionRow,kind:"baseline"|"optimized")=>metric==="biogas"?(kind==="baseline"?row.baseline_biogas_m3:row.optimized_biogas_m3):metric==="methane"?(kind==="baseline"?row.baseline_methane_m3:row.optimized_methane_m3):(kind==="baseline"?row.baseline_electricity_kwh:row.optimized_electricity_kwh);
  const max=Math.max(1,...projection.monthlyRows.flatMap(row=>[value(row,"baseline"),value(row,"optimized")]));
  return <section className="monthly-impact-panel"><header><div><small>12 MODELLED MONTHS</small><h2>Baseline versus AI-optimised {labels[metric]}</h2><p>Each labelled month is a deterministic 30-day modelled period from the online reading. Select a metric to compare its baseline and AI-optimised result.</p></div><div className="monthly-metric-switch" aria-label="Select monthly comparison metric">{(["biogas","methane","electricity"] as const).map(item=><button key={item} type="button" className={metric===item?"active":""} onClick={()=>onMetric(item)}>{labels[item]}</button>)}</div></header><div className="monthly-impact-chart" role="img" aria-label={`12 month baseline and AI-optimised ${labels[metric]} comparison`}>{projection.monthlyRows.map(row=><article key={row.modelled_month}><b>{row.month_label.slice(0,3)}</b><div className="monthly-chart-bars"><span className="baseline" style={{height:`${Math.max(3,value(row,"baseline")/max*100)}%`}} title={`Baseline ${format(value(row,"baseline"))}`}/><span className="optimized" style={{height:`${Math.max(3,value(row,"optimized")/max*100)}%`}} title={`AI ${format(value(row,"optimized"))}`}/></div></article>)}</div><div className="monthly-chart-key"><span><i className="baseline"/>Baseline</span><span><i className="optimized"/>AI-optimised</span><b>Unit: {unit}</b></div><div className="monthly-table"><div><span>Month</span><span>Baseline</span><span>AI-optimised</span><span>Extra</span></div>{projection.monthlyRows.map(row=>{const baseline=value(row,"baseline");const optimized=value(row,"optimized");return <div key={row.month_label}><b>{row.month_label}</b><span>{format(baseline)}</span><strong>{format(optimized)}</strong><em>{format(optimized-baseline)}</em></div>})}</div><p className="monthly-impact-note">The downloadable 12-month CSV contains every displayed baseline and AI value. It is an auditable model projection, not a historical monthly measurement.</p></section>;
}

function KpiReportsPage({onOverview}:{onOverview:()=>void}){
  const [period,setPeriod]=useState<"hour"|"day"|"month">("day");
  const [source,setSource]=useState<"all"|"modelled_prediction"|"csv_import">("all");
  const [aggregates,setAggregates]=useState<KpiAggregate[]>([]);
  const [persistence,setPersistence]=useState<"supabase"|"volatile"|"checking">("checking");
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);
  async function load(){
    setLoading(true);setMessage("");
    try{const response=await fetch(`/api/reports/kpi?period=${period}${source==="all"?"":`&source=${source}`}`,{cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.error||"KPI report could not be loaded");setAggregates(data.aggregates||[]);setPersistence(data.persistence==="supabase"?"supabase":"volatile");}
    catch(error){setMessage(error instanceof Error?error.message:"KPI report could not be loaded");setPersistence("volatile");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[period,source]);
  async function uploadCsv(file:File){
    setMessage("Reading CSV…");
    try{
      const lines=(await file.text()).replace(/^\uFEFF/,"").split(/\r?\n/).filter(Boolean);
      if(lines.length<2)throw new Error("The CSV needs a header row and at least one data row.");
      const headers=lines[0].split(",").map(value=>value.trim().replace(/^"|"$/g,"").toLowerCase());
      const index=(...names:string[])=>headers.findIndex(header=>names.includes(header));
      const pick=(values:string[],...names:string[])=>{const position=index(...names);return position>=0?values[position]?.trim().replace(/^"|"$/g,""):"";};
      const rows=lines.slice(1).map(line=>{const values=line.split(",");return {observedAt:pick(values,"observedat","observed_at","timestamp","time"),digesterId:pick(values,"digesterid","digester_id","digester"),biogas:pick(values,"biogas","biogas_m3_day"),methane:pick(values,"methane","methane_m3_day"),electricity:pick(values,"electricity","electricity_kwh_day"),methanePct:pick(values,"methanepct","methane_pct","ch4_pct"),co2Pct:pick(values,"co2pct","co2_pct"),h2s:pick(values,"h2s","h2s_ppm")};});
      const response=await fetch("/api/reports/kpi",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({rows})});const data=await response.json();if(!response.ok)throw new Error(data.error||"CSV import failed");setMessage(`${data.accepted} CSV observation${data.accepted===1?"":"s"} imported as real-data evidence.`);await load();
    }catch(error){setMessage(error instanceof Error?error.message:"CSV import failed");}
  }
  return <div className="kpi-workspace">
    <header className="batch-header"><button onClick={onOverview}>← Plant readjustment</button><div><small>ADMIN • KPI AUDIT REPORTING</small><h1>KPI reports</h1><p>Drill down by hour, day or month. Modelled calculations and imported plant records stay separately labelled.</p></div><span className={persistence==="supabase"?"stored":"volatile"}>{persistence==="supabase"?"Supabase evidence store":"Storage check"}</span></header>
    <section className="kpi-boundary"><b>Source boundary</b><p>Dashboard calculations are saved as <strong>modelled prediction</strong> records. They are not physical production totals. Upload a timestamped CSV to add separately labelled plant/SCADA observations.</p></section>
    <section className="kpi-controls"><div><label>Period<select value={period} onChange={event=>setPeriod(event.target.value as "hour"|"day"|"month")}><option value="hour">Hour</option><option value="day">Day</option><option value="month">Month</option></select></label><label>Source<select value={source} onChange={event=>setSource(event.target.value as "all"|"modelled_prediction"|"csv_import")}><option value="all">All sources</option><option value="modelled_prediction">Modelled predictions only</option><option value="csv_import">Imported CSV only</option></select></label><button onClick={()=>void load()} disabled={loading}>{loading?"Refreshing…":"Refresh report"}</button></div><label className="kpi-upload">Import actual CSV<input type="file" accept=".csv,text/csv" onChange={event=>{const file=event.target.files?.[0];if(file)void uploadCsv(file);event.currentTarget.value="";}}/><small>Required headers: observedAt, biogas, methane, electricity, methanePct, co2Pct, h2s</small></label></section>
    {message&&<p className="kpi-message">{message}</p>}
    <section className="kpi-table-card"><header><div><small>AGGREGATED OUTPUT</small><h2>{period[0].toUpperCase()+period.slice(1)} KPI roll-up</h2></div><a href={`/api/reports/kpi?period=${period}${source==="all"?"":`&source=${source}`}`} target="_blank">Open JSON ↗</a></header>{aggregates.length?<div className="kpi-table"><div><span>Period</span><span>Records</span><span>Biogas</span><span>Methane</span><span>Electricity</span><span>CH₄ / CO₂ / H₂S average</span><span>Source mix</span></div>{aggregates.map(item=><div key={item.period}><b>{item.period}</b><span>{item.observations}</span><span>{format(item.biogasM3Day)} m³/day</span><span>{format(item.methaneM3Day)} m³ CH₄/day</span><span>{format(item.electricityKwhDay)} kWh/day</span><span>{format(item.methanePct)}% / {format(item.co2Pct)}% / {format(item.h2sPpm)} ppm</span><em>{item.sources.modelledPrediction} modelled • {item.sources.csvImport} CSV</em></div>)}</div>:<div className="kpi-empty"><span>≋</span><b>No KPI records for this filter yet</b><p>Run a prediction to create a modelled audit record, or import a timestamped CSV for actual plant observations.</p></div>}</section>
  </div>;
}

function Field({label,value,unit,onChange,options,step}:{label:string;value:string|number;unit?:string;onChange:(v:string)=>void;options?:string[];step?:string}){
  return <label className="simple-field"><span>{label}</span><div>{options?<select value={value} onChange={event=>onChange(event.target.value)}>{options.map(option=><option key={option}>{option}</option>)}</select>:<input type="number" step={step||"any"} value={value} onChange={event=>onChange(event.target.value)}/>} {unit&&<em>{unit}</em>}</div></label>;
}

function OutputCard({outputKey,result,active,onClick}:{outputKey:OutputKey;result:Prediction|null;active:boolean;onClick:()=>void}){
  const meta=outputs[outputKey];const before=result?meta.before(result):null;const after=result?meta.after(result):null;const extra=before!==null&&after!==null?after-before:null;
  return <button className={`output-card ${active?"active":""}`} style={{"--accent":meta.color} as React.CSSProperties} onClick={onClick}><span className="output-icon">{meta.icon}</span><div><small>{meta.label}</small><b>{after===null?"Waiting":format(after)} <em>{after===null?"":meta.unit}</em></b><p>{before===null||extra===null?"Run a calculation":<>Before {format(before)} • Extra {format(extra)}</>}</p></div><i>→</i></button>;
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
        <aside className={gain>0?"positive":"neutral"}><small>{gain>0?"POSSIBLE EXTRA BIOGAS":"CURRENT RESULT STATUS"}</small><b>{gain>0?"+":""}{format(gain)} <em>m³/day</em></b><span>{gain>0?"Model-estimated opportunity":"Current plant values already meet the modeled recommendation"}</span></aside>
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
  return <><div className="comparison-head"><div><small>CURRENT CALCULATION</small><h2>{meta.label}: before and after</h2><p>A longer coloured bar means more production.</p></div><span className="coverage-word">{result.outOfRange?"Estimated from nearest pattern":"Matched to supplied patterns"}</span></div><div className="comparison-layout"><div className="big-bars"><div className="bar-row"><span>Before AI</span><div><i className="before" style={{width:`${before/max*100}%`}}/></div><b>{format(before)}<small>{meta.unit}</small></b></div><div className="bar-row"><span>After AI</span><div><i className="after" style={{width:`${after/max*100}%`,background:meta.color}}/></div><b>{format(after)}<small>{meta.unit}</small></b></div><div className="extra-callout"><span>Extra {meta.label.toLowerCase()}</span><b>+{format(extra)} <small>{meta.unit}</small></b><p>This is the direct difference between the two bars.</p></div></div><div className="recommendation-box"><small>WHAT TO DO NEXT</small><h3>{result.recommendations[0]?.title||"Keep the current plant values"}</h3><p>{result.recommendations[0]?.detail||"The current scenario is close to the supplied reference case."}</p>{result.recommendations[0]&&<div><span>{result.recommendations[0].parameter}</span><b>{format(result.recommendations[0].current)} {result.recommendations[0].unit}</b><i>→</i><b>{format(result.recommendations[0].target)} {result.recommendations[0].unit}</b></div>}<em>Review with the plant operator before changing equipment.</em></div></div></>;
}

function ProductionDetail({outputKey,result,inputs}:{outputKey:OutputKey;result:Prediction;inputs:Inputs}){
  const meta=outputs[outputKey];
  const before=meta.before(result);
  const after=meta.after(result);
  const extra=after-before;
  const conditions=[
    {label:"Temperature",current:inputs.temperature,target:result.bestSetpoints.temperature,unit:"°C",tolerance:.5,min:30,max:45},
    {label:"pH",current:inputs.ph,target:result.bestSetpoints.ph,unit:"",tolerance:.1,min:6,max:8},
    {label:"Retention time",current:inputs.hrt,target:result.bestSetpoints.hrt,unit:"hours",tolerance:1,min:2,max:24},
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
        <em>{conditionsClose} of {conditions.length} key plant values are close to the modeled target</em>
      </aside>
    </div>
    <div className="production-detail-grid">
      <section className="modeled-conditions">
        <div className="detail-section-title"><div><small>MODELED SETPOINTS</small><h3>Best modeled conditions</h3></div><span>Operator review needed</span></div>
        <div className="best-condition-list">
          {conditions.map(condition=><div key={condition.label}><i style={{background:meta.color}}/><span>{condition.label}<small>Recommended plant value</small></span><b>{format(condition.target)} <em>{condition.unit}</em></b></div>)}
        </div>
      </section>
      <section className="attention-list">
        <div className="detail-section-title"><div><small>NEXT ACTIONS</small><h3>Plant values needing attention</h3></div></div>
        {actionItems.length?<div className="action-rows">{actionItems.map((item,index)=><div key={`${item.parameter}-${index}`}><span>{index+1}</span><p><b>{item.title}</b><small>{item.parameter}: {format(item.current)} {item.unit} → {format(item.target)} {item.unit}</small></p></div>)}</div>:<div className="no-attention"><b>Keep the current plant values</b><span>This scenario is already close to the modeled setpoints.</span></div>}
      </section>
      <aside className="condition-status">
        <div className="detail-section-title"><div><small>CURRENT VS TARGET</small><h3>Plant value check</h3></div></div>
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
            <small><i/>Current plant value <i style={{background:meta.color}}/>Modeled target</small>
          </div>;
        })}
      </aside>
    </div>
  </>;
}

function FocusedOutputPage({outputKey,result,runInputs,inputs,loading,dirty,predictionError,onOutput,onUpdate,onCalculate,onOverview}:{outputKey:OutputKey;result:Prediction|null;runInputs:Inputs|null;inputs:Inputs;loading:boolean;dirty:boolean;predictionError:string;onOutput:(key:OutputKey)=>void;onUpdate:(key:keyof Inputs,value:number)=>void;onCalculate:()=>void;onOverview:()=>void}){
  const meta=outputs[outputKey];
  const completedInputs=runInputs||inputs;
  const conditionsClose=result?[
    Math.abs(completedInputs.temperature-result.bestSetpoints.temperature)<=.5,
    Math.abs(completedInputs.ph-result.bestSetpoints.ph)<=.1,
    Math.abs(completedInputs.hrt-result.bestSetpoints.hrt)<=1,
  ].filter(Boolean).length:0;
  const curveValue=(point:ModelCurvePoint)=>point[outputKey];
  return <div className="focused-output-page" style={{"--focus-accent":meta.color} as React.CSSProperties}>
    <header className="focused-output-header">
      <div><small>PRODUCTION CENTER</small><h1>{meta.label} Yield Optimization Dashboard</h1><p>A dedicated view for {meta.label.toLowerCase()} prediction, operating targets and supplied validation evidence.</p></div>
      <button onClick={onOverview}>← Back to overview</button>
    </header>

    <nav className="focused-output-tabs" aria-label="Production dashboards">
      {(Object.keys(outputs) as OutputKey[]).map(key=><button key={key} className={outputKey===key?"active":""} style={{"--tab-accent":outputs[key].color} as React.CSSProperties} onClick={()=>onOutput(key)}><span>{outputs[key].icon}</span><b>{outputs[key].label}</b><small>Production</small></button>)}
    </nav>

    <div className="focused-kpis">
      <article><small>Current predicted {meta.label.toLowerCase()}</small><b>{result?format(meta.after(result)):"Waiting"}</b><span>{result?meta.unit:"Run calculation"}</span></article>
      <article><small>Optimal retention time</small><b>{result?format(result.bestSetpoints.hrt):"—"}</b><span>{result?"hours":"Run calculation"}</span></article>
      <article><small>Optimal pH</small><b>{result?format(result.bestSetpoints.ph):"—"}</b><span>{result?"modeled target":"Run calculation"}</span></article>
    </div>

    <div className="focused-output-content">
      <aside className="focused-filters">
        <small>PLANT READJUSTMENT</small><h2>Try plant conditions</h2><p>Adjust these plant values, then calculate again.</p>
        <RangeField label="Retention time" value={inputs.hrt} min={2} max={24} step={.1} unit="hours" onChange={value=>onUpdate("hrt",value)}/>
        <RangeField label="Temperature" value={inputs.temperature} min={37} max={65.2} step={.1} unit="°C" onChange={value=>onUpdate("temperature",value)}/>
        <RangeField label="pH" value={inputs.ph} min={6.19} max={6.93} step={.01} unit="" onChange={value=>onUpdate("ph",value)}/>
        {dirty&&<div className="focused-dirty">Plant values changed. Calculate again to refresh the output.</div>}
        {predictionError&&<div className="focused-error">{predictionError}</div>}
        <button className="focused-calculate" disabled={loading} onClick={onCalculate}>{loading?"AI is calculating…":result?"Recalculate production →":"Calculate production →"}</button>
        <div className="focused-mode-note"><b>Model mode</b><span>Plant readjustment values and synthetic scenario evidence.</span></div>
      </aside>

      <main className="focused-output-main">
        {loading?<Working/>:result?<ReferenceOutputBoard outputKey={outputKey} result={result} inputs={completedInputs} conditionsClose={conditionsClose}/>:<WaitingReferenceBoard outputKey={outputKey}/>}

        <section className="focused-visualizations">
          <header><div><small>DYNAMIC VISUALIZATIONS</small><h2>{meta.label} response to this calculation</h2><p>{result?result.modelCurves.source:"Run a calculation to generate condition-specific model curves."}</p></div><span>{result?"Latest scenario":"Waiting"}</span></header>
          {result?<div className="focused-chart-grid">
            <DynamicTrendChart outputKey={outputKey} result={result}/>
            <MiniScatterChart title={`Retention time vs ${meta.label}`} xValues={result.modelCurves.hrt.map(point=>point.input)} yValues={result.modelCurves.hrt.map(curveValue)} color={meta.color} xUnit="hours" yUnit={meta.unit} currentX={result.modelCurves.current.hrt} currentY={result.modelCurves.current[outputKey]}/>
            <MiniScatterChart title={`pH vs ${meta.label}`} xValues={result.modelCurves.ph.map(point=>point.input)} yValues={result.modelCurves.ph.map(curveValue)} color={meta.color} xUnit="pH" yUnit={meta.unit} currentX={result.modelCurves.current.ph} currentY={result.modelCurves.current[outputKey]}/>
          </div>:<div className="dynamic-chart-waiting"><span>⌁</span><b>Dynamic charts are waiting</b><p>Adjust plant values and select Calculate production. No placeholder curve is shown.</p></div>}
        </section>
      </main>
    </div>
  </div>;
}

function RangeField({label,value,min,max,step,unit,onChange}:{label:string;value:number;min:number;max:number;step:number;unit:string;onChange:(value:number)=>void}){
  return <label className="focused-range"><span><b>{label}</b><em>{format(value)} {unit}</em></span><input type="range" min={min} max={max} step={step} value={Math.max(min,Math.min(max,value))} onChange={event=>onChange(Number(event.target.value))}/><small><span>{min} {unit}</span><span>{max} {unit}</span></small></label>;
}

function WaitingReferenceBoard({outputKey}:{outputKey:OutputKey}){
  const meta=outputs[outputKey];
  return <section className="reference-output-board reference-waiting" style={{"--reference-accent":meta.color} as React.CSSProperties}>
    <header className="reference-output-head"><div><small>CLIENT PRODUCTION VIEW</small><h3>{meta.label} production — waiting for calculation</h3></div><div><span>Total predicted {meta.label.toLowerCase()}</span><b>Waiting</b><small>Use Calculate production</small></div></header>
    <div className="reference-output-layout"><div className="potential-stack"><section className="potential-card"><header><div><small>TOP POTENTIAL</small><h4>AI-optimized scenario</h4></div><span>Waiting</span></header><div className="waiting-lines"><i/><i/><i/></div></section><section className="potential-card least-potential"><header><div><small>LEAST POTENTIAL</small><h4>Baseline scenario</h4></div><span>Waiting</span></header><div className="waiting-lines"><i/><i/><i/></div></section></div><aside className="reference-controls"><section className="reference-control-card"><header><h4>Temperature of digester</h4><span>Waiting</span></header><p>Run a calculation to see current and target values.</p><div className="reference-scale"/></section><section className="reference-control-card"><header><h4>pH of feed</h4><span>Waiting</span></header><p>Run a calculation to see current and target values.</p><div className="reference-scale"/></section></aside></div>
  </section>;
}

function DynamicTrendChart({outputKey,result}:{outputKey:OutputKey;result:Prediction}){
  const meta=outputs[outputKey];
  const optimized=result.hourlyForecast.map(point=>outputKey==="biogas"?point.biogas:outputKey==="electricity"?point.electricity:point.biogas*point.ch4/100);
  const baseline=result.hourlyForecast.map(point=>outputKey==="biogas"?point.baselineBiogas:outputKey==="electricity"?point.baselineElectricity:point.baselineBiogas*result.baseline.methanePct/100);
  const all=[...optimized,...baseline];const min=Math.min(...all)*.97,max=Math.max(...all)*1.03;const width=500,height=180,pad=30;
  const points=(values:number[])=>values.map((value,index)=>`${pad+index*((width-pad*2)/(values.length-1))},${height-pad-(value-min)/Math.max(max-min,.01)*(height-pad*2)}`).join(" ");
  return <article className="focused-line-chart"><h3>Next 24 hours from current plant values</h3><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${meta.label} calculated 24-hour baseline and optimized forecast`}><g>{[0,1,2].map(index=><line key={index} x1={pad} x2={width-pad} y1={pad+index*55} y2={pad+index*55}/>)}</g><polyline className="dynamic-baseline" points={points(baseline)}/><polyline className="dynamic-optimized" style={{stroke:meta.color}} points={points(optimized)}/><text x={pad} y={height-7}>Now</text><text x={width-pad} y={height-7} textAnchor="end">24h</text></svg><div><span><i className="baseline-key"/>Modeled baseline</span><span><i style={{background:meta.color}}/>Current-condition forecast</span><b>{meta.unit}</b></div></article>;
}

function MiniScatterChart({title,xValues,yValues,color,xUnit,yUnit,currentX,currentY}:{title:string;xValues:number[];yValues:number[];color:string;xUnit:string;yUnit:string;currentX:number;currentY:number}){
  const width=300,height=165,pad=28;
  const minX=Math.min(...xValues,currentX),maxX=Math.max(...xValues,currentX),minY=Math.min(...yValues,currentY),maxY=Math.max(...yValues,currentY);
  const x=(value:number)=>pad+(value-minX)/Math.max(maxX-minX,.01)*(width-pad*2);
  const y=(value:number)=>height-pad-(value-minY)/Math.max(maxY-minY,.01)*(height-pad*2);
  const curvePoints=xValues.map((value,index)=>`${x(value)},${y(yValues[index])}`).join(" ");
  return <article className="mini-scatter"><h3>{title}</h3><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} calculated by sweeping one model value through the current scenario`}><g>{[0,1,2].map(index=><line key={index} x1={pad} x2={width-pad} y1={pad+index*54} y2={pad+index*54}/>)}</g><polyline points={curvePoints} style={{stroke:color}}/>{xValues.map((value,index)=><circle key={index} cx={x(value)} cy={y(yValues[index])} r="4" style={{fill:color}}/>)}<circle className="current-scenario-point" cx={x(currentX)} cy={y(currentY)} r="7" style={{fill:color}}/><text x={pad} y={height-7}>{format(minX)}</text><text x={width-pad} y={height-7} textAnchor="end">{format(maxX)} {xUnit}</text></svg><p><i style={{background:color}}/> Current value: {format(currentX)} {xUnit} · {format(currentY)} {yUnit}</p></article>;
}

function ReferenceOutputBoard({outputKey,result,inputs,conditionsClose}:{outputKey:OutputKey;result:Prediction;inputs:Inputs;conditionsClose:number}){
  const meta=outputs[outputKey];
  const before=meta.before(result);
  const after=meta.after(result);
  const extra=after-before;
  const improvement=before>0?extra/before:0;
  const potential=extra<=0?"Low":improvement>=.15?"High":"Medium";
  const gaps=[
    {label:"Retention time",current:inputs.hrt,target:result.bestSetpoints.hrt,unit:"hours",width:Math.min(100,Math.abs(inputs.hrt-result.bestSetpoints.hrt)/8*100)},
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
          <div className="potential-row"><i/><p><b>Plant values still needing attention</b><small>Distance from modeled targets</small></p><strong>{3-conditionsClose} of 3</strong></div>
          <div className="potential-row"><i/><p><b>Pattern evidence</b><small>How the scenario was calculated</small></p><strong>{result.outOfRange?"Nearest pattern":"Supplied pattern"}</strong></div>
        </section>
      </div>

      <aside className="reference-controls">
        {controlCards.map(card=>{
          const position=Math.max(2,Math.min(98,(card.current-card.min)/(card.max-card.min)*100));
          const targetPosition=Math.max(2,Math.min(98,(card.target-card.min)/(card.max-card.min)*100));
          return <section className="reference-control-card" key={card.label}>
            <header><h4>{card.label}</h4><span>Target {format(card.target)} {card.unit}</span></header>
            <p>Current value <b>{format(card.current)} {card.unit}</b></p>
            <div className="reference-scale"><i className="reference-current" style={{left:`${position}%`}}/><i className="reference-target" style={{left:`${targetPosition}%`}}/></div>
            <footer><span>{card.min} {card.unit}</span><span>Current</span><span>{card.max} {card.unit}</span></footer>
          </section>;
        })}
      </aside>
    </div>

    <div className="reference-insights">
      <section>
        <small>OPTIMIZATION INSIGHT</small>
        <h4>{result.recommendations[0]?.title||"Keep the current plant values"}</h4>
        <p>{result.recommendations[0]?.detail||"The current plant values are close to the modeled operating point."}</p>
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
        <div className="stage-title"><span>01</span><div><small>READJUSTMENT ONLY</small><h3>Wastewater tank</h3></div></div>
        <div className="tank-shape"><div/><b>COD</b><strong>{format(inputs.codIn)}</strong><small>mg/L</small></div>
        <dl><div><dt>Feedstock</dt><dd>{inputs.feedstock}</dd></div><div><dt>Feed rate</dt><dd>{format(inputs.feedRate)} kg VS/day</dd></div><div><dt>Feed valve</dt><dd className={feedValve?.tone==="warning"?"state-warning":"state-good"}>{feedValve?.state||"PULSED"}</dd></div></dl>
      </article>
      <div className="process-link"><span>FLOW</span><i/><b>→</b></div>
      <article className="process-stage digester-stage">
        <div className="stage-title"><span>02</span><div><small>READJUSTMENT ONLY</small><h3>Biogas digester</h3></div></div>
        <div className="digester-shape"><i/><b>DIGESTER</b><span>HRT MODEL</span></div>
        <dl><div><dt>Temperature</dt><dd>{format(inputs.temperature)} °C</dd></div><div><dt>pH</dt><dd>{format(inputs.ph)}</dd></div><div><dt>Retention time</dt><dd>{format(inputs.hrt)} hours</dd></div><div><dt>OLR</dt><dd>{format(inputs.olr)} kg VS/m³·d</dd></div></dl>
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
  if(!runs.length)return <div className="empty-history"><span>≡</span><b>No calculations yet</b><p>Your recent plant readjustment and output comparisons will appear here.</p></div>;
  return <div className="run-table"><div className="run-row run-head"><span>Run</span><span>Plant values</span><span>Before</span><span>After</span><span>Extra</span><span>Recommendation</span></div>{runs.map(run=>{const before=meta.before(run.result),after=meta.after(run.result);return <div className="run-row" key={run.id}><b>{run.time}<small>Short-HRT model</small></b><span>{run.inputs.temperature}°C • pH {run.inputs.ph} • {run.inputs.hrt} hours</span><span>{format(before)} {meta.unit}</span><strong>{format(after)} {meta.unit}</strong><em>+{format(after-before)} {meta.unit}</em><span>{run.result.recommendations[0]?.title||"Hold values"}</span></div>})}</div>;
}

function DataSourceRail({active,dark=false,compact=false}:{active:"manual"|"batch";dark?:boolean;compact?:boolean}){
  const sources=[
    {key:"manual",icon:"⌁",label:"Plant readjustment",value:"One plant condition",detail:"Working now • /api/predict"},
    {key:"batch",icon:"▤",label:"Online reading",value:"Simulated operating conditions",detail:"Working now • AI model route"},
    {key:"iot",icon:"◌",label:"IoT / SCADA",value:"Sensor reading",detail:"Available when equipment is connected"},
  ] as const;
  return <section className={`data-source-rail ${dark?"dark":""} ${compact?"compact":""}`} aria-label="Three model operating routes">
    <header><div><small>THREE OPERATING ROUTES</small><b>One shared five-value model contract</b></div><span>{active==="manual"?"Plant readjustment selected":"Online reading selected"}</span></header>
    <div className="data-source-list">{sources.map(source=>{
      const selected=source.key===active;
      const standby=source.key==="iot";
      return <article key={source.key} className={`${selected?"selected":""} ${standby?"standby":""}`}><i>{source.icon}</i><div><small>{source.label}</small><b>{source.value}</b><span>{source.detail}</span></div><em>{selected?"In use":standby?"Future":"Ready"}</em></article>;
    })}</div>
    <p>{active==="manual"?"This calculation uses one plant readjustment. Online reading separately prepares 2,000 model results from operating conditions.":"Online reading simulates multiple operating conditions, then prepares 2,000 fresh model results. Plant readjustment remains a separate working route."}</p>
  </section>;
}

function BatchAiAnalysisCenter({stages,stage,paused,onTogglePause}:{stages:BatchWorkflowStage[];stage:number;paused:boolean;onTogglePause:()=>void}){
  const nodeMeta=[
    {type:"WEB TRIGGER",icon:"↗",evidence:["One authenticated online-reading request","Generate AI model output selected","No browser-generated rows"]},
    {type:"DATA",icon:"▤",evidence:["500 supplied short-HRT operating rows","Only operating-condition values read","Workbook output columns excluded"]},
    {type:"VALIDATION",icon:"✓",evidence:["Five trained values per source row","HRT retained in hours","Operating envelope recorded"]},
    {type:"FEATURE PIPELINE",icon:"▦",evidence:["Feed, temperature, pH, OLR and HRT","Deterministic model features","No Excel lookup at runtime"]},
    {type:"MODEL",icon:"ƒ",evidence:["Trained short-HRT Ridge coefficients","Condition-responsive baseline","Model output is recalculated"]},
    {type:"AI SCENARIO ENGINE",icon:"◎",evidence:["2,000 fresh candidate values","Deterministic bounded search","Candidate ranking by model output"]},
    {type:"FUNCTION",icon:"Σ",evidence:["Biogas, methane and electricity","H₂S removal and CO₂e estimate","Six labelled KPI channels"]},
    {type:"AUDIT",icon:"≡",evidence:["Daily drill-down prepared","12 labelled model periods","Report evidence persisted when configured"]},
  ];
  const nodes=stages.map((item,index)=>({...item,...(nodeMeta[index]||nodeMeta[nodeMeta.length-1])}));
  const safeStage=Math.min(stage,nodes.length-1);
  const [selected,setSelected]=useState(0);
  useEffect(()=>setSelected(safeStage),[safeStage]);
  const selectedNode=nodes[Math.min(selected,nodes.length-1)];
  const activeNode=nodes[safeStage];
  return <div className="ai-analysis-overlay batch-ai-analysis-overlay" role="dialog" aria-modal="true" aria-label="Online-reading AI workflow in progress">
    <section className="ai-analysis-center batch-ai-analysis-center">
      <header><div><span className={`live-model-dot ${paused?"paused":""}`}/><small>{paused?"WORKFLOW PAUSED FOR AUDIT":"LIVE AI + MODEL WORKFLOW"}</small><h2>Online-reading AI execution is visible</h2><p>{paused?"The visual trace is paused at the selected stage for auditor review. Resume to continue the staged trace; this never sends a command to plant equipment.":"Each connected node represents an implemented online-reading, model or audit step for this 2,000-output request."}</p></div><div className="analysis-header-actions"><button type="button" onClick={onTogglePause} aria-pressed={paused}>{paused?"▶ Resume workflow":"Ⅱ Pause workflow"}</button><div className="analysis-run-status"><b>{String(safeStage+1).padStart(2,"0")}</b><span>of {String(nodes.length).padStart(2,"0")} nodes</span></div></div></header>
      <div className="analysis-progress"><i style={{width:`${(safeStage+1)/nodes.length*100}%`}}/></div>
      <div className="live-workflow-shell">
        <DataSourceRail active="batch" dark compact/>
        <div className="live-workflow-toolbar"><div><span className="workflow-toolbar-button">＋</span><span>Online-reading AI data flow</span><em className={paused?"paused":""}>{paused?"PAUSED AUDITOR VIEW":"ACTIVE EXECUTION"}</em></div><p><i/>AI MODEL REQUEST <b>•</b> authenticated server request</p></div>
        <div className="live-workflow-canvas" aria-label="Connected online-reading AI workflow nodes">
          {nodes.map((item,index)=>{
            const status=index<safeStage?"complete":index===safeStage?(paused?"paused":"running"):"queued";
            return <div className={`workflow-node-wrap ${status}`} key={item.label}>
              <button type="button" className={`live-workflow-node ${selected===index?"selected":""}`} onClick={()=>setSelected(index)} aria-pressed={selected===index}>
                <span>{item.icon}</span><small>{item.type}</small><b>{item.label}</b><em>{status==="complete"?"Completed":status==="running"?"Running now":status==="paused"?"Paused for review":"Waiting"}</em>
              </button>
              {index<nodes.length-1&&<i className="workflow-connector"><b/></i>}
            </div>;
          })}
        </div>
        <div className="workflow-live-inspector batch-workflow-live-inspector">
          <header><span>{selectedNode.icon}</span><div><small>{selectedNode.type} • NODE {String(selected+1).padStart(2,"0")}</small><h3>{selectedNode.label}</h3><p>{selectedNode.detail}</p></div></header>
          <div>{selectedNode.evidence.map(item=><span key={item}><i/> {item}</span>)}</div>
          <aside><small>{paused?"PAUSED AUDITOR VIEW":"LIVE STATUS"}</small><b>{selected<safeStage?"Completed by the AI run":selected===safeStage?(paused?`Paused at: ${activeNode.label}`:`Running: ${activeNode.label}`):"Queued behind the active node"}</b><p>{paused?"Use the node cards to inspect implementation evidence, then select Resume workflow. The pause only controls the visual explanation.":"The KPI and CSV outputs appear only after the server completes its AI calculation and audit record."}</p></aside>
        </div>
        <div className="workflow-output-preview batch-workflow-output-preview"><span style={{"--output-accent":"#1187f5"} as React.CSSProperties}><i>▤</i><b>2,000 AI candidates</b><em>being calculated</em></span><span style={{"--output-accent":"#16a777"} as React.CSSProperties}><i>◆</i><b>Six KPI outputs</b><em>waiting for model</em></span><span style={{"--output-accent":"#e5a51c"} as React.CSSProperties}><i>≡</i><b>Daily + monthly reports</b><em>waiting for audit</em></span></div>
      </div>
      <footer><span><i/> {paused?"Workflow paused — resume when the auditor is ready":"Visible staged explanation while the online-reading request runs"}</span><p>Fresh 2,000 scenario outputs are calculated by the deployed model; workbook output values are not copied into this run.</p></footer>
    </section>
  </div>;
}

function AiAnalysisCenter({inputs,activeOutput,stage,paused,onTogglePause}:{inputs:Inputs;activeOutput:OutputKey;stage:number;paused:boolean;onTogglePause:()=>void}){
  const stages=[
    {type:"WEB TRIGGER",icon:"↗",label:"Plant readjustment submitted",detail:"The Calculate button sent one authenticated request to POST /api/predict.",evidence:["One API request received","Five short-HRT plant values attached","No browser-generated output values"]},
    {type:"LANGGRAPH",icon:"✓",label:"Validate five plant values",detail:"The LangGraph validation node checks feed rate, temperature, pH, OLR and HRT in hours against the short-HRT research range.",evidence:["Five trained-model features","2–24 hour HRT checks","Out-of-range values remain explicit estimates"]},
    {type:"LANGGRAPH",icon:"▦",label:"Prepare model features",detail:"The LangGraph feature node standardizes the five submitted values for the exported short-HRT coefficients.",evidence:["500 supplied synthetic rows","Five numeric plant values","No Excel lookup at runtime"]},
    {type:"MODEL",icon:"ƒ",label:"Run trained Ridge model",detail:"The quadratic Ridge model predicts biogas, methane, electricity and filtered H₂S.",evidence:["Five plant values influence the run","Trained server coefficients","Biogas, methane and electricity calculated"]},
    {type:"FUNCTION",icon:"Σ",label:"Calculate current baseline",detail:"A condition-responsive current-process baseline is calculated from the same five values.",evidence:["Biogas baseline","Methane baseline","Electricity baseline"]},
    {type:"AI AGENT",icon:"◎",label:"Search lower-HRT scenarios",detail:"A deterministic bounded search finds lower-HRT options that protect all three production outputs.",evidence:["3,125 nearby model evaluations","Recommended setpoint simulation","Lower-HRT action ranking"]},
    {type:"POLICY",icon:"◇",label:"Safety and approval gate",detail:"The policy node checks configured methane and H₂S limits before presenting an advisory action.",evidence:["Operator approval required","No equipment commands","Safety threshold check"]},
    {type:"AUDIT",icon:"≡",label:"Persist audit evidence",detail:"The server returns an execution trace and writes a source-labelled audit/KPI record when Supabase is configured.",evidence:["Execution ID generated","Eight server stages returned","No random output values"]},
  ];
  const [selected,setSelected]=useState(0);
  useEffect(()=>setSelected(Math.min(stage,stages.length-1)),[stage,stages.length]);
  const current=stages[Math.min(stage,stages.length-1)];
  const selectedNode=stages[selected];
  const inputEvidence=[
    `${format(inputs.feedRate)} kg VS/day feed rate`,`${format(inputs.temperature)} °C and pH ${format(inputs.ph)}`,
    `OLR ${format(inputs.olr)} kg VS/m³·d`,`HRT ${format(inputs.hrt)} hours`,`Five values used by the short-HRT model`,
  ];
  return <div className="ai-analysis-overlay" role="dialog" aria-modal="true" aria-label="AI model analysis in progress">
    <section className="ai-analysis-center">
      <header><div><span className={`live-model-dot ${paused?"paused":""}`}/><small>{paused?"WORKFLOW PAUSED FOR REVIEW":"LIVE LANGGRAPH + MODEL WORKFLOW"}</small><h2>AI execution is visible</h2><p>{paused?"The visual workflow is frozen at the selected node so you can inspect its implemented evidence. The server request continues safely in the background.":"Each connected node corresponds to an implemented LangGraph or server-model step in this prediction request."}</p></div><div className="analysis-header-actions"><button type="button" onClick={onTogglePause} aria-pressed={paused}>{paused?"▶ Resume workflow":"Ⅱ Pause workflow"}</button><div className="analysis-run-status"><b>{String(stage+1).padStart(2,"0")}</b><span>of {String(stages.length).padStart(2,"0")} nodes</span></div></div></header>
      <div className="analysis-progress"><i style={{width:`${(stage+1)/stages.length*100}%`}}/></div>
      <div className="live-workflow-shell">
        <DataSourceRail active="manual" dark compact/>
        <div className="live-workflow-toolbar"><div><span className="workflow-toolbar-button">＋</span><span>Production prediction workflow</span><em className={paused?"paused":""}>{paused?"PAUSED FOR REVIEW":"ACTIVE EXECUTION"}</em></div><p><i/>POST /api/predict <b>•</b> authenticated server request</p></div>
        <div className="live-workflow-canvas" aria-label="Connected AI workflow nodes">
          {stages.map((item,index)=>{
            const status=index<stage?"complete":index===stage?(paused?"paused":"running"):"queued";
            return <div className={`workflow-node-wrap ${status}`} key={item.label}>
              <button type="button" className={`live-workflow-node ${selected===index?"selected":""}`} onClick={()=>setSelected(index)} aria-pressed={selected===index}>
                <span>{item.icon}</span><small>{item.type}</small><b>{item.label}</b><em>{status==="complete"?"Completed":status==="running"?"Running now":status==="paused"?"Paused for review":"Waiting"}</em>
              </button>
              {index<stages.length-1&&<i className="workflow-connector"><b/></i>}
            </div>;
          })}
        </div>
        <div className="workflow-live-inspector">
          <header><span>{selectedNode.icon}</span><div><small>{selectedNode.type} • NODE {String(selected+1).padStart(2,"0")}</small><h3>{selectedNode.label}</h3><p>{selectedNode.detail}</p></div></header>
          <div>{(selected===0?inputEvidence:selectedNode.evidence).map(item=><span key={item}><i/> {item}</span>)}</div>
          <aside><small>{paused?"PAUSED STATUS":"LIVE STATUS"}</small><b>{selected<stage?"Completed by the server":selected===stage?(paused?`Paused at: ${current.label}`:`Running: ${current.label}`):"Queued behind the active node"}</b><p>{paused?"The workflow visual is paused for explanation. It does not cancel or alter the server-side prediction.":"Final production numbers appear only after the API returns its completed trace."}</p></aside>
        </div>
        <div className="workflow-output-preview">{(Object.keys(outputs) as OutputKey[]).map(key=><span key={key} className={activeOutput===key?"active":""} style={{"--output-accent":outputs[key].color} as React.CSSProperties}><i>{outputs[key].icon}</i><b>{outputs[key].label}</b><em>waiting for model</em></span>)}</div>
      </div>
      <footer><span><i/> {paused?"Workflow paused — select Resume workflow to continue the visual trace":"Visible staged explanation while the server request runs"}</span><p>No random result values are displayed. The completed server trace is shown after the response returns.</p></footer>
    </section>
  </div>;
}

function CompletedWorkflowCanvas({result,inputs}:{result:Prediction;inputs:Inputs}){
  const [selected,setSelected]=useState(0);
  const kinds=["LANGGRAPH","LANGGRAPH","MODEL","FUNCTION","AI AGENT","POLICY","AUDIT","AUDIT"];
  const icons=["✓","▦","ƒ","Σ","◎","◇","≡","▣"];
  const evidence=[
    [
      {label:"Submitted feed rate",value:`${format(inputs.feedRate)} kg VS/day`},
      {label:"Process values",value:`${format(inputs.temperature)} °C • pH ${format(inputs.ph)} • OLR ${format(inputs.olr)}`},
      {label:"Retention time",value:`${format(inputs.hrt)} hours`},
    ],
    [
      {label:"Feature set",value:"Feed rate, temperature, pH, OLR and HRT"},
      {label:"Training rows",value:`${result.modelTrace.coverageRows} supplied short-HRT synthetic rows`},
      {label:"Runtime",value:"Exported TypeScript coefficients — no Excel lookup"},
    ],
    [
      {label:"Predicted biogas",value:`${format(result.optimized.biogas)} m³/day`},
      {label:"Predicted methane",value:`${format(result.optimized.methane)} m³ CH₄/day`},
      {label:"Predicted electricity",value:`${format(result.optimized.electricity)} kWh/day`},
    ],
    [
      {label:"Current baseline biogas",value:`${format(result.baseline.biogas)} m³/day`},
      {label:"Current baseline methane",value:`${format(result.baseline.methane)} m³ CH₄/day`},
      {label:"Current baseline electricity",value:`${format(result.baseline.electricity)} kWh/day`},
    ],
    [
      {label:"Recommended HRT",value:`${format(result.bestSetpoints.hrt)} hours`},
      {label:"Recommendation",value:result.recommendations[0]?.title||"Maintain current settings"},
      {label:"Search size",value:`${result.modelTrace.scenarioCount.toLocaleString()} bounded candidate evaluations`},
    ],
    [
      {label:"Safety posture",value:"Advisory only — operator approval required"},
      {label:"Equipment control",value:"Disabled: no IoT device is connected"},
      {label:"Gas output",value:`${format(result.optimized.methanePct)}% CH₄ • ${format(result.optimized.h2s)} ppm H₂S`},
    ],
    [
      {label:"Trace nodes",value:`${result.modelTrace.stages.length} completed server steps`},
      {label:"Run ID",value:result.runId},
      {label:"Model",value:result.modelVersion},
    ],
    [
      {label:"Execution ID",value:result.modelTrace.executionId},
      {label:"Audit record",value:`${result.audit.status} • deterministic result`},
      {label:"KPI record",value:"Source-labelled modelled prediction when report storage is configured"},
    ],
  ];
  const nodeIndex=Math.min(selected,result.modelTrace.stages.length-1);
  const selectedTrace=result.modelTrace.stages[nodeIndex];
  return <div className="completed-workflow">
    <div className="completed-workflow-toolbar"><div><span>✓</span><p><b>Completed backend workflow</b><small>Click any node to inspect its returned evidence</small></p></div><code>{result.modelTrace.endpoint}</code><em>RUN {result.runId.split("-")[0].toUpperCase()}</em></div>
    <div className="completed-workflow-canvas">
      {result.modelTrace.stages.map((item,index)=><div className="completed-node-wrap" key={item.label}>
        <button type="button" className={selected===index?"selected":""} onClick={()=>setSelected(index)} aria-pressed={selected===index}><span>{icons[index]||"✓"}</span><small>{kinds[index]||"STEP"}</small><b>{item.label}</b><em>Completed</em></button>
        {index<result.modelTrace.stages.length-1&&<i><b/></i>}
      </div>)}
    </div>
    <div className="completed-workflow-inspector">
      <header><span>{icons[nodeIndex]||"✓"}</span><div><small>{kinds[nodeIndex]||"STEP"} • SERVER TRACE</small><h3>{selectedTrace.label}</h3><p>{selectedTrace.detail}</p></div></header>
      <div>{(evidence[nodeIndex]||[]).map(item=><p key={item.label}><span>{item.label}</span><b>{item.value}</b></p>)}</div>
      <aside><small>PROOF</small><b>Returned by {result.modelTrace.implementation}</b><code>{result.modelTrace.executionId}</code><em>{new Date(result.modelTrace.executedAt).toLocaleString()}</em></aside>
    </div>
  </div>;
}

function ModelEvidencePanel({result,inputs}:{result:Prediction;inputs:Inputs}){
  const sensitivity=(result.modelTrace.inputSensitivity||[]).slice(0,6);
  const nearest=result.modelTrace.nearestScenarios||[];
  return <section className="model-evidence-panel" aria-label="Completed AI model evidence">
    <header><div><small>EXPLAINABLE AI</small><h2>What the model did with this run</h2><p>Completed server evidence—not a decorative or random animation.</p></div><span><i/>Calculation verified</span></header>
    <CompletedWorkflowCanvas result={result} inputs={inputs}/>
    <div className="evidence-grid">
      <section className="sensitivity-card"><div className="evidence-card-title"><div><small>PLANT RESPONSE CHECK</small><h3>Which plant values moved the model most?</h3></div><span>Local model re-runs</span></div><p className="evidence-help">Each bar comes from re-running the model slightly above and below the submitted value. It is a local response check, not a claim of physical causation.</p><div className="sensitivity-bars">{sensitivity.map((item,index)=><div key={item.label}><span><b>{index+1}. {item.label}</b><small>{item.direction==="scenario switch"?"Compared across feedstock categories":`${item.direction==="increase"?"Higher":"Lower"} test produced the larger result`}</small></span><i><b style={{width:`${Math.max(4,item.strength)}%`}}/></i><strong>{format(item.response)}<small>m³/day response</small></strong></div>)}</div></section>
      <aside className="scenario-evidence-card"><div className="evidence-card-title"><div><small>MODEL SEARCH</small><h3>Evidence used</h3></div><span>{result.modelTrace.scenarioCount.toLocaleString()} candidates</span></div><div className="scenario-match-list">{nearest.map((scenario,index)=><div key={scenario.anchor}><span>{index+1}</span><p><b>{scenario.anchor}</b><small>{scenario.feedstock}</small></p><em>{index===0?"Training envelope":"Supporting evidence"}</em></div>)}</div><dl><div><dt>Algorithm</dt><dd>{result.modelTrace.algorithm}</dd></div><div><dt>Random numbers</dt><dd>{result.modelTrace.randomized?"Used":"Not used"}</dd></div><div><dt>Plant values processed</dt><dd>{result.modelTrace.inputCount} trained features</dd></div><div><dt>Execution</dt><dd>{result.runId.split("-")[0].toUpperCase()}</dd></div></dl></aside>
    </div>
    <footer><div><span>VALIDATE</span><i/> <span>MODEL INFERENCE</span><i/> <span>BASELINE</span><i/> <span>LOWER-HRT SEARCH</span><i/> <span>POLICY + AUDIT</span></div><p>Operator review is still required before changing real plant equipment.</p></footer>
  </section>;
}

function EmptyResult(){return <div className="empty-result"><span>1</span><i>→</i><span>2</span><i>→</i><span>3</span><div><b>Set plant values</b><b>Run calculation</b><b>Compare results</b></div><p>No placeholder numbers are shown. Results appear only after the model runs.</p></div>}
function Working(){return <div className="working"><span className="agent-orb">✦</span><h2>AI Analysis Center is running</h2><p>Follow the live model workflow shown on screen.</p><div><i/><i/><i/></div></div>}

function Copilot({messages,question,busy,result,onQuestion,onAsk,onClose,onApply}:{messages:{role:"ai"|"user";text:string}[];question:string;busy:boolean;result:Prediction|null;onQuestion:(v:string)=>void;onAsk:(e?:FormEvent)=>void;onClose:()=>void;onApply:()=>void}){
  return <aside className="chat-panel"><header><div><small>DATA-AWARE ASSISTANT</small><h2>AQUAIVOLT Copilot</h2></div><button onClick={onClose}>×</button></header><div className="chat-context"><span>{result?`Ready to explain run ${result.runId.split("-")[0].toUpperCase()}`:"Run a calculation for a specific answer"}</span></div><div className="chat-messages">{messages.map((message,index)=><div key={index} className={message.role}>{message.text}</div>)}{busy&&<div className="ai">Thinking…</div>}</div>{result&&<button className="apply-setpoints" onClick={onApply}>Copy recommended plant values</button>}<form onSubmit={onAsk}><input value={question} onChange={event=>onQuestion(event.target.value)} placeholder="Ask what changed or why…"/><button disabled={busy||!question.trim()}>↑</button></form></aside>;
}

function SettingsModal({settings,message,onChange,onSave,onClose}:{settings:AdminSettings|null;message:string;onChange:(v:AdminSettings)=>void;onSave:(e:FormEvent)=>void;onClose:()=>void}){
  return <div className="modal-backdrop" onClick={onClose}><section className="settings-modal" onClick={event=>event.stopPropagation()}><header><div><small>ADMIN ONLY</small><h2>Plant settings</h2></div><button onClick={onClose}>×</button></header>{!settings?<p>Loading settings…</p>:<form onSubmit={onSave}><label><span>Facility name</span><input value={settings.facilityName} onChange={event=>onChange({...settings,facilityName:event.target.value})}/></label><label><span>Facility location</span><input value={settings.facilityLocation} onChange={event=>onChange({...settings,facilityLocation:event.target.value})}/></label><label><span>H₂S warning</span><div><input type="number" value={settings.h2sWarning} onChange={event=>onChange({...settings,h2sWarning:Number(event.target.value)})}/><em>ppm</em></div></label><div className="settings-pair"><label><span>Pressure minimum</span><input type="number" value={settings.pressureMinimum} onChange={event=>onChange({...settings,pressureMinimum:Number(event.target.value)})}/></label><label><span>Pressure maximum</span><input type="number" value={settings.pressureMaximum} onChange={event=>onChange({...settings,pressureMaximum:Number(event.target.value)})}/></label></div>{message&&<p className="settings-message">{message}</p>}<button className="save-settings">Save settings</button></form>}</section></div>;
}

function format(value:number){return Math.abs(value)>=100?value.toFixed(0):Math.abs(value)>=10?value.toFixed(1):value.toFixed(2)}
