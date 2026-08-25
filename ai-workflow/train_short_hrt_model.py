"""Reproducibly train and evaluate Aquaivolt's 2–24 hour research models.

The supplied source sheet is synthetic research data. This script evaluates
three supervised-learning approaches with the same five inputs and four output
targets, saves the fitted artifacts, and writes a compact evaluation manifest
that the deployed application exposes to auditors.

It does *not* claim that synthetic cross-validation is plant validation.

Run from the repository root:
    ai-workflow\\.venv\\Scripts\\python ai-workflow\\train_short_hrt_model.py
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
import xgboost
from sklearn.base import clone
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import KFold
from sklearn.multioutput import MultiOutputRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import PolynomialFeatures, StandardScaler


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path.home() / "Downloads" / "AQUAIVOLT_Hours-Scale_AI_Synthetic_500rows hrt hours.xlsx"
ARTIFACTS = ROOT / "ai-workflow" / "artifacts"
MANIFEST_PATH = ROOT / "app" / "lib" / "model-evaluation.generated.json"
FEATURES = [
    "Feed Rate (kg VS/d)",
    "Temperature (°C)",
    "pH",
    "OLR (kg VS/m³·d)",
    "HRT (hours)",
]
TARGETS = [
    "Optimized Biogas (m³/d)",
    "Methane Output (m³ CH₄/d)",
    "Electricity Potential (kWh/d)",
    "H₂S After Filter (ppm)",
]
TARGET_KEYS = ["biogas", "methane", "electricity", "h2s"]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_number(value: float) -> float:
    return round(float(value), 7)


def evaluate(name: str, label: str, estimator: object, x: np.ndarray, y: np.ndarray, folds: KFold) -> tuple[dict, object]:
    predictions = np.zeros_like(y, dtype=float)
    for train_index, test_index in folds.split(x):
        candidate = clone(estimator)
        candidate.fit(x[train_index], y[train_index])
        predictions[test_index] = candidate.predict(x[test_index])
    mae = mean_absolute_error(y, predictions, multioutput="raw_values")
    rmse = np.sqrt(mean_squared_error(y, predictions, multioutput="raw_values"))
    r2 = r2_score(y, predictions, multioutput="raw_values")
    ranges = np.ptp(y, axis=0)
    normalized_mae = mae / np.maximum(ranges, 1e-9)
    fitted = clone(estimator).fit(x, y)
    return {
        "id": name,
        "label": label,
        "normalizedMae": safe_number(np.mean(normalized_mae[:3])),
        "targets": {
            key: {"mae": safe_number(mae[index]), "rmse": safe_number(rmse[index]), "r2": safe_number(r2[index])}
            for index, key in enumerate(TARGET_KEYS)
        },
    }, fitted


def main() -> None:
    source = DEFAULT_SOURCE
    if not source.exists():
        raise FileNotFoundError(
            "Source workbook was not found. Put 'AQUAIVOLT_Hours-Scale_AI_Synthetic_500rows hrt hours.xlsx' in Downloads before training."
        )
    data = pd.read_excel(source, sheet_name="Hours-Scale AI Synthetic 500", header=4)
    data = data.dropna(subset=FEATURES + TARGETS).copy()
    x = data[FEATURES].astype(float).to_numpy()
    y = data[TARGETS].astype(float).to_numpy()
    folds = KFold(n_splits=5, shuffle=True, random_state=42)
    models = [
        (
            "ridge_polynomial",
            "Ridge regression with quadratic features",
            Pipeline([
                ("scale", StandardScaler()),
                ("polynomial", PolynomialFeatures(degree=2, include_bias=False)),
                ("ridge", Ridge(alpha=0.001)),
            ]),
        ),
        (
            "hist_gradient_boosting",
            "HistGradientBoosting multi-output regressor",
            MultiOutputRegressor(HistGradientBoostingRegressor(max_iter=220, max_leaf_nodes=15, learning_rate=0.06, l2_regularization=0.1, random_state=42)),
        ),
        (
            "xgboost",
            "XGBoost multi-output regressor",
            MultiOutputRegressor(xgboost.XGBRegressor(n_estimators=180, max_depth=3, learning_rate=0.05, subsample=0.9, colsample_bytree=0.9, reg_lambda=1.0, n_jobs=1, random_state=42, objective="reg:squarederror")),
        ),
    ]

    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    results: list[dict] = []
    artifacts: dict[str, str] = {}
    for model_id, label, estimator in models:
        result, fitted = evaluate(model_id, label, estimator, x, y, folds)
        output = ARTIFACTS / f"{model_id}.joblib"
        joblib.dump(fitted, output)
        result["artifact"] = str(output.relative_to(ROOT)).replace("\\", "/")
        result["artifactSha256"] = sha256(output)
        results.append(result)
        artifacts[model_id] = result["artifactSha256"]

    winner = min(results, key=lambda item: item["normalizedMae"])
    ridge = next(item for item in results if item["id"] == "ridge_polynomial")
    # The portable TypeScript predictor uses exported Ridge coefficients. Do not
    # silently replace it with a joblib-only winner at runtime.
    deployed = ridge
    manifest = {
        "schemaVersion": "short-hrt-evaluation-v2",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {
            "workbook": source.name,
            "sheet": "Hours-Scale AI Synthetic 500",
            "classification": "Synthetic research data — not operating-plant telemetry",
            "rowCount": int(len(data)),
            "sha256": sha256(source),
        },
        "features": ["feedRate", "temperature", "ph", "olr", "hrtHours"],
        "targets": TARGET_KEYS,
        "evaluation": {
            "method": "5-fold shuffled cross-validation with fixed random_state=42",
            "selectionMetric": "Mean normalized MAE across biogas, methane and electricity",
            "models": results,
        },
        "selection": {
            "numericalWinner": winner["label"],
            "numericalWinnerNormalizedMae": winner["normalizedMae"],
            "deployedModel": deployed["label"],
            "deployedModelNormalizedMae": deployed["normalizedMae"],
            "reason": "Ridge is the portable exported-coefficient inference model used by the Vercel application. Any change to the deployed model requires a new server runtime, evaluation review and administrator approval.",
            "approvalRequired": True,
        },
        "runtime": {
            "implementation": "TypeScript exported Ridge coefficients orchestrated by LangGraph",
            "artifacts": artifacts,
            "frameworkVersions": {"scikitLearn": sklearn.__version__, "xgboost": xgboost.__version__},
        },
        "limitations": [
            "Cross-validation measures fit to the supplied synthetic data generator, not predictive accuracy at a real plant.",
            "Recommendations are advisory; no equipment is controlled.",
            "Retraining must be approved after quality checks on timestamped plant data.",
        ],
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"manifest": str(MANIFEST_PATH), "winner": winner["label"], "deployed": deployed["label"], "rows": len(data)}, indent=2))


if __name__ == "__main__":
    main()
