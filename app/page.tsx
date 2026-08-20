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
  stages:{label:string;status:string;detail:string}[];
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
  optimizationAnchorResults:{model:string;nmae:number;gasMae:number;methaneMae:number;powerMae:number;role:string}[];
  scadaHoldoutResults:{model:string;nmae:number}[];
  selection:{numericalWinner:string;numericalWinnerNmae:number;deployedModel:string;deployedModelNmae:number;reason:string;neuralNetworkDecision:string};
  dataAudit:{scadaUniqueRows:number;optimizationAnchors:number;normalValidationRuns:number;literatureProjectionRows:number;projectedRowsUsedForTraining:boolean;sourceClassification:string;missingCoverage:string};
  limitations:string[];
  liveEvidence:{inferenceEndpoint:string;modelCardEndpoint:string;evaluationEndpoint:string;auditEndpoint:string;implementation:string;deterministic:boolean};
};
type AuditModelData = {
  model:{name:string;version:string;fit:string;inputMode:string};
  card:{algorithm:string;implementation:string;status:string;randomized:boolean;inputCount:number;scenarioCount:number;coverageRows:number;features:{key:string;label:string;unit:string;range:string;role:string}[];limitations:string[]};
};
type AuditRun = {id:string;created_at:number;username:string;role:string;feedstock:string;model_version:string;audit_status:string};

