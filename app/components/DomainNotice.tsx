import type {DomainAssessment} from "../lib/domain";

export default function DomainNotice({assessment,title="Input support"}:{assessment?:DomainAssessment;title?:string}){
  if(!assessment)return <p className="at-notice">Input-support assessment is unavailable for this historical run. Plant-validated ranges and calibrated prediction intervals are not established.</p>;
  const outside=assessment.fields.filter(f=>f.status==="OUTSIDE");
  return <aside className="at-domain" aria-label={title}>
    <strong>{title}: {outside.length?"outside supplied reference envelope":"within available reference bounds"}</strong>
    <p>{assessment.feedstock}: {assessment.referenceRows} reference rows. No plant-validated operating range. Prediction intervals unavailable; numerical precision is not confidence.</p>
    {outside.length>0&&<p role="status">Review required: {outside.map(f=>`${f.label} ${f.value} ${f.unit} (reference ${f.min} to ${f.max})`).join("; ")}.</p>}
    <details><summary>Feedstock reference ranges and limitations</summary><p>{assessment.trainingDistribution}</p><div className="at-table-wrap"><table><thead><tr><th>Parameter</th><th>Input</th><th>Reference range</th><th>Unit</th><th>Status</th></tr></thead><tbody>{assessment.fields.map(f=><tr key={f.key}><th>{f.label}</th><td>{f.value}</td><td>{f.min===null?"Not established":`${f.min} to ${f.max}`}</td><td>{f.unit}</td><td>{f.status}</td></tr>)}</tbody></table></div></details>
  </aside>;
}
