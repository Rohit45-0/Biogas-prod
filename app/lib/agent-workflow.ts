import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { clamp, round } from "./scenario-engine";
import { estimateShortHrtBaseline, predictShortHrt, sanitizeShortHrtInput, shortHrtBounds, type ShortHrtBaseline, type ShortHrtInput, type ShortHrtPrediction } from "./short-hrt-model";
import type { ThresholdSettings } from "./audit";

export type WorkflowStage = { label:string; status:"complete"; detail:string; tool:string };

export type AgentWorkflowResult = {
  input:ShortHrtInput;
  extrapolatedInputs:string[];
  optimizedPrediction:ShortHrtPrediction;
  baselinePrediction:ShortHrtBaseline;
  recommendedInput:ShortHrtInput;
  recommendedPrediction:ShortHrtPrediction;
  recommendedBaseline:ShortHrtBaseline;
  approvalRequired:true;
  stages:WorkflowStage[];
};

const shortKeys=["feedRate","temperature","ph","olr","hrtHours"] as const;

function stage(label:string, detail:string, tool:string):WorkflowStage { return { label, detail, tool, status:"complete" }; }

function rangeValues(current:number,min:number,max:number,kind:"feed"|"temperature"|"ph"|"olr"|"hrt") {
  const offsets={feed:[-10,0,10],temperature:[-5,0,5],ph:[-.12,0,.12],olr:[-6,0,6],hrt:[-6,-2,0]}[kind];
  return [...new Set([min,max,(min+max)/2,...offsets.map(offset=>clamp(current+offset,min,max))].map(value=>round(value,3)))];
}

function objective(input:ShortHrtInput) {
  const prediction=predictShortHrt(input);
  return prediction.optimizedBiogas*.29+prediction.methane*.42+prediction.electricity*.12+(24-input.hrtHours)*.17;
}

/** Bounded multi-output search. It returns advice only and never controls equipment. */
export function findLowerHrtRecommendation(start:ShortHrtInput) {
  const startPrediction=predictShortHrt(start);
  const candidates:ShortHrtInput[]=[];
  for(const feedRate of rangeValues(start.feedRate,...shortHrtBounds.feedRate,"feed")) {
    for(const temperature of rangeValues(start.temperature,...shortHrtBounds.temperature,"temperature")) {
      for(const ph of rangeValues(start.ph,...shortHrtBounds.ph,"ph")) {
        for(const olr of rangeValues(start.olr,...shortHrtBounds.olr,"olr")) {
          for(const hrtHours of rangeValues(start.hrtHours,...shortHrtBounds.hrtHours,"hrt")) candidates.push({feedRate,temperature,ph,olr,hrtHours});
        }
      }
    }
  }
  const improvesAll=(candidate:ShortHrtInput)=>{
    const output=predictShortHrt(candidate);
    return candidate.hrtHours<start.hrtHours && output.optimizedBiogas>=startPrediction.optimizedBiogas && output.methane>=startPrediction.methane && output.electricity>=startPrediction.electricity;
  };
  return candidates.sort((a,b)=>Number(improvesAll(b))-Number(improvesAll(a))||objective(b)-objective(a)||a.hrtHours-b.hrtHours)[0] ?? start;
}

const WorkflowState = Annotation.Root({
  submitted: Annotation<Partial<ShortHrtInput>>(),
  thresholds: Annotation<ThresholdSettings>(),
  input: Annotation<ShortHrtInput>(),
  extrapolatedInputs: Annotation<string[]>(),
  optimizedPrediction: Annotation<ShortHrtPrediction>(),
  baselinePrediction: Annotation<ShortHrtBaseline>(),
  recommendedInput: Annotation<ShortHrtInput>(),
  recommendedPrediction: Annotation<ShortHrtPrediction>(),
  recommendedBaseline: Annotation<ShortHrtBaseline>(),
  approvalRequired: Annotation<true>(),
  stages: Annotation<WorkflowStage[]>({ reducer:(current, update)=>[...current,...update], default:()=>[] }),
});

