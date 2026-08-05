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
    id: "hours-scale-synthetic",
    source: "AQUAIVOLT_Hours-Scale_AI_Synthetic_500rows hrt hours.xlsx",
    keywords: ["hours", "hrt", "2", "24", "synthetic", "range", "temperature", "training"],
    text: "The 500-row hours-scale workbook is retained in the knowledge base for research questions, but it is no longer the active normal-mode prediction dataset. It models a 2 to 24 hour HRT extrapolation and is suitable for research simulation only, not normal plant recommendations.",
  },
  {
    id: "hours-scale-limits",
    source: "AQUAIVOLT_Hours-Scale_AI_Synthetic_500rows hrt hours.xlsx",
    keywords: ["limit", "safe", "operating", "temperature", "35", "37", "65", "clamp", "extrapolation"],
    text: "The supplied hours-scale synthetic scenario follows a designed trend rather than independent plant measurements. Its 2 to 24 hour HRT values are not used by the dashboard's active normal mode, which instead uses SCADA-derived day-scale coverage bounds.",
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
    text: "The 10-scenario optimization workbook provides the active model's before-AI and after-AI anchors for feedstock, temperature, pH, OLR, HRT, COD, methane percentage, gas flow, and generator power. It includes normal-mode temperatures from 35 to 38 C and HRT from 18 to 26 days.",
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
    text: "The active dashboard uses deterministic distance-weighted inference over the supplied 10 optimization scenarios, with feed-rate calibration from the 10-run validation trend and conservative VFA/mixing modifiers. Feedstock, feed rate, temperature, pH, OLR, HRT, COD, VFA, and mixer speed all influence the result. Synthetic SCADA ranges define input coverage; the displayed coverage score is not validated prediction accuracy.",
  },
  {
    id: "deployment-safety",
    source: "Aquaivolt prototype scope",
    keywords: ["safety", "operator", "vfa", "alkalinity", "control", "iot", "human", "recommendation"],
    text: "This prototype is decision support with human-entered inputs. It must not directly control feed rate, heating, dosing, mixing, or valves. Before production use, validate against site data, add data-quality checks, track VFA and alkalinity, set hard operating guardrails, and keep an operator approval step for every recommendation.",
  },
  {
    id: "data-coverage",
    source: "Supplied AQUAIVOLT workbook set",
    keywords: ["data", "workbook", "literature", "enough", "train", "accuracy", "real"],
    text: "The supplied workbook set is adequate to demonstrate a small synthetic-scenario model and a data-aware interface. It is not enough to claim real-world prediction accuracy because the core training and validation data are synthetic, short, or extrapolated. A production model needs timestamped site data across operating conditions, measured outputs, an untouched test period, and ongoing drift monitoring.",
  },
];
