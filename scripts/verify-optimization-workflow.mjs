import assert from "node:assert/strict";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const base=process.env.AUDIT_BASE_URL||"https://aquaivolt-command-center.vercel.app";
if(!process.env.DASH_PASSWORD||!process.env.USER_PASSWORD)throw new Error("Provide verification account passwords through environment variables");
const source=await readFile("app/lib/optimization-workflow.ts","utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext}}).outputText;
const {readOptimizationResponse,optimizationSteps}=await import("data:text/javascript;base64,"+Buffer.from(compiled).toString("base64"));
const out=path.resolve("test-results/workflow-production");await mkdir(out,{recursive:true});
async function save(name,data){await writeFile(path.join(out,name),JSON.stringify(data,null,2));}
async function login(username,password){const response=await fetch(base+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});assert.equal(response.status,200);return response.headers.get("set-cookie").split(";")[0];}
const admin=await login("admin",process.env.DASH_PASSWORD);
async function json(url,body){const response=await fetch(base+url,{method:body===undefined?"GET":"POST",headers:{Cookie:admin,"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;}
const preview=await json("/api/predict");
const request={profileId:preview.profile.id,operatingConditions:preview.profile.inputs,seed:"workflow-release-001"};
const started=performance.now(),events=[];
const response=await fetch(base+"/api/predict",{method:"POST",headers:{Cookie:admin,"Content-Type":"application/json",Accept:"application/x-ndjson"},body:JSON.stringify(request)});
assert.match(response.headers.get("content-type"),/application\/x-ndjson/);
const result=await readOptimizationResponse(response,event=>events.push({...event,receivedAfterMs:performance.now()-started}));
const finishedAfterMs=performance.now()-started;
assert.equal(result.audit.saved,true);assert.deepEqual(result.effectiveInputs,request.operatingConditions);
assert.deepEqual(events.filter(e=>e.status==="complete").map(e=>e.step),optimizationSteps.map(s=>s.id));
const record=await json(`/api/audit?runId=${result.runId}`);assert.equal(record.integrity,true);assert.equal(record.record.response.outputHash,result.outputHash);
const verification=await json("/api/audit/tests",{runId:result.runId});assert.equal(verification.status,"PASS");
await save("request.json",request);await save("progress-events.json",events);await save("result.json",result);await save("signed-record.json",record);await save("verification.json",verification);
const preserved=[];
for(const [file,endpoint] of [["test-results/production/summary.json","/api/audit/tests"],["test-results/ml-production/summary.json","/api/ml/verify"]]){
  let old;try{old=JSON.parse(await readFile(file,"utf8"));}catch{continue;}
  const checked=await json(endpoint,{runId:old.runId});assert.equal(checked.status,"PASS");preserved.push({runId:old.runId,endpoint,status:checked.status});
}
const user=await login("user",process.env.USER_PASSWORD);
const userResponse=await fetch(base+"/api/predict",{method:"POST",headers:{Cookie:user,"Content-Type":"application/json",Accept:"application/x-ndjson"},body:JSON.stringify({profileId:preview.profile.id,operatingConditions:preview.profile.inputs})});
const userRun=await readOptimizationResponse(userResponse,()=>{});assert.equal(userRun.audit.saved,true);
const csv=await fetch(base+`/api/predict?runId=${userRun.runId}&format=csv`,{headers:{Cookie:user}});assert.equal(csv.status,200);assert.equal((await csv.text()).trim().split(/\r?\n/).length,2001);
const summary={status:"PASS",base,checkedAt:new Date().toISOString(),runId:result.runId,reportId:verification.reportId,modelVersion:result.modelVersion,manifestHash:result.manifestHash,progressStages:8,firstProgressAfterMs:events[0].receivedAfterMs,finishedAfterMs,storage:result.audit.provider,preservedHistoricalRuns:preserved,userStreamAndOwnExport:"PASS",scope:"Workflow transport, execution evidence, existing model replay and export verification"};
await save("summary.json",summary);console.log(JSON.stringify(summary,null,2));
