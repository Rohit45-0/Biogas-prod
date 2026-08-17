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

type PortableAuditStore = { settings: ThresholdSettings; runs: StoredSimulation[] };
type AquaGlobal = typeof globalThis & { __aquaAuditStore?: PortableAuditStore };

function memoryStore() {
  const root = globalThis as AquaGlobal;
  root.__aquaAuditStore ??= { settings: { ...defaultThresholds }, runs: [] };
  return root.__aquaAuditStore;
}

// Vercel functions do not provide Cloudflare D1 bindings. This in-memory adapter
// keeps the prototype operational without claiming durable persistence. A hosted
// Postgres adapter can replace it later without changing the API contracts.
export async function ensureAuditSchema() { return false; }

export async function getThresholds(): Promise<ThresholdSettings> {
  return { ...memoryStore().settings };
}

export async function saveThresholds(settings: ThresholdSettings, _username: string) {
  memoryStore().settings = { ...settings };
}

export async function recordSimulation(args: { id: string; username: string; role: string; feedstock: string; inputs: unknown; outputs: unknown; modelVersion: string }) {
  const store = memoryStore();
  store.runs.unshift({ id: args.id, created_at: Date.now(), username: args.username, role: args.role,
    feedstock: args.feedstock, inputs_json: JSON.stringify(args.inputs), outputs_json: JSON.stringify(args.outputs),
    model_version: args.modelVersion, audit_status: "volatile" });
  store.runs = store.runs.slice(0, 200);
  return false;
}

export async function listSimulations(limit = 50): Promise<StoredSimulation[]> {
  return memoryStore().runs.slice(0, Math.min(200, Math.max(1, limit)));
}

export async function auditStoreReady() { return false; }
