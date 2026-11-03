# Production dashboard restoration — 4 November 2026

The main application restores the earlier navy-and-teal dashboard structure while retaining the current hours-scale research model, automatic scenario generation, saved evidence and October audit remediation.

## Restored pages

- Overview, Biogas, Methane and Electricity have production cards, a fitted HRT chart, current-to-selected operating conditions, model status, disconnected hardware feed, source preview and data status. Day, Month and Year compare saved predictions as explicitly labelled constant-output projections.
- Process Monitor shows the actual completed backend trace, calculation time, model identifiers and audit status. The feed, digester, gas-treatment and electricity cards display model estimates; every hardware connection is marked unavailable.
- AI Optimizer displays current and selected values with signed changes. **Use as comparison** copies the selected HRT into manual study settings; it sends no equipment command.
- AI & KPI Reports provides annual totals, a twelve-month projection, daily/monthly CSVs, the existing 2,000-evaluation export, authenticated audit JSON, replay verification and session report history. Projection CSVs are browser-generated and distinct from server-authenticated evidence. Calendar-month totals reconcile to 365 daily estimates; ppm concentrations are not accumulated over time.
- Grouped navigation, Alerts and Settings restore the earlier application organization. Workbook pagination, Copilot, Audit Trail, original-model reference controls and Plant validation remain accessible.

## Preserved behaviour and limits

Each automatic run generates a new supported HRT input and calculates its outputs using the unchanged fitted model. The selected optimum is determined by the objective and may remain unchanged between scenarios. HRT stays in hours within the supported 2–24-hour synthetic trajectory. Process settings covary along that trajectory; they are not separately trained control inputs.

No measured plant accuracy, optimization benefit, live telemetry, calibrated prediction interval or independent public-key verification is implied. Plant validation still requires commissioned equipment and measured holdout data. Original audit records and original trained model artifacts are preserved.

## Verification

- Production build and TypeScript.
- All 39 backend/model regression tests, including deterministic replay, changed-input predictions, tamper rejection, pagination and native model parity.
- Research browser checks across all restored pages at widths 390, 768, 850, 1024, 1440 and 1920; current/selected numerical parity, three automatic runs, CSV reconciliation, saved history and replay.
- Audit browser regression checks and deployment verification are recorded in the release evidence under `test-results/`.

These checks verify software behaviour using synthetic scenarios. They are not plant validation.
