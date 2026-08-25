/**
 * Portable 2–24 hour HRT research model.
 *
 * It was fitted by ai-workflow/train_short_hrt_model.py from the supplied
 * 500-row `Hours-Scale AI Synthetic 500` worksheet.  Coefficients are kept
 * here so Vercel runs the actual learned model at prediction time, without
 * needing Excel, Python, or a browser-side random generator.
 *
 * Source limitation: the workbook is synthetic research data, not field
 * telemetry.  Values must be pilot-validated before plant use.
 */

import { clamp, round } from "./scenario-engine";

export type ShortHrtInput = {
  feedRate:number;
  temperature:number;
  ph:number;
  olr:number;
  hrtHours:number;
};

export type ShortHrtPrediction = {
  optimizedBiogas:number;
  methane:number;
  electricity:number;
  h2sAfterFilter:number;
  methanePct:number;
  co2FractionPct:number;
  baselineBiogas:number;
  coverageScore:number;
  inTrainingRange:boolean;
  outOfRangeInputs:string[];
};

export type ShortHrtBaseline = {
  biogas:number;
  methane:number;
  methanePct:number;
  electricity:number;
  generatorKw:number;
  h2s:number;
  co2Pct:number;
  carbon:number;
  efficiencyFactor:number;
};

export const shortHrtBounds = {
  feedRate:[865.8,929.4],
  temperature:[37,65.2],
  ph:[6.19,6.93],
  olr:[4.43,70.4],
  hrtHours:[2,24],
} as const;

export const defaultShortHrtInput:ShortHrtInput = {
  feedRate:871,
  temperature:37,
  ph:6.91,
  olr:4.57,
  hrtHours:24,
};

export const shortHrtModelMetadata = {
  version:"short-hrt-ridge-langgraph-v2",
  dataset:"AQUAIVOLT_Hours-Scale_AI_Synthetic_500rows hrt hours.xlsx · Hours-Scale AI Synthetic 500",
  rowCount:500,
  features:["Feed rate", "Temperature", "pH", "OLR", "HRT (hours)"],
  targets:["Optimized biogas", "Methane output", "Electricity potential", "H₂S after filter"],
  algorithm:"StandardScaler → degree-2 polynomial features → Ridge regression (α = 0.001)",
  evaluation:"Reproducible shuffled 5-fold cross-validation; see GET /api/evaluation",
  heldOutRmse:{biogas:0.323891,methane:0.325911,electricity:1.169808,h2s:0.192472},
  heldOutR2:{biogas:0.996947,methane:0.993263,electricity:0.993263,h2s:0.998598},
  limitation:"Held-out metrics test fit to the same synthetic generator; they are not field-performance or safety validation.",
} as const;

const mean=[893.6044,49.392,6.72686,16.46482,13];
const scale=[15.701559815509,8.16463691783,0.176993616834,15.092185811459,6.363578277982];
const intercept=[72.206560705312,41.276665517548,148.151147933576,22.182473155853];
// Target order: optimized biogas, methane, electricity, H₂S after filter.
const coefficients=[
  [0.035891991704,0.740660234536,0.165465270881,-6.118322923429,-9.145049170672,-0.188088574813,1.88401049296,1.287045648682,0.690777766362,0.871564551884,-12.803975517967,-1.983193868433,3.67257038352,-17.798459848751,0.264335320601,0.578410439167,-0.697594132441,-0.792706497548,-0.729361546633,-6.155364434223],
  [-0.019045339661,-0.56355847354,0.034287821251,0.807647711571,2.984831730989,-0.009589934309,-0.586911639293,0.971757543614,0.766319787293,-0.71876601566,-4.345958239124,1.411992121586,2.286260813089,-8.186674196602,-1.126408994723,-2.678529617513,2.179909846952,-0.051305548419,7.457110673266,-3.699480709069],
  [-0.068174881508,-2.024919626568,0.122543416229,2.900356398593,10.71259844393,-0.033679155244,-2.10442447518,3.488652557203,2.750332827354,-2.577210511394,-15.603429522758,5.07058517399,8.211625439536,-29.386444633641,-4.038392095104,-9.607507171867,7.824593394063,-0.182278439833,26.768584460009,-13.276497755465],
  [-0.020073174363,-2.643750701824,-0.054825728059,6.616769095194,6.614403358995,0.029588842384,0.07868687879,-0.452271601967,-0.37614703454,0.196017363916,6.379801994371,2.923250674255,0.032846120024,7.520436951966,0.020556645546,-0.816444855683,1.801229183725,0.48339136622,5.506774576857,2.869694292414],
];

function values(input:ShortHrtInput) {
  return [input.feedRate,input.temperature,input.ph,input.olr,input.hrtHours];
}

