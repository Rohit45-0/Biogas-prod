import build from "./model-build.json";
import {modelCard,modelMetadata} from "./system";
import {fingerprint} from "./evidence";
export const manifest={model:modelMetadata,card:modelCard,sourceHash:build.sourceHash,endpoint:"POST /api/predict",contract:"aquaivolt-input-v2",hrtUnit:"days",displayHrtUnit:"hours = days * 24",selection:"highest objective score",weights:{biogas:.3,methaneQuality:.15,electricity:.35,stability:.2}};
export const manifestHash=fingerprint(manifest);
