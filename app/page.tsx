"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Inputs = { feedstock:string; feedRate:number; temperature:number; ph:number; olr:number; hrt:number; codIn:number; vfa:number; mixing:number };
type PlantOutput = { gasFlow:number; biogas:number; methanePct:number; methane:number; electricity:number; generatorKw:number; carbon:number; co2Pct:number; h2s:number };
type Recommendation = { title:string; detail:string; impact:number; tone:string; parameter:string; current:number; target:number; unit:string };
type Alert = { key:string; label:string; value:number; unit:string; limit:string; status:"normal"|"warning"|"critical"; message:string };
type Equipment = { label:string; state:string; detail:string; mode:string; tone:string };
type HourPoint = { hour:number; biogas:number; electricity:number; ch4:number; co2:number; h2s:number };
type GasMetric = { key:string; label:string; name:string; before:number; after:number; unit:string; direction:string };
type Prediction = {
  biogas:number; methanePct:number; methane:number; electricity:number; carbon:number; codRemoval:number; stability:number;
  confidence:number; improvement:number; pressure:number; h2s:number; generatorKw:number; overallBenefit:number; benefitTrend:number[];
  optimizationTargets:{label:string;value:number}[]; recommendations:Recommendation[]; forecast:number[]; hourlyForecast:HourPoint[];
  bestSetpoints:Omit<Inputs,"feedstock">; agentMessage:string; modelName:string; modelVersion:string; modelFit:string; outOfRange:boolean;
  confidenceMeaning:string; baseline:PlantOutput; optimized:PlantOutput; gasComposition:GasMetric[]; performanceMetrics:GasMetric[]; alerts:Alert[]; equipmentStates:Equipment[];
  inputEffects:{label:string;value:string;effect:string}[]; facility:{name:string;location:string}; mode:string; runId:string; createdAt:string;
  audit:{runId:string;createdAt:string;saved:boolean;status:string};
};
type AuthUser = { username:string; role:"admin"|"user" };
type Health = {
  status:string; checkedAt:string; readiness:number; readyChecks:number; totalChecks:number;
  checks:{key:string;label:string;ready:boolean;weight:number}[];
  services:{api:string;model:string;rag:string;auth:string;audit:string}; knowledge:{workbooks:number;chunks:number};
  model:{name:string;version:string;fit:string;inputMode:string};
};
type AuditRun = { id:string; created_at:number; username:string; feedstock:string; model_version:string; audit_status:string; inputs:Inputs; outputs:{optimized?:PlantOutput;improvement?:number;confidence?:number} };
type AdminSettings = { methaneMinimum:number; h2sWarning:number; pressureMinimum:number; pressureMaximum:number; facilityName:string; facilityLocation:string };

const initial: Inputs = { feedstock:"Dairy WW", feedRate:846, temperature:35, ph:7.1, olr:3.5, hrt:22, codIn:7000, vfa:1100, mixing:50 };
const nav = ["Executive Overview","AI Intelligence","Digital Twin","IoT & Sensors","AI Optimization","Prediction Center","Explainable AI","Data & Audit","Settings"];
const navIcons = ["⌂","✦","♙","◉","✥","◇","◎","▦","⚙"];
const navTargets:Record<string,string> = {
  "Executive Overview":"executive-overview", "AI Intelligence":"ai-optimization", "Digital Twin":"digital-twin",
  "IoT & Sensors":"iot-sensors", "AI Optimization":"ai-optimization", "Prediction Center":"prediction-center",
  "Explainable AI":"explainable-ai", "Data & Audit":"data-audit",
};
const quickQuestions = ["What are the best setpoints?","Explain this prediction","Which alert needs attention?"];

