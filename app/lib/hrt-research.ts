import modelFile from "../../ai-workflow/research/hours-model.json";
import dataFile from "../../ai-workflow/research/hours-data.json";
import {InputError} from "./inputs";
import {fingerprint} from "./evidence";
import {hrtChange} from "./hrt";
import researchBuild from "./research-build.json";

export type ResearchRequest={baseline:{value:number;unit:"days"|"hours"};objective:"shortest_hrt"|"maximum_energy"|"target_hrt";retainedMethanePct:number;targetHours:number};
export type ResearchPoint={hrtHours:number;biogasM3Day:number;methanePct:number;methaneM3Day:number;electricityKwhDay:number;feedRate:number;temperature:number;ph:number;olr:number;h2sBeforePpm:number;h2sAfterPpm:number;stabilityPct:number};
export type ResearchSource={file:string;sheet:string;sha256:string};
type ResearchModel={version:string;input:{min:number;max:number;offset:number;scale:number};basis:{kind:"polynomial"|"linear_spline";degree?:number;knots?:number[]};outputKeys:string[];coefficients:Record<string,number[]>;source:ResearchSource;fitRows:number;evaluation:{displaySummary?:{method:string;trainRows:number;testRows:number;metricScope:string;targets:{key:string;unit:string;mae:number;rmse:number;r2:number|null;baselineMae:number}[];improvementPct:number|null};[key:string]:unknown};limitations:string[]};
export type ResearchRow=Omit<ResearchPoint,"methaneM3Day"|"electricityKwhDay">&{id:string;sourceRow:number;baselineBiogasM3Day:number};
export const researchModel=modelFile as unknown as ResearchModel;
export const researchRows=(dataFile as unknown as {rows:ResearchRow[]}).rows;
export const researchArtifactHash=fingerprint(modelFile);
export const researchDataHash=fingerprint(dataFile);
export const researchManifestHash=fingerprint({artifactHash:researchArtifactHash,dataHash:researchDataHash,sourceHash:researchBuild.sourceHash});
export const researchDefaults:ResearchRequest={baseline:{value:22,unit:"days"},objective:"shortest_hrt",retainedMethanePct:90,targetHours:12};
export const researchDisclosure="Synthetic workbook research scenario. Hours-scale operation and plant improvement have not been demonstrated. No equipment is controlled.";

export function resolveResearchRequest(value:unknown):ResearchRequest{
  if(!value||typeof value!=="object"||Array.isArray(value))throw new InputError([{field:"request",message:"A complete research request is required"}]);
  const body=value as Record<string,unknown>,issues:{field:string;message:string}[]=[];
  for(const key of Object.keys(body))if(!["baseline","objective","retainedMethanePct","targetHours"].includes(key))issues.push({field:key,message:"Unknown research parameter"});
  const baseline=body.baseline&&typeof body.baseline==="object"&&!Array.isArray(body.baseline)?body.baseline as Record<string,unknown>:{};
  for(const key of Object.keys(baseline))if(!["value","unit"].includes(key))issues.push({field:`baseline.${key}`,message:"Unknown baseline parameter"});
  if(!["days","hours"].includes(String(baseline.unit)))issues.push({field:"baseline.unit",message:"Choose days or hours"});
  const beforeHours=typeof baseline.value==="number"?baseline.value*(baseline.unit==="days"?24:1):NaN;
  if(!Number.isFinite(beforeHours)||beforeHours<=0||beforeHours>2160)issues.push({field:"baseline.value",message:"Enter a positive comparison time no greater than 90 days / 2,160 hours"});
  if(!["shortest_hrt","maximum_energy","target_hrt"].includes(String(body.objective)))issues.push({field:"objective",message:"Select a supported research objective"});
  if(typeof body.retainedMethanePct!=="number"||!Number.isFinite(body.retainedMethanePct)||body.retainedMethanePct<1||body.retainedMethanePct>100)issues.push({field:"retainedMethanePct",message:"Enter a methane-retention goal from 1 to 100 percent"});
  if(typeof body.targetHours!=="number"||!Number.isFinite(body.targetHours)||body.targetHours<researchModel.input.min||body.targetHours>researchModel.input.max)issues.push({field:"targetHours",message:`Target HRT must be within the source trajectory: ${researchModel.input.min}–${researchModel.input.max} hours`});
  if(issues.length)throw new InputError(issues);
  return {baseline:{value:baseline.value as number,unit:baseline.unit as "days"|"hours"},objective:body.objective as ResearchRequest["objective"],retainedMethanePct:body.retainedMethanePct as number,targetHours:body.targetHours as number};
}