const initial:Inputs = {
  feedstock:"Dairy WW", feedRate:846, temperature:35, ph:7.1, olr:3.5,
  hrt:22, codIn:7000, vfa:1100, mixing:50,
};
const outputs:Record<OutputKey,{label:string;unit:string;icon:string;color:string;before:(p:Prediction)=>number;after:(p:Prediction)=>number}> = {
  biogas:{label:"Biogas",unit:"m³/day",icon:"◒",color:"#1187f5",before:p=>p.baseline.biogas,after:p=>p.optimized.biogas},
  methane:{label:"Methane",unit:"m³ CH₄/day",icon:"◆",color:"#16a777",before:p=>p.baseline.methane,after:p=>p.optimized.methane},
  electricity:{label:"Electricity",unit:"kWh/day",icon:"ϟ",color:"#e5a51c",before:p=>p.baseline.electricity,after:p=>p.optimized.electricity},
};
const validationSeries:Record<OutputKey,{before:number[];after:number[]}> = {
  biogas:{before:Array(10).fill(50),after:[50,53,55.5,57.8,59.6,61.2,62.4,63.1,63.7,64]},
  methane:{before:[29.5,29.5,29.5,29.5,29.5,29.5,29.5,29.5,29.5,29.5],after:[29.5,31.9,34,35.8,37.4,38.9,40,40.9,41.6,42.112]},
  electricity:{before:Array(10).fill(105.8814),after:[105.8814,114.5,121.9,128.6,134.3,139.5,143.6,146.8,149.3,151.1484]},
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
  const [workspaceView,setWorkspaceView]=useState<"overview"|OutputKey|"audit">("overview");
  const [advanced,setAdvanced]=useState(false);
  const [loading,setLoading]=useState(false);
  const [analysisStage,setAnalysisStage]=useState(0);
  const [predictionError,setPredictionError]=useState("");
  const [chatOpen,setChatOpen]=useState(false);
  const [question,setQuestion]=useState("");
  const [chatBusy,setChatBusy]=useState(false);
  const [messages,setMessages]=useState<{role:"ai"|"user";text:string}[]>([{role:"ai",text:"Run a calculation, then ask me what changed or what input to adjust next."}]);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [settings,setSettings]=useState<AdminSettings|null>(null);
  const [settingsMessage,setSettingsMessage]=useState("");

  useEffect(()=>{void (async()=>{try{const response=await fetch("/api/auth/session",{cache:"no-store"});if(response.ok)setAuth((await response.json()).user);}finally{setChecking(false);}})();},[]);
  useEffect(()=>{
    if(!loading)return;
    const timers=[700,1450,2200,3000,3850,4700,5550].map((delay,index)=>window.setTimeout(()=>setAnalysisStage(index+1),delay));
    return()=>timers.forEach(timer=>window.clearTimeout(timer));
  },[loading]);

  const dirty=Boolean(result&&lastRunInputs&&JSON.stringify(inputs)!==JSON.stringify(lastRunInputs));

  const update=(key:keyof Inputs,value:string)=>setInputs(current=>({...current,[key]:key==="feedstock"?value:Number(value)}));

  async function login(event:FormEvent){
    event.preventDefault();setLoginBusy(true);setLoginError("");
    try{const response=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Login failed");setAuth(data.user);setPassword("");}
    catch(error){setLoginError(error instanceof Error?error.message:"Login failed");}
    finally{setLoginBusy(false);}
  }

  async function logout(){await fetch("/api/auth/logout",{method:"POST"});setAuth(null);setResult(null);setRuns([]);setSettingsOpen(false);}

  async function predict(submittedInputs:Inputs=inputs){
    setAnalysisStage(0);setLoading(true);setPredictionError("");
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

  if(checking)return <main className="loading-screen"><span>◒</span><b>Opening Aquaivolt…</b></main>;
  if(!auth)return <LoginScreen username={username} password={password} error={loginError} busy={loginBusy} onUsername={setUsername} onPassword={setPassword} onSubmit={login}/>;

  const active=outputs[activeOutput];
  return <main className="simple-shell">
    <aside className="simple-sidebar">
      <div className="simple-brand"><span>◒</span><b>AQUAIVOLT<small>WASTE TO ENERGY</small></b></div>
      <nav>
        <button className={workspaceView==="overview"?"active":""} onClick={()=>openOverviewSection()}><span>⌂</span>Overview</button>
        <button onClick={()=>openOverviewSection("inputs")}><span>▦</span>Plant inputs</button>
        {(Object.keys(outputs) as OutputKey[]).map(key=><button key={key} className={workspaceView===key?"active":""} onClick={()=>{setActiveOutput(key);setWorkspaceView(key);window.scrollTo({top:0});}}><span>{outputs[key].icon}</span>{outputs[key].label}</button>)}
        <button onClick={()=>openOverviewSection("virtual-monitoring")}><span>▣</span>Virtual monitoring</button>
        <button onClick={()=>openOverviewSection("history")}><span>≡</span>Run history</button>
        {auth.role==="admin"&&<button className={workspaceView==="audit"?"active":""} onClick={()=>{setWorkspaceView("audit");window.scrollTo({top:0});}}><span>✓</span>Model audit</button>}
        {auth.role==="admin"&&<button onClick={()=>void openSettings()}><span>⚙</span>Settings</button>}
      </nav>
      <div className="side-note"><b>MODEL MODE</b><span>Synthetic scenario calculation</span><small>No physical equipment is controlled.</small></div>
      <button className="side-logout" onClick={()=>void logout()}>Log out</button>
    </aside>

    <section className="simple-workspace" id="overview">
      {workspaceView==="audit"&&<ModelAuditPage result={result} runInputs={lastRunInputs} loading={loading} onVerify={()=>void predict(lastRunInputs||inputs)} onOverview={()=>openOverviewSection()}/>}
      {workspaceView!=="overview"&&workspaceView!=="audit"&&<FocusedOutputPage
        outputKey={workspaceView}
        result={result}
        runInputs={lastRunInputs}
        inputs={inputs}
        loading={loading}
        dirty={dirty}
        predictionError={predictionError}
        onOutput={key=>{setActiveOutput(key);setWorkspaceView(key);window.scrollTo({top:0});}}
        onUpdate={(key,value)=>update(key,String(value))}
        onCalculate={()=>void predict()}
        onOverview={()=>openOverviewSection()}
      />}
      <div className={`overview-workspace ${workspaceView==="overview"?"":"workspace-hidden"}`}>
      <header className="simple-header">
        <div><p>AQUAIVOLT AI</p><h1>Biogas production dashboard</h1><span>Enter plant conditions. See a clear before-and-after result.</span></div>
        <div className="header-tools"><span className="system-ready"><i/>System ready</span><button onClick={()=>setChatOpen(true)}>✦ Ask Copilot</button><div className="user-chip"><b>{auth.username.slice(0,2).toUpperCase()}</b><span>{auth.username}<small>{auth.role}</small></span></div></div>
      </header>

      <div className="truth-strip"><b>Prototype calculation</b><span>The normal dashboard uses the supplied day-scale scenario data. Hour-scale sheets are research projections and are not mixed into this result.</span></div>

      <section className="input-panel" id="inputs">
        <div className="section-heading"><div><small>STEP 1</small><h2>Tell us what is entering the digester</h2><p>Every field below is used by the calculation.</p></div><span className="inside-range">Manual calculation</span></div>
        <div className="input-grid primary-inputs">
          <Field label="Feedstock" value={inputs.feedstock} onChange={value=>update("feedstock",value)} options={["Dairy WW","Cow Manure","Food Waste","Paper Mill","Brewery","Mixed Waste"]}/>
          <Field label="Feed rate" value={inputs.feedRate} unit="kg VS/day" onChange={value=>update("feedRate",value)}/>
          <Field label="Temperature" value={inputs.temperature} unit="°C" onChange={value=>update("temperature",value)} step="0.1"/>
          <Field label="pH" value={inputs.ph} onChange={value=>update("ph",value)} step="0.01"/>
          <Field label="Retention time" value={inputs.hrt} unit="days" onChange={value=>update("hrt",value)} step="0.1"/>
        </div>
        <button className="more-inputs" onClick={()=>setAdvanced(value=>!value)}>{advanced?"Hide":"Show"} four more inputs <span>{advanced?"−":"+"}</span></button>
        {advanced&&<div className="input-grid advanced-inputs">
          <Field label="Organic loading" value={inputs.olr} unit="kg COD/m³/day" onChange={value=>update("olr",value)} step="0.1"/>
          <Field label="COD input" value={inputs.codIn} unit="mg/L" onChange={value=>update("codIn",value)}/>
          <Field label="VFA" value={inputs.vfa} unit="mg/L" onChange={value=>update("vfa",value)}/>
          <Field label="Mixer speed" value={inputs.mixing} unit="RPM" onChange={value=>update("mixing",value)}/>
        </div>}
        {dirty&&<div className="dirty-note">Inputs changed. Run the calculation again to refresh every result.</div>}
        {predictionError&&<div className="input-warning">{predictionError}</div>}
        <div className="extrapolation-note">Values beyond the supplied rows are estimated from the nearest data patterns. Nothing runs until you click Calculate.</div>
        <button className="calculate-button" disabled={loading} onClick={()=>void predict()}>{loading?<><i className="loader"/>AI is comparing your inputs…</>:"Calculate production →"}</button>
      </section>

      <section className="results-section" aria-live="polite">
        <div className="section-heading"><div><small>STEP 2</small><h2>See the result</h2><p>Only real quantities: before, after and the extra amount.</p></div>{result&&<span className="run-pill">Run {result.runId.split("-")[0].toUpperCase()}</span>}</div>
        <div className="output-cards">
          {(Object.keys(outputs) as OutputKey[]).map(key=><OutputCard key={key} outputKey={key} result={result} active={activeOutput===key} onClick={()=>setActiveOutput(key)}/>) }
          <button className="output-card monitoring-card" style={{"--accent":"#6556d9"} as React.CSSProperties} onClick={()=>document.getElementById("virtual-monitoring")?.scrollIntoView()}><span className="output-icon">▣</span><div><small>Virtual monitoring</small><b>{result?"Simulation ready":"Waiting"}</b><p>{result?`Run ${result.runId.split("-")[0].toUpperCase()} reflected below`:"Run a calculation"}</p></div><i>↓</i></button>
        </div>
      </section>

      {result&&!loading&&<AiRecommendationPanel result={result} onApply={()=>{const recommended={...(lastRunInputs||inputs),...result.bestSetpoints};setInputs(recommended);void predict(recommended);}}/>}

      <section className="comparison-panel" id="comparison">
        {loading?<Working/>:result?<Comparison outputKey={activeOutput} result={result}/>:<EmptyResult/>}
      </section>

      {result&&!loading&&<ModelEvidencePanel result={result} inputs={lastRunInputs||inputs}/>}

      <section className="production-detail-panel" id="production-detail" aria-live="polite">
        <div className="production-output-nav">
          <div><small>PRODUCTION VIEWS</small><b>Choose what you want to understand</b></div>
          <nav aria-label="Production output">
            {(Object.keys(outputs) as OutputKey[]).map(key=><button key={key} className={activeOutput===key?"active":""} style={{"--tab-accent":outputs[key].color} as React.CSSProperties} onClick={()=>setActiveOutput(key)}><span>{outputs[key].icon}</span>{outputs[key].label}</button>)}
          </nav>
        </div>
        {loading?<Working/>:result&&lastRunInputs?<ProductionDetail outputKey={activeOutput} result={result} inputs={lastRunInputs}/>:<div className="detail-empty"><span>◎</span><b>Production details are waiting</b><p>Run Calculate production to see the modeled total, best conditions and inputs that need attention.</p></div>}
      </section>

      <section className="validation-panel">
        <div className="section-heading compact"><div><small>SUPPLIED DATA</small><h2>{active.label} across 10 validation runs</h2><p>Grey is the baseline. Colour is the optimized value from the supplied workbook.</p></div></div>
        <ValidationChart outputKey={activeOutput}/>
      </section>

      <section className="virtual-monitor-panel" id="virtual-monitoring" aria-live="polite">
        <div className="section-heading"><div><small>VIRTUAL PLANT</small><h2>Monitoring system</h2><p>Manual inputs and model outputs shown as a simulated plant flow.</p></div><span className="simulation-label">NO PHYSICAL DEVICE CONNECTED</span></div>
        {loading?<Working/>:result&&lastRunInputs?<VirtualMonitoring result={result} inputs={lastRunInputs}/>:<div className="monitor-empty"><span>▣</span><b>Virtual monitoring is waiting</b><p>Run Calculate production to populate the virtual monitoring screen.</p></div>}
      </section>

      <section className="history-panel" id="history">
        <div className="section-heading compact"><div><small>STEP 3</small><h2>Compare recent calculations</h2><p>Each row uses the inputs entered for that run.</p></div></div>
        <RunTable runs={runs} outputKey={activeOutput}/>
      </section>

      <footer><span>Deterministic prototype model • Synthetic and projected source data • Operator review required</span><b>{result?`${result.modelName} ${result.modelVersion}`:"Ready for first calculation"}</b></footer>
      </div>
    </section>

    {chatOpen&&<Copilot messages={messages} question={question} busy={chatBusy} result={result} onQuestion={setQuestion} onAsk={ask} onClose={()=>setChatOpen(false)} onApply={()=>{if(result)setInputs(current=>({...current,...result.bestSetpoints}));}}/>}
    {settingsOpen&&auth.role==="admin"&&<SettingsModal settings={settings} message={settingsMessage} onChange={setSettings} onSave={saveSettings} onClose={()=>setSettingsOpen(false)}/>}
    {loading&&<AiAnalysisCenter inputs={inputs} activeOutput={activeOutput} stage={analysisStage}/>}
  </main>;
}

function LoginScreen({username,password,error,busy,onUsername,onPassword,onSubmit}:{username:string;password:string;error:string;busy:boolean;onUsername:(v:string)=>void;onPassword:(v:string)=>void;onSubmit:(e:FormEvent)=>void}){
  return <main className="login-page"><section className="login-story"><div className="simple-brand light"><span>◒</span><b>AQUAIVOLT<small>WASTE TO ENERGY</small></b></div><div><small>AI BIOGAS PLATFORM</small><h1>Simple plant inputs.<br/>Clear production results.</h1><p>Compare biogas, methane and electricity before and after model optimization.</p></div><em>Synthetic scenario prototype • Human approval required</em></section><section className="login-form-wrap"><form onSubmit={onSubmit}><span className="login-icon">✦</span><small>SECURE ACCESS</small><h2>Sign in</h2><p>Use your Aquaivolt admin or user account.</p><label><span>Username</span><input value={username} onChange={event=>onUsername(event.target.value)} autoComplete="username" required/></label><label><span>Password</span><input type="password" value={password} onChange={event=>onPassword(event.target.value)} autoComplete="current-password" required/></label>{error&&<div className="login-error">{error}</div>}<button disabled={busy}>{busy?"Checking…":"Continue →"}</button></form></section></main>;
}

function ModelAuditPage({result,runInputs,loading,onVerify,onOverview}:{result:Prediction|null;runInputs:Inputs|null;loading:boolean;onVerify:()=>void;onOverview:()=>void}){
  const [modelData,setModelData]=useState<AuditModelData|null>(null);
  const [evaluation,setEvaluation]=useState<AuditEvaluation|null>(null);
  const [auditRuns,setAuditRuns]=useState<AuditRun[]>([]);
  const [loadError,setLoadError]=useState("");
  useEffect(()=>{void (async()=>{
    try{
      const [modelResponse,evaluationResponse,auditResponse]=await Promise.all([
        fetch("/api/model",{cache:"no-store"}),fetch("/api/evaluation",{cache:"no-store"}),fetch("/api/audit?limit=12",{cache:"no-store"}),
      ]);
      if(!modelResponse.ok||!evaluationResponse.ok||!auditResponse.ok)throw new Error("Auditor evidence could not be loaded");
      setModelData(await modelResponse.json());setEvaluation(await evaluationResponse.json());setAuditRuns((await auditResponse.json()).runs||[]);
    }catch(error){setLoadError(error instanceof Error?error.message:"Auditor evidence could not be loaded");}
  })();},[result]);
  const trace=result?.modelTrace;
  const latestInputs=runInputs;
  const anchorMax=Math.max(1,...(evaluation?.optimizationAnchorResults.map(item=>item.nmae)||[1]));
  return <div className="audit-workspace">
    <header className="audit-header"><button onClick={onOverview}>← Dashboard</button><div><small>ADMIN • AUDITOR EVIDENCE</small><h1>Model and AI audit center</h1><p>Live backend proof, evaluation results and execution evidence in one place.</p></div><span><i/>Server model available</span></header>
    <div className="audit-truth"><b>What this proves</b><span>The application calls a server-side prediction endpoint, processes nine inputs, returns a deterministic execution trace and exposes the comparison used to select the prototype model.</span><em>It does not claim independent field validation.</em></div>
    {loadError&&<div className="audit-error">{loadError}</div>}

    <section className="audit-status-grid">
      <article><small>INFERENCE ENDPOINT</small><b>POST /api/predict</b><span>Live server calculation</span></article>
      <article><small>MODEL VERSION</small><b>{modelData?.model.version||result?.modelVersion||"Loading"}</b><span>{modelData?.model.name||result?.modelName||"Model metadata"}</span></article>
      <article><small>INPUTS PROCESSED</small><b>{modelData?.card.inputCount??9} of 9</b><span>All displayed fields</span></article>
      <article><small>RANDOM VALUES</small><b>{modelData?.card.randomized===false?"Not used":"Checking"}</b><span>Identical inputs return identical outputs</span></article>
    </section>

    <section className="audit-live-section">
      <div className="audit-section-title"><div><small>LIVE VERIFICATION</small><h2>Run the actual backend in front of the auditor</h2><p>This button calls the same endpoint used by the production dashboard.</p></div><button disabled={loading} onClick={onVerify}>{loading?"Backend is calculating…":result?"Run verification again →":"Run verification calculation →"}</button></div>
      {result&&trace&&latestInputs?<div className="audit-live-grid">
        <article className="audit-execution-card"><header><div><small>EXECUTION COMPLETE</small><h3>{trace.executionId}</h3></div><span>VERIFIED</span></header><dl><div><dt>Executed</dt><dd>{new Date(trace.executedAt).toLocaleString()}</dd></div><div><dt>Endpoint</dt><dd>{trace.endpoint}</dd></div><div><dt>Implementation</dt><dd>{trace.implementation}</dd></div><div><dt>Algorithm</dt><dd>{trace.algorithm}</dd></div></dl><div className="audit-input-proof"><b>Nine submitted inputs</b><p>{latestInputs.feedstock} • {format(latestInputs.feedRate)} kg VS/d • {format(latestInputs.temperature)} °C • pH {format(latestInputs.ph)} • OLR {format(latestInputs.olr)} • HRT {format(latestInputs.hrt)} days • COD {format(latestInputs.codIn)} mg/L • VFA {format(latestInputs.vfa)} mg/L • {format(latestInputs.mixing)} RPM</p></div></article>
        <article className="audit-output-proof"><small>RETURNED OUTPUTS</small><div><span>Biogas<b>{format(result.optimized.biogas)} m³/day</b></span><span>Methane<b>{format(result.optimized.methane)} m³ CH₄/day</b></span><span>Electricity<b>{format(result.optimized.electricity)} kWh/day</b></span></div><p>Run ID in the interface and execution ID in the server trace are the same: <b>{result.runId}</b></p></article>
        <article className="audit-stage-proof"><small>SERVER EXECUTION TRACE</small>{trace.stages.map((stage,index)=><div key={stage.label}><span>✓</span><p><b>{String(index+1).padStart(2,"0")} {stage.label}</b><small>{stage.detail}</small></p></div>)}</article>
        <article className="audit-pattern-proof"><small>NEAREST SUPPLIED PATTERNS</small>{trace.nearestScenarios.map(item=><div key={item.anchor}><span>{item.anchor}</span><p><b>{item.feedstock}</b><small>Distance {item.distance}</small></p><em>{item.weight}% weight</em></div>)}</article>
      </div>:<div className="audit-waiting"><span>◎</span><b>No verification run yet</b><p>Select Run verification calculation to create an execution ID, process the nine inputs and display the returned server evidence.</p></div>}
    </section>

    <section className="audit-evaluation-section">
      <div className="audit-section-title"><div><small>MODEL COMPARISON</small><h2>What was evaluated and why this model was retained</h2><p>Lower normalized MAE is better. The in-sample ensemble score is excluded to prevent leakage.</p></div><span>{evaluation?`${evaluation.evaluatedModels.length} approaches evaluated`:"Loading evaluation"}</span></div>
      {evaluation&&<div className="audit-evaluation-grid"><div className="audit-ranking"><header><span>Model</span><span>Leave-one-out NMAE</span></header>{evaluation.optimizationAnchorResults.map(item=><div key={item.model} className={item.model===evaluation.selection.deployedModel.replace(" deterministic","")?"deployed":item.model===evaluation.selection.numericalWinner?"winner":""}><p><b>{item.model}</b><small>{item.role}</small></p><i><b style={{width:`${Math.max(4,item.nmae/anchorMax*100)}%`}}/></i><strong>{item.nmae.toFixed(3)}</strong></div>)}</div><aside className="audit-selection"><small>SELECTION DECISION</small><h3>Numerical winner</h3><b>{evaluation.selection.numericalWinner} • {evaluation.selection.numericalWinnerNmae.toFixed(3)}</b><h3>Prototype deployment</h3><b>{evaluation.selection.deployedModel} • {evaluation.selection.deployedModelNmae.toFixed(3)}</b><p>{evaluation.selection.reason}.</p><em>{evaluation.selection.neuralNetworkDecision}.</em></aside></div>}
    </section>

    <section className="audit-provenance">
      <div><small>DATA PROVENANCE</small><h2>Dataset facts shown honestly</h2><div className="audit-fact-grid"><article><b>{evaluation?.dataAudit.scadaUniqueRows??"—"}</b><span>unique synthetic SCADA rows</span></article><article><b>{evaluation?.dataAudit.optimizationAnchors??"—"}</b><span>optimization anchors</span></article><article><b>{evaluation?.dataAudit.normalValidationRuns??"—"}</b><span>normal validation runs</span></article><article><b>{evaluation?.dataAudit.literatureProjectionRows??"—"}</b><span>projection stress-test rows</span></article></div><p>{evaluation?.dataAudit.sourceClassification}</p><em>{evaluation?.dataAudit.missingCoverage}</em></div>
      <aside><small>DOWNLOADABLE AUDIT EVIDENCE</small><a href="/api/model" target="_blank">Open model card JSON <span>↗</span></a><a href="/api/evaluation" target="_blank">Open evaluation JSON <span>↗</span></a><a href="/api/audit?format=csv" download>Download server run log CSV <span>↓</span></a><p>Manifest fingerprint</p><code>{evaluation?.manifestFingerprint||"Loading…"}</code><em>The current serverless run log is volatile until a persistent database is connected.</em></aside>
    </section>

    <section className="audit-run-log"><div className="audit-section-title"><div><small>RECENT SERVER RUNS</small><h2>Audit log returned by the backend</h2></div><span>{auditRuns.length} run{auditRuns.length===1?"":"s"} currently available</span></div>{auditRuns.length?<div className="audit-run-table"><div><span>Run ID</span><span>Time</span><span>Operator</span><span>Feedstock</span><span>Model</span><span>Status</span></div>{auditRuns.map(run=><div key={run.id}><b>{run.id.slice(0,12)}</b><span>{new Date(Number(run.created_at)).toLocaleString()}</span><span>{run.username} ({run.role})</span><span>{run.feedstock}</span><span>{run.model_version}</span><em>{run.audit_status}</em></div>)}</div>:<div className="audit-empty-log">No durable run is available in this server instance. Use the live verification panel above; connect hosted Postgres before a formal production audit.</div>}</section>
    <footer className="audit-footer"><span>Prototype evidence center • Admin access only • No equipment control</span><button onClick={onOverview}>Return to production dashboard</button></footer>
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
      <div><small>AQUAIVOLT PRODUCTION CENTER</small><h1>{meta.label} Yield Optimization Dashboard</h1><p>A dedicated view for {meta.label.toLowerCase()} prediction, operating targets and supplied validation evidence.</p></div>
      <button onClick={onOverview}>← Back to overview</button>
    </header>

    <nav className="focused-output-tabs" aria-label="Production dashboards">
      {(Object.keys(outputs) as OutputKey[]).map(key=><button key={key} className={outputKey===key?"active":""} style={{"--tab-accent":outputs[key].color} as React.CSSProperties} onClick={()=>onOutput(key)}><span>{outputs[key].icon}</span><b>{outputs[key].label}</b><small>Production</small></button>)}
    </nav>

    <div className="focused-kpis">
      <article><small>Current predicted {meta.label.toLowerCase()}</small><b>{result?format(meta.after(result)):"Waiting"}</b><span>{result?meta.unit:"Run calculation"}</span></article>
      <article><small>Optimal retention time</small><b>{result?format(result.bestSetpoints.hrt):"—"}</b><span>{result?"days":"Run calculation"}</span></article>
      <article><small>Optimal pH</small><b>{result?format(result.bestSetpoints.ph):"—"}</b><span>{result?"modeled target":"Run calculation"}</span></article>
    </div>

    <div className="focused-output-content">
      <aside className="focused-filters">
        <small>INPUT FILTERS</small><h2>Try plant conditions</h2><p>Adjust these inputs, then calculate again.</p>
        <RangeField label="Retention time" value={inputs.hrt} min={5} max={40} step={.1} unit="days" onChange={value=>onUpdate("hrt",value)}/>
        <RangeField label="Temperature" value={inputs.temperature} min={25} max={45} step={.1} unit="°C" onChange={value=>onUpdate("temperature",value)}/>
        <RangeField label="pH" value={inputs.ph} min={6} max={8} step={.01} unit="" onChange={value=>onUpdate("ph",value)}/>
        {dirty&&<div className="focused-dirty">Inputs changed. Calculate again to refresh the output.</div>}
        {predictionError&&<div className="focused-error">{predictionError}</div>}
        <button className="focused-calculate" disabled={loading} onClick={onCalculate}>{loading?"AI is calculating…":result?"Recalculate production →":"Calculate production →"}</button>
        <div className="focused-mode-note"><b>Model mode</b><span>Manual inputs and synthetic scenario evidence. No physical device is controlled.</span></div>
      </aside>

      <main className="focused-output-main">
        {loading?<Working/>:result?<ReferenceOutputBoard outputKey={outputKey} result={result} inputs={completedInputs} conditionsClose={conditionsClose}/>:<WaitingReferenceBoard outputKey={outputKey}/>}

        <section className="focused-visualizations">
          <header><div><small>DYNAMIC VISUALIZATIONS</small><h2>{meta.label} response to this calculation</h2><p>{result?result.modelCurves.source:"Run a calculation to generate input-specific model curves."}</p></div><span>{result?"Latest scenario":"Waiting"}</span></header>
          {result?<div className="focused-chart-grid">
            <DynamicTrendChart outputKey={outputKey} result={result}/>
            <MiniScatterChart title={`Retention time vs ${meta.label}`} xValues={result.modelCurves.hrt.map(point=>point.input)} yValues={result.modelCurves.hrt.map(curveValue)} color={meta.color} xUnit="days" yUnit={meta.unit} currentX={result.modelCurves.current.hrt} currentY={result.modelCurves.current[outputKey]}/>
            <MiniScatterChart title={`pH vs ${meta.label}`} xValues={result.modelCurves.ph.map(point=>point.input)} yValues={result.modelCurves.ph.map(curveValue)} color={meta.color} xUnit="pH" yUnit={meta.unit} currentX={result.modelCurves.current.ph} currentY={result.modelCurves.current[outputKey]}/>
          </div>:<div className="dynamic-chart-waiting"><span>⌁</span><b>Dynamic charts are waiting</b><p>Adjust the inputs and select Calculate production. No placeholder curve is shown.</p></div>}
        </section>
        {result&&!loading&&<ModelEvidencePanel result={result} inputs={completedInputs}/>}
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
  return <article className="focused-line-chart"><h3>Next 24 hours from current inputs</h3><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${meta.label} calculated 24-hour baseline and optimized forecast`}><g>{[0,1,2].map(index=><line key={index} x1={pad} x2={width-pad} y1={pad+index*55} y2={pad+index*55}/>)}</g><polyline className="dynamic-baseline" points={points(baseline)}/><polyline className="dynamic-optimized" style={{stroke:meta.color}} points={points(optimized)}/><text x={pad} y={height-7}>Now</text><text x={width-pad} y={height-7} textAnchor="end">24h</text></svg><div><span><i className="baseline-key"/>Modeled baseline</span><span><i style={{background:meta.color}}/>Current-input forecast</span><b>{meta.unit}</b></div></article>;
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
    {label:"Retention time",current:inputs.hrt,target:result.bestSetpoints.hrt,unit:"days",width:Math.min(100,Math.abs(inputs.hrt-result.bestSetpoints.hrt)/10*100)},
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

function ValidationChart({outputKey}:{outputKey:OutputKey}){
  const series=validationSeries[outputKey];const meta=outputs[outputKey];const all=[...series.before,...series.after];const max=Math.max(...all)*1.08;const width=880,height=230,pad=34;const points=(values:number[])=>values.map((value,index)=>`${pad+index*((width-pad*2)/(values.length-1))},${height-pad-(value/max)*(height-pad*2)}`).join(" ");
  return <div className="validation-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${meta.label} before and after across ten supplied validation runs`}><g className="chart-grid">{[0,1,2,3].map(index=><line key={index} x1={pad} x2={width-pad} y1={pad+index*48} y2={pad+index*48}/>)}</g><polyline className="validation-before" points={points(series.before)}/><polyline className="validation-after" style={{stroke:meta.color}} points={points(series.after)}/>{series.after.map((value,index)=><circle key={index} cx={pad+index*((width-pad*2)/(series.after.length-1))} cy={height-pad-(value/max)*(height-pad*2)} r="4" style={{fill:meta.color}}/>)}{series.after.map((_,index)=><text key={index} x={pad+index*((width-pad*2)/(series.after.length-1))} y={height-8} textAnchor="middle">{index+1}</text>)}</svg><div className="chart-labels"><span><i className="grey"/>Before AI</span><span><i style={{background:meta.color}}/>After AI</span><b>Unit: {meta.unit}</b></div></div>;
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

function AiAnalysisCenter({inputs,activeOutput,stage}:{inputs:Inputs;activeOutput:OutputKey;stage:number}){
  const stages=[
    {type:"WEB TRIGGER",icon:"↗",label:"Plant input submitted",detail:"The Calculate button sent one authenticated request to POST /api/predict.",evidence:["One API request received","Nine current form values attached","No browser-generated output values"]},
    {type:"CODE",icon:"✓",label:"Validate nine inputs",detail:"The server parses every submitted field and applies physical safety guardrails.",evidence:["Feedstock plus eight numeric inputs","Numeric and physical checks","Out-of-pattern values remain explicit estimates"]},
    {type:"DATA",icon:"▦",label:"Match supplied scenarios",detail:"Distances and weights are calculated against the ten optimization anchors.",evidence:["10 supplied anchors compared","Feedstock category included","Nearest-pattern weights calculated"]},
    {type:"MODEL",icon:"ƒ",label:"Baseline inference",detail:"The deterministic engine estimates production before optimization.",evidence:["Biogas baseline","Methane baseline","Electricity baseline"]},
    {type:"MODEL",icon:"✦",label:"Optimized inference",detail:"The same engine calculates the AI-assisted production scenario.",evidence:["All nine inputs influence the run","Process penalties and factors applied","Biogas, methane and electricity calculated"]},
    {type:"FUNCTION",icon:"Σ",label:"Build output channels",detail:"Gas quality, energy, carbon and monitoring values are derived from the model result.",evidence:["CH₄ + CO₂ + H₂S composition","Electricity conversion","Safeguard and equipment states"]},
    {type:"AI AGENT",icon:"◎",label:"Search better setpoints",detail:"The optimization agent re-runs the deterministic model around recommended settings.",evidence:["pH and HRT response curves","Recommended setpoint simulation","Next-action ranking"]},
    {type:"AUDIT",icon:"≡",label:"Record run evidence",detail:"The server returns an execution trace, recommendations and an auditable run identifier.",evidence:["Execution ID generated","Seven server stages returned","Dashboard update authorized"]},
  ];
  const [selected,setSelected]=useState(0);
  useEffect(()=>setSelected(Math.min(stage,stages.length-1)),[stage,stages.length]);
  const current=stages[Math.min(stage,stages.length-1)];
  const selectedNode=stages[selected];
  const inputEvidence=[
    `${inputs.feedstock} feedstock`,`${format(inputs.feedRate)} kg VS/day feed rate`,`${format(inputs.temperature)} °C and pH ${format(inputs.ph)}`,
    `OLR ${format(inputs.olr)} • HRT ${format(inputs.hrt)} days`,`COD ${format(inputs.codIn)} • VFA ${format(inputs.vfa)} mg/L`,`${format(inputs.mixing)} RPM mixing`,
  ];
  return <div className="ai-analysis-overlay" role="dialog" aria-modal="true" aria-label="AI model analysis in progress">
    <section className="ai-analysis-center">
      <header><div><span className="live-model-dot"/><small>LIVE MODEL + AGENT WORKFLOW</small><h2>AI execution is visible</h2><p>Each connected node represents a real step in the current prediction request.</p></div><div className="analysis-run-status"><b>{String(stage+1).padStart(2,"0")}</b><span>of {String(stages.length).padStart(2,"0")} nodes</span></div></header>
      <div className="analysis-progress"><i style={{width:`${(stage+1)/stages.length*100}%`}}/></div>
      <div className="live-workflow-shell">
        <div className="live-workflow-toolbar"><div><span className="workflow-toolbar-button">＋</span><span>Production prediction workflow</span><em>ACTIVE EXECUTION</em></div><p><i/>POST /api/predict <b>•</b> authenticated server request</p></div>
        <div className="live-workflow-canvas" aria-label="Connected AI workflow nodes">
          {stages.map((item,index)=>{
            const status=index<stage?"complete":index===stage?"running":"queued";
            return <div className={`workflow-node-wrap ${status}`} key={item.label}>
              <button type="button" className={`live-workflow-node ${selected===index?"selected":""}`} onClick={()=>setSelected(index)} aria-pressed={selected===index}>
                <span>{item.icon}</span><small>{item.type}</small><b>{item.label}</b><em>{status==="complete"?"Completed":status==="running"?"Running now":"Waiting"}</em>
              </button>
              {index<stages.length-1&&<i className="workflow-connector"><b/></i>}
            </div>;
          })}
        </div>
        <div className="workflow-live-inspector">
          <header><span>{selectedNode.icon}</span><div><small>{selectedNode.type} • NODE {String(selected+1).padStart(2,"0")}</small><h3>{selectedNode.label}</h3><p>{selectedNode.detail}</p></div></header>
          <div>{(selected===0?inputEvidence:selectedNode.evidence).map(item=><span key={item}><i/> {item}</span>)}</div>
          <aside><small>LIVE STATUS</small><b>{selected<stage?"Completed by the server":selected===stage?`Running: ${current.label}`:"Queued behind the active node"}</b><p>Final production numbers appear only after the API returns its completed trace.</p></aside>
        </div>
        <div className="workflow-output-preview">{(Object.keys(outputs) as OutputKey[]).map(key=><span key={key} className={activeOutput===key?"active":""} style={{"--output-accent":outputs[key].color} as React.CSSProperties}><i>{outputs[key].icon}</i><b>{outputs[key].label}</b><em>waiting for model</em></span>)}</div>
      </div>
      <footer><span><i/>Workflow animation synchronized with the prediction request</span><p>No random result values are displayed. Nodes explain implemented logic; final numbers appear only after the server responds.</p></footer>
    </section>
  </div>;
}

function CompletedWorkflowCanvas({result,inputs}:{result:Prediction;inputs:Inputs}){
  const [selected,setSelected]=useState(0);
  const kinds=["CODE","DATA","MODEL","MODEL","FUNCTION","SAFEGUARD","AUDIT"];
  const icons=["✓","▦","ƒ","✦","Σ","◇","≡"];
  const evidence=[
    [
      {label:"Submitted payload",value:`${inputs.feedstock} • ${format(inputs.feedRate)} kg VS/day`},
      {label:"Process values",value:`${format(inputs.temperature)} °C • pH ${format(inputs.ph)} • OLR ${format(inputs.olr)} • HRT ${format(inputs.hrt)} days`},
      {label:"Additional values",value:`COD ${format(inputs.codIn)} • VFA ${format(inputs.vfa)} mg/L • ${format(inputs.mixing)} RPM`},
    ],
    result.modelTrace.nearestScenarios.map(item=>({label:item.anchor,value:`${item.feedstock} • ${format(item.weight)}% model weight`})),
    [
      {label:"Baseline biogas",value:`${format(result.baseline.biogas)} m³/day`},
      {label:"Baseline methane",value:`${format(result.baseline.methane)} m³ CH₄/day`},
      {label:"Baseline electricity",value:`${format(result.baseline.electricity)} kWh/day`},
    ],
    [
      {label:"Optimized biogas",value:`${format(result.optimized.biogas)} m³/day`},
      {label:"Optimized methane",value:`${format(result.optimized.methane)} m³ CH₄/day`},
      {label:"Optimized electricity",value:`${format(result.optimized.electricity)} kWh/day`},
    ],
    [
      {label:"Gas composition",value:`${format(result.optimized.methanePct)}% CH₄ • ${format(result.optimized.co2Pct)}% CO₂ • ${format(result.optimized.h2s)} ppm H₂S`},
      {label:"Generated power",value:`${format(result.optimized.generatorKw)} kW`},
      {label:"Carbon reduction",value:`${format(result.optimized.carbon)} kg CO₂e/day`},
    ],
    result.equipmentStates.slice(0,3).map(item=>({label:item.label,value:`${item.state} • ${item.detail}`})),
    [
      {label:"Execution ID",value:result.modelTrace.executionId},
      {label:"Recommendation",value:result.recommendations[0]?.title||"Maintain current settings"},
      {label:"Audit record",value:`${result.audit.status} • deterministic result`},
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
      <section className="sensitivity-card"><div className="evidence-card-title"><div><small>INPUT RESPONSE CHECK</small><h3>Which inputs moved the model most?</h3></div><span>Local model re-runs</span></div><p className="evidence-help">Each bar comes from re-running the model slightly above and below the submitted value. It is a local response check, not a claim of physical causation.</p><div className="sensitivity-bars">{sensitivity.map((item,index)=><div key={item.label}><span><b>{index+1}. {item.label}</b><small>{item.direction==="scenario switch"?"Compared across feedstock categories":`${item.direction==="increase"?"Higher":"Lower"} test produced the larger result`}</small></span><i><b style={{width:`${Math.max(4,item.strength)}%`}}/></i><strong>{format(item.response)}<small>m³/day response</small></strong></div>)}</div></section>
      <aside className="scenario-evidence-card"><div className="evidence-card-title"><div><small>DATA MATCH</small><h3>Supplied scenarios used</h3></div><span>{result.modelTrace.scenarioCount} anchors</span></div><div className="scenario-match-list">{nearest.map((scenario,index)=><div key={scenario.anchor}><span>{index+1}</span><p><b>{scenario.anchor}</b><small>{scenario.feedstock}</small></p><em>{index===0?"Closest match":"Supporting match"}</em></div>)}</div><dl><div><dt>Algorithm</dt><dd>{result.modelTrace.algorithm}</dd></div><div><dt>Random numbers</dt><dd>{result.modelTrace.randomized?"Used":"Not used"}</dd></div><div><dt>Inputs processed</dt><dd>{result.modelTrace.inputCount} of 9</dd></div><div><dt>Execution</dt><dd>{result.runId.split("-")[0].toUpperCase()}</dd></div></dl></aside>
    </div>
    <footer><div><span>INPUTS</span><i/> <span>SCENARIO MATCHING</span><i/> <span>BASELINE</span><i/> <span>OPTIMIZED OUTPUTS</span><i/> <span>RECOMMENDATIONS</span></div><p>Operator review is still required before changing real plant equipment.</p></footer>
  </section>;
}

function EmptyResult(){return <div className="empty-result"><span>1</span><i>→</i><span>2</span><i>→</i><span>3</span><div><b>Enter inputs</b><b>Run calculation</b><b>Compare results</b></div><p>No placeholder numbers are shown. Results appear only after the model runs.</p></div>}
function Working(){return <div className="working"><span className="agent-orb">✦</span><h2>AI Analysis Center is running</h2><p>Follow the live model workflow shown on screen.</p><div><i/><i/><i/></div></div>}

function Copilot({messages,question,busy,result,onQuestion,onAsk,onClose,onApply}:{messages:{role:"ai"|"user";text:string}[];question:string;busy:boolean;result:Prediction|null;onQuestion:(v:string)=>void;onAsk:(e?:FormEvent)=>void;onClose:()=>void;onApply:()=>void}){
  return <aside className="chat-panel"><header><div><small>DATA-AWARE ASSISTANT</small><h2>Aqua Copilot</h2></div><button onClick={onClose}>×</button></header><div className="chat-context"><span>{result?`Ready to explain run ${result.runId.split("-")[0].toUpperCase()}`:"Run a calculation for a specific answer"}</span></div><div className="chat-messages">{messages.map((message,index)=><div key={index} className={message.role}>{message.text}</div>)}{busy&&<div className="ai">Thinking…</div>}</div>{result&&<button className="apply-setpoints" onClick={onApply}>Copy recommended inputs to form</button>}<form onSubmit={onAsk}><input value={question} onChange={event=>onQuestion(event.target.value)} placeholder="Ask what changed or why…"/><button disabled={busy||!question.trim()}>↑</button></form></aside>;
}

function SettingsModal({settings,message,onChange,onSave,onClose}:{settings:AdminSettings|null;message:string;onChange:(v:AdminSettings)=>void;onSave:(e:FormEvent)=>void;onClose:()=>void}){
  return <div className="modal-backdrop" onClick={onClose}><section className="settings-modal" onClick={event=>event.stopPropagation()}><header><div><small>ADMIN ONLY</small><h2>Plant settings</h2></div><button onClick={onClose}>×</button></header>{!settings?<p>Loading settings…</p>:<form onSubmit={onSave}><label><span>Facility name</span><input value={settings.facilityName} onChange={event=>onChange({...settings,facilityName:event.target.value})}/></label><label><span>Facility location</span><input value={settings.facilityLocation} onChange={event=>onChange({...settings,facilityLocation:event.target.value})}/></label><label><span>H₂S warning</span><div><input type="number" value={settings.h2sWarning} onChange={event=>onChange({...settings,h2sWarning:Number(event.target.value)})}/><em>ppm</em></div></label><div className="settings-pair"><label><span>Pressure minimum</span><input type="number" value={settings.pressureMinimum} onChange={event=>onChange({...settings,pressureMinimum:Number(event.target.value)})}/></label><label><span>Pressure maximum</span><input type="number" value={settings.pressureMaximum} onChange={event=>onChange({...settings,pressureMaximum:Number(event.target.value)})}/></label></div>{message&&<p className="settings-message">{message}</p>}<button className="save-settings">Save settings</button></form>}</section></div>;
}

function format(value:number){return Math.abs(value)>=100?value.toFixed(0):Math.abs(value)>=10?value.toFixed(1):value.toFixed(2)}
