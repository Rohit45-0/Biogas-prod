export const modelMetadata = {
  name:"Short-HRT Biogas Prediction Model",
  version:"short-hrt-ridge-langgraph-v2",
  fit:"500 supplied hours-scale synthetic rows · 5 features · HRT 2–24 hours",
  inputMode:"Manual short-HRT input",
} as const;

export const modelCard = {
  algorithm:"StandardScaler → degree-2 polynomial features → Ridge regression (α = 0.001)",
  implementation:"LangGraph StateGraph → exported TypeScript Ridge coefficients → policy and audit nodes",
  status:"Trained short-HRT synthetic research model — not independently plant validated",
  randomized:false,
  inputCount:5,
  scenarioCount:500,
  coverageRows:500,
  outputs:["Biogas", "CH₄ content", "Methane output", "CO₂", "H₂S", "Electricity", "Carbon estimate"],
  features:[
    {key:"feedRate",label:"Feed rate",unit:"kg VS/day",range:"865.8–929.4",role:"Direct trained-model feature"},
    {key:"temperature",label:"Temperature",unit:"°C",range:"37.0–65.2",role:"Direct trained-model feature"},
    {key:"ph",label:"pH",unit:"pH",range:"6.19–6.93",role:"Direct trained-model feature"},
    {key:"olr",label:"Organic loading",unit:"kg VS/m³·d",range:"4.43–70.4",role:"Direct trained-model feature"},
    {key:"hrt",label:"Retention time",unit:"hours",range:"2–24",role:"Direct trained-model feature and reduction target"},
  ],
  datasets:[
    {name:"AQUAIVOLT Hours-Scale AI Synthetic 500",use:"Training and reproducible shuffled 5-fold cross-validation",rows:500},
  ],
  limitations:[
    "The supplied source is synthetic research data, not synchronized operating-plant telemetry. Ridge, HistGradientBoosting and XGBoost are evaluated from the same reproducible training script.",
    "The trained model is bounded to its observed 2–24 hour input and output envelope.",
    "The displayed current baseline is an input-responsive counterfactual calculation because the supplied baseline column is constant at 50 m³/day.",
    "Recommendations require operator review and pilot validation; the application does not control equipment.",
  ],
} as const;
