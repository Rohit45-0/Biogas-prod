import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("builds the simplified before-and-after production dashboard", async () => {
  const [page, predictionRoute, evaluationRoute, evaluation, evaluationManifest, layout, hosting, batchRoute, batchEngine, batchInputs] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/api/predict/route.ts", root), "utf8"),
    readFile(new URL("app/api/evaluation/route.ts", root), "utf8"),
    readFile(new URL("app/lib/evaluation.ts", root), "utf8"),
    readFile(new URL("app/lib/model-evaluation.generated.json", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL(".openai/hosting.json", root), "utf8"),
    readFile(new URL("app/api/reports/batch/route.ts", root), "utf8"),
    readFile(new URL("app/lib/batch-reports.ts", root), "utf8"),
    readFile(new URL("app/lib/short-hrt-batch-inputs.generated.ts", root), "utf8"),
  ]);

  assert.match(page, /AQUAIVOLT/);
  assert.match(page, /Only real quantities: before, after and the extra amount/);
  assert.match(page, /before and after/);
  assert.match(page, /Methane/);
  assert.match(page, /Electricity/);
  assert.match(page, /All five fields below are used by the trained 2–24 hour HRT model/);
  assert.match(page, /2–24 hour HRT model/);
  assert.match(page, /No placeholder numbers are shown/);
  assert.match(page, /Nothing runs until you click Calculate/);
  assert.match(page, /Supported ranges:/);
  assert.match(page, /Virtual monitoring/);
  assert.match(page, /SIMULATED ONLINE READING/);
  assert.match(page, /Run Calculate production to populate the virtual monitoring screen/);
  assert.match(page, /Wastewater tank/);
  assert.match(page, /Gas and energy/);
  assert.match(page, /m³ CH₄\/day/);
  assert.match(page, /Production details are waiting/);
  assert.match(page, /Choose what you want to understand/);
  assert.match(page, /PRODUCTION BOARD/);
  assert.match(page, /WHAT THIS RESULT MEANS/);
  assert.match(page, /key plant values are close to the modeled target/);
  assert.match(page, /CLIENT PRODUCTION VIEW/);
  assert.match(page, /TOP POTENTIAL/);
  assert.match(page, /LEAST POTENTIAL/);
  assert.match(page, /DISTANCE TO MODELED TARGET/);
  assert.match(page, /PRODUCTION CENTER/);
  assert.match(page, /Yield Optimization Dashboard/);
  assert.match(page, /dedicated view for/);
  assert.match(page, /Try plant conditions/);
  assert.match(page, /Retention time vs/);
  assert.match(page, /pH vs/);
  assert.match(page, /DYNAMIC VISUALIZATIONS/);
  assert.match(page, /No placeholder curve is shown/);
  assert.match(page, /Current-condition forecast/);
  assert.match(page, /AI Analysis Center/);
  assert.match(page, /LIVE LANGGRAPH \+ MODEL WORKFLOW/);
  assert.match(page, /Production prediction workflow/);
  assert.match(page, /Search lower-HRT scenarios/);
  assert.match(page, /Completed backend workflow/);
  assert.match(page, /Click any node to inspect its returned evidence/);
  assert.match(page, /What the model did with this run/);
  assert.match(page, /Which plant values moved the model most/);
  assert.match(page, /No random result values are displayed/);
  assert.match(page, /AI RECOMMENDATION READY/);
  assert.match(page, /How to increase biogas in the next simulation/);
  assert.match(page, /Apply recommendations & simulate again/);
  assert.match(page, /Model and AI audit center/);
  assert.match(page, /Run the actual backend in front of the auditor/);
  assert.match(page, /DOWNLOADABLE AUDIT EVIDENCE/);
  assert.match(page, /KPI reports/);
  assert.match(page, /Dashboard calculations are saved as/);
  assert.match(page, /Dataset facts shown honestly/);
  assert.match(page, /Run ID in the interface and execution ID in the server trace are the same/);
  assert.match(predictionRoute, /predictShortHrt/);
  assert.match(predictionRoute, /modelCurves/);
  assert.match(predictionRoute, /inputSensitivity/);
  assert.match(predictionRoute, /recommendedProjection/);
  assert.match(predictionRoute, /runAgentWorkflow/);
  assert.match(predictionRoute, /recordKpiObservation/);
  assert.match(predictionRoute, /const low=predictShortHrt/);
  assert.match(predictionRoute, /const high=predictShortHrt/);
  assert.match(predictionRoute, /one submitted plant value is swept while the other four remain fixed/);
  assert.match(evaluationRoute, /manifestFingerprint/);
  assert.match(evaluationRoute, /Admin access required/);
  assert.match(evaluation, /5-fold cross-validation/);
  assert.match(evaluation, /model-evaluation\.generated\.json/);
  assert.match(evaluationManifest, /HistGradientBoosting/);
  assert.match(evaluationManifest, /XGBoost/);
  assert.match(evaluationManifest, /Ridge regression with quadratic features/);
  assert.match(page, /Best modeled conditions/);
  assert.match(page, /Plant values needing attention/);
  assert.match(page, /Current vs target/i);
  assert.match(page, /Everything here belongs to the latest completed calculation/);
  assert.doesNotMatch(page, /Optimization Gain|Scenario Coverage|Overall Benefit|Prototype Readiness|6-METRIC|Readiness Score/);
  assert.doesNotMatch(page, /outside the normal model range|Check highlighted values|issues\.length>0/);
  assert.match(layout, /Aquaivolt AI Biogas Command Center/);
  assert.equal(JSON.parse(hosting).d1, "DB");
  assert.match(page, /Farm biodigester AI report/);
  assert.match(page, /2–24 hour HRT model/);
  assert.match(page, /Run AI from online reading/);
  assert.match(page, /ONLINE READING/);
  assert.match(page, /Enter the current digester condition/);
  assert.match(page, /AI Biogas 10 Run Dataset/);
  assert.match(page, /not real calendar observations/);
  assert.match(page, /PAUSED AUDITOR VIEW/);
  assert.match(page, /AI model outputs/);
  assert.match(page, /SIX MODELLED KPI OUTPUTS/);
  assert.match(page, /DAILY AI MODEL OUTPUT/);
  assert.match(page, /12 MODELLED MONTHS/);
  assert.match(page, /Approve AI action/);
  assert.match(page, /Export 12-month comparison/);
  assert.doesNotMatch(page, /500 × 4/);
  assert.match(batchRoute, /short_hrt_batch/);
  assert.match(batchRoute, /Prepare AI candidate values/);
  assert.match(batchRoute, /format.*daily/);
  assert.match(batchEngine, /shortHrtBatchInputs\.length\*batchProfiles\.length/);
  assert.match(batchEngine, /batchProjectionCsv/);
  assert.match(batchEngine, /batchDailyProjectionCsv/);
  assert.match(batchEngine, /modelledDailyProjection/);
  assert.match(batchEngine, /modelledMonthlyProjection/);
  assert.match(batchEngine, /Biogas Increase \(%\)/);
  assert.match(batchEngine, /CH₄ Content \(%\)/);
  assert.equal((batchInputs.match(/^  \{sourceId:/gm) || []).length, 500);
  await access(new URL("app/api/model/route.ts", root));
});

test("packages the Vercel-compatible Next.js application and social card", async () => {
  await Promise.all([
    access(new URL(".next/BUILD_ID", root)),
    access(new URL(".next/server/app/page.js", root)),
    access(new URL("public/og.png", root)),
  ]);
});