export default function Home() {
  const [auth,setAuth] = useState<AuthUser|null>(null);
  const [authChecking,setAuthChecking] = useState(true);
  const [loginUsername,setLoginUsername] = useState("");
  const [loginPassword,setLoginPassword] = useState("");
  const [loginBusy,setLoginBusy] = useState(false);
  const [loginError,setLoginError] = useState("");
  const [health,setHealth] = useState<Health|null>(null);
  const [healthError,setHealthError] = useState(false);
  const [inputs,setInputs] = useState(initial);
  const [lastRunInputs,setLastRunInputs] = useState<Inputs|null>(null);
  const [result,setResult] = useState<Prediction|null>(null);
  const [loading,setLoading] = useState(false);
  const [predictionError,setPredictionError] = useState("");
  const [active,setActive] = useState("Executive Overview");
  const [now,setNow] = useState(new Date());
  const [history,setHistory] = useState<{time:string;biogas:number;electricity:number;runId:string;saved:boolean}[]>([]);
  const [auditRuns,setAuditRuns] = useState<AuditRun[]>([]);
  const [auditBusy,setAuditBusy] = useState(false);
  const [chatOpen,setChatOpen] = useState(false);
  const [question,setQuestion] = useState("");
  const [messages,setMessages] = useState<{role:string;text:string}[]>([{role:"ai",text:"I’m Aqua Copilot. Run a scenario, then ask me to explain the model evidence, alerts, or recommended setpoints."}]);
  const [chatBusy,setChatBusy] = useState(false);
  const [presentedResultKey,setPresentedResultKey] = useState<string|null>(null);
  const [detailsOpen,setDetailsOpen] = useState(false);
  const [settingsOpen,setSettingsOpen] = useState(false);
  const [settings,setSettings] = useState<AdminSettings|null>(null);
  const [settingsBusy,setSettingsBusy] = useState(false);
  const [settingsMessage,setSettingsMessage] = useState("");
  const autoRun = useRef(false);

  const dirty = Boolean(lastRunInputs && JSON.stringify(lastRunInputs) !== JSON.stringify(inputs));

  const refreshHealth = async() => {
    try {
      const response = await fetch("/api/health",{cache:"no-store"});
      if (response.status===401) { setAuth(null); return; }
      if (!response.ok) throw new Error();
      setHealth(await response.json()); setHealthError(false);
    } catch { setHealthError(true); }
  };

  const loadAudit = async() => {
    if (auth?.role!=="admin") return;
    setAuditBusy(true);
    try { const response=await fetch("/api/audit?limit=30",{cache:"no-store"}); if(response.ok)setAuditRuns((await response.json()).runs??[]); } finally { setAuditBusy(false); }
  };

  const predict = async() => {
    const previousRun = result&&lastRunInputs ? {prediction:result,inputs:lastRunInputs} : null;
    setLoading(true); setPredictionError("");
    try {
      const [response] = await Promise.all([
        fetch("/api/predict",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...inputs,previousRun})}),
        new Promise(resolve=>setTimeout(resolve,700)),
      ]);
      if (response.status===401) { setAuth(null); throw new Error("Your session expired. Please sign in again."); }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error||"Prediction service is unavailable.");
      setResult(data); setLastRunInputs({...inputs});
      setHistory(current=>[{time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),biogas:data.biogas,electricity:data.electricity,runId:data.runId,saved:data.audit?.saved},...current].slice(0,5));
      if (auth?.role==="admin") void loadAudit();
    } catch(error) { setPredictionError(error instanceof Error?error.message:"Prediction service is unavailable."); }
    finally { setLoading(false); }
  };

  useEffect(()=>{
    let mounted=true;
    fetch("/api/auth/session",{cache:"no-store"}).then(async response=>{if(!mounted)return;if(response.ok)setAuth((await response.json()).user);setAuthChecking(false);}).catch(()=>setAuthChecking(false));
    const clock=window.setInterval(()=>setNow(new Date()),60000);
    return()=>{mounted=false;window.clearInterval(clock);};
  },[]);

  useEffect(()=>{
    if(!auth)return;
    void refreshHealth();
    const monitor=window.setInterval(refreshHealth,30000);
    if(!autoRun.current){autoRun.current=true;void predict();}
    return()=>window.clearInterval(monitor);
  },[auth]);

  const login = async(event:FormEvent) => {
    event.preventDefault(); setLoginBusy(true); setLoginError("");
    try {
      const response=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:loginUsername,password:loginPassword})});
      const data=await response.json(); if(!response.ok)throw new Error(data.error||"Login failed.");
      autoRun.current=false; setAuth(data.user); setLoginPassword("");
    } catch(error) { setLoginError(error instanceof Error?error.message:"Login failed."); }
    finally { setLoginBusy(false); }
  };

  const logout = async() => {
    await fetch("/api/auth/logout",{method:"POST"});
    setAuth(null); setHealth(null); setResult(null); setHistory([]); setAuditRuns([]); setSettingsOpen(false); autoRun.current=false;
  };

  const update = (key:keyof Inputs,value:string) => setInputs(current=>({...current,[key]:key==="feedstock"?value:Number(value)}));

  const openCopilot = () => {
    setChatOpen(true);
    if(result&&lastRunInputs){
      const key=result.runId;
      if(key!==presentedResultKey){setMessages(current=>[...current,{role:"ai",text:result.agentMessage}]);setPresentedResultKey(key);}
    }
  };

  const handleNav = (name:string) => {
    if(auth?.role!=="admin"&&["Data & Audit","Settings"].includes(name))return;
    setActive(name);
    if(name==="Settings"){void openSettings();return;}
    if(name==="Data & Audit")void loadAudit();
    document.getElementById(navTargets[name]??"executive-overview")?.scrollIntoView({behavior:"smooth",block:"start"});
  };

  const applyBestSetpoints = () => {
    if(!result)return;
    setInputs(current=>({...current,...result.bestSetpoints}));
    setMessages(current=>[...current,{role:"ai",text:"I copied the modeled setpoints into the input form. They are not applied to equipment. Run a new prediction to compare the proposed scenario."}]);
  };

  const ask = async(event?:FormEvent,quick?:string) => {
    event?.preventDefault(); const text=(quick??question).trim(); if(!text)return;
    const chatHistory=[...messages.slice(-5),{role:"user",text}];
    const predictionForChat=result&&!dirty?result:null;
    setMessages(current=>[...current,{role:"user",text}]); setQuestion(""); setChatBusy(true);
    try {
      const response=await fetch("/api/copilot",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:text,inputs,prediction:predictionForChat,history:chatHistory})});
      if(response.status===401){setAuth(null);throw new Error();}
      const data=await response.json();
      const evidence=Array.isArray(data.sources)&&data.sources.length?`\n\nEvidence: ${data.sources.slice(0,3).join("; ")}`:"";
      setMessages(current=>[...current,{role:"ai",text:`${data.answer||"I couldn’t complete that answer."}${evidence}`}]);
    } catch { setMessages(current=>[...current,{role:"ai",text:"I couldn’t reach the knowledge service. Please try again."}]); }
    finally { setChatBusy(false); }
  };

  const openSettings = async() => {
    setSettingsOpen(true); setSettingsMessage("");
    const response=await fetch("/api/settings",{cache:"no-store"});
    if(response.ok)setSettings((await response.json()).settings);
  };

  const saveSettings = async(event:FormEvent) => {
    event.preventDefault(); if(!settings)return; setSettingsBusy(true); setSettingsMessage("");
    try {
      const response=await fetch("/api/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(settings)});
      const data=await response.json(); if(!response.ok)throw new Error(data.error||"Could not save settings.");
      setSettings(data.settings); setSettingsMessage("Thresholds saved. Run a new prediction to refresh alerts."); void refreshHealth();
    } catch(error){setSettingsMessage(error instanceof Error?error.message:"Could not save settings.");}
    finally{setSettingsBusy(false);}
  };

  const benefitPoints = useMemo(()=>linePoints(result?.benefitTrend??[],100,40,5),[result]);

  if(authChecking)return <div className="auth-loading"><span className="spinner"></span><b>Securing Aquaivolt workspace…</b></div>;
  if(!auth)return <LoginScreen username={loginUsername} password={loginPassword} busy={loginBusy} error={loginError} onUsername={setLoginUsername} onPassword={setLoginPassword} onSubmit={login}/>;

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="drop">◒</span><div><b>AQUAIVOLT</b><small>AI PLATFORM</small></div></div>
      <nav>{nav.map((name,index)=>{const locked=auth.role!=="admin"&&["Data & Audit","Settings"].includes(name);return <button key={name} className={`nav ${locked?"locked":"available"} ${active===name?"active":""}`} onClick={()=>handleNav(name)} disabled={locked} title={locked?"Admin access required":`Open ${name}`}><span>{navIcons[index]}</span>{name}{locked&&<small>ADMIN</small>}</button>})}</nav>
      <button className="copilot-mini" onClick={openCopilot}><span className="robot">✦</span><b>AI Copilot Assistant</b><small>Ask about this scenario, the evidence, or safe optimization options.</small><em>Start chat →</em></button>
      <div className="copyright">AQUAIVOLT © 2026<br/><small>Simulation prototype · Synthetic data</small></div>
    </aside>

    <section className="workspace" id="executive-overview">
      <header>
        <div><h1>AI Command Center</h1><p>Smart Biogas Optimization & Digital Twin Platform</p></div>
        <div className="header-actions">
          <span className={`online ${healthError?"degraded":""}`}>● &nbsp; {healthError?"Health unavailable":health?"System Online":"Checking system"}</span>
          <span className="date">▣ &nbsp; {now.toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})} · {now.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
          <button className="ai-btn" onClick={openCopilot}>✦ &nbsp; Ask Copilot</button>
          <button className="account-chip" onClick={()=>auth.role==="admin"?void openSettings():void logout()} title={auth.role==="admin"?"Open admin settings":"Sign out"}><span>{auth.username.slice(0,2).toUpperCase()}</span><b>{auth.username}<small>{auth.role}</small></b></button>
        </div>
      </header>

      <div className="simulation-banner"><span>SIMULATION MODE</span><p>Human-entered inputs drive a deterministic prototype model. Equipment commands and gas sensors are simulated until physical IoT devices are connected.</p>{dirty&&<b>Inputs changed · run prediction to refresh every report</b>}</div>

      <section className="kpis">
        <Kpi label="Prototype Readiness" value={health?`${health.readiness}%`:"—"} color="#1e87f0" note={health?`${health.readyChecks}/${health.totalChecks} systems ready`:"Checking services"}/>
        <Kpi label="Scenario Coverage" value={result?`${result.confidence.toFixed(0)}%`:"—"} color="#6d28d9" note={result?"Input-space validity, not accuracy":"Awaiting prediction"}/>
        <Kpi label="Digital Twin" value={loading?"RUN":result?"ACTIVE":"READY"} color="#18a957" note={loading?"Agent evaluating scenario":result?`Run ${shortId(result.runId)}`:"Manual input mode"}/>
        <Kpi label="Optimization Gain" value={result?`${signed(result.improvement)}%`:"—"} color="#f97316" note={result?"Biogas vs same modeled baseline":"Awaiting prediction"}/>
      </section>

      <section className="main-grid">
        <div className="card input-card" id="digital-twin">
          <Title title="PLANT INPUT & DIGITAL TWIN" badge="MANUAL INPUT"/>
          <div className="input-layout">
            <div className="form-grid">
              <Field label="Feedstock" value={inputs.feedstock} onChange={value=>update("feedstock",value)} options={["Dairy WW","Cow Manure","Food Waste","Brewery","Paper Mill","Mixed Waste"]}/>
              <Field label="Feed rate" value={inputs.feedRate} unit="kg VS/d" onChange={value=>update("feedRate",value)} min={820} max={870}/>
              <Field label="Temperature" value={inputs.temperature} unit="°C" onChange={value=>update("temperature",value)} min={34.08} max={38.87} step="0.1"/>
              <Field label="pH level" value={inputs.ph} onChange={value=>update("ph",value)} min={6.82} max={7.58} step="0.01"/>
              <Field label="Organic loading" value={inputs.olr} unit="kg COD/m³·d" onChange={value=>update("olr",value)} min={1.55} max={6.38} step="0.1"/>
              <Field label="Retention time" value={inputs.hrt} unit="days" onChange={value=>update("hrt",value)} min={15.45} max={34.62} step="0.1"/>
              <Field label="COD input" value={inputs.codIn} unit="mg/L" onChange={value=>update("codIn",value)} min={3205} max={11864}/>
              <Field label="VFA" value={inputs.vfa} unit="mg/L" onChange={value=>update("vfa",value)} min={251} max={2963}/>
              <Field label="Mixer speed" value={inputs.mixing} unit="RPM" onChange={value=>update("mixing",value)} min={20} max={79}/>
            </div>
            <DigitalTwin working={loading} result={result}/>
          </div>
          <button className="predict" onClick={()=>void predict()} disabled={loading}>{loading?<><span className="spinner"></span> Optimization agent is analyzing…</>:<>✦ Run AI prediction</>}</button>
          {predictionError&&<p className="inline-error">{predictionError}</p>}
        </div>

        <div className="card optimization" id="ai-optimization">
          <Title title="AI OPTIMIZATION ENGINE" badge={loading?"ANALYZING":result?"DYNAMIC REPORT":"AWAITING INPUT"}/>
          {loading?<AgentSteps/>:result?<OptimizationReport result={result} benefitPoints={benefitPoints} onDetails={()=>setDetailsOpen(true)}/>:<AwaitingPrediction text="Enter plant conditions and run a prediction. All report panels will refresh from one model response."/>}
        </div>
      </section>

      <section className="card evidence-section">
        <Title title="BASELINE → AI OPTIMIZATION EVIDENCE" badge={result?`RUN ${shortId(result.runId)}`:"AWAITING MODEL"}/>
        {result&&lastRunInputs?<EvidenceTable result={result} inputs={lastRunInputs}/>:<AwaitingPrediction text="The auditable before/after table will appear after prediction."/>}
      </section>

      <section className="monitoring-grid" id="prediction-center">
        <div className="card trend-card">
          <Title title="24-HOUR YIELD & ENERGY TREND" badge={result?"MODEL-DERIVED":"AWAITING MODEL"}/>
          {result?<YieldEnergyChart data={result.hourlyForecast}/>:<AwaitingPrediction text="Biogas yield and electricity forecasts will appear here."/>}
        </div>
        <div className="card digester-card">
          <Title title="DIGESTER HEALTH" badge={result?statusFromStability(result.stability):"AWAITING MODEL"}/>
          {result?<DigesterHealth result={result}/>:<AwaitingPrediction text="Health metrics require a completed prediction."/>}
        </div>
        <div className="card gas-card">
          <Title title="6-METRIC BIOGAS OPTIMIZATION" badge={result?"BASELINE vs AI":"AWAITING MODEL"}/>
          {result?<PerformanceComparison metrics={result.performanceMetrics}/>:<AwaitingPrediction text="Six baseline-versus-AI performance metrics will appear after prediction."/>}
        </div>
      </section>

      <section className="iot-grid" id="iot-sensors">
        <div className="card facility-card">
          <Title title="FACILITY MONITORING" badge="SIMULATED IOT"/>
          <FacilityMap result={result}/>
        </div>
        <div className="card device-card">
          <Title title="DEVICE & SENSOR STATUS" badge="PRE-INTEGRATION"/>
          <DeviceStatus result={result}/>
        </div>
        <div className="card alerts-card">
          <Title title="GAS LIMITS & ALERTS" badge={result?`${result.alerts.filter(alert=>alert.status!=="normal").length} ACTIVE`:"AWAITING MODEL"}/>
          {result?<AlertList alerts={result.alerts}/>:<AwaitingPrediction text="Configured threshold checks will run with the model."/>}
        </div>
        <div className="card controls-card">
          <Title title="AUTOMATION & CONTROLS" badge="RECOMMENDATION ONLY"/>
          {result?<EquipmentStates equipment={result.equipmentStates}/>:<AwaitingPrediction text="Simulated equipment states will appear after prediction."/>}
        </div>
      </section>

      <section className="lower-grid" id="explainable-ai">
        <div className="card forecast">
          <Title title="EXPLAINABLE AI · INPUT USE" badge={result?"9 / 9 INPUTS":"AWAITING MODEL"}/>
          {result?<div className="input-effects">{result.inputEffects.map(effect=><div key={effect.label}><span>{effect.label}</span><b>{effect.value}</b><small>{effect.effect}</small></div>)}</div>:<AwaitingPrediction text="Every input’s role will be documented here."/>}
        </div>
        <div className="card health">
          <Title title="PROCESS HEALTH" badge={result?`${result.stability.toFixed(0)}% STABLE`:"AWAITING MODEL"}/>
          {result?<><div className="gauges"><Gauge label="COD removal" value={result.codRemoval}/><Gauge label="Gas stability" value={result.stability}/><Gauge label="Input coverage" value={result.confidence}/></div><div className="health-list"><span>Pressure <b>{result.pressure.toFixed(1)} mbar</b></span><span>H₂S estimate <b>{result.h2s.toFixed(0)} ppm</b></span><span>Mode <b>{result.mode}</b></span></div></>:<AwaitingPrediction text="Process-health calculations require a prediction."/>}
        </div>
        <div className="card history">
          <Title title="RECENT SIMULATIONS" badge={`${history.length} THIS SESSION`}/>
          {history.length?history.map(item=><div className="history-row" key={item.runId}><span><i className="ok">✓</i>{item.time}</span><b>{item.biogas.toFixed(1)} m³/d</b><em>{item.saved?"Recorded":"Unsaved"}</em></div>):<div className="no-history">Your model runs will appear here.</div>}
          <div className="iot-note"><span>◉</span><div><b>IoT-ready data contract</b><small>Manual inputs can later be replaced by authenticated sensor payloads without changing the report structure.</small></div></div>
        </div>
      </section>

      {auth.role==="admin"&&<section className="card audit-section" id="data-audit">
        <div className="audit-title"><Title title="DATA & AUDIT TRAIL" badge={health?.services.audit==="persistent"?"PERSISTENT":"CHECKING"}/><div><button onClick={()=>void loadAudit()} disabled={auditBusy}>{auditBusy?"Refreshing…":"Refresh"}</button><a href="/api/audit?format=csv">Export CSV</a></div></div>
        <div className="audit-table"><div className="audit-row audit-head"><span>Timestamp</span><span>Run ID</span><span>Operator</span><span>Feedstock</span><span>Biogas</span><span>Gain</span><span>Model</span></div>{auditRuns.length?auditRuns.map(run=><div className="audit-row" key={run.id}><span>{new Date(Number(run.created_at)).toLocaleString()}</span><span>{shortId(run.id)}</span><span>{run.username}</span><span>{run.feedstock}</span><span>{run.outputs?.optimized?.biogas?.toFixed?.(1)??"—"} m³/d</span><span className="positive">{signed(run.outputs?.improvement??0)}%</span><span>v{run.model_version}</span></div>):<div className="no-history">{auditBusy?"Loading recorded runs…":"Run a prediction to create the first persistent audit record."}</div>}</div>
      </section>}

      <footer>
        <span className={health?.services.api==="online"?"":"down"}><i></i> Cloud API {health?.services.api??"checking"}</span>
        <span className={health?.services.model==="online"?"":"down"}><i></i> Model {health?.services.model??"checking"}</span>
        <span className={health?.services.rag==="semantic"?"":"down"}><i></i> RAG {health?.services.rag??"checking"}</span>
        <span className={health?.services.audit==="persistent"?"":"down"}><i></i> Audit {health?.services.audit??"checking"}</span>
        <small>{result?`Run ${shortId(result.runId)} · ${result.audit.status}`:"Awaiting run"} · Synthetic estimates, not plant validated</small>
      </footer>
    </section>

    {chatOpen&&<Copilot messages={messages} question={question} busy={chatBusy} hasResult={Boolean(result)} onQuestion={setQuestion} onClose={()=>setChatOpen(false)} onAsk={ask} onApply={applyBestSetpoints}/>}
    {detailsOpen&&result&&lastRunInputs&&<OptimizationDetails result={result} inputs={lastRunInputs} onClose={()=>setDetailsOpen(false)} onApply={()=>{applyBestSetpoints();setDetailsOpen(false);}}/>}
    {settingsOpen&&auth.role==="admin"&&<AdminModal auth={auth} health={health} settings={settings} busy={settingsBusy} message={settingsMessage} onSettings={setSettings} onSave={saveSettings} onRefresh={refreshHealth} onLogout={logout} onClose={()=>setSettingsOpen(false)}/>}
  </main>;
}

