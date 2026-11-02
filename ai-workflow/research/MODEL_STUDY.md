# Model and dataset research — 2 November 2026

The hours-scale service is a synthetic research trajectory, not a plant-performance model. Existing deployed Gradient Boosting and Ridge artifacts remain unchanged.

## Hours-scale model

Selected: Polynomial degree 5, ridge 0.1. The input is HRT alone, from 2 to 24 hours. Other process variables follow the supplied correlated trajectory.

Selection uses blocked development cross-validation. The final evaluation fits 380 rows, holds out 100 contiguous rows and omits 20 gap rows. The exported research model is then refitted on all 500 rows.

The test block spans 10.82–15.18 hours. Mean normalized MAE improves 71.52% relative to a training-mean baseline on this synthetic block. This is not an improvement over the deployed day-scale models, which predict different data.

| Target | Unit | MAE | RMSE | R² | Mean baseline MAE |
|---|---|---:|---:|---:|---:|
| biogasM3Day | m3/day | 0.4076 | 0.5024 | 0.7961 | 0.9993 |
| methanePct | % | 0.5869 | 0.6620 | 0.7646 | 2.9375 |
| feedRate | kg VS/day | 2.2063 | 2.6829 | 0.5614 | 3.4990 |
| temperature | degC | 0.6711 | 0.7074 | 0.8188 | 1.4290 |
| ph | pH | 0.0191 | 0.0236 | 0.1227 | 0.0796 |
| olr | kg VS/m3/day | 0.2867 | 0.3386 | 0.9465 | 8.0400 |
| h2sBeforePpm | ppm | 4.4274 | 4.9356 | 0.5075 | 8.0772 |
| h2sAfterPpm | ppm | 0.5910 | 0.6440 | 0.3154 | 0.6491 |
| stabilityPct | % | 1.1916 | 1.2823 | 0.5317 | 8.3217 |

Methane volume is biogas × CH₄ fraction. Electricity is methane volume × 9.97 kWh/m³ × 0.36, matching the workbook assumptions. These are derived consistently rather than separately fitted.

The workbook contains no feedstock classification. Its synthetic stability index is not a validated safety threshold or calibrated confidence. The separate 0.5–5.95-hour extreme projection is excluded from training.

## Data limitations

- Synthetic trajectory agreement only; not independent plant accuracy or demonstrated HRT reduction.
- The 500 rows are an interpolated, noise-augmented expansion of ten source concepts, not 500 independent experiments.
- HRT is the only independent model input. Process variables and outputs move together along the supplied research trajectory; independent input effects and feedstock-specific support are unknown.
- The source has no feedstock column and no plant measurements. No sensor or equipment control is performed.
- The source stability score is a synthetic scenario index, not calibrated uncertainty or a validated safety limit.
- The model does not predict production at a baseline measured in weeks. A weeks-to-hours display compares a user baseline with a research target only.
- The separate 0.5–5.95 hour extreme-extrapolation workbook is excluded. This model supports only its own 2–24 hour synthetic source.
- Candidate selection used development folds only. The 100-row synthetic test block was excluded from fitting and tuning; final deployment fit uses all 500 rows after evaluation.

## Existing day-scale model assessment

SCADA candidate selection: Mean baseline. Best learned candidate: Ridge alpha 1000. The first 800 synthetic rows are used for development; the archived final 200 rows are evaluated once after selection. This holdout was previously seen in the audit and cannot establish new independent validation.

| SCADA model | Gas-flow MAE (m³/h) | Methane-content MAE (%) | Generator-power MAE (kW) |
|---|---:|---:|---:|
| Mean baseline | 91.9548 | 4.0980 | 24.7253 |
| Ridge alpha 1000 | 91.7915 | 4.0896 | 24.7786 |
| Archived Ridge | 91.8501 | 4.0792 | 24.9053 |

The ten paired anchors are assessed using nested leave-one-out. Each test row is excluded from both fitting and model selection. This stricter assessment is not directly interchangeable with the earlier non-nested model-selection score.

| Ten-anchor target | Nested-selection MAE | Archived Gradient Boosting MAE |
|---|---:|---:|
| Gas Flow (m3/h) After AI | 8.3335 | 9.5807 |
| CH4 (%) After AI | 1.1095 | 1.3813 |
| Generator (kW) After AI | 3.4006 | 3.9417 |

No existing artifact is promoted or overwritten. Synthetic-data scores do not establish improved plant accuracy.

## Reproduction

`python ai-workflow/src/research_model_study.py --source-dir <folder-containing-original-Excel-files>`

Alternatively pass `--workbooks <read-only-workbooks.json>`. The JSON must retain each workbook SHA-256, sheet names and original row preambles. If original files are present at their recorded paths, the script verifies their hashes before training. Direct XLSX import reads cached values using the Python standard library; source spreadsheets are never saved or modified. Required model packages are numpy and scikit-learn (versions recorded in day-model-evaluation.json).

The portable model uses x = (HRT hours − 13) / 11. Evaluate its documented basis and coefficient dot products. `hours-parity.json` contains reference predictions. The full 2,000-point range plus source inputs passed coefficient-export parity within 1e-9.
