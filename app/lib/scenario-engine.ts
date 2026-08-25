export type Scenario = {
  feedstock: string; temperature: number; ph: number; olr: number; hrt: number; codIn: number;
  methaneBefore: number; methaneAfter: number; gasBefore: number; gasAfter: number;
  generatorBefore: number; generatorAfter: number;
};

export type ModelInput = {
  feedstock:string; feedRate:number; temperature:number; ph:number; olr:number;
  hrt:number; codIn:number; vfa:number; mixing:number;
};

// The same ten supplied optimization anchors used by the interactive endpoint.
// They are kept here so both one-off and batch inference execute identical logic.
export const optimizationScenarios: Scenario[] = [
  {feedstock:"Dairy WW",temperature:35,ph:7.1,olr:3.5,hrt:22,codIn:7000,methaneBefore:58,methaneAfter:65,gasBefore:120,gasAfter:138,generatorBefore:42,generatorAfter:49},
  {feedstock:"Cow Manure",temperature:37,ph:7.2,olr:2.8,hrt:25,codIn:6500,methaneBefore:60,methaneAfter:68,gasBefore:140,gasAfter:162,generatorBefore:50,generatorAfter:58},
  {feedstock:"Food Waste",temperature:36,ph:7.3,olr:4,hrt:18,codIn:9000,methaneBefore:55,methaneAfter:66,gasBefore:150,gasAfter:181,generatorBefore:53,generatorAfter:64},
  {feedstock:"Paper Mill",temperature:38,ph:7,olr:3,hrt:20,codIn:8500,methaneBefore:57,methaneAfter:64,gasBefore:130,gasAfter:149,generatorBefore:46,generatorAfter:53},
  {feedstock:"Brewery",temperature:37,ph:7.4,olr:2.5,hrt:24,codIn:6000,methaneBefore:61,methaneAfter:69,gasBefore:118,gasAfter:136,generatorBefore:41,generatorAfter:48},
  {feedstock:"Mixed Waste",temperature:36.5,ph:7.15,olr:3.2,hrt:21,codIn:7800,methaneBefore:56,methaneAfter:65,gasBefore:125,gasAfter:145,generatorBefore:44,generatorAfter:51},
  {feedstock:"Dairy WW",temperature:37,ph:7.25,olr:3.1,hrt:23,codIn:7200,methaneBefore:59,methaneAfter:67,gasBefore:132,gasAfter:154,generatorBefore:47,generatorAfter:55},
  {feedstock:"Food Waste",temperature:36.8,ph:7.2,olr:3.7,hrt:19,codIn:9800,methaneBefore:54,methaneAfter:64,gasBefore:170,gasAfter:196,generatorBefore:61,generatorAfter:70},
  {feedstock:"Cow Manure",temperature:37.2,ph:7.18,olr:2.9,hrt:26,codIn:6200,methaneBefore:62,methaneAfter:70,gasBefore:145,gasAfter:166,generatorBefore:52,generatorAfter:60},
  {feedstock:"Paper Mill",temperature:36.9,ph:7.22,olr:3.3,hrt:22,codIn:8000,methaneBefore:58,methaneAfter:66,gasBefore:135,gasAfter:156,generatorBefore:48,generatorAfter:56},
];

export const normalInputBounds = {
  feedRate:[820,870], temperature:[34.08,38.87], ph:[6.82,7.58], olr:[1.55,6.38],
  hrt:[15.45,34.62], codIn:[3205,11864], vfa:[251,2963], mixing:[20,79],
} as const;

export const physicalInputBounds = {
  feedRate:[50,2000], temperature:[10,80], ph:[3,11], olr:[.1,250],
  hrt:[.02,90], codIn:[100,50000], vfa:[0,10000], mixing:[0,200],
} as const;

export const defaultModelInputs = {feedRate:846,temperature:36.5,ph:7.2,olr:3.2,hrt:22,codIn:7600,vfa:1100,mixing:50} as const;
export const clamp = (value:number, min:number, max:number) => Math.min(max, Math.max(min, value));
export const round = (value:number, digits = 2) => Number(value.toFixed(digits));

export function normalizeFeedstock(value: unknown) {
  const text = String(value ?? "Dairy WW").toLowerCase();
  if (text.includes("dairy")) return "Dairy WW";
  if (text.includes("cow")) return "Cow Manure";
  if (text.includes("food")) return "Food Waste";
  if (text.includes("paper")) return "Paper Mill";
  if (text.includes("brew")) return "Brewery";
  if (text.includes("mixed")) return "Mixed Waste";
  return "Dairy WW";
}

function distanceToScenario(input:Pick<ModelInput,"feedstock"|"temperature"|"ph"|"olr"|"hrt"|"codIn">, scenario:Scenario) {
  const categoryPenalty = input.feedstock === scenario.feedstock ? 0 : 4;
  return categoryPenalty + ((input.temperature-scenario.temperature)/1.4)**2 + ((input.ph-scenario.ph)/.2)**2
    + ((input.olr-scenario.olr)/.9)**2 + ((input.hrt-scenario.hrt)/4.5)**2 + ((input.codIn-scenario.codIn)/1900)**2;
}

