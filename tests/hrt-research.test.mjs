import assert from "node:assert/strict";
import test from "node:test";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {createServer} from "node:net";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {randomUUID} from "node:crypto";

const root=fileURLToPath(new URL("../",import.meta.url));
const storage=path.join(root,".audit-test-data","research-"+randomUUID());
const request={baseline:{value:22,unit:"days"},objective:"shortest_hrt",retainedMethanePct:90,targetHours:12};
test("hours research uses a fitted model, explicit units and durable evidence",{timeout:120000},async t=>{
  await mkdir(storage,{recursive:true});
  const listener=createServer();listener.listen(0,"127.0.0.1");await once(listener,"listening");const port=listener.address().port;await new Promise(r=>listener.close(r));
  const base=`http://127.0.0.1:${port}`,password=randomUUID();
  const server=spawn(process.execPath,[path.join(root,"node_modules/next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",String(port)],{cwd:root,windowsHide:true,env:{...process.env,VERCEL:"",BLOB_READ_WRITE_TOKEN:"",AQUA_AUDIT_DIR:storage,AQUA_SESSION_SECRET:randomUUID(),AQUA_ADMIN_USERNAME:"admin",AQUA_ADMIN_PASSWORD:password,AQUA_USER_USERNAME:"user",AQUA_USER_PASSWORD:password}});
  let logs="";server.stdout.on("data",v=>logs+=v);server.stderr.on("data",v=>logs+=v);
  t.after(async()=>{if(server.exitCode===null){const ended=once(server,"exit");server.kill();await ended;}});
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+"/api/auth/session")).status===401){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,logs.slice(-3000));
  async function login(username){const r=await fetch(base+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});assert.equal(r.status,200);return r.headers.get("set-cookie").split(";")[0];}
  let cookie=await login("admin");const userCookie=await login("user");
  async function call(url,body,auth=cookie){const response=await fetch(base+url,{method:body===undefined?"GET":"POST",headers:{"Content-Type":"application/json",...(auth?{Cookie:auth}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};}
  let run;
  await t.test("auth, role boundaries and strict unit contract",async()=>{
    assert.equal((await call("/api/research/hrt",undefined,"")).status,401);
    assert.equal((await call("/api/research/hrt",request,"")).status,401);
    assert.equal((await call("/api/research/hrt",request,userCookie)).status,403);
    for(const payload of [null,{}, {...request,baseline:null},{...request,baseline:{value:null,unit:"days"}},{...request,baseline:{value:22,unit:"weeks"}},{...request,targetHours:1.99},{...request,targetHours:24.01},{...request,retainedMethanePct:0},{...request,objective:"force_reduction"},{...request,unknown:true},{...request,baseline:{...request.baseline,unknown:1}}])assert.equal((await call("/api/research/hrt",payload)).status,422,JSON.stringify(payload));
    const malformed=await fetch(base+"/api/research/hrt",{method:"POST",headers:{Cookie:cookie,"Content-Type":"application/json"},body:"{"});assert.equal(malformed.status,400);
  });
  await t.test("model, source rows, split disclosure and coefficient parity",async()=>{
    const meta=(await call("/api/research/hrt")).data;assert.equal(meta.fitRows,500);assert.equal(meta.assumptions.plantValidated,false);assert.equal(meta.input.min,2);assert.equal(meta.input.max,24);
    assert.equal(meta.evaluation.displaySummary.trainRows,380);assert.equal(meta.evaluation.displaySummary.testRows,100);
    const source=(await call("/api/research/hrt?view=data")).data;assert.equal(source.rows.length,500);assert.equal(source.rows[0].sourceRow,6);assert.equal(source.rows.at(-1).sourceRow,505);
    const response=await call("/api/research/hrt",request);assert.equal(response.status,200);run=response.data;
    assert.equal(run.audit.saved,true);assert.equal(run.candidates.length,2000);assert.equal(run.mode,"HOURS_RESEARCH");assert.equal(run.validationStatus,"SYNTHETIC AGREEMENT ONLY");
    const fixture=JSON.parse(await readFile(path.join(root,"ai-workflow/research/hours-parity.json"),"utf8"));
    for(const example of fixture.cases){const prediction=await call("/api/research/hrt",{...request,objective:"target_hrt",targetHours:example.hrtHours});assert.equal(prediction.status,200);const point=prediction.data.selected;for(const [key,value] of Object.entries(example.expected))assert.ok(Math.abs(point[key]-value)<fixture.tolerance,`${key} at ${point.hrtHours}`);}
    assert.equal(run.uncertainty.predictionInterval,null);
  });
  await t.test("selection is the shortest feasible point and production units reconcile",async()=>{
    assert.equal(run.retentionTime.beforeHours,528);assert.ok(run.selected.hrtHours>7&&run.selected.hrtHours<9);assert.equal(run.retentionTime.direction,"decrease");
    assert.ok(run.goal.satisfied);assert.ok(run.goal.selectedRetainedPct>=90-1e-9);
    assert.ok(run.candidates.filter(p=>p.hrtHours<run.selected.hrtHours).every(p=>p.methaneM3Day<run.goal.minimumMethaneM3Day));
    assert.equal(run.selected.methaneM3Day,run.selected.biogasM3Day*run.selected.methanePct/100);
    assert.equal(run.selected.electricityKwhDay,run.selected.methaneM3Day*9.97*.36);
    const hourly=(await call("/api/research/hrt",{...request,baseline:{value:528,unit:"hours"}})).data;assert.deepEqual(hourly.selected,run.selected);assert.deepEqual(hourly.retentionTime,run.retentionTime);
    const increase=(await call("/api/research/hrt",{...request,baseline:{value:1,unit:"hours"}})).data;assert.equal(increase.retentionTime.direction,"increase");assert.ok(increase.retentionTime.changeHours>0);
    const low=(await call("/api/research/hrt",{...request,objective:"target_hrt",targetHours:2})).data;assert.equal(low.selected.hrtHours,2);assert.equal(low.goal.satisfied,false);assert.ok(low.selected.methaneM3Day<run.selected.methaneM3Day);
    const replay=(await call("/api/research/hrt",request)).data;assert.notEqual(replay.runId,run.runId);assert.equal(replay.outputHash,run.outputHash);
  });
  await t.test("hours dashboard recommendations, comparison and Copilot share the saved model result",async()=>{
    const meta=(await call("/api/research/hrt")).data;
    assert.deepEqual(meta.defaults.baseline,{value:24,unit:"hours"});
    const current=(await call("/api/research/hrt",meta.defaults)).data;
    assert.equal(current.retentionTime.beforeHours,24);assert.equal(current.comparison.hrtHours,24);
    assert.ok(current.selected.hrtHours>=2&&current.selected.hrtHours<=24);
    for(const item of current.recommendations){
      assert.equal(item.target,current.selected[item.key]);assert.equal(item.current,current.comparison[item.key]);
      assert.equal(item.change,item.target-item.current);
    }
    const hrt=current.recommendations.find(item=>item.key==="hrtHours");assert.equal(hrt.unit,"hours");assert.equal(hrt.current,24);
    const baseline=(await call("/api/research/hrt",{...meta.defaults,objective:"target_hrt",targetHours:24})).data;
    assert.deepEqual(current.comparison,baseline.selected);
    const restored=(await call(`/api/research/hrt?runId=${current.runId}`)).data;assert.deepEqual(restored.recommendations,current.recommendations);
    const verified=await call("/api/research/hrt/verify",{runId:current.runId});assert.equal(verified.data.status,"PASS");
    const copilot=await call("/api/copilot",{question:"Why this HRT?",mode:"HOURS_RESEARCH",researchRunId:current.runId,prediction:{bestSetpoints:{hrt:602}}});
    assert.equal(copilot.status,200);assert.equal(copilot.data.runId,current.runId);
    assert.ok(copilot.data.answer.includes(`${current.selected.hrtHours.toFixed(2)} hours`));assert.doesNotMatch(copilot.data.answer,/602|days/);
    assert.equal((await call("/api/copilot",{question:"HRT?",mode:"HOURS_RESEARCH",researchRunId:current.runId},userCookie)).status,403);
    assert.equal((await call("/api/copilot",{question:"HRT?",mode:"HOURS_RESEARCH",researchRunId:"invalid"})).status,400);
    // A historical day-based comparison remains explicit and never becomes a fake hours baseline.
    assert.equal(run.retentionTime.beforeHours,528);assert.equal(run.comparison,null);
    assert.equal(run.recommendations.find(item=>item.key==="temperature").current,null);
  });
  await t.test("saved evidence, replay, CSV and fresh-session listing agree",async()=>{
    const saved=(await call(`/api/audit?runId=${run.runId}`)).data;assert.equal(saved.integrity,true);assert.equal(saved.record.kind,"hrt_research");assert.equal(saved.record.response.outputHash,run.outputHash);
    const verified=await call("/api/research/hrt/verify",{runId:run.runId});assert.equal(verified.status,200);assert.equal(verified.data.status,"PASS");assert.equal(verified.data.saved,true);assert.equal(verified.data.checks.length,8);
    const csv=await fetch(base+`/api/research/hrt?runId=${run.runId}&format=csv`,{headers:{Cookie:cookie}});assert.equal(csv.status,200);const lines=(await csv.text()).trim().split(/\r?\n/);assert.equal(lines.length,2001);assert.match(lines[0],/electricity_kwh_day/);assert.match(lines[1],/synthetic_research_model_evaluation_not_plant_measurement/);
    assert.equal((await call(`/api/research/hrt?runId=${run.runId}`,undefined,userCookie)).status,403);
    assert.equal((await call("/api/auth/logout",{})).status,200);cookie=await login("admin");
    const listed=(await call("/api/audit?limit=50")).data;assert.ok(listed.runs.some(r=>r.id===run.runId&&r.integrity));
    const fetched=(await call(`/api/research/hrt?runId=${run.runId}`)).data;assert.deepEqual(fetched.selected,run.selected);
  });
  await t.test("tampered research records cannot be exported or replayed",async()=>{
    const file=path.join(storage,"audit-v2/records",run.runId+".json"),record=JSON.parse(await readFile(file,"utf8"));record.response.selected.hrtHours=.5;await writeFile(file,JSON.stringify(record));
    assert.equal((await call(`/api/research/hrt?runId=${run.runId}`)).status,409);
    assert.equal((await call("/api/research/hrt/verify",{runId:run.runId})).status,409);
    assert.equal((await call("/api/copilot",{question:"HRT?",mode:"HOURS_RESEARCH",researchRunId:run.runId})).status,409);
    const csv=await fetch(base+`/api/research/hrt?runId=${run.runId}&format=csv`,{headers:{Cookie:cookie}});assert.equal(csv.status,409);
  });
});
