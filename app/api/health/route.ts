import { NextResponse } from "next/server";
import { authConfigured, getSession } from "../../lib/auth";
import { knowledgeChunks } from "../../lib/knowledge";
import { modelMetadata } from "../../lib/system";
import { auditStoreReady } from "../../lib/audit";

export async function GET(request: Request) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workbookSources = new Set(knowledgeChunks.map((chunk) => chunk.source).filter((source) => source.toLowerCase().endsWith(".xlsx")));
  const auditReady = await auditStoreReady();
  const checks = [
    { key: "api", label: "Cloud API", ready: true, weight: 10 },
    { key: "model", label: "Scenario model", ready: true, weight: 20 },
    { key: "rag", label: "Semantic RAG", ready: Boolean(process.env.OPENAI_API_KEY), weight: 15 },
    { key: "auth", label: "Role access", ready: authConfigured(), weight: 15 },
    { key: "knowledge", label: "Knowledge index", ready: knowledgeChunks.length > 0, weight: 10 },
    { key: "audit", label: "Persistent audit store", ready: auditReady, weight: 10 },
    { key: "validation", label: "Live-plant validation", ready: false, weight: 10 },
    { key: "iot", label: "IoT streaming", ready: false, weight: 10 },
  ];
  const readiness = checks.reduce((total, check) => total + (check.ready ? check.weight : 0), 0);
  return NextResponse.json({
    status: "online",
    checkedAt: new Date().toISOString(),
    readiness,
    readyChecks: checks.filter((check) => check.ready).length,
    totalChecks: checks.length,
    checks,
    services: { api: "online", model: "online", rag: process.env.OPENAI_API_KEY ? "semantic" : "keyword", auth: authConfigured() ? "protected" : "unconfigured", audit: auditReady ? "persistent" : "unavailable" },
    knowledge: { workbooks: workbookSources.size, chunks: knowledgeChunks.length },
    model: modelMetadata,
    session: { username: session.username, role: session.role },
  });
}