function LoginScreen({username,password,busy,error,onUsername,onPassword,onSubmit}:{username:string;password:string;busy:boolean;error:string;onUsername:(value:string)=>void;onPassword:(value:string)=>void;onSubmit:(event:FormEvent)=>void}) {
  return <main className="login-shell"><section className="login-brand"><div className="login-logo"><span>◒</span><b>AQUAIVOLT<small>AI PLATFORM</small></b></div><div><em>SECURE OPERATIONS PORTAL</em><h1>Intelligent control starts with trusted access.</h1><p>Sign in to run biogas scenarios, review optimization evidence and consult the data-aware Copilot.</p></div><ul><li><i>✓</i> Protected model and RAG endpoints</li><li><i>✓</i> Persistent, attributable simulation records</li><li><i>✓</i> Human-approved operating recommendations</li></ul><small>Prototype environment · Synthetic scenario estimates</small></section><section className="login-panel"><form onSubmit={onSubmit}><div className="login-mark">✦</div><small>AQUAIVOLT COMMAND CENTER</small><h2>Welcome back</h2><p>Use your assigned administrator or operator account.</p><label><span>Username</span><input autoComplete="username" value={username} onChange={event=>onUsername(event.target.value)} placeholder="Enter username" required/></label><label><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={event=>onPassword(event.target.value)} placeholder="Enter password" required/></label>{error&&<div className="login-error">{error}</div>}<button disabled={busy}>{busy?<><span className="spinner"></span> Verifying access…</>:"Sign in securely →"}</button><div className="login-security"><span>●</span><div><b>Protected session</b><small>Credentials are verified by the server and never stored in the browser.</small></div></div></form></section></main>;
}

