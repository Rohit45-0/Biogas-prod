"use client";

import {useRef,useState,type FormEvent} from "react";

export default function ResearchCopilot({runId,stale,onClose}:{runId?:string;stale:boolean;onClose:()=>void}){
  const [question,setQuestion]=useState(""),[busy,setBusy]=useState(false);
  const [messages,setMessages]=useState<{role:"ai"|"user";text:string}[]>([{role:"ai",text:runId?"Ask about this saved run's HRT, production or model limits.":"Run and save an HRT study first so I can explain its results."}]);
  const active=useRef(false);
  async function ask(event:FormEvent){
    event.preventDefault();const text=question.trim();if(!text||active.current)return;
    active.current=true;setBusy(true);setQuestion("");setMessages(old=>[...old,{role:"user",text}]);
    try{
      const response=await fetch("/api/copilot",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:text,mode:"HOURS_RESEARCH",researchRunId:runId})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not read this run");
      setMessages(old=>[...old,{role:"ai",text:data.answer}]);
    }catch(error){setMessages(old=>[...old,{role:"ai",text:error instanceof Error?error.message:"Could not reach Copilot"}]);}
    finally{active.current=false;setBusy(false);}
  }
  return <aside className="chat-panel" aria-label="Hours-scale Copilot"><header><div><small>HOURS-SCALE MODEL</small><h2>Aqua Copilot</h2></div><button onClick={onClose} aria-label="Close Copilot">×</button></header><div className="chat-context">{runId?`Saved run ${runId.slice(0,8)}`:"No saved run selected"}{stale?" · Settings changed; answers refer to the previous run.":""}</div><div className="chat-messages" aria-live="polite">{messages.map((item,index)=><div key={index} className={item.role}>{item.text}</div>)}{busy&&<div className="ai">Reading the saved result…</div>}</div><form onSubmit={ask}><input aria-label="Ask about the hours-scale run" value={question} onChange={event=>setQuestion(event.target.value)} placeholder="Why was this HRT selected?"/><button disabled={busy||!question.trim()} aria-label="Ask Copilot">↑</button></form></aside>;
}
