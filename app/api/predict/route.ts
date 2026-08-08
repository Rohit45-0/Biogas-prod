import { NextResponse } from "next/server";
import { getSession } from "../../lib/auth";
import { getThresholds, recordSimulation } from "../../lib/audit";
import { modelCard, modelMetadata } from "../../lib/system";

type Scenario = {
  feedstock: string; temperature: number; ph: number; olr: number; hrt: number; codIn: number;
  methaneBefore: number; methaneAfter: number; gasBefore: number; gasAfter: number;
  generatorBefore: number; generatorAfter: number;
};

// Supplied AQUAIVOLT 10-scenario optimization anchors. Inference is deterministic:
// identical inputs return identical outputs. The 1,000 synthetic SCADA rows provide
// supported ranges, while the ten optimization cases provide before/after anchors.
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

export async function POST(req:Request) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({error:"Unauthorized"},{status:401});
  const x = await req.json();
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

  const distances = scenarios.map((scenario)=>distanceToScenario(safe,scenario));
  const minimumDistance = Math.min(...distances);
  const weights = distances.map((distance)=>Math.exp(-.5*Math.min(40,distance-minimumDistance)));
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
  const baseGasBefore = weightedValue(weights,"gasBefore");
  const baseGasAfter = weightedValue(weights,"gasAfter");
  const baseMethaneBefore = weightedValue(weights,"methaneBefore");
  const baseMethaneAfter = weightedValue(weights,"methaneAfter");
  const baseGeneratorBefore = weightedValue(weights,"generatorBefore");
  const baseGeneratorAfter = weightedValue(weights,"generatorAfter");

  const bestScenario = scenarios.filter((scenario)=>scenario.feedstock===feedstock).sort((a,b)=>b.generatorAfter-a.generatorAfter)[0] ?? scenarios[0];
  const bestSetpoints = {feedRate:870,temperature:bestScenario.temperature,ph:bestScenario.ph,olr:bestScenario.olr,hrt:bestScenario.hrt,codIn:bestScenario.codIn,vfa:1100,mixing:50};

  // The paired sheets show positive feed/output and COD/gas trends. Outside the
  // common rows, these modifiers continue those patterns gradually while pH,
  // temperature, VFA, mixing, loading and HRT move toward a conservative floor.
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
  const improvement = (biogas/baselineBiogas-1)*100;
  const carbon = electricity*.000708;
  const baselineCarbon = baselineElectricity*.000708;

  const coverageDistance = Math.sqrt(Math.min(...distances) + ((safe.feedRate-846)/26)**2 + ((safe.vfa-1100)/1100)**2 + ((safe.mixing-50)/25)**2);
  const confidence = clamp(94-coverageDistance*8-extrapolatedInputs.length*4,25,94);
  const stability = clamp(94-Math.abs(safe.ph-bestSetpoints.ph)*28-Math.abs(safe.temperature-bestSetpoints.temperature)*3
    -Math.max(0,safe.olr-bestSetpoints.olr)*4-Math.abs(safe.vfa-1100)/180-Math.abs(safe.mixing-50)*.25,35,95);
  const codRemoval = clamp(72+(methanePct-55)*.55+(safe.hrt-15)*.35-Math.abs(safe.vfa-1100)/250,52,92);
  const pressure = clamp(11+gasFlow*.07,12,42);
  const h2s = clamp(620-(safe.ph-6.8)*310+(safe.vfa-1100)*.13,60,1500);
  const baselineH2s = clamp(h2s+70+(methanePct-baselineMethanePct)*8,90,1600);
  // Client-defined simplified composition: CH4 + CO2 + H2S = 100%.
  // H2S is measured in ppm, so divide by 10,000 before combining it with
  // percentage values. Other trace gases are intentionally outside this model.
  const h2sPct = h2s/10000;
  const baselineH2sPct = baselineH2s/10000;
  const co2Pct = clamp(100-methanePct-h2sPct,27,52);
  const baselineCo2Pct = clamp(100-baselineMethanePct-baselineH2sPct,30,54);
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
  if (Math.abs(safe.feedRate-bestSetpoints.feedRate)>4) add("Feed rate",safe.feedRate,bestSetpoints.feedRate,"kg VS/d",`Move feed rate toward ${bestSetpoints.feedRate} kg VS/d`,"Change incrementally within OLR and VFA guardrails; operator approval required.",Math.abs(safe.feedRate-bestSetpoints.feedRate)*.11);
  if (Math.abs(safe.temperature-bestSetpoints.temperature)>.25) add("Temperature",safe.temperature,bestSetpoints.temperature,"°C",`Move temperature toward ${bestSetpoints.temperature.toFixed(1)} °C`,`${feedstock} scenario anchor; adjust heating gradually.`,Math.abs(safe.temperature-bestSetpoints.temperature)*1.7);
  if (Math.abs(safe.ph-bestSetpoints.ph)>.04) add("pH",safe.ph,bestSetpoints.ph,"pH",`Move pH toward ${bestSetpoints.ph.toFixed(2)}`,"Check VFA/alkalinity before any dosing change.",Math.abs(safe.ph-bestSetpoints.ph)*18);
  if (Math.abs(safe.olr-bestSetpoints.olr)>.15) add("OLR",safe.olr,bestSetpoints.olr,"kg COD/m³·d",`Target OLR ${bestSetpoints.olr.toFixed(1)}`,"Use incremental feeding and monitor process stability.",Math.abs(safe.olr-bestSetpoints.olr)*2.2);
  if (Math.abs(safe.hrt-bestSetpoints.hrt)>.5) add("HRT",safe.hrt,bestSetpoints.hrt,"days",`Compare ${bestSetpoints.hrt} day HRT`,"This target comes from the closest supplied feedstock scenario.",Math.abs(safe.hrt-bestSetpoints.hrt)*.45);
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
  const agentMessage = `Analysis complete for ${feedstock}. The deterministic multi-input scenario model estimates ${biogas.toFixed(1)} m³/day biogas, ${methane.toFixed(1)} m³ CH₄/day, and ${electricity.toFixed(1)} kWh/day.${comparison} The best modeled setpoints are pH ${bestSetpoints.ph.toFixed(2)}, ${bestSetpoints.temperature.toFixed(1)} °C, OLR ${bestSetpoints.olr.toFixed(1)}, and ${bestSetpoints.hrt} day HRT.${outOfRange?` ${extrapolatedInputs.length} input value(s) were estimated from the nearest supplied patterns.`:""}`;

  const runId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const modelTrace = {
    executionId:runId,executedAt:createdAt,endpoint:"POST /api/predict",algorithm:modelCard.algorithm,
    implementation:modelCard.implementation,randomized:modelCard.randomized,inputCount:modelCard.inputCount,
    scenarioCount:modelCard.scenarioCount,coverageRows:modelCard.coverageRows,status:modelCard.status,
    stages:[
      {label:"Validate inputs",status:"complete",detail:`9 inputs checked; ${outOfRange?`${extrapolatedInputs.length} value(s) extrapolated from nearest patterns`:"all matched to common supplied rows"}`},
      {label:"Match scenarios",status:"complete",detail:`10 anchors weighted; closest ${nearestScenarios[0]?.anchor}`},
      {label:"Infer baseline",status:"complete",detail:`${baselineBiogas.toFixed(1)} m³/d modeled baseline`},
      {label:"Evaluate AI scenario",status:"complete",detail:`${biogas.toFixed(1)} m³/d and ${methanePct.toFixed(1)}% CH₄`},
      {label:"Check safeguards",status:"complete",detail:`${alerts.filter(alert=>alert.status!=="normal").length} simulated threshold alert(s)`},
      {label:"Record evidence",status:"complete",detail:"Audit persistence requested for this run"},
    ],
    nearestScenarios,featureInfluence,
    previousComparison:Number.isFinite(previousBiogas)?{available:true,biogasBefore:previousBiogas,biogasAfter:biogas,delta:biogas-previousBiogas}:{available:false,biogasBefore:null,biogasAfter:biogas,delta:null},
    limitations:modelCard.limitations,
  };
  const responseData = {biogas,methanePct,methane,electricity,carbon,codRemoval,stability,confidence,improvement,pressure,h2s,
    generatorKw,optimizationTargets,overallBenefit,benefitTrend,recommendations:recommendations.slice(0,5),forecast,hourlyForecast,
    bestSetpoints,agentMessage,modelName:modelMetadata.name,modelVersion:modelMetadata.version,modelFit:modelMetadata.fit,outOfRange,extrapolatedInputs,
    confidenceMeaning:"Scenario coverage, not calibrated uncertainty",baseline,optimized,gasComposition,performanceMetrics,alerts,equipmentStates,inputEffects,modelTrace,
    facility:{name:thresholds.facilityName,location:thresholds.facilityLocation},mode:"SIMULATION",runId,createdAt};
  let auditSaved = false;
  try {
    auditSaved = await recordSimulation({id:runId,username:session.username,role:session.role,feedstock,inputs:safe,
      outputs:{baseline,optimized,codRemoval,stability,confidence,improvement,alerts,recommendations:recommendations.slice(0,5),modelTrace},modelVersion:modelMetadata.version});
  } catch {
    // Prediction remains available even if audit persistence is temporarily down.
  }
  return NextResponse.json({...responseData,audit:{runId,createdAt,saved:auditSaved,status:auditSaved?"RECORDED":"NOT RECORDED"}});
}