function DigitalTwin({working,result}:{working:boolean;result:Prediction|null}) {
  const fill=result?Math.min(78,Math.max(42,result.stability*.72)):58;
  return <div className="twin-wrap"><div className={`twin ${working?"working":""}`}><div className="pipe"></div><div className="dome"><span>AQUAIVOLT</span></div><div className="tank"><i></i><i></i><i></i><div className="liquid" style={{height:`${fill}%`}}></div><div className="bubbles"><b></b><b></b><b></b></div></div><div className="base"></div></div><div className="twin-live"><span><i></i>{working?"Agent running":"Digital twin active"}</span>{result&&<small>{result.pressure.toFixed(1)} mbar · {result.methanePct.toFixed(1)}% CH₄</small>}</div></div>;
}

function OptimizationReport({result,benefitPoints,onDetails}:{result:Prediction;benefitPoints:string;onDetails:()=>void}) {
  return <div className="optimization-report"><div className="optimization-columns"><section className="target-panel"><h3>Optimization Targets</h3><div className="target-list">{result.optimizationTargets.map((target,index)=><div className="target-row" key={target.label}><span className={`target-icon c${index}`}>{["◈","ϟ","♨","◇","◉","♨","●"][index]}</span><b>{target.label}</b><em className={target.value>=0?"positive":"negative"}>{signed(target.value)}% <i>{target.value>=0?"↑":"↓"}</i></em></div>)}</div></section><div className="optimization-side"><section className="rec-panel"><h3>Actionable Recommendations</h3><div className="compact-recs">{result.recommendations.slice(0,4).map((recommendation,index)=><div className="compact-rec" key={recommendation.title}><span>{index+1}</span><div><b>{recommendation.title}</b><small>{recommendation.detail}</small></div><em>{recommendation.impact?`+${recommendation.impact.toFixed(1)}%`:"Check"}</em></div>)}</div></section><section className="benefit-panel"><div><small>Overall Benefit vs Baseline</small><b className={result.overallBenefit>=0?"positive":"negative"}>{signed(result.overallBenefit)}%</b><span>Same metric as Optimization Gain</span></div><svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-label="Overall benefit trend"><polyline points={benefitPoints} fill="none" stroke={result.overallBenefit>=0?"#128a70":"#df5d54"} strokeWidth="2" vectorEffect="non-scaling-stroke"/></svg></section></div></div><button className="optimization-details" onClick={onDetails}>View full before/after report</button></div>;
}

