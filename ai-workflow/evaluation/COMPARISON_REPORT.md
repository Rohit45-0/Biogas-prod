# Aquaivolt model comparison

## Data audit

- The two SCADA workbooks are exact duplicates; only one copy was used (1,000 rows).
- The SCADA workbook describes its rows as synthetic records and does not contain feed rate.
- The 500-row hours-scale workbook describes its rows as interpolation/noise-augmented synthetic data.
- The 500-row below-six-hour workbook describes its rows as extreme engineering extrapolations that are not site-validated.
- Three rows (RUN-11 to RUN-13) are literature-informed engineering projections, not direct site measurements.
- The 10 optimization anchors contain feedstock, temperature, pH, OLR, HRT and COD, but not feed rate, VFA or mixer speed.

## Experiment 1: SCADA chronological holdout

Training used the first 800 timestamped rows and testing used the final 200. Inputs were feedstock, HRT, OLR, temperature, pH, COD, VFA and mixer speed. Targets were gas flow, methane percentage and generator power.

The mean-only baseline ranked first. Ridge regression was the best trained model, but its R² scores were approximately zero: gas flow -0.016, methane 0.006 and generator power -0.017. This means the supplied SCADA input columns do not predict its output columns better than using their averages.

The small neural network ranked last and strongly overfit the generated table.

## Experiment 2: 10 optimization anchors

Leave-one-out validation was used because only ten rows are available. Gradient boosting was the best conventional ML model. Its mean absolute errors were:

- Gas flow after AI: 9.58 m³/h
- Methane after AI: 1.38 percentage points
- Generator after AI: 3.94 kW

The current scenario ensemble under the same leave-one-out test produced 9.86 m³/h, 1.52 percentage points and 3.81 kW respectively. The difference is small and uncertain with only ten test cases.

## Experiment 3: literature-projection stress test

Models trained on the normal 10-run table were tested against RUN-11 to RUN-13. Ridge regression extrapolated closest overall, but this only measures agreement with engineering projections. It is not validation against physical plant measurements.

## Recommendation

Do not replace the application model with the neural network or the SCADA-trained model. Keep the current transparent ensemble for the prototype, or trial a hybrid in which gradient boosting predicts the six supported core variables while documented engineering modifiers continue to handle feed rate, VFA and mixer speed.

For a defensible production model, collect rows where all nine application inputs and measured biogas, methane and electricity outputs occur together at the same timestamp.
