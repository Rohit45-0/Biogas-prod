import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const root=fileURLToPath(new URL("../",import.meta.url)),out=path.join(root,"test-results","hrt-research-ui");await mkdir(out,{recursive:true});
const password=randomUUID(),listener=createServer();listener.listen(0,"127.0.0.1");await once(listener,"listening");const port=listener.address().port;await new Promise(r=>listener.close(r));
const base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,[path.join(root,"node_modules/next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",String(port)],{cwd:root,windowsHide:true,env:{...process.env,VERCEL:"",BLOB_READ_WRITE_TOKEN:"",OPENAI_API_KEY:"",AQUA_AUDIT_DIR:path.join(out,"records-"+randomUUID()),AQUA_SESSION_SECRET:randomUUID(),AQUA_ADMIN_USERNAME:"admin",AQUA_ADMIN_PASSWORD:password,AQUA_USER_USERNAME:"user",AQUA_USER_PASSWORD:password}});
let logs="",browser;server.stdout.on("data",v=>logs+=v);server.stderr.on("data",v=>logs+=v);
try{
  let ready=false;for(let i=0;i<100;i++){assert.equal(server.exitCode,null,logs.slice(-2000));try{if((await fetch(base+"/api/auth/session")).status===401){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,logs.slice(-3000));
  browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{}),headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(e.message));await page.goto(base);
  await page.getByLabel("Username",{exact:true}).fill("admin");await page.getByLabel("Password",{exact:true}).fill(password);await page.getByRole("button",{name:/Continue/}).click();
  const study=page.locator(".hr-workspace");await study.getByText("Research model ready",{exact:true}).waitFor();
  assert.equal(await study.getByLabel("Comparison HRT (hours)",{exact:true}).inputValue(),"24");
  assert.equal(await page.getByRole("button",{name:"Day-scale reference",exact:true}).count(),0);
  let dayModelRequests=0;page.on("request",request=>{if(new URL(request.url()).pathname==="/api/predict")dayModelRequests++;});
  assert.match(await study.locator(".hr-disclosure").innerText(),/not plant validated/);
  const pending=page.waitForResponse(r=>r.url().endsWith("/api/research/hrt")&&r.request().method()==="POST");
  await study.getByRole("button",{name:"Run HRT study",exact:true}).first().click();const run=await (await pending).json();
  await study.locator(".hr-selected-time strong").filter({hasText:"7.88"}).waitFor();assert.equal(run.audit.saved,true);
  assert.equal(run.retentionTime.beforeHours,24);assert.equal(run.comparison.hrtHours,24);
  const recommendations=study.getByRole("region",{name:"AI recommendations",exact:true});
  assert.match(await recommendations.locator('[data-parameter="hrtHours"]').innerText(),/24 hours.*7.88 hours.*decrease/s);
  for(const item of run.recommendations)assert.equal(item.target,run.selected[item.key]);
  await study.getByRole("button",{name:"Ask Copilot",exact:true}).click();const chat=study.getByRole("complementary",{name:"Hours-scale Copilot"});
  await chat.getByLabel("Ask about the hours-scale run").fill("Why this HRT?");await chat.getByRole("button",{name:"Ask Copilot",exact:true}).click();
  await chat.locator('.chat-messages .ai').filter({hasText:"The selected HRT is 7.88 hours"}).waitFor();
  // Check the model answer, not the randomly generated saved-run ID in the header.
  assert.doesNotMatch(await chat.locator('.chat-messages .ai').last().innerText(),/\b(?:528|602)(?:\.0+)?\s*(?:hours|h)\b|\b22(?:\.0+)?\s*days\b/i);await chat.getByLabel("Close Copilot").click();
  assert.match(await study.locator(".hr-kpis").innerText(),/kWh\/day/);assert.match(await study.locator(".hr-kpis").innerText(),/m³ CH₄\/day/);
  await page.screenshot({path:path.join(out,"overview-1440.png"),fullPage:true});
  for(const [label,expected] of [["Biogas","Biogas production"],["Methane","Methane yield"],["Electricity","Electricity potential"],["HRT in hours","HRT in hours"],["AI optimizer","HRT scenario optimizer"]]){
    await page.locator(".simple-sidebar").getByRole("button",{name:label,exact:true}).click();assert.equal(await study.locator("h1").innerText(),expected);assert.match(await study.locator(".hr-footer").innerText(),new RegExp(run.runId.slice(0,8)));
    assert.match(await recommendations.locator('[data-parameter="hrtHours"]').innerText(),/7.88 hours/);
  }
  await study.getByRole("button",{name:"Month",exact:true}).click();assert.match(await study.locator(".hr-kpis").innerText(),/kWh\/month/);assert.match(await study.locator(".hr-selected-time strong").innerText(),/7.88/);await study.getByRole("button",{name:"Day",exact:true}).click();
  await page.locator(".simple-sidebar").getByRole("button",{name:"Workbook AI reading",exact:true}).click();await study.getByRole("cell",{name:"RUN-H001",exact:true}).waitFor();await study.getByRole("button",{name:"Next",exact:true}).click();await study.getByRole("cell",{name:"RUN-H021",exact:true}).waitFor();await page.screenshot({path:path.join(out,"workbook-1440.png"),fullPage:true});
  await page.locator(".simple-sidebar").getByRole("button",{name:"AI & KPI reports",exact:true}).click();await study.getByRole("button",{name:"Verify saved run",exact:true}).click();await study.getByText("PASS · 8/8 checks",{exact:true}).waitFor();
  const csv=await context.request.get(base+`/api/research/hrt?runId=${run.runId}&format=csv`);assert.equal(csv.status(),200);assert.equal((await csv.text()).trim().split(/\r?\n/).length,2001);
  await study.getByRole("button",{name:"Open in Audit Trail",exact:true}).click();await page.getByRole("heading",{name:"Hours-scale research evidence",exact:true}).waitFor();const auditSummary=await page.locator(".hr-audit-summary").innerText();assert.ok(Math.abs(Number(auditSummary.match(/→ ([\d.]+) hours/)[1])-run.selected.hrtHours)<.0005);
  await page.getByRole("button",{name:"Verify HRT research replay",exact:true}).click();await page.locator(".hr-audit-summary").getByText("PASS: 8/8 checks.",{exact:true}).waitFor();await page.screenshot({path:path.join(out,"audit-1440.png"),fullPage:true});
  await page.getByRole("button",{name:"Hours-scale research",exact:true}).click();
  await study.getByLabel("Comparison HRT (hours)",{exact:true}).fill("528");
  await study.getByRole("button",{name:"Run HRT study",exact:true}).first().click();await study.getByRole("alert").filter({hasText:"Comparison HRT must be between 2 and 24 hours"}).waitFor();
  assert.equal(await study.getByLabel("Comparison HRT (hours)",{exact:true}).evaluate(input=>input.validity.rangeOverflow),true);
  await study.getByLabel("Comparison HRT (hours)",{exact:true}).fill("24");
  await study.getByLabel("Research objective",{exact:true}).selectOption("target_hrt");await study.getByLabel("Target HRT (hours)",{exact:true}).fill("2");assert.ok(await study.locator(".hr-stale").isVisible());
  const targetPending=page.waitForResponse(r=>r.url().endsWith("/api/research/hrt")&&r.request().method()==="POST");await study.getByRole("button",{name:"Run HRT study",exact:true}).first().click();const target=await (await targetPending).json();assert.equal(target.goal.satisfied,false);await study.locator(".hr-goal.unmet").waitFor();assert.ok(target.selected.electricityKwhDay<run.selected.electricityKwhDay);
  assert.match(await recommendations.locator('[data-parameter="hrtHours"]').innerText(),/24 hours.*2 hours/s);
  const increasePending=page.waitForResponse(r=>r.url().endsWith("/api/research/hrt")&&r.request().method()==="POST");
  await study.getByLabel("Comparison HRT (hours)",{exact:true}).fill("2");await study.getByLabel("Target HRT (hours)",{exact:true}).fill("12");
  await study.getByRole("button",{name:"Run HRT study",exact:true}).first().click();const increase=await (await increasePending).json();assert.equal(increase.retentionTime.direction,"increase");
  await study.locator('.hr-time-change[data-direction="increase"]').waitFor();assert.match(await recommendations.locator('[data-parameter="hrtHours"]').innerText(),/\+10 hours \(increase\)/);
  const widths=[];
  for(const width of [1440,1024,850,768,390]){
    await page.setViewportSize({width,height:1000});
    for(const view of ["Overview","Workbook AI reading","Data sources"]){await page.locator(".simple-sidebar").getByRole("button",{name:view,exact:true}).click();const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(size.scroll<=size.width+1,JSON.stringify({view,...size}));}
    await page.locator(".simple-sidebar").getByRole("button",{name:"Overview",exact:true}).click();await page.screenshot({path:path.join(out,`research-${width}.png`),fullPage:true});widths.push(width);
  }
  await page.getByRole("button",{name:"Audit Trail",exact:true}).click();await page.getByRole("button",{name:"1. Scenario execution",exact:true}).click();
  assert.match(await page.locator('.at-notice').first().innerText(),/Original day-scale model tests remain here/);
  await page.getByRole("button",{name:"Hours-scale research",exact:true}).click();assert.match(await study.locator(".hr-selected-time strong").innerText(),/12 hours/);
  assert.equal(dayModelRequests,0,"Dashboard navigation must not execute the original day-scale prediction route");
  assert.deepEqual(errors,[]);
  const summary={status:"PASS",checkedAt:new Date().toISOString(),widths,checks:["hours model shared by dashboard, AI recommendations and Copilot","comparison HRT limited to 2–24 hours in the dashboard","explicit HRT increase and decrease","source pagination","synthetic evaluation disclosure","changed-input stale state","short-HRT methane/energy trade-off","2000-point export","saved record retrieval and 8 replay checks","original day models retained in Audit Trail only","responsive navigation without page overflow"],runId:run.runId,selectedHrtHours:run.selected.hrtHours,scope:"Local software verification with synthetic inputs; not plant validation"};
  await writeFile(path.join(out,"summary.json"),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
}finally{if(browser)await browser.close();if(server.exitCode===null){const stopped=once(server,"exit");server.kill();await stopped;}await writeFile(path.join(out,"server.log"),logs);}