function EvidenceTable({result,inputs}:{result:Prediction;inputs:Inputs}) {
  const rows=[
    {label:"Temperature",before:inputs.temperature,after:result.bestSetpoints.temperature,unit:"°C",desired:"target"},
    {label:"pH",before:inputs.ph,after:result.bestSetpoints.ph,unit:"",desired:"target"},
    {label:"OLR",before:inputs.olr,after:result.bestSetpoints.olr,unit:"kg COD/m³·d",desired:"target"},
    {label:"HRT",before:inputs.hrt,after:result.bestSetpoints.hrt,unit:"days",desired:"target"},
    {label:"COD input",before:inputs.codIn,after:result.bestSetpoints.codIn,unit:"mg/L",desired:"reference"},
    {label:"CH₄ content",before:result.baseline.methanePct,after:result.optimized.methanePct,unit:"%",desired:"up"},
    {label:"Gas flow",before:result.baseline.gasFlow,after:result.optimized.gasFlow,unit:"m³/h",desired:"up"},
    {label:"Generator",before:result.baseline.generatorKw,after:result.optimized.generatorKw,unit:"kW",desired:"up"},
  ];
  return <div className="evidence-table"><div className="evidence-row evidence-head"><span>Parameter</span><span>Current / Baseline</span><span>AI Scenario</span><span>Change</span><span>Evidence bar</span></div>{rows.map(row=>{const delta=row.after-row.before;const pct=row.before?delta/row.before*100:0;const width=Math.min(100,Math.max(8,50+pct*2));return <div className="evidence-row" key={row.label}><b>{row.label}</b><span>{format(row.before)} {row.unit}</span><span className="scenario-value">{format(row.after)} {row.unit}</span><span className={row.desired==="up"?(delta>=0?"positive":"negative"):"neutral"}>{row.desired==="up"?`${signed(pct)}%`:delta===0?"Hold":`${delta>0?"+":""}${format(delta)}`}</span><span className="data-bar"><i style={{width:`${width}%`}}></i></span></div>})}<div className="evidence-footer"><span>AI recommendation</span><b>{result.recommendations[0]?.title}</b><small>{result.recommendations[0]?.detail}</small></div></div>;
}

