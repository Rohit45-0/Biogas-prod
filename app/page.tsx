"use client";

import { FormEvent, useMemo, useState } from "react";

type Inputs = { feedstock:string; feedRate:number; temperature:number; ph:number; olr:number; hrt:number; codIn:number; vfa:number; mixing:number };
type Prediction = { biogas:number; methanePct:number; methane:number; electricity:number; carbon:number; codRemoval:number; stability:number; confidence:number; improvement:number; pressure:number; h2s:number; recommendations:{title:string;detail:string;impact:number;tone:string}[]; forecast:number[]; bestSetpoints:{feedRate:number;temperature:number;ph:number;olr:number;hrt:number;codIn:number;vfa:number;mixing:number}; agentMessage:string; modelName:string; modelFit:string; outOfRange:boolean; confidenceMeaning?:string };

const initial: Inputs = { feedstock:"Dairy WW", feedRate:846, temperature:35, ph:7.1, olr:3.5, hrt:22, codIn:7000, vfa:1100, mixing:50 };

const nav = ["Executive Overview","AI Intelligence","Digital Twin","IoT & Sensors","AI Optimization","Prediction Center","Explainable AI","Data & Audit","Settings"];
const quickQuestions = ["What are the best setpoints?","Explain this prediction","Is my pH safe?"];

