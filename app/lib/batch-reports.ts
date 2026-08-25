import { clamp, inferScenario, normalInputBounds, optimizationScenarios, physicalInputBounds, round, sanitizeModelInput, type ModelInput } from "./scenario-engine";
import { defaultShortHrtInput, estimateShortHrtBaseline, predictShortHrt, sanitizeShortHrtInput, shortHrtBounds, type ShortHrtInput } from "./short-hrt-model";
import { shortHrtBatchInputs } from "./short-hrt-batch-inputs.generated";

export type BatchCohort = "farm_optimization" | "hours_research" | "under_6_hours" | "short_hrt_batch";

export type BatchDefinition = {
  cohort:BatchCohort;
  rowCount:number;
  baseInput:ModelInput;
  shortHrtInput?:ShortHrtInput;
  schemaVersion:"3.0"|"4.0";
};

export type BatchRow = {
  scenario_id:string; rank:number; source_cohort:string; source_run_id?:string; candidate_profile?:string; feedstock:string;
  feed_rate_kg_vs_day:number; temperature_c:number; ph:number; olr_kg_vs_m3_day:number; hrt_days:number; hrt_hours:number;
  cod_in_mg_l:number; vfa_mg_l:number; mixer_rpm:number;
  baseline_biogas_m3_day:number; baseline_methane_m3_day:number; baseline_electricity_kwh_day:number; optimized_biogas_m3_day:number; methane_m3_day:number; electricity_kwh_day:number;
  co2_fraction_pct:number; estimated_co2e_avoided_kg_day:number; h2s_before_ppm:number; h2s_ppm:number; h2s_removed_ppm:number; scenario_coverage_score:number; biogas_increase_pct:number; ch4_content_pct:number; ai_model_coverage_pct:number; process_stability_estimate_pct:number; is_farmer_input:boolean;
  ai_recommendation:string; evidence_note:string;
};

export type BatchProjection = {
  basis:string; sourceRows:number; selectedCandidates:number;
  dailyMean:{baselineBiogasM3Day:number;optimizedBiogasM3Day:number;baselineMethaneM3Day:number;optimizedMethaneM3Day:number;baselineElectricityKwhDay:number;optimizedElectricityKwhDay:number;h2sRemovedPpm:number;estimatedCo2eAvoidedKgDay:number;modelCoveragePct:number;processStabilityEstimatePct:number};
  dailyRows:ModelledDailyProjectionRow[];
  monthlyRows:ModelledMonthlyProjectionRow[];
  monthlyEquivalent:{baselineBiogasM3:number;optimizedBiogasM3:number;baselineMethaneM3:number;optimizedMethaneM3:number;baselineElectricityKwh:number;optimizedElectricityKwh:number;estimatedCo2eAvoidedKg:number};
  annualized:{baselineBiogasM3:number;optimizedBiogasM3:number;baselineMethaneM3:number;optimizedMethaneM3:number;baselineElectricityKwh:number;optimizedElectricityKwh:number;estimatedCo2eAvoidedKg:number};
};

export type ModelledDailyProjectionRow = {
  modelled_day:number; source_conditions_aggregated:number;
  baseline_biogas_m3_day:number; optimized_biogas_m3_day:number;
  baseline_methane_m3_day:number; optimized_methane_m3_day:number;
  baseline_electricity_kwh_day:number; optimized_electricity_kwh_day:number;
  h2s_removed_ppm:number; estimated_co2e_avoided_kg_day:number; model_coverage_pct:number; process_stability_estimate_pct:number;
};

export type ModelledMonthlyProjectionRow = {
  modelled_month:number; month_label:string; source_conditions_aggregated:number;
  baseline_biogas_m3:number; optimized_biogas_m3:number;
  baseline_methane_m3:number; optimized_methane_m3:number;
  baseline_electricity_kwh:number; optimized_electricity_kwh:number;
  biogas_increase_pct:number; h2s_removed_ppm:number; estimated_co2e_avoided_kg:number;
};

function derivedReportIndicators(baselineBiogas:number,optimizedBiogas:number,methane:number,coverage:number,h2sAfter:number,ph:number) {
  const biogasIncrease=baselineBiogas>0?(optimizedBiogas-baselineBiogas)/baselineBiogas*100:0;
  const ch4Content=optimizedBiogas>0?methane/optimizedBiogas*100:0;
  const phScore=clamp(100-Math.abs(ph-7)*100,0,100);
  const h2sScore=clamp(100-h2sAfter*.2,0,100);
  const processStability=clamp(coverage*.65+phScore*.25+h2sScore*.1,0,100);
  return {biogas_increase_pct:round(biogasIncrease,3),ch4_content_pct:round(ch4Content,3),ai_model_coverage_pct:round(coverage,3),process_stability_estimate_pct:round(processStability,3)};
}

export type BatchSummary = {
  totalRows:number; inputCount:number; sourceInput:ModelInput; shortHrtInput?:ShortHrtInput;
  farmerInput:{baselineBiogasM3Day:number;optimizedBiogasM3Day:number;methaneM3Day:number;electricityKwhDay:number};
  bestScenario:BatchRow;
  bestVsFarmer:{biogasM3Day:number;methaneM3Day:number;electricityKwhDay:number;hrtHours:number};
  withinNormalModelCoverage:number; sourceNote:string; safetyNote:string; projection?:BatchProjection;
};

export type BatchReport = {definition:BatchDefinition;rows:BatchRow[];summary:BatchSummary};

