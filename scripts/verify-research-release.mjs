import assert from "node:assert/strict";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";

const base=process.env.AUDIT_BASE_URL||"https://aquaivolt-command-center.vercel.app";
const password=process.env.AQUA_ADMIN_PASSWORD;
assert(password,"Supply Admin credentials through the environment");
const out=path.resolve(process.env.AUDIT_RELEASE_DIR||"test-results/research-release");
await mkdir(out,{recursive:true});
let cookie="";
async function call(route,body){
  const response=await fetch(base+route,{method:body===undefined?"GET":"POST",headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(60000)});
  const data=await response.json();return {status:response.status,response,data};
}
async function login(){const r=await call("/api/auth/login",{username:process.env.AQUA_ADMIN_USERNAME||"admin",password});assert.equal(r.status,200,"Admin login failed");cookie=r.response.headers.get("set-cookie").split(";")[0];}
async function save(name,value){await writeFile(path.join(out,name),typeof value==="string"?value:JSON.stringify(value,null,2)+"\n");}

assert.equal((await call("/api/research/hrt")).status,401);
await login();
const setup=await call("/api/audit/tests");assert.equal(setup.status,200);assert.equal(setup.data.storage.provider,"vercel-private-blob");assert.equal(setup.data.storage.available,true);
const meta=await call("/api/research/hrt");assert.equal(meta.status,200);assert.equal(meta.data.version,"hours-research-1.0.0");assert.equal(meta.data.fitRows,500);assert.equal(meta.data.assumptions.plantValidated,false);
const source=await call("/api/research/hrt?view=data");assert.equal(source.data.rows.length,500);assert.equal(source.data.rows[0].sourceRow,6);
const ml=await call("/api/ml/predict"),archived=JSON.parse(await readFile("app/lib/trained-build.json","utf8"));assert.equal(ml.status,200);assert.equal(ml.data.manifest.sourceHash,archived.sourceHash,"Unchanged day-model source identity must survive deployment");
const run=await call("/api/research/hrt",meta.data.defaults);assert.equal(run.status,200);assert.equal(run.data.audit.saved,true);assert.equal(run.data.audit.provider,"vercel-private-blob");assert.equal(run.data.validationStatus,"SYNTHETIC AGREEMENT ONLY");assert.ok(Math.abs(run.data.selected.hrtHours-7.876938469234617)<1e-9);assert.equal(run.data.retentionTime.beforeHours,528);assert.equal(run.data.goal.satisfied,true);
const runId=run.data.runId;await save("research-run.json",run.data);
const report=await call("/api/research/hrt/verify",{runId});assert.equal(report.status,200);assert.equal(report.data.status,"PASS");assert.equal(report.data.saved,true);assert.equal(report.data.checks.length,8);await save("research-verification.json",report.data);
const evidence=await call(`/api/audit?runId=${runId}&format=json`);assert.equal(evidence.status,200);assert.equal(evidence.data.integrity,true);assert.equal(evidence.data.authentication.type,"SERVER_AUTHENTICATED");assert.equal(evidence.data.authentication.independentlyVerifiable,false);await save("research-audit.json",evidence.data);
const csv=await fetch(base+`/api/research/hrt?runId=${runId}&format=csv`,{headers:{Cookie:cookie},signal:AbortSignal.timeout(60000)});assert.equal(csv.status,200);const csvText=await csv.text();assert.equal(csvText.trim().split(/\r?\n/).length,2001);assert.match(csvText,/electricity_kwh_day/);await save("research-evaluations.csv",csvText);
const invalid=await call("/api/research/hrt",{...meta.data.defaults,targetHours:1});assert.equal(invalid.status,422);
let legacyReplay=null;
if(process.env.AUDIT_LEGACY_ML_RUN_ID){const previous=await call("/api/ml/verify",{runId:process.env.AUDIT_LEGACY_ML_RUN_ID});assert.equal(previous.status,200);assert.equal(previous.data.status,"PASS");assert.equal(previous.data.saved,true);legacyReplay={runId:process.env.AUDIT_LEGACY_ML_RUN_ID,checks:previous.data.checks.length,status:previous.data.status};await save("legacy-ml-replay.json",previous.data);}
await call("/api/auth/logout",{});cookie="";await login();
const retrieved=await call(`/api/research/hrt?runId=${runId}`);assert.equal(retrieved.status,200);assert.equal(retrieved.data.integrity,true);assert.equal(retrieved.data.outputHash,run.data.outputHash);
const ids=new Set();let cursor,total,pages=0;
do{const page=await call(`/api/audit?limit=25${cursor?`&cursor=${encodeURIComponent(cursor)}`:""}`);assert.equal(page.status,200);total??=page.data.total;assert.equal(page.data.total,total);for(const row of page.data.runs){assert.ok(!ids.has(row.id));ids.add(row.id);}cursor=page.data.cursor;assert.equal(Boolean(cursor),page.data.hasMore);assert.ok(++pages<1000);}while(cursor);
assert.equal(ids.size,total);assert.ok(ids.has(runId));assert.ok(ids.has(report.data.reportId));
const validation=await call("/api/validation");assert.equal(validation.status,200);assert.equal(validation.data.status,"INDEPENDENT_PLANT_VALIDATION_PENDING");
const summary={status:"PASS",checkedAt:new Date().toISOString(),base,deployment:run.data.deployment,runId,reportId:report.data.reportId,modelVersion:run.data.modelVersion,modelManifestHash:run.data.manifestHash,selectedHrtHours:run.data.selected.hrtHours,verificationChecks:report.data.checks.length,listedRecords:total,listPages:pages,legacyReplay,checks:["authenticated research API","500 source rows and explicit units","unchanged day-model source identity","private Blob save and readback","8 research replay checks","2000-point CSV and authenticated JSON","out-of-range rejection","fresh-session retrieval and complete pagination","plant validation pending"],scope:"Production software verification of synthetic research. No plant measurements or equipment actions."};
await save("summary.json",summary);console.log(JSON.stringify(summary,null,2));