function weightedValue(weights:number[], key:keyof Pick<Scenario,"methaneBefore"|"methaneAfter"|"gasBefore"|"gasAfter"|"generatorBefore"|"generatorAfter">) {
  const total = weights.reduce((sum,value)=>sum+value,0) || 1;
  return optimizationScenarios.reduce((sum,scenario,index)=>sum+scenario[key]*weights[index],0)/total;
}

/** Canonical deterministic inference used by both POST /api/predict and batch reports. */
export function inferScenario(safe:ModelInput) {
  const distances = optimizationScenarios.map((scenario)=>distanceToScenario(safe,scenario));
  const minimumDistance = Math.min(...distances);
  const weights = distances.map((distance)=>Math.exp(-.5*Math.min(40,distance-minimumDistance)));
  const baseGasBefore = weightedValue(weights,"gasBefore");
  const baseGasAfter = weightedValue(weights,"gasAfter");
  const baseMethaneBefore = weightedValue(weights,"methaneBefore");
  const baseMethaneAfter = weightedValue(weights,"methaneAfter");
  const baseGeneratorBefore = weightedValue(weights,"generatorBefore");
  const baseGeneratorAfter = weightedValue(weights,"generatorAfter");
  const bestScenario = optimizationScenarios.filter((scenario)=>scenario.feedstock===safe.feedstock).sort((a,b)=>b.generatorAfter-a.generatorAfter)[0] ?? optimizationScenarios[0];
  const bestSetpoints = {feedRate:870,temperature:bestScenario.temperature,ph:bestScenario.ph,olr:bestScenario.olr,hrt:bestScenario.hrt,codIn:bestScenario.codIn,vfa:1100,mixing:50};
  const feedFactor = clamp(1 + (safe.feedRate-846)*.0035,.45,1.45);
  const temperatureFactor = clamp(1-.018*Math.abs(safe.temperature-bestSetpoints.temperature)**1.35,.55,1);
  const phFactor = clamp(1-.19*Math.abs(safe.ph-bestSetpoints.ph)**1.4,.5,1);
  const olrFactor = safe.olr<=bestSetpoints.olr ? clamp(.7+.3*(safe.olr/bestSetpoints.olr),.52,1) : clamp(1-.04*(safe.olr-bestSetpoints.olr)**1.2,.5,1);
  const hrtFactor = safe.hrt<bestSetpoints.hrt ? clamp(.68+.32*(safe.hrt/bestSetpoints.hrt),.5,1) : clamp(1+Math.min(.04,(safe.hrt-bestSetpoints.hrt)*.003),1,1.04);
  const codFactor = clamp(Math.sqrt(safe.codIn/bestSetpoints.codIn),.62,1.25);
  const vfaFactor = clamp(1-.06*((safe.vfa-1100)/1850)**2,.68,1);
  const mixingFactor = clamp(1-.055*((safe.mixing-50)/30)**2,.7,1);
  const processFactor = clamp(temperatureFactor*phFactor*olrFactor*hrtFactor*codFactor,.3,1.28);
  const gasFlow = clamp(baseGasAfter*feedFactor*vfaFactor*mixingFactor*processFactor,8,500);
  const methanePct = clamp(baseMethaneAfter+(feedFactor-1)*2-(1-temperatureFactor)*12-(1-phFactor)*18-(1-vfaFactor)*15-(1-mixingFactor)*7,32,74);
  const generatorKw = clamp(baseGeneratorAfter*(gasFlow/baseGasAfter)*(methanePct/baseMethaneAfter),3,180);
  const baselineGas = clamp(baseGasBefore*feedFactor*clamp(1-(Math.abs(safe.vfa-1100)/2100)*.025,.82,1)*clamp(processFactor*.98,.29,1.25),6,470);
  const baselineMethanePct = clamp(baseMethaneBefore+(feedFactor-1)*.7-(1-temperatureFactor)*8-(1-phFactor)*12-(1-vfaFactor)*6,30,70);
  const baselineGeneratorKw = baseGeneratorBefore*feedFactor*(baselineGas/(baseGasBefore*feedFactor));
  const biogas = gasFlow*24;
  const baselineBiogas = baselineGas*24;
  const methane = biogas*methanePct/100;
  const baselineMethane = baselineBiogas*baselineMethanePct/100;
  const electricity = generatorKw*24;
  const baselineElectricity = baselineGeneratorKw*24;
  return {distances,weights,bestSetpoints,feedFactor,temperatureFactor,phFactor,vfaFactor,mixingFactor,
    gasFlow,methanePct,generatorKw,baselineGas,baselineMethanePct,baselineGeneratorKw,
    biogas,baselineBiogas,methane,baselineMethane,electricity,baselineElectricity};
}

export function sanitizeModelInput(raw:Partial<ModelInput>): ModelInput {
  const feedstock = normalizeFeedstock(raw.feedstock);
  const keys = Object.keys(defaultModelInputs) as (keyof typeof defaultModelInputs)[];
  const safe = { feedstock, ...defaultModelInputs } as ModelInput;
  for (const key of keys) {
    const candidate = Number(raw[key]);
    safe[key] = clamp(Number.isFinite(candidate) ? candidate : defaultModelInputs[key], physicalInputBounds[key][0], physicalInputBounds[key][1]);
  }
  return safe;
}
