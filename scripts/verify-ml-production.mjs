import assert from "node:assert/strict";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";

const base=process.env.AUDIT_BASE_URL||"https://aquaivolt-command-center.vercel.app";
if(!process.env.DASH_PASSWORD||!process.env.USER_PASSWORD)throw new Error("Provide verification passwords through environment variables");
const out=path.resolve(process.env.ML_EVIDENCE_DIR||"test-results/ml-production");await mkdir(out,{recursive:true});
const fixture=JSON.parse(await readFile("tests/fixtures/trained-model-parity.json","utf8"));
let cookie="";
async function call(url,body,auth=cookie){const response=await fetch(base+url,{method:body===undefined?"GET":"POST",headers:{"Content-Type":"application/json",...(auth?{Cookie:auth}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {response,status:response.status,data:await response.json()};}
async function save(name,data){await writeFile(path.join(out,name),JSON.stringify(data,null,2));}
async function login(username,password){const r=await call("/api/auth/login",{username,password},"");assert.equal(r.status,200,`Login failed for ${username}`);return r.response.headers.get("set-cookie").split(";")[0];}
cookie=await login("admin",process.env.DASH_PASSWORD);
const setup=await call("/api/ml/predict");assert.equal(setup.status,200,JSON.stringify(setup.data));assert.equal(setup.data.status,"LOADED");assert.equal(setup.data.runtime.version,"1.23.2");await save("model-manifest.json",setup.data);
const request={operatingConditions:fixture.cases[0]};await save("request.json",request);
const response=await call("/api/ml/predict",request);assert.equal(response.status,200,JSON.stringify(response.data));const run=response.data;
assert.equal(run.mode,"TRAINED_ML_INFERENCE");assert.equal(run.audit.status,"RECORDED");assert.equal(run.audit.saved,true);assert.deepEqual(run.effectiveInputs,request.operatingConditions);assert.equal(run.predictions.length,2);assert.equal(run.manifestHash,setup.data.manifestHash);await save("api-response.json",run);
const parity=[];
for(const p of run.predictions){
  const m=setup.data.manifest.models[p.modelId];assert.equal(p.artifactHash,m.artifactHash);
  const errors=m.outputKeys.map((key,column)=>Math.abs(p.raw[key]-fixture.expected[p.modelId][0][column]));
  errors.forEach((error,column)=>assert.ok(error<=setup.data.manifest.parityTolerance.absolute+setup.data.manifest.parityTolerance.relative*Math.abs(fixture.expected[p.modelId][0][column])));
  assert.equal(Object.keys(p.usedInputs).length,p.modelId==="ridge"?8:6);assert.equal(p.contextOnly.feedRate,request.operatingConditions.feedRate);
  parity.push({model:p.modelName,expectedPython:fixture.expected[p.modelId][0],actual:p.raw,maxAbsoluteError:Math.max(...errors)});
}
await save("production-python-parity.json",parity);
const saved=await call(`/api/audit?runId=${run.runId}`);assert.equal(saved.data.integrity,true);assert.deepEqual(saved.data.record.response.predictions,run.predictions);await save("signed-run.json",saved.data);
const verified=await call("/api/ml/verify",{runId:run.runId});assert.equal(verified.status,200,JSON.stringify(verified.data));assert.equal(verified.data.status,"PASS");assert.equal(verified.data.saved,true);assert.equal(verified.data.checks.length,11);await save("verification.json",verified.data);
const report=await call(`/api/audit?runId=${verified.data.reportId}`);assert.equal(report.data.integrity,true);await save("signed-verification.json",report.data);
const nullRequest={operatingConditions:{...request.operatingConditions,ph:null}};
const invalid=await call("/api/ml/predict",nullRequest);assert.equal(invalid.status,422);assert.ok(invalid.data.issues.some(i=>i.field==="ph"));await save("null-rejection.json",{request:nullRequest,http:invalid.status,response:invalid.data});
assert.equal((await call("/api/ml/predict",{previousRun:null})).status,422);
const repeat=await call("/api/ml/predict",request);assert.equal(repeat.data.audit.saved,true);assert.equal(repeat.data.outputHash,run.outputHash);assert.notEqual(repeat.data.runId,run.runId);
const csv=await fetch(base+`/api/ml/predict?runId=${run.runId}&format=csv`,{headers:{Cookie:cookie}});assert.equal(csv.status,200);const text=await csv.text();assert.equal(text.trim().split(/\r?\n/).length,3);await writeFile(path.join(out,"predictions.csv"),text);
const userCookie=await login("user",process.env.USER_PASSWORD);
for(const endpoint of ["/api/ml/predict","/api/ml/verify"]){assert.equal((await call(endpoint,{},userCookie)).status,403);assert.equal((await call(endpoint,{},"")).status,401);}
const baseline=await call("/api/predict");assert.equal(baseline.status,200);assert.ok(baseline.data.baseline.biogas>0);
const summary={status:"PASS",base,checkedAt:new Date().toISOString(),deployment:run.deployment,modelVersion:run.modelVersion,manifestHash:run.manifestHash,runId:run.runId,reportId:verified.data.reportId,storage:run.audit.provider,verificationChecks:verified.data.checks.length,parity,checks:["native CPU models load","explicit inputs","both trained models execute","Python parity","private persistent records","11-check replay","null and absent inputs rejected","deterministic prediction","prediction CSV","Admin access boundaries","overview baseline unchanged"],scope:"Software execution and artifact conversion fidelity; not independent plant accuracy validation"};
await save("summary.json",summary);console.log(JSON.stringify(summary,null,2));
