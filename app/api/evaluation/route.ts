import { NextResponse } from "next/server";
import { getSession } from "../../lib/auth";
import { evaluationEvidence } from "../../lib/evaluation";

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function GET(request: Request) {
  const session = await getSession(request);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const serialized = JSON.stringify(evaluationEvidence);
  const manifestFingerprint = `sha256:${hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized)))}`;
  return NextResponse.json(
    {
      ...evaluationEvidence,
      manifestFingerprint,
      liveEvidence: {
        inferenceEndpoint: "POST /api/predict",
        modelCardEndpoint: "GET /api/model",
        evaluationEndpoint: "GET /api/evaluation",
        auditEndpoint: "GET /api/audit",
        kpiReportEndpoint: "GET/POST /api/reports/kpi",
        implementation: "LangGraph StateGraph orchestration + exported TypeScript Ridge inference",
        deterministic: true,
      },
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
