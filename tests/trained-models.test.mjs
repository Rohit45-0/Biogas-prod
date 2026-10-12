import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {InferenceSession,Tensor} from "onnxruntime-node";

const root=new URL("../",import.meta.url);
const registry=JSON.parse(await readFile(new URL("ai-workflow/models/onnx/manifest.json",root),"utf8"));
const fixture=JSON.parse(await readFile(new URL("tests/fixtures/trained-model-parity.json",root),"utf8"));
for(const [id,model] of Object.entries(registry.models)){
  test(`${model.name}: native Node predictions match original sklearn pipeline on ${fixture.cases.length} cases`,async t=>{
    const source=await readFile(new URL(model.sourceArtifact,root));
    assert.equal("sha256:"+createHash("sha256").update(source).digest("hex"),model.sourceArtifactHash);
    const bytes=await readFile(new URL("ai-workflow/models/onnx/"+model.filename,root));
    assert.equal("sha256:"+createHash("sha256").update(bytes).digest("hex"),model.artifactHash);
    const session=await InferenceSession.create(bytes,{executionProviders:["cpu"],intraOpNumThreads:1,interOpNumThreads:1,graphOptimizationLevel:"basic"});t.after(()=>session.release());
    const feeds={};
    for(const feature of model.features){
      const values=fixture.cases.map(row=>row[feature.key]);
      feeds[feature.tensor]=feature.type==="string"?new Tensor("string",values,[values.length,1]):new Tensor("float64",new Float64Array(values),[values.length,1]);
    }
    const output=(await session.run(feeds))[model.outputName];
    assert.equal(output.data.length,fixture.cases.length*3);
    let largest=0;
    fixture.expected[id].forEach((values,row)=>values.forEach((expected,column)=>{
      const actual=Number(output.data[row*3+column]);const error=Math.abs(actual-expected);largest=Math.max(largest,error);
      assert.ok(error<=registry.parityTolerance.absolute+registry.parityTolerance.relative*Math.abs(expected),`${id}, row ${row}, column ${column}: ${actual} vs ${expected}`);
    }));
    t.diagnostic(`Maximum absolute error: ${largest}`);
    assert.ok(model.contextOnly.includes("feedRate"));
    assert.equal(model.trainedFeatureCount,id==="ridge"?8:6);
  });
}