const feedstocks=[...new Set(optimizationScenarios.map((scenario)=>scenario.feedstock))];
const numericKeys=["feedRate","temperature","ph","olr","hrt","codIn","vfa","mixing"] as const;
type NumericKey=typeof numericKeys[number];
const spread:{[K in NumericKey]:number}={feedRate:25,temperature:1.2,ph:.16,olr:.65,hrt:4.5,codIn:1800,vfa:900,mixing:20};
const sequenceMultiplier:{[K in NumericKey]:number}={feedRate:37,temperature:73,ph:127,olr:191,hrt:239,codIn:313,vfa:401,mixing:457};
const shortKeys=["feedRate","temperature","ph","olr","hrtHours"] as const;
type ShortKey=typeof shortKeys[number];
const shortSequenceMultiplier:{[K in ShortKey]:number}={feedRate:37,temperature:73,ph:127,olr:191,hrtHours:239};
const shortSearchSpread:{[K in ShortKey]:number}={feedRate:18,temperature:8,ph:.2,olr:10,hrtHours:0};

function fraction(index:number,count:number,multiplier:number) { return (((index*multiplier)%count)+.5)/count; }

function cohortInfo(cohort:BatchCohort) {
  if(cohort==="short_hrt_batch") return {
    label:"Farm biodigester online reading — simulated short-HRT conditions",hrtRange:[2/24,1] as const,
    sourceNote:"Simulated short-HRT operating conditions are processed as online reading. Workbook optimized-output columns are excluded from inference; the deployed five-value Ridge model generates 2,000 new model-output rows.",
    safetyNote:"These are synthetic research projections, not field telemetry. H₂S removal and CO₂e avoidance are calculated estimates; every recommended setting needs operator review and pilot validation.",
  };
  if(cohort==="under_6_hours") return {
    label:"Below-6-hour research extrapolation",hrtRange:[.5/24,5.95/24] as const,
    sourceNote:"The deployed short-HRT ridge model was trained from 2 to 24 hours. Below 2 hours is labelled extrapolation and is not used by the standard short-HRT search.",
    safetyNote:"Extreme research extrapolation. These candidates are not operational setpoints and require bench/pilot validation.",
  };
  if(cohort==="hours_research") return {
    label:"2–24-hour trained short-HRT model",hrtRange:[2/24,1] as const,
    sourceNote:"Every candidate is a deterministic variation around the current plant readjustment and is evaluated by the deployed 500-row hours-scale synthetic-data model: standardized quadratic Ridge regression on feed rate, temperature, pH, OLR and HRT in hours. Output estimates are constrained to the observed synthetic-data envelope.",
    safetyNote:"This is a synthetic research model, not field telemetry. Its 2–24 hour recommendations must be reviewed and pilot-validated before plant operation.",
  };
  return {
    label:"Plant readjustment optimization search",hrtRange:null,
    sourceNote:"Every row is a separate call to the same deterministic nine-value inference engine used by POST /api/predict.",
    safetyNote:"The rows are alternative candidate settings, not sequential plant observations. Do not sum them as daily or monthly production.",
  };
}

function candidateBounds(key:NumericKey,base:ModelInput,target:ModelInput,cohort:BatchCohort):[number,number] {
  if(key==="hrt"&&cohort!=="farm_optimization") return cohort==="under_6_hours"?[.5/24,5.95/24]:[2/24,1];
  const bounds=normalInputBounds[key];
  const low=clamp(Math.min(base[key],target[key])-spread[key],bounds[0],bounds[1]);
  const high=clamp(Math.max(base[key],target[key])+spread[key],bounds[0],bounds[1]);
  return [Math.min(low,high),Math.max(low,high)];
}

function normalModelMetrics(input:ModelInput,sourceCohort:string,isFarmerInput:boolean,evidenceNote:string):BatchRow {
  const core=inferScenario(input);
  const h2s=clamp(620-(input.ph-6.8)*310+(input.vfa-1100)*.13,60,1500);
  const co2Fraction=clamp(100-core.methanePct-h2s/10000,27,52);
  const coverageDistance=Math.sqrt(Math.min(...core.distances)+((input.feedRate-846)/26)**2+((input.vfa-1100)/1100)**2+((input.mixing-50)/25)**2);
  const outOfNormal=numericKeys.filter((key)=>input[key]<normalInputBounds[key][0]||input[key]>normalInputBounds[key][1]).length;
  const coverage=clamp(94-coverageDistance*8-outOfNormal*4,25,94);
  const reportIndicators=derivedReportIndicators(core.baselineBiogas,core.biogas,core.methane,coverage,h2s,input.ph);
  const targets=core.bestSetpoints as ModelInput;
  const biggestGap=numericKeys.map((key)=>({key,gap:Math.abs(input[key]-targets[key])/Math.max(1,spread[key])})).sort((a,b)=>b.gap-a.gap)[0];
  const actionLabel:Record<NumericKey,string>={feedRate:"feed rate",temperature:"temperature",ph:"pH",olr:"OLR",hrt:"HRT",codIn:"COD",vfa:"VFA",mixing:"mixer speed"};
  const unit:Record<NumericKey,string>={feedRate:"kg VS/day",temperature:"°C",ph:"",olr:"kg COD/m³·d",hrt:"days",codIn:"mg/L",vfa:"mg/L",mixing:"RPM"};
  const recommendation=biggestGap.gap<.1?"Keep this candidate close to the modeled reference; validate with the operator.":`Compare ${actionLabel[biggestGap.key]} ${round(input[biggestGap.key],2)} → ${round(targets[biggestGap.key],2)} ${unit[biggestGap.key]}.`;
  return {
    scenario_id:"",rank:0,source_cohort:sourceCohort,feedstock:input.feedstock,
    feed_rate_kg_vs_day:round(input.feedRate,3),temperature_c:round(input.temperature,3),ph:round(input.ph,3),olr_kg_vs_m3_day:round(input.olr,3),
    hrt_days:round(input.hrt,5),hrt_hours:round(input.hrt*24,3),cod_in_mg_l:round(input.codIn,3),vfa_mg_l:round(input.vfa,3),mixer_rpm:round(input.mixing,3),
    baseline_biogas_m3_day:round(core.baselineBiogas,3),baseline_methane_m3_day:round(core.baselineMethane,3),baseline_electricity_kwh_day:round(core.baselineElectricity,3),optimized_biogas_m3_day:round(core.biogas,3),methane_m3_day:round(core.methane,3),electricity_kwh_day:round(core.electricity,3),
    co2_fraction_pct:round(co2Fraction,3),estimated_co2e_avoided_kg_day:round(Math.max(0,core.electricity-core.baselineElectricity)*.708,3),h2s_before_ppm:round(h2s*1.35,3),h2s_ppm:round(h2s,3),h2s_removed_ppm:round(h2s*.35,3),scenario_coverage_score:round(coverage,2),...reportIndicators,is_farmer_input:isFarmerInput,
    ai_recommendation:recommendation,evidence_note:evidenceNote,
  };
}

