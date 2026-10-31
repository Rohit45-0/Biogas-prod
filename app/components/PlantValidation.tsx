"use client";

import {useEffect,useState} from "react";
import {ClipboardCheck,Save} from "lucide-react";
import {api,EvidenceLinks,format,message,Raw,Status} from "./audit-ui";

type Result={id:string;status:string;saved:boolean;sampleCount?:number;models?:{modelName:string;metrics:{key:string;label:string;unit:string;n:number;mae:number;rmse:number;bias:number;r2:number|null;r2UnavailableReason:string|null}[]}[]};
const fields=[{key:"gasFlowM3h",label:"Measured gas flow",unit:"m3/h"},{key:"methanePct",label:"Measured methane",unit:"%"},{key:"generatorKw",label:"Measured generator power",unit:"kW"}] as const;
const declarations=[{key:"measuredPlantData",label:"These are actual plant measurements, not reference or generated values."},{key:"equipmentCommissioned",label:"Equipment is commissioned and measurement instruments are calibrated."},{key:"excludedFromTrainingAndTuning",label:"These samples were excluded from training and model tuning."},{key:"alignedToRunInputs",label:"Measurements match the saved run's operating conditions and sampling period."}] as const;

export default function PlantValidation({selectedRunId}:{selectedRunId:string}){
  const [runId,setRunId]=useState(selectedRunId),[plantId,setPlantId]=useState(""),[datasetId,setDatasetId]=useState(""),[sampleId,setSampleId]=useState(""),[measuredAt,setMeasuredAt]=useState(""),[sourceReference,setSourceReference]=useState("");
  const [measured,setMeasured]=useState({gasFlowM3h:"",methanePct:"",generatorKw:""}),[declared,setDeclared]=useState<Record<string,boolean>>({});
  const [ids,setIds]=useState(""),[observation,setObservation]=useState<Result|null>(null),[report,setReport]=useState<Result|null>(null),[busy,setBusy]=useState(""),[error,setError]=useState("");
  useEffect(()=>{setRunId(selectedRunId);setDeclared({});setObservation(null);},[selectedRunId]);
  async function save(){
    setBusy("save");setError("");setObservation(null);
    try{
      const result=await api<Result>("/api/validation",{action:"record",runId,plantId,datasetId,sampleId,measuredAt:new Date(measuredAt).toISOString(),sourceReference,measured:Object.fromEntries(fields.map(f=>[f.key,Number(measured[f.key])])),declarations:declared});
      setObservation(result);setIds(old=>old?`${old}\n${result.id}`:result.id);setReport(null);
    }catch(e){setError(message(e));}finally{setBusy("");}
  }
  async function evaluate(){
    setBusy("evaluate");setError("");setReport(null);
    try{setReport(await api<Result>("/api/validation",{action:"evaluate",observationIds:ids.split(/[\s,]+/).filter(Boolean)}));}
    catch(e){setError(message(e));}finally{setBusy("");}
  }
  return <section className="at-section" aria-label="Plant validation">
    <div className="at-heading"><h2>Measured plant evaluation</h2><Status value="VALIDATION PENDING"/></div>
    <p className="at-notice">Equipment commissioning, calibrated measurements and an untouched evaluation dataset are prerequisites. Saved measurements and error reports remain operator-reported evidence, not independent validation or proof of optimization benefit.</p>
    {error&&<div className="at-error" role="alert">{error}</div>}
    <form onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={Boolean(busy)} className="at-fieldset"><legend>Measurement record</legend>
      <div className="at-inputs"><label>Saved ML run ID<input required value={runId} onChange={e=>setRunId(e.target.value.trim())}/></label><label>Plant ID<input required maxLength={200} value={plantId} onChange={e=>setPlantId(e.target.value)}/></label><label>Holdout dataset ID<input required maxLength={200} value={datasetId} onChange={e=>setDatasetId(e.target.value)}/></label><label>Sample ID<input required maxLength={200} value={sampleId} onChange={e=>setSampleId(e.target.value)}/></label><label>Measurement timestamp (local time)<input required type="datetime-local" value={measuredAt} onChange={e=>setMeasuredAt(e.target.value)}/></label><label>Measurement source / calibration reference<input required maxLength={1000} value={sourceReference} onChange={e=>setSourceReference(e.target.value)}/></label>{fields.map(f=><label key={f.key}>{f.label}<span className="at-number"><input required type="number" step="any" min={0} max={f.key==="methanePct"?100:undefined} value={measured[f.key]} onChange={e=>setMeasured({...measured,[f.key]:e.target.value})}/><small>{f.unit}</small></span></label>)}</div>
      <div className="at-declarations">{declarations.map(d=><label key={d.key}><input type="checkbox" required checked={Boolean(declared[d.key])} onChange={e=>setDeclared({...declared,[d.key]:e.target.checked})}/><span>{d.label}</span></label>)}</div>
      <div className="at-actions"><button className="primary"><Save size={16}/>{busy==="save"?"Saving...":"Record measurement"}</button></div>
    </fieldset></form>
    {observation&&<div role="status"><Status value="RECORDED"/><p>Observation ID: <code>{observation.id}</code></p><EvidenceLinks id={observation.id}/></div>}
    <form onSubmit={e=>{e.preventDefault();void evaluate();}}><h3>Holdout error report</h3><label>Observation record IDs<textarea required rows={4} value={ids} disabled={Boolean(busy)} onChange={e=>{setIds(e.target.value);setReport(null);}}/></label><div className="at-actions"><button className="primary" disabled={Boolean(busy)||!ids.trim()}><ClipboardCheck size={16}/>{busy==="evaluate"?"Calculating...":"Calculate measured errors"}</button></div></form>
    {report&&<><div className="at-heading"><h3>{report.sampleCount} reported observations</h3><Status value="REVIEW REQUIRED"/></div>{report.models?.map(m=><div className="at-table-wrap" key={m.modelName}><table><caption>{m.modelName}: measured versus predicted</caption><thead><tr><th>Output</th><th>Samples</th><th>MAE</th><th>RMSE</th><th>Bias</th><th>R2</th><th>Unit</th></tr></thead><tbody>{m.metrics.map(f=><tr key={f.key}><th>{f.label}</th><td>{f.n}</td><td>{format(f.mae)}</td><td>{format(f.rmse)}</td><td>{format(f.bias)}</td><td title={f.r2UnavailableReason??undefined}>{f.r2===null?"Not defined":format(f.r2)}</td><td>{f.unit}</td></tr>)}</tbody></table></div>)}<p className="at-notice">No automatic accuracy approval. Sample provenance, dataset completeness and acceptance thresholds need independent review. Measured before-and-after operating periods are still required to establish optimization benefit.</p><EvidenceLinks id={report.id}/><Raw title="Recorded measured-error report" value={report}/></>}
  </section>;
}
