# AQUAIVOLT audit remediation and retest checklist

Source changes prepared 31 October 2026 for the planned 5 November retest. This document describes the updated source, not a claim that production has already been redeployed or that the auditor has approved it.

## Findings and corrective actions

| Finding | Software change | What still requires external evidence |
| --- | --- | --- |
| Model validation | Plant validation subtab, measurement records linked to a saved ML run, provenance/holdout declarations, and persisted measured-error reports | Commissioned equipment, calibrated plant measurements, genuinely untouched holdout data, agreed acceptance criteria and independent review |
| Missing listed audit records | Global newest-stored-first ordering across all storage metadata pages, stable cursor cutoff, explicit total, refresh loading guards and visible unreadable entries | Production retest against the auditor's saved IDs and storage account |
| HRT wording | Neutral HRT change with signed increase/decrease/unchanged values; consistent day/hour conversion; no blanket reduction promise | Physical benefit of any HRT change |
| Signed evidence wording | Server-authenticated JSON/CSV labels and machine-readable HMAC-SHA-256 disclosure, with independentlyVerifiable=false | Public-key signatures are not implemented and are not claimed |
| Out-of-distribution inputs | Feedstock reference envelopes, field-level warnings before/after prediction, uncertainty unavailable in UI/API/evidence/CSV | Feedstock-specific plant-validated operating ranges and calibrated prediction intervals |

The trained ONNX/joblib files are unchanged. Their artifact versions and hashes remain the same; application source/manifest hashes change to identify these corrections. Numerical conversion parity is a software check, not model accuracy evidence. Historical records are not rewritten and the HMAC secret is not rotated. Old-build records remain retrievable; replay or scenario regeneration may require their original build.

## Auditor retest

1. Sign in as Admin. In Audit Trail > ML predictions, record the current manifest and artifact hashes. Run identical inputs three times and compare raw predictions, not run IDs or timestamps.
2. Execute Test null rejection. Expected: HTTP 422 and a pH-specific issue. Verification of a valid current-build ML run should retain eleven passing execution/integrity checks; scenario verification retains nine.
3. Submit pH 11 with otherwise complete valid inputs. Expected: exploratory HTTP 200 with OUTSIDE_REFERENCE_ENVELOPE, a pH-specific feedstock envelope warning, NOT_CALIBRATED uncertainty, no claimed calibrated interval, and no plant-validated operating range. Repeat for different feedstocks and check the reference rows/ranges change. The exported prediction CSV and retrievable JSON must retain these disclosures.
4. Create enough records to span at least three list pages. Confirm the newest record is on the first page, every expected ID appears exactly once across pages, and the loaded count reaches the total. Create a run while paging: Refresh should include it in a new view. Repeat after logout/login. Compare direct ID retrieval to listing. Stored time is the ordering key, not a UUID's alphabetical order.
5. Review HRT in Overview, production pages and Scenario execution. A change from 22 to 23.1 model days is +1.1 days / +26.4 hours, explicitly an increase. A decrease carries a negative sign. The selection is not described as an operational improvement merely because HRT changed.
6. Download JSON and evidence CSV. Expected: server-authenticated wording, HMAC-SHA-256 disclosure and independentlyVerifiable=false. A server integrity PASS does not authenticate the physical source of measurements.
7. Review Plant validation before equipment arrival: it must remain pending. Once real measurements exist, record the measurement source, plant/dataset/sample IDs, timestamp, three raw measured outputs, corresponding ML run and four required declarations. Save and retrieve the observation by ID.
8. Generate an error report from observations in a single plant, dataset and frozen model build. Review MAE, RMSE, signed bias and R2 for each model/output. A single observation or constant target must not produce a fabricated R2. Duplicate IDs, duplicate samples/prediction runs, mixed plants/builds and tampered records must be rejected.
9. Download the measured-error report. It must remain REVIEW_REQUIRED, with optimization benefit NOT ESTABLISHED. Operator-selected samples and declarations do not independently prove a representative untouched holdout set.

## Measurement protocol before claiming accuracy or gains

- Agree the plant, feedstock, sampling frequency, synchronization window, target units, instrument calibration and acceptable missing-data handling before collecting evaluation data.
- Freeze the model artifacts and acceptance criteria before evaluation. Keep the holdout dataset out of training, tuning and model selection; retain all eligible samples and document exclusions.
- Link each measurement to the actual operating inputs and output sampling period. Store original instrument exports and calibration evidence externally; the application records their reference, not an independently authenticated instrument feed.
- Review per-output error statistics by plant/feedstock and operating range, sample count, time coverage and data quality. Do not reuse the same report to claim optimization benefit.
- For optimization benefit, collect comparable before/after operating periods and account for feed composition, load, equipment changes and other confounders. A prediction difference alone is not measured improvement.

## Software verification

Run `pnpm test` in an isolated local checkout. It covers native model parity, authenticated APIs, multi-page local listing, a mocked multi-page private-Blob listing, negative input cases, HRT direction/units, evidence disclosure, measured-error arithmetic, duplicate rejection, tamper detection and persistence. Tests use clearly labeled fixtures in an isolated local directory, not real plant evidence or production records.

Production verification must use the intended deployed build and actual private Blob account. Successful local or mocked tests do not substitute for that deployment check. No analyzer connection, equipment control, automatic retraining, calibrated confidence interval, public-key signing or grant approval is claimed by this update.

### Repeatable browser verification

After `pnpm test` creates the production build:

```powershell
pnpm exec playwright install chromium
pnpm test:ui
```

On Windows, an existing Microsoft Edge installation can be used instead of downloading Chromium:

```powershell
$env:PLAYWRIGHT_CHANNEL = "msedge"
pnpm test:ui
```

The browser test starts an isolated local server with temporary test credentials and explicitly labeled fixture records. It checks pagination, a new login session, export disclosures, pH warnings, measurement entry, undefined R2 for a single observation, HRT wording, and navigation at 390, 768, 850, 1024 and 1440 pixels. Screenshots and a timestamped result are saved to `test-results/audit-remediation-ui/`. The dashboard GitHub workflow repeats the build, automated tests and browser checks using Chromium.