function shortHrtMetrics(input:ShortHrtInput,baseInput:ModelInput,sourceCohort:string,isFarmerInput:boolean,evidenceNote:string):BatchRow {
  const predicted=predictShortHrt(input);
  const baseline=estimateShortHrtBaseline(input,predicted);
  const h2sBefore=clamp(predicted.h2sAfterFilter*13.6,120,500);
  const reportIndicators=derivedReportIndicators(baseline.biogas,predicted.optimizedBiogas,predicted.methane,predicted.coverageScore,predicted.h2sAfterFilter,input.ph);
  return {
    scenario_id:"",rank:0,source_cohort:sourceCohort,feedstock:baseInput.feedstock,
    feed_rate_kg_vs_day:round(input.feedRate,3),temperature_c:round(input.temperature,3),ph:round(input.ph,3),olr_kg_vs_m3_day:round(input.olr,3),
    hrt_days:round(input.hrtHours/24,5),hrt_hours:round(input.hrtHours,3),cod_in_mg_l:round(baseInput.codIn,3),vfa_mg_l:round(baseInput.vfa,3),mixer_rpm:round(baseInput.mixing,3),
    baseline_biogas_m3_day:baseline.biogas,baseline_methane_m3_day:baseline.methane,baseline_electricity_kwh_day:baseline.electricity,optimized_biogas_m3_day:predicted.optimizedBiogas,methane_m3_day:predicted.methane,electricity_kwh_day:predicted.electricity,
    co2_fraction_pct:predicted.co2FractionPct,estimated_co2e_avoided_kg_day:round(Math.max(0,predicted.electricity-baseline.electricity)*.708,3),h2s_before_ppm:round(h2sBefore,3),h2s_ppm:predicted.h2sAfterFilter,h2s_removed_ppm:round(h2sBefore-predicted.h2sAfterFilter,3),scenario_coverage_score:predicted.coverageScore,...reportIndicators,is_farmer_input:isFarmerInput,
    ai_recommendation:"Ranked after the HRT-aware multi-output search.",evidence_note:evidenceNote,
  };
}

function shortScore(row:BatchRow) {
  const biogas=(row.optimized_biogas_m3_day-65.51)/(85.48-65.51);
  const methane=(row.methane_m3_day-27.788)/(42.887-27.788);
  const electricity=(row.electricity_kwh_day-99.738)/(153.931-99.738);
  const hrtReduction=1-(row.hrt_hours-2)/22;
  return biogas*.29+methane*.29+electricity*.25+hrtReduction*.17;
}

function shortCandidateBounds(key:ShortKey,start:ShortHrtInput):[number,number] {
  const [min,max]=shortHrtBounds[key];
  const current=clamp(start[key],min,max);
  if(key==="hrtHours") return [min,current];
  const spread=shortSearchSpread[key];
  return [clamp(current-spread,min,max),clamp(current+spread,min,max)];
}

function shortRecommendation(start:BatchRow,candidate:BatchRow,rank:number) {
  const change=(label:string,before:number,after:number,unit:string,digits=1)=>`${label} ${round(before,digits)} → ${round(after,digits)} ${unit}`;
  const changes=[
    change("HRT",start.hrt_hours,candidate.hrt_hours,"h",2),change("temperature",start.temperature_c,candidate.temperature_c,"°C",1),
    change("pH",start.ph,candidate.ph,"",2),change("OLR",start.olr_kg_vs_m3_day,candidate.olr_kg_vs_m3_day,"kg VS/m³·d",2),
    change("feed rate",start.feed_rate_kg_vs_day,candidate.feed_rate_kg_vs_day,"kg VS/day",1),
  ];
  const outcomes=`Model outputs vs the starting condition: biogas ${round(start.optimized_biogas_m3_day,1)} → ${round(candidate.optimized_biogas_m3_day,1)} m³/day; methane ${round(start.methane_m3_day,1)} → ${round(candidate.methane_m3_day,1)} m³/day; electricity ${round(start.electricity_kwh_day,1)} → ${round(candidate.electricity_kwh_day,1)} kWh/day.`;
  const status=rank===1?"Top-ranked lower-HRT option.":candidate.hrt_hours<start.hrt_hours&&candidate.optimized_biogas_m3_day>=start.optimized_biogas_m3_day&&candidate.methane_m3_day>=start.methane_m3_day&&candidate.electricity_kwh_day>=start.electricity_kwh_day?"Lower-HRT candidate that maintains all three modelled outputs.":"Alternative candidate; compare its outputs with the top-ranked option.";
  return `${status} ${changes.join("; ")}. ${outcomes} Pilot-validate before applying.`;
}