function YieldEnergyChart({data}:{data:HourPoint[]}) {
  const gas=data.map(point=>point.biogas), energy=data.map(point=>point.electricity);
  return <div className="dual-chart"><div className="chart-legend"><span><i className="gas-line"></i>Biogas yield (m³/day)</span><span><i className="energy-line"></i>Electricity (kWh/day)</span></div><div className="chart-wrap"><span className="axis left">{Math.max(...gas).toFixed(0)}<small>{Math.min(...gas).toFixed(0)}</small></span><svg viewBox="0 0 100 58" preserveAspectRatio="none"><defs><linearGradient id="gasFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#24bea5" stopOpacity=".28"/><stop offset="1" stopColor="#24bea5" stopOpacity="0"/></linearGradient></defs><g className="grid-lines"><line x1="0" y1="8" x2="100" y2="8"/><line x1="0" y1="29" x2="100" y2="29"/><line x1="0" y1="50" x2="100" y2="50"/></g><polygon points={`0,52 ${linePoints(gas,100,58,8)} 100,52`} fill="url(#gasFill)"/><polyline points={linePoints(gas,100,58,8)} fill="none" stroke="#21bca3" strokeWidth="2" vectorEffect="non-scaling-stroke"/><polyline points={linePoints(energy,100,58,8)} fill="none" stroke="#e7b74a" strokeWidth="2" vectorEffect="non-scaling-stroke"/></svg><span className="axis right">{Math.max(...energy).toFixed(0)}<small>{Math.min(...energy).toFixed(0)}</small></span></div><div className="chart-hours">{data.filter((_,index)=>index%2===0).map(point=><span key={point.hour}>{point.hour}:00</span>)}</div></div>;
}

function DigesterHealth({result}:{result:Prediction}) {
  return <div className="digester-health"><div className="digester-main"><span>Digester A — Main line</span><b>{result.biogas.toFixed(0)} m³/d</b><em>{statusFromStability(result.stability)}</em></div><small>{result.facility.name} · {result.facility.location}</small><div className="health-progress"><i style={{width:`${result.stability}%`}}></i></div><div className="digester-stats"><span>Temperature<b>{result.bestSetpoints.temperature.toFixed(1)} °C target</b></span><span>pH<b>{result.bestSetpoints.ph.toFixed(2)} target</b></span><span>Gas stability<b>{result.stability.toFixed(0)}%</b></span><span>COD removal<b>{result.codRemoval.toFixed(0)}%</b></span></div><p>Model-derived digester status · no physical sensor connection</p></div>;
}

function PerformanceComparison({metrics}:{metrics:GasMetric[]}) {
  return <div className="gas-comparison"><div className="composition-rule"><b>Simplified gas composition</b><span>CH₄ + CO₂ + converted H₂S = 100%</span></div><div className="gas-legend"><span><i></i>Baseline</span><span><i></i>AI scenario</span></div>{metrics.map(metric=>{const max=Math.max(metric.before,metric.after)*1.15||1;const good=metric.direction==="up"?metric.after>=metric.before:metric.after<=metric.before;return <div className="gas-row" key={metric.key}><div><b>{metric.label}</b><small>{metric.name}</small></div><div className="gas-bars"><span style={{width:`${metric.before/max*100}%`}}></span><span style={{width:`${metric.after/max*100}%`}}></span></div><em className={good?"positive":"negative"}>{format(metric.before)} → {format(metric.after)} {metric.unit}</em></div>})}</div>;
}

