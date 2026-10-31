"use client";

import {useEffect,useState} from "react";
import {CheckCircle2,Download,FlaskConical,Play,ShieldCheck} from "lucide-react";
import {feedstocks,inputFields,profiles,type ModelInput} from "../lib/inputs";
import type {MlResult} from "../lib/ml-execution";
import type {mlManifest} from "../lib/ml-manifest";
import {api,EvidenceLinks,format,message,Raw,Status,Verification,type VerificationReport} from "./audit-ui";
import DomainNotice from "./DomainNotice";
import {assessDomain} from "../lib/domain";

type Setup={manifest:typeof mlManifest;manifestHash:string;status:string;runtime:{engine:string;version:string;provider:string}};
const modelIds=["gradient_boosting","ridge"] as const;
const outputs=[
  {label:"Gas flow",unit:"m3/h",group:"raw",key:"gasFlowM3h"},
  {label:"Methane content",unit:"%",group:"raw",key:"methanePct"},
  {label:"Generator power",unit:"kW",group:"raw",key:"generatorKw"},
  {label:"Daily biogas",unit:"m3/day",group:"derived",key:"biogasM3Day"},
  {label:"Daily methane",unit:"m3/day",group:"derived",key:"methaneM3Day"},
  {label:"Daily electricity",unit:"kWh/day",group:"derived",key:"electricityKwhDay"},
] as const;

