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
type Prediction = {
  biogas:number; methane:number; electricity:number; bestSetpoints:Omit<Inputs,"feedstock">;
  recommendations:Recommendation[]; baseline:PlantOutput; optimized:PlantOutput;
  modelName:string; modelVersion:string; modelFit:string; outOfRange:boolean; extrapolatedInputs?:string[];
  runId:string; createdAt:string; agentMessage:string;
  audit:{saved:boolean;status:string};
};
type AuthUser = {username:string;role:"admin"|"user"};
type OutputKey = "biogas"|"methane"|"electricity";
type RunRecord = {id:string;time:string;inputs:Inputs;result:Prediction};
type AdminSettings = {
  methaneMinimum:number; h2sWarning:number; pressureMinimum:number; pressureMaximum:number;
  facilityName:string; facilityLocation:string;
};

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
  const [advanced,setAdvanced]=useState(false);
  const [loading,setLoading]=useState(false);
  const [predictionError,setPredictionError]=useState("");
  const [chatOpen,setChatOpen]=useState(false);
  const [question,setQuestion]=useState("");
  const [chatBusy,setChatBusy]=useState(false);
  const [messages,setMessages]=useState<{role:"ai"|"user";text:string}[]>([{role:"ai",text:"Run a calculation, then ask me what changed or what input to adjust next."}]);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [settings,setSettings]=useState<AdminSettings|null>(null);
  const [settingsMessage,setSettingsMessage]=useState("");

  useEffect(()=>{void (async()=>{try{const response=await fetch("/api/auth/session",{cache:"no-store"});if(response.ok)setAuth((await response.json()).user);}finally{setChecking(false);}})();},[]);

  const dirty=Boolean(result&&lastRunInputs&&JSON.stringify(inputs)!==JSON.stringify(lastRunInputs));

  const update=(key:keyof Inputs,value:string)=>setInputs(current=>({...current,[key]:key==="feedstock"?value:Number(value)}));

  async function login(event:FormEvent){
    event.preventDefault();setLoginBusy(true);setLoginError("");
    try{const response=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Login failed");setAuth(data.user);setPassword("");}
    catch(error){setLoginError(error instanceof Error?error.message:"Login failed");}
    finally{setLoginBusy(false);}
  }

  async function logout(){await fetch("/api/auth/logout",{method:"POST"});setAuth(null);setResult(null);setRuns([]);setSettingsOpen(false);}

  async function predict(){
    setLoading(true);setPredictionError("");
    try{
      const previousRun=result&&lastRunInputs?{prediction:result,inputs:lastRunInputs}:null;
      const [response]=await Promise.all([
        fetch("/api/predict",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...inputs,previousRun})}),
        new Promise(resolve=>setTimeout(resolve,650)),
      ]);
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Prediction service is unavailable");
      setResult(data);setLastRunInputs({...inputs});
      setRuns(current=>[{id:data.runId,time:new Date(data.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),inputs:{...inputs},result:data},...current].slice(0,8));
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

  if(checking)return <main className="loading-screen"><span>◒</span><b>Opening Aquaivolt…</b></main>;
  if(!auth)return <LoginScreen username={username} password={password} error={loginError} busy={loginBusy} onUsername={setUsername} onPassword={setPassword} onSubmit={login}/>;

  const active=outputs[activeOutput];
  return <main className="simple-shell">
    <aside className="simple-sidebar">
      <div className="simple-brand"><span>◒</span><b>AQUAIVOLT<small>WASTE TO ENERGY</small></b></div>
      <nav>
        <button className="active" onClick={()=>document.getElementById("overview")?.scrollIntoView()}><span>⌂</span>Overview</button>
        <button onClick={()=>document.getElementById("inputs")?.scrollIntoView()}><span>▦</span>Plant inputs</button>
        {(Object.keys(outputs) as OutputKey[]).map(key=><button key={key} className={activeOutput===key?"strong":""} onClick={()=>{setActiveOutput(key);document.getElementById("comparison")?.scrollIntoView();}}><span>{outputs[key].icon}</span>{outputs[key].label}</button>)}
        <button onClick={()=>document.getElementById("history")?.scrollIntoView()}><span>≡</span>Run history</button>
        {auth.role==="admin"&&<button onClick={()=>void openSettings()}><span>⚙</span>Settings</button>}
      </nav>
      <div className="side-note"><b>MODEL MODE</b><span>Synthetic scenario calculation</span><small>No physical equipment is controlled.</small></div>
      <button className="side-logout" onClick={()=>void logout()}>Log out</button>
    </aside>

    <section className="simple-workspace" id="overview">
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
        </div>
      </section>

      <section className="comparison-panel" id="comparison">
        {loading?<Working/>:result?<Comparison outputKey={activeOutput} result={result}/>:<EmptyResult/>}
      </section>

      <section className="validation-panel">
        <div className="section-heading compact"><div><small>SUPPLIED DATA</small><h2>{active.label} across 10 validation runs</h2><p>Grey is the baseline. Colour is the optimized value from the supplied workbook.</p></div></div>
        <ValidationChart outputKey={activeOutput}/>
      </section>

      <section className="history-panel" id="history">
        <div className="section-heading compact"><div><small>STEP 3</small><h2>Compare recent calculations</h2><p>Each row uses the inputs entered for that run.</p></div></div>
        <RunTable runs={runs} outputKey={activeOutput}/>
      </section>

      <footer><span>Deterministic prototype model • Synthetic and projected source data • Operator review required</span><b>{result?`${result.modelName} ${result.modelVersion}`:"Ready for first calculation"}</b></footer>
    </section>

    {chatOpen&&<Copilot messages={messages} question={question} busy={chatBusy} result={result} onQuestion={setQuestion} onAsk={ask} onClose={()=>setChatOpen(false)} onApply={()=>{if(result)setInputs(current=>({...current,...result.bestSetpoints}));}}/>}
    {settingsOpen&&auth.role==="admin"&&<SettingsModal settings={settings} message={settingsMessage} onChange={setSettings} onSave={saveSettings} onClose={()=>setSettingsOpen(false)}/>}
  </main>;
}

