export type KnowledgeChunk = {
  id: string;
  source: string;
  text: string;
  keywords: string[];
};

// Distilled from the workbooks supplied for the prototype. This lets the deployed
// Copilot retrieve project context without exposing the original spreadsheets.
export const knowledgeChunks: KnowledgeChunk[] = [
  {
    id: "additional-hrt-cases",
    source: "10 more cases with days less in HRT on ai and on litterature.xlsx",
    keywords: ["hrt", "literature", "additional", "cases", "days", "comparison"],
    text: "This workbook contributes additional short-HRT AI and literature comparison cases to the knowledge base. It is used as supporting research context, not as an active normal-mode model anchor or proof of live-plant performance.",
  },
  {
    id: "hours-scale-synthetic",
    source: "AQUAIVOLT_Hours-Scale_AI_Synthetic_500rows hrt hours.xlsx",
    keywords: ["hours", "hrt", "2", "24", "synthetic", "range", "temperature", "training"],
    text: "The 500-row hours-scale workbook is the active short-HRT research-model dataset. It trains the dashboard's five direct features: feed rate, temperature, pH, OLR and HRT in hours. It is synthetic research data, so predictions are decision-support simulations rather than proven site performance.",
  },
  {
    id: "hours-scale-limits",
    source: "AQUAIVOLT_Hours-Scale_AI_Synthetic_500rows hrt hours.xlsx",
    keywords: ["limit", "safe", "operating", "temperature", "35", "37", "65", "clamp", "extrapolation"],
    text: "The supplied hours-scale synthetic scenario follows a designed trend rather than independent plant measurements. Its active model envelope is HRT 2 to 24 hours, feed rate 865.8 to 929.4 kg VS/day, temperature 37.0 to 65.2 C, pH 6.19 to 6.93, and OLR 4.43 to 70.4 kg VS/m3/day. Out-of-range estimates remain explicit.",
  },
  {
    id: "projected-under-six-hours",
    source: "AQUAIVOLT_Projected_Scenarios_HRT_below6h_500.xlsx",
    keywords: ["below 6", "six", "hrt", "extreme", "projected", "validated", "pilot"],
    text: "The projected HRT-below-6-hours workbook contains 500 extreme short-HRT projected scenarios. It is explicitly an extrapolation and is not site- or literature-validated. Treat outcomes below 6 hours as research simulations that require pilot testing and operator review before any plant change.",
  },
  {
    id: "scada-template",
    source: "AQUAIVOLT_AI_Biogas_SCADA_Dataset_Template (1).xlsx",
    keywords: ["scada", "iot", "sensor", "1000", "15 minute", "fields", "future"],
    text: "The SCADA template has 1,000 synthetic records, 36 fields, and approximately 10.4 days of 15-minute samples. It is a useful schema for future IoT ingestion, including process measurements, gas quality, flow, generator output, and operational events. It is not a long enough real historical series to establish production accuracy by itself.",
  },
  {
    id: "ten-run-validation",
    source: "AQUAIVOLT_AI_Biogas_10_Run_Dataset.xlsx",
    keywords: ["10 run", "baseline", "optimized", "validation", "biogas", "methane", "electricity"],
    text: "The 10-run workbook is a synthetic validation and presentation dataset showing baseline versus AI-optimized biogas and related operational metrics. It is useful for demonstrating comparison cards, recommendations, and scenario improvement, but ten synthetic runs are not an independently validated ML test set.",
  },
  {
    id: "optimization-scenarios",
    source: "AQUAIVOLT_10_Biogas_Optimization_10Scenarios.xlsx",
    keywords: ["scenario", "35", "temperature", "ph", "gas flow", "generator", "before", "after ai"],
    text: "The 10-scenario optimization workbook is a small synthetic comparison reference. It is not used to train the active five-value short-HRT prediction model; the active model uses the supplied 500-row hours-scale synthetic workbook.",
  },
  {
    id: "electricity-calculation",
    source: "AQUAIVOLT_AI_Biogas_10_Run_Dataset.xlsx",
    keywords: ["electricity", "formula", "9.97", "36", "efficiency", "methane", "carbon"],
    text: "In the prototype, electricity is derived transparently from predicted methane volume using 9.97 kWh per m3 methane and a 36 percent generator efficiency assumption. Carbon reduction is a prototype estimate based on generated electricity and a configurable grid-emissions factor; use an approved local factor before reporting emissions.",
  },
  {
    id: "multi-input-model",
    source: "Aquaivolt prototype model card",
    keywords: ["model", "multi input", "feedstock", "random", "prediction", "coverage", "scenario"],
    text: "The active dashboard runs a deterministic LangGraph StateGraph. It validates five plant values, prepares polynomial features, runs exported Ridge-regression coefficients, calculates a condition-responsive baseline, searches bounded lower-HRT candidates, applies a safety/approval gate and prepares audit evidence. Feed rate, temperature, pH, OLR and HRT in hours are the direct learned features. Feedstock, COD, VFA and mixing are retained as contextual audit fields, not direct model features. The coverage score is training-space coverage, not validated field accuracy.",
  },
  {
    id: "deployment-safety",
    source: "Aquaivolt prototype scope",
    keywords: ["safety", "operator", "vfa", "alkalinity", "control", "iot", "human", "recommendation"],
    text: "This prototype is decision support with operator plant readjustment. It must not directly control feed rate, heating, dosing, mixing, or valves. Before production use, validate against site data, add data-quality checks, track VFA and alkalinity, set hard operating guardrails, and keep an operator approval step for every recommendation.",
  },
  {
    id: "data-coverage",
    source: "Supplied AQUAIVOLT workbook set",
    keywords: ["data", "workbook", "literature", "enough", "train", "accuracy", "real"],
    text: "The supplied workbook set is adequate to demonstrate a small synthetic-scenario model and a data-aware interface. It is not enough to claim real-world prediction accuracy because the core training and validation data are synthetic, short, or extrapolated. A production model needs timestamped site data across operating conditions, measured outputs, an untouched test period, and ongoing drift monitoring.",
  },
];
