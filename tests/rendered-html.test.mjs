import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("builds the simplified before-and-after production dashboard", async () => {
  const [page, predictionRoute, evaluationRoute, evaluation, layout, hosting] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/api/predict/route.ts", root), "utf8"),
    readFile(new URL("app/api/evaluation/route.ts", root), "utf8"),
    readFile(new URL("app/lib/evaluation.ts", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL(".openai/hosting.json", root), "utf8"),
  ]);

  assert.match(page, /Biogas production dashboard/);
  assert.match(page, /Only real quantities: before, after and the extra amount/);
  assert.match(page, /before and after/);
  assert.match(page, /Methane/);
  assert.match(page, /Electricity/);
  assert.match(page, /Every field below is used by the calculation/);
  assert.match(page, /Hour-scale sheets are research projections/);
  assert.match(page, /No placeholder numbers are shown/);
  assert.match(page, /Nothing runs until you click Calculate/);
  assert.match(page, /Values beyond the supplied rows are estimated from the nearest data patterns/);
  assert.match(page, /Virtual monitoring/);
  assert.match(page, /NO PHYSICAL DEVICE CONNECTED/);
  assert.match(page, /Run Calculate production to populate the virtual monitoring screen/);
  assert.match(page, /Wastewater tank/);
  assert.match(page, /Gas and energy/);
  assert.match(page, /m³ CH₄\/day/);
  assert.match(page, /Production details are waiting/);
  assert.match(page, /Choose what you want to understand/);
  assert.match(page, /PRODUCTION BOARD/);
  assert.match(page, /WHAT THIS RESULT MEANS/);
  assert.match(page, /key inputs are close to the modeled target/);
  assert.match(page, /CLIENT PRODUCTION VIEW/);
  assert.match(page, /TOP POTENTIAL/);
  assert.match(page, /LEAST POTENTIAL/);
  assert.match(page, /DISTANCE TO MODELED TARGET/);
  assert.match(page, /AQUAIVOLT PRODUCTION CENTER/);
  assert.match(page, /Yield Optimization Dashboard/);
  assert.match(page, /dedicated view for/);
  assert.match(page, /Try plant conditions/);
  assert.match(page, /Retention time vs/);
  assert.match(page, /pH vs/);
  assert.match(page, /DYNAMIC VISUALIZATIONS/);
  assert.match(page, /No placeholder curve is shown/);
  assert.match(page, /Current-input forecast/);
  assert.match(page, /AI Analysis Center/);
  assert.match(page, /LIVE MODEL \+ AGENT WORKFLOW/);
  assert.match(page, /Production prediction workflow/);
  assert.match(page, /Search better setpoints/);
  assert.match(page, /Completed backend workflow/);
  assert.match(page, /Click any node to inspect its returned evidence/);
  assert.match(page, /What the model did with this run/);
  assert.match(page, /Which inputs moved the model most/);
  assert.match(page, /No random result values are displayed/);
  assert.match(page, /AI RECOMMENDATION READY/);
  assert.match(page, /How to increase biogas in the next simulation/);
  assert.match(page, /Apply recommendations & simulate again/);
  assert.match(page, /Model and AI audit center/);
  assert.match(page, /Run the actual backend in front of the auditor/);
  assert.match(page, /DOWNLOADABLE AUDIT EVIDENCE/);
  assert.match(page, /It does not claim independent field validation/);
  assert.match(page, /Run ID in the interface and execution ID in the server trace are the same/);
  assert.match(predictionRoute, /function inferCore/);
  assert.match(predictionRoute, /modelCurves/);
  assert.match(predictionRoute, /inputSensitivity/);
  assert.match(predictionRoute, /recommendedProjection/);
  assert.match(predictionRoute, /lowerBiogas/);
  assert.match(predictionRoute, /upperBiogas/);
  assert.match(predictionRoute, /one input is swept while the other eight submitted inputs remain fixed/);
  assert.match(evaluationRoute, /manifestFingerprint/);
  assert.match(evaluationRoute, /Admin access required/);
  assert.match(evaluation, /Gradient boosting/);
  assert.match(evaluation, /Small multilayer perceptron neural network/);
  assert.match(evaluation, /deployedModelNmae: 0\.637/);
  assert.match(page, /Best modeled conditions/);
  assert.match(page, /Inputs needing attention/);
  assert.match(page, /Current vs target/i);
  assert.match(page, /Everything here belongs to the latest completed calculation/);
  assert.doesNotMatch(page, /Optimization Gain|Scenario Coverage|Overall Benefit|Prototype Readiness|6-METRIC|Readiness Score/);
  assert.doesNotMatch(page, /outside the normal model range|Check highlighted values|issues\.length>0/);
  assert.match(layout, /Aquaivolt AI Biogas Command Center/);
  assert.equal(JSON.parse(hosting).d1, "DB");
  await access(new URL("app/api/model/route.ts", root));
});

test("packages the Vercel-compatible Next.js application and social card", async () => {
  await Promise.all([
    access(new URL(".next/BUILD_ID", root)),
    access(new URL(".next/server/app/page.js", root)),
    access(new URL("public/og.png", root)),
  ]);
});