function finishFarmReport(rowCount:number,cohort:BatchCohort,baseInput:ModelInput,definition:BatchDefinition):BatchReport {
  const info=cohortInfo(cohort);const baseCore=inferScenario(baseInput);const target={...baseInput,...baseCore.bestSetpoints} as ModelInput;
  const rows:BatchRow[]=[normalModelMetrics(baseInput,info.label,true,`${info.sourceNote} This is the farmer's submitted input.`)];const candidateCount=rowCount-1;
  for(let index=1;index<rowCount;index+=1) {
    const feedstock=feedstocks[(index*5)%feedstocks.length]||baseInput.feedstock;const candidate={...baseInput,feedstock} as ModelInput;
    const targetForFeedstock={...candidate,...inferScenario(candidate).bestSetpoints} as ModelInput;
    for(const key of numericKeys) {const [low,high]=candidateBounds(key,baseInput,targetForFeedstock,cohort);candidate[key]=round(low+(high-low)*fraction(index,candidateCount,sequenceMultiplier[key]),5);candidate[key]=clamp(candidate[key],physicalInputBounds[key][0],physicalInputBounds[key][1]);}
    rows.push(normalModelMetrics(candidate,info.label,false,`${info.sourceNote} Deterministic candidate ${index} of ${candidateCount}; no random value was used.`));
  }
  const farmerInput=rows[0];const ranked=[...rows].sort((a,b)=>b.optimized_biogas_m3_day-a.optimized_biogas_m3_day||b.methane_m3_day-a.methane_m3_day);
  ranked.forEach((row,index)=>{row.rank=index+1;row.scenario_id=row.is_farmer_input?"FARMER-INPUT":`MODEL-${String(index+1).padStart(5,"0")}`;});const bestScenario=ranked[0];
  const summary:BatchSummary={totalRows:rowCount,inputCount:9,sourceInput:baseInput,farmerInput:{baselineBiogasM3Day:farmerInput.baseline_biogas_m3_day,optimizedBiogasM3Day:farmerInput.optimized_biogas_m3_day,methaneM3Day:farmerInput.methane_m3_day,electricityKwhDay:farmerInput.electricity_kwh_day},bestScenario,bestVsFarmer:{biogasM3Day:round(bestScenario.optimized_biogas_m3_day-farmerInput.optimized_biogas_m3_day,3),methaneM3Day:round(bestScenario.methane_m3_day-farmerInput.methane_m3_day,3),electricityKwhDay:round(bestScenario.electricity_kwh_day-farmerInput.electricity_kwh_day,3),hrtHours:round(bestScenario.hrt_hours-farmerInput.hrt_hours,3)},withinNormalModelCoverage:ranked.filter((row)=>row.hrt_days>=normalInputBounds.hrt[0]&&row.hrt_days<=normalInputBounds.hrt[1]).length,sourceNote:info.sourceNote,safetyNote:info.safetyNote};
  return {definition,rows:ranked,summary};
}

function finishShortHrtReport(rowCount:number,baseInput:ModelInput,shortInput:ShortHrtInput,definition:BatchDefinition):BatchReport {
  const info=cohortInfo("hours_research");const rows:BatchRow[]=[shortHrtMetrics(shortInput,baseInput,info.label,true,`${info.sourceNote} This is the operator-entered starting condition.`)];const candidateCount=rowCount-1;
  for(let index=1;index<rowCount;index+=1) {const candidate={...shortInput} as ShortHrtInput;for(const key of shortKeys){const [low,high]=shortCandidateBounds(key,shortInput);candidate[key]=round(low+(high-low)*fraction(index,candidateCount,shortSequenceMultiplier[key]),5);}rows.push(shortHrtMetrics(candidate,baseInput,info.label,false,`${info.sourceNote} Plant-readjustment-centered deterministic candidate ${index} of ${candidateCount}; no random value was used.`));}
  const farmerInput=rows[0];const improvesAll=(row:BatchRow)=>!row.is_farmer_input&&row.hrt_hours<farmerInput.hrt_hours&&row.optimized_biogas_m3_day>=farmerInput.optimized_biogas_m3_day&&row.methane_m3_day>=farmerInput.methane_m3_day&&row.electricity_kwh_day>=farmerInput.electricity_kwh_day;
  const ranked=[...rows].sort((a,b)=>Number(improvesAll(b))-Number(improvesAll(a))||shortScore(b)-shortScore(a)||a.hrt_hours-b.hrt_hours);
  ranked.forEach((row,index)=>{row.rank=index+1;row.scenario_id=row.is_farmer_input?"STARTING-CONDITION":`SHORT-HRT-${String(index+1).padStart(5,"0")}`;});const bestScenario=ranked[0];
  ranked.forEach((row)=>{row.ai_recommendation=row.is_farmer_input?"Starting condition used only as the comparison reference for this report.":shortRecommendation(farmerInput,row,row.rank);});
  const summary:BatchSummary={totalRows:rowCount,inputCount:5,sourceInput:baseInput,shortHrtInput:shortInput,farmerInput:{baselineBiogasM3Day:farmerInput.baseline_biogas_m3_day,optimizedBiogasM3Day:farmerInput.optimized_biogas_m3_day,methaneM3Day:farmerInput.methane_m3_day,electricityKwhDay:farmerInput.electricity_kwh_day},bestScenario,bestVsFarmer:{biogasM3Day:round(bestScenario.optimized_biogas_m3_day-farmerInput.optimized_biogas_m3_day,3),methaneM3Day:round(bestScenario.methane_m3_day-farmerInput.methane_m3_day,3),electricityKwhDay:round(bestScenario.electricity_kwh_day-farmerInput.electricity_kwh_day,3),hrtHours:round(bestScenario.hrt_hours-farmerInput.hrt_hours,3)},withinNormalModelCoverage:ranked.filter((row)=>row.hrt_hours>=2&&row.hrt_hours<=24).length,sourceNote:info.sourceNote,safetyNote:info.safetyNote};
  return {definition,rows:ranked,summary};
}