export function predictResearch(hrtHours:number):ResearchPoint{
  const {min,max,offset,scale}=researchModel.input;
  if(!Number.isFinite(hrtHours)||hrtHours<min||hrtHours>max)throw new Error("HRT outside research model coverage");
  const x=(hrtHours-offset)/scale;
  const features=researchModel.basis.kind==="polynomial"
    ?Array.from({length:(researchModel.basis.degree??1)+1},(_,i)=>x**i)
    :[1,x,...(researchModel.basis.knots??[]).map(k=>Math.max(0,x-k))];
  const values:Record<string,number>={};
  for(const key of researchModel.outputKeys){
    const weights=researchModel.coefficients[key];
    if(!weights||weights.length!==features.length||weights.some(v=>!Number.isFinite(v)))throw new Error("Invalid research model coefficients");
    values[key]=features.reduce((sum,value,i)=>sum+value*weights[i],0);
  }
  if(!Object.values(values).every(Number.isFinite)||values.biogasM3Day<0||values.methanePct<0||values.methanePct>100)throw new Error("Research model returned unsupported outputs");
  const methaneM3Day=values.biogasM3Day*values.methanePct/100;
  return {...values,hrtHours,methaneM3Day,electricityKwhDay:methaneM3Day*9.97*.36} as ResearchPoint;
}

export function calculateResearch(body:unknown){
  const request=resolveResearchRequest(body),{min,max}=researchModel.input;
  const candidates=Array.from({length:2000},(_,i)=>predictResearch(min+(max-min)*i/1999));
  const peak=candidates.reduce((best,p)=>p.methaneM3Day>best.methaneM3Day?p:best);
  const minimumMethane=peak.methaneM3Day*request.retainedMethanePct/100;
  const feasible=candidates.filter(p=>p.methaneM3Day+1e-10>=minimumMethane);
  const selected=request.objective==="target_hrt"?predictResearch(request.targetHours):request.objective==="maximum_energy"?peak:feasible[0];
  if(!selected)throw new Error("No feasible research point found");
  const beforeHours=request.baseline.value*(request.baseline.unit==="days"?24:1);
  const retentionTime={beforeHours,optimizedHours:selected.hrtHours,...hrtChange(beforeHours,selected.hrtHours),changePct:(selected.hrtHours/beforeHours-1)*100};
  const goal={retainedMethanePct:request.retainedMethanePct,peakMethaneM3Day:peak.methaneM3Day,minimumMethaneM3Day:minimumMethane,selectedRetainedPct:selected.methaneM3Day/peak.methaneM3Day*100,satisfied:selected.methaneM3Day+1e-10>=minimumMethane,feasibleCount:feasible.length};
  const ranked=[...candidates].sort(request.objective==="maximum_energy"?(a,b)=>b.electricityKwhDay-a.electricityKwhDay:(a,b)=>Math.abs(a.hrtHours-selected.hrtHours)-Math.abs(b.hrtHours-selected.hrtHours));
  const curve=Array.from({length:45},(_,i)=>predictResearch(min+(max-min)*i/44));
  return {request,retentionTime,selected,goal,peak,curve,candidatePreview:ranked.slice(0,8),candidates,candidateCount:candidates.length,
    modelVersion:researchModel.version,artifactHash:researchArtifactHash,dataHash:researchDataHash,manifestHash:researchManifestHash,engineHash:researchBuild.sourceHash,source:researchModel.source,
    mode:"HOURS_RESEARCH" as const,validationStatus:"SYNTHETIC AGREEMENT ONLY" as const,disclosure:researchDisclosure,
    baselineMeaning:"User-entered comparison time; no measured before/after plant pair is implied.",
    trajectoryMeaning:"HRT selects a jointly varying synthetic process trajectory. These data do not identify independent effects of temperature, pH, feed rate or loading.",
    uncertainty:{status:"NOT_CALIBRATED",predictionInterval:null},
    candidateMeaning:"2,000 model evaluations, not 2,000 independent training records.",
    energyAssumptions:{methaneKwhPerM3:9.97,electricalEfficiency:.36,source:"Original workbook Assumptions & Audit; theoretical electricity potential"}};
}
export type ResearchCalculation=ReturnType<typeof calculateResearch>;
export function researchOutputHash(result:ResearchCalculation){return fingerprint({request:result.request,selected:result.selected,retentionTime:result.retentionTime,goal:result.goal,curve:result.curve,candidates:result.candidates,artifactHash:result.artifactHash,dataHash:result.dataHash,manifestHash:result.manifestHash});}

export function researchMetadata(){return {name:"Hours-scale trajectory model",version:researchModel.version,artifactHash:researchArtifactHash,dataHash:researchDataHash,manifestHash:researchManifestHash,
  input:researchModel.input,fitRows:researchModel.fitRows,source:researchModel.source,defaults:researchDefaults,
  evaluation:researchModel.evaluation,limitations:researchModel.limitations,disclosure:researchDisclosure,
  outputs:[{key:"biogasM3Day",label:"Biogas",unit:"m³/day"},{key:"methaneM3Day",label:"Methane output",unit:"m³ CH₄/day"},{key:"electricityKwhDay",label:"Electricity potential",unit:"kWh/day"},{key:"hrtHours",label:"Retention time",unit:"hours"}],
  assumptions:{methaneKwhPerM3:9.97,electricalEfficiency:.36,plantValidated:false,independentProcessEffects:false,uncertaintyCalibrated:false}};}
