import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const base = process.env.AUDIT_BASE_URL || "https://aquaivolt-command-center.vercel.app";
const username = process.env.AQUA_ADMIN_USERNAME || "admin";
const password = process.env.AQUA_ADMIN_PASSWORD || process.env.DASH_PASSWORD;
assert(password, "Supply the Admin password through the environment");
const out = path.resolve("test-results/audit-release");
await mkdir(out, { recursive: true });
let cookie = "";
async function call(route, body) {
  const response = await fetch(base + route, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(60000),
  });
  const data = await response.json();
  return { response, data, status: response.status };
}
async function login() {
  const result = await call("/api/auth/login", { username, password });
  assert.equal(result.status, 200, "Admin login failed");
  cookie = result.response.headers.get("set-cookie").split(";")[0];
}
await login();
const setup = await call("/api/audit/tests");
assert.equal(setup.status, 200);
assert.equal(setup.data.storage.available, true);
assert.equal(setup.data.storage.provider, "vercel-private-blob");
const ml = await call("/api/ml/predict");
assert.equal(ml.status, 200);
assert.equal(ml.data.status, "LOADED");
assert.equal(ml.data.manifest.domainPolicy.uncertainty.status, "NOT_CALIBRATED");
const artifacts = JSON.parse(await readFile("ai-workflow/models/onnx/manifest.json", "utf8"));
for (const [id, artifact] of Object.entries(artifacts.models)) {
  assert.equal(ml.data.manifest.models[id].artifactHash, artifact.artifactHash);
}
const inputs = setup.data.profiles[0].inputs;
const predicted = await call("/api/ml/predict", { operatingConditions: { ...inputs, ph: 11 } });
assert.equal(predicted.status, 200);
assert.equal(predicted.data.audit.saved, true);
assert.equal(predicted.data.domainAssessment.uncertainty.status, "NOT_CALIBRATED");
assert(predicted.data.domainAssessment.warnings.some(w => /pH 11/.test(w)));
const runId = predicted.data.runId;
const verification = await call("/api/ml/verify", { runId });
assert.equal(verification.status, 200);
assert.equal(verification.data.status, "PASS");
assert.equal(verification.data.saved, true);
const pages = [], ids = new Set();
let cursor, total, previous;
do {
  const page = await call(`/api/audit?limit=10${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
  assert.equal(page.status, 200);
  total ??= page.data.total;
  assert.equal(page.data.total, total, "Pagination snapshot changed");
  for (const row of page.data.runs) {
    assert(!ids.has(row.id), "Duplicate listed record");
    if (previous) assert(previous.storedAt > row.storedAt || (previous.storedAt === row.storedAt && previous.id > row.id), "Record order is not globally newest-first");
    ids.add(row.id); previous = row;
  }
  pages.push({ count: page.data.runs.length, hasMore: page.data.hasMore });
  cursor = page.data.cursor;
  assert.equal(Boolean(cursor), page.data.hasMore);
  assert(pages.length <= 1000, "Pagination did not terminate");
} while (cursor);
assert.equal(ids.size, total);
assert(ids.has(runId) && ids.has(verification.data.reportId), "New records are missing from the list");
const exported = await call(`/api/audit?runId=${runId}&format=json`);
assert.equal(exported.status, 200);
assert.equal(exported.data.integrity, true);
assert.equal(exported.data.authentication.type, "SERVER_AUTHENTICATED");
assert.equal(exported.data.authentication.independentlyVerifiable, false);
assert.equal((await call("/api/auth/logout", {})).status, 200);
cookie = "";
assert.equal((await call("/api/audit")).status, 401);
await login();
const retrieved = await call(`/api/audit?runId=${runId}`);
assert.equal(retrieved.status, 200);
assert.equal(retrieved.data.integrity, true);
assert((await call("/api/audit?limit=10")).data.runs.some(r => r.id === runId));
const protocol = await call("/api/validation");
assert.equal(protocol.status, 200);
assert.equal(protocol.data.status, "INDEPENDENT_PLANT_VALIDATION_PENDING");
const invalid = await call("/api/ml/predict", { operatingConditions: { ...inputs, ph: null } });
assert.equal(invalid.status, 422);
const summary = {
  status: "PASS", checkedAt: new Date().toISOString(), base,
  deployment: predicted.data.deployment, modelManifestHash: predicted.data.manifestHash,
  modelSourceHash: ml.data.manifest.sourceHash, storage: setup.data.storage.provider,
  runId, verificationId: verification.data.reportId, verificationChecks: verification.data.checks.length,
  listedRecords: total, listPages: pages.length,
  checks: ["private Blob availability", "unchanged trained artifacts", "pH 11 warning and uncalibrated uncertainty", "saved prediction and replay", "global pagination without duplicates or omissions", "server-authenticated JSON", "record retrieval and listing after a new login", "null input rejected", "plant validation remains pending"],
  scope: "Production software checks only. No plant measurement records were created.",
};
await writeFile(path.join(out, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
