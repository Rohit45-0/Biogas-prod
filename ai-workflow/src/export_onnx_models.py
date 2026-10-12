"""Export the existing fitted pipelines, without retraining, and verify parity."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import joblib
import numpy as np
import onnx
import onnxruntime as ort
import pandas as pd
import sklearn
import skl2onnx
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import DoubleTensorType, StringTensorType

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / "ai-workflow"
OUTPUT = WORKFLOW / "models" / "onnx"
FIXTURES = ROOT / "tests" / "fixtures"
BASE = dict(feedstock="Dairy WW", feedRate=846, temperature=36.5, ph=7.2,
            olr=3.2, hrt=22, codIn=7600, vfa=1100, mixing=50)
FEEDSTOCKS = ["Dairy WW", "Cow Manure", "Food Waste", "Paper Mill", "Brewery", "Mixed Waste"]
BOUNDS = dict(feedRate=(820, 870), temperature=(34.08, 38.87), ph=(6.82, 7.58),
              olr=(1.55, 6.38), hrt=(15.45, 34.62), codIn=(3205, 11864),
              vfa=(251, 2963), mixing=(20, 79))
CONTRACTS = {
    "gradient_boosting": dict(file="best_10_anchor_model.joblib", name="Gradient Boosting",
                              features=["feedstock", "temperature", "ph", "olr", "hrt", "codIn"],
                              evaluation="optimization_anchor_leave_one_out", evaluation_model="Gradient boosting",
                              targets="After-AI reference gas flow, methane content and generator power",
                              data="10 paired optimization reference rows"),
    "ridge": dict(file="best_scada_tabular_model.joblib", name="Ridge Regression",
                  features=["feedstock", "hrt", "olr", "temperature", "ph", "codIn", "vfa", "mixing"],
                  evaluation="scada_chronological_holdout", evaluation_model="Ridge regression",
                  targets="SCADA-template gas flow, methane content and generator power",
                  data="SCADA data template; chronological training split"),
}


def digest(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    FIXTURES.mkdir(parents=True, exist_ok=True)
    evaluation = json.loads((WORKFLOW / "evaluation/model_comparison.json").read_text(encoding="utf8"))
    rng = np.random.default_rng(17092026)
    cases = [BASE.copy(), dict(BASE, feedstock="Food Waste", feedRate=861, temperature=36.8, ph=7.31,
                               olr=3.74, hrt=19.5, codIn=9450, vfa=1275, mixing=57)]
    cases += [dict(BASE, feedstock=f) for f in FEEDSTOCKS]
    for key, (low, high) in BOUNDS.items():
        cases += [dict(BASE, **{key: value}) for value in (low, high)]
    cases += [dict(feedstock=FEEDSTOCKS[i % len(FEEDSTOCKS)],
                   **{k: float(rng.uniform(*bounds)) for k, bounds in BOUNDS.items()}) for i in range(512)]
    # sklearn casts the transformed tree inputs to float32. Probe split boundaries
    # explicitly so random-case agreement cannot conceal a different branch decision.
    tree_pipeline = joblib.load(WORKFLOW / "models" / CONTRACTS["gradient_boosting"]["file"])
    scaler = tree_pipeline.named_steps["pre"].named_transformers_["num"]
    categories = tree_pipeline.named_steps["pre"].named_transformers_["cat"].categories_[0]
    thresholds = set()
    numeric_keys = CONTRACTS["gradient_boosting"]["features"][1:]
    for estimator in tree_pipeline.named_steps["model"].estimators_:
        for tree in estimator.estimators_.flat:
            for index, threshold in zip(tree.tree_.feature, tree.tree_.threshold):
                numeric_index = int(index) - len(categories)
                if 0 <= numeric_index < len(numeric_keys):
                    thresholds.add((numeric_index, float(threshold)))
    for index, threshold in sorted(thresholds):
        key = numeric_keys[index]
        for offset in (-1e-8, 0, 1e-8):
            value = (threshold + offset) * scaler.scale_[index] + scaler.mean_[index]
            if BOUNDS[key][0] <= value <= BOUNDS[key][1]:
                cases.append(dict(BASE, **{key: float(value)}))
    manifest = {"version": "trained-ml-1.0.0", "runtime": "ONNX Runtime CPU",
                "export": {"scikitLearn": sklearn.__version__, "skl2onnx": skl2onnx.__version__,
                           "onnx": onnx.__version__, "onnxruntime": ort.__version__},
                "parityTolerance": {"absolute": 0.0001, "relative": 0.000001},
                "trainingProvenance": "Research-informed reference and projected data; not independent plant measurements",
                "evaluationSourceHash": digest((WORKFLOW / "evaluation/model_comparison.json").read_bytes()),
                "models": {}}
    fixtures = {"cases": cases, "expected": {}}
    for model_id, config in CONTRACTS.items():
        source = WORKFLOW / "models" / config["file"]
        model = joblib.load(source)
        columns = list(model.feature_names_in_)
        assert len(columns) == len(config["features"])
        schema = [(column, StringTensorType([None, 1]) if key == "feedstock" else DoubleTensorType([None, 1]))
                  for key, column in zip(config["features"], columns)]
        converted = convert_sklearn(model, initial_types=schema, target_opset=18)
        nodes = []
        for index, node in enumerate(converted.graph.node):
            if node.op_type == "TreeEnsembleRegressor":
                float_input = f"tree_float32_input_{index}"
                nodes.append(onnx.helper.make_node("Cast", [node.input[0]], [float_input],
                                                   to=onnx.TensorProto.FLOAT))
                node.input[0] = float_input
            nodes.append(node)
        del converted.graph.node[:]
        converted.graph.node.extend(nodes)
        onnx.checker.check_model(converted)
        data = converted.SerializeToString()
        filename = model_id + ".onnx"
        session = ort.InferenceSession(data, providers=["CPUExecutionProvider"])
        feeds = {item.name: np.array([[row[key]] for row in cases], dtype=object if key == "feedstock" else np.float64)
                 for item, key in zip(session.get_inputs(), config["features"])}
        frame = pd.DataFrame([[row[key] for key in config["features"]] for row in cases], columns=columns)
        expected = model.predict(frame)
        actual = session.run(None, feeds)[0]
        np.testing.assert_allclose(actual, expected, rtol=0.000001, atol=0.0001,
                                   err_msg=f"{model_id}: export does not match the saved fitted pipeline")
        (OUTPUT / filename).write_bytes(data)
        pre = model.named_steps["pre"]
        sample_count = int(np.asarray(pre.named_transformers_["num"].n_samples_seen_).min())
        error = np.abs(actual - expected).max(axis=0).tolist()
        eval_section = evaluation[config["evaluation"]]
        metadata = dict(id=model_id, name=config["name"], version=manifest["version"], filename=filename,
                        sourceArtifact=f"ai-workflow/models/{config['file']}", sourceArtifactHash=digest(source.read_bytes()),
                        artifactHash=digest(data), trainedFeatureCount=len(columns), fittedRows=sample_count,
                        features=[dict(key=key, column=column, tensor=item.name, type="string" if key == "feedstock" else "float64")
                                  for key, column, item in zip(config["features"], columns, session.get_inputs())],
                        contextOnly=[key for key in BASE if key not in config["features"]],
                        categories=pre.named_transformers_["cat"].categories_[0].tolist(),
                        targetBasis=config["targets"], trainingData=config["data"],
                        outputName=session.get_outputs()[0].name,
                        outputKeys=["gasFlowM3h", "methanePct", "generatorKw"],
                        parity=dict(caseCount=len(cases), maxAbsoluteError=error, status="PASS"),
                        evaluation=dict(status="ARCHIVED - NOT PLANT VALIDATION", method=config["evaluation"],
                                        results=eval_section["results"][config["evaluation_model"]],
                                        source="ai-workflow/evaluation/model_comparison.json"))
        manifest["models"][model_id] = metadata
        fixtures["expected"][model_id] = expected.tolist()
        print(json.dumps({"model": model_id, "fittedRows": sample_count, "bytes": len(data),
                          "operators": sorted({node.op_type for node in converted.graph.node}),
                          "parityCases": len(cases), "maxAbsoluteError": error}), flush=True)
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=True) + "\n", encoding="utf8")
    (FIXTURES / "trained-model-parity.json").write_text(json.dumps(fixtures, ensure_ascii=True) + "\n", encoding="utf8")


if __name__ == "__main__":
    main()
