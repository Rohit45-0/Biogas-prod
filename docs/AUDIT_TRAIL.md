# AQUAIVOLT Audit Trail

## Access and test sequence

Sign in to the current production dashboard at https://aquaivolt-command-center.vercel.app using the Admin account. Select **Audit Trail** in the sidebar. The normal User account retains the one-button overview and can export its own candidate runs, but cannot access other users' evidence or run Admin tests.

### Trained ML predictions (default audit view)

1. Select an operating profile or enter explicit values. **Run ML prediction** calls `/api/ml/predict` and executes both trained pipelines: Gradient Boosting and Ridge Regression. There is no scenario fallback or simulation seed.
2. Inspect the actual HTTP status, run ID, raw gas flow, methane content and generator power, daily derived outputs, trained input values, context-only values, artifact hashes and timed execution trace.
3. **Test null rejection** submits null pH and expects HTTP 422 with a field-specific error. Missing operating conditions also return 422; this endpoint never silently substitutes a reference profile.
4. **Verify ML run** reads the signed stored record and runs both fitted pipelines again. Eleven checks cover record integrity, inputs, model build, artifact identity, trained feature mapping, prediction repeatability and daily unit conversions. The verification report is itself persisted and read back.
5. Download signed JSON, evidence CSV or Prediction CSV (one row per trained model). Audit records can retrieve an older ML run and reopen it for replay. Replay across a changed model manifest is rejected, while original saved evidence remains retrievable.

These two models use different training data and target definitions. Their outputs are not a baseline/after pair, and no winner is chosen by larger predicted output. Gradient Boosting uses six features and ten fitted reference rows. Ridge uses eight features and 800 fitted rows. Feed rate is context only for both; VFA and mixer speed are features only for Ridge. The UI and records expose this contract explicitly.

### Overview scenario tests

1. **Input & execution:** select a reference profile or adjust the nine values. HRT is entered in days. Keep a fixed seed for reproducibility. Run test 1. Inspect the actual HTTP status, submitted and executed inputs, baseline/optimized outputs, selected inputs, execution trace, and run ID. A storage failure prevents a passing execution status.
2. **Null rejection:** sends an actual request with a null pH. Expected result is HTTP 422 with a field-specific error, not invented output or silently defaulted pH.
3. **Model verification:** run test 2 against the recorded run. The server independently reads the record, checks its SHA-256 hashes and HMAC, verifies the active build, reruns the same engine with the recorded seed, and compares output fingerprints. The verification report is also stored and read back before it is returned as saved.
4. **Comparison:** runs two reference profiles through `/api/reports/batch`, which calls the same execution service as `/api/predict`. Both cases use the same seed and objective weights and receive individual persistent run IDs.
5. **Audit records:** retrieve a run or verification report by ID, inspect its integrity result, or select a stored run for verification. Reloading the page does not remove stored records. Record pages are individually sorted by timestamp; pagination is not a globally chronological index.
6. Download signed JSON, evidence CSV, and the 2,000 evaluated candidate rows. Use Print evidence for the current visible audit section. The candidate CSV is **not model training data**.

## Actual execution architecture

Authenticated request -> strict input validation/profile resolution -> TypeScript model -> seeded bounded candidate search -> highest-scoring candidate -> output calculation and timed trace -> signed private storage write -> independent readback -> response with RECORDED or NOT RECORDED.

The trained ML route instead runs: Admin authentication -> strict explicit input validation -> hash-checked ONNX artifacts -> original fitted preprocessing and learned Gradient Boosting/Ridge inference -> raw predictions -> daily unit derivation -> signed private storage -> independent readback. It does not invoke the scenario engine or an LLM.

Production uses private Vercel Blob storage linked to the existing Vercel project. Records are never stored only in a serverless process variable or temporary filesystem. Local integration tests use an explicitly configured `AQUA_AUDIT_DIR`; this fallback is disabled on Vercel. Existing older, unrecorded runs cannot be recreated as historical evidence.

Each record contains the request, effective inputs, complete model response, username/role, UTC timestamp, UUID, model version, manifest hash, request/input/response/output hashes, record hash, and server HMAC signature. Server logs contain structured completion/failure events keyed by run ID; the retrievable response contains the model-stage trace. These records attest to what this application executed, not to the provenance of plant measurements.

## Model reconciliation

- Overview `/api/predict`: **Multi-Input Scenario Ensemble 1.8.0**.
- Overview implementation: 10 embedded paired reference anchors, distance weighting, explicit process formulas, and 2,000 seeded candidate evaluations. Ridge is not used by this endpoint.
- Audit `/api/ml/predict`: **trained-ml-1.0.0**, original saved Gradient Boosting and Ridge pipelines exported to ONNX. Their encoders, scalers and learned weights execute through ONNX Runtime CPU. No retraining took place in this integration.
- Export parity against original Python inference passed 674 cases per model, including boundary cases. The exported pipeline and original joblib SHA-256 values are recorded. Parity confirms conversion fidelity, not predictive accuracy.
- The source manifest is regenerated before build and development startup from the model, input contract and model-card source files. The API also supplies a manifest hash and the Vercel deployment identifier.
- Archived Ridge, tree-model and neural-network evaluations are not measured-plant validation. Earlier presentations must distinguish the overview scenario endpoint from the now-deployed trained ML audit endpoint. Other evaluated model families remain undeployed.
- Objective weights are fixed. Identical inputs and seed reproduce model outputs. Normal overview runs receive fresh seeds, which can yield different candidates but do not guarantee different results or improved physical performance.
- Model HRT uses days; the dashboard shows hours using days multiplied by 24. Previous display-only short-hour values were not model-consistent. HRT reduction is not guaranteed.