function LoginScreen({username,password,error,busy,onUsername,onPassword,onSubmit}:{username:string;password:string;error:string;busy:boolean;onUsername:(v:string)=>void;onPassword:(v:string)=>void;onSubmit:(e:FormEvent)=>void}){
  return <main className="login-page"><section className="login-story"><div className="simple-brand light"><span>◒</span><b>AQUAIVOLT<small>WASTE TO ENERGY</small></b></div><div><small>AI BIOGAS PLATFORM</small><h1>Simple plant inputs.<br/>Clear production results.</h1><p>Compare biogas, methane and electricity before and after model optimization.</p></div><em>Synthetic scenario prototype • Human approval required</em></section><section className="login-form-wrap"><form onSubmit={onSubmit}><span className="login-icon">✦</span><small>SECURE ACCESS</small><h2>Sign in</h2><p>Use your Aquaivolt admin or user account.</p><label><span>Username</span><input value={username} onChange={event=>onUsername(event.target.value)} autoComplete="username" required/></label><label><span>Password</span><input type="password" value={password} onChange={event=>onPassword(event.target.value)} autoComplete="current-password" required/></label>{error&&<div className="login-error">{error}</div>}<button disabled={busy}>{busy?"Checking…":"Continue →"}</button></form></section></main>;
}

function Field({label,value,unit,onChange,options,step}:{label:string;value:string|number;unit?:string;onChange:(v:string)=>void;options?:string[];step?:string}){
  return <label className="simple-field"><span>{label}</span><div>{options?<select value={value} onChange={event=>onChange(event.target.value)}>{options.map(option=><option key={option}>{option}</option>)}</select>:<input type="number" step={step||"any"} value={value} onChange={event=>onChange(event.target.value)}/>} {unit&&<em>{unit}</em>}</div></label>;
}