function FacilityMap({result}:{result:Prediction|null}) {
  return <div className="facility-monitor"><div className="facility-map"><div className="map-road r1"></div><div className="map-road r2"></div><div className="map-road r3"></div><div className="plant-pin"><i></i><span>{result?.facility.name??"Aquaivolt plant"}<small>{result?.facility.location??"Location pending"}</small></span></div><b>FACILITY POSITION</b><small>Admin-configured coordinates will replace this simulation canvas.</small></div><div className="facility-stats"><div><span>Device availability</span><b>0 / 5 live</b><small>Hardware not connected</small></div><div><span>Simulated signals</span><b>{result?"9 inputs · 3 gases":"Awaiting run"}</b><small>Model data contract active</small></div><div><span>Alarm scenes</span><b>{result?result.alerts.filter(alert=>alert.status!=="normal").length:"—"}</b><small>Threshold-based simulation</small></div></div></div>;
}

function DeviceStatus({result}:{result:Prediction|null}) {
  const devices=[{name:"Gas analyzer · 3-in-1",signal:"CH₄ / CO₂ / H₂S"},{name:"Digester probe",signal:"Temperature / pH"},{name:"Flow transmitter",signal:"Gas flow / pressure"},{name:"Generator meter",signal:"kW / kWh"},{name:"PLC gateway",signal:"Valves / mixer / heating"}];
  return <div className="device-list">{devices.map(device=><div key={device.name}><span className="device-dot"></span><b>{device.name}<small>{device.signal}</small></b><em>NOT CONNECTED</em></div>)}<p><i></i>{result?`Simulation run ${shortId(result.runId)} is supplying the dashboard.`:"The model will supply simulated signals until device credentials are configured."}</p></div>;
}

function AlertList({alerts}:{alerts:Alert[]}) {return <div className="alert-list">{alerts.map(alert=><div className={`alert-row ${alert.status}`} key={alert.key}><span>{alert.status==="normal"?"✓":alert.status==="critical"?"!":"△"}</span><div><b>{alert.label}</b><small>{alert.message}</small></div><em>{format(alert.value)} {alert.unit}<small>Limit {alert.limit}</small></em></div>)}</div>}

function EquipmentStates({equipment}:{equipment:Equipment[]}) {return <div className="equipment-list">{equipment.map(item=><div key={item.label}><span className={item.tone}></span><b>{item.label}<small>{item.detail}</small></b><em>{item.state}<small>{item.mode}</small></em></div>)}<p>Controls are recommendations only. No command is sent to physical equipment.</p></div>}

function Copilot({messages,question,busy,hasResult,onQuestion,onClose,onAsk,onApply}:{messages:{role:string;text:string}[];question:string;busy:boolean;hasResult:boolean;onQuestion:(value:string)=>void;onClose:()=>void;onAsk:(event?:FormEvent,quick?:string)=>void;onApply:()=>void}) {
  return <div className="chat"><div className="chat-head"><div><span>✦</span><b>Aqua Copilot</b><small>RAG · current scenario context</small></div><button onClick={onClose}>×</button></div><div className="messages">{messages.map((message,index)=><div key={index} className={`message ${message.role}`}>{message.text}</div>)}{busy&&<div className="message ai typing"><i></i><i></i><i></i></div>}</div><div className="quick">{hasResult&&<button onClick={onApply}>Apply modeled setpoints</button>}{quickQuestions.map(item=><button onClick={()=>onAsk(undefined,item)} key={item}>{item}</button>)}</div><form onSubmit={event=>onAsk(event)}><input value={question} onChange={event=>onQuestion(event.target.value)} placeholder="Ask about this scenario…"/><button>➤</button></form></div>;
}

function OptimizationDetails({result,inputs,onClose,onApply}:{result:Prediction;inputs:Inputs;onClose:()=>void;onApply:()=>void}) {
  return <div className="details-backdrop" onClick={onClose}><section className="details-modal report-modal" onClick={event=>event.stopPropagation()}><div className="details-head"><div><small>DYNAMIC PREDICTION REPORT · {result.audit.status}</small><h2>Optimization evidence</h2></div><button onClick={onClose}>×</button></div><div className="details-kpis"><Metric label="Biogas" value={`${result.biogas.toFixed(1)} m³/d`} delta={`${signed(result.improvement)}% vs baseline`}/><Metric label="Methane" value={`${result.methanePct.toFixed(1)}%`} delta={`${result.methane.toFixed(1)} m³ CH₄/d`}/><Metric label="Electricity" value={`${result.electricity.toFixed(1)} kWh/d`} delta={`${result.generatorKw.toFixed(1)} kW generator`}/><Metric label="Carbon reduction" value={`${result.carbon.toFixed(2)} tCO₂e/d`} delta="Scenario estimate"/></div><EvidenceTable result={result} inputs={inputs}/><div className="modal-recs"><h3>Operator review queue</h3>{result.recommendations.map(item=><div key={item.title}><b>{item.title}</b><span>{format(item.current)} {item.unit} → {format(item.target)} {item.unit}</span><small>{item.detail}</small></div>)}</div><p className="details-note"><b>{result.modelName} v{result.modelVersion}</b> · {result.modelFit}. Scenario coverage {result.confidence.toFixed(0)}% is an input-space score, not validated plant accuracy. Run ID {result.runId}.</p><button className="details-apply" onClick={onApply}>Copy modeled setpoints into input form</button></section></div>;
}

