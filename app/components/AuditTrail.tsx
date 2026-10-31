"use client";

import {useEffect,useRef,useState} from "react";
import {ArrowLeft,CheckCircle2,ClipboardCheck,Download,FlaskConical,Play,Printer,RefreshCw,Search,ShieldCheck} from "lucide-react";
import {feedstocks,inputFields,profiles,type ModelInput} from "../lib/inputs";
import type {executeRequest} from "../lib/execution";
import type {manifest as manifestType} from "../lib/manifest";
import type {SignedRecord} from "../lib/audit";
import type {MlResult} from "../lib/ml-execution";
import MLPredictions from "./MLPredictions";
import PlantValidation from "./PlantValidation";
import DomainNotice from "./DomainNotice";
import {hrtChangeLabel} from "../lib/hrt";
import {api,EvidenceLinks,format,message,Raw,Status,type VerificationReport} from "./audit-ui";
import "./audit-trail.css";

type Run=Awaited<ReturnType<typeof executeRequest>>;
type Setup={manifest:typeof manifestType;manifestHash:string;storage:{available:boolean;provider:string};validation:{status:string;detail:string}};
type Report=VerificationReport;
type Row={id:string;createdAt:string;storedAt:string;kind:string;username:string;modelVersion:string;integrity:boolean;readError:boolean};
type RecordResult={record:SignedRecord;integrity:boolean};
type Tab="ml"|"execution"|"model"|"comparison"|"records"|"validation";
const labels:Record<Tab,string>={ml:"ML predictions",execution:"1. Scenario execution",model:"2. Scenario verification",comparison:"Scenario comparison",records:"Audit records",validation:"Plant validation"};

