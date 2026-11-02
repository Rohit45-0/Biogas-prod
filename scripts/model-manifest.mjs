import fs from "node:fs/promises";
import {createHash} from "node:crypto";
// Source identity must survive Windows checkouts and Linux deployment builds.
// Keep JSON artifact hashes byte-exact, including the archived model registry.
const sourceHash=async file=>createHash("sha256").update(file.endsWith(".json")?await fs.readFile(file):(await fs.readFile(file,"utf8")).replace(/\r\n/g,"\n")).digest("hex");
const files=["app/lib/model.ts","app/lib/inputs.ts","app/lib/system.ts","app/lib/reference-data.ts","app/lib/domain.ts","app/lib/hrt.ts"];
const hashes={};
for(const file of files)hashes[file]=await sourceHash(file);
await fs.writeFile("app/lib/model-build.json",JSON.stringify({sourceHash:`sha256:${createHash("sha256").update(JSON.stringify(hashes)).digest("hex")}`,files:hashes},null,2)+"\n");
const trainedFiles=["app/lib/ml-contract.ts","app/lib/ml-runtime.ts","app/lib/ml-execution.ts","app/lib/ml-manifest.ts","app/lib/inputs.ts","app/lib/reference-data.ts","app/lib/domain.ts","app/api/ml/predict/route.ts","app/api/ml/verify/route.ts","ai-workflow/models/onnx/manifest.json"];
const trainedHashes={};
for(const file of trainedFiles)trainedHashes[file]=await sourceHash(file);
const registry=JSON.parse(await fs.readFile("ai-workflow/models/onnx/manifest.json","utf8"));
for(const model of Object.values(registry.models)){
  const bytes=await fs.readFile(`ai-workflow/models/onnx/${model.filename}`);
  if(`sha256:${createHash("sha256").update(bytes).digest("hex")}`!==model.artifactHash)throw new Error(`Model artifact hash mismatch: ${model.filename}`);
}
await fs.writeFile("app/lib/trained-build.json",JSON.stringify({sourceHash:`sha256:${createHash("sha256").update(JSON.stringify(trainedHashes)).digest("hex")}`,files:trainedHashes},null,2)+"\n");
const researchFiles=["app/lib/hrt-research.ts","app/lib/hrt-research-execution.ts","app/lib/hrt.ts","app/api/research/hrt/route.ts","app/api/research/hrt/verify/route.ts","ai-workflow/research/hours-model.json","ai-workflow/research/hours-data.json"];
const researchHashes={};
for(const file of researchFiles)researchHashes[file]=await sourceHash(file);
await fs.writeFile("app/lib/research-build.json",JSON.stringify({sourceHash:`sha256:${createHash("sha256").update(JSON.stringify(researchHashes)).digest("hex")}`,files:researchHashes},null,2)+"\n");