function quadraticTerms(normalized:number[]) {
  const terms=[...normalized];
  for(let first=0;first<normalized.length;first+=1) {
    for(let second=first;second<normalized.length;second+=1) terms.push(normalized[first]*normalized[second]);
  }
  return terms;
}

export function sanitizeShortHrtInput(raw:Partial<ShortHrtInput>):ShortHrtInput {
  const input={...defaultShortHrtInput};
  (Object.keys(input) as (keyof ShortHrtInput)[]).forEach((key)=>{
    const value=Number(raw[key]);
    input[key]=Number.isFinite(value) ? value : defaultShortHrtInput[key];
  });
  return input;
}

/** Executes the trained ridge model; it does not sample, randomize, or read Excel at runtime. */
export function predictShortHrt(raw:Partial<ShortHrtInput>):ShortHrtPrediction {
  const input=sanitizeShortHrtInput(raw);
  const labels:[keyof ShortHrtInput,string][]=[["feedRate","Feed rate"],["temperature","Temperature"],["ph","pH"],["olr","OLR"],["hrtHours","HRT"]];
  const outOfRangeInputs=labels.filter(([key])=>input[key]<shortHrtBounds[key][0]||input[key]>shortHrtBounds[key][1]).map(([,label])=>label);
  const rawValues=values(input);
  const normalized=rawValues.map((value,index)=>(value-mean[index])/scale[index]);
  const terms=quadraticTerms(normalized);
  const estimated=coefficients.map((target,index)=>intercept[index]+target.reduce((sum,coefficient,termIndex)=>sum+coefficient*terms[termIndex],0));
  // Keep runtime estimates inside the observed synthetic target envelope.
  // This prevents the polynomial model from inventing values beyond the
  // supplied research sheet even when inputs sit at a boundary.
  const biogas=clamp(estimated[0],65.51,85.48);
  const methane=clamp(estimated[1],27.788,42.887);
  const electricity=clamp(estimated[2],99.738,153.931);
  const h2s=clamp(estimated[3],10,28.1);
  const distance=Math.sqrt(normalized.reduce((sum,value)=>sum+value**2,0)/normalized.length);
  const coverageScore=clamp(100-distance*9-outOfRangeInputs.length*12,20,100);
  const methanePct=clamp(methane/Math.max(1,biogas)*100,20,80);
  const h2sSafe=h2s;
  return {
    optimizedBiogas:round(biogas,3),
    methane:round(methane,3),
    electricity:round(electricity,3),
    h2sAfterFilter:round(h2sSafe,3),
    methanePct:round(methanePct,3),
    co2FractionPct:round(clamp(100-methanePct-h2sSafe/10000,0,100),3),
    baselineBiogas:50,
    coverageScore:round(coverageScore,2),
    inTrainingRange:outOfRangeInputs.length===0,
    outOfRangeInputs,
  };
}

/**
 * Input-responsive counterfactual for the current, not-yet-optimized process.
 * The source workbook has a constant 50 m³/day baseline column, so a separate
 * baseline regressor cannot be trained from that column.  This calculation
 * starts with the learned production output and applies a documented process
 * efficiency factor derived from the five submitted process conditions.
 */
export function estimateShortHrtBaseline(raw:Partial<ShortHrtInput>, predicted=predictShortHrt(raw)):ShortHrtBaseline {
  const input=sanitizeShortHrtInput(raw);
  const normalized=values(input).map((value,index)=>Math.abs((value-mean[index])/scale[index]));
  const processDistance=normalized[0]*.12+normalized[1]*.26+normalized[2]*.24+normalized[3]*.22+normalized[4]*.16;
  const efficiencyFactor=clamp(.80-processDistance*.055,.64,.82);
  const biogas=predicted.optimizedBiogas*efficiencyFactor;
  const methanePct=clamp(predicted.methanePct-(1-efficiencyFactor)*17,22,76);
  const methane=biogas*methanePct/100;
  const electricity=predicted.electricity*efficiencyFactor*(methanePct/Math.max(1,predicted.methanePct));
  const h2s=clamp(predicted.h2sAfterFilter*(1+(1-efficiencyFactor)*1.2),10,80);
  return {
    biogas:round(biogas,3), methane:round(methane,3), methanePct:round(methanePct,3), electricity:round(electricity,3),
    generatorKw:round(electricity/24,3), h2s:round(h2s,3), co2Pct:round(clamp(100-methanePct-h2s/10000,0,100),3),
    carbon:round(electricity*.000708,3), efficiencyFactor:round(efficiencyFactor,4),
  };
}

export function shortHrtInputLabel(input:ShortHrtInput) {
  return `feed ${round(input.feedRate,1)} kg VS/day · ${round(input.temperature,1)} °C · pH ${round(input.ph,2)} · OLR ${round(input.olr,2)} · HRT ${round(input.hrtHours,2)} h`;
}