function OutputCard({outputKey,result,active,onClick}:{outputKey:OutputKey;result:Prediction|null;active:boolean;onClick:()=>void}){
  const meta=outputs[outputKey];const before=result?meta.before(result):null;const after=result?meta.after(result):null;const extra=before!==null&&after!==null?after-before:null;
  return <button className={`output-card ${active?"active":""}`} style={{"--accent":meta.color} as React.CSSProperties} onClick={onClick}><span className="output-icon">{meta.icon}</span><div><small>{meta.label}</small><b>{after===null?"Waiting":format(after)} <em>{after===null?"":meta.unit}</em></b><p>{before===null||extra===null?"Run a calculation":<>Before {format(before)} • Extra {format(extra)}</>}</p></div><i>→</i></button>;
}

function Comparison({outputKey,result}:{outputKey:OutputKey;result:Prediction}){
  const meta=outputs[outputKey];const before=meta.before(result);const after=meta.after(result);const extra=after-before;const max=Math.max(before,after)*1.08;
  return <><div className="comparison-head"><div><small>CURRENT CALCULATION</small><h2>{meta.label}: before and after</h2><p>A longer coloured bar means more production.</p></div><span className="coverage-word">{result.outOfRange?"Estimated from nearest pattern":"Matched to supplied patterns"}</span></div><div className="comparison-layout"><div className="big-bars"><div className="bar-row"><span>Before AI</span><div><i className="before" style={{width:`${before/max*100}%`}}/></div><b>{format(before)}<small>{meta.unit}</small></b></div><div className="bar-row"><span>After AI</span><div><i className="after" style={{width:`${after/max*100}%`,background:meta.color}}/></div><b>{format(after)}<small>{meta.unit}</small></b></div><div className="extra-callout"><span>Extra {meta.label.toLowerCase()}</span><b>+{format(extra)} <small>{meta.unit}</small></b><p>This is the direct difference between the two bars.</p></div></div><div className="recommendation-box"><small>WHAT TO DO NEXT</small><h3>{result.recommendations[0]?.title||"Keep the current inputs"}</h3><p>{result.recommendations[0]?.detail||"The current scenario is close to the supplied reference case."}</p>{result.recommendations[0]&&<div><span>{result.recommendations[0].parameter}</span><b>{format(result.recommendations[0].current)} {result.recommendations[0].unit}</b><i>→</i><b>{format(result.recommendations[0].target)} {result.recommendations[0].unit}</b></div>}<em>Review with the plant operator before changing equipment.</em></div></div></>;
}

function ValidationChart({outputKey}:{outputKey:OutputKey}){
  const series=validationSeries[outputKey];const meta=outputs[outputKey];const all=[...series.before,...series.after];const max=Math.max(...all)*1.08;const width=880,height=230,pad=34;const points=(values:number[])=>values.map((value,index)=>`${pad+index*((width-pad*2)/(values.length-1))},${height-pad-(value/max)*(height-pad*2)}`).join(" ");
  return <div className="validation-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${meta.label} before and after across ten supplied validation runs`}><g className="chart-grid">{[0,1,2,3].map(index=><line key={index} x1={pad} x2={width-pad} y1={pad+index*48} y2={pad+index*48}/>)}</g><polyline className="validation-before" points={points(series.before)}/><polyline className="validation-after" style={{stroke:meta.color}} points={points(series.after)}/>{series.after.map((value,index)=><circle key={index} cx={pad+index*((width-pad*2)/(series.after.length-1))} cy={height-pad-(value/max)*(height-pad*2)} r="4" style={{fill:meta.color}}/>)}{series.after.map((_,index)=><text key={index} x={pad+index*((width-pad*2)/(series.after.length-1))} y={height-8} textAnchor="middle">{index+1}</text>)}</svg><div className="chart-labels"><span><i className="grey"/>Before AI</span><span><i style={{background:meta.color}}/>After AI</span><b>Unit: {meta.unit}</b></div></div>;
}

