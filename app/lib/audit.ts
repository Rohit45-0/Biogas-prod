import { env } from "cloudflare:workers";

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

export const defaultThresholds: ThresholdSettings = {
  methaneMinimum: 55,
  h2sWarning: 500,
  oxygenMaximum: 2,
  pressureMinimum: 12,
  pressureMaximum: 30,
  facilityName: "Aquaivolt Demonstration Plant",
  facilityLocation: "Lebanon · location pending",
};

function database() {
  return env.DB as D1Database | undefined;
}

export async function ensureAuditSchema() {
  const db = database();
  if (!db) return false;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS simulation_runs (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      username TEXT NOT NULL,
      role TEXT NOT NULL,
      feedstock TEXT NOT NULL,
      inputs_json TEXT NOT NULL,
      outputs_json TEXT NOT NULL,
      model_version TEXT NOT NULL,
      audit_status TEXT NOT NULL DEFAULT 'recorded'
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS system_settings (
      id INTEGER PRIMARY KEY,
      methane_minimum REAL NOT NULL DEFAULT 55,
      h2s_warning REAL NOT NULL DEFAULT 500,
      oxygen_maximum REAL NOT NULL DEFAULT 2,
      pressure_minimum REAL NOT NULL DEFAULT 12,
      pressure_maximum REAL NOT NULL DEFAULT 30,
      facility_name TEXT NOT NULL DEFAULT 'Aquaivolt Demonstration Plant',
      facility_location TEXT NOT NULL DEFAULT 'Lebanon · location pending',
      updated_at INTEGER NOT NULL,
      updated_by TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_simulation_runs_created_at ON simulation_runs(created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_simulation_runs_username_created_at ON simulation_runs(username, created_at DESC)"),
  ]);
  await db.prepare(`INSERT OR IGNORE INTO system_settings
    (id, methane_minimum, h2s_warning, oxygen_maximum, pressure_minimum, pressure_maximum, facility_name, facility_location, updated_at, updated_by)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(defaultThresholds.methaneMinimum, defaultThresholds.h2sWarning, defaultThresholds.oxygenMaximum,
      defaultThresholds.pressureMinimum, defaultThresholds.pressureMaximum, defaultThresholds.facilityName,
      defaultThresholds.facilityLocation, Date.now(), "system")
    .run();
  return true;
}

export async function getThresholds(): Promise<ThresholdSettings> {
  try {
    if (!await ensureAuditSchema()) return defaultThresholds;
    const row = await database()!.prepare(`SELECT methane_minimum, h2s_warning, oxygen_maximum,
      pressure_minimum, pressure_maximum, facility_name, facility_location FROM system_settings WHERE id = 1`).first<Record<string, unknown>>();
    if (!row) return defaultThresholds;
    return {
      methaneMinimum: Number(row.methane_minimum), h2sWarning: Number(row.h2s_warning),
      oxygenMaximum: Number(row.oxygen_maximum), pressureMinimum: Number(row.pressure_minimum),
      pressureMaximum: Number(row.pressure_maximum), facilityName: String(row.facility_name),
      facilityLocation: String(row.facility_location),
    };
  } catch {
    return defaultThresholds;
  }
}

export async function saveThresholds(settings: ThresholdSettings, username: string) {
  if (!await ensureAuditSchema()) throw new Error("Persistent database is unavailable");
  await database()!.prepare(`UPDATE system_settings SET methane_minimum = ?, h2s_warning = ?, oxygen_maximum = ?,
    pressure_minimum = ?, pressure_maximum = ?, facility_name = ?, facility_location = ?, updated_at = ?, updated_by = ? WHERE id = 1`)
    .bind(settings.methaneMinimum, settings.h2sWarning, settings.oxygenMaximum, settings.pressureMinimum,
      settings.pressureMaximum, settings.facilityName, settings.facilityLocation, Date.now(), username).run();
}

export async function recordSimulation(args: { id: string; username: string; role: string; feedstock: string; inputs: unknown; outputs: unknown; modelVersion: string }) {
  if (!await ensureAuditSchema()) return false;
  await database()!.prepare(`INSERT INTO simulation_runs
    (id, created_at, username, role, feedstock, inputs_json, outputs_json, model_version, audit_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'recorded')`)
    .bind(args.id, Date.now(), args.username, args.role, args.feedstock, JSON.stringify(args.inputs), JSON.stringify(args.outputs), args.modelVersion).run();
  return true;
}

export async function listSimulations(limit = 50): Promise<StoredSimulation[]> {
  if (!await ensureAuditSchema()) return [];
  const result = await database()!.prepare(`SELECT id, created_at, username, role, feedstock, inputs_json, outputs_json,
    model_version, audit_status FROM simulation_runs ORDER BY created_at DESC LIMIT ?`).bind(Math.min(200, Math.max(1, limit))).all();
  return (result.results ?? []) as unknown as StoredSimulation[];
}

export async function auditStoreReady() {
  try { return await ensureAuditSchema(); } catch { return false; }
}
