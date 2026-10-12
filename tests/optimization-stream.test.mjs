import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import ts from "typescript";

const source=await readFile(new URL("../app/lib/optimization-workflow.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext}}).outputText;
const {readOptimizationResponse,optimizationSteps}=await import("data:text/javascript;base64,"+Buffer.from(compiled).toString("base64"));
const result={runId:"test-run",audit:{saved:true,status:"RECORDED"}};
const event={type:"progress",step:"conditions",status:"complete",detail:"Dairy WW \u00b0C",at:new Date().toISOString(),elapsedMs:0.1};
function streamed(messages,chunkSize=1){
  const bytes=new TextEncoder().encode(messages);
  return new Response(new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=chunkSize)controller.enqueue(bytes.slice(i,i+chunkSize));controller.close();}}),{headers:{"Content-Type":"application/x-ndjson"}});
}
test("workflow stream handles split UTF-8 bytes, multiple lines, and a final unterminated line",async()=>{
  const events=[];
  const received=await readOptimizationResponse(streamed(JSON.stringify(event)+"\n\n"+JSON.stringify({type:"result",data:result})),e=>events.push(e));
  assert.deepEqual(events,[event]);assert.deepEqual(received,result);assert.equal(optimizationSteps.length,8);
});
test("workflow reader surfaces HTTP, protocol, execution and truncated-stream failures",async()=>{
  await assert.rejects(readOptimizationResponse(new Response(JSON.stringify({error:"Sign in required"}),{status:401}),()=>{}),/Sign in required/);
  await assert.rejects(readOptimizationResponse(streamed(JSON.stringify(event)+"\n"),()=>{}),/before the final result/);
  await assert.rejects(readOptimizationResponse(streamed(JSON.stringify({type:"error",error:"Model execution failed"})),()=>{}),/Model execution failed/);
  await assert.rejects(readOptimizationResponse(streamed(JSON.stringify({...event,step:"imaginary-step"})),()=>{}),/Invalid execution progress/);
  await assert.rejects(readOptimizationResponse(streamed(JSON.stringify({type:"result",data:{}})),()=>{}),/result is incomplete/);
  await assert.rejects(readOptimizationResponse(streamed("broken JSON\n"),()=>{}),/JSON/);
});
test("workflow reader supports a successful ordinary JSON response without fabricating events",async()=>{
  const events=[];const received=await readOptimizationResponse(new Response(JSON.stringify(result),{headers:{"Content-Type":"application/json"}}),e=>events.push(e));
  assert.deepEqual(received,result);assert.deepEqual(events,[]);
});