const batchProfiles = [
  "Lower HRT trial",
  "Temperature and pH tune",
  "Organic loading balance",
  "Model-balanced option",
] as const;

/**
 * Creates four bounded, deterministic candidate setpoints from one supplied
 * source row. The source row contributes inputs only; no target/output cell
 * from the workbook is used in the inference path.
 */
function batchCandidate(source:ShortHrtInput, profile:(typeof batchProfiles)[number]) {
  const next={...source};
  if(profile==="Lower HRT trial") next.hrtHours=clamp(source.hrtHours*.88,shortHrtBounds.hrtHours[0],shortHrtBounds.hrtHours[1]);
  if(profile==="Temperature and pH tune") {
    next.temperature=clamp(source.temperature+(source.temperature<48?3:-2),shortHrtBounds.temperature[0],shortHrtBounds.temperature[1]);
    next.ph=clamp(source.ph+(source.ph<6.75?.08:-.05),shortHrtBounds.ph[0],shortHrtBounds.ph[1]);
  }
  if(profile==="Organic loading balance") {
    next.olr=clamp(source.olr+(source.olr<12?2.5:-2.5),shortHrtBounds.olr[0],shortHrtBounds.olr[1]);
    next.hrtHours=clamp(source.hrtHours*.94,shortHrtBounds.hrtHours[0],shortHrtBounds.hrtHours[1]);
  }
  if(profile==="Model-balanced option") {
    next.temperature=clamp(source.temperature+(source.temperature<47?2.2:-1.2),shortHrtBounds.temperature[0],shortHrtBounds.temperature[1]);
    next.ph=clamp(source.ph+(source.ph<6.75?.06:-.03),shortHrtBounds.ph[0],shortHrtBounds.ph[1]);
    next.olr=clamp(source.olr+(source.olr<14?1.5:-1.5),shortHrtBounds.olr[0],shortHrtBounds.olr[1]);
    next.hrtHours=clamp(source.hrtHours*.9,shortHrtBounds.hrtHours[0],shortHrtBounds.hrtHours[1]);
  }
  return next;
}

function batchRecommendation(source:ShortHrtInput,row:BatchRow,profile:string) {
  const parts:string[]=[];
  if(Math.abs(row.hrt_hours-source.hrtHours)>.02) parts.push(`HRT ${round(source.hrtHours,2)} → ${round(row.hrt_hours,2)} h`);
  if(Math.abs(row.temperature_c-source.temperature)>.02) parts.push(`temperature ${round(source.temperature,1)} → ${round(row.temperature_c,1)} °C`);
  if(Math.abs(row.ph-source.ph)>.01) parts.push(`pH ${round(source.ph,2)} → ${round(row.ph,2)}`);
  if(Math.abs(row.olr_kg_vs_m3_day-source.olr)>.02) parts.push(`OLR ${round(source.olr,2)} → ${round(row.olr_kg_vs_m3_day,2)} kg VS/m³·d`);
  return `${profile}: ${parts.join("; ")||"hold the supplied setpoints"}. Modelled output: ${round(row.optimized_biogas_m3_day,1)} m³/day biogas, ${round(row.methane_m3_day,1)} m³ CH₄/day and ${round(row.electricity_kwh_day,1)} kWh/day. Advisory only; pilot-validate before applying.`;
}

function rankedCandidatePerSource(rows:BatchRow[]) {
  const bestBySource=new Map<string,BatchRow>();
  for(const row of rows) {
    const key=row.source_run_id||row.scenario_id;
    const existing=bestBySource.get(key);
    if(!existing||shortScore(row)>shortScore(existing)) bestBySource.set(key,row);
  }
  return [...bestBySource.values()].sort((a,b)=>(a.source_run_id||"").localeCompare(b.source_run_id||""));
}

/** The source has no timestamps: these are deterministic 30-group modelled operating days, not calendar readings. */
function modelledDailyProjection(selected:BatchRow[]):ModelledDailyProjectionRow[] {
  const days=30;
  const mean=(group:BatchRow[],get:(row:BatchRow)=>number)=>group.reduce((sum,row)=>sum+get(row),0)/Math.max(1,group.length);
  return Array.from({length:days},(_,index)=>{
    const start=Math.floor(index*selected.length/days);
    const end=Math.floor((index+1)*selected.length/days);
    const group=selected.slice(start,end);
    return {
      modelled_day:index+1,source_conditions_aggregated:group.length,
      baseline_biogas_m3_day:round(mean(group,row=>row.baseline_biogas_m3_day),3),optimized_biogas_m3_day:round(mean(group,row=>row.optimized_biogas_m3_day),3),
      baseline_methane_m3_day:round(mean(group,row=>row.baseline_methane_m3_day),3),optimized_methane_m3_day:round(mean(group,row=>row.methane_m3_day),3),
      baseline_electricity_kwh_day:round(mean(group,row=>row.baseline_electricity_kwh_day),3),optimized_electricity_kwh_day:round(mean(group,row=>row.electricity_kwh_day),3),
      h2s_removed_ppm:round(mean(group,row=>row.h2s_removed_ppm),3),estimated_co2e_avoided_kg_day:round(mean(group,row=>row.estimated_co2e_avoided_kg_day),3),model_coverage_pct:round(mean(group,row=>row.ai_model_coverage_pct),3),process_stability_estimate_pct:round(mean(group,row=>row.process_stability_estimate_pct),3),
    };
  });
}

