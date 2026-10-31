import {inputFields,type ModelInput} from "./inputs";
import {referenceScenarios} from "./reference-data";

export const domainPolicy={
  version:"reference-envelope-1",
  source:"10 supplied optimization reference scenarios (app/lib/reference-data.ts)",
  status:"REFERENCE ONLY - NO PLANT-VALIDATED OPERATING RANGES",
  trainingDistribution:"The joint training distribution, particularly Ridge's per-feedstock training ranges, has not been independently verified.",
  uncertainty:{status:"NOT_CALIBRATED",predictionInterval:null,detail:"Calibrated prediction intervals are unavailable. Display precision, scenario coverage and model agreement are not confidence estimates."},
  validatedOperatingRanges:null,
} as const;

export function assessDomain(inputs:ModelInput){
  const rows=referenceScenarios.filter(row=>row.feedstock===inputs.feedstock);
  const fields=inputFields.map(field=>{
    const values=rows.map(row=>(row as unknown as Record<string,unknown>)[field.key]).filter((v):v is number=>typeof v==="number");
    const min=values.length?Math.min(...values):null,max=values.length?Math.max(...values):null;
    const value=inputs[field.key];
    const status=min===null||max===null?"UNKNOWN":value<min||value>max?"OUTSIDE":"WITHIN";
    return {key:field.key,label:field.label,unit:field.unit,value,min,max,status};
  });
  const outside=fields.filter(f=>f.status==="OUTSIDE");
  return {...domainPolicy,feedstock:inputs.feedstock,referenceRows:rows.length,fields,
    status:outside.length?"OUTSIDE_REFERENCE_ENVELOPE":"WITHIN_REFERENCE_ENVELOPE",
    warnings:[...outside.map(f=>`${f.label} ${f.value} ${f.unit} is outside the ${inputs.feedstock} supplied reference envelope (${f.min} to ${f.max} ${f.unit}).`),
      `${rows.length} reference rows for this feedstock; these bounds are not validated safe limits or proof of training-distribution coverage.`,
      "Prediction uncertainty is not calibrated. Results are exploratory estimates, not equipment-control instructions."],
  };
}
export type DomainAssessment=ReturnType<typeof assessDomain>;
