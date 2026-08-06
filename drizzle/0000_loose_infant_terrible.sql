CREATE TABLE `simulation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`username` text NOT NULL,
	`role` text NOT NULL,
	`feedstock` text NOT NULL,
	`inputs_json` text NOT NULL,
	`outputs_json` text NOT NULL,
	`model_version` text NOT NULL,
	`audit_status` text DEFAULT 'recorded' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`methane_minimum` real DEFAULT 55 NOT NULL,
	`h2s_warning` real DEFAULT 500 NOT NULL,
	`oxygen_maximum` real DEFAULT 2 NOT NULL,
	`pressure_minimum` real DEFAULT 12 NOT NULL,
	`pressure_maximum` real DEFAULT 30 NOT NULL,
	`facility_name` text DEFAULT 'Aquaivolt Demonstration Plant' NOT NULL,
	`facility_location` text DEFAULT 'Lebanon · location pending' NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL
);
