# Executable Aquaivolt LangGraph proof

This directory demonstrates the backend workflow using real LangGraph orchestration and saved scikit-learn model files.

## Fastest Windows demonstration

Double-click `RUN_AI_WORKFLOW.bat`. On its first run, it installs the Python dependencies. It then:

1. Runs the workflow using `sample_input.json`.
2. Prints every completed LangGraph node.
3. Saves the complete result to `run-evidence/latest_run.json`.
4. Runs a reproducibility test twice.

## Files

- `src/aquaivolt_langgraph_backend.py` — actual workflow code.
- `models/` — saved Gradient Boosting and Ridge pipelines.
- `evaluation/` — model comparison results.
- `sample_input.json` — demonstration request.
- `run-evidence/latest_run.json` — previous verified execution.
- `tests/test_workflow.py` — deterministic repeatability test.

## Workflow nodes

`validate_request → feature_engineering → load_model_registry → run_candidate_models → select_model → derive_metrics → optimize_setpoints → safety_and_explanation → persist_audit`

This proof is separate from the current Vercel `/api/predict` implementation. That distinction is documented deliberately so an auditor can reproduce both implementations without misleading claims.
