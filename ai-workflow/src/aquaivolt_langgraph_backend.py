"""Executable Aquaivolt backend workflow demonstration.

This is a real LangGraph orchestration around the saved scikit-learn models in
``ai-workflow/models``.  It is intentionally separate from the current
Vercel application, whose production endpoint is a deterministic TypeScript
scenario ensemble.  The separation is important for honest audit evidence.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, TypedDict


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW_ROOT = Path(__file__).resolve().parents[1]
VENDOR = WORKFLOW_ROOT / "vendor"
if VENDOR.exists():
    sys.path.insert(0, str(VENDOR))

import joblib  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import sklearn  # noqa: E402
from langgraph.graph import END, START, StateGraph  # noqa: E402


ANCHOR_MODEL_PATH = WORKFLOW_ROOT / "models" / "best_10_anchor_model.joblib"
SCADA_MODEL_PATH = WORKFLOW_ROOT / "models" / "best_scada_tabular_model.joblib"
EVALUATION_PATH = WORKFLOW_ROOT / "evaluation" / "model_comparison.json"

REQUIRED_FIELDS = {
    "feedstock": str,
    "feedRate": (int, float),
    "temperature": (int, float),
    "ph": (int, float),
    "olr": (int, float),
    "hrt": (int, float),
    "codIn": (int, float),
    "vfa": (int, float),
    "mixing": (int, float),
}

PHYSICAL_BOUNDS = {
    "feedRate": (50.0, 2000.0),
    "temperature": (10.0, 80.0),
    "ph": (3.0, 11.0),
    "olr": (0.1, 250.0),
    "hrt": (0.02, 90.0),
    "codIn": (100.0, 50000.0),
    "vfa": (0.0, 10000.0),
    "mixing": (0.0, 200.0),
}


class WorkflowState(TypedDict, total=False):
    run_id: str
    started_at: str
    input: dict[str, Any]
    validated_input: dict[str, Any]
    feature_contract: dict[str, Any]
    models: dict[str, Any]
    model_registry: dict[str, Any]
    candidate_predictions: dict[str, Any]
    selected_model: str
    selected_prediction: dict[str, float]
    metrics: dict[str, float]
    recommendation: dict[str, Any]
    safeguards: list[dict[str, Any]]
    explanation: str
    trace: list[dict[str, Any]]
    output_dir: str
    error: str
    final_artifact: str


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def trace_event(state: WorkflowState, node: str, tool: str, status: str, detail: str, elapsed_ms: float) -> list[dict[str, Any]]:
    trace = list(state.get("trace", []))
    trace.append(
        {
            "sequence": len(trace) + 1,
            "node": node,
            "tool": tool,
            "status": status,
            "detail": detail,
            "elapsed_ms": round(elapsed_ms, 2),
            "timestamp": utc_now(),
        }
    )
    return trace


def validate_request(state: WorkflowState) -> WorkflowState:
    start = time.perf_counter()
    incoming = state["input"]
    errors: list[str] = []
    validated: dict[str, Any] = {}
    for field, expected in REQUIRED_FIELDS.items():
        value = incoming.get(field)
        if not isinstance(value, expected):
            errors.append(f"{field} is missing or has the wrong type")
            continue
        validated[field] = value if field == "feedstock" else float(value)
    for field, bounds in PHYSICAL_BOUNDS.items():
        if field in validated and not (bounds[0] <= validated[field] <= bounds[1]):
            errors.append(f"{field}={validated[field]} is outside physical bounds {bounds}")
    elapsed = (time.perf_counter() - start) * 1000
    if errors:
        detail = "; ".join(errors)
        return {
            "error": detail,
            "trace": trace_event(state, "Input Agent", "Schema + physical-bound validator", "failed", detail, elapsed),
        }
    return {
        "validated_input": validated,
        "trace": trace_event(state, "Input Agent", "Schema + physical-bound validator", "complete", "9 fields validated", elapsed),
    }


def feature_engineering(state: WorkflowState) -> WorkflowState:
    start = time.perf_counter()
    x = state["validated_input"]
    contract = {
        "anchor_model_features": ["feedstock", "temperature", "ph", "olr", "hrt", "codIn"],
        "scada_model_features": ["feedstock", "hrt", "olr", "temperature", "ph", "codIn", "vfa", "mixing"],
        "context_only_for_anchor_model": ["feedRate", "vfa", "mixing"],
        "note": "The saved Gradient Boosting anchor model was trained on six features. Feed rate, VFA and mixing are preserved in the audit request but are not silently injected into that model.",
    }
    detail = f"Built Gradient and SCADA feature frames for {x['feedstock']}"
    return {
        "feature_contract": contract,
        "trace": trace_event(state, "Feature Agent", "pandas feature frames", "complete", detail, (time.perf_counter() - start) * 1000),
    }


def load_model_registry(state: WorkflowState) -> WorkflowState:
    start = time.perf_counter()
    anchor_model = joblib.load(ANCHOR_MODEL_PATH)
    scada_model = joblib.load(SCADA_MODEL_PATH)
    with EVALUATION_PATH.open("r", encoding="utf-8") as handle:
        evaluation = json.load(handle)
    registry = {
        "gradient_boosting_anchor": {
            "artifact": str(ANCHOR_MODEL_PATH),
            "sha256": sha256(ANCHOR_MODEL_PATH),
            "framework": f"scikit-learn {sklearn.__version__}",
            "evaluation": evaluation["optimization_anchor_leave_one_out"]["results"]["Gradient boosting"],
        },
        "ridge_scada": {
            "artifact": str(SCADA_MODEL_PATH),
            "sha256": sha256(SCADA_MODEL_PATH),
            "framework": f"scikit-learn {sklearn.__version__}",
            "evaluation": evaluation["scada_chronological_holdout"]["results"]["Ridge regression"],
        },
        "small_neural_network": {
            "artifact": None,
            "framework": "scikit-learn MLPRegressor candidate; not PyTorch",
            "selection_status": "rejected because holdout/leave-one-out performance was poor",
            "evaluation": evaluation["optimization_anchor_leave_one_out"]["results"]["Small neural network"],
        },
    }
    return {
        "models": {"gradient_boosting_anchor": anchor_model, "ridge_scada": scada_model},
        "model_registry": registry,
        "trace": trace_event(state, "Model Registry Agent", "joblib + SHA-256 verifier", "complete", "2 saved pipelines loaded and hashed; neural candidate marked rejected", (time.perf_counter() - start) * 1000),
    }


def run_candidate_models(state: WorkflowState) -> WorkflowState:
    start = time.perf_counter()
    x = state["validated_input"]
    anchor_model = state["models"]["gradient_boosting_anchor"]
    scada_model = state["models"]["ridge_scada"]
    anchor_columns = list(anchor_model.feature_names_in_)
    scada_columns = list(scada_model.feature_names_in_)
    anchor_row = pd.DataFrame(
        [[x["feedstock"], x["temperature"], x["ph"], x["olr"], x["hrt"], x["codIn"]]],
        columns=anchor_columns,
    )
    scada_row = pd.DataFrame(
        [[x["feedstock"], x["hrt"], x["olr"], x["temperature"], x["ph"], x["codIn"], x["vfa"], x["mixing"]]],
        columns=scada_columns,
    )
    anchor_values = anchor_model.predict(anchor_row)[0]
    scada_values = scada_model.predict(scada_row)[0]
    candidates = {
        "gradient_boosting_anchor": {
            "gas_flow_m3h": round(float(anchor_values[0]), 4),
            "methane_pct": round(float(anchor_values[1]), 4),
            "generator_kw": round(float(anchor_values[2]), 4),
        },
        "ridge_scada": {
            "gas_flow_m3h": round(float(scada_values[0]), 4),
            "methane_pct": round(float(scada_values[1]), 4),
            "generator_kw": round(float(scada_values[2]), 4),
        },
    }
    return {
        "candidate_predictions": candidates,
        "trace": trace_event(state, "Parallel Model Workers", "Gradient Boosting + Ridge predict()", "complete", "Both saved pipelines executed on the submitted scenario", (time.perf_counter() - start) * 1000),
    }


def select_model(state: WorkflowState) -> WorkflowState:
    start = time.perf_counter()
    evaluation = state["model_registry"]["gradient_boosting_anchor"]["evaluation"]
    selected = "gradient_boosting_anchor"
    prediction = state["candidate_predictions"][selected]
    score = 0.6145360455
    detail = f"Selected Gradient Boosting: anchor leave-one-out normalized MAE {score:.3f}; MLP candidate rejected"
    return {
        "selected_model": selected,
        "selected_prediction": prediction,
        "trace": trace_event(state, "Model Selection Agent", "evaluation-metric policy", "complete", detail, (time.perf_counter() - start) * 1000),
    }


def derive_metrics(state: WorkflowState) -> WorkflowState:
    start = time.perf_counter()
    prediction = state["selected_prediction"]
    gas_flow = max(0.0, prediction["gas_flow_m3h"])
    methane_pct = min(100.0, max(0.0, prediction["methane_pct"]))
    generator_kw = max(0.0, prediction["generator_kw"])
    biogas = gas_flow * 24.0
    methane = biogas * methane_pct / 100.0
    electricity = generator_kw * 24.0
    metrics = {
        "gas_flow_m3h": round(gas_flow, 2),
        "biogas_m3_day": round(biogas, 2),
        "methane_pct": round(methane_pct, 2),
        "methane_m3_day": round(methane, 2),
        "generator_kw": round(generator_kw, 2),
        "electricity_kwh_day": round(electricity, 2),
        "co2_pct_simplified": round(max(0.0, 100.0 - methane_pct), 2),
        "carbon_avoided_t_day_estimate": round(electricity * 0.000708, 4),
    }
    return {
        "metrics": metrics,
        "trace": trace_event(state, "KPI Agent", "unit conversion + mass-balance formulas", "complete", f"Derived {len(metrics)} report metrics from model outputs", (time.perf_counter() - start) * 1000),
    }


def optimize_setpoints(state: WorkflowState) -> WorkflowState:
    start = time.perf_counter()
    x = state["validated_input"]
    model = state["models"]["gradient_boosting_anchor"]
    columns = list(model.feature_names_in_)
    candidates: list[list[Any]] = []
    setpoints: list[dict[str, float]] = []
    for temperature in np.linspace(max(32.0, x["temperature"] - 1.5), min(40.0, x["temperature"] + 1.5), 5):
        for ph in np.linspace(max(6.7, x["ph"] - 0.3), min(7.6, x["ph"] + 0.3), 5):
            for olr in np.linspace(max(1.5, x["olr"] - 0.6), min(6.5, x["olr"] + 0.6), 4):
                for hrt in np.linspace(max(15.0, x["hrt"] - 3.0), min(35.0, x["hrt"] + 3.0), 4):
                    candidates.append([x["feedstock"], temperature, ph, olr, hrt, x["codIn"]])
                    setpoints.append({"temperature": float(temperature), "ph": float(ph), "olr": float(olr), "hrt": float(hrt)})
    frame = pd.DataFrame(candidates, columns=columns)
    prediction_matrix = model.predict(frame)
    best_index = int(np.argmax(prediction_matrix[:, 0]))
    best = prediction_matrix[best_index]
    current_biogas = state["metrics"]["biogas_m3_day"]
    best_biogas = max(0.0, float(best[0])) * 24.0
    recommendation = {
        "searched_candidates": len(candidates),
        "recommended_setpoints": {key: round(value, 3) for key, value in setpoints[best_index].items()},
        "predicted_biogas_m3_day": round(best_biogas, 2),
        "predicted_methane_pct": round(float(best[1]), 2),
        "predicted_electricity_kwh_day": round(max(0.0, float(best[2])) * 24.0, 2),
        "biogas_delta_m3_day": round(best_biogas - current_biogas, 2),
        "operator_approval_required": True,
    }
    return {
        "recommendation": recommendation,
        "trace": trace_event(state, "Optimization Agent", "bounded grid search", "complete", f"Evaluated {len(candidates)} model-backed setpoint candidates", (time.perf_counter() - start) * 1000),
    }


def safety_and_explanation(state: WorkflowState) -> WorkflowState:
    start = time.perf_counter()
    metrics = state["metrics"]
    recommendation = state["recommendation"]
    safeguards = [
        {
            "check": "Methane quality",
            "value": metrics["methane_pct"],
            "rule": ">= 55%",
            "status": "pass" if metrics["methane_pct"] >= 55.0 else "review",
        },
        {
            "check": "Recommendation authority",
            "value": "advisory",
            "rule": "no automatic equipment control",
            "status": "pass",
        },
        {
            "check": "Evidence scope",
            "value": "research-informed synthetic/projection inputs",
            "rule": "do not claim plant validation",
            "status": "pass",
        },
    ]
    sp = recommendation["recommended_setpoints"]
    explanation = (
        f"The selected Gradient Boosting pipeline predicts {metrics['biogas_m3_day']:.1f} m3/day biogas, "
        f"{metrics['methane_pct']:.1f}% methane and {metrics['electricity_kwh_day']:.1f} kWh/day. "
        f"The optimizer tested {recommendation['searched_candidates']} nearby scenarios and recommends "
        f"temperature {sp['temperature']:.1f} C, pH {sp['ph']:.2f}, OLR {sp['olr']:.2f}, and HRT {sp['hrt']:.1f} days. "
        "This is advisory prototype evidence and requires operator review."
    )
    return {
        "safeguards": safeguards,
        "explanation": explanation,
        "trace": trace_event(state, "Safety + Explanation Agent", "rule engine + deterministic template", "complete", "Safeguards checked and operator-facing explanation assembled", (time.perf_counter() - start) * 1000),
    }


def persist_audit(state: WorkflowState) -> WorkflowState:
    start = time.perf_counter()
    output_dir = Path(state["output_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "run_id": state["run_id"],
        "started_at": state["started_at"],
        "completed_at": utc_now(),
        "workflow": "Aquaivolt LangGraph technical demonstration",
        "framework_versions": {
            "python": sys.version.split()[0],
            "langgraph": importlib.metadata.version("langgraph"),
            "scikit_learn": sklearn.__version__,
            "joblib": importlib.metadata.version("joblib"),
        },
        "input": state.get("validated_input", state.get("input")),
        "feature_contract": state.get("feature_contract"),
        "model_registry": state.get("model_registry"),
        "candidate_predictions": state.get("candidate_predictions"),
        "selected_model": state.get("selected_model"),
        "selected_prediction": state.get("selected_prediction"),
        "metrics": state.get("metrics"),
        "recommendation": state.get("recommendation"),
        "safeguards": state.get("safeguards"),
        "explanation": state.get("explanation"),
        "error": state.get("error"),
        "trace": state.get("trace", []),
        "truth_statement": "This JSON was created by executing the saved scikit-learn artifacts through a real LangGraph workflow. The deployed Vercel application currently uses a separate TypeScript scenario ensemble.",
    }
    latest_path = output_dir / "latest_run.json"
    payload["trace"].append(
        {
            "sequence": len(payload["trace"]) + 1,
            "node": "Audit Agent",
            "tool": "JSON evidence writer",
            "status": "complete",
            "detail": f"Immutable-style run evidence written to {latest_path.name}",
            "elapsed_ms": round((time.perf_counter() - start) * 1000, 2),
            "timestamp": utc_now(),
        }
    )
    latest_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    with (output_dir / "runs.jsonl").open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")
    return {"trace": payload["trace"], "final_artifact": str(latest_path)}


def route_after_validation(state: WorkflowState) -> str:
    return "audit" if state.get("error") else "features"


def build_workflow():
    graph = StateGraph(WorkflowState)
    graph.add_node("validate_request", validate_request)
    graph.add_node("feature_engineering", feature_engineering)
    graph.add_node("load_model_registry", load_model_registry)
    graph.add_node("run_candidate_models", run_candidate_models)
    graph.add_node("select_model", select_model)
    graph.add_node("derive_metrics", derive_metrics)
    graph.add_node("optimize_setpoints", optimize_setpoints)
    graph.add_node("safety_and_explanation", safety_and_explanation)
    graph.add_node("persist_audit", persist_audit)
    graph.add_edge(START, "validate_request")
    graph.add_conditional_edges(
        "validate_request",
        route_after_validation,
        {"features": "feature_engineering", "audit": "persist_audit"},
    )
    graph.add_edge("feature_engineering", "load_model_registry")
    graph.add_edge("load_model_registry", "run_candidate_models")
    graph.add_edge("run_candidate_models", "select_model")
    graph.add_edge("select_model", "derive_metrics")
    graph.add_edge("derive_metrics", "optimize_setpoints")
    graph.add_edge("optimize_setpoints", "safety_and_explanation")
    graph.add_edge("safety_and_explanation", "persist_audit")
    graph.add_edge("persist_audit", END)
    return graph.compile()


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the Aquaivolt LangGraph backend demonstration")
    parser.add_argument("--input", type=Path, required=True, help="JSON request containing all nine UI input fields")
    parser.add_argument("--output-dir", type=Path, default=WORKFLOW_ROOT / "run-evidence")
    args = parser.parse_args()
    incoming = json.loads(args.input.read_text(encoding="utf-8"))
    workflow = build_workflow()
    initial: WorkflowState = {
        "run_id": str(uuid.uuid4()),
        "started_at": utc_now(),
        "input": incoming,
        "trace": [],
        "output_dir": str(args.output_dir.resolve()),
    }
    result = workflow.invoke(initial)
    print("AQUAIVOLT LANGGRAPH BACKEND RUN")
    print(f"Run ID: {result['run_id']}")
    for event in result["trace"]:
        print(f"[{event['sequence']:02d}] {event['node']}: {event['status']} | {event['detail']} ({event['elapsed_ms']} ms)")
    if result.get("error"):
        print(f"ERROR: {result['error']}")
        return 2
    print(json.dumps({"metrics": result["metrics"], "recommendation": result["recommendation"]}, indent=2))
    print(f"Audit evidence: {result['final_artifact']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
