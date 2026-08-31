import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("builds the data-backed SCADA operations dashboard", async () => {
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
  assert.match(page, /AI Wastewater-to-Energy Command Center/);
  assert.match(page, /MODEL ONLINE/);
  assert.match(page, /PLC NOT CONNECTED/);
  assert.match(page, /AI SUPERVISED OPTIMIZATION/);
  assert.match(page, /Baseline vs AI/);
  assert.match(page, /Baseline \/ no AI/);
  assert.match(page, /AI optimized/);
  assert.match(page, /Process Stability/);
  assert.match(page, /AI Optimizer/);
  assert.match(page, /Expected Gains/);
  assert.match(page, /Why AI Changed It/);
  assert.match(page, /Energy Optimization/);
  assert.match(page, /AI Model Health/);
  assert.match(page, /Recent AI Actions/);
  assert.match(page, /AI SCENARIOS/);
  assert.match(page, /Saved report history/);
  assert.match(page, /Full recommendation and all scenario evidence are in Reports/);
  assert.match(page, /Biogas Production Optimization Dashboard/);
  assert.match(page, /AI vs Baseline Biogas Performance/);
  assert.match(page, /Online Biogas Feed/);
  assert.match(page, /Approve AI setpoints/);
  assert.match(page, /RUN AI OPTIMIZATION/);
  assert.match(page, /2,000 new deterministic optimization calculations/);
  assert.match(page, /Biogas Production Optimization Dashboard/);
  assert.match(page, /Methane Yield Optimization Dashboard/);
  assert.match(page, /Electricity Output Optimization Dashboard/);
  assert.match(page, /AI vs Baseline Electricity Performance/);
  assert.match(page, /Estimated CO₂e avoided/);
  assert.match(page, /No electrical telemetry is connected/);
  assert.match(page, /Generator sensors/);
  assert.match(page, /electricity-dashboard-exact/);
  assert.match(page, /Workbook AI Optimization/);
  assert.match(page, /Supplied short-HRT research workbook/);
  assert.match(page, /Model baseline vs AI-optimized/);
  assert.match(page, /Export all 2,000 scenarios/);
  assert.match(page, /The workbook supplies operating conditions/);
  assert.match(page, /Physical IoT\/PLC telemetry is not connected/);
  assert.match(page, /m³ CH₄\/day/);
  assert.match(page, /Quadratic Ridge/);
  assert.match(page, /LangGraph/);
  assert.match(page, /No fabricated hardware alerts/);
  assert.match(page, /Calculated AI scenario evidence/);
  assert.match(page, /Operator approval required/);
  assert.match(page, /daily\?\.optimizedBiogasM3Day/);
  assert.match(page, /daily\?\.optimizedMethaneM3Day/);
  assert.match(page, /daily\?\.optimizedElectricityKwhDay/);
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
  assert.match(layout, /Aquaivolt AI Biogas Command Center/);
  assert.equal(JSON.parse(hosting).d1, "DB");
  assert.match(page, /AI \+ KPI REPORT/);
  assert.match(page, /Export 12-month comparison/);
  assert.match(page, /PAUSED AUDITOR VIEW/);
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
