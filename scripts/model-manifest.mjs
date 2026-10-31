import fs from "node:fs/promises";
import {createHash} from "node:crypto";
const files=["app/lib/model.ts","app/lib/inputs.ts","app/lib/system.ts","app/lib/reference-data.ts","app/lib/domain.ts","app/lib/hrt.ts"];
const hashes={};
for(const file of files)hashes[file]=createHash("sha256").update(await fs.readFile(file)).digest("hex");
await fs.writeFile("app/lib/model-build.json",JSON.stringify({sourceHash:`sha256:${createHash("sha256").update(JSON.stringify(hashes)).digest("hex")}`,files:hashes},null,2)+"\n");
const trainedFiles=["app/lib/ml-contract.ts","app/lib/ml-runtime.ts","app/lib/ml-execution.ts","app/lib/ml-manifest.ts","app/lib/inputs.ts","app/lib/reference-data.ts","app/lib/domain.ts","app/api/ml/predict/route.ts","app/api/ml/verify/route.ts","ai-workflow/models/onnx/manifest.json"];
const trainedHashes={};
for(const file of trainedFiles)trainedHashes[file]=createHash("sha256").update(await fs.readFile(file)).digest("hex");
const registry=JSON.parse(await fs.readFile("ai-workflow/models/onnx/manifest.json","utf8"));
for(const model of Object.values(registry.models)){
  const bytes=await fs.readFile(`ai-workflow/models/onnx/${model.filename}`);
  if(`sha256:${createHash("sha256").update(bytes).digest("hex")}`!==model.artifactHash)throw new Error(`Model artifact hash mismatch: ${model.filename}`);
}
await fs.writeFile("app/lib/trained-build.json",JSON.stringify({sourceHash:`sha256:${createHash("sha256").update(JSON.stringify(trainedHashes)).digest("hex")}`,files:trainedHashes},null,2)+"\n");
