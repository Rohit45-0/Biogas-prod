import { NextResponse } from "next/server";

type Scenario = {
  feedstock: string;
  temperature: number;
  ph: number;
  olr: number;
  hrt: number;
  codIn: number;
  methaneBefore: number;
  methaneAfter: number;
  gasBefore: number;
  gasAfter: number;
  generatorBefore: number;
  generatorAfter: number;
};

// Supplied AQUAIVOLT 10-scenario optimization anchors. The model performs
// deterministic distance-weighted inference across these cases. SCADA-derived
// bounds below are used for input coverage, not as proof of plant accuracy.
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

const bounds = {
  feedRate:[820,870], temperature:[34.08,38.87], ph:[6.82,7.58], olr:[1.55,6.38],
  hrt:[15.45,34.62], codIn:[3205,11864], vfa:[251,2963], mixing:[20,79],
} as const;
const clamp = (value:number, min:number, max:number) => Math.min(max, Math.max(min, value));

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
  return categoryPenalty
    + ((input.temperature-scenario.temperature)/1.4)**2
    + ((input.ph-scenario.ph)/.2)**2
    + ((input.olr-scenario.olr)/.9)**2
    + ((input.hrt-scenario.hrt)/4.5)**2
    + ((input.codIn-scenario.codIn)/1900)**2;
}

function weightedValue(weights:number[], key:keyof Pick<Scenario,"methaneBefore"|"methaneAfter"|"gasBefore"|"gasAfter"|"generatorBefore"|"generatorAfter">) {
  const total = weights.reduce((sum,value)=>sum+value,0) || 1;
  return scenarios.reduce((sum,scenario,index)=>sum+scenario[key]*weights[index],0)/total;
}