export default function Home(){
  const [inputs,setInputs]=useState(initial); const [result,setResult]=useState<Prediction|null>(null);
  const [loading,setLoading]=useState(false); const [active,setActive]=useState("Executive Overview");
  const [chatOpen,setChatOpen]=useState(false); const [question,setQuestion]=useState("");
  const [messages,setMessages]=useState<{role:string;text:string}[]>([{role:"ai",text:"I’m Aqua Copilot. Ask me about this plant, the prediction, or ways to improve performance."}]);
  const [chatBusy,setChatBusy]=useState(false); const [history,setHistory]=useState<{time:string;biogas:number;electricity:number}[]>([]);
  const [lastRunInputs,setLastRunInputs]=useState<Inputs|null>(null);

  const predict=async()=>{ setLoading(true); setResult(null); await new Promise(r=>setTimeout(r,1050));
    const previousRun=result&&lastRunInputs?{prediction:result,inputs:lastRunInputs}:null;
    const res=await fetch("/api/predict",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...inputs,previousRun})});
    const data=await res.json(); setResult(data); setLastRunInputs({...inputs}); setHistory(h=>[{time:new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}),biogas:data.biogas,electricity:data.electricity},...h].slice(0,4)); setMessages(m=>[...m,{role:"ai",text:data.agentMessage}]); setLoading(false); setChatOpen(true);
  };
  const update=(key:keyof Inputs,value:string)=>setInputs(v=>({...v,[key]:key==="feedstock"?value:Number(value)}));
  const applyBestSetpoints=()=>{if(!result)return; setInputs(v=>({...v,...result.bestSetpoints})); setMessages(m=>[...m,{role:"ai",text:"I applied the best modeled scenario setpoints to the form. Run the prediction again to compare them with your prior input."}]);};
  const ask=async(e?:FormEvent,q?:string)=>{e?.preventDefault(); const text=(q??question).trim(); if(!text)return; const chatHistory=[...messages.slice(-5),{role:"user",text}]; const predictionForChat=result&&lastRunInputs&&["feedstock","feedRate","temperature","ph","olr","hrt","codIn","vfa","mixing"].every(key=>inputs[key as keyof Inputs]===lastRunInputs[key as keyof Inputs])?result:null; setMessages(m=>[...m,{role:"user",text}]);setQuestion("");setChatBusy(true);
    try { const res=await fetch("/api/copilot",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:text,inputs,prediction:predictionForChat,history:chatHistory})}); const data=await res.json();
      const evidence=Array.isArray(data.sources)&&data.sources.length?`\n\nEvidence: ${data.sources.slice(0,3).join("; ")}`:""; setMessages(m=>[...m,{role:"ai",text:`${data.answer||"I couldn't complete that answer."}${evidence}`}]);
    } catch { setMessages(m=>[...m,{role:"ai",text:"I couldn't reach the knowledge service. Please try again in a moment."}]); } finally { setChatBusy(false); }
  };
  const shown=result??{biogas:3443.1,methanePct:65.5,methane:2255.2,electricity:1224.2,carbon:.87,codRemoval:80,stability:90,confidence:94,improvement:19.5,pressure:21,h2s:527,recommendations:[],forecast:[3357,3374,3388,3396,3410,3423,3436,3443,3451,3464,3472,3485]};
  const points=useMemo(()=>shown.forecast.map((v,i)=>`${i*(100/(shown.forecast.length-1))},${90-(v/Math.max(...shown.forecast))*68}`).join(" "),[shown.forecast]);

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="drop">◒</span><div><b>AQUAIVOLT</b><small>AI PLATFORM</small></div></div>
      <nav>{nav.map((n,i)=><button key={n} className={active===n?"nav active":"nav"} onClick={()=>setActive(n)}><span>{["⌂","✦","♙","◉","✥","◇","◎","▦","⚙"][i]}</span>{n}</button>)}</nav>
      <button className="copilot-mini" onClick={()=>setChatOpen(true)}><span className="robot">✦</span><b>AI Copilot Assistant</b><small>Ask about performance, predictions or optimization.</small><em>Start chat →</em></button>
      <div className="copyright">AQUAIVOLT © 2026<br/><small>Prototype • Synthetic data</small></div>
    </aside>

    <section className="workspace">
      <header><div><h1>AI Command Center</h1><p>Smart Biogas Optimization & Digital Twin Platform</p></div><div className="header-actions"><span className="online">● &nbsp; System Online</span><span className="date">◫ &nbsp; {new Date().toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}</span><button className="ai-btn" onClick={()=>setChatOpen(true)}>✦ &nbsp; AI Copilot</button><span className="avatar">AV</span></div></header>

      <section className="kpis">
        <Kpi label="AI Readiness" value="87%" color="#1e87f0" note="Prototype ready"/>
        <Kpi label="Scenario Coverage" value={`${shown.confidence.toFixed(0)}%`} color="#6d28d9" note="Input-space validity score"/>
        <Kpi label="Digital Twin" value={loading?"RUN":"ACTIVE"} color="#18a957" note={loading?"Simulating plant":"Manual input mode"}/>
        <Kpi label="Optimization Gain" value={`+${shown.improvement.toFixed(1)}%`} color="#f97316" note="vs. baseline"/>
      </section>

      <section className="main-grid">
        <div className="card input-card"><Title title="PLANT INPUT & DIGITAL TWIN" badge="MANUAL MODE"/>
          <div className="input-layout"><div className="form-grid">
            <Field label="Feedstock" value={inputs.feedstock} onChange={v=>update("feedstock",v)} options={["Dairy WW","Cow Manure","Food Waste","Brewery","Paper Mill","Mixed Waste"]}/>
            <Field label="Feed rate" value={inputs.feedRate} unit="kg VS/d" onChange={v=>update("feedRate",v)} min={820} max={870}/>
            <Field label="Temperature" value={inputs.temperature} unit="°C" onChange={v=>update("temperature",v)} min={34.08} max={38.87} step="0.1"/>
            <Field label="pH level" value={inputs.ph} onChange={v=>update("ph",v)} min={6.82} max={7.58} step="0.01"/>
            <Field label="Organic loading" value={inputs.olr} unit="kg COD/m³·d" onChange={v=>update("olr",v)} min={1.55} max={6.38} step="0.1"/>
            <Field label="Retention time" value={inputs.hrt} unit="days" onChange={v=>update("hrt",v)} min={15.45} max={34.62} step="0.1"/>
            <Field label="COD input" value={inputs.codIn} unit="mg/L" onChange={v=>update("codIn",v)} min={3205} max={11864}/>
            <Field label="VFA" value={inputs.vfa} unit="mg/L" onChange={v=>update("vfa",v)} min={251} max={2963}/>
            <Field label="Mixer speed" value={inputs.mixing} unit="RPM" onChange={v=>update("mixing",v)} min={20} max={79}/>
          </div><div className="twin-wrap"><div className={`twin ${loading?"working":""}`}><div className="pipe"></div><div className="dome"><span>AQUAIVOLT</span></div><div className="tank"><i></i><i></i><i></i><div className="liquid"></div></div><div className="base"></div></div><p>{loading?"AI agent is simulating outcomes…":"Digital twin ready"}</p></div></div>
          <button className="predict" onClick={predict} disabled={loading}>{loading?<><span className="spinner"></span> Agent analyzing plant conditions…</>:<>✦ Run AI prediction</>}</button>
        </div>

        <div className="card optimization"><Title title="AI OPTIMIZATION ENGINE" badge={result?"NEW ANALYSIS":"AWAITING INPUT"}/>
          {loading?<AgentSteps/>:result?<><div className="metric-grid">
            <Metric label="Biogas production" value={`${result.biogas.toFixed(1)} m³/d`} delta={`+${result.improvement.toFixed(1)}%`}/><Metric label="Methane content" value={`${result.methanePct.toFixed(1)}%`} delta="Predicted"/>
            <Metric label="Electricity output" value={`${result.electricity.toFixed(1)} kWh/d`} delta="Net potential"/><Metric label="Carbon reduction" value={`${result.carbon.toFixed(2)} tCO₂e/d`} delta="Estimated"/>
          </div><h3 className="rec-title">AI agent recommendations</h3><div className="recommendations">{result.recommendations.map((r,i)=><div className="recommendation" key={i}><span className={r.tone}>↗</span><div><b>{r.title}</b><small>{r.detail}</small></div><em>{r.impact ? `+${r.impact.toFixed(1)}%` : "Check"}</em></div>)}</div></>:<div className="empty"><span>✦</span><b>Ready to optimize</b><p>Enter current plant conditions and run a prediction. The agent will calculate outputs and suggest safe adjustments.</p></div>}
        </div>
      </section>

      <section className="lower-grid">
        <div className="card forecast"><Title title="PREDICTION CENTER" badge="NEXT 24 HOURS"/><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Prediction forecast"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1677ff" stopOpacity=".28"/><stop offset="1" stopColor="#1677ff" stopOpacity="0"/></linearGradient></defs><polygon points={`0,95 ${points} 100,95`} fill="url(#area)"/><polyline points={points} fill="none" stroke="#1677ff" strokeWidth="2" vectorEffect="non-scaling-stroke"/></svg><div className="forecast-stats"><b>{shown.biogas.toFixed(1)}<small> m³/d<br/>Biogas</small></b><b>{shown.methanePct.toFixed(1)}<small>%<br/>CH₄</small></b><b>{shown.electricity.toFixed(1)}<small> kWh/d<br/>Electricity</small></b></div></div>
        <div className="card health"><Title title="PROCESS HEALTH" badge={`${shown.stability.toFixed(0)}% STABLE`}/><div className="gauges"><Gauge label="COD removal" value={shown.codRemoval}/><Gauge label="Gas stability" value={shown.stability}/><Gauge label="Input coverage" value={shown.confidence}/></div><div className="health-list"><span>Pressure <b>{shown.pressure.toFixed(1)} mbar</b></span><span>H₂S prediction <b>{shown.h2s.toFixed(0)} ppm</b></span><span>Data source <b>Human input</b></span></div></div>
        <div className="card history"><Title title="RECENT SIMULATIONS" badge={`${history.length} RUNS`}/>{history.length?history.map((h,i)=><div className="history-row" key={i}><span><i className="ok">✓</i>{h.time}</span><b>{h.biogas.toFixed(1)} m³/d</b><em>{h.electricity.toFixed(0)} kWh</em></div>):<div className="no-history">Your predictions will appear here.</div>}<div className="iot-note"><span>◉</span><div><b>IoT-ready architecture</b><small>Manual form can be replaced by live sensor ingestion without changing the prediction contract.</small></div></div></div>
      </section>
      <footer><span><i></i> Cloud API online</span><span><i></i> Scenario ML service online</span><span><i></i> Knowledge base: 6 workbooks</span><small>Synthetic scenario estimates — not live-plant validated.</small></footer>
    </section>

    {chatOpen&&<div className="chat"><div className="chat-head"><div><span>✦</span><b>Aqua Copilot</b><small>Data-aware assistant</small></div><button onClick={()=>setChatOpen(false)}>×</button></div><div className="messages">{messages.map((m,i)=><div key={i} className={`message ${m.role}`}>{m.text}</div>)}{chatBusy&&<div className="message ai typing"><i></i><i></i><i></i></div>}</div><div className="quick">{result&&<button onClick={applyBestSetpoints}>Apply best setpoints</button>}{quickQuestions.map(q=><button onClick={()=>ask(undefined,q)} key={q}>{q}</button>)}</div><form onSubmit={ask}><input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ask about this scenario…"/><button>➤</button></form></div>}
  </main>
}

