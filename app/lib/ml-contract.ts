import {InputError,validateInputs,type ModelInput} from "./inputs";

export const mlModelIds=["gradient_boosting","ridge"] as const;
export type MlModelId=(typeof mlModelIds)[number];
export type MlRequest={operatingConditions:ModelInput};
export function resolveMlRequest(value:unknown):MlRequest{
  if(!value||typeof value!=="object"||Array.isArray(value))throw new InputError([{field:"request",message:"A JSON object with operatingConditions is required"}]);
  const body=value as Record<string,unknown>;
  const extra=Object.keys(body).filter(k=>k!=="operatingConditions");
  if(extra.length)throw new InputError(extra.map(field=>({field,message:"Unsupported ML request field; both trained models execute deterministically"})));
  return {operatingConditions:validateInputs(body.operatingConditions)};
}