export default function MLPredictions({selected,onRecorded}:{selected:MlResult|null;onRecorded?:(id:string)=>void}){
  const [setup,setSetup]=useState<Setup|null>(null),[setupError,setSetupError]=useState("");
  const [inputs,setInputs]=useState<ModelInput>(selected?.effectiveInputs??{...profiles[0].inputs});
  const [profileId,setProfileId]=useState(selected?"CUSTOM":profiles[0].id);
  const [run,setRun]=useState<MlResult|null>(selected),[report,setReport]=useState<VerificationReport|null>(null);
  const [busy,setBusy]=useState(""),[error,setError]=useState(""),[http,setHttp]=useState<number|null>(null);
  const [negative,setNegative]=useState<{status:string;http:number;request:unknown;response:unknown}|null>(null);
  useEffect(()=>{let active=true;void api<Setup>("/api/ml/predict").then(v=>{if(active)setSetup(v);}).catch(e=>{if(active)setSetupError(message(e));});return()=>{active=false;};},[]);
  function edit(next:ModelInput){setInputs(next);setProfileId("CUSTOM");setRun(null);setReport(null);setHttp(null);setNegative(null);setError("");}
  async function execute(){
    setBusy("prediction");setError("");setRun(null);setReport(null);setHttp(null);
    try{
      const response=await fetch("/api/ml/predict",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({operatingConditions:inputs})});
      setHttp(response.status);const data=await response.json();
      if(!response.ok)throw new Error(data.issues?data.issues.map((i:{field:string;message:string})=>`${i.field}: ${i.message}`).join("; "):data.error);
      setRun(data);
      if(data.audit.saved)onRecorded?.(data.runId);
    }catch(e){setError(message(e));}finally{setBusy("");}
  }
  async function verify(){
    if(!run)return;setBusy("verification");setError("");setReport(null);
    try{setReport(await api<VerificationReport>("/api/ml/verify",{runId:run.runId}));}catch(e){setError(message(e));}finally{setBusy("");}
  }
  async function invalidTest(){
    setBusy("negative");setError("");setNegative(null);
    const request={operatingConditions:{...inputs,ph:null}};
    try{
      const response=await fetch("/api/ml/predict",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(request)});
      const data=await response.json();
      setNegative({status:response.status===422&&data.issues?.some((i:{field:string})=>i.field==="ph")?"PASS":"FAIL",http:response.status,request,response:data});
    }catch(e){setError(message(e));}finally{setBusy("");}
  }
  return <section className="at-section" aria-label="Trained ML predictions">
    <div className="at-heading"><h2>Trained ML predictions</h2><code>POST /api/ml/predict</code><Status value={setup?.status??(setupError?"UNAVAILABLE":"LOADING")}/></div>
    {setupError&&<div className="at-error" role="alert">{setupError}</div>}
    {error&&<div className="at-error" role="alert">{error}</div>}
    <div className="at-notice">Gradient Boosting and Ridge use different training datasets and target definitions. This is a comparison of predictions, not a before/after optimization gain. Independent plant validation remains outstanding.</div>
    <form onSubmit={e=>{e.preventDefault();void execute();}}>
      <div className="at-form-top"><label>Operating profile<select value={profileId} disabled={Boolean(busy)} onChange={e=>{const p=profiles.find(p=>p.id===e.target.value);if(p){edit({...p.inputs});setProfileId(p.id);}}}>{profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}<option value="CUSTOM" disabled>Custom operating conditions</option></select></label><div className="at-model-summary"><strong>Gradient Boosting + Ridge Regression</strong><span>{setup?`${setup.runtime.engine} ${setup.runtime.version} / ${setup.runtime.provider.toUpperCase()}`:"Checking runtime"}</span><small>Fitted pipelines / deterministic inference / no scenario fallback</small></div></div>
      <div className="at-inputs"><label>Feedstock<select value={inputs.feedstock} disabled={Boolean(busy)} onChange={e=>edit({...inputs,feedstock:e.target.value})}>{feedstocks.map(f=><option key={f}>{f}</option>)}</select></label>{inputFields.map(f=><label key={f.key}>{f.label}<span className="at-number"><input required type="number" step="any" min={f.min} max={f.max} value={Number.isFinite(inputs[f.key])?inputs[f.key]:""} disabled={Boolean(busy)} onChange={e=>edit({...inputs,[f.key]:e.target.value===""?NaN:Number(e.target.value)})}/><small>{f.unit}</small></span></label>)}</div>
      <div className="at-actions"><button className="primary" disabled={Boolean(busy)||!setup}><Play size={16}/>{busy==="prediction"?"Running both models...":"Run ML prediction"}</button><button type="button" disabled={Boolean(busy)} onClick={()=>void invalidTest()}><FlaskConical size={16}/>Test null rejection</button>{http!==null&&<code>HTTP {http}</code>}</div>
    </form>
    {inputFields.every(f=>Number.isFinite(inputs[f.key]))&&<DomainNotice assessment={assessDomain(inputs)} title="Submitted input support"/>}
    <Raw title="ML request payload" value={{operatingConditions:inputs}}/>
    {negative&&<div className="at-negative"><div className="at-heading"><h3>Null pH rejection</h3><Status value={negative.status}/><code>HTTP {negative.http}</code></div><Raw title="Invalid request and actual ML response" value={negative}/></div>}
    {run&&<>
      <div className="at-heading"><h3>ML prediction results</h3><Status value={run.audit.status}/></div>
      <DomainNotice assessment={run.domainAssessment} title="Executed input support"/>
      {!run.audit.saved&&<div className="at-error">Predictions returned, but persistent audit evidence was not confirmed. No passing audit report has been issued.</div>}
      <dl className="at-details"><div><dt>Run ID</dt><dd><code>{run.runId}</code></dd></div><div><dt>Executed at</dt><dd>{new Date(run.createdAt).toLocaleString()}</dd></div><div><dt>Mode</dt><dd>{run.mode}</dd></div><div><dt>Manifest SHA-256</dt><dd><code>{run.manifestHash}</code></dd></div></dl>
      <div className="at-table-wrap"><table><caption>Returned model predictions</caption><thead><tr><th>Output</th>{run.predictions.map(p=><th key={p.modelId}>{p.modelName}</th>)}<th>Unit</th></tr></thead><tbody>{outputs.map(o=><tr key={o.key}><th>{o.label}{o.group==="derived"&&<small className="at-subtext">Derived from raw prediction</small>}</th>{run.predictions.map(p=><td key={p.modelId}>{format((p[o.group] as Record<string,number>)[o.key])}</td>)}<td>{o.unit}</td></tr>)}<tr><th>Trained features</th>{run.predictions.map(p=><td key={p.modelId}>{p.featureCount}</td>)}<td>inputs</td></tr><tr><th>Target basis</th>{run.predictions.map(p=><td key={p.modelId}>{p.targetBasis}</td>)}<td /></tr><tr><th>Physical bounds</th>{run.predictions.map(p=><td key={p.modelId}><Status value={p.physicallyPlausible?"WITHIN BOUNDS":"OUTSIDE BOUNDS"}/></td>)}<td>Not accuracy validation</td></tr></tbody></table></div>
      {run.predictions.map(p=><div key={p.modelId}><h3>{p.modelName} evidence</h3><dl className="at-details"><div><dt>Original fitted artifact</dt><dd><code>{p.sourceArtifact}</code></dd></div><div><dt>Executed ONNX SHA-256</dt><dd><code>{p.artifactHash}</code></dd></div></dl>{p.warnings.map(w=><p className="at-notice" key={w}>{w}</p>)}<Raw title={`${p.modelName}: actual inputs, artifact hashes and raw outputs`} value={p}/></div>)}
      <h3>ML execution trace</h3><ol className="at-trace">{run.trace.map(s=><li key={s.label}><CheckCircle2 size={16}/><div><strong>{s.label}</strong><span>{s.detail}</span><small>{s.at} / {s.elapsedMs} ms elapsed</small></div></li>)}</ol>
      <Raw title="Full ML API response" value={run}/>
      {run.audit.saved&&<><EvidenceLinks id={run.runId}/><div className="at-actions"><a href={`/api/ml/predict?runId=${run.runId}&format=csv`} download><Download size={16}/>Prediction CSV</a><button className="primary" disabled={Boolean(busy)} onClick={()=>void verify()}><ShieldCheck size={16}/>{busy==="verification"?"Replaying trained models...":"Verify ML run"}</button></div></>}
      {report&&<Verification report={report}/>}
    </>}
    {setup&&<>
      <div className="at-table-wrap"><table><caption>Fitted input contract</caption><thead><tr><th>Operating value</th>{modelIds.map(id=><th key={id}>{setup.manifest.models[id].name}</th>)}</tr></thead><tbody>{[{key:"feedstock",label:"Feedstock"},...inputFields].map(f=><tr key={f.key}><th>{f.label}</th>{modelIds.map(id=><td key={id}>{setup.manifest.models[id].features.some(x=>x.key===f.key)?"Trained feature":"Context only; not used by model"}</td>)}</tr>)}</tbody></table></div>
      <div className="at-table-wrap"><table><caption>Artifact conversion and data provenance</caption><thead><tr><th>Model</th><th>Fitted rows</th><th>Original Python parity</th><th>Training data</th></tr></thead><tbody>{modelIds.map(id=>{const m=setup.manifest.models[id];return <tr key={id}><th>{m.name}</th><td>{m.fittedRows}</td><td><Status value={m.parity.status}/> / {m.parity.caseCount} cases</td><td>{m.trainingData}</td></tr>;})}</tbody></table></div>
      <p className="at-notice">{setup.manifest.trainingProvenance}. Conversion parity verifies the exported model matches the saved Python model; it does not establish predictive accuracy.</p>
      <Raw title="Archived evaluation metrics (not independent plant validation)" value={Object.fromEntries(modelIds.map(id=>[id,setup.manifest.models[id].evaluation]))}/>
      <Raw title="Trained model manifest" value={setup}/>
    </>}
  </section>;
}