function RunTable({runs,outputKey}:{runs:RunRecord[];outputKey:OutputKey}){
  const meta=outputs[outputKey];
  if(!runs.length)return <div className="empty-history"><span>≡</span><b>No calculations yet</b><p>Your recent input and output comparisons will appear here.</p></div>;
  return <div className="run-table"><div className="run-row run-head"><span>Run</span><span>Inputs</span><span>Before</span><span>After</span><span>Extra</span><span>Recommendation</span></div>{runs.map(run=>{const before=meta.before(run.result),after=meta.after(run.result);return <div className="run-row" key={run.id}><b>{run.time}<small>{run.inputs.feedstock}</small></b><span>{run.inputs.temperature}°C • pH {run.inputs.ph} • {run.inputs.hrt} days</span><span>{format(before)} {meta.unit}</span><strong>{format(after)} {meta.unit}</strong><em>+{format(after-before)} {meta.unit}</em><span>{run.result.recommendations[0]?.title||"Hold inputs"}</span></div>})}</div>;
}

function EmptyResult(){return <div className="empty-result"><span>1</span><i>→</i><span>2</span><i>→</i><span>3</span><div><b>Enter inputs</b><b>Run calculation</b><b>Compare results</b></div><p>No placeholder numbers are shown. Results appear only after the model runs.</p></div>}
function Working(){return <div className="working"><span className="agent-orb">✦</span><h2>AI is working</h2><p>Checking all nine inputs, matching supplied scenarios and calculating before versus after.</p><div><i/><i/><i/></div></div>}

function Copilot({messages,question,busy,result,onQuestion,onAsk,onClose,onApply}:{messages:{role:"ai"|"user";text:string}[];question:string;busy:boolean;result:Prediction|null;onQuestion:(v:string)=>void;onAsk:(e?:FormEvent)=>void;onClose:()=>void;onApply:()=>void}){
  return <aside className="chat-panel"><header><div><small>DATA-AWARE ASSISTANT</small><h2>Aqua Copilot</h2></div><button onClick={onClose}>×</button></header><div className="chat-context"><span>{result?`Ready to explain run ${result.runId.split("-")[0].toUpperCase()}`:"Run a calculation for a specific answer"}</span></div><div className="chat-messages">{messages.map((message,index)=><div key={index} className={message.role}>{message.text}</div>)}{busy&&<div className="ai">Thinking…</div>}</div>{result&&<button className="apply-setpoints" onClick={onApply}>Copy recommended inputs to form</button>}<form onSubmit={onAsk}><input value={question} onChange={event=>onQuestion(event.target.value)} placeholder="Ask what changed or why…"/><button disabled={busy||!question.trim()}>↑</button></form></aside>;
}

function SettingsModal({settings,message,onChange,onSave,onClose}:{settings:AdminSettings|null;message:string;onChange:(v:AdminSettings)=>void;onSave:(e:FormEvent)=>void;onClose:()=>void}){
  return <div className="modal-backdrop" onClick={onClose}><section className="settings-modal" onClick={event=>event.stopPropagation()}><header><div><small>ADMIN ONLY</small><h2>Plant settings</h2></div><button onClick={onClose}>×</button></header>{!settings?<p>Loading settings…</p>:<form onSubmit={onSave}><label><span>Facility name</span><input value={settings.facilityName} onChange={event=>onChange({...settings,facilityName:event.target.value})}/></label><label><span>Facility location</span><input value={settings.facilityLocation} onChange={event=>onChange({...settings,facilityLocation:event.target.value})}/></label><label><span>H₂S warning</span><div><input type="number" value={settings.h2sWarning} onChange={event=>onChange({...settings,h2sWarning:Number(event.target.value)})}/><em>ppm</em></div></label><div className="settings-pair"><label><span>Pressure minimum</span><input type="number" value={settings.pressureMinimum} onChange={event=>onChange({...settings,pressureMinimum:Number(event.target.value)})}/></label><label><span>Pressure maximum</span><input type="number" value={settings.pressureMaximum} onChange={event=>onChange({...settings,pressureMaximum:Number(event.target.value)})}/></label></div>{message&&<p className="settings-message">{message}</p>}<button className="save-settings">Save settings</button></form>}</section></div>;
}

function format(value:number){return Math.abs(value)>=100?value.toFixed(0):Math.abs(value)>=10?value.toFixed(1):value.toFixed(2)}
