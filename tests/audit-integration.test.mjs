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
const dataDir=path.join(root,".audit-test-data",randomUUID());
const password=randomUUID(),secret=randomUUID();
let server,base,cookie,userCookie,logs="";
const dairy={feedstock:"Dairy WW",feedRate:846,temperature:36.5,ph:7.2,olr:3.2,hrt:22,codIn:7600,vfa:1100,mixing:50};
const request={profileId:"DAIRY-WW-001",operatingConditions:dairy,seed:"audit-test-001"};
async function start(storage=true){
  const listener=createServer();listener.listen(0,"127.0.0.1");await once(listener,"listening");const port=listener.address().port;await new Promise(r=>listener.close(r));base=`http://127.0.0.1:${port}`;
  server=spawn(process.execPath,[path.join(root,"node_modules/next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",String(port)],{cwd:root,windowsHide:true,env:{...process.env,VERCEL:"",BLOB_READ_WRITE_TOKEN:"",AQUA_AUDIT_DIR:storage?dataDir:"",AQUA_SESSION_SECRET:secret,AQUA_ADMIN_USERNAME:"admin",AQUA_ADMIN_PASSWORD:password,AQUA_USER_USERNAME:"user",AQUA_USER_PASSWORD:password}});
  server.stdout.on("data",d=>logs+=d);server.stderr.on("data",d=>logs+=d);
  let ready=false;
  for(let i=0;i<100;i++){try{const r=await fetch(base+"/api/auth/session");if(r.status===401){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready,"Test server startup failed: "+logs.slice(-3000));
  async function login(username){const r=await fetch(base+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});assert.equal(r.status,200);return r.headers.get("set-cookie").split(";")[0];}
  cookie=await login("admin");userCookie=await login("user");
}
async function stop(){if(server&&!server.killed){const done=once(server,"exit");server.kill();await done;}}
async function call(url,body,auth=cookie){const response=await fetch(base+url,{method:body===undefined?"GET":"POST",headers:{"Content-Type":"application/json",...(auth?{Cookie:auth}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};}

test("audit APIs exercise real model execution and durable records",{timeout:120000},async t=>{
  await mkdir(dataDir,{recursive:true});
  t.after(async()=>{await stop();});
  await start();
  let run,mlRun;
  await t.test("authentication and Admin boundaries",async()=>{
    for(const route of ["/api/predict","/api/model","/api/audit","/api/audit/tests","/api/ml/predict"]){assert.equal((await call(route,undefined,"")).status,401);}
    for(const route of ["/api/audit","/api/audit/tests","/api/ml/predict"]){assert.equal((await call(route,undefined,userCookie)).status,403);}
    for(const route of ["/api/ml/predict","/api/ml/verify"]){assert.equal((await call(route,{},"")).status,401);assert.equal((await call(route,{},userCookie)).status,403);}
    assert.equal((await call("/api/reports/batch",{requests:[request,request]},userCookie)).status,403);
    assert.equal((await call("/api/predict",request,userCookie)).status,403);
  });
  await t.test("baseline loads before optimization and matches run baseline",async()=>{
    const preview=await call("/api/predict");assert.equal(preview.status,200);assert.ok(preview.data.baseline.biogas>0);
    const response=await call("/api/predict",request);assert.equal(response.status,200);run=response.data;
    assert.deepEqual(run.effectiveInputs,dairy);assert.equal(run.inputSource,"submitted_operating_conditions");assert.equal(run.audit.status,"RECORDED");assert.equal(run.audit.saved,true);
    for(const k of ["biogas","methane","electricity"])assert.ok(Math.abs(run.baseline[k]-preview.data.baseline[k])<.011);
    assert.equal(run.modelTrace.optimization.candidateCount,2000);assert.equal(run.modelTrace.optimization.selectedRank,1);
    assert.equal(run.modelTrace.executionId,run.runId);assert.ok(run.modelTrace.stages.every(s=>Number.isFinite(s.elapsedMs)&&s.at));
    assert.equal(run.retentionTime.beforeHours,dairy.hrt*24);assert.ok(Math.abs(run.retentionTime.optimizedHours-run.bestSetpoints.hrt*24)<.011);
  });
  await t.test("strict parameters reject null, missing, unknown and invalid fields",async()=>{
    const bad=[null,{operatingConditions:null},{operatingConditions:{...dairy,ph:null}},{operatingConditions:{...dairy,temperature:"36.5"}},{operatingConditions:{...dairy,hrt:-2}},{operatingConditions:{...dairy,unexpected:4}},{operatingConditions:{feedstock:"Dairy WW"}},{profileId:"missing"}];
    for(const payload of bad){const r=await call("/api/predict",payload);assert.equal(r.status,422,JSON.stringify(payload));assert.ok(r.data.issues.length>0);}
    const malformed=await fetch(base+"/api/predict",{method:"POST",headers:{Cookie:cookie,"Content-Type":"application/json"},body:"{"});assert.equal(malformed.status,400);
  });
  await t.test("legacy previousRun null is context only, not missing operating inputs",async()=>{
    const r=await call("/api/predict",{previousRun:null});assert.equal(r.status,200);assert.deepEqual(r.data.effectiveInputs,dairy);assert.equal(r.data.inputSource,"stored_reference_profile");
  });
  await t.test("same inputs and seed reproduce; changed conditions affect results",async()=>{
    const replay=(await call("/api/predict",request)).data;assert.notEqual(replay.runId,run.runId);assert.equal(replay.outputHash,run.outputHash);assert.deepEqual(replay.bestSetpoints,run.bestSetpoints);
    const changed=(await call("/api/predict",{...request,operatingConditions:{...dairy,feedRate:860}})).data;assert.equal(changed.effectiveInputs.feedRate,860);assert.notEqual(changed.inputsHash,run.inputsHash);assert.notEqual(changed.baseline.biogas,run.baseline.biogas);
  });
  await t.test("streamed optimization reports eight real stages and preserves model outputs",async()=>{
    const response=await fetch(base+"/api/predict",{method:"POST",headers:{Cookie:cookie,"Content-Type":"application/json",Accept:"application/x-ndjson"},body:JSON.stringify(request)});
    assert.equal(response.status,200);assert.match(response.headers.get("content-type"),/application\/x-ndjson/);
    const events=(await response.text()).trim().split("\n").map(line=>JSON.parse(line));
    const progress=events.filter(e=>e.type==="progress"),finished=events.at(-1);
    assert.equal(finished.type,"result");assert.equal(finished.data.audit.saved,true);assert.equal(finished.data.outputHash,run.outputHash);assert.equal(finished.data.manifestHash,run.manifestHash);
    const steps=["conditions","validation","candidates","production","diagnostics","evidence","storage","results"];
    assert.deepEqual(progress.filter(e=>e.status==="running").map(e=>e.step),steps);assert.deepEqual(progress.filter(e=>e.status==="complete").map(e=>e.step),steps);
    assert.ok(progress.every(e=>Number.isFinite(e.elapsedMs)&&e.elapsedMs>=0&&Number.isFinite(Date.parse(e.at))));
    for(const [step,label] of [["candidates","Search setpoints"],["production","Calculate comparison"],["diagnostics","Calculate diagnostics"]])assert.equal(progress.find(e=>e.step===step&&e.status==="complete").at,finished.data.modelTrace.stages.find(e=>e.label===label).at);
    const record=await call(`/api/audit?runId=${finished.data.runId}`);assert.equal(record.data.integrity,true);assert.equal(record.data.record.response.outputHash,run.outputHash);
    const bad=await fetch(base+"/api/predict",{method:"POST",headers:{Cookie:cookie,"Content-Type":"application/json",Accept:"application/x-ndjson"},body:JSON.stringify({operatingConditions:{...dairy,ph:null}})});assert.equal(bad.status,422);
    const anonymous=await fetch(base+"/api/predict",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/x-ndjson"},body:JSON.stringify(request)});assert.equal(anonymous.status,401);
  });
  await t.test("stored evidence can be retrieved, verified and exported",async()=>{
    const saved=await call(`/api/audit?runId=${run.runId}`);assert.equal(saved.status,200);assert.equal(saved.data.integrity,true);assert.deepEqual(saved.data.record.inputs,dairy);assert.equal(saved.data.record.response.runId,run.runId);
    const tests=await call("/api/audit/tests",{runId:run.runId});assert.equal(tests.status,200,JSON.stringify(tests.data));assert.equal(tests.data.status,"PASS");assert.equal(tests.data.saved,true);assert.equal(tests.data.checks.length,9);assert.ok(tests.data.checks.every(c=>c.status==="PASS"));
    const report=await call(`/api/audit?runId=${tests.data.reportId}`);assert.equal(report.data.record.kind,"verification");assert.equal(report.data.integrity,true);
    const csv=await fetch(base+`/api/predict?runId=${run.runId}&format=csv`,{headers:{Cookie:cookie}});assert.equal(csv.status,200);const lines=(await csv.text()).trim().split(/\r?\n/);assert.equal(lines.length,2001);assert.match(lines[1],/^"1",[^,]+,"true"/);assert.ok(lines[1].includes(`"${run.scenarioPreview[0].aiBiogas}"`));assert.match(lines[1],/evaluated_optimization_candidate_not_training_data/);
    const denied=await fetch(base+`/api/predict?runId=${run.runId}&format=csv`,{headers:{Cookie:userCookie}});assert.equal(denied.status,404);
    assert.equal((await call("/api/audit?runId=invalid")).status,400);assert.equal((await call(`/api/audit?runId=${randomUUID()}`)).status,404);
  });
  await t.test("batch uses the same deployed model and persists both cases",async()=>{
    const batch=await call("/api/reports/batch",{requests:[request,{profileId:"FOOD-WASTE-002",seed:request.seed}]});assert.equal(batch.status,200);assert.equal(batch.data.results.length,2);assert.equal(batch.data.allRecorded,true);assert.equal(batch.data.results[0].outputHash,run.outputHash);assert.notEqual(batch.data.results[1].baseline.biogas,run.baseline.biogas);assert.ok(batch.data.results.every(r=>r.manifestHash===run.manifestHash));
  });
  await t.test("trained models load and predict with their actual feature contracts",async()=>{
    const registry=await call("/api/ml/predict");assert.equal(registry.status,200,JSON.stringify(registry.data));assert.equal(registry.data.status,"LOADED");assert.equal(registry.data.runtime.engine,"ONNX Runtime");assert.equal(registry.data.runtime.version,"1.23.2");
    const response=await call("/api/ml/predict",{operatingConditions:dairy});assert.equal(response.status,200,JSON.stringify(response.data));mlRun=response.data;
    assert.equal(mlRun.mode,"TRAINED_ML_INFERENCE");assert.equal(mlRun.audit.status,"RECORDED");assert.equal(mlRun.audit.saved,true);assert.deepEqual(mlRun.effectiveInputs,dairy);assert.equal(mlRun.predictions.length,2);
    assert.equal(mlRun.manifestHash,registry.data.manifestHash);assert.ok(mlRun.trace.every(s=>s.at&&Number.isFinite(s.elapsedMs)));
    for(const p of mlRun.predictions){
      assert.ok(Object.values(p.raw).every(Number.isFinite));assert.equal(p.artifactHash,registry.data.manifest.models[p.modelId].artifactHash);
      assert.equal(p.derived.biogasM3Day,p.raw.gasFlowM3h*24);assert.equal(p.derived.methaneM3Day,p.raw.gasFlowM3h*24*p.raw.methanePct/100);assert.equal(p.derived.electricityKwhDay,p.raw.generatorKw*24);
      assert.equal(p.usedInputs.feedRate,undefined);assert.equal(p.contextOnly.feedRate,dairy.feedRate);assert.equal(Object.keys(p.usedInputs).length,p.modelId==="ridge"?8:6);
    }
    assert.ok(mlRun.predictions[0].contextOnly.vfa);assert.ok(mlRun.predictions[1].usedInputs.vfa);
  });
  await t.test("ML request requires explicit complete numeric inputs and no simulation seed",async()=>{
    for(const payload of [null,{}, {previousRun:null},{operatingConditions:null},{operatingConditions:{...dairy,ph:null}},{operatingConditions:{...dairy,temperature:"36.5"}},{operatingConditions:{...dairy,extra:1}},{operatingConditions:{feedstock:"Dairy WW"}},{operatingConditions:dairy,seed:"abc"}]){
      const r=await call("/api/ml/predict",payload);assert.equal(r.status,422,JSON.stringify(payload));assert.ok(r.data.issues.length);
    }
    const malformed=await fetch(base+"/api/ml/predict",{method:"POST",headers:{Cookie:cookie,"Content-Type":"application/json"},body:"{"});assert.equal(malformed.status,400);
  });
  await t.test("ML is deterministic, trained inputs matter and context is not secretly modeled",async()=>{
    const repeat=await call("/api/ml/predict",{operatingConditions:dairy});assert.equal(repeat.data.outputHash,mlRun.outputHash);assert.notEqual(repeat.data.runId,mlRun.runId);
    const context=await call("/api/ml/predict",{operatingConditions:{...dairy,feedRate:900}});
    for(let i=0;i<2;i++)assert.deepEqual(context.data.predictions[i].raw,mlRun.predictions[i].raw);
    const numeric=await call("/api/ml/predict",{operatingConditions:{...dairy,temperature:39,codIn:20000}});
    for(let i=0;i<2;i++)assert.notDeepEqual(numeric.data.predictions[i].raw,mlRun.predictions[i].raw);
    const extra=await call("/api/ml/predict",{operatingConditions:{...dairy,vfa:1800,mixing:70}});
    assert.deepEqual(extra.data.predictions[0].raw,mlRun.predictions[0].raw);assert.notDeepEqual(extra.data.predictions[1].raw,mlRun.predictions[1].raw);
  });
  await t.test("ML signed records replay, verify, export and reject the wrong record type",async()=>{
    const record=await call(`/api/audit?runId=${mlRun.runId}`);assert.equal(record.data.integrity,true);assert.equal(record.data.record.kind,"ml_prediction");assert.deepEqual(record.data.record.response.predictions,mlRun.predictions);
    const verified=await call("/api/ml/verify",{runId:mlRun.runId});assert.equal(verified.status,200,JSON.stringify(verified.data));assert.equal(verified.data.status,"PASS");assert.equal(verified.data.saved,true);assert.equal(verified.data.checks.length,11);assert.ok(verified.data.checks.every(c=>c.status==="PASS"));
    const report=await call(`/api/audit?runId=${verified.data.reportId}`);assert.equal(report.data.integrity,true);assert.equal(report.data.record.kind,"ml_verification");
    const csv=await fetch(base+`/api/ml/predict?runId=${mlRun.runId}&format=csv`,{headers:{Cookie:cookie}});assert.equal(csv.status,200);const lines=(await csv.text()).trim().split(/\r?\n/);assert.equal(lines.length,3);assert.match(lines[1],/Gradient Boosting/);assert.match(lines[2],/Ridge Regression/);assert.ok(lines[1].includes(String(mlRun.predictions[0].raw.gasFlowM3h)));
    assert.equal((await call("/api/ml/verify",{runId:run.runId})).status,404);assert.equal((await call("/api/audit/tests",{runId:mlRun.runId})).status,404);
  });
  await t.test("ML tampering cannot pass replay or prediction CSV integrity",async()=>{
    const file=path.join(dataDir,"audit-v2/records",mlRun.runId+".json"),original=await readFile(file,"utf8"),tampered=JSON.parse(original);tampered.response.predictions[0].raw.gasFlowM3h+=100;
    await writeFile(file,JSON.stringify(tampered));
    try{assert.equal((await call("/api/ml/verify",{runId:mlRun.runId})).status,409);assert.equal((await call(`/api/ml/predict?runId=${mlRun.runId}&format=csv`)).status,409);}finally{await writeFile(file,original);}
  });
  await t.test("tampered evidence fails integrity and cannot pass verification",async()=>{
    const file=path.join(dataDir,"audit-v2/records",run.runId+".json"),original=await readFile(file,"utf8"),tampered=JSON.parse(original);tampered.response.baseline.biogas+=10;
    await writeFile(file,JSON.stringify(tampered));
    try{assert.equal((await call(`/api/audit?runId=${run.runId}`)).data.integrity,false);assert.equal((await call("/api/audit/tests",{runId:run.runId})).status,409);}finally{await writeFile(file,original);}
  });
  await t.test("records survive an application process restart",async()=>{
    await stop();await start();const saved=await call(`/api/audit?runId=${run.runId}`);assert.equal(saved.status,200);assert.equal(saved.data.integrity,true);assert.equal(saved.data.record.response.outputHash,run.outputHash);
    const ml=await call(`/api/audit?runId=${mlRun.runId}`);assert.equal(ml.data.integrity,true);assert.equal(ml.data.record.response.outputHash,mlRun.outputHash);assert.equal((await call("/api/ml/verify",{runId:mlRun.runId})).data.status,"PASS");
  });
  await t.test("missing persistent storage never reports RECORDED or a passing audit",async()=>{
    await stop();await start(false);const failed=await call("/api/predict",request);assert.equal(failed.status,200);assert.equal(failed.data.audit.saved,false);assert.equal(failed.data.audit.status,"NOT RECORDED");assert.equal((await call("/api/audit")).status,503);assert.equal((await call("/api/audit/tests",{runId:run.runId})).status,503);
    const mlFailed=await call("/api/ml/predict",{operatingConditions:dairy});assert.equal(mlFailed.status,200);assert.equal(mlFailed.data.audit.status,"NOT RECORDED");assert.equal(mlFailed.data.audit.saved,false);assert.equal((await call("/api/ml/verify",{runId:mlRun.runId})).status,503);
    const stream=await fetch(base+"/api/predict",{method:"POST",headers:{Cookie:cookie,"Content-Type":"application/json",Accept:"application/x-ndjson"},body:JSON.stringify(request)});
    const events=(await stream.text()).trim().split("\n").map(line=>JSON.parse(line));assert.equal(events.at(-1).data.audit.saved,false);assert.equal(events.find(e=>e.type==="progress"&&e.step==="storage"&&e.status!=="running").status,"warning");assert.equal(events.filter(e=>e.status==="complete").length,7);
  });
});
