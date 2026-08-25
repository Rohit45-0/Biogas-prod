# Aquaivolt AI Biogas Command Center

An auditable short-HRT biogas scenario prototype. A signed-in user enters feed rate, temperature, pH, OLR and HRT in hours; the server invokes an implemented **LangGraph StateGraph**, runs the trained 2–24 hour model and returns an input-responsive baseline, biogas, methane and electricity estimates, recommendations, input-response curves and an execution trace.

This is a **scenario model**, not a live SCADA connection and not an equipment controller. The supplied data are research-informed, synthetic/projected and must not be presented as operating-plant validation.

## Run locally — simple Windows steps

For a client demonstration, only **Node.js 22 LTS** is required. Git is required only when cloning from GitHub. Python, Vercel, VS Code, Excel and an OpenAI subscription are **not** required to run the dashboard.

1. Install [Node.js 22 LTS](https://nodejs.org/en/download) using the default options.
2. Download the repository ZIP from GitHub (or clone it with Git), then extract it.
3. Double-click [`START_AQUAIVOLT.bat`](START_AQUAIVOLT.bat).
4. On first use, Notepad opens `.env.local`. The supplied local login details already work; save and close Notepad.
5. Wait for the first-time package installation. The dashboard opens automatically at `http://localhost:3000`.

For a copy-and-paste GitHub option, see [`CLIENT_QUICK_START.md`](CLIENT_QUICK_START.md). The dashboard can run with `OPENAI_API_KEY` left blank; that key only enables optional OpenAI-enhanced Copilot answers.

## Durable report storage with Supabase

The dashboard works without Supabase, but records are then volatile in a serverless deployment. To persist each completed run as an auditor-readable report:

1. In Supabase SQL Editor, run [`supabase/schema.sql`](supabase/schema.sql).
2. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` or the Vercel project environment.
3. Restart/redeploy the application.

The service-role key is used only by server routes. It must never be placed in a `NEXT_PUBLIC_` variable, browser code, Git history or a client presentation. The saved `simulation_runs` row holds the authenticated operator, submitted inputs, complete model outputs, recommendations and execution trace. The `kpi_observations` table separately records **modelled predictions** and timestamped **CSV imports** so a report cannot silently label a model calculation as a plant meter reading. Tables have RLS enabled with no browser policy, so the app's server is the only writer/reader.

## Implemented AI workflow

`POST /api/predict` executes this LangGraph graph on the server:

1. Validate five inputs and flag explicit out-of-envelope estimates.
2. Prepare standardized degree-2 polynomial features.
3. Run the exported Ridge-regression coefficients.
4. Calculate an input-responsive baseline; the source baseline column is constant, so this is not represented as a separate trained model.
5. Search 3,125 bounded nearby lower-HRT candidates, retaining choices that protect biogas, methane and electricity.
6. Apply the methane/H₂S safety and human-approval gate.
7. Prepare an execution trace and persist audit/KPI evidence where Supabase is configured.

The workflow is advisory only: it does not read IoT data, write to PLCs, or control feed, heating, mixing, valves or generator equipment.

## Reproducible model training and comparison

Run this on a development machine with Python 3.12+ to reproduce the saved artifacts and evaluation manifest:

```powershell
cd ai-workflow
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python train_short_hrt_model.py
```

The script uses the supplied `AQUAIVOLT_Hours-Scale_AI_Synthetic_500rows hrt hours.xlsx` workbook, **Hours-Scale AI Synthetic 500** sheet. It evaluates Ridge regression with quadratic features, HistGradientBoosting and XGBoost with the same fixed shuffled five-fold cross-validation. Model artifacts are saved in `ai-workflow/artifacts/` and the evaluator produces `app/lib/model-evaluation.generated.json`. The deployed model is Ridge because it is the numerical winner and can be reproduced in the Vercel TypeScript runtime with exported coefficients. A neural-network/PyTorch model is not implemented or claimed.

## Reproducible AI reports

The main Overview places the manual calculation first and the **Batch AI + KPI report** immediately below it. Any signed-in operator can inspect a paused, auditor-controlled batch workflow before explicitly generating the report. The primary report mode uses the supplied 500-row `Hours-Scale AI Synthetic 500` worksheet as a batch of **operating inputs**:

- The app embeds only the five input columns—feed rate, temperature, pH, OLR and **HRT in hours**—from the supplied 500-row sheet. The workbook's optimized-output columns are deliberately excluded from runtime inference.
- Four deterministic, bounded candidate profiles are generated for each source row, so one batch operation produces **500 × 4 = 2,000 new model evaluations**.
- Each generated candidate is passed through the portable `StandardScaler → degree-2 polynomial features → Ridge regression` model. It was fitted from the same 500-row synthetic research worksheet (HRT 2–24 hours).
- Ridge, HistGradientBoosting and XGBoost are evaluated using a fixed shuffled five-fold cross-validation. Its output is constrained to the observed synthetic-data envelope; it is therefore a repeatable research estimate, not a claim of field performance.
- No random-number generator and no Excel target/output lookup is used at runtime. The source inputs and the trained model coefficients are versioned in the application.
- Ranking uses an explicit HRT-aware multi-output score. The report includes source row ID, candidate profile, input setpoints, baseline, model output, H₂S calculation and scenario-specific recommendation.
- The supplied short-HRT baseline column is constant, so the dashboard’s current baseline is transparently calculated as an input-responsive counterfactual rather than falsely presented as a separately trained baseline model.
- The report creates thirty deterministic **modelled operating-day groups**, plus a **30-day monthly-equivalent** and **365-day annualised** projection. The workbook has no calendar timestamps, so these values are never labelled as measured daily/monthly/yearly plant totals.
- Downloadable reporting includes the 2,000 scenario audit rows, a 30-day modelled projection CSV and the monthly/yearly projection summary.
- H₂S removal is a derived before/after estimate. CO₂e avoidance uses the documented 0.708 kg/kWh electricity-displacement assumption; it is not a direct CO₂-removal measurement.
- The short-HRT model remains clearly marked synthetic research data and is not site-validated.

Batch report metadata is saved to `simulation_runs` immediately, so it works with the existing Supabase schema. Once the current [`supabase/schema.sql`](supabase/schema.sql) is applied, the app automatically uses the dedicated `batch_reports` table instead.

## Verification

Run `pnpm test` for the production build and checks. After a prediction, an administrator can open **Model audit** to inspect the same execution ID, real LangGraph model trace, data-source note, evaluation evidence and persisted run log. **KPI reports** provides hour/day/month aggregation of source-labelled modelled records or separately imported CSV records.

## Key routes

- `POST /api/predict` — validates five short-HRT inputs, runs the trained model and records the report.
- `GET /api/audit` — administrator-only report history; append `?format=csv` for export.
- `GET /api/model` and `GET /api/evaluation` — model card and evaluation evidence.
- `POST /api/copilot` — source-grounded assistance, optionally enhanced with OpenAI when configured.
- `POST /api/reports/batch` — authenticated, on-demand batch generator. `short_hrt_batch` produces exactly 2,000 model-derived rows from the embedded 500-row operating-input batch.
- `GET /api/reports/batch?id=<report-id>&format=csv` — recreates and downloads the saved batch definition; use `format=daily` for the 30-day modelled projection and `format=projection` for the modelled monthly-equivalent and annualised summary.
- `GET /api/reports/kpi?period=hour|day|month` — administrator-only source-labelled KPI aggregation; supports `source=modelled_prediction|csv_import`.
- `POST /api/reports/kpi` — administrator-only timestamped CSV/API KPI import; the records are stored as `csv_import` and never silently mixed with modelled output.
