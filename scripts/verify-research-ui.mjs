import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {randomUUID} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const root=fileURLToPath(new URL("../",import.meta.url)),out=path.join(root,"test-results","hrt-research-ui");await mkdir(out,{recursive:true});
const password=randomUUID(),listener=createServer();listener.listen(0,"127.0.0.1");await once(listener,"listening");const port=listener.address().port;await new Promise(r=>listener.close(r));
const base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,[path.join(root,"node_modules/next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",String(port)],{cwd:root,windowsHide:true,env:{...process.env,VERCEL:"",BLOB_READ_WRITE_TOKEN:"",OPENAI_API_KEY:"",AQUA_AUDIT_DIR:path.join(out,"records-"+randomUUID()),AQUA_SESSION_SECRET:randomUUID(),AQUA_ADMIN_USERNAME:"admin",AQUA_ADMIN_PASSWORD:password,AQUA_USER_USERNAME:"user",AQUA_USER_PASSWORD:password}});
let logs="",browser;server.stdout.on("data",v=>logs+=v);server.stderr.on("data",v=>logs+=v);
function numeric(text){return Number(text.replaceAll(",","").match(/-?\d+(?:\.\d+)?/)?.[0]);}
function csvRows(text){return text.replace(/^\uFEFF/,"").trim().split(/\r?\n/).map(line=>{const cells=[];let cell="",quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===","&&!quoted){cells.push(cell);cell="";}else cell+=c;}cells.push(cell);return cells;});}
try{
  let ready=false;for(let i=0;i<100;i++){assert.equal(server.exitCode,null,logs.slice(-2000));try{if((await fetch(base+"/api/auth/session")).status===401){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,logs.slice(-3000));
  browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{}),headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage(),errors=[];
  let dayModelRequests=0,researchRequests=0;
  page.on("pageerror",e=>errors.push(e.message));page.on("request",request=>{if(request.method()==="POST"){const route=new URL(request.url()).pathname;if(route==="/api/predict")dayModelRequests++;if(route==="/api/research/hrt")researchRequests++;}});
  await page.goto(base);
  await page.getByLabel("Username",{exact:true}).fill("admin");await page.getByLabel("Password",{exact:true}).fill(password);await page.getByRole("button",{name:/Continue/}).click();
  const study=page.locator(".hr-workspace"),sidebar=page.locator(".simple-sidebar");
  await study.getByText("Research model ready",{exact:true}).waitFor();
  const runButton=()=>study.locator(".hr-header-actions").getByRole("button",{name:"Run AI optimization",exact:true});
  async function navigate(label,title){await sidebar.getByRole("button",{name:label,exact:true}).click();if(title)assert.equal(await study.locator("h1").innerText(),title);}
  async function toggleSettings(open){const button=study.getByRole("button",{name:"Study settings",exact:true});if((await button.getAttribute("aria-expanded")==="true")!==open)await button.click();}
  async function runModel(){const pending=page.waitForResponse(r=>new URL(r.url()).pathname==="/api/research/hrt"&&r.request().method()==="POST");await runButton().click();const response=await pending;assert.equal(response.status(),200);const current=await response.json();await study.locator(".hr-footer").filter({hasText:current.runId.slice(0,8)}).waitFor();return current;}
  async function assertProduction(current,keys=["biogasM3Day","methaneM3Day","electricityKwhDay"]){for(const key of keys){const shown=numeric(await study.locator(`.pd-kpi[data-metric="${key}"] strong`).innerText());assert.ok(Math.abs(shown-current.comparison[key])<=.051,`${key}: displayed ${shown}, calculated ${current.comparison[key]}`);}}
  async function assertRecommendation(current){const recommendations=study.getByRole("region",{name:"AI recommendations",exact:true});for(const item of current.recommendations){const text=await recommendations.locator(`[data-parameter="${item.key}"]`).innerText();assert.ok(text.includes(item.target.toLocaleString("en-US",{maximumFractionDigits:2})),`${item.key}: target missing from ${text}`);if(item.current!==null)assert.ok(text.includes(item.current.toLocaleString("en-US",{maximumFractionDigits:2})),`${item.key}: current value missing`);}return recommendations;}
  assert.equal(await study.getByLabel("Scenario mode",{exact:true}).count(),0,"Study settings start collapsed");
  await toggleSettings(true);assert.equal(await study.getByLabel("Scenario mode",{exact:true}).inputValue(),"automatic");await toggleSettings(false);
  assert.equal(await page.getByRole("button",{name:"Day-scale reference",exact:true}).count(),0);
  assert.match(await study.locator(".hr-disclosure").innerText(),/not plant validated/);
  await navigate("Process monitor","Process Monitor");
  const emptyMonitor=study.locator(".rpm-workspace");
  assert.equal(await emptyMonitor.locator(".rpm-stage").count(),0,"No completed stages may appear before a backend run");
  assert.match(await emptyMonitor.locator(".rpm-pending").innerText(),/No execution trace yet/);
  assert.equal(await emptyMonitor.locator(".rpm-device-status").filter({hasText:"NOT CONNECTED"}).count(),4);
  await navigate("Overview");
  let previous=24,previousProduction;
  const automaticRuns=[],automaticResults=[];
  for(let i=0;i<3;i++){
    const current=await runModel();assert.equal(current.audit.saved,true);assert.equal(current.scenario.mode,"automatic");assert.ok(Math.abs(current.comparison.hrtHours-previous)>=1-1e-10);
    await assertProduction(current);
    const production=await study.locator('.pd-kpi[data-metric="biogasM3Day"] strong, .pd-kpi[data-metric="methaneM3Day"] strong, .pd-kpi[data-metric="electricityKwhDay"] strong').allTextContents();
    if(previousProduction)assert.notDeepEqual(production,previousProduction);assert.equal(await study.locator(".hr-stale").count(),0);
    automaticRuns.push({runId:current.runId,hrtHours:current.comparison.hrtHours,production});automaticResults.push(current);previous=current.comparison.hrtHours;previousProduction=production;
  }
  await page.screenshot({path:path.join(out,"automatic-scenario-1440.png"),fullPage:true});
  await toggleSettings(true);await study.getByLabel("Scenario mode",{exact:true}).selectOption("manual");assert.equal(await study.getByLabel("Comparison HRT (hours)",{exact:true}).inputValue(),"24");
  let run=await runModel();assert.equal(run.retentionTime.beforeHours,24);assert.equal(run.comparison.hrtHours,24);assert.equal(run.audit.saved,true);await assertProduction(run);await toggleSettings(false);
  assert.match(await study.locator(".pd-run-summary .hr-selected-time strong").innerText(),/7.88 hours/);
  const conditions=await assertRecommendation(run);assert.match(await conditions.locator('[data-parameter="hrtHours"]').innerText(),/24.*7.88.*hours.*decrease/s);
  await study.getByRole("button",{name:"Ask Copilot",exact:true}).click();const chat=study.getByRole("complementary",{name:"Hours-scale Copilot"});
  await chat.getByLabel("Ask about the hours-scale run").fill("Why this HRT?");await chat.getByRole("button",{name:"Ask Copilot",exact:true}).click();
  await chat.locator('.chat-messages .ai').filter({hasText:"The selected HRT is 7.88 hours"}).waitFor();
  const answer=await chat.locator('.chat-messages .ai').last().innerText();assert.doesNotMatch(answer,/\b(?:528|602)(?:\.0+)?\s*(?:hours|h)\b|\b22(?:\.0+)?\s*days\b/i);assert.ok(answer.includes(run.comparison.biogasM3Day.toFixed(2)),"Copilot must use current saved-run production");await chat.getByLabel("Close Copilot").click();
  assert.match(await study.locator(".pd-kpis").innerText(),/kWh\/day/);assert.match(await study.locator(".pd-kpis").innerText(),/m³ CH₄\/day/);await page.screenshot({path:path.join(out,"overview-1440.png"),fullPage:true});
  for(const [label,title] of [["Biogas","Biogas Production Optimization Dashboard"],["Methane","Methane Yield Optimization Dashboard"],["Electricity","Electricity Production Dashboard"]]){await navigate(label,title);await assertProduction(run,label==="Biogas"?["biogasM3Day"]:label==="Electricity"?["methaneM3Day","electricityKwhDay"]:undefined);if(label==="Biogas"){assert.ok(Math.abs(numeric(await study.locator('.pd-kpi[data-metric="methanePct"] strong').innerText())-run.comparison.methanePct)<=.051);assert.ok(Math.abs(numeric(await study.locator('.pd-kpi[data-metric="biogasChange"] strong').innerText())-(run.selected.biogasM3Day-run.comparison.biogasM3Day))<=.051);}await assertRecommendation(run);assert.match(await study.locator(".hr-footer").innerText(),new RegExp(run.runId.slice(0,8)));}
  for(const [period,factor,unit] of [["Day",1,"kWh/day"],["Month",30,"kWh/month"],["Year",365,"kWh/year"]]){
    await study.getByRole("button",{name:period,exact:true}).click();const bars=study.locator(".pd-total-chart > div");assert.equal(await bars.count(),2);
    for(const [i,value] of [run.comparison.electricityKwhDay,run.selected.electricityKwhDay].entries()){const text=await bars.nth(i).locator("b").innerText();assert.ok(Math.abs(numeric(text)-value*factor)<=.051,`${period} total must derive from the saved prediction`);assert.ok(text.includes(unit));}
    assert.match(await study.locator(".pd-total-chart").innerText(),/not measured operating history/);
  }
  await study.getByRole("button",{name:"HRT curve",exact:true}).click();await study.getByRole("img",{name:"Electricity model curve versus HRT in hours",exact:true}).waitFor();
  await navigate("HRT in hours","HRT in Hours");assert.match(await study.locator(".hr-comparison").innerText(),/24.*7.88/s);assert.match(await study.locator(".hr-coverage").innerText(),/2–24 hours/);
  await navigate("AI optimizer","Recommended Operating Action");const recommendations=await assertRecommendation(run);assert.match(await recommendations.locator('[data-parameter="hrtHours"]').innerText(),/24 hours.*7.88 hours.*decrease/s);
  assert.match(await study.locator(".pd-optimizer-summary").innerText(),/79.8/);assert.ok(await study.getByRole("button",{name:"Use as comparison",exact:true}).isEnabled());
  await study.getByRole("button",{name:"Use as comparison",exact:true}).click();
  const copiedHrt=study.getByLabel("Comparison HRT (hours)",{exact:true});
  assert.equal(Number(await copiedHrt.inputValue()),run.selected.hrtHours,"Use as comparison must preserve the full model precision");
  assert.equal(await copiedHrt.evaluate(input=>input.validity.stepMismatch),false,"The exact model HRT must pass native form validation");
  const copiedPending=page.waitForResponse(r=>new URL(r.url()).pathname==="/api/research/hrt"&&r.request().method()==="POST");
  await study.locator(".hr-controls").getByRole("button",{name:"Run AI optimization",exact:true}).click();
  const copiedResponse=await copiedPending;assert.equal(copiedResponse.status(),200);const copiedRun=await copiedResponse.json();
  assert.equal(copiedRun.retentionTime.beforeHours,run.selected.hrtHours);assert.equal(copiedRun.retentionTime.direction,"unchanged");
  await study.locator(".hr-footer").filter({hasText:copiedRun.runId.slice(0,8)}).waitFor();
  await copiedHrt.fill("24");run=await runModel();await toggleSettings(false);
  await navigate("Workbook AI reading","Workbook AI Reading");await study.getByRole("cell",{name:"RUN-H001",exact:true}).waitFor();await study.getByRole("button",{name:"Next",exact:true}).click();await study.getByRole("cell",{name:"RUN-H021",exact:true}).waitFor();assert.match(await study.locator(".hr-evaluation").innerText(),/100 held-out test rows/);await page.screenshot({path:path.join(out,"workbook-1440.png"),fullPage:true});
  await navigate("Process monitor","Process Monitor");
  const monitor=study.locator(".rpm-workspace");await monitor.waitFor();assert.match(await monitor.innerText(),/not connected/i);assert.equal(await monitor.locator(".rpm-device-status").count(),4);assert.equal(await monitor.locator(".rpm-stage").count(),run.trace.length);
  for(const [label,key,tolerance] of [["HRT","hrtHours",.0051],["Temperature","temperature",.051],["pH","ph",.0051],["Organic loading","olr",.0051],["Feed rate","feedRate",.051]]){
    const row=monitor.locator(".rpm-conditions tbody tr").filter({has:page.getByRole("rowheader",{name:label,exact:true})}),cells=row.locator("td");
    assert.ok(Math.abs(numeric(await cells.nth(0).innerText())-run.comparison[key])<=tolerance,`${label}: Process Monitor must show the current scenario`);
    assert.ok(Math.abs(numeric(await cells.nth(1).innerText())-run.selected[key])<=tolerance,`${label}: Process Monitor must show the AI selected scenario`);
  }
  assert.ok(Math.abs(numeric(await monitor.locator(".rpm-index-ring strong").innerText())-run.comparison.stabilityPct)<=.051);
  assert.match(await monitor.locator(".rpm-stability").innerText(),/not a calibrated safety rating or prediction confidence/);
  await monitor.locator(".rpm-stage").nth(2).click();assert.match(await monitor.locator(".rpm-stage-detail").innerText(),/fitted/i);await monitor.locator("summary").click();assert.ok((await monitor.innerText()).includes(run.runId));await monitor.locator("summary").click();await page.screenshot({path:path.join(out,"process-monitor-1440.png"),fullPage:true});
  await navigate("AI & KPI reports","Saved Optimization Results");const reports=study.locator(".rr-workspace");
  async function assertReportTotals(current){const expected=[current.comparison.methaneM3Day*365,current.selected.methaneM3Day*365,current.comparison.electricityKwhDay*365,current.selected.electricityKwhDay*365];const totals=reports.locator(".rr-totals strong");assert.equal(await totals.count(),4);for(let i=0;i<4;i++)assert.ok(Math.abs(numeric(await totals.nth(i).innerText())-expected[i])<=.51);}
  await assertReportTotals(run);assert.equal(await reports.locator(".rr-table-panel tbody tr").count(),12);assert.match(await reports.locator(".rr-projection-note").innerText(),/Constant-output projections, not measured history/);
  const downloads={};
  for(const [kind,label,count] of [["daily","Export daily projection",366],["monthly","Export 12-month projection",13]]){const pending=page.waitForEvent("download");await reports.getByRole("button",{name:label,exact:true}).click();const download=await pending;const file=await download.path();assert.ok(file);const csv=await readFile(file,"utf8");await writeFile(path.join(out,`${kind}-projection.csv`),csv);const rows=csvRows(csv);assert.equal(rows.length,count);assert.ok(rows.slice(1).every(row=>row.includes(run.runId)&&row.includes("client_calculated_projection_not_a_server_authenticated_export")));downloads[kind]=rows;}
  assert.equal(downloads.monthly.slice(1).reduce((sum,row)=>sum+Number(row[1]),0),365);
  for(const index of [2,3,4,5,6,7])assert.ok(Math.abs(downloads.daily.slice(1).reduce((sum,row)=>sum+Number(row[index]),0)-downloads.monthly.slice(1).reduce((sum,row)=>sum+Number(row[index]),0))<1e-7,"Daily and monthly projections must reconcile");
  assert.ok(Math.abs(downloads.monthly.slice(1).reduce((sum,row)=>sum+Number(row[5]),0)-run.selected.methaneM3Day*365)<1e-7);
  const older=automaticResults[0];await reports.locator(".rr-history-select").filter({hasText:older.runId.slice(0,8)}).click();await reports.locator(".rr-history-notice").waitFor();await assertReportTotals(older);await reports.getByRole("button",{name:"Return to latest run",exact:true}).click();await assertReportTotals(run);
  await reports.getByRole("button",{name:"Verify saved run",exact:true}).click();await reports.getByText("PASS · 8/8 checks",{exact:true}).waitFor();await page.screenshot({path:path.join(out,"reports-1440.png"),fullPage:true});
  const csv=await context.request.get(base+`/api/research/hrt?runId=${run.runId}&format=csv`);assert.equal(csv.status(),200);assert.equal((await csv.text()).trim().split(/\r?\n/).length,2001);
  await reports.getByRole("button",{name:"Open in Audit Trail",exact:true}).click();await page.getByRole("heading",{name:"Hours-scale research evidence",exact:true}).waitFor();const auditSummary=await page.locator(".hr-audit-summary").innerText();assert.ok(Math.abs(Number(auditSummary.match(/→ ([\d.]+) hours/)[1])-run.selected.hrtHours)<.0005);
  await page.getByRole("button",{name:"Verify HRT research replay",exact:true}).click();await page.locator(".hr-audit-summary").getByText("PASS: 8/8 checks.",{exact:true}).waitFor();await page.screenshot({path:path.join(out,"audit-1440.png"),fullPage:true});
  await page.getByRole("button",{name:"Hours-scale research",exact:true}).click();await study.getByRole("button",{name:"Open alerts",exact:true}).click();assert.equal(await study.locator("h1").innerText(),"Alerts & Model Coverage");
  await study.getByRole("heading",{name:"Supported HRT coverage: 2–24 hours",exact:true}).waitFor();assert.match(await study.locator(".pd-alert-list").innerText(),/calibrated prediction intervals are unavailable/);
  await navigate("Settings","Scenario Settings");assert.equal(await study.getByLabel("Scenario mode",{exact:true}).inputValue(),"manual");
  await study.getByLabel("Comparison HRT (hours)",{exact:true}).fill("528");const beforeInvalid=researchRequests;await runButton().click();await study.getByRole("alert").filter({hasText:"Comparison HRT must be between 2 and 24 hours"}).waitFor();assert.equal(researchRequests,beforeInvalid);assert.equal(await study.getByLabel("Comparison HRT (hours)",{exact:true}).evaluate(input=>input.validity.rangeOverflow),true);
  await study.getByLabel("Comparison HRT (hours)",{exact:true}).fill("24");await study.getByLabel("Research objective",{exact:true}).selectOption("target_hrt");await study.getByLabel("Target HRT (hours)",{exact:true}).fill("2");assert.ok(await study.locator(".hr-stale").isVisible());
  const target=await runModel();assert.equal(target.goal.satisfied,false);assert.ok(target.selected.electricityKwhDay<run.selected.electricityKwhDay);
  await navigate("AI optimizer","Recommended Operating Action");await study.locator(".hr-goal.unmet").waitFor();assert.match(await study.getByRole("region",{name:"AI recommendations",exact:true}).locator('[data-parameter="hrtHours"]').innerText(),/24 hours.*2 hours/s);
  await navigate("Alerts","Alerts & Model Coverage");await study.getByRole("heading",{name:"Selected target misses the methane goal",exact:true}).waitFor();
  await navigate("Settings","Scenario Settings");await study.getByLabel("Comparison HRT (hours)",{exact:true}).fill("2");await study.getByLabel("Target HRT (hours)",{exact:true}).fill("12");
  const increase=await runModel();assert.equal(increase.retentionTime.direction,"increase");await navigate("AI optimizer","Recommended Operating Action");await study.locator('.pd-run-summary .hr-time-change[data-direction="increase"]').waitFor();assert.match(await study.getByRole("region",{name:"AI recommendations",exact:true}).locator('[data-parameter="hrtHours"]').innerText(),/\+10 hours \(increase\)/);
  const widths=[];
  for(const width of [1920,1440,1024,850,768,390]){
    await page.setViewportSize({width,height:1000});
    for(const view of ["Overview","Biogas","Methane","Electricity","Workbook AI reading","Process monitor","AI optimizer","AI & KPI reports","Alerts","Settings","Data sources"]){await navigate(view);const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(size.scroll<=size.width+1,JSON.stringify({view,...size}));}
    await navigate("Overview");await page.screenshot({path:path.join(out,`research-${width}.png`),fullPage:true});widths.push(width);
  }
  await sidebar.getByRole("button",{name:"Audit Trail",exact:true}).click();await page.getByRole("button",{name:"1. Scenario execution",exact:true}).click();assert.match(await page.locator('.at-notice').first().innerText(),/Original day-scale model tests remain here/);
  await page.getByRole("button",{name:"Hours-scale research",exact:true}).click();assert.match(await study.locator(".pd-run-summary .hr-selected-time strong").innerText(),/12 hours/);
  assert.equal(dayModelRequests,0,"Dashboard navigation must not execute the original day-scale prediction route");assert.deepEqual(errors,[]);
  const summary={status:"PASS",checkedAt:new Date().toISOString(),widths,automaticRuns,checks:["each automatic click changes the HRT input and displayed fitted predictions","shared results across restored production dashboards and Copilot","comparison HRT limited to 2–24 hours","explicit HRT increase and decrease","manual controls and stale-result state","Day/Month/Year projections use saved predictions","Process Monitor displays the current run and disconnected hardware","source pagination and synthetic evaluation disclosure","Reports monthly/daily CSV reconciliation, saved history and replay","Alerts include unmet goals and unavailable uncertainty","2000-point export and saved record retrieval","original day models remain in Audit Trail","all restored views fit phone, tablet and desktop without page overflow"],runId:run.runId,selectedHrtHours:run.selected.hrtHours,scope:"Local software verification with synthetic inputs; not plant validation"};
  await writeFile(path.join(out,"summary.json"),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
}finally{if(browser)await browser.close();if(server.exitCode===null){const stopped=once(server,"exit");server.kill();await stopped;}await writeFile(path.join(out,"server.log"),logs);}
