import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const simulationRuns = sqliteTable("simulation_runs", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at").notNull(),
  username: text("username").notNull(),
  role: text("role").notNull(),
  feedstock: text("feedstock").notNull(),
  inputsJson: text("inputs_json").notNull(),
  outputsJson: text("outputs_json").notNull(),
  modelVersion: text("model_version").notNull(),
  auditStatus: text("audit_status").notNull().default("recorded"),
});

export const systemSettings = sqliteTable("system_settings", {
  id: integer("id").primaryKey(),
  methaneMinimum: real("methane_minimum").notNull().default(55),
  h2sWarning: real("h2s_warning").notNull().default(500),
  oxygenMaximum: real("oxygen_maximum").notNull().default(2),
  pressureMinimum: real("pressure_minimum").notNull().default(12),
  pressureMaximum: real("pressure_maximum").notNull().default(30),
  facilityName: text("facility_name").notNull().default("Aquaivolt Demonstration Plant"),
  facilityLocation: text("facility_location").notNull().default("Lebanon · location pending"),
  updatedAt: integer("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});
