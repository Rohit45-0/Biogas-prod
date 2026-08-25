export type ThresholdSettings = {
  methaneMinimum: number;
  h2sWarning: number;
  oxygenMaximum: number;
  pressureMinimum: number;
  pressureMaximum: number;
  facilityName: string;
  facilityLocation: string;
};

export type StoredSimulation = {
  id: string; created_at: number; username: string; role: string; feedstock: string;
  inputs_json: string; outputs_json: string; model_version: string; audit_status: string;
};

export type StoredBatchReport = {
  id: string; created_at: number; username: string; role: string; cohort: string; row_count: number;
  definition_json: string; summary_json: string; model_version: string; audit_status: string;
};

/** A point-in-time KPI record. `modelled_prediction` is intentionally kept
 * separate from `csv_import`: dashboard calculations must never be presented
 * as real meter readings. */
export type StoredKpiObservation = {
  id:string; observed_at:number; source:"modelled_prediction"|"csv_import"; digester_id:string;
  run_id:string|null; biogas_m3_day:number; methane_m3_day:number; electricity_kwh_day:number;
  methane_pct:number; co2_pct:number; h2s_ppm:number; metadata_json:string; created_by:string;
};

export const defaultThresholds: ThresholdSettings = {
  methaneMinimum: 55,
  h2sWarning: 500,
  oxygenMaximum: 2,
  pressureMinimum: 12,
  pressureMaximum: 30,
  facilityName: "Aquaivolt Demonstration Plant",
  facilityLocation: "Lebanon · location pending",
};

type PortableAuditStore = { settings: ThresholdSettings; runs: StoredSimulation[]; batchReports: StoredBatchReport[]; kpiObservations: StoredKpiObservation[] };
type AquaGlobal = typeof globalThis & { __aquaAuditStore?: PortableAuditStore };
type SupabaseRun = { id: string; created_at: string; username: string; role: string; feedstock: string; inputs_json: unknown; outputs_json: unknown; model_version: string; audit_status: string };
type SupabaseBatchReport = { id: string; created_at: string; username: string; role: string; cohort: string; row_count: number; definition_json: unknown; summary_json: unknown; model_version: string; audit_status: string };
type SupabaseKpiObservation = { id:string; observed_at:string; source:"modelled_prediction"|"csv_import"; digester_id:string; run_id:string|null; biogas_m3_day:number; methane_m3_day:number; electricity_kwh_day:number; methane_pct:number; co2_pct:number; h2s_ppm:number; metadata_json:unknown; created_by:string };
type SupabaseSettings = { id: number; methane_minimum: number; h2s_warning: number; oxygen_maximum: number; pressure_minimum: number; pressure_maximum: number; facility_name: string; facility_location: string };