export async function POST(req:Request) {
  const x = await req.json();
  const feedstock = normalizedFeedstock(x.feedstock);
  const input = {
    feedstock,
    feedRate:Number(x.feedRate), temperature:Number(x.temperature), ph:Number(x.ph), olr:Number(x.olr),
    hrt:Number(x.hrt), codIn:Number(x.codIn), vfa:Number(x.vfa), mixing:Number(x.mixing),
  };
  const keys = ["feedRate","temperature","ph","olr","hrt","codIn","vfa","mixing"] as const;
  const outOfRange = keys.some((key)=>!Number.isFinite(input[key]) || input[key] < bounds[key][0] || input[key] > bounds[key][1]);
  const safe = {...input};
  for (const key of keys) safe[key] = clamp(Number.isFinite(input[key]) ? input[key] : (bounds[key][0]+bounds[key][1])/2, bounds[key][0], bounds[key][1]);

  const distances = scenarios.map((scenario)=>distanceToScenario(safe,scenario));
  const weights = distances.map((distance)=>Math.exp(-.5*distance));
  const baseGasBefore = weightedValue(weights,"gasBefore");
  const baseGasAfter = weightedValue(weights,"gasAfter");
  const baseMethaneBefore = weightedValue(weights,"methaneBefore");
  const baseMethaneAfter = weightedValue(weights,"methaneAfter");
  const baseGeneratorBefore = weightedValue(weights,"generatorBefore");
  const baseGeneratorAfter = weightedValue(weights,"generatorAfter");

  // Feed-rate response is calibrated from the supplied 10-run validation trend.
  // VFA and mixing are conservative scenario modifiers because the SCADA rows do
  // not contain reliable causal signal for those variables.
  const feedFactor = clamp(1 + (safe.feedRate-846)*.0035,.9,1.09);
  const vfaFactor = clamp(1 - .06*((safe.vfa-1100)/1850)**2,.91,1);
  const mixingFactor = clamp(1 - .055*((safe.mixing-50)/30)**2,.92,1);
  const gasFlow = clamp(baseGasAfter*feedFactor*vfaFactor*mixingFactor,70,240);
  const methanePct = clamp(baseMethaneAfter+(feedFactor-1)*2+(vfaFactor-1)*18+(mixingFactor-1)*8,48,72);
  const generatorKw = clamp(baseGeneratorAfter*(gasFlow/baseGasAfter)*(methanePct/baseMethaneAfter),20,95);
  const biogas = gasFlow*24;
  const methane = biogas*methanePct/100;
  const electricity = generatorKw*24;
  const baselineGas = baseGasBefore*feedFactor;
  const improvement = (gasFlow/baselineGas-1)*100;
  const carbon = electricity*.000708;

  const bestScenario = scenarios.filter((scenario)=>scenario.feedstock===feedstock).sort((a,b)=>b.generatorAfter-a.generatorAfter)[0] ?? scenarios[0];
  const bestSetpoints = {feedRate:870,temperature:bestScenario.temperature,ph:bestScenario.ph,olr:bestScenario.olr,hrt:bestScenario.hrt,codIn:bestScenario.codIn,vfa:1100,mixing:50};
  const coverageDistance = Math.sqrt(Math.min(...distances)
    + ((safe.feedRate-846)/26)**2 + ((safe.vfa-1100)/1100)**2 + ((safe.mixing-50)/25)**2);
  const confidence = clamp(94-coverageDistance*8-(outOfRange?14:0),52,94);
  const stability = clamp(94-Math.abs(safe.ph-bestSetpoints.ph)*28-Math.abs(safe.temperature-bestSetpoints.temperature)*3-Math.max(0,safe.olr-bestSetpoints.olr)*4-Math.abs(safe.vfa-1100)/180-Math.abs(safe.mixing-50)*.25,35,95);
  const codRemoval = clamp(72+(methanePct-55)*.55+(safe.hrt-15)*.35-Math.abs(safe.vfa-1100)/250,52,92);
  const pressure = clamp(11+gasFlow*.07,12,42);
  const h2s = clamp(620-(safe.ph-6.8)*310+(safe.vfa-1100)*.13,60,1500);
  const baselineMethaneFlow = baseGasBefore*feedFactor*baseMethaneBefore/100;
  const methaneGain = (gasFlow*methanePct/100/baselineMethaneFlow-1)*100;
  const electricityGain = (generatorKw/(baseGeneratorBefore*feedFactor)-1)*100;
  const optimizationTargets = [
    {label:"Methane Production",value:methaneGain},
    {label:"Electricity Output",value:electricityGain},
    {label:"COD Removal",value:codRemoval-65},
    {label:"Gas Stability",value:stability-70},
    {label:"Generator Efficiency",value:electricityGain*.72},
    {label:"Boiler Fuel Saving",value:methaneGain*.58},
    {label:"Carbon Reduction",value:electricityGain},
  ];
  // Keep the two headline figures identical: both represent the predicted
  // biogas performance improvement versus the same baseline scenario.
  const overallBenefit = improvement;
  const benefitTrend = Array.from({length:8},(_,index)=>overallBenefit*(.58+index*.055)+Math.sin(index*1.15)*Math.max(1,Math.abs(overallBenefit)*.045));

  const recommendations:{title:string;detail:string;impact:number;tone:string}[] = [];
  const add = (title:string,detail:string,impact:number)=>recommendations.push({title,detail,impact:Math.max(.2,impact),tone:"up"});
  if (Math.abs(safe.feedRate-bestSetpoints.feedRate)>4) add(`Simulate feed rate ${bestSetpoints.feedRate} kg VS/d`,"Increase only within the OLR and VFA guardrails; operator approval is required.",Math.abs(safe.feedRate-bestSetpoints.feedRate)*.11);
  if (Math.abs(safe.temperature-bestSetpoints.temperature)>.25) add(`Move temperature toward ${bestSetpoints.temperature.toFixed(1)} C`,`${feedstock} scenario anchor; change heating gradually.`,Math.abs(safe.temperature-bestSetpoints.temperature)*1.7);
  if (Math.abs(safe.ph-bestSetpoints.ph)>.04) add(`Move pH toward ${bestSetpoints.ph.toFixed(2)}`,"Check VFA/alkalinity before any dosing change.",Math.abs(safe.ph-bestSetpoints.ph)*18);
  if (Math.abs(safe.olr-bestSetpoints.olr)>.15) add(`Target OLR ${bestSetpoints.olr.toFixed(1)} kg COD/m3/day`,"Use incremental feeding and monitor process stability.",Math.abs(safe.olr-bestSetpoints.olr)*2.2);
  if (Math.abs(safe.hrt-bestSetpoints.hrt)>.5) add(`Compare ${bestSetpoints.hrt} day HRT`,"This target comes from the closest supplied feedstock scenario.",Math.abs(safe.hrt-bestSetpoints.hrt)*.45);
  if (Math.abs(safe.codIn-bestSetpoints.codIn)>350) add(`COD reference ${bestSetpoints.codIn.toFixed(0)} mg/L`,"COD is measured rather than directly controlled; use this as a scenario comparison.",Math.abs(safe.codIn-bestSetpoints.codIn)/900);
  if (Math.abs(safe.vfa-bestSetpoints.vfa)>180) add(`Investigate VFA near ${bestSetpoints.vfa} mg/L`,"Use VFA together with alkalinity and trend data before changing feed.",Math.abs(safe.vfa-bestSetpoints.vfa)/450);
  if (Math.abs(safe.mixing-bestSetpoints.mixing)>4) add(`Compare mixing at ${bestSetpoints.mixing} RPM`,"Confirm parasitic power and avoid excessive mixing.",Math.abs(safe.mixing-bestSetpoints.mixing)*.12);
  recommendations.sort((a,b)=>b.impact-a.impact);
  if (!recommendations.length) add("Hold the current scenario inputs",`The inputs are close to the strongest supplied ${feedstock} anchor.`,1);
  if (outOfRange) recommendations.unshift({title:"Input clipped to the supported range",detail:"At least one value is outside the synthetic SCADA coverage range.",impact:0,tone:"down"});

  const previousBiogas = Number(x.previousRun?.prediction?.biogas);
  const comparison = Number.isFinite(previousBiogas) ? ` Biogas changed by ${biogas>=previousBiogas?"+":""}${(biogas-previousBiogas).toFixed(1)} m3/day versus the previous run.` : " This is the first run in the comparison.";
  const forecast = Array.from({length:12},(_,index)=>biogas*(.975+Math.sin(index*1.2)*.012+index*.0015));
  const agentMessage = `Analysis complete for ${feedstock}: feed ${safe.feedRate.toFixed(0)} kg VS/day, ${safe.temperature.toFixed(1)} C, pH ${safe.ph.toFixed(2)}, OLR ${safe.olr.toFixed(2)}, HRT ${safe.hrt.toFixed(1)} days, COD ${safe.codIn.toFixed(0)} mg/L, VFA ${safe.vfa.toFixed(0)} mg/L, and mixing ${safe.mixing.toFixed(0)} RPM. The multi-input scenario model estimates ${biogas.toFixed(1)} m3/day biogas, ${methanePct.toFixed(1)}% methane, and ${electricity.toFixed(1)} kWh/day.${comparison} Scenario coverage is ${confidence.toFixed(0)}%; this is input-space coverage, not validated plant accuracy.`;

  return NextResponse.json({biogas,methanePct,methane,electricity,carbon,codRemoval,stability,confidence,improvement,pressure,h2s,generatorKw,optimizationTargets,overallBenefit,benefitTrend,recommendations:recommendations.slice(0,4),forecast,bestSetpoints,agentMessage,modelName:"Multi-Input Scenario Ensemble",modelFit:"10 optimization anchors + 1,000-row SCADA coverage",outOfRange,confidenceMeaning:"Scenario coverage, not calibrated uncertainty"});
}
