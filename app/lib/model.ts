import { getThresholds } from "./audit";
import { modelCard, modelMetadata } from "./system";

type Scenario = {
  feedstock: string; temperature: number; ph: number; olr: number; hrt: number; codIn: number;
  methaneBefore: number; methaneAfter: number; gasBefore: number; gasAfter: number;
  generatorBefore: number; generatorAfter: number;
};
export type ModelInput = {
  feedstock:string; feedRate:number; temperature:number; ph:number; olr:number;
  hrt:number; codIn:number; vfa:number; mixing:number;
};
type Setpoints = Omit<ModelInput,"feedstock">;

// The physical inference stays deterministic. Each request seeds a bounded candidate
// search, so repeated runs can explore different high-quality operating setpoints.
const scenarios: Scenario[] = [
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

const coreBounds = {
  feedRate:[820,870], temperature:[34.08,38.87], ph:[6.82,7.58], olr:[1.55,6.38],
  hrt:[15.45,34.62], codIn:[3205,11864], vfa:[251,2963], mixing:[20,79],
} as const;
// Broad physical guardrails prevent impossible arithmetic, but do not block a
// user-entered scenario. Values outside coreBounds are extrapolated from the
// nearest supplied before/after patterns with explicit process penalties.
const physicalBounds = {
  feedRate:[50,2000], temperature:[10,80], ph:[3,11], olr:[.1,250],
  hrt:[.02,90], codIn:[100,50000], vfa:[0,10000], mixing:[0,200],
} as const;
const defaults = {feedRate:846,temperature:36.5,ph:7.2,olr:3.2,hrt:22,codIn:7600,vfa:1100,mixing:50} as const;
const clamp = (value:number, min:number, max:number) => Math.min(max, Math.max(min, value));
const round = (value:number, digits = 2) => Number(value.toFixed(digits));

function normalizedFeedstock(value: unknown) {
  const text = String(value ?? "Dairy WW").toLowerCase();
  if (text.includes("dairy")) return "Dairy WW";
  if (text.includes("cow")) return "Cow Manure";
  if (text.includes("food")) return "Food Waste";
  if (text.includes("paper")) return "Paper Mill";
  if (text.includes("brew")) return "Brewery";
  if (text.includes("mixed")) return "Mixed Waste";
  return "Dairy WW";
}

function distanceToScenario(input:{feedstock:string;temperature:number;ph:number;olr:number;hrt:number;codIn:number}, scenario:Scenario) {
  const categoryPenalty = input.feedstock === scenario.feedstock ? 0 : 4;
  return categoryPenalty + ((input.temperature-scenario.temperature)/1.4)**2 + ((input.ph-scenario.ph)/.2)**2
    + ((input.olr-scenario.olr)/.9)**2 + ((input.hrt-scenario.hrt)/4.5)**2 + ((input.codIn-scenario.codIn)/1900)**2;
}

function weightedValue(weights:number[], key:keyof Pick<Scenario,"methaneBefore"|"methaneAfter"|"gasBefore"|"gasAfter"|"generatorBefore"|"generatorAfter">) {
  const total = weights.reduce((sum,value)=>sum+value,0) || 1;
  return scenarios.reduce((sum,scenario,index)=>sum+scenario[key]*weights[index],0)/total;
}

function alertStatus(condition:boolean, critical = false) {
  return condition ? (critical ? "critical" : "warning") : "normal";
}

function referenceSetpoints(feedstock:string):Setpoints {
  const bestScenario = scenarios.filter((scenario)=>scenario.feedstock===feedstock).sort((a,b)=>b.generatorAfter-a.generatorAfter)[0] ?? scenarios[0];
  return {feedRate:870,temperature:bestScenario.temperature,ph:bestScenario.ph,olr:bestScenario.olr,hrt:bestScenario.hrt,codIn:bestScenario.codIn,vfa:1100,mixing:50};
}

function seededRandom(seed:string) {
  let state = 2166136261;
  for (let index=0;index<seed.length;index++) state=Math.imul(state^seed.charCodeAt(index),16777619);
  return () => {
    state=(state+0x6d2b79f5)|0;
    let value=state;
    value=Math.imul(value^(value>>>15),value|1);
    value^=value+Math.imul(value^(value>>>7),value|61);
    return ((value^(value>>>14))>>>0)/4294967296;
  };
}

function inferCore(safe:ModelInput, bestSetpoints:Setpoints=referenceSetpoints(safe.feedstock)) {
  const distances = scenarios.map((scenario)=>distanceToScenario(safe,scenario));
  const minimumDistance = Math.min(...distances);
  const weights = distances.map((distance)=>Math.exp(-.5*Math.min(40,distance-minimumDistance)));
  const baseGasBefore = weightedValue(weights,"gasBefore");
  const baseGasAfter = weightedValue(weights,"gasAfter");
  const baseMethaneBefore = weightedValue(weights,"methaneBefore");
  const baseMethaneAfter = weightedValue(weights,"methaneAfter");
  const baseGeneratorBefore = weightedValue(weights,"generatorBefore");
  const baseGeneratorAfter = weightedValue(weights,"generatorAfter");

  const feedFactor = clamp(1 + (safe.feedRate-846)*.0035,.45,1.45);
  const temperatureFactor = clamp(1-.018*Math.abs(safe.temperature-bestSetpoints.temperature)**1.35,.55,1);
  const phFactor = clamp(1-.19*Math.abs(safe.ph-bestSetpoints.ph)**1.4,.5,1);
  const olrFactor = safe.olr<=bestSetpoints.olr
    ? clamp(.7+.3*(safe.olr/bestSetpoints.olr),.52,1)
    : clamp(1-.04*(safe.olr-bestSetpoints.olr)**1.2,.5,1);
  const hrtFactor = safe.hrt<bestSetpoints.hrt
    ? clamp(.68+.32*(safe.hrt/bestSetpoints.hrt),.5,1)
    : clamp(1+Math.min(.04,(safe.hrt-bestSetpoints.hrt)*.003),1,1.04);
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

export function searchOptimizationCandidates(safe:ModelInput, seed:string, includeExport=false) {
  const random=seededRandom(seed);
  const reference=referenceSetpoints(safe.feedstock);
  const rawWeights={biogas:.3,methaneQuality:.15,electricity:.35,stability:.2};
  const weightTotal=Object.values(rawWeights).reduce((sum,value)=>sum+value,0);
  const objectiveWeights=Object.fromEntries(Object.entries(rawWeights).map(([key,value])=>[key,round(value/weightTotal,3)]));
  const sample=(center:number,radius:number,bounds:readonly [number,number],digits:number)=>round(clamp(center+(random()*2-1)*radius,bounds[0],bounds[1]),digits);
  const candidateCount=2000;
  const baseline=baselineFor(safe);
  const candidates=Array.from({length:candidateCount},(_,index)=>{
    const {feedstock:_feedstock,...currentSetpoints}=safe;
    const setpoints:Setpoints=index===0?currentSetpoints:{
      feedRate:sample(reference.feedRate,24,coreBounds.feedRate,0),
      temperature:sample(reference.temperature,.8,coreBounds.temperature,2),
      ph:sample(reference.ph,.15,coreBounds.ph,3),
      olr:sample(reference.olr,.4,coreBounds.olr,2),
      hrt:sample(reference.hrt,2.5,coreBounds.hrt,1),
      codIn:sample(reference.codIn,550,coreBounds.codIn,0),
      vfa:sample(reference.vfa,260,coreBounds.vfa,0),
      mixing:sample(reference.mixing,9,coreBounds.mixing,0),
    };
    const projection=inferCore({...safe,...setpoints},reference);
    const stability=clamp(100-Math.abs(setpoints.ph-reference.ph)*65-Math.abs(setpoints.temperature-reference.temperature)*4
      -Math.max(0,setpoints.olr-reference.olr)*7-Math.abs(setpoints.vfa-1100)/55-Math.abs(setpoints.mixing-50)*.55,35,100);
    const movement=Math.abs(setpoints.feedRate-safe.feedRate)/50+Math.abs(setpoints.temperature-safe.temperature)/5
      +Math.abs(setpoints.ph-safe.ph)/.8+Math.abs(setpoints.olr-safe.olr)/3+Math.abs(setpoints.hrt-safe.hrt)/15;
    const score=(objectiveWeights.biogas*projection.biogas/4800)+(objectiveWeights.methaneQuality*projection.methanePct/74)
      +(objectiveWeights.electricity*projection.electricity/3600)+(objectiveWeights.stability*stability/100)-movement*.012;
    return {sourceIndex:index+1,setpoints,score,projection,operationalHrtHours:round(setpoints.hrt*24,2)};
  }).sort((a,b)=>b.score-a.score);
  const selected=candidates[0];
  const sourcePrefix=seed.split("-")[0].slice(0,4).toUpperCase();
  const scenarioRow=(candidate:(typeof candidates)[number],index:number)=>({
    rank:index+1,
    sourceCondition:`RUN-${sourcePrefix}-${String(candidate.sourceIndex).padStart(4,"0")}`,
    selected:candidate===selected,
    hrtHours:candidate.operationalHrtHours,
    baselineBiogas:baseline.biogas,
    aiBiogas:round(candidate.projection.biogas),
    aiMethane:round(candidate.projection.methane),
    aiElectricity:round(candidate.projection.electricity),
  });
  return {
    setpoints:selected.setpoints,
    operationalHrtHours:selected.operationalHrtHours,
    candidateCount,
    selectedRank:candidates.indexOf(selected)+1,
    scenarioPreview:candidates.slice(0,6).map(scenarioRow),
    scenarioExport:includeExport?candidates.map((candidate,index)=>({
      ...scenarioRow(candidate,index),
      feedstock:safe.feedstock,
      ...candidate.setpoints,
      baselineMethane:baseline.methane,
      baselineElectricity:baseline.electricity,
      methanePct:round(candidate.projection.methanePct),
      score:round(candidate.score,6),
    })):undefined,
    objectiveWeights,
    seed,
    strategy:"Fixed objective weights; highest scoring candidate from a seeded bounded search",
  };
}

export function baselineFor(input:ModelInput) {
  const core=inferCore(input,referenceSetpoints(input.feedstock));
  return {
    biogas:round(core.baselineBiogas),
    methane:round(core.baselineMethane),
    electricity:round(core.baselineElectricity),
  };
}


export async function runModel(x:ModelInput & {previousRun?:{prediction?:{biogas?:number}}}, options:{seed?:string}={}) {
  const started=performance.now();
  const events:{label:string;status:string;detail:string;elapsedMs:number;at:string}[]=[];
  const mark=(label:string,detail:string)=>events.push({label,status:"complete",detail,elapsedMs:round(performance.now()-started,3),at:new Date().toISOString()});
  const feedstock = normalizedFeedstock(x.feedstock);
  const input = {
    feedstock, feedRate:Number(x.feedRate), temperature:Number(x.temperature), ph:Number(x.ph), olr:Number(x.olr),
    hrt:Number(x.hrt), codIn:Number(x.codIn), vfa:Number(x.vfa), mixing:Number(x.mixing),
  };
  const keys = ["feedRate","temperature","ph","olr","hrt","codIn","vfa","mixing"] as const;
  const extrapolatedInputs = keys.filter((key)=>!Number.isFinite(input[key]) || input[key] < coreBounds[key][0] || input[key] > coreBounds[key][1]);
  const outOfRange = extrapolatedInputs.length > 0;
  const safe = {...input};
  for (const key of keys) safe[key] = clamp(Number.isFinite(input[key]) ? input[key] : defaults[key], physicalBounds[key][0], physicalBounds[key][1]);
  mark("Validate inputs","Nine effective operating values available after request validation");

  const runId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const optimization=searchOptimizationCandidates(safe,options.seed??runId);
  mark("Search setpoints",`${optimization.candidateCount} candidate input sets evaluated; rank ${optimization.selectedRank} selected`);
  const retentionTime={beforeHours:round(safe.hrt*24),optimizedHours:optimization.operationalHrtHours,reductionHours:round(safe.hrt*24-optimization.operationalHrtHours,2)};
  const core=inferCore({...safe,...optimization.setpoints},referenceSetpoints(safe.feedstock));
  const baselineCore=inferCore(safe,referenceSetpoints(safe.feedstock));
  mark("Calculate comparison","Baseline from effective inputs; optimized outputs from selected candidate inputs");
  const {distances,weights,feedFactor,vfaFactor,mixingFactor,
    gasFlow,methanePct,generatorKw,biogas,methane,electricity}=core;
  const bestSetpoints=optimization.setpoints;
  const {baselineGas,baselineMethanePct,baselineGeneratorKw,
    baselineBiogas,baselineMethane,baselineElectricity}=baselineCore;
  const weightTotal = weights.reduce((sum,value)=>sum+value,0) || 1;
  const nearestScenarios = scenarios.map((scenario,index)=>({
    anchor:`OPT-${String(index+1).padStart(2,"0")}`,
    feedstock:scenario.feedstock,
    distance:round(distances[index],3),
    weight:round(weights[index]/weightTotal*100,1),
  })).sort((a,b)=>b.weight-a.weight).slice(0,3);
  const closestScenarioIndex = distances.indexOf(Math.min(...distances));
  const closestScenario = scenarios[closestScenarioIndex];
  const featureDistanceValues = [
    {label:"Feedstock",value:safe.feedstock===closestScenario.feedstock?0:4},
    {label:"Feed rate",value:((safe.feedRate-846)/26)**2},
    {label:"Temperature",value:((safe.temperature-closestScenario.temperature)/1.4)**2},
    {label:"pH",value:((safe.ph-closestScenario.ph)/.2)**2},
    {label:"Organic loading",value:((safe.olr-closestScenario.olr)/.9)**2},
    {label:"Retention time",value:((safe.hrt-closestScenario.hrt)/4.5)**2},
    {label:"COD input",value:((safe.codIn-closestScenario.codIn)/1900)**2},
    {label:"VFA",value:((safe.vfa-1100)/1100)**2},
    {label:"Mixer speed",value:((safe.mixing-50)/25)**2},
  ];
  const featureDistanceTotal = featureDistanceValues.reduce((sum,item)=>sum+item.value,0) || 1;
  const featureInfluence = featureDistanceValues.map(item=>({
    label:item.label,
    contribution:round(item.value/featureDistanceTotal*100,1),
    interpretation:item.value<.03?"Near reference":item.value<.4?"Moderate distance":"Strong distance",
  }));
  const sensitivitySpecs:{label:string;key:keyof Omit<ModelInput,"feedstock">;step:number;unit:string}[] = [
    {label:"Feed rate",key:"feedRate",step:10,unit:"kg VS/d"},
    {label:"Temperature",key:"temperature",step:.5,unit:"°C"},
    {label:"pH",key:"ph",step:.1,unit:"pH"},
    {label:"Organic loading",key:"olr",step:.2,unit:"kg COD/m³/d"},
    {label:"Retention time",key:"hrt",step:1,unit:"day"},
    {label:"COD input",key:"codIn",step:500,unit:"mg/L"},
    {label:"VFA",key:"vfa",step:100,unit:"mg/L"},
    {label:"Mixer speed",key:"mixing",step:5,unit:"RPM"},
  ];
  const numericSensitivity = sensitivitySpecs.map(spec=>{
    const bounds=physicalBounds[spec.key];
    const lower={...safe,[spec.key]:clamp(safe[spec.key]-spec.step,bounds[0],bounds[1])};
    const upper={...safe,[spec.key]:clamp(safe[spec.key]+spec.step,bounds[0],bounds[1])};
    const lowerBiogas=inferCore(lower).biogas;
    const upperBiogas=inferCore(upper).biogas;
    return {label:spec.label,response:Math.abs(upperBiogas-lowerBiogas)/2,direction:upperBiogas>=lowerBiogas?"increase":"decrease",step:spec.step,unit:spec.unit};
  });
  const alternateFeedstocks=[...new Set(scenarios.map(scenario=>scenario.feedstock))].filter(candidate=>candidate!==feedstock);
  const feedstockResponse=Math.max(0,...alternateFeedstocks.map(candidate=>Math.abs(inferCore({...safe,feedstock:candidate}).biogas-baselineCore.biogas)));
  const rawSensitivity=[{label:"Feedstock type",response:feedstockResponse,direction:"scenario switch",step:1,unit:"category"},...numericSensitivity];
  const maximumSensitivity=Math.max(1,...rawSensitivity.map(item=>item.response));
  const inputSensitivity=rawSensitivity.map(item=>({...item,response:round(item.response,1),strength:round(item.response/maximumSensitivity*100,1)})).sort((a,b)=>b.response-a.response);
  const recommendedCore=inferCore({...safe,...bestSetpoints},referenceSetpoints(safe.feedstock));
  const recommendedProjection={
    biogas:round(recommendedCore.biogas,1),methane:round(recommendedCore.methane,1),electricity:round(recommendedCore.electricity,1),
    biogasChange:round(recommendedCore.biogas-baselineBiogas,1),methaneChange:round(recommendedCore.methane-baselineMethane,1),electricityChange:round(recommendedCore.electricity-baselineElectricity,1),
    basis:"The deterministic model re-run with this run's selected bounded-search setpoints",
  };
  // The paired sheets show positive feed/output and COD/gas trends. Outside the
  // common rows, these modifiers continue those patterns gradually while pH,
  // temperature, VFA, mixing, loading and HRT move toward a conservative floor.
  const improvement = (biogas/baselineBiogas-1)*100;
  const carbon = electricity*.000708;
  const baselineCarbon = baselineElectricity*.000708;

  const coverageDistance = Math.sqrt(Math.min(...distances) + ((safe.feedRate-846)/26)**2 + ((safe.vfa-1100)/1100)**2 + ((safe.mixing-50)/25)**2);
  const confidence = clamp(94-coverageDistance*8-extrapolatedInputs.length*4,25,94);
  const stability = clamp(94-Math.abs(safe.ph-bestSetpoints.ph)*28-Math.abs(safe.temperature-bestSetpoints.temperature)*3
    -Math.max(0,safe.olr-bestSetpoints.olr)*4-Math.abs(safe.vfa-1100)/180-Math.abs(safe.mixing-50)*.25,35,95);
  const codRemoval = clamp(72+(methanePct-55)*.55+(safe.hrt-15)*.35-Math.abs(safe.vfa-1100)/250,52,92);
  const pressure = clamp(11+gasFlow*.07,12,42);
  const h2s = clamp(620-(bestSetpoints.ph-6.8)*310+(bestSetpoints.vfa-1100)*.13,60,1500);
  const baselineH2s = clamp(620-(safe.ph-6.8)*310+(safe.vfa-1100)*.13,60,1500);
  // Client-defined simplified composition: CH4 + CO2 + H2S = 100%.
  // H2S is measured in ppm, so divide by 10,000 before combining it with
  // percentage values. Other trace gases are intentionally outside this model.
  const h2sPct = h2s/10000;
  const baselineH2sPct = baselineH2s/10000;
  const co2Pct = 100-methanePct-h2sPct;
  const baselineCo2Pct = 100-baselineMethanePct-baselineH2sPct;
  const methaneGain = (methane/baselineMethane-1)*100;
  const electricityGain = (electricity/baselineElectricity-1)*100;
  const methaneContentGain = (methanePct/baselineMethanePct-1)*100;
  const co2Reduction = (1-co2Pct/baselineCo2Pct)*100;
  const h2sReduction = (1-h2s/baselineH2s)*100;

  const optimizationTargets = [
    {label:"Biogas Production",value:improvement}, {label:"CH₄ Content",value:methaneContentGain},
    {label:"Methane Output",value:methaneGain}, {label:"CO₂ Reduction",value:co2Reduction},
    {label:"H₂S Reduction",value:h2sReduction}, {label:"Electricity Output",value:electricityGain},
  ];
  const overallBenefit = improvement;
  const benefitTrend = Array.from({length:8},(_,index)=>overallBenefit*(.58+index*.055)+Math.sin(index*1.15)*Math.max(1,Math.abs(overallBenefit)*.045));

  const recommendations:{title:string;detail:string;impact:number;tone:string;parameter:string;current:number;target:number;unit:string}[] = [];
  const add = (parameter:string,current:number,target:number,unit:string,title:string,detail:string,impact:number)=>recommendations.push({parameter,current,target,unit,title,detail,impact:Math.max(.2,impact),tone:"up"});
  if(Math.abs(retentionTime.reductionHours)>.01) add("HRT",retentionTime.beforeHours,retentionTime.optimizedHours,"hours",`Review HRT at ${retentionTime.optimizedHours.toFixed(1)} hours`,`Model HRT ${safe.hrt} to ${bestSetpoints.hrt} days, converted at 24 hours per day. Operator approval is required.`,25);
  if (Math.abs(safe.feedRate-bestSetpoints.feedRate)>4) add("Feed rate",safe.feedRate,bestSetpoints.feedRate,"kg VS/d",`Move feed rate toward ${bestSetpoints.feedRate} kg VS/d`,"Change incrementally within OLR and VFA guardrails; operator approval required.",Math.abs(safe.feedRate-bestSetpoints.feedRate)*.11);
  if (Math.abs(safe.temperature-bestSetpoints.temperature)>.25) add("Temperature",safe.temperature,bestSetpoints.temperature,"°C",`Move temperature toward ${bestSetpoints.temperature.toFixed(1)} °C`,`${feedstock} scenario anchor; adjust heating gradually.`,Math.abs(safe.temperature-bestSetpoints.temperature)*1.7);
  if (Math.abs(safe.ph-bestSetpoints.ph)>.04) add("pH",safe.ph,bestSetpoints.ph,"pH",`Move pH toward ${bestSetpoints.ph.toFixed(2)}`,"Check VFA/alkalinity before any dosing change.",Math.abs(safe.ph-bestSetpoints.ph)*18);
  if (Math.abs(safe.olr-bestSetpoints.olr)>.15) add("OLR",safe.olr,bestSetpoints.olr,"kg COD/m³·d",`Target OLR ${bestSetpoints.olr.toFixed(1)}`,"Use incremental feeding and monitor process stability.",Math.abs(safe.olr-bestSetpoints.olr)*2.2);
  if (Math.abs(safe.codIn-bestSetpoints.codIn)>350) add("COD",safe.codIn,bestSetpoints.codIn,"mg/L",`COD reference ${bestSetpoints.codIn.toFixed(0)} mg/L`,"COD is measured, not directly controlled; use as a scenario comparison.",Math.abs(safe.codIn-bestSetpoints.codIn)/900);
  if (Math.abs(safe.vfa-bestSetpoints.vfa)>180) add("VFA",safe.vfa,bestSetpoints.vfa,"mg/L",`Investigate VFA near ${bestSetpoints.vfa} mg/L`,"Use VFA with alkalinity and trend data before changing feed.",Math.abs(safe.vfa-bestSetpoints.vfa)/450);
  if (Math.abs(safe.mixing-bestSetpoints.mixing)>4) add("Mixing",safe.mixing,bestSetpoints.mixing,"RPM",`Compare mixing at ${bestSetpoints.mixing} RPM`,"Confirm parasitic power and avoid excessive mixing.",Math.abs(safe.mixing-bestSetpoints.mixing)*.12);
  recommendations.sort((a,b)=>b.impact-a.impact);
  if (!recommendations.length) add("Scenario",1,1,"", "Hold current scenario inputs",`Inputs are close to the strongest supplied ${feedstock} anchor.`,1);
  if (outOfRange) recommendations.push({parameter:"Estimate",current:0,target:1,unit:"",title:"Nearest-pattern estimate used",detail:`${extrapolatedInputs.length} input value(s) extend beyond the common supplied rows; the model applied gradual extrapolation without clipping them to the old boundary.`,impact:0,tone:"down"});

  const thresholds = await getThresholds();
  const alerts = [
    {key:"methane",label:"Methane quality",value:methanePct,unit:"%",limit:`≥ ${thresholds.methaneMinimum}%`,status:alertStatus(methanePct<thresholds.methaneMinimum),message:methanePct<thresholds.methaneMinimum?"Below configured methane target":"Within configured methane target"},
    {key:"h2s",label:"Hydrogen sulphide",value:h2s,unit:"ppm",limit:`≤ ${thresholds.h2sWarning} ppm`,status:alertStatus(h2s>thresholds.h2sWarning,h2s>thresholds.h2sWarning*1.5),message:h2s>thresholds.h2sWarning?"Treatment review recommended":"Below configured warning threshold"},
    {key:"pressure",label:"Digester pressure",value:pressure,unit:"mbar",limit:`${thresholds.pressureMinimum}–${thresholds.pressureMaximum} mbar`,status:alertStatus(pressure<thresholds.pressureMinimum||pressure>thresholds.pressureMaximum,true),message:pressure<thresholds.pressureMinimum||pressure>thresholds.pressureMaximum?"Outside configured pressure band":"Within configured pressure band"},
  ];
  const hasCritical = alerts.some((alert)=>alert.status==="critical");
  const equipmentStates = [
    {label:"Biogas outlet valve",state:hasCritical?"HOLD":"OPEN",detail:`Pressure ${pressure.toFixed(1)} mbar`,mode:"SIMULATED",tone:hasCritical?"warning":"normal"},
    {label:"Wastewater feed valve",state:"PULSED",detail:`Target ${safe.feedRate.toFixed(0)} kg VS/d`,mode:"SIMULATED",tone:"normal"},
    {label:"Mixer drive",state:"ON",detail:`Command ${safe.mixing.toFixed(0)} RPM`,mode:"SIMULATED",tone:"normal"},
    {label:"Generator",state:h2s>thresholds.h2sWarning?"REVIEW":"ENABLED",detail:`Estimated ${generatorKw.toFixed(1)} kW`,mode:"SIMULATED",tone:h2s>thresholds.h2sWarning?"warning":"normal"},
    {label:"Heating loop",state:"AUTO",detail:`Target ${bestSetpoints.temperature.toFixed(1)} °C`,mode:"SIMULATED",tone:"normal"},
  ];

  const baseline = {gasFlow:baselineGas,biogas:baselineBiogas,methanePct:baselineMethanePct,methane:baselineMethane,
    electricity:baselineElectricity,generatorKw:baselineGeneratorKw,carbon:baselineCarbon,co2Pct:baselineCo2Pct,h2s:baselineH2s};
  const optimized = {gasFlow,biogas,methanePct,methane,electricity,generatorKw,carbon,co2Pct,h2s};
  const gasComposition = [
    {key:"ch4",label:"CH₄",name:"Methane",before:baselineMethanePct,after:methanePct,unit:"%",direction:"up"},
    {key:"co2",label:"CO₂",name:"Carbon dioxide",before:baselineCo2Pct,after:co2Pct,unit:"%",direction:"down"},
    {key:"h2s",label:"H₂S",name:"Hydrogen sulphide",before:baselineH2s,after:h2s,unit:"ppm",direction:"down"},
  ];
  const performanceMetrics = [
    {key:"biogas",label:"BIOGAS",name:"Total production",before:baselineBiogas,after:biogas,unit:"m³/d",direction:"up"},
    {key:"ch4",label:"CH₄",name:"Methane content",before:baselineMethanePct,after:methanePct,unit:"%",direction:"up"},
    {key:"methane",label:"CH₄ OUT",name:"Methane output",before:baselineMethane,after:methane,unit:"m³/d",direction:"up"},
    {key:"co2",label:"CO₂",name:"Carbon dioxide",before:baselineCo2Pct,after:co2Pct,unit:"%",direction:"down"},
    {key:"h2s",label:"H₂S",name:"Hydrogen sulphide",before:baselineH2s,after:h2s,unit:"ppm",direction:"down"},
    {key:"electricity",label:"ENERGY",name:"Electricity output",before:baselineElectricity,after:electricity,unit:"kWh/d",direction:"up"},
  ];
  const hourlyForecast = Array.from({length:13},(_,index)=>{
    const wave = Math.sin(index*.92)*.012 + Math.cos(index*.39)*.006;
    const settling = (index/12)*.008;
    const baselineWave = Math.sin(index*.86+.35)*.008 + Math.cos(index*.31)*.004;
    return {hour:index*2,biogas:biogas*(.978+wave+settling),electricity:electricity*(.982+wave*.78+settling),
      baselineBiogas:baselineBiogas*(.982+baselineWave),baselineElectricity:baselineElectricity*(.984+baselineWave*.72),
      ch4:clamp(methanePct-.8+index*.07+Math.sin(index)*.25,48,74),co2:clamp(co2Pct+.65-index*.055-Math.sin(index)*.18,23,52),
      h2s:clamp(h2s*(1.08-index*.006+Math.cos(index)*.015),40,1700)};
  });
  const curvePoint = (changed:Partial<Pick<ModelInput,"hrt"|"ph">>,displayInput?:number)=>{
    const inferred = inferCore({...safe,...changed});
    return {input:round(displayInput??Number(changed.hrt??changed.ph),3),biogas:round(inferred.biogas),methane:round(inferred.methane),electricity:round(inferred.electricity)};
  };
  const sweepValues = (center:number,target:number,radius:number,min:number,max:number)=>{
    const low=clamp(Math.min(center,target)-radius,min,max);
    const high=clamp(Math.max(center,target)+radius,min,max);
    return Array.from({length:11},(_,index)=>round(low+(high-low)*(index/10),3));
  };
  const operationalHrtCurve=sweepValues(safe.hrt,bestSetpoints.hrt,2.5,physicalBounds.hrt[0],physicalBounds.hrt[1]).map(days=>curvePoint({hrt:days},days*24));
  const modelCurves = {
    source:"Same scenario engine; model HRT in days converted to hours at 24 hours per day",
    current:{hrt:retentionTime.beforeHours,ph:round(safe.ph,3),biogas:round(baselineCore.biogas),methane:round(baselineCore.methane),electricity:round(baselineCore.electricity)},
    hrt:operationalHrtCurve,
    ph:sweepValues(safe.ph,bestSetpoints.ph,.45,physicalBounds.ph[0],physicalBounds.ph[1]).map(value=>curvePoint({ph:value})),
  };
  const inputEffects = [
    {label:"Feedstock",value:feedstock,effect:"Selects matched biochemical scenario anchors"},
    {label:"Feed rate",value:`${safe.feedRate.toFixed(0)} kg VS/d`,effect:`${((feedFactor-1)*100).toFixed(1)}% flow modifier`},
    {label:"Temperature",value:`${safe.temperature.toFixed(1)} °C`,effect:`${Math.abs(safe.temperature-bestSetpoints.temperature).toFixed(1)} °C from selected anchor`},
    {label:"pH",value:safe.ph.toFixed(2),effect:`${Math.abs(safe.ph-bestSetpoints.ph).toFixed(2)} from selected anchor`},
    {label:"OLR",value:safe.olr.toFixed(2),effect:"Changes nearest-case weighting and stability"},
    {label:"HRT",value:`${safe.hrt.toFixed(1)} days`,effect:"Changes case weighting and COD removal"},
    {label:"COD",value:`${safe.codIn.toFixed(0)} mg/L`,effect:"Changes scenario proximity"},
    {label:"VFA",value:`${safe.vfa.toFixed(0)} mg/L`,effect:`${((vfaFactor-1)*100).toFixed(1)}% conservative modifier`},
    {label:"Mixing",value:`${safe.mixing.toFixed(0)} RPM`,effect:`${((mixingFactor-1)*100).toFixed(1)}% conservative modifier`},
  ];
  const previousBiogas = Number(x.previousRun?.prediction?.biogas);
  const comparison = Number.isFinite(previousBiogas) ? ` Biogas changed by ${biogas>=previousBiogas?"+":""}${(biogas-previousBiogas).toFixed(1)} m³/day versus the previous run.` : " This is the first run in the comparison.";
  const forecast = hourlyForecast.map((point)=>point.biogas);
  const agentMessage = `Analysis complete for ${feedstock}. The model estimates ${biogas.toFixed(1)} m³/day biogas, ${methane.toFixed(1)} m³ CH₄/day and ${electricity.toFixed(1)} kWh/day.${comparison} Model HRT changes from ${retentionTime.beforeHours.toFixed(1)} to ${retentionTime.optimizedHours.toFixed(1)} hours. Selected setpoints: pH ${bestSetpoints.ph.toFixed(2)}, ${bestSetpoints.temperature.toFixed(1)} °C and OLR ${bestSetpoints.olr.toFixed(1)}. Operator review required.`;
  mark("Calculate diagnostics","Sensitivity, HRT curves, recommendations and modeled threshold checks calculated");
  const modelTrace = {
    executionId:runId,executedAt:createdAt,endpoint:"POST /api/predict",algorithm:modelCard.algorithm,
    implementation:modelCard.implementation,randomized:modelCard.randomized,inputCount:modelCard.inputCount,
    scenarioCount:modelCard.scenarioCount,coverageRows:modelCard.coverageRows,status:modelCard.status,
    stages:events,
    nearestScenarios,featureInfluence,inputSensitivity,optimization,
    previousComparison:Number.isFinite(previousBiogas)?{available:true,biogasBefore:previousBiogas,biogasAfter:biogas,delta:biogas-previousBiogas}:{available:false,biogasBefore:null,biogasAfter:biogas,delta:null},
    limitations:modelCard.limitations,
  };
  const responseData = {biogas,methanePct,methane,electricity,carbon,codRemoval,stability,confidence,improvement,pressure,h2s,
    generatorKw,optimizationTargets,overallBenefit,benefitTrend,recommendations:recommendations.slice(0,5),recommendedProjection,forecast,hourlyForecast,modelCurves,
    bestSetpoints,retentionTime,scenarioPreview:optimization.scenarioPreview,agentMessage,modelName:modelMetadata.name,modelVersion:modelMetadata.version,modelFit:modelMetadata.fit,outOfRange,extrapolatedInputs,
    confidenceMeaning:"Scenario coverage, not calibrated uncertainty",baseline,optimized,gasComposition,performanceMetrics,alerts,equipmentStates,inputEffects,modelTrace,
    effectiveInputs:safe,optimizedInputs:{...safe,...bestSetpoints},sourceProfile:`${feedstock} operating conditions`,
    facility:{name:thresholds.facilityName,location:thresholds.facilityLocation},mode:"SIMULATION",runId,createdAt};
  return responseData;
}
