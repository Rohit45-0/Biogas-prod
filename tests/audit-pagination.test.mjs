import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import ts from "typescript";

async function moduleUrl(file,replacements={}){
  let source=ts.transpileModule(await readFile(new URL(file,import.meta.url),"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext}}).outputText;
  for(const [name,url] of Object.entries(replacements))source=source.replaceAll(`from "${name}"`,`from "${url}"`);
  return "data:text/javascript;base64,"+Buffer.from(source).toString("base64");
}
const pageUrl=await moduleUrl("../app/lib/audit-pagination.ts");
const {auditPage}=await import(pageUrl);
const {hrtChange,hrtChangeLabel}=await import(await moduleUrl("../app/lib/hrt.ts"));
test("global newest-first cursor pages include every record exactly once",()=>{
  const entries=Array.from({length:107},(_,i)=>({id:randomUUID(),key:`key-${i}`,storedAt:new Date(Date.UTC(2026,0,1,0,0,Math.floor(i/3))).toISOString()}));
  const expected=[...entries].sort((a,b)=>b.storedAt.localeCompare(a.storedAt)||b.id.localeCompare(a.id));
  const loaded=[];let cursor;
  do{const page=auditPage(entries,13,cursor);loaded.push(...page.items);assert.equal(page.total,107);cursor=page.cursor;}while(cursor);
  assert.deepEqual(loaded,expected);assert.equal(new Set(loaded.map(r=>r.id)).size,107);
  for(const bad of ["20","bad cursor",Buffer.from('{}').toString('base64url')])assert.throws(()=>auditPage(entries,20,bad),/Invalid record-list cursor/);
});
test("pagination snapshot does not shift when new records arrive",()=>{
  const entries=Array.from({length:5},(_,i)=>({id:randomUUID(),key:`k${i}`,storedAt:new Date(Date.UTC(2026,0,i+1)).toISOString()}));
  const first=auditPage(entries,2);
  const future={id:randomUUID(),key:"new",storedAt:new Date(Date.parse(first.snapshot)+100).toISOString()};
  const next=auditPage([...entries,future],20,first.cursor);
  assert.equal(next.total,5);assert.equal(next.items.length,3);assert.ok(next.items.every(e=>e.id!==future.id));
});
test("private Blob listing enumerates storage pages before ordering and preserves unreadable entries",async()=>{
  const previous=process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN="test-token-not-a-real-credential";
  const blobs=Array.from({length:75},(_,i)=>{const id=randomUUID();return {pathname:`audit-v2/records/${id}.json`,uploadedAt:new Date(Date.UTC(2026,0,1,0,i)),id};}).sort((a,b)=>a.pathname.localeCompare(b.pathname));
  globalThis.auditBlobTest={blobs,calls:0,reads:0,missing:""};
  const stub=`export async function list({cursor}){const s=globalThis.auditBlobTest;s.calls++;const offset=Number(cursor)||0;return {blobs:s.blobs.slice(offset,offset+11),hasMore:offset+11<s.blobs.length,cursor:String(offset+11)}};export async function get(key){const s=globalThis.auditBlobTest;s.reads++;const b=s.blobs.find(b=>b.pathname===key);if(key===s.missing)return null;return {statusCode:200,stream:new Response(JSON.stringify({id:b.id,createdAt:b.uploadedAt.toISOString()})).body}};export async function put(){}`;
  const blobUrl="data:text/javascript;base64,"+Buffer.from(stub).toString("base64");
  try{
    const audit=await import(await moduleUrl("../app/lib/audit.ts",{"@vercel/blob":blobUrl,"./audit-pagination":pageUrl,"./evidence":await moduleUrl("../app/lib/evidence.ts")}));
    const page=await audit.listEvidence(5);
    assert.equal(globalThis.auditBlobTest.calls,7);assert.equal(globalThis.auditBlobTest.reads,5);assert.equal(page.total,75);
    const newest=[...blobs].sort((a,b)=>b.uploadedAt-a.uploadedAt);
    assert.deepEqual(page.items.map(e=>e.id),newest.slice(0,5).map(e=>e.id));
    globalThis.auditBlobTest.missing=newest[0].pathname;
    const damaged=await audit.listEvidence(5);assert.equal(damaged.items[0].readError,true);assert.equal(damaged.items[0].id,newest[0].id);
  }finally{if(previous===undefined)delete process.env.BLOB_READ_WRITE_TOKEN;else process.env.BLOB_READ_WRITE_TOKEN=previous;delete globalThis.auditBlobTest;}
});
test("HRT increase, decrease and unchanged use neutral signed units",()=>{
  assert.deepEqual(hrtChange(22*24,23.1*24),{changeHours:26.4,changeDays:1.1,direction:"increase"});
  assert.match(hrtChangeLabel(528,554.4),/^\+26.4 hours \(increase\)$/);
  assert.match(hrtChangeLabel(24,12),/^-12 hours \(decrease\)$/);
  assert.match(hrtChangeLabel(24,24),/^0 hours \(unchanged\)$/);
});