const projectionMonths=["January","February","March","April","May","June","July","August","September","October","November","December"] as const;

/**
 * The supplied batch does not contain calendar dates. We partition its selected
 * model outputs into twelve deterministic 30-day presentation periods so the
 * dashboard can show a readable month-by-month audit comparison.
 */
function modelledMonthlyProjection(selected:BatchRow[]):ModelledMonthlyProjectionRow[] {
  const mean=(group:BatchRow[],get:(row:BatchRow)=>number)=>group.reduce((sum,row)=>sum+get(row),0)/Math.max(1,group.length);
  return projectionMonths.map((month_label,index)=>{
    const start=Math.floor(index*selected.length/projectionMonths.length);
    const end=Math.floor((index+1)*selected.length/projectionMonths.length);
    const group=selected.slice(start,end);
    const baselineBiogas=mean(group,row=>row.baseline_biogas_m3_day)*30;
    const optimizedBiogas=mean(group,row=>row.optimized_biogas_m3_day)*30;
    return {
      modelled_month:index+1,month_label,source_conditions_aggregated:group.length,
      baseline_biogas_m3:round(baselineBiogas,2),optimized_biogas_m3:round(optimizedBiogas,2),
      baseline_methane_m3:round(mean(group,row=>row.baseline_methane_m3_day)*30,2),optimized_methane_m3:round(mean(group,row=>row.methane_m3_day)*30,2),
      baseline_electricity_kwh:round(mean(group,row=>row.baseline_electricity_kwh_day)*30,2),optimized_electricity_kwh:round(mean(group,row=>row.electricity_kwh_day)*30,2),
      biogas_increase_pct:round((optimizedBiogas-baselineBiogas)/Math.max(.001,baselineBiogas)*100,3),
      h2s_removed_ppm:round(mean(group,row=>row.h2s_removed_ppm),3),estimated_co2e_avoided_kg:round(mean(group,row=>row.estimated_co2e_avoided_kg_day)*30,2),
    };
  });
}

function batchProjection(rows:BatchRow[]):BatchProjection {
  const selected=rankedCandidatePerSource(rows);
  const dailyRows=modelledDailyProjection(selected);
  const monthlyRows=modelledMonthlyProjection(selected);
  const average=(get:(row:ModelledDailyProjectionRow)=>number)=>dailyRows.reduce((sum,row)=>sum+get(row),0)/Math.max(1,dailyRows.length);
  const monthlyAverage=(get:(row:ModelledMonthlyProjectionRow)=>number)=>monthlyRows.reduce((sum,row)=>sum+get(row),0)/Math.max(1,monthlyRows.length);
  const monthlyTotal=(get:(row:ModelledMonthlyProjectionRow)=>number)=>monthlyRows.reduce((sum,row)=>sum+get(row),0);
  const baselineBiogas=average(row=>row.baseline_biogas_m3_day);
  const optimizedBiogas=average(row=>row.optimized_biogas_m3_day);
  const baselineMethane=average(row=>row.baseline_methane_m3_day);
  const optimizedMethane=average(row=>row.optimized_methane_m3_day);
  const baselineElectricity=average(row=>row.baseline_electricity_kwh_day);
  const optimizedElectricity=average(row=>row.optimized_electricity_kwh_day);
  const h2sRemoved=average(row=>row.h2s_removed_ppm);
  const co2e=average(row=>row.estimated_co2e_avoided_kg_day);
  const modelCoverage=average(row=>row.model_coverage_pct);
  const processStability=average(row=>row.process_stability_estimate_pct);
  const monthlyBaselineBiogas=monthlyAverage(row=>row.baseline_biogas_m3);
  const monthlyOptimizedBiogas=monthlyAverage(row=>row.optimized_biogas_m3);
  const monthlyBaselineMethane=monthlyAverage(row=>row.baseline_methane_m3);
  const monthlyOptimizedMethane=monthlyAverage(row=>row.optimized_methane_m3);
  const monthlyBaselineElectricity=monthlyAverage(row=>row.baseline_electricity_kwh);
  const monthlyOptimizedElectricity=monthlyAverage(row=>row.optimized_electricity_kwh);
  const monthlyCo2e=monthlyAverage(row=>row.estimated_co2e_avoided_kg);
  return {
    basis:"One model-ranked candidate is selected per simulated online-reading condition. The source workbook has no timestamps, so the application creates 30 modelled operating-day groups and 12 labelled 30-day presentation periods. These are deterministic model projections, not measured calendar totals.",
    sourceRows:shortHrtBatchInputs.length,selectedCandidates:selected.length,
    dailyMean:{baselineBiogasM3Day:round(baselineBiogas,3),optimizedBiogasM3Day:round(optimizedBiogas,3),baselineMethaneM3Day:round(baselineMethane,3),optimizedMethaneM3Day:round(optimizedMethane,3),baselineElectricityKwhDay:round(baselineElectricity,3),optimizedElectricityKwhDay:round(optimizedElectricity,3),h2sRemovedPpm:round(h2sRemoved,3),estimatedCo2eAvoidedKgDay:round(co2e,3),modelCoveragePct:round(modelCoverage,3),processStabilityEstimatePct:round(processStability,3)},
    dailyRows,monthlyRows,
    monthlyEquivalent:{baselineBiogasM3:round(monthlyBaselineBiogas,2),optimizedBiogasM3:round(monthlyOptimizedBiogas,2),baselineMethaneM3:round(monthlyBaselineMethane,2),optimizedMethaneM3:round(monthlyOptimizedMethane,2),baselineElectricityKwh:round(monthlyBaselineElectricity,2),optimizedElectricityKwh:round(monthlyOptimizedElectricity,2),estimatedCo2eAvoidedKg:round(monthlyCo2e,2)},
    annualized:{baselineBiogasM3:round(monthlyTotal(row=>row.baseline_biogas_m3),2),optimizedBiogasM3:round(monthlyTotal(row=>row.optimized_biogas_m3),2),baselineMethaneM3:round(monthlyTotal(row=>row.baseline_methane_m3),2),optimizedMethaneM3:round(monthlyTotal(row=>row.optimized_methane_m3),2),baselineElectricityKwh:round(monthlyTotal(row=>row.baseline_electricity_kwh),2),optimizedElectricityKwh:round(monthlyTotal(row=>row.optimized_electricity_kwh),2),estimatedCo2eAvoidedKg:round(monthlyTotal(row=>row.estimated_co2e_avoided_kg),2)},
  };
}

