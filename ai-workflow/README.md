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
- `run-evidence/latest_run.json` - generated execution record after running the workflow.
- `tests/test_workflow.py` — deterministic repeatability test.

## Workflow nodes

`validate_request → feature_engineering → load_model_registry → run_candidate_models → select_model → derive_metrics → optimize_setpoints → safety_and_explanation → persist_audit`

This proof is separate from the current Vercel `/api/predict` implementation. That distinction is documented deliberately so an auditor can reproduce both implementations without misleading claims.

## Trained models in the dashboard

The same saved fitted pipelines now execute at `/api/ml/predict` in the Admin Audit Trail. The Node service uses ONNX Runtime CPU, not the Python LangGraph orchestrator. The overview `/api/predict` remains the reference-based scenario engine.

`src/export_onnx_models.py` converts the existing trusted joblib files, including their fitted preprocessing. It does not retrain or replace learned coefficients/trees. It creates `models/onnx/manifest.json`, two ONNX artifacts and `../tests/fixtures/trained-model-parity.json`.

From the application root, with the original Python 3.12 training environment and trusted local model files:

```powershell
ai-workflow/.venv/Scripts/python.exe -m pip install -r ai-workflow/requirements-export.txt
ai-workflow/.venv/Scripts/python.exe ai-workflow/src/export_onnx_models.py
node --test tests/trained-models.test.mjs
pnpm test
```

The export was verified using scikit-learn 1.9.0, skl2onnx 1.20.0 and ONNX Runtime 1.23.2. All 674 cases per model, including tree split boundaries, must pass absolute tolerance 0.0001 plus relative tolerance 0.000001. Numeric preprocessing remains float64; transformed tree inputs are cast to float32 to match scikit-learn's tree inference. Ridge is exact in these checks; Gradient Boosting has small floating-point differences.

Gradient Boosting has six trained features and ten fitted reference rows. Ridge has eight trained features and 800 fitted rows. Neither uses feed rate; only Ridge uses VFA and mixing. The pipelines have different target definitions, so their outputs must not be labeled baseline versus optimized gains. Archived evaluation scores are included with provenance, not represented as independent plant validation.

The native Node package includes the Windows/Linux CPU runtimes. `.npmrc` disables optional CUDA downloads. The Next.js production build uses its supported Webpack path and traces the Linux CPU shared library from its resolved physical package directory, avoiding files nested under a package symlink in Vercel's function bundle. It also traces the model files and excludes non-Linux-x64 native binaries on Vercel. Production must be checked with authenticated `GET /api/ml/predict` and a prediction/replay after deployment.