export default function AuditTrail({onOverview}:{onOverview:()=>void}){
  const [tab,setTab]=useState<Tab>("ml"),[setup,setSetup]=useState<Setup|null>(null);
  const [mlRun,setMlRun]=useState<MlResult|null>(null);
  const [validationRunId,setValidationRunId]=useState("");
  const [inputs,setInputs]=useState<ModelInput>({...profiles[0].inputs}),[profileId,setProfileId]=useState(profiles[0].id),[seed,setSeed]=useState("audit-test-001");
  const [run,setRun]=useState<Run|null>(null),[sent,setSent]=useState<unknown>(null),[report,setReport]=useState<Report|null>(null);
  const [busy,setBusy]=useState(""),[error,setError]=useState(""),[http,setHttp]=useState<number|null>(null);
  const [negative,setNegative]=useState<{status:string;http:number;request:unknown;response:unknown}|null>(null);
  const [comparison,setComparison]=useState<Run[]>([]),[compareA,setCompareA]=useState(profiles[0].id),[compareB,setCompareB]=useState(profiles[1].id);
  const [rows,setRows]=useState<Row[]>([]),[cursor,setCursor]=useState<string|undefined>(),[hasMore,setHasMore]=useState(false),[recordsError,setRecordsError]=useState("");
  const [query,setQuery]=useState(""),[opened,setOpened]=useState<RecordResult|null>(null);
  const [recordsLoading,setRecordsLoading]=useState(false),[total,setTotal]=useState(0),[snapshot,setSnapshot]=useState("");
  const historyRequest=useRef(0);
  async function history(more=false){
    if(more&&(recordsLoading||!cursor))return;
    const requestId=++historyRequest.current;
    setRecordsLoading(true);setRecordsError("");
    try{
      const page=await api<{runs:Row[];cursor?:string;hasMore:boolean;total:number;snapshot:string}>(`/api/audit?limit=20${more&&cursor?`&cursor=${encodeURIComponent(cursor)}`:""}`);
      if(requestId!==historyRequest.current)return;
      setRows(old=>more?[...old,...page.runs.filter(r=>!old.some(o=>o.id===r.id))]:page.runs);setCursor(page.cursor);setHasMore(page.hasMore);setTotal(page.total);setSnapshot(page.snapshot);
    }catch(e){if(requestId===historyRequest.current)setRecordsError(message(e));}
    finally{if(requestId===historyRequest.current)setRecordsLoading(false);}
  }
  useEffect(()=>{let active=true;void api<Setup>("/api/audit/tests").then(v=>{if(active)setSetup(v);}).catch(e=>{if(active)setError(message(e));});return()=>{active=false;};},[]);
  function edit(next:ModelInput){setInputs(next);setProfileId("CUSTOM");setRun(null);setReport(null);setHttp(null);setSent(null);setNegative(null);}
  async function execute(){
    setBusy("execution");setError("");setRun(null);setReport(null);setHttp(null);
    const request={profileId,operatingConditions:inputs,seed};setSent(request);
    try{
      const response=await fetch("/api/predict",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(request)});
      setHttp(response.status);const data=await response.json();
      if(!response.ok)throw new Error(data.issues?data.issues.map((i:{field:string;message:string})=>`${i.field}: ${i.message}`).join("; "):data.error);
      setRun(data);
    }catch(e){setError(message(e));}finally{setBusy("");}
  }
  async function verify(){
    if(!run)return;setBusy("verification");setError("");setReport(null);
    try{setReport(await api<Report>("/api/audit/tests",{runId:run.runId}));}catch(e){setError(message(e));}finally{setBusy("");}
  }
  async function invalidTest(){
    setBusy("negative");setError("");setNegative(null);
    const request={profileId:"CUSTOM",operatingConditions:{...inputs,ph:null},seed};
    try{const response=await fetch("/api/predict",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(request)});const data=await response.json();const rejected=response.status===422&&data.issues?.some((i:{field:string})=>i.field==="ph");setNegative({http:response.status,status:rejected?"PASS":"FAIL",request,response:data});}
    catch(e){setError(message(e));}finally{setBusy("");}
  }
  async function compare(){
    setBusy("comparison");setError("");setComparison([]);
    try{const requests=[compareA,compareB].map(id=>({profileId:id,operatingConditions:profiles.find(p=>p.id===id)!.inputs,seed}));const data=await api<{results:Run[]}>("/api/reports/batch",{requests});setComparison(data.results);}catch(e){setError(message(e));}finally{setBusy("");}
  }
  async function openRecord(id:string){
    setBusy("record");setError("");setOpened(null);setQuery(id);
    try{setOpened(await api<RecordResult>(`/api/audit?runId=${encodeURIComponent(id)}`));}catch(e){setError(message(e));}finally{setBusy("");}
  }
  function loadRun(){
    if(!opened||!opened.integrity||opened.record.kind!=="optimization")return;
    const data=opened.record.response as Run;
    setInputs(data.effectiveInputs);setProfileId(data.profileId);setSeed(data.seed);setSent(opened.record.request);setHttp(null);setReport(null);
    setRun({...data,audit:{runId:data.runId,createdAt:data.createdAt,saved:true,status:"RECORDED",provider:setup?.storage.provider??"storage",recordHash:opened.record.recordHash,retrievalUrl:`/api/audit?runId=${data.runId}`}});setTab("model");
  }
  function loadMlRun(){
    if(!opened||!opened.integrity||opened.record.kind!=="ml_prediction")return;
    const data=opened.record.response as MlResult;
    setValidationRunId(data.runId);
    setMlRun({...data,audit:{saved:true,status:"RECORDED",provider:setup?.storage.provider??"storage",recordHash:opened.record.recordHash}});setTab("ml");
  }
  const mismatch=run?Object.keys(inputs).some(k=>inputs[k as keyof ModelInput]!==run.effectiveInputs[k as keyof ModelInput]):false;
  const executionPass=Boolean(run&&run.audit.saved&&!mismatch&&[run.biogas,run.methane,run.electricity].every(Number.isFinite));
  const trainedView=tab==="ml"||tab==="validation";
  return <div className="at-workspace">
    <header className="at-header"><div><button className="at-back" onClick={onOverview}><ArrowLeft size={16}/>Overview</button><h1><ClipboardCheck size={25}/>Audit Trail</h1><p>AQUAIVOLT / Execution evidence</p></div><div className="at-actions"><button title="Print audit evidence or save as PDF" onClick={()=>window.print()}><Printer size={17}/>Print evidence</button></div></header>
    <div className="at-meta"><div><span>{trainedView?"Audit ML models":"Overview scenario engine"}</span><strong>{trainedView?"Gradient Boosting + Ridge Regression":setup?.manifest.model.name??"Loading model"}</strong><small>{trainedView?"Saved fitted pipelines / trained-ml-1.0.0":`Version ${setup?.manifest.model.version??"..."}`}</small></div><div><span>Persistent storage</span><Status value={setup?(setup.storage.available?"AVAILABLE":"UNAVAILABLE"):"CHECKING"}/><small>{setup?.storage.provider??"Checking connection"}</small></div><div><span>Plant validation</span><Status value="NOT VALIDATED"/><small>Advisory prototype; no equipment control</small></div></div>
    <nav className="at-tabs" aria-label="Audit sections">{(Object.keys(labels) as Tab[]).map(key=><button key={key} aria-current={tab===key?"page":undefined} onClick={()=>{setTab(key);setError("");if(key==="records")void history();}}>{labels[key]}</button>)}</nav>
    {error&&<div className="at-error" role="alert">{error}</div>}
    <div hidden={tab!=="ml"}><MLPredictions key={mlRun?.runId??"new"} selected={mlRun} onRecorded={setValidationRunId}/></div>
    <div hidden={tab!=="validation"}><PlantValidation selectedRunId={validationRunId||mlRun?.runId||""}/></div>
    {tab==="execution"&&<section className="at-section">
      <div className="at-heading"><h2>1. Input data & model execution</h2><code>POST /api/predict</code></div>
      <form onSubmit={e=>{e.preventDefault();void execute();}}>
        <div className="at-form-top"><label>Reference profile<select value={profileId} disabled={Boolean(busy)} onChange={e=>{const p=profiles.find(p=>p.id===e.target.value);if(p){edit({...p.inputs});setProfileId(p.id);}}}>{profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}<option value="CUSTOM" disabled>Custom operating conditions</option></select></label><label>Reproducibility seed<input required pattern="[a-zA-Z0-9-]{8,64}" value={seed} disabled={Boolean(busy)} onChange={e=>{setSeed(e.target.value);setRun(null);setReport(null);setHttp(null);setSent(null);setNegative(null);setComparison([]);}}/></label></div>
        <div className="at-inputs"><label>Feedstock<select value={inputs.feedstock} disabled={Boolean(busy)} onChange={e=>edit({...inputs,feedstock:e.target.value})}>{feedstocks.map(f=><option key={f}>{f}</option>)}</select></label>{inputFields.map(f=><label key={f.key}>{f.label}<span className="at-number"><input required type="number" step="any" min={f.min} max={f.max} value={Number.isFinite(inputs[f.key])?inputs[f.key]:""} disabled={Boolean(busy)} onChange={e=>edit({...inputs,[f.key]:e.target.value===""?NaN:Number(e.target.value)})}/><small>{f.unit}</small></span></label>)}</div>
        <div className="at-actions"><button className="primary" disabled={Boolean(busy)||!setup}><Play size={16}/>{busy==="execution"?"Executing...":"Run test 1"}</button><button type="button" disabled={Boolean(busy)} onClick={()=>void invalidTest()}><FlaskConical size={16}/>Test null rejection</button>{http!==null&&<code>HTTP {http}</code>}{run&&<Status value={executionPass?"PASS":"FAIL"}/>}</div>
      </form>
      {negative&&<div className="at-negative"><div className="at-heading"><h3>Null pH rejection</h3><Status value={negative.status}/><code>HTTP {negative.http}</code></div><Raw title="Invalid request and actual API response" value={negative}/></div>}
      <Raw title="Request payload" value={sent??{profileId,operatingConditions:inputs,seed}}/>
      {run&&<>
        <div className="at-heading"><h3>Execution result</h3><Status value={run.audit.status}/></div>
        <DomainNotice assessment={run.domainAssessment} title="Executed input support"/>
        <DomainNotice assessment={run.optimizedDomainAssessment} title="Recommended candidate support"/>
        {!run.audit.saved&&<div className="at-error">Outputs were returned, but the evidence was not confirmed in storage. This test has not passed.</div>}
        <dl className="at-details"><div><dt>Run ID</dt><dd><code>{run.runId}</code></dd></div><div><dt>Executed at</dt><dd>{new Date(run.createdAt).toLocaleString()}</dd></div><div><dt>Input source</dt><dd>{run.inputSource}</dd></div><div><dt>Operating mode</dt><dd>{run.mode} / Reference-based scenario engine</dd></div></dl>
        <div className="at-table-wrap"><table><caption>Request values and effective model inputs</caption><thead><tr><th>Parameter</th><th>Submitted</th><th>Executed</th><th>Selected candidate</th><th>Unit</th></tr></thead><tbody><tr><th>Feedstock</th><td>{inputs.feedstock}</td><td>{run.effectiveInputs.feedstock}</td><td>{run.optimizedInputs.feedstock}</td><td>category</td></tr>{inputFields.map(f=><tr key={f.key}><th>{f.label}</th><td>{inputs[f.key]}</td><td>{run.effectiveInputs[f.key]}</td><td>{run.optimizedInputs[f.key]}</td><td>{f.unit}</td></tr>)}</tbody></table></div>
        <div className="at-table-wrap"><table><caption>Baseline versus optimized model estimates</caption><thead><tr><th>Output</th><th>Baseline</th><th>Optimized</th><th>Change</th><th>Unit</th></tr></thead><tbody>{(["biogas","methane","electricity"] as const).map(k=><tr key={k}><th className="at-capitalize">{k}</th><td>{format(run.baseline[k])}</td><td>{format(run.optimized[k])}</td><td>{format(run.optimized[k]-run.baseline[k])}</td><td>{k==="electricity"?"kWh/day":"m3/day"}</td></tr>)}<tr><th>HRT change</th><td>{format(run.retentionTime.beforeHours)}</td><td>{format(run.retentionTime.optimizedHours)}</td><td>{hrtChangeLabel(run.retentionTime.beforeHours,run.retentionTime.optimizedHours)}</td><td>hours</td></tr></tbody></table></div>
        <h3>Server execution trace</h3><ol className="at-trace">{run.modelTrace.stages.map(s=><li key={s.label}><CheckCircle2 size={16}/><div><strong>{s.label}</strong><span>{s.detail}</span><small>{s.at} / {s.elapsedMs} ms elapsed</small></div></li>)}</ol>
        <Raw title="Full API response" value={run}/>{run.audit.saved&&<EvidenceLinks id={run.runId} scenarios/>}
        <div className="at-actions"><button className="primary" disabled={!run.audit.saved||Boolean(busy)} onClick={()=>setTab("model")}><ShieldCheck size={16}/>Continue to test 2</button></div>
      </>}
    </section>}
    {tab==="model"&&<section className="at-section">
      <div className="at-heading"><h2>2. Deployed model verification</h2><code>POST /api/audit/tests</code></div>
      <dl className="at-details"><div><dt>Algorithm</dt><dd>{setup?.manifest.card.algorithm??"Loading"}</dd></div><div><dt>Implementation</dt><dd>Server-side TypeScript reference inference</dd></div><div><dt>Manifest SHA-256</dt><dd><code>{setup?.manifestHash}</code></dd></div><div><dt>Source SHA-256</dt><dd><code>{setup?.manifest.sourceHash}</code></dd></div></dl>
      <div className="at-notice">The overview endpoint /api/predict uses 10 reference anchors, explicit process formulas and a seeded search of 2,000 candidates. Trained Ridge and Gradient Boosting execute separately at /api/ml/predict. Generated candidates are not training data.</div>
      <div className="at-actions"><button className="primary" disabled={Boolean(busy)||!run?.audit.saved} onClick={()=>void verify()}><ShieldCheck size={17}/>{busy==="verification"?"Verifying stored evidence...":"Run test 2"}</button>{run?<code>Run {run.runId}</code>:<span className="at-muted">No recorded run selected</span>}</div>
      {report&&<><div className="at-heading"><Status value={report.status}/><span>{new Date(report.createdAt).toLocaleString()}</span></div><div className="at-table-wrap"><table><caption>Verification checks</caption><thead><tr><th>Check</th><th>Result</th><th>Expected</th><th>Observed</th></tr></thead><tbody>{report.checks.map(c=><tr key={c.name}><th>{c.name}</th><td><Status value={c.status}/></td><td>{c.expected}</td><td className="at-break">{c.observed}</td></tr>)}</tbody></table></div><p className="at-notice">{report.scope}</p><EvidenceLinks id={report.reportId}/><Raw title="Stored verification report" value={report}/></>}
      <div className="at-table-wrap"><table><caption>Model and documentation reconciliation</caption><thead><tr><th>Approach</th><th>Current role</th><th>Evidence status</th></tr></thead><tbody><tr><th>Scenario ensemble {setup?.manifest.model.version}</th><td>Overview inference and candidate search</td><td>Identified by the source and manifest hashes above</td></tr><tr><th>Ridge regression</th><td>Audit ML predictions / 8 trained features</td><td>Saved fitted pipeline executed through ONNX Runtime</td></tr><tr><th>Gradient Boosting</th><td>Audit ML predictions / 6 trained features</td><td>Saved fitted pipeline executed through ONNX Runtime</td></tr><tr><th>Other evaluated models</th><td>Historical comparison only</td><td>Not additional deployed prediction models</td></tr></tbody></table></div>
      <div className="at-notice">Historical evaluation dated 2026-08-19 has not been rerun against this build. Its scores are not validation of version {setup?.manifest.model.version}. Independent measured-plant validation remains outstanding.</div>
      <div className="at-actions"><a href="/api/model" target="_blank" rel="noreferrer"><Download size={15}/>Model manifest</a><a href="/api/evaluation" target="_blank" rel="noreferrer"><Download size={15}/>Historical evaluation</a></div>
    </section>}
    {tab==="comparison"&&<section className="at-section">
      <div className="at-heading"><h2>Operating condition comparison</h2><code>POST /api/reports/batch</code></div>
      <div className="at-form-top">{([{label:"Case A",value:compareA,set:setCompareA},{label:"Case B",value:compareB,set:setCompareB}]).map(c=><label key={c.label}>{c.label}<select value={c.value} disabled={Boolean(busy)} onChange={e=>{c.set(e.target.value);setComparison([]);}}>{profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>)}</div>
      <p className="at-muted">Shared seed: <code>{seed}</code> / Same deployed engine and scoring weights</p>
      <div className="at-actions"><button className="primary" disabled={Boolean(busy)||compareA===compareB} onClick={()=>void compare()}><Play size={16}/>{busy==="comparison"?"Comparing...":"Run comparison"}</button></div>
      {comparison.length>0&&<><div className="at-table-wrap"><table><caption>Executed inputs and returned estimates</caption><thead><tr><th>Value</th>{comparison.map(r=><th key={r.runId}>{r.effectiveInputs.feedstock}</th>)}</tr></thead><tbody>{inputFields.map(f=><tr key={f.key}><th>{f.label} ({f.unit})</th>{comparison.map(r=><td key={r.runId}>{format(r.effectiveInputs[f.key])}</td>)}</tr>)}{(["biogas","methane","electricity"] as const).map(k=><tr key={k}><th className="at-capitalize">{k} baseline / optimized ({k==="electricity"?"kWh":"m3"}/day)</th>{comparison.map(r=><td key={r.runId}>{format(r.baseline[k])} / <strong>{format(r.optimized[k])}</strong></td>)}</tr>)}<tr><th>Run ID</th>{comparison.map(r=><td key={r.runId}><code>{r.runId}</code></td>)}</tr><tr><th>Audit status</th>{comparison.map(r=><td key={r.runId}><Status value={r.audit.status}/></td>)}</tr><tr><th>Evidence</th>{comparison.map(r=><td key={r.runId}>{r.audit.saved&&<EvidenceLinks id={r.runId}/>}</td>)}</tr></tbody></table></div><Raw title="Batch responses" value={comparison}/></>}
    </section>}
    {tab==="records"&&<section className="at-section">
      <div className="at-heading"><h2>Retrievable audit records</h2><button title="Refresh stored records" disabled={Boolean(busy)||recordsLoading} onClick={()=>void history()}><RefreshCw size={16}/>{recordsLoading?"Loading...":"Refresh"}</button></div>
      <form className="at-search" onSubmit={e=>{e.preventDefault();void openRecord(query.trim());}}><label className="at-sr-only" htmlFor="audit-id">Run or verification report ID</label><input id="audit-id" placeholder="Run or verification report ID" value={query} onChange={e=>setQuery(e.target.value)} required/><button disabled={Boolean(busy)}><Search size={16}/>Retrieve</button></form>
      {recordsError&&<div className="at-error" role="alert">{recordsError}</div>}
      <p className="at-muted" role="status">{rows.length} of {total} records loaded{snapshot?` / Snapshot ${new Date(snapshot).toLocaleString()}`:""}. Newest stored records first.</p>
      <div className="at-table-wrap"><table><caption>Stored records (global newest-first order)</caption><thead><tr><th>Run ID</th><th>Stored at</th><th>Executed at</th><th>Type</th><th>Operator</th><th>Version</th><th>Integrity</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><button className="at-link" disabled={Boolean(busy)} onClick={()=>void openRecord(r.id)}>{r.id}</button></td><td>{new Date(r.storedAt).toLocaleString()}</td><td>{new Date(r.createdAt).toLocaleString()}</td><td>{r.kind}</td><td>{r.username}</td><td>{r.modelVersion}</td><td><Status value={r.integrity?"PASS":"FAIL"}/>{r.readError&&<small className="at-subtext">Record could not be read; retry retrieval</small>}</td></tr>)}</tbody></table>{!rows.length&&!recordsError&&!recordsLoading&&<p className="at-empty">No stored records</p>}</div>
      {hasMore&&<button disabled={Boolean(busy)||recordsLoading} onClick={()=>void history(true)}>Load more records</button>}
      {opened&&<div className="at-opened"><div className="at-heading"><h3>Retrieved evidence</h3><Status value={opened.integrity?"PASS":"FAIL"}/></div><code>{opened.record.id}</code><p className="at-muted">Server-authenticated export: SHA-256 and a server-held HMAC. Not a public-key signature or independent verification of plant measurements.</p><EvidenceLinks id={opened.record.id} scenarios={opened.record.kind==="optimization"&&opened.integrity}/>{opened.integrity&&opened.record.kind==="optimization"&&<button disabled={Boolean(busy)} onClick={loadRun}><ShieldCheck size={16}/>Select for test 2</button>}{opened.integrity&&opened.record.kind==="ml_prediction"&&<button disabled={Boolean(busy)} onClick={loadMlRun}><ShieldCheck size={16}/>Open ML prediction</button>}<Raw title="Full server-authenticated record" value={opened.record}/></div>}
    </section>}
    <footer className="at-footer">Software test results are separate from model accuracy validation and auditor approval. HRT: days in the model, hours on the dashboard (x24).</footer>
  </div>;
}