function finishShortHrtBatchReport(baseInput:ModelInput,definition:BatchDefinition):BatchReport {
  const info=cohortInfo("short_hrt_batch");
  const rows:BatchRow[]=[];
  shortHrtBatchInputs.forEach((source)=>{
    const sourceInput:ShortHrtInput={feedRate:source.feedRate,temperature:source.temperature,ph:source.ph,olr:source.olr,hrtHours:source.hrtHours};
    batchProfiles.forEach((profile,index)=>{
      const candidate=batchCandidate(sourceInput,profile);
      const row=shortHrtMetrics(candidate,baseInput,info.label,false,`${info.sourceNote} Source online reading ${source.sourceId}; deterministic AI candidate generated from supplied model values.`);
      row.source_run_id=source.sourceId;
      row.candidate_profile=profile;
      row.scenario_id=`${source.sourceId}-${String(index+1).padStart(2,"0")}`;
      row.ai_recommendation=batchRecommendation(sourceInput,row,profile);
      rows.push(row);
    });
  });
  rows.sort((a,b)=>shortScore(b)-shortScore(a)||a.source_run_id!.localeCompare(b.source_run_id!)||a.scenario_id.localeCompare(b.scenario_id));
  rows.forEach((row,index)=>{row.rank=index+1;});
  const bestScenario=rows[0];
  const projection=batchProjection(rows);
  const representative=rows.find((row)=>row.source_run_id==="RUN-H001")||bestScenario;
  const summary:BatchSummary={
    totalRows:rows.length,inputCount:5,sourceInput:baseInput,
    farmerInput:{baselineBiogasM3Day:representative.baseline_biogas_m3_day,optimizedBiogasM3Day:representative.optimized_biogas_m3_day,methaneM3Day:representative.methane_m3_day,electricityKwhDay:representative.electricity_kwh_day},
    bestScenario,bestVsFarmer:{biogasM3Day:round(bestScenario.optimized_biogas_m3_day-representative.optimized_biogas_m3_day,3),methaneM3Day:round(bestScenario.methane_m3_day-representative.methane_m3_day,3),electricityKwhDay:round(bestScenario.electricity_kwh_day-representative.electricity_kwh_day,3),hrtHours:round(bestScenario.hrt_hours-representative.hrt_hours,3)},
    withinNormalModelCoverage:rows.filter((row)=>row.hrt_hours>=2&&row.hrt_hours<=24).length,sourceNote:info.sourceNote,safetyNote:info.safetyNote,projection,
  };
  return {definition,rows,summary};
}

/** Creates reproducible candidate settings; no random generator is used. */
export function generateBatchReport(input:Partial<BatchDefinition>):BatchReport {
  const cohort:BatchCohort=input.cohort==="hours_research"||input.cohort==="under_6_hours"||input.cohort==="short_hrt_batch"?input.cohort:"farm_optimization";
  const rowCount=cohort==="short_hrt_batch"?shortHrtBatchInputs.length*batchProfiles.length:input.rowCount===10000?10000:1000;
  const baseInput=sanitizeModelInput(input.baseInput??{});const shortHrtInput=sanitizeShortHrtInput(input.shortHrtInput??defaultShortHrtInput);
  const definition:BatchDefinition={cohort,rowCount,baseInput,shortHrtInput,schemaVersion:"4.0"};
  if(cohort==="short_hrt_batch") return finishShortHrtBatchReport(baseInput,definition);
  return cohort==="hours_research"?finishShortHrtReport(rowCount,baseInput,shortHrtInput,definition):finishFarmReport(rowCount,cohort,baseInput,definition);
}