function memoryStore() {
  const root = globalThis as AquaGlobal;
  root.__aquaAuditStore ??= { settings: { ...defaultThresholds }, runs: [], batchReports: [], kpiObservations: [] };
  root.__aquaAuditStore.batchReports ??= [];
  root.__aquaAuditStore.kpiObservations ??= [];
  return root.__aquaAuditStore;
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

function jsonText(value: unknown) { return typeof value === "string" ? value : JSON.stringify(value ?? {}); }

function mapRun(row: SupabaseRun): StoredSimulation {
  return { id: row.id, created_at: new Date(row.created_at).getTime(), username: row.username, role: row.role, feedstock: row.feedstock,
    inputs_json: jsonText(row.inputs_json), outputs_json: jsonText(row.outputs_json), model_version: row.model_version, audit_status: row.audit_status };
}

function mapBatchReport(row: SupabaseBatchReport): StoredBatchReport {
  return { id: row.id, created_at: new Date(row.created_at).getTime(), username: row.username, role: row.role, cohort: row.cohort,
    row_count: Number(row.row_count), definition_json: jsonText(row.definition_json), summary_json: jsonText(row.summary_json), model_version: row.model_version, audit_status: row.audit_status };
}

function mapKpiObservation(row:SupabaseKpiObservation):StoredKpiObservation {
  return { id:row.id, observed_at:new Date(row.observed_at).getTime(), source:row.source, digester_id:row.digester_id, run_id:row.run_id,
    biogas_m3_day:Number(row.biogas_m3_day), methane_m3_day:Number(row.methane_m3_day), electricity_kwh_day:Number(row.electricity_kwh_day),
    methane_pct:Number(row.methane_pct), co2_pct:Number(row.co2_pct), h2s_ppm:Number(row.h2s_ppm), metadata_json:jsonText(row.metadata_json), created_by:row.created_by };
}

function settingsFromRow(row: SupabaseSettings): ThresholdSettings {
  return { methaneMinimum: Number(row.methane_minimum), h2sWarning: Number(row.h2s_warning), oxygenMaximum: Number(row.oxygen_maximum),
    pressureMinimum: Number(row.pressure_minimum), pressureMaximum: Number(row.pressure_maximum), facilityName: row.facility_name, facilityLocation: row.facility_location };
}

async function supabaseRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase report store is not configured");
  const headers = new Headers(init.headers);
  headers.set("apikey", config.key);
  headers.set("Authorization", `Bearer ${config.key}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${config.url}/rest/v1/${path}`, { ...init, headers, cache: "no-store" });
  if (!response.ok) throw new Error(`Supabase request failed (${response.status})`);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

// Local demos remain usable before .env.local is configured. Production uses the
// server-only service-role key, never a browser-exposed database credential.
export async function ensureAuditSchema() {
  if (!supabaseConfig()) return false;
  try { await supabaseRequest<unknown[]>("simulation_runs?select=id&limit=1"); return true; }
  catch { return false; }
}

export async function getThresholds(): Promise<ThresholdSettings> {
  if (await ensureAuditSchema()) {
    try {
      const rows = await supabaseRequest<SupabaseSettings[]>("system_settings?id=eq.1&select=*");
      if (rows[0]) return settingsFromRow(rows[0]);
    } catch { /* Prediction must stay available when report storage is unavailable. */ }
  }
  return { ...memoryStore().settings };
}

export async function saveThresholds(settings: ThresholdSettings, username: string) {
  const payload = { id: 1, methane_minimum: settings.methaneMinimum, h2s_warning: settings.h2sWarning, oxygen_maximum: settings.oxygenMaximum,
    pressure_minimum: settings.pressureMinimum, pressure_maximum: settings.pressureMaximum, facility_name: settings.facilityName,
    facility_location: settings.facilityLocation, updated_at: new Date().toISOString(), updated_by: username };
  if (await ensureAuditSchema()) {
    await supabaseRequest("system_settings?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(payload) });
    return true;
  }
  memoryStore().settings = { ...settings };
  return false;
}

export async function recordSimulation(args: { id: string; username: string; role: string; feedstock: string; inputs: unknown; outputs: unknown; modelVersion: string }) {
  const payload = { id: args.id, created_at: new Date().toISOString(), username: args.username, role: args.role, feedstock: args.feedstock,
    inputs_json: args.inputs, outputs_json: args.outputs, model_version: args.modelVersion, audit_status: "recorded" };
  if (await ensureAuditSchema()) {
    try {
      await supabaseRequest("simulation_runs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(payload) });
      return true;
    } catch { return false; }
  }
  const store = memoryStore();
  store.runs.unshift({ id: args.id, created_at: Date.now(), username: args.username, role: args.role, feedstock: args.feedstock,
    inputs_json: JSON.stringify(args.inputs), outputs_json: JSON.stringify(args.outputs), model_version: args.modelVersion, audit_status: "volatile" });
  store.runs = store.runs.slice(0, 200);
  return false;
}

export async function listSimulations(limit = 50): Promise<StoredSimulation[]> {
  const safeLimit = Math.min(200, Math.max(1, limit));
  if (await ensureAuditSchema()) {
    try {
      const rows = await supabaseRequest<SupabaseRun[]>(`simulation_runs?select=*&order=created_at.desc&limit=${safeLimit}`);
      return rows.map(mapRun);
    } catch { return []; }
  }
  return memoryStore().runs.slice(0, safeLimit);
}

export async function auditStoreReady() { return ensureAuditSchema(); }

export async function batchReportStoreReady() {
  // Existing simulation_runs is a durable, immediately usable report ledger.
  // A dedicated batch_reports table is used automatically after schema.sql is
  // applied, but reporting does not become volatile while that migration waits.
  if (await ensureAuditSchema()) return true;
  return false;
}

async function dedicatedBatchReportStoreReady() {
  if (!supabaseConfig()) return false;
  try { await supabaseRequest<unknown[]>("batch_reports?select=id&limit=1"); return true; }
  catch { return false; }
}

export async function recordBatchReport(args: { id: string; username: string; role: string; cohort: string; rowCount: number; definition: unknown; summary: unknown; modelVersion: string }) {
  const payload = { id: args.id, created_at: new Date().toISOString(), username: args.username, role: args.role, cohort: args.cohort,
    row_count: args.rowCount, definition_json: args.definition, summary_json: args.summary, model_version: args.modelVersion, audit_status: "recorded" };
  if (await dedicatedBatchReportStoreReady()) {
    try {
      await supabaseRequest("batch_reports", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(payload) });
      return true;
    } catch { return false; }
  }
  if (await ensureAuditSchema()) {
    const saved = await recordSimulation({ id: args.id, username: args.username, role: args.role, feedstock: "Batch research report",
      inputs: { __aquaRecordType: "batch_report", definition: args.definition, cohort: args.cohort, rowCount: args.rowCount },
      outputs: { __aquaRecordType: "batch_report", summary: args.summary }, modelVersion: `batch-report/${args.modelVersion}` });
    if (saved) return true;
  }
  const store = memoryStore();
  store.batchReports.unshift({ id: args.id, created_at: Date.now(), username: args.username, role: args.role, cohort: args.cohort,
    row_count: args.rowCount, definition_json: JSON.stringify(args.definition), summary_json: JSON.stringify(args.summary), model_version: args.modelVersion, audit_status: "volatile" });
  store.batchReports = store.batchReports.slice(0, 60);
  return false;
}

export async function listBatchReports(limit = 20): Promise<StoredBatchReport[]> {
  const safeLimit = Math.min(60, Math.max(1, limit));
  if (await dedicatedBatchReportStoreReady()) {
    try {
      const rows = await supabaseRequest<SupabaseBatchReport[]>(`batch_reports?select=*&order=created_at.desc&limit=${safeLimit}`);
      return rows.map(mapBatchReport);
    } catch { return []; }
  }
  if (await ensureAuditSchema()) {
    const runs = await listSimulations(200);
    return runs.flatMap((run) => {
      try {
        const inputs = JSON.parse(run.inputs_json) as { __aquaRecordType?: string; definition?: unknown; cohort?: string; rowCount?: number };
        const outputs = JSON.parse(run.outputs_json) as { __aquaRecordType?: string; summary?: unknown };
        if (inputs.__aquaRecordType !== "batch_report" || outputs.__aquaRecordType !== "batch_report") return [];
        return [{ id: run.id, created_at: run.created_at, username: run.username, role: run.role, cohort: inputs.cohort || "hours_2_24",
          row_count: Number(inputs.rowCount || 0), definition_json: jsonText(inputs.definition), summary_json: jsonText(outputs.summary), model_version: run.model_version, audit_status: run.audit_status }];
      } catch { return []; }
    }).slice(0, safeLimit);
  }
  return memoryStore().batchReports.slice(0, safeLimit);
}

export async function getBatchReport(id: string): Promise<StoredBatchReport | null> {
  if (await dedicatedBatchReportStoreReady()) {
    try {
      const rows = await supabaseRequest<SupabaseBatchReport[]>(`batch_reports?id=eq.${encodeURIComponent(id)}&select=*`);
      return rows[0] ? mapBatchReport(rows[0]) : null;
    } catch { return null; }
  }
  if (await ensureAuditSchema()) return (await listBatchReports(60)).find((report) => report.id === id) ?? null;
  return memoryStore().batchReports.find((report) => report.id === id) ?? null;
}

async function kpiStoreReady() {
  if (!supabaseConfig()) return false;
  try { await supabaseRequest<unknown[]>("kpi_observations?select=id&limit=1"); return true; }
  catch { return false; }
}

export async function recordKpiObservation(args:{ id:string; observedAt:string; source:"modelled_prediction"|"csv_import"; digesterId:string; runId?:string|null; biogas:number; methane:number; electricity:number; methanePct:number; co2Pct:number; h2s:number; metadata?:unknown; createdBy:string }) {
  const payload={ id:args.id, observed_at:args.observedAt, source:args.source, digester_id:args.digesterId, run_id:args.runId||null,
    biogas_m3_day:args.biogas, methane_m3_day:args.methane, electricity_kwh_day:args.electricity, methane_pct:args.methanePct,
    co2_pct:args.co2Pct, h2s_ppm:args.h2s, metadata_json:args.metadata??{}, created_by:args.createdBy };
  if (await kpiStoreReady()) {
    try { await supabaseRequest("kpi_observations",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(payload)}); return true; }
    catch { return false; }
  }
  // The existing simulation ledger is already a durable source for a dashboard
  // modelled KPI: the prediction route stores its optimized output there first.
  // For imported values, retain a typed fallback row until the dedicated table
  // migration in schema.sql is applied.
  if (await ensureAuditSchema()) {
    if(args.source==="modelled_prediction") return true;
    return recordSimulation({id:args.id,username:args.createdBy,role:"admin",feedstock:"CSV KPI import",inputs:{__aquaRecordType:"kpi_import",digesterId:args.digesterId,observedAt:args.observedAt},outputs:{__aquaRecordType:"kpi_import",...payload},modelVersion:"kpi-import/v1"});
  }
  const store=memoryStore();
  store.kpiObservations.unshift({ id:args.id, observed_at:new Date(args.observedAt).getTime(), source:args.source, digester_id:args.digesterId, run_id:args.runId||null,
    biogas_m3_day:args.biogas, methane_m3_day:args.methane, electricity_kwh_day:args.electricity, methane_pct:args.methanePct,
    co2_pct:args.co2Pct, h2s_ppm:args.h2s, metadata_json:JSON.stringify(args.metadata??{}), created_by:args.createdBy });
  store.kpiObservations=store.kpiObservations.slice(0,1000);
  return false;
}

export async function listKpiObservations(filters:{limit?:number; source?:"modelled_prediction"|"csv_import"; from?:string; to?:string; digesterId?:string}={}) {
  const limit=Math.min(10000,Math.max(1,filters.limit??1000));
  if (await kpiStoreReady()) {
    try {
      const where=["select=*",`order=observed_at.desc`,`limit=${limit}`];
      if(filters.source)where.push(`source=eq.${encodeURIComponent(filters.source)}`);
      if(filters.digesterId)where.push(`digester_id=eq.${encodeURIComponent(filters.digesterId)}`);
      if(filters.from)where.push(`observed_at=gte.${encodeURIComponent(filters.from)}`);
      if(filters.to)where.push(`observed_at=lte.${encodeURIComponent(filters.to)}`);
      const rows=await supabaseRequest<SupabaseKpiObservation[]>(`kpi_observations?${where.join("&")}`);
      return { observations:rows.map(mapKpiObservation), persistence:"supabase" as const };
    } catch { return { observations:[] as StoredKpiObservation[], persistence:"volatile" as const }; }
  }
  if (await ensureAuditSchema()) {
    const runs=await listSimulations(200);
    const observations=runs.flatMap((run):StoredKpiObservation[]=>{
      try {
        const outputs=JSON.parse(run.outputs_json) as { optimized?:{biogas?:number;methane?:number;electricity?:number;methanePct?:number;co2Pct?:number;h2s?:number}; __aquaRecordType?:string; observed_at?:string; source?:"modelled_prediction"|"csv_import"; digester_id?:string; run_id?:string|null; biogas_m3_day?:number; methane_m3_day?:number; electricity_kwh_day?:number; methane_pct?:number; co2_pct?:number; h2s_ppm?:number; metadata_json?:unknown };
        if(outputs.__aquaRecordType==="kpi_import") return [{id:run.id,observed_at:new Date(outputs.observed_at||run.created_at).getTime(),source:"csv_import",digester_id:outputs.digester_id||"manual-digester",run_id:outputs.run_id||null,biogas_m3_day:Number(outputs.biogas_m3_day),methane_m3_day:Number(outputs.methane_m3_day),electricity_kwh_day:Number(outputs.electricity_kwh_day),methane_pct:Number(outputs.methane_pct),co2_pct:Number(outputs.co2_pct),h2s_ppm:Number(outputs.h2s_ppm),metadata_json:jsonText(outputs.metadata_json),created_by:run.username}];
        const optimized=outputs.optimized;
        if(!optimized||![optimized.biogas,optimized.methane,optimized.electricity,optimized.methanePct,optimized.co2Pct,optimized.h2s].every(Number.isFinite))return [];
        return [{id:run.id,observed_at:run.created_at,source:"modelled_prediction",digester_id:"manual-digester",run_id:run.id,biogas_m3_day:Number(optimized.biogas),methane_m3_day:Number(optimized.methane),electricity_kwh_day:Number(optimized.electricity),methane_pct:Number(optimized.methanePct),co2_pct:Number(optimized.co2Pct),h2s_ppm:Number(optimized.h2s),metadata_json:"{}",created_by:run.username}];
      } catch { return []; }
    });
    let selected=observations;
    if(filters.source)selected=selected.filter(item=>item.source===filters.source);
    if(filters.digesterId)selected=selected.filter(item=>item.digester_id===filters.digesterId);
    const fromTime=filters.from?new Date(filters.from).getTime():null; const toTime=filters.to?new Date(filters.to).getTime():null;
    if(fromTime!==null)selected=selected.filter(item=>item.observed_at>=fromTime);
    if(toTime!==null)selected=selected.filter(item=>item.observed_at<=toTime);
    return {observations:selected.sort((a,b)=>b.observed_at-a.observed_at).slice(0,limit),persistence:"supabase" as const};
  }
  let observations=[...memoryStore().kpiObservations];
  if(filters.source)observations=observations.filter(item=>item.source===filters.source);
  if(filters.digesterId)observations=observations.filter(item=>item.digester_id===filters.digesterId);
  const fromTime=filters.from?new Date(filters.from).getTime():null;
  const toTime=filters.to?new Date(filters.to).getTime():null;
  if(fromTime!==null)observations=observations.filter(item=>item.observed_at>=fromTime);
  if(toTime!==null)observations=observations.filter(item=>item.observed_at<=toTime);
  return { observations:observations.slice(0,limit), persistence:"volatile" as const };
}
