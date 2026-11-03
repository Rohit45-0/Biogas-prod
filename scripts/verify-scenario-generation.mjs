import assert from "node:assert/strict";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {chromium} from "playwright";

const base=process.env.AUDIT_BASE_URL,password=process.env.AQUA_ADMIN_PASSWORD;
assert(base&&password,"Set AUDIT_BASE_URL and Admin credentials; this check creates three saved synthetic runs");
const out=path.resolve(process.env.AUDIT_RELEASE_DIR||"test-results/scenario-release");
await mkdir(out,{recursive:true});
const build=JSON.parse(await readFile("app/lib/research-build.json","utf8"));
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
try{
  const context=await browser.newContext({viewport:{width:1440,height:1100}});
  const login=await context.request.post(base+"/api/auth/login",{data:{username:process.env.AQUA_ADMIN_USERNAME||"admin",password}});
  assert.equal(login.status(),200,"Admin login failed");
  const page=await context.newPage(),errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto(base);const study=page.locator(".hr-workspace");
  await study.getByText("Research model ready",{exact:true}).waitFor();
  assert.equal(await study.getByLabel("Scenario mode",{exact:true}).inputValue(),"automatic");
  const runs=[];let previous=24,previousProduction;
  for(let i=0;i<3;i++){
    const pending=page.waitForResponse(r=>new URL(r.url()).pathname==="/api/research/hrt"&&r.request().method()==="POST",{timeout:60000});
    await study.getByRole("button",{name:"Run HRT study",exact:true}).first().click();
    const response=await pending;assert.equal(response.status(),200);const run=await response.json();
    assert.equal(run.engineHash,build.sourceHash,"The deployed backend must match this checkout");
    assert.equal(run.audit.saved,true);assert.equal(run.audit.provider,"vercel-private-blob");
    assert.equal(run.scenario.mode,"automatic");assert.ok(run.scenario.seed);
    assert.ok(run.scenario.hrtHours>=2&&run.scenario.hrtHours<=24);
    assert.ok(Math.abs(run.scenario.hrtHours-previous)>=1-1e-10);
    assert.equal(run.comparison.hrtHours,run.scenario.hrtHours);
    await study.locator(".hr-footer").filter({hasText:run.runId.slice(0,8)}).waitFor();
    for(const key of ["biogasM3Day","methaneM3Day","electricityKwhDay"]){
      const shown=Number((await study.locator(`[data-metric="${key}"] strong`).innerText()).replaceAll(",",""));
      assert.ok(Math.abs(shown-run.comparison[key])<=.051,`${key} must display this run's prediction`);
    }
    const displayed=await study.locator(".hr-kpis strong").allTextContents();
    if(previousProduction)assert.notDeepEqual(displayed,previousProduction);
    assert.equal(await study.locator(".hr-stale").count(),0);
    const saved=await context.request.get(base+`/api/audit?runId=${run.runId}`);assert.equal(saved.status(),200);
    const evidence=await saved.json();assert.equal(evidence.integrity,true);
    assert.equal(evidence.record.inputs.scenario.seed,run.scenario.seed);
    assert.deepEqual(evidence.record.response.comparison,run.comparison);
    const verify=await context.request.post(base+"/api/research/hrt/verify",{data:{runId:run.runId}});
    assert.equal(verify.status(),200);const report=await verify.json();assert.equal(report.status,"PASS");assert.equal(report.saved,true);
    await writeFile(path.join(out,`run-${i+1}.json`),JSON.stringify({run,evidence,report},null,2));
    await page.screenshot({path:path.join(out,`run-${i+1}.png`),fullPage:true});
    runs.push({runId:run.runId,hrtHours:run.scenario.hrtHours,biogasM3Day:run.comparison.biogasM3Day,methaneM3Day:run.comparison.methaneM3Day,electricityKwhDay:run.comparison.electricityKwhDay,recommendedHrtHours:run.selected.hrtHours,replay:report.status,deployment:run.deployment});
    previous=run.scenario.hrtHours;previousProduction=displayed;
  }
  assert.deepEqual(errors,[]);
  const summary={status:"PASS",checkedAt:new Date().toISOString(),base,engineHash:build.sourceHash,runs,scope:"Three real browser clicks, changing synthetic inputs and fitted predictions, exact UI values, persisted evidence and passing replay. No plant measurements."};
  await writeFile(path.join(out,"summary.json"),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
  await context.request.post(base+"/api/auth/logout");
}finally{await browser.close();}
