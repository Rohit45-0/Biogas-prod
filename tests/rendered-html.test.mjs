import assert from "node:assert/strict";
import {access,readFile} from "node:fs/promises";
import test from "node:test";
const root=new URL("../",import.meta.url);
test("production package includes dashboard, audit controls and source manifest",async()=>{
  const page=await readFile(new URL("app/page.tsx",root),"utf8");
  const audit=await readFile(new URL("app/components/AuditTrail.tsx",root),"utf8");
  assert.match(page,/auth.role==="admin"/);
  assert.match(page,/Audit Trail/);
  assert.match(page,/operatingConditions:submittedInputs/);
  assert.doesNotMatch(page,/setTimeout\(resolve,6500\)|setAnalysisStage/);
  for(const label of ["Run test 1","Run test 2","Test null rejection","Run comparison","Retrievable audit records"])assert.ok(audit.includes(label));
  assert.match(audit,/Independent measured-plant validation remains outstanding/);
  const manifest=JSON.parse(await readFile(new URL("app/lib/model-build.json",root),"utf8"));
  assert.match(manifest.sourceHash,/^sha256:[a-f0-9]{64}$/);
  await access(new URL(".next/BUILD_ID",root));
  await access(new URL("public/og.png",root));
});
