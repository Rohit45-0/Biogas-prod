-- Aquaivolt durable report store
-- Apply this once in Supabase SQL Editor. The Next.js server is the only writer;
-- browser users never receive a database key.

create table if not exists public.simulation_runs (
  id uuid primary key,
  created_at timestamptz not null default now(),
  username text not null,
  role text not null check (role in ('admin', 'user')),
  feedstock text not null,
  inputs_json jsonb not null,
  outputs_json jsonb not null,
  model_version text not null,
  audit_status text not null default 'recorded'
);

create index if not exists simulation_runs_created_at_idx
  on public.simulation_runs (created_at desc);

create table if not exists public.system_settings (
  id smallint primary key check (id = 1),
  methane_minimum numeric not null default 55,
  h2s_warning numeric not null default 500,
  oxygen_maximum numeric not null default 2,
  pressure_minimum numeric not null default 12,
  pressure_maximum numeric not null default 30,
  facility_name text not null default 'Aquaivolt Demonstration Plant',
  facility_location text not null default 'Lebanon · location pending',
  updated_at timestamptz not null default now(),
  updated_by text not null default 'system'
);

create table if not exists public.batch_reports (
  id uuid primary key,
  created_at timestamptz not null default now(),
  username text not null,
  role text not null check (role in ('admin', 'user')),
  cohort text not null check (cohort in ('farm_optimization', 'hours_research', 'under_6_hours')),
  row_count integer not null check (row_count in (1000, 10000)),
  definition_json jsonb not null,
  summary_json jsonb not null,
  model_version text not null,
  audit_status text not null default 'recorded'
);

create index if not exists batch_reports_created_at_idx on public.batch_reports (created_at desc);

-- KPI observations are deliberately source-labelled. `modelled_prediction`
-- records are reproducible dashboard calculations; `csv_import` is reserved
-- for timestamped plant/SCADA exports and must not be mixed silently.
create table if not exists public.kpi_observations (
  id uuid primary key,
  observed_at timestamptz not null,
  source text not null check (source in ('modelled_prediction', 'csv_import')),
  digester_id text not null default 'manual-digester',
  run_id uuid references public.simulation_runs(id) on delete set null,
  biogas_m3_day numeric not null,
  methane_m3_day numeric not null,
  electricity_kwh_day numeric not null,
  methane_pct numeric not null,
  co2_pct numeric not null,
  h2s_ppm numeric not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists kpi_observations_time_idx on public.kpi_observations (observed_at desc);
create index if not exists kpi_observations_source_idx on public.kpi_observations (source, digester_id, observed_at desc);

insert into public.system_settings (id)
values (1)
on conflict (id) do nothing;

-- No anonymous or authenticated browser policy is created. The server-side
-- service-role key bypasses RLS; ordinary browser API keys cannot read/write data.
alter table public.simulation_runs enable row level security;
alter table public.system_settings enable row level security;
alter table public.batch_reports enable row level security;
alter table public.kpi_observations enable row level security;