function AdminModal({auth,health,settings,busy,message,onSettings,onSave,onRefresh,onLogout,onClose}:{auth:AuthUser;health:Health|null;settings:AdminSettings|null;busy:boolean;message:string;onSettings:(settings:AdminSettings)=>void;onSave:(event:FormEvent)=>void;onRefresh:()=>void;onLogout:()=>void;onClose:()=>void}) {
  const set=(key:keyof AdminSettings,value:string)=>settings&&onSettings({...settings,[key]:["facilityName","facilityLocation"].includes(key)?value:Number(value)});
  return <div className="details-backdrop" onClick={onClose}><section className="details-modal admin-modal" onClick={event=>event.stopPropagation()}><div className="details-head"><div><small>ADMIN CONTROL</small><h2>Plant configuration & readiness</h2></div><button onClick={onClose}>×</button></div><div className="admin-summary"><div><span>Signed in as</span><b>{auth.username}</b><small>Administrator</small></div><div><span>Active model</span><b>{health?.model.name??"Checking"}</b><small>{health?`Version ${health.model.version}`:"Waiting"}</small></div><div><span>Audit storage</span><b>{health?.services.audit??"Checking"}</b><small>Prediction evidence trail</small></div></div><div className="readiness-list">{health?.checks.map(check=><div key={check.key}><i className={check.ready?"ready":"pending"}>{check.ready?"✓":"○"}</i><span><b>{check.label}</b><small>{check.ready?"Operational":check.key==="iot"?"Awaiting hardware":"Not validated"}</small></span><em>{check.weight}%</em></div>)}</div><form className="threshold-form" onSubmit={onSave}><h3>Facility & alarm thresholds</h3>{settings?<><label className="wide"><span>Facility name</span><input value={settings.facilityName} onChange={event=>set("facilityName",event.target.value)}/></label><label className="wide"><span>Facility location</span><input value={settings.facilityLocation} onChange={event=>set("facilityLocation",event.target.value)}/></label><label><span>Minimum CH₄ (%)</span><input type="number" step="0.1" value={settings.methaneMinimum} onChange={event=>set("methaneMinimum",event.target.value)}/></label><label><span>H₂S warning (ppm)</span><input type="number" value={settings.h2sWarning} onChange={event=>set("h2sWarning",event.target.value)}/></label><label><span>Pressure minimum</span><input type="number" step="0.1" value={settings.pressureMinimum} onChange={event=>set("pressureMinimum",event.target.value)}/></label><label><span>Pressure maximum</span><input type="number" step="0.1" value={settings.pressureMaximum} onChange={event=>set("pressureMaximum",event.target.value)}/></label><button disabled={busy}>{busy?"Saving…":"Save configuration"}</button>{message&&<p>{message}</p>}</>:<div className="no-history">Loading configuration…</div>}</form><div className="admin-actions"><button onClick={onRefresh}>Refresh status</button><button className="signout" onClick={onLogout}>Sign out</button></div></section></div>;
}

function Title({title,badge}:{title:string;badge:string}) {return <div className="card-title"><h2>{title}</h2><span>{badge}</span></div>}
function AwaitingPrediction({text}:{text:string}) {return <div className="awaiting"><span>◇</span><b>No static result values</b><p>{text}</p></div>}
function Kpi({label,value,color,note}:{label:string;value:string;color:string;note:string}) {return <div className="kpi card"><div className={`ring ${value.length>5?"wide-value":""}`} style={{"--color":color} as React.CSSProperties}><b>{value}</b></div><div><span>{label}</span><small>{note}</small><i style={{background:color}}></i></div></div>}
function Field({label,value,unit,onChange,options,step,min,max}:{label:string;value:string|number;unit?:string;onChange:(value:string)=>void;options?:string[];step?:string;min?:number;max?:number}) {return <label className="field"><span>{label}</span><div>{options?<select value={value} onChange={event=>onChange(event.target.value)}>{options.map(option=><option key={option}>{option}</option>)}</select>:<input type="number" step={step||"1"} min={min} max={max} value={value} onChange={event=>onChange(event.target.value)}/>} {unit&&<em>{unit}</em>}</div></label>}
function Metric({label,value,delta}:{label:string;value:string;delta:string}) {return <div className="metric"><span>{label}</span><b>{value}</b><small>{delta} ↗</small></div>}
function Gauge({label,value}:{label:string;value:number}) {return <div><div className="gauge" style={{"--p":`${Math.max(0,Math.min(100,value))*3.6}deg`} as React.CSSProperties}><b>{value.toFixed(0)}%</b></div><span>{label}</span></div>}
function AgentSteps() {return <div className="agent-steps"><div className="agent-orb">✦</div><b>Optimization agent is working</b>{["Validating all 9 inputs","Running deterministic scenario inference","Testing baseline and safe setpoints","Evaluating gas limits and equipment states","Recording the audit evidence"].map((step,index)=><span key={step} style={{animationDelay:`${index*.15}s`}}><i>✓</i>{step}</span>)}</div>}

function format(value:number) {return Math.abs(value)>=100?value.toFixed(0):Math.abs(value)>=10?value.toFixed(1):value.toFixed(2)}
function signed(value:number) {return `${value>=0?"+":""}${value.toFixed(1)}`}
function shortId(value:string) {return value?.split("-")[0]?.toUpperCase()||"—"}
function statusFromStability(value:number) {return value>=82?"OPTIMAL":value>=68?"STABLE":"REVIEW"}
function linePoints(values:number[],width:number,height:number,padding:number) {if(!values.length)return"";const min=Math.min(...values),max=Math.max(...values),span=max-min||1;return values.map((value,index)=>`${padding+index*((width-padding*2)/Math.max(1,values.length-1))},${height-padding-((value-min)/span)*(height-padding*2)}`).join(" ")}
