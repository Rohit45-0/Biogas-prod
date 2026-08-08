export const modelMetadata = {
  name: "Multi-Input Scenario Ensemble",
  version: "1.5.0",
  fit: "10 paired optimization anchors + 10-run trend checks + controlled nearest-pattern extrapolation",
  inputMode: "Manual input",
} as const;

export const modelCard = {
  algorithm: "Deterministic stabilized distance-weighted scenario ensemble with controlled extrapolation",
  implementation: "Server-side TypeScript inference service",
  status: "Prototype inference model — not independently plant validated",
  randomized: false,
  inputCount: 9,
  scenarioCount: 10,
  coverageRows: 1000,
  outputs: ["Biogas", "CH4 content", "Methane output", "CO2", "H2S", "Electricity", "Carbon estimate"],
  features: [
    {key:"feedstock",label:"Feedstock type",unit:"category",range:"6 supplied categories",role:"Selects matched biochemical scenario anchors"},
    {key:"feedRate",label:"Feed rate",unit:"kg VS/d",range:"Normal paired rows 820–870; projected regimes extend higher; extrapolation enabled",role:"Continues the supplied feed/output trend with broad physical guardrails"},
    {key:"temperature",label:"Temperature",unit:"°C",range:"Common day-scale 34–38.99; extrapolation enabled",role:"Applies distance weighting and a gradual process penalty"},
    {key:"ph",label:"pH",unit:"pH",range:"Common day-scale 6.8–7.6; extrapolation enabled",role:"Applies distance weighting and a gradual process penalty"},
    {key:"olr",label:"Organic loading",unit:"kg COD/m³·d",range:"Common day-scale 1.5–6.49; extrapolation enabled",role:"Applies scenario weighting and a loading penalty"},
    {key:"hrt",label:"Retention time",unit:"days",range:"Common day-scale 15–35; extrapolation enabled",role:"Applies scenario weighting and a retention penalty or plateau"},
    {key:"codIn",label:"COD input",unit:"mg/L",range:"Observed 3,000–11,993; extrapolation enabled",role:"Continues the supplied COD/gas trend conservatively"},
    {key:"vfa",label:"VFA",unit:"mg/L",range:"Observed 201–2,999; extrapolation enabled",role:"Applies a conservative quadratic process modifier"},
    {key:"mixing",label:"Mixer speed",unit:"RPM",range:"Observed 20–80; extrapolation enabled",role:"Applies a conservative quadratic process modifier"},
  ],
  datasets: [
    {name:"AQUAIVOLT 10 Biogas Optimization Scenarios",use:"Before/after prediction anchors",rows:10},
    {name:"AQUAIVOLT AI Biogas 10 Run Dataset",use:"Feed and process trend checks",rows:10},
    {name:"AQUAIVOLT synthetic SCADA workbooks",use:"Supported input-space coverage only",rows:1000},
    {name:"AQUAIVOLT hour-scale projected workbooks",use:"Research boundary review only; excluded from normal day-scale anchors",rows:1000},
  ],
  limitations: [
    "Synthetic and scenario data do not establish real-plant accuracy.",
    "Values outside the common supplied rows are controlled extrapolations, not measured outcomes.",
    "Coverage is an input-space score, not calibrated prediction uncertainty.",
    "Recommendations require operator review and do not control equipment.",
  ],
} as const;
