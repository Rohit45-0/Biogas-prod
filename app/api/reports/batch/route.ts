import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";
import { batchReportStoreReady, getBatchReport, listBatchReports, recordBatchReport } from "../../../lib/audit";
import { batchCsv, batchDailyProjectionCsv, batchProjectionCsv, generateBatchReport, type BatchDefinition } from "../../../lib/batch-reports";
import { modelMetadata } from "../../../lib/system";

export const maxDuration = 30;

function safeDefinition(value:unknown): Partial<BatchDefinition> {
  const input = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const cohort = input.cohort === "hours_research" || input.cohort === "under_6_hours" || input.cohort === "short_hrt_batch" ? input.cohort : "farm_optimization";
  const baseInput = typeof input.baseInput === "object" && input.baseInput !== null ? input.baseInput as BatchDefinition["baseInput"] : undefined;
  const shortHrtInput = typeof input.shortHrtInput === "object" && input.shortHrtInput !== null ? input.shortHrtInput as NonNullable<BatchDefinition["shortHrtInput"]> : undefined;
  return { rowCount: cohort === "short_hrt_batch" ? 2000 : input.rowCount === 10000 ? 10000 : 1000, cohort, baseInput, shortHrtInput };
}

export async function GET(request:Request) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Sign in to access the online-reading AI report" }, { status: 403 });
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id && (url.searchParams.get("format") === "csv" || url.searchParams.get("format") === "projection" || url.searchParams.get("format") === "daily")) {
    const stored = await getBatchReport(id);
    if (!stored) return NextResponse.json({ error: "AI report not found" }, { status: 404 });
    const definition = safeDefinition(JSON.parse(stored.definition_json));
    const report = generateBatchReport(definition);
    if (url.searchParams.get("format") === "projection") {
      if (!report.summary.projection) return NextResponse.json({ error: "This report does not include an online-reading projection" }, { status: 400 });
      return new Response(batchProjectionCsv(report.summary.projection), { headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=aquaivolt-modelled-12-month-baseline-vs-ai-${stored.id.slice(0,8)}.csv`,
      } });
    }
    if (url.searchParams.get("format") === "daily") {
      if (!report.summary.projection) return NextResponse.json({ error: "This report does not include a daily projection" }, { status: 400 });
      return new Response(batchDailyProjectionCsv(report.summary.projection), { headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=aquaivolt-modelled-daily-baseline-vs-ai-${stored.id.slice(0,8)}.csv`,
      } });
    }
    return new Response(batchCsv(report.rows), { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=aquaivolt-${stored.cohort}-${stored.row_count}-scenario-report.csv`,
    } });
  }
  const reports = await listBatchReports(Number(url.searchParams.get("limit") ?? 8));
  return NextResponse.json({
    persistence: (await batchReportStoreReady()) ? "supabase" : "volatile",
    reports: reports.map((report) => ({ ...report, definition: JSON.parse(report.definition_json), summary: JSON.parse(report.summary_json) })),
  });
}

export async function POST(request:Request) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Sign in to generate the online-reading AI report" }, { status: 403 });
  const report = generateBatchReport(safeDefinition(await request.json()));
  const id = crypto.randomUUID();
  const persisted = await recordBatchReport({
    id, username: session.username, role: session.role, cohort: report.definition.cohort, rowCount: report.definition.rowCount,
    definition: report.definition, summary: report.summary, modelVersion: modelMetadata.version,
  });
  return NextResponse.json({
    id, createdAt: new Date().toISOString(), persisted, persistence: persisted ? "supabase" : "volatile",
    definition: report.definition, summary: report.summary, preview: report.rows.slice(0, 12),
    workflow: report.definition.cohort === "short_hrt_batch" ? [
      { label:"Read online operating conditions", detail:"Supplied short-HRT operating rows are read for the online-reading model; workbook output columns are excluded from runtime inference." },
      { label:"Validate plant values", detail:"Five model features checked for every operating row: feed rate, temperature, pH, OLR and HRT in hours." },
      { label:"Prepare AI candidate values", detail:"Deterministic bounded candidate setpoints are built from the supplied operating features." },
      { label:"Run trained production model", detail:"The deployed short-HRT Ridge model evaluates all 2,000 candidates without reading workbook output values." },
      { label:"Calculate six output metrics", detail:"Biogas, methane, electricity and after-filter H₂S are model outputs; H₂S removal and CO₂e avoided are labelled derived estimates." },
      { label:"Rank and recommend", detail:"Candidates are ranked by modelled production and HRT-aware score; recommendations remain advisory until an operator approves them." },
      { label:"Build daily and monthly reports", detail:"A daily drill-down and 12 labelled 30-day model periods are calculated for export; the online reading has no calendar timestamps." },
    ] : [],
    notes: [report.definition.cohort === "short_hrt_batch" ? "2,000 rows are new model-derived candidates generated from supplied online operating conditions; workbook target/output cells are not used at inference time." : report.definition.cohort === "hours_research" ? "Each row is a separate execution of the deployed five-value, 2–24-hour trained Ridge model; no random number generator is used." : "Each row is a separate deterministic call to the deployed nine-value inference function; no random number generator is used.", report.summary.sourceNote, report.summary.safetyNote],
  });
}
