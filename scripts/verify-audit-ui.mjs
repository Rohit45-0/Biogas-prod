import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.join(root,'test-results','audit-remediation-ui');await mkdir(out,{recursive:true});
const password=randomUUID(),dataDir=path.join(out,'records-'+randomUUID());
const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));
const base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{cwd:root,windowsHide:true,env:{...process.env,VERCEL:'',BLOB_READ_WRITE_TOKEN:'',OPENAI_API_KEY:'',AQUA_AUDIT_DIR:dataDir,AQUA_SESSION_SECRET:randomUUID(),AQUA_ADMIN_USERNAME:'admin',AQUA_ADMIN_PASSWORD:password,AQUA_USER_USERNAME:'user',AQUA_USER_PASSWORD:password}});
let logs='',browser;server.stdout.on('data',v=>logs+=v);server.stderr.on('data',v=>logs+=v);
try{
  let ready=false;for(let i=0;i<100;i++){assert.equal(server.exitCode,null,logs.slice(-3000));try{if((await fetch(base+'/api/auth/session',{signal:AbortSignal.timeout(2000)})).status===401){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(ready,logs.slice(-3000));
  browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{}),headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.getByLabel('Username',{exact:true}).fill('admin');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:/Continue/}).click();
  await page.getByRole('button',{name:'Audit Trail',exact:true}).click();
  const ml=page.locator('section[aria-label="Trained ML predictions"]');await ml.getByText('LOADED',{exact:true}).waitFor();
  await ml.locator('.at-inputs input[type="number"]').nth(2).fill('11');
  const pending=page.waitForResponse(r=>r.url().endsWith('/api/ml/predict')&&r.request().method()==='POST');
  await ml.getByRole('button',{name:'Run ML prediction',exact:true}).click();const run=await (await pending).json();assert.equal(run.audit.saved,true);
  await ml.getByRole('heading',{name:'ML prediction results'}).waitFor();assert.match(await ml.innerText(),/pH 11/);assert.match(await ml.innerText(),/Prediction intervals unavailable/);
  const evidence=await context.request.get(base+`/api/audit?runId=${run.runId}&format=json`);assert.equal(evidence.status(),200);
  const exported=await evidence.json();assert.equal(exported.integrity,true);assert.equal(exported.authentication.independentlyVerifiable,false);assert.match(exported.authentication.type,/server.authenticated/i);
  await page.screenshot({path:path.join(out,'desktop-ml-warnings.png'),fullPage:true});
  const protocol={operatingConditions:run.effectiveInputs};let latest;
  for(let i=0;i<24;i++){const response=await context.request.post(base+'/api/ml/predict',{data:protocol});assert.equal(response.status(),200);latest=(await response.json()).runId;}
  await page.getByRole('button',{name:'Audit records',exact:true}).click();await page.getByText('20 of 25 records loaded',{exact:false}).waitFor();
  assert.ok((await page.locator('.at-link').allTextContents()).includes(latest));
  await page.getByRole('button',{name:'Load more records'}).click();await page.getByText('25 of 25 records loaded',{exact:false}).waitFor();
  assert.equal(new Set(await page.locator('.at-link').allTextContents()).size,25);
  await page.screenshot({path:path.join(out,'desktop-records.png'),fullPage:true});
  assert.equal((await context.request.post(base+'/api/auth/logout')).status(),200);
  assert.equal((await context.request.get(base+'/api/audit')).status(),401);
  assert.equal((await context.request.post(base+'/api/auth/login',{data:{username:'admin',password}})).status(),200);
  const relisted=await context.request.get(base+'/api/audit');assert.equal(relisted.status(),200);assert.ok((await relisted.json()).runs.some(row=>row.id===latest));
  await page.getByRole('button',{name:'Plant validation',exact:true}).click();
  const plant=page.locator('section[aria-label="Plant validation"]');
  assert.equal(await plant.getByLabel('Saved ML run ID',{exact:true}).inputValue(),run.runId);
  await plant.getByLabel('Plant ID',{exact:true}).fill('AUTOMATED-TEST-NOT-REAL');await plant.getByLabel('Holdout dataset ID',{exact:true}).fill('UI-TEST-FIXTURE');await plant.getByLabel('Sample ID',{exact:true}).fill('UI-001');
  await plant.getByLabel('Measurement timestamp (local time)',{exact:true}).fill('2026-01-01T12:00');await plant.getByLabel('Measurement source / calibration reference',{exact:true}).fill('Automated UI test only; not plant evidence');
  for(const [i,value] of ['100','60','40'].entries())await plant.locator('input[type="number"]').nth(i).fill(value);
  for(const box of await plant.getByRole('checkbox').all())await box.check();
  await plant.getByRole('button',{name:'Record measurement'}).click();await plant.getByText('RECORDED',{exact:true}).waitFor();
  await plant.getByRole('button',{name:'Calculate measured errors'}).click();await plant.getByRole('heading',{name:'1 reported observations'}).waitFor();
  assert.match(await plant.innerText(),/REVIEW REQUIRED/);assert.equal(await plant.getByRole('cell',{name:'Not defined',exact:true}).count(),6);
  await page.screenshot({path:path.join(out,'desktop-plant-validation.png'),fullPage:true});
  await page.getByRole('button',{name:'Overview',exact:true}).first().click();await page.locator('.run-ai-button').click();await page.getByRole('button',{name:'View results',exact:true}).waitFor();await page.getByRole('button',{name:'View results',exact:true}).click();
  assert.match(await page.locator('.overview-improvements').innerText(),/HRT change/);assert.doesNotMatch(await page.locator('.overview-ai-summary').innerText(),/HRT reduction|What AI improved/);
  await page.screenshot({path:path.join(out,'desktop-overview.png'),fullPage:true});
  const widths=[];
  for(const width of [390,768,850,1024]){
    await page.setViewportSize({width,height:900});
    await page.getByRole('button',{name:'Audit Trail',exact:true}).click();await page.getByRole('button',{name:'Plant validation',exact:true}).click();
    const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));widths.push(size);assert.ok(size.scroll<=size.width+1,JSON.stringify(size));
    await page.screenshot({path:path.join(out,`plant-${width}.png`),fullPage:true});
    await page.getByRole('button',{name:'ML predictions',exact:true}).click();await page.screenshot({path:path.join(out,`ml-${width}.png`),fullPage:true});
  }
  assert.deepEqual(errors,[]);
  const summary={status:'PASS',checkedAt:new Date().toISOString(),desktop:1440,responsiveWidths:widths,checks:['pH warning visibility','25-record UI pagination','record visibility after logout/login','measurement form and undefined R2','HRT neutral labels','server-authenticated exports','phone/tablet/desktop navigation without overlap'],scope:'Isolated local software fixtures, not real plant measurements',screenshots:out};
  await writeFile(path.join(out,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
}finally{
  if(browser)await browser.close();
  if(server.exitCode===null){const ended=once(server,'exit');server.kill();await ended;}
  await writeFile(path.join(out,'server.log'),logs);
}
