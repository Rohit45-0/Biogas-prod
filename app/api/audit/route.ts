import { NextResponse } from "next/server";
import { getSession } from "../../lib/auth";
import { auditStoreReady, listSimulations } from "../../lib/audit";

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const session = await getSession(request);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const url = new URL(request.url);
  const rows = await listSimulations(Number(url.searchParams.get("limit") ?? 50));
  if (url.searchParams.get("format") === "csv") {
    const header = ["run_id","timestamp","operator","role","feedstock","model_version","inputs_json","outputs_json"];
    const csv = [header.join(","), ...rows.map((row) => [row.id, new Date(Number(row.created_at)).toISOString(), row.username,
      row.role, row.feedstock, row.model_version, row.inputs_json, row.outputs_json].map(csvCell).join(","))].join("\n");
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=aquaivolt-audit-log.csv" } });
  }
  return NextResponse.json({
    persistence: (await auditStoreReady()) ? "supabase" : "volatile",
    runs: rows.map((row) => ({ ...row, inputs: JSON.parse(String(row.inputs_json)), outputs: JSON.parse(String(row.outputs_json)) })),
  });
}
