import { NextResponse } from "next/server";
import { getSession } from "../../lib/auth";
import { getThresholds, recordKpiObservation, recordSimulation } from "../../lib/audit";
import { clamp, normalizeFeedstock, round } from "../../lib/scenario-engine";
import { predictShortHrt, shortHrtBounds, shortHrtModelMetadata, type ShortHrtInput } from "../../lib/short-hrt-model";
import { runAgentWorkflow } from "../../lib/agent-workflow";

type MainInput = ShortHrtInput & { feedstock:string; codIn:number; vfa:number; mixing:number };
const shortKeys=["feedRate","temperature","ph","olr","hrtHours"] as const;

function alertStatus(condition:boolean,critical=false) { return condition?(critical?"critical":"warning"):"normal"; }

export async function POST(req:Request) {
  const session=await getSession(req);
  if(!session) return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await req.json();
  const submitted:MainInput={
    feedstock:normalizeFeedstock(body.feedstock),feedRate:Number(body.feedRate),temperature:Number(body.temperature),ph:Number(body.ph),olr:Number(body.olr),
    hrtHours:Number(body.hrt),codIn:Number(body.codIn),vfa:Number(body.vfa),mixing:Number(body.mixing),
  };
  const thresholds=await getThresholds();
  const workflow=await runAgentWorkflow(submitted,thresholds);
  const { input, extrapolatedInputs, optimizedPrediction, baselinePrediction, recommendedInput, recommendedPrediction, recommendedBaseline }=workflow;
  const bestSetpoints={feedRate:recommendedInput.feedRate,temperature:recommendedInput.temperature,ph:recommendedInput.ph,olr:recommendedInput.olr,hrt:recommendedInput.hrtHours,codIn:Number.isFinite(submitted.codIn)?submitted.codIn:7000,vfa:Number.isFinite(submitted.vfa)?submitted.vfa:1100,mixing:Number.isFinite(submitted.mixing)?submitted.mixing:50};

  const biogas=optimizedPrediction.optimizedBiogas;
  const methane=optimizedPrediction.methane;
  const methanePct=optimizedPrediction.methanePct;
  const electricity=optimizedPrediction.electricity;
  const baselineBiogas=baselinePrediction.biogas;
  const baselineMethane=baselinePrediction.methane;
  const baselineElectricity=baselinePrediction.electricity;
  const h2s=optimizedPrediction.h2sAfterFilter;
  const pressure=clamp(11+biogas/24*.07,12,42);
  const improvement=(biogas/baselineBiogas-1)*100;
  const methaneGain=(methane/baselineMethane-1)*100;
  const electricityGain=(electricity/baselineElectricity-1)*100;
  const carbon=electricity*.000708;
  const baseline={gasFlow:round(baselineBiogas/24,3),biogas:baselineBiogas,methanePct:baselinePrediction.methanePct,methane:baselineMethane,electricity:baselineElectricity,generatorKw:baselinePrediction.generatorKw,carbon:baselinePrediction.carbon,co2Pct:baselinePrediction.co2Pct,h2s:baselinePrediction.h2s};
  const optimized={gasFlow:round(biogas/24,3),biogas,methanePct,methane,electricity,generatorKw:round(electricity/24,3),carbon:round(carbon,3),co2Pct:optimizedPrediction.co2FractionPct,h2s};

  const recommendations:{title:string;detail:string;impact:number;tone:string;parameter:string;current:number;target:number;unit:string}[]=[];
  const add=(parameter:string,current:number,target:number,unit:string,title:string,detail:string,impact:number)=>recommendations.push({parameter,current,target,unit,title,detail,impact,tone:"up"});
  if(recommendedInput.hrtHours<input.hrtHours) add("HRT",input.hrtHours,recommendedInput.hrtHours,"hours",`Reduce HRT from ${round(input.hrtHours,2)} to ${round(recommendedInput.hrtHours,2)} hours`,`The local model search retains candidates that improve all three production outputs before ranking the lowest HRT option.`,Math.abs(input.hrtHours-recommendedInput.hrtHours));
  if(Math.abs(recommendedInput.temperature-input.temperature)>.05) add("Temperature",input.temperature,recommendedInput.temperature,"°C",`Adjust temperature toward ${round(recommendedInput.temperature,1)} °C`,`Change heating gradually and pilot-check the short-HRT setpoint.`,Math.abs(recommendedInput.temperature-input.temperature));
  if(Math.abs(recommendedInput.ph-input.ph)>.01) add("pH",input.ph,recommendedInput.ph,"pH",`Adjust pH toward ${round(recommendedInput.ph,2)}`,`Keep pH inside the supplied short-HRT training envelope.`,Math.abs(recommendedInput.ph-input.ph)*20);
  if(Math.abs(recommendedInput.olr-input.olr)>.02) add("OLR",input.olr,recommendedInput.olr,"kg VS/m³·d",`Compare OLR ${round(input.olr,2)} → ${round(recommendedInput.olr,2)}`,`Change loading incrementally and validate at pilot scale.`,Math.abs(recommendedInput.olr-input.olr));
  if(Math.abs(recommendedInput.feedRate-input.feedRate)>.1) add("Feed rate",input.feedRate,recommendedInput.feedRate,"kg VS/day",`Compare feed rate ${round(input.feedRate,1)} → ${round(recommendedInput.feedRate,1)}`,`The five-value short-HRT model uses this feed rate directly.`,Math.abs(recommendedInput.feedRate-input.feedRate)/8);
  if(!recommendations.length) add("Scenario",1,1,"","Keep the entered short-HRT condition","The local deterministic search did not find a lower-HRT candidate that improved all three outputs.",1);
  recommendations.sort((a,b)=>b.impact-a.impact);

  const sensitivitySpecs:{label:string;key:keyof ShortHrtInput;step:number;unit:string}[]=[
    {label:"Feed rate",key:"feedRate",step:3,unit:"kg VS/day"},{label:"Temperature",key:"temperature",step:.5,unit:"°C"},
    {label:"pH",key:"ph",step:.03,unit:"pH"},{label:"Organic loading",key:"olr",step:.8,unit:"kg VS/m³·d"},{label:"Retention time",key:"hrtHours",step:1,unit:"hours"},
  ];
  const rawSensitivity=sensitivitySpecs.map((spec)=>{
    const [min,max]=shortHrtBounds[spec.key];
    const lower={...input,[spec.key]:clamp(input[spec.key]-spec.step,min,max)};
    const upper={...input,[spec.key]:clamp(input[spec.key]+spec.step,min,max)};
    const low=predictShortHrt(lower).optimizedBiogas;const high=predictShortHrt(upper).optimizedBiogas;
    return {label:spec.label,response:Math.abs(high-low)/2,direction:high>=low?"increase":"decrease",step:spec.step,unit:spec.unit};
  });
  const maximumSensitivity=Math.max(1,...rawSensitivity.map((item)=>item.response));
  const inputSensitivity=rawSensitivity.map((item)=>({...item,response:round(item.response,2),strength:round(item.response/maximumSensitivity*100,1)})).sort((a,b)=>b.response-a.response);

  const curve=(changes:Partial<ShortHrtInput>)=>{const value=predictShortHrt({...input,...changes});return {input:round(Number(changes.hrtHours??changes.ph),3),biogas:value.optimizedBiogas,methane:value.methane,electricity:value.electricity};};
  const sweep=(center:number,target:number,radius:number,min:number,max:number)=>{const low=clamp(Math.min(center,target)-radius,min,max);const high=clamp(Math.max(center,target)+radius,min,max);return Array.from({length:11},(_,index)=>round(low+(high-low)*index/10,3));};
  const modelCurves={
    source:"Same trained 2–24 hour Ridge model; one submitted plant value is swept while the other four remain fixed.",
    current:{hrt:input.hrtHours,ph:input.ph,biogas,methane,electricity},
    hrt:sweep(input.hrtHours,recommendedInput.hrtHours,2,...shortHrtBounds.hrtHours).map((value)=>curve({hrtHours:value})),
    ph:sweep(input.ph,recommendedInput.ph,.08,...shortHrtBounds.ph).map((value)=>curve({ph:value})),
  };
  const alerts=[
    {key:"methane",label:"Methane quality",value:methanePct,unit:"%",limit:`≥ ${thresholds.methaneMinimum}%`,status:alertStatus(methanePct<thresholds.methaneMinimum),message:methanePct<thresholds.methaneMinimum?"Below configured methane target":"Within configured methane target"},
    {key:"h2s",label:"Hydrogen sulphide",value:h2s,unit:"ppm",limit:`≤ ${thresholds.h2sWarning} ppm`,status:alertStatus(h2s>thresholds.h2sWarning),message:h2s>thresholds.h2sWarning?"Treatment review recommended":"Below configured warning threshold"},
    {key:"pressure",label:"Digester pressure",value:pressure,unit:"mbar",limit:`${thresholds.pressureMinimum}–${thresholds.pressureMaximum} mbar`,status:alertStatus(pressure<thresholds.pressureMinimum||pressure>thresholds.pressureMaximum,true),message:pressure<thresholds.pressureMinimum||pressure>thresholds.pressureMaximum?"Outside configured pressure band":"Within configured pressure band"},
  ];
  const hourlyForecast=Array.from({length:13},(_,index)=>{const drift=1+(index/12)*.012+Math.sin(index*.8)*.007;return {hour:index*2,biogas:round(biogas*drift,3),electricity:round(electricity*(1+(index/12)*.01+Math.cos(index*.7)*.006),3),baselineBiogas:round(baselineBiogas*(1+Math.sin(index*.6)*.004),3),baselineElectricity:round(baselineElectricity*(1+Math.cos(index*.55)*.004),3),ch4:round(clamp(methanePct+Math.sin(index)*.18,20,80),3),co2:round(clamp(optimizedPrediction.co2FractionPct-Math.sin(index)*.12,0,100),3),h2s:round(clamp(h2s*(1+Math.cos(index)*.02),0,1000),3)};});
  const runId=crypto.randomUUID();const createdAt=new Date().toISOString();
  const featureInfluence=shortKeys.map((key,index)=>({label:["Feed rate","Temperature","pH","Organic loading","Retention time"][index],contribution:round(Math.abs((input[key]-([893.6044,49.392,6.72686,16.46482,13][index]))/([15.7016,8.1646,.177,15.0922,6.3636][index]))*20,1),interpretation:input[key]<shortHrtBounds[key][0]||input[key]>shortHrtBounds[key][1]?"Outside training range":"Used by trained model"}));
  const modelTrace={executionId:runId,executedAt:createdAt,endpoint:"POST /api/predict",algorithm:shortHrtModelMetadata.algorithm,implementation:"LangGraph StateGraph orchestration + exported TypeScript Ridge coefficients",randomized:false,inputCount:5,scenarioCount:3125,coverageRows:500,status:"LangGraph-orchestrated short-HRT synthetic research model — not site validated",stages:[...workflow.stages],nearestScenarios:[{anchor:"HRT-500",feedstock:"Hours-scale synthetic research set",distance:round(100-optimizedPrediction.coverageScore,2),weight:optimizedPrediction.coverageScore}],featureInfluence,inputSensitivity,limitations:[shortHrtModelMetadata.limitation,"The current baseline is a condition-responsive counterfactual calculation because the source baseline column is constant at 50 m³/day.","Recommendations require operator review and pilot validation." ]};
  const previous=Number(body.previousRun?.prediction?.biogas);
  const comparison=Number.isFinite(previous)?` Biogas changed by ${biogas>=previous?"+":""}${round(biogas-previous,1)} m³/day from the previous run.`:"";
  const agentMessage=`The 2–24 hour HRT model estimates ${biogas.toFixed(1)} m³/day biogas, ${methane.toFixed(1)} m³ CH₄/day and ${electricity.toFixed(1)} kWh/day from five plant values. Current baseline is ${baselineBiogas.toFixed(1)} m³/day. Recommended HRT: ${recommendedInput.hrtHours.toFixed(1)} hours.${comparison}`;
  const responseData={biogas,methanePct,methane,electricity,carbon:round(carbon,3),codRemoval:round(clamp(68+(methanePct-50)*.6,45,93),2),stability:round(clamp(90-(100-optimizedPrediction.coverageScore)*.4,35,95),2),confidence:optimizedPrediction.coverageScore,improvement:round(improvement,2),pressure,h2s,generatorKw:optimized.generatorKw,optimizationTargets:[{label:"Biogas production",value:round(improvement,2)},{label:"Methane output",value:round(methaneGain,2)},{label:"Electricity output",value:round(electricityGain,2)},{label:"HRT reduction",value:round(input.hrtHours-recommendedInput.hrtHours,2)}],overallBenefit:round(improvement,2),benefitTrend:Array.from({length:8},(_,index)=>round(improvement*(.55+index*.06),2)),recommendations:recommendations.slice(0,5),recommendedProjection:{biogas:recommendedPrediction.optimizedBiogas,methane:recommendedPrediction.methane,electricity:recommendedPrediction.electricity,biogasChange:round(recommendedPrediction.optimizedBiogas-biogas,2),methaneChange:round(recommendedPrediction.methane-methane,2),electricityChange:round(recommendedPrediction.electricity-electricity,2),basis:"Same trained short-HRT model evaluated at the recommended lower-HRT setpoint."},forecast:hourlyForecast.map((point)=>point.biogas),hourlyForecast,modelCurves,bestSetpoints,agentMessage,modelName:"Short-HRT Biogas Prediction Model",modelVersion:shortHrtModelMetadata.version,modelFit:"500 supplied synthetic rows · 5 plant values · 2–24 hour HRT",outOfRange:extrapolatedInputs.length>0,extrapolatedInputs,confidenceMeaning:"Training-space coverage score, not calibrated uncertainty",baseline,optimized,gasComposition:[{key:"ch4",label:"CH₄",name:"Methane",before:baseline.methanePct,after:methanePct,unit:"%",direction:"up"},{key:"co2",label:"CO₂",name:"Carbon dioxide",before:baseline.co2Pct,after:optimized.co2Pct,unit:"%",direction:"down"},{key:"h2s",label:"H₂S",name:"Hydrogen sulphide",before:baseline.h2s,after:h2s,unit:"ppm",direction:"down"}],performanceMetrics:[{key:"biogas",label:"BIOGAS",name:"Total production",before:baselineBiogas,after:biogas,unit:"m³/d",direction:"up"},{key:"methane",label:"CH₄ OUT",name:"Methane output",before:baselineMethane,after:methane,unit:"m³/d",direction:"up"},{key:"electricity",label:"ENERGY",name:"Electricity output",before:baselineElectricity,after:electricity,unit:"kWh/d",direction:"up"}],alerts,equipmentStates:[{label:"Biogas outlet valve",state:"OPEN",detail:`Pressure ${pressure.toFixed(1)} mbar`,mode:"SIMULATED",tone:"normal"},{label:"Wastewater feed valve",state:"PULSED",detail:`Target ${input.feedRate.toFixed(0)} kg VS/day`,mode:"SIMULATED",tone:"normal"},{label:"Mixer drive",state:"ON",detail:"Simulated plant state",mode:"SIMULATED",tone:"normal"},{label:"Generator",state:"ENABLED",detail:`Estimated ${optimized.generatorKw.toFixed(1)} kW`,mode:"SIMULATED",tone:"normal"},{label:"Heating loop",state:"AUTO",detail:`Target ${recommendedInput.temperature.toFixed(1)} °C`,mode:"SIMULATED",tone:"normal"}],inputEffects:shortKeys.map((key,index)=>({label:["Feed rate","Temperature","pH","Organic loading","HRT"][index],value:key==="hrtHours"?`${input[key]} hours`:String(input[key]),effect:"Used directly by the trained short-HRT model"})),modelTrace,facility:{name:thresholds.facilityName,location:thresholds.facilityLocation},mode:"SIMULATION",runId,createdAt};
  let auditSaved=false;let kpiSaved=false;
  try {
    auditSaved=await recordSimulation({id:runId,username:session.username,role:session.role,feedstock:submitted.feedstock,inputs:{...submitted,hrtHours:input.hrtHours},outputs:{baseline,optimized,recommendations:recommendations.slice(0,5),modelTrace},modelVersion:shortHrtModelMetadata.version});
    kpiSaved=await recordKpiObservation({id:crypto.randomUUID(),observedAt:createdAt,source:"modelled_prediction",digesterId:"manual-digester",runId,biogas,methane,electricity,methanePct,co2Pct:optimized.co2Pct,h2s,metadata:{modelVersion:shortHrtModelMetadata.version,mode:"simulation",input},createdBy:session.username});
  } catch { /* prediction remains available if the ledger is unavailable */ }
  modelTrace.stages.push({label:"Persist audit evidence",status:"complete",detail:auditSaved?`Run evidence saved to the server-side Supabase audit ledger${kpiSaved?"; one source-labelled modelled KPI record was also stored.":"."}`:"Audit evidence returned with this response; durable Supabase storage is not available.",tool:"Supabase audit writer"});
  return NextResponse.json({...responseData,audit:{runId,createdAt,saved:auditSaved,status:auditSaved?"RECORDED":"NOT RECORDED"}});
}
