import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";

const base=process.env.AUDIT_BASE_URL||"https://aquaivolt-command-center.vercel.app";
if(!process.env.DASH_PASSWORD||!process.env.USER_PASSWORD)throw new Error("Provide verification account passwords through environment variables");
const out=path.resolve("test-results/production");await mkdir(out,{recursive:true});
let cookie="";
async function call(url,body,auth=cookie){const response=await fetch(base+url,{method:body===undefined?"GET":"POST",headers:{"Content-Type":"application/json",...(auth?{Cookie:auth}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {response,status:response.status,data:await response.json()};}
async function save(name,data){await writeFile(path.join(out,name),JSON.stringify(data,null,2));}
async function login(username,password){const r=await call("/api/auth/login",{username,password},"");assert.equal(r.status,200,`Login failed for ${username}`);return r.response.headers.get("set-cookie").split(";")[0];}
cookie=await login("admin",process.env.DASH_PASSWORD);
const setup=await call("/api/audit/tests");assert.equal(setup.status,200);assert.equal(setup.data.storage.available,true);assert.equal(setup.data.storage.provider,"vercel-private-blob");
const model=await call("/api/model");assert.equal(model.data.model.version,"1.8.0");await save("model-manifest.json",model.data);
const profile=setup.data.profiles[0];
const request={profileId:profile.id,operatingConditions:profile.inputs,seed:"audit-release-001"};await save("request.json",request);
const result=await call("/api/predict",request);assert.equal(result.status,200);const run=result.data;assert.equal(run.audit.saved,true,JSON.stringify(run.audit));assert.equal(run.audit.status,"RECORDED");assert.deepEqual(run.effectiveInputs,profile.inputs);await save("api-response.json",run);
const saved=await call(`/api/audit?runId=${run.runId}`);assert.equal(saved.status,200);assert.equal(saved.data.integrity,true);assert.equal(saved.data.record.response.outputHash,run.outputHash);await save("signed-run.json",saved.data);
const tested=await call("/api/audit/tests",{runId:run.runId});assert.equal(tested.status,200,JSON.stringify(tested.data));assert.equal(tested.data.status,"PASS");assert.equal(tested.data.saved,true);await save("verification.json",tested.data);
const report=await call(`/api/audit?runId=${tested.data.reportId}`);assert.equal(report.data.integrity,true);await save("signed-verification.json",report.data);
const rejected=await call("/api/predict",{...request,operatingConditions:{...profile.inputs,ph:null}});assert.equal(rejected.status,422);await save("null-rejection.json",{http:rejected.status,response:rejected.data});
const replay=await call("/api/predict",request);assert.equal(replay.data.outputHash,run.outputHash);assert.notEqual(replay.data.runId,run.runId);assert.equal(replay.data.audit.saved,true);
const batch=await call("/api/reports/batch",{requests:[request,{profileId:setup.data.profiles[1].id,operatingConditions:setup.data.profiles[1].inputs,seed:request.seed}]});assert.equal(batch.status,200);assert.equal(batch.data.allRecorded,true);assert.equal(batch.data.results[0].outputHash,run.outputHash);assert.notEqual(batch.data.results[1].baseline.biogas,run.baseline.biogas);await save("comparison.json",batch.data);
const csv=await fetch(base+`/api/predict?runId=${run.runId}&format=csv`,{headers:{Cookie:cookie}});assert.equal(csv.status,200);const text=await csv.text();assert.equal(text.trim().split(/\r?\n/).length,2001);await writeFile(path.join(out,"2000-candidates.csv"),text);
const userCookie=await login("user",process.env.USER_PASSWORD);assert.equal((await call("/api/audit",undefined,userCookie)).status,403);assert.equal((await call("/api/audit/tests",undefined,userCookie)).status,403);assert.equal((await call("/api/predict",undefined,userCookie)).status,200);assert.equal((await call("/api/audit",undefined,"")).status,401);
const userRun=await call("/api/predict",{profileId:profile.id,operatingConditions:profile.inputs},userCookie);assert.equal(userRun.status,200);assert.equal(userRun.data.audit.saved,true);
const ownExport=await fetch(base+`/api/predict?runId=${userRun.data.runId}&format=csv`,{headers:{Cookie:userCookie}});assert.equal(ownExport.status,200);
const deniedExport=await fetch(base+`/api/predict?runId=${run.runId}&format=csv`,{headers:{Cookie:userCookie}});assert.equal(deniedExport.status,404);
const health=await call("/api/health");assert.equal(health.data.services.audit,"persistent");await save("health.json",health.data);
const retrievedAgain=await call(`/api/audit?runId=${run.runId}`);assert.equal(retrievedAgain.data.integrity,true);
const summary={status:"PASS",base,checkedAt:new Date().toISOString(),modelVersion:run.modelVersion,manifestHash:run.manifestHash,runId:run.runId,reportId:tested.data.reportId,storage:run.audit.provider,verificationChecks:tested.data.checks.length,checks:["admin and user authentication","nine explicit inputs","actual model execution","private persistent storage readback","fixed-seed reproducibility","null parameter returns 422","two profile comparison","2000-row CSV export","record integrity","user access restrictions","same-user export authorization"],scope:"Software execution and persistence verification only; not independent plant validation"};await save("summary.json",summary);console.log(JSON.stringify(summary,null,2));
