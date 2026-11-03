"use client";

import {useEffect,useState,type FormEvent} from "react";
import {ClipboardCheck} from "lucide-react";
import HrtResearchWorkspace,{type ResearchView} from "./components/HrtResearchWorkspace";
import AuditTrail from "./components/AuditTrail";

type AuthUser={username:string;role:"admin"|"user"};
const navigation:[ResearchView,string,string][]=[
  ["overview","⌂","Overview"],["workbook","▦","Workbook AI reading"],
  ["biogas","◒","Biogas"],["methane","◆","Methane"],["electricity","ϟ","Electricity"],
  ["process","⌁","Process monitor"],["hrt","◷","HRT in hours"],["optimizer","✦","AI optimizer"],
  ["reports","≡","AI & KPI reports"],["alerts","△","Alerts"],["sources","▤","Data sources"],["settings","⚙","Settings"],
];

export default function Home(){
  const [auth,setAuth]=useState<AuthUser|null>(null),[checking,setChecking]=useState(true);
  const [username,setUsername]=useState(""),[password,setPassword]=useState("");
  const [loginError,setLoginError]=useState(""),[loginBusy,setLoginBusy]=useState(false);
  const [view,setView]=useState<ResearchView>("overview"),[auditOpen,setAuditOpen]=useState(false),[auditRunId,setAuditRunId]=useState("");
  useEffect(()=>{
    let active=true;
    void (async()=>{
      try{const response=await fetch("/api/auth/session",{cache:"no-store"});if(response.ok){const data=await response.json();if(active)setAuth(data.user);}}
      catch{if(active)setLoginError("Could not check the session. Please sign in again.");}
      finally{if(active)setChecking(false);}
    })();
    return()=>{active=false;};
  },[]);
  async function login(event:FormEvent){
    event.preventDefault();setLoginBusy(true);setLoginError("");
    try{
      const response=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Login failed");
      setAuth(data.user);setPassword("");setView("overview");setAuditOpen(false);setAuditRunId("");
    }catch(error){setLoginError(error instanceof Error?error.message:"Login failed");}
    finally{setLoginBusy(false);}
  }
  async function logout(){
    try{
      const response=await fetch("/api/auth/logout",{method:"POST"});if(!response.ok)throw new Error("Logout failed");
      setAuth(null);setView("overview");setAuditOpen(false);setAuditRunId("");setLoginError("");
    }catch{setLoginError("Could not log out. Check the connection and retry.");}
  }
  function openView(next:ResearchView="overview"){setView(next);setAuditOpen(false);window.scrollTo({top:0});}
  function openAudit(id=""){setAuditRunId(id);setAuditOpen(true);window.scrollTo({top:0});}
  if(checking)return <main className="loading-screen"><span>◒</span><b>Opening Aquaivolt…</b></main>;
  if(!auth)return <main className="login-page"><section className="login-story"><div className="simple-brand light"><span>◒</span><b>AQUAIVOLT<small>WASTE TO ENERGY</small></b></div><div><small>AI BIOGAS PLATFORM</small><h1>One optimization action.<br/>Clear production results.</h1><p>Explore biogas, methane and electricity with the hours-scale model.</p></div><em>Research model · Plant validation pending</em></section><section className="login-form-wrap"><form onSubmit={login}><span className="login-icon">✦</span><small>SECURE ACCESS</small><h2>Sign in</h2><p>Use your Aquaivolt admin or user account.</p><label><span>Username</span><input value={username} onChange={event=>setUsername(event.target.value)} autoComplete="username" required/></label><label><span>Password</span><input type="password" value={password} onChange={event=>setPassword(event.target.value)} autoComplete="current-password" required/></label>{loginError&&<div className="login-error">{loginError}</div>}<button disabled={loginBusy}>{loginBusy?"Checking…":"Continue →"}</button></form></section></main>;
  return <main className="simple-shell">
    <aside className="simple-sidebar">
      <div className="simple-brand"><span>◒</span><b>AQUAIVOLT<small>WASTE TO ENERGY</small></b></div>
      <div className="research-mode-switch"><small>ACTIVE MODEL · HRT 2–24 HOURS</small><button className="selected" onClick={()=>openView()}>Hours-scale research</button></div>
      <nav>{navigation.map(([key,icon,label])=><div key={key}>{["biogas","process","alerts"].includes(key)&&<div className="pd-nav-label">{key==="biogas"?"PRODUCTION OPTIMIZATION":key==="process"?"ANALYTICS":"SYSTEM"}</div>}<button aria-label={label} className={!auditOpen&&view===key?"active":""} onClick={()=>openView(key)}><span aria-hidden="true">{icon}</span>{label}</button></div>)}
        {auth.role==="admin"&&<button className={auditOpen?"active":""} onClick={()=>openAudit()}><span><ClipboardCheck size={17}/></span>Audit Trail</button>}
      </nav>
      <div className="side-note"><b>SYSTEM STATUS</b><span>HOURS-SCALE MODEL</span><small>500 synthetic source rows<br/>PLC / IoT not connected</small></div>
      <button className="side-logout" onClick={()=>void logout()}>Log out</button>
    </aside>
    <section className="simple-workspace" id="overview">
      {loginError&&<div className="login-error" role="alert">{loginError}</div>}
      {auditOpen&&auth.role==="admin"&&<AuditTrail key={auditRunId||"audit"} initialRunId={auditRunId} onOverview={()=>openView()}/>}
      <div hidden={auditOpen}><HrtResearchWorkspace key={auth.username} view={view} role={auth.role} onView={openView} onAudit={openAudit}/></div>
    </section>
  </main>;
}
