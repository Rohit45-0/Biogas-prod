import {CheckCircle2,Download,ShieldCheck,XCircle} from "lucide-react";

export type VerificationReport={reportId:string;runId:string;createdAt:string;status:string;checks:{name:string;status:string;expected:string;observed:string}[];scope:string;saved:boolean};
export const format=(n:number)=>Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:3}):"Unavailable";
export const message=(error:unknown)=>error instanceof Error?error.message:"Request failed";
export async function api<T>(url:string,body?:unknown):Promise<T>{
  const response=await fetch(url,body===undefined?{cache:"no-store"}:{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok)throw new Error(`HTTP ${response.status}: ${data.error??"Request failed"}${data.issues?" - "+data.issues.map((i:{field:string;message:string})=>`${i.field}: ${i.message}`).join("; "):""}`);
  return data;
}
export function Status({value}:{value:string}){
  const good=["PASS","RECORDED","AVAILABLE","LOADED"].includes(value),bad=["FAIL","NOT RECORDED","UNAVAILABLE"].includes(value);
  return <span className={`at-status ${good?"good":bad?"bad":"neutral"}`}>{good?<CheckCircle2 size={14}/>:bad?<XCircle size={14}/>:<ShieldCheck size={14}/>} {value}</span>;
}
export function Raw({title,value}:{title:string;value:unknown}){return <details className="at-raw"><summary>{title}</summary><pre>{JSON.stringify(value,null,2)}</pre></details>;}
export function EvidenceLinks({id,scenarios=false}:{id:string;scenarios?:boolean}){return <div className="at-actions"><a href={`/api/audit?runId=${id}&format=json`} download title="SHA-256 and server-held HMAC; not a public-key signature"><Download size={15}/>Server-authenticated JSON</a><a href={`/api/audit?runId=${id}&format=csv`} download><Download size={15}/>Evidence CSV</a>{scenarios&&<a href={`/api/predict?runId=${id}&format=csv`} download><Download size={15}/>2,000 candidates</a>}</div>;}
export function Verification({report}:{report:VerificationReport}){return <><div className="at-heading"><Status value={report.status}/><span>{new Date(report.createdAt).toLocaleString()}</span></div><div className="at-table-wrap"><table><caption>Verification checks</caption><thead><tr><th>Check</th><th>Result</th><th>Expected</th><th>Observed</th></tr></thead><tbody>{report.checks.map(c=><tr key={c.name}><th>{c.name}</th><td><Status value={c.status}/></td><td className="at-break">{c.expected}</td><td className="at-break">{c.observed}</td></tr>)}</tbody></table></div><p className="at-notice">{report.scope}</p>{report.saved&&<EvidenceLinks id={report.reportId}/>}<Raw title="Stored verification report" value={report}/></>;}
