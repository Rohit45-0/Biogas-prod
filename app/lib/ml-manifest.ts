import exported from "../../ai-workflow/models/onnx/manifest.json";
import build from "./trained-build.json";
import {fingerprint} from "./evidence";
import {domainPolicy} from "./domain";

export const mlManifest={...exported,domainPolicy,sourceHash:build.sourceHash,endpoint:"POST /api/ml/predict",
  contract:"aquaivolt-trained-ml-v1",overviewEndpoint:"POST /api/predict",
  scope:"Predictions from two saved fitted pipelines. No automatic model selection, equipment control or plant-validation claim.",
  comparisonMeaning:"The two models have different training data and target definitions. Their predictions are not a before-versus-after optimization comparison."};
export const mlManifestHash=fingerprint(mlManifest);
