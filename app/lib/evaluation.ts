import manifest from "./model-evaluation.generated.json";

type TargetMetrics = { mae:number; rmse:number; r2:number };
type Candidate = { id:string; label:string; normalizedMae:number; targets:Record<string,TargetMetrics>; artifact:string; artifactSha256:string };

const candidates=manifest.evaluation.models as Candidate[];
const deployed=candidates.find((item)=>item.label===manifest.selection.deployedModel) ?? candidates[0];

export const evaluationEvidence = {
  evaluationDate: manifest.generatedAt.slice(0,10),
  purpose: "Reproducible short-HRT comparison using the supplied 500-row synthetic research workbook",
  evaluatedModels: candidates.map((item)=>item.label),
  designs: [
    { name: "Short-HRT 5-fold cross-validation", trainRows: 400, testRows: 100, repeats: 5, note: manifest.evaluation.method },
  ],
  optimizationAnchorResults: candidates.map((item)=>({
    model:item.label,
    nmae:item.normalizedMae,
    gasMae:item.targets.biogas.mae,
    methaneMae:item.targets.methane.mae,
    powerMae:item.targets.electricity.mae,
    role:item.id==="ridge_polynomial"?"Deployed, portable exported-coefficient model":"Evaluated candidate; saved artifact retained for audit",
    artifact:item.artifact,
    artifactSha256:item.artifactSha256,
  })),
  scadaHoldoutResults: [] as { model:string;nmae:number }[],
  selection: {
    numericalWinner: manifest.selection.numericalWinner,
    numericalWinnerNmae: manifest.selection.numericalWinnerNormalizedMae,
    deployedModel: manifest.selection.deployedModel,
    deployedModelNmae: manifest.selection.deployedModelNormalizedMae,
    reason: manifest.selection.reason,
    neuralNetworkDecision: "A neural network/PyTorch model is not deployed or claimed. The supplied 500 synthetic rows are insufficient evidence to promote one over the evaluated models.",
    approvalRequired: manifest.selection.approvalRequired,
  },
  dataAudit: {
    shortHrtRows: manifest.source.rowCount,
    candidateModels: candidates.length,
    validationFolds: 5,
    realPlantRows: 0,
    projectedRowsUsedForTraining: false,
    sourceClassification: manifest.source.classification,
    missingCoverage: "No timestamped real-plant outcome data was supplied. Daily/monthly actual KPI totals require CSV import or future IoT/SCADA ingestion.",
  },
  runtime: manifest.runtime,
  limitations: manifest.limitations,
} as const;

export const deployedEvaluation = deployed;