const validateInputs=(state:typeof WorkflowState.State)=>{
  const supplied=state.submitted;
  const extrapolatedInputs=shortKeys.filter((key)=>!Number.isFinite(supplied[key])||Number(supplied[key])<shortHrtBounds[key][0]||Number(supplied[key])>shortHrtBounds[key][1]).map((key)=>key==="hrtHours"?"HRT":key==="feedRate"?"Feed rate":key==="temperature"?"Temperature":key==="ph"?"pH":"OLR");
  const input=sanitizeShortHrtInput(supplied);
  return { input, extrapolatedInputs, stages:[stage("Validate five plant values", `${extrapolatedInputs.length?`Explicit estimate: ${extrapolatedInputs.join(", ")}.`:`Five values are inside the 2–24 hour training envelope.`}`, "LangGraph validation node")] };
};

const prepareFeatures=(state:typeof WorkflowState.State)=>({
  stages:[stage("Prepare model features", `StandardScaler and degree-2 polynomial features are prepared from feed rate, temperature, pH, OLR and HRT.`, "LangGraph feature node")],
});

const runTrainedModel=(state:typeof WorkflowState.State)=>{
  const optimizedPrediction=predictShortHrt(state.input);
  return { optimizedPrediction, stages:[stage("Run trained Ridge model", `Exported coefficients produced ${optimizedPrediction.optimizedBiogas.toFixed(1)} m³/day biogas.`, "LangGraph inference node")] };
};

const calculateBaseline=(state:typeof WorkflowState.State)=>{
  const baselinePrediction=estimateShortHrtBaseline(state.input,state.optimizedPrediction);
  return { baselinePrediction, stages:[stage("Calculate current baseline", `Condition-responsive counterfactual baseline: ${baselinePrediction.biogas.toFixed(1)} m³/day.`, "LangGraph baseline-calculation node")] };
};

const searchSetpoints=(state:typeof WorkflowState.State)=>{
  const recommendedInput=findLowerHrtRecommendation(state.input);
  const recommendedPrediction=predictShortHrt(recommendedInput);
  const recommendedBaseline=estimateShortHrtBaseline(recommendedInput,recommendedPrediction);
  return { recommendedInput, recommendedPrediction, recommendedBaseline, stages:[stage("Search lower-HRT scenarios", `Bounded deterministic multi-output search selected ${recommendedInput.hrtHours.toFixed(1)} hour HRT.`, "LangGraph optimizer node")] };
};

const approvalGate=(state:typeof WorkflowState.State)=>{
  const h2s=state.optimizedPrediction.h2sAfterFilter;
  const methane=state.optimizedPrediction.methanePct;
  const review=methane<state.thresholds.methaneMinimum||h2s>state.thresholds.h2sWarning?"Safety review is required before any operator change.":"Operator approval is required before applying an advisory setpoint.";
  return { approvalRequired:true as const, stages:[stage("Safety and approval gate", review, "LangGraph policy node")] };
};

const prepareEvidence=(state:typeof WorkflowState.State)=>({
  stages:[stage("Prepare audit evidence", "Plant values, model version, output values, candidate recommendation and node trace are ready for the audit ledger.", "LangGraph audit-evidence node")],
});

const graph=new StateGraph(WorkflowState)
  .addNode("validate_inputs",validateInputs)
  .addNode("prepare_features",prepareFeatures)
  .addNode("run_trained_model",runTrainedModel)
  .addNode("calculate_baseline",calculateBaseline)
  .addNode("search_setpoints",searchSetpoints)
  .addNode("approval_gate",approvalGate)
  .addNode("prepare_evidence",prepareEvidence)
  .addEdge(START,"validate_inputs")
  .addEdge("validate_inputs","prepare_features")
  .addEdge("prepare_features","run_trained_model")
  .addEdge("run_trained_model","calculate_baseline")
  .addEdge("calculate_baseline","search_setpoints")
  .addEdge("search_setpoints","approval_gate")
  .addEdge("approval_gate","prepare_evidence")
  .addEdge("prepare_evidence",END)
  .compile();

export async function runAgentWorkflow(submitted:Partial<ShortHrtInput>, thresholds:ThresholdSettings):Promise<AgentWorkflowResult> {
  const result=await graph.invoke({ submitted, thresholds, stages:[] });
  return {
    input:result.input,
    extrapolatedInputs:result.extrapolatedInputs,
    optimizedPrediction:result.optimizedPrediction,
    baselinePrediction:result.baselinePrediction,
    recommendedInput:result.recommendedInput,
    recommendedPrediction:result.recommendedPrediction,
    recommendedBaseline:result.recommendedBaseline,
    approvalRequired:result.approvalRequired,
    stages:result.stages,
  };
}