function Title({title,badge}:{title:string;badge:string}){return <div className="card-title"><h2>{title}</h2><span>{badge}</span></div>}
function Kpi({label,value,color,note}:{label:string;value:string;color:string;note:string}){return <div className="kpi card"><div className={`ring ${value.length>5?"wide-value":""}`} style={{"--color":color} as React.CSSProperties}><b>{value}</b></div><div><span>{label}</span><small>{note}</small><i style={{background:color}}></i></div></div>}
function Field({label,value,unit,onChange,options,step,min,max}:{label:string;value:string|number;unit?:string;onChange:(v:string)=>void;options?:string[];step?:string;min?:number;max?:number}){return <label className="field"><span>{label}</span><div>{options?<select value={value} onChange={e=>onChange(e.target.value)}>{options.map(o=><option key={o}>{o}</option>)}</select>:<input type="number" step={step||"1"} min={min} max={max} value={value} onChange={e=>onChange(e.target.value)}/>} {unit&&<em>{unit}</em>}</div></label>}
function Metric({label,value,delta}:{label:string;value:string;delta:string}){return <div className="metric"><span>{label}</span><b>{value}</b><small>{delta} ↗</small></div>}
function Gauge({label,value}:{label:string;value:number}){return <div><div className="gauge" style={{"--p":`${Math.max(0,Math.min(100,value))*3.6}deg`} as React.CSSProperties}><b>{value.toFixed(0)}%</b></div><span>{label}</span></div>}
function AgentSteps(){return <div className="agent-steps"><div className="agent-orb">✦</div><b>Optimization agent is working</b>{["Validating inputs","Running linear prediction model","Testing safe setpoint changes","Writing operator recommendations"].map((s,i)=><span key={s} style={{animationDelay:`${i*.18}s`}}><i>✓</i>{s}</span>)}</div>}
