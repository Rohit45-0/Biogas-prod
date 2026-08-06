export const modelMetadata = {
  name: "Multi-Input Scenario Ensemble",
  version: "1.4.0",
  fit: "10 optimization anchors + 1,000-row SCADA coverage",
  inputMode: "Manual input",
} as const;

export const modelCard = {
  algorithm: "Deterministic Gaussian distance-weighted scenario ensemble",
  implementation: "Server-side TypeScript inference service",
  status: "Prototype inference model — not independently plant validated",
  randomized: false,
  inputCount: 9,
  scenarioCount: 10,
  coverageRows: 1000,
  outputs: ["Biogas", "CH4 content", "Methane output", "CO2", "H2S", "Electricity", "Carbon estimate"],
  features: [
    {key:"feedstock",label:"Feedstock type",unit:"category",range:"6 supplied categories",role:"Selects matched biochemical scenario anchors"},
    {key:"feedRate",label:"Feed rate",unit:"kg VS/d",range:"820–870",role:"Applies a bounded flow modifier"},
    {key:"temperature",label:"Temperature",unit:"°C",range:"34.08–38.87",role:"Changes nearest-scenario weighting"},
    {key:"ph",label:"pH",unit:"pH",range:"6.82–7.58",role:"Changes scenario weighting and stability"},
    {key:"olr",label:"Organic loading",unit:"kg COD/m³·d",range:"1.55–6.38",role:"Changes scenario weighting and stability"},
    {key:"hrt",label:"Retention time",unit:"days",range:"15.45–34.62",role:"Changes scenario weighting and COD removal"},
    {key:"codIn",label:"COD input",unit:"mg/L",range:"3,205–11,864",role:"Changes nearest-scenario weighting"},
    {key:"vfa",label:"VFA",unit:"mg/L",range:"251–2,963",role:"Applies a conservative bounded modifier"},
    {key:"mixing",label:"Mixer speed",unit:"RPM",range:"20–79",role:"Applies a conservative bounded modifier"},
  ],
  datasets: [
    {name:"AQUAIVOLT 10 Biogas Optimization Scenarios",use:"Before/after prediction anchors",rows:10},
    {name:"AQUAIVOLT synthetic SCADA workbooks",use:"Supported input-space coverage only",rows:1000},
  ],
  limitations: [
    "Synthetic and scenario data do not establish real-plant accuracy.",
    "Coverage is an input-space score, not calibrated prediction uncertainty.",
    "Recommendations require operator review and do not control equipment.",
  ],
} as const;