## API contract

### Overview execution visualization

The overview and production dashboards request `POST /api/predict` with `Accept: application/x-ndjson`. The server reports eight stages: operating conditions, validation, candidate evaluation, production comparison, diagnostics, evidence assembly, audit persistence and response preparation. Fast model stages are forwarded in a batch using their existing recorded timestamps after model execution; this is not continuous per-candidate telemetry. No model formula, model artifact, manifest identity or objective weight is changed for this visualization.

The stream contains progress messages followed by one final `result` message. Authentication and invalid-input failures retain normal HTTP errors before streaming begins. A storage failure is reported as a warning and `NOT RECORDED`, not a successful saved record. A missing final result is treated as interrupted execution, without replacing previous dashboard results or automatically issuing a duplicate request. Plain JSON clients and Audit Trail tests remain supported.

The completed visualization exposes stage timestamps, returned production estimates, run ID and the actual saved-run candidate CSV. Trace replay is explicitly a client-side review of confirmed stages; pausing replay does not pause the backend or generate another run. No sensor connectivity or additional ML model execution is implied.

`POST /api/predict` requires an authenticated session. The normal application now sends explicit operating conditions. Example:

```json
{
  "profileId": "DAIRY-WW-001",
  "operatingConditions": {
    "feedstock": "Dairy WW",
    "feedRate": 846,
    "temperature": 36.5,
    "ph": 7.2,
    "olr": 3.2,
    "hrt": 22,
    "codIn": 7600,
    "vfa": 1100,
    "mixing": 50
  },
  "seed": "audit-test-001"
}
```

The optional fixed seed is Admin-only. Custom inputs receive profile ID CUSTOM when they do not match a stored profile. Null, missing, nonnumeric, unknown, or out-of-physical-range parameters are rejected with 422. Malformed JSON receives 400. `previousRun: null` in a legacy request means there is no earlier comparison, not that the engine executed null inputs: if operating conditions are omitted, the API explicitly resolves and returns the stored default profile. Unsupported profile IDs are rejected.

`GET /api/predict` returns the pre-run baseline and full reference profile. It is not a calculation request. `GET /api/model` identifies the active build. `GET /api/evaluation` is explicitly archived evidence.

Admin evidence endpoints:
- `GET /api/ml/predict`: actual load status, trained-model manifest, hashes and runtime version.
- `POST /api/ml/predict` with `{"operatingConditions":{...all nine explicit fields...}}`: predictions from both trained artifacts. Uses the same units as the example above, without profileId or seed. Invalid/null/missing fields return 422, not a prediction with default values.
- `POST /api/ml/verify` with `{"runId":"<uuid>"}`: independently retrieve and replay a saved ML prediction.
- `GET /api/ml/predict?runId=<uuid>&format=csv`: export both actual saved model predictions, units, target basis and hashes.
- `GET /api/audit?runId=<uuid>`: signed record and integrity result; 404 if absent.
- `GET /api/audit?limit=20&cursor=<cursor>`: record pages.
- `POST /api/audit/tests` with `{"runId":"<uuid>"}`: verification and stored report.
- `POST /api/reports/batch` with `{"requests":[<request>,<request>]}`: 2-5 comparisons.
- `GET /api/audit?runId=<uuid>&format=json` or `format=csv`: evidence downloads.
- `GET /api/predict?runId=<uuid>&format=csv`: 2,000 evaluated candidates. Requires the original stored run and matching current model manifest; cross-build exports fail explicitly instead of reconstructing different values.

## Limits and remaining external evidence

PASS applies to the listed software checks only. It does not establish independent plant prediction accuracy, calibrated statistical uncertainty, realized optimization gains, scientific validity of the reference formulas, or grant approval. Those require measured plant data, traceable provenance, an agreed evaluation protocol and independent review. No live sensors or equipment control are connected.

The evidence signature is HMAC-SHA256 using the server's session secret. It is a server-held integrity mechanism, not a public-key signature or independently certified immutable ledger. Rotating that secret requires a plan for retaining old verification keys; otherwise older signatures will no longer verify. The Blob token must remain server-only. `RECORDED` is issued only after a successful write and fresh verified readback. Storage failure leaves results visible with NOT RECORDED and no passing verification report.

## Verification

`pnpm test` builds production code and exercises authentication, invalid inputs, baseline consistency, candidate/output consistency, deterministic replay, comparisons, exports, tamper detection, process-restart persistence, and storage-failure behavior. `scripts/verify-production.mjs` repeats live checks with credentials supplied through environment variables and writes a credential-free evidence bundle under `test-results/production`.

The tests also execute both native ML models on all 674 Python-generated parity fixtures and cover ML-specific input rejection, feature sensitivity, context-only invariance, signatures, eleven-check replay, CSV and persistent history. `scripts/verify-ml-production.mjs` verifies the deployed ML path separately.