export function batchCsv(rows:BatchRow[]) {
  // Human-readable report headings; is_farmer_input remains an internal sorting/reference marker.
  const columns:{key:keyof BatchRow;heading:string}[]=[
    {key:"source_run_id",heading:"Run ID"},{key:"scenario_id",heading:"Scenario ID"},{key:"candidate_profile",heading:"Test Stage / Candidate Profile"},{key:"source_cohort",heading:"Online Reading Source"},{key:"feedstock",heading:"Feedstock"},
    {key:"feed_rate_kg_vs_day",heading:"Feed Rate (kg VS/d)"},{key:"temperature_c",heading:"Temperature (°C)"},{key:"ph",heading:"pH"},{key:"olr_kg_vs_m3_day",heading:"OLR (kg VS/m³·d)"},{key:"hrt_hours",heading:"HRT (hours)"},{key:"hrt_days",heading:"HRT (days, derived)"},
    {key:"baseline_biogas_m3_day",heading:"Baseline Biogas (m³/d)"},{key:"optimized_biogas_m3_day",heading:"Optimized Biogas (m³/d)"},{key:"biogas_increase_pct",heading:"Biogas Increase (%)"},{key:"ch4_content_pct",heading:"CH₄ Content (%)"},{key:"methane_m3_day",heading:"Methane Output (m³ CH₄/d)"},{key:"electricity_kwh_day",heading:"Electricity Potential (kWh/d)"},
    {key:"h2s_before_ppm",heading:"H₂S Before Filter (ppm)"},{key:"h2s_ppm",heading:"H₂S After Filter (ppm)"},{key:"h2s_removed_ppm",heading:"H₂S Removed (ppm, derived)"},{key:"ai_model_coverage_pct",heading:"Model Coverage (%) — not predictive confidence"},{key:"process_stability_estimate_pct",heading:"Process Stability Estimate (%) — derived, not sensor measurement"},
    {key:"baseline_methane_m3_day",heading:"Baseline Methane (m³ CH₄/d)"},{key:"baseline_electricity_kwh_day",heading:"Baseline Electricity (kWh/d)"},{key:"co2_fraction_pct",heading:"CO₂ Fraction (%)"},{key:"estimated_co2e_avoided_kg_day",heading:"Estimated CO₂e Avoided (kg/d)"},{key:"cod_in_mg_l",heading:"COD Plant Value (mg/L, reference value)"},{key:"vfa_mg_l",heading:"VFA (mg/L, reference value)"},{key:"mixer_rpm",heading:"Mixer Speed (RPM, reference value)"},{key:"ai_recommendation",heading:"AI Recommendation"},{key:"evidence_note",heading:"Evidence Note"},
  ];
  const cell=(value:unknown)=>`"${String(value??"").replace(/"/g,'""')}"`;
  // Excel uses the byte-order mark to open this UTF-8 CSV correctly, including m³, °C and arrows.
  return `\uFEFF${[columns.map(column=>cell(column.heading)).join(","),...rows.map((row)=>columns.map(column=>cell(row[column.key])).join(","))].join("\n")}`;
}

export function batchProjectionCsv(projection:BatchProjection) {
  const heading=["modelled_month","month_label","source_conditions_aggregated","baseline_biogas_m3","ai_optimised_biogas_m3","biogas_increase_pct","baseline_methane_m3","ai_optimised_methane_m3","baseline_electricity_kwh","ai_optimised_electricity_kwh","h2s_removed_ppm","estimated_co2e_avoided_kg","projection_note"];
  const note="Labelled 30-day modelled period from timestamp-free simulated online-reading conditions; not a measured calendar month.";
  const cell=(value:unknown)=>`"${String(value??"").replace(/"/g,'""')}"`;
  return `\uFEFF${[heading,...projection.monthlyRows.map(row=>[row.modelled_month,row.month_label,row.source_conditions_aggregated,row.baseline_biogas_m3,row.optimized_biogas_m3,row.biogas_increase_pct,row.baseline_methane_m3,row.optimized_methane_m3,row.baseline_electricity_kwh,row.optimized_electricity_kwh,row.h2s_removed_ppm,row.estimated_co2e_avoided_kg,note])].map(row=>row.map(cell).join(",")).join("\n")}`;
}

export function batchDailyProjectionCsv(projection:BatchProjection) {
  const heading=["modelled_day","source_conditions_aggregated","baseline_biogas_m3_day","ai_optimised_biogas_m3_day","biogas_increase_pct","baseline_methane_m3_day","ai_optimised_methane_m3_day","ch4_content_pct","baseline_electricity_kwh_day","ai_optimised_electricity_kwh_day","h2s_removed_ppm","model_coverage_pct_not_predictive_confidence","process_stability_estimate_pct_derived","estimated_co2e_avoided_kg_day","projection_note"];
  const note="Modelled operating-day group from timestamp-free synthetic source conditions; not a measured calendar reading.";
  const cell=(value:unknown)=>`"${String(value??"").replace(/"/g,'""')}"`;
  return `\uFEFF${[heading,...projection.dailyRows.map(row=>[row.modelled_day,row.source_conditions_aggregated,row.baseline_biogas_m3_day,row.optimized_biogas_m3_day,round((row.optimized_biogas_m3_day-row.baseline_biogas_m3_day)/Math.max(.001,row.baseline_biogas_m3_day)*100,3),row.baseline_methane_m3_day,row.optimized_methane_m3_day,round(row.optimized_methane_m3_day/Math.max(.001,row.optimized_biogas_m3_day)*100,3),row.baseline_electricity_kwh_day,row.optimized_electricity_kwh_day,row.h2s_removed_ppm,row.model_coverage_pct,row.process_stability_estimate_pct,row.estimated_co2e_avoided_kg_day,note])].map(row=>row.map(cell).join(",")).join("\n")}`;
}
