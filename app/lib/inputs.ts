export type ModelInput = {
  feedstock: string; feedRate: number; temperature: number; ph: number; olr: number;
  hrt: number; codIn: number; vfa: number; mixing: number;
};

export const feedstocks = ["Dairy WW", "Cow Manure", "Food Waste", "Paper Mill", "Brewery", "Mixed Waste"];
export const inputFields = [
  {key:"feedRate",label:"Feed rate",unit:"kg VS/day",min:50,max:2000,step:1},
  {key:"temperature",label:"Temperature",unit:"C",min:10,max:80,step:0.1},
  {key:"ph",label:"pH",unit:"pH",min:3,max:11,step:0.01},
  {key:"olr",label:"Organic loading rate",unit:"kg COD/m3/day",min:0.1,max:250,step:0.1},
  {key:"hrt",label:"Retention time",unit:"days",min:0.02,max:90,step:0.1},
  {key:"codIn",label:"COD input",unit:"mg/L",min:100,max:50000,step:1},
  {key:"vfa",label:"VFA",unit:"mg/L",min:0,max:10000,step:1},
  {key:"mixing",label:"Mixing",unit:"RPM",min:0,max:200,step:1},
] as const;

export const profiles: {id:string;name:string;inputs:ModelInput}[] = [
  {id:"DAIRY-WW-001",name:"Dairy wastewater reference",inputs:{feedstock:"Dairy WW",feedRate:846,temperature:36.5,ph:7.2,olr:3.2,hrt:22,codIn:7600,vfa:1100,mixing:50}},
  {id:"FOOD-WASTE-002",name:"Food waste comparison",inputs:{feedstock:"Food Waste",feedRate:861,temperature:36.8,ph:7.31,olr:3.74,hrt:19.5,codIn:9450,vfa:1275,mixing:57}},
  {id:"COW-MANURE-003",name:"Cow manure comparison",inputs:{feedstock:"Cow Manure",feedRate:835,temperature:37,ph:7.2,olr:2.8,hrt:25,codIn:6500,vfa:950,mixing:44}},
];

export class InputError extends Error {
  constructor(public issues: {field:string;message:string}[]) {super("Invalid operating conditions");}
}

export function validateInputs(value: unknown): ModelInput {
  const data = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const issues: {field:string;message:string}[] = [];
  if (typeof data.feedstock !== "string" || !feedstocks.includes(data.feedstock)) issues.push({field:"feedstock",message:"Select a supported feedstock"});
  for (const field of inputFields) {
    const number = data[field.key];
    if (typeof number !== "number" || !Number.isFinite(number) || number < field.min || number > field.max) {
      issues.push({field:field.key,message:`A finite number from ${field.min} to ${field.max} ${field.unit} is required`});
    }
  }
  const allowed = new Set(["feedstock",...inputFields.map(f=>f.key)]);
  for (const key of Object.keys(data)) if (!allowed.has(key)) issues.push({field:key,message:"Unknown operating parameter"});
  if (issues.length) throw new InputError(issues);
  return Object.fromEntries([...allowed].map(key=>[key,data[key]])) as ModelInput;
}

export type RunRequest = {profileId?:string;operatingConditions?:ModelInput;seed?:string;previousRun?:{prediction?:{biogas?:number}}};
export function resolveRequest(value:unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError([{field:"request",message:"A JSON object is required"}]);
  const body = value as Record<string, unknown>;
  const allowed = ["profileId","operatingConditions","seed","previousRun"];
  const extra = Object.keys(body).filter(k=>!allowed.includes(k));
  if (extra.length) throw new InputError(extra.map(field=>({field,message:"Place all nine input values inside operatingConditions"})));
  const profile = profiles.find(p=>p.id===(body.profileId??profiles[0].id));
  if (!profile && body.profileId!=="CUSTOM") throw new InputError([{field:"profileId",message:"Unknown reference profile"}]);
  if (body.seed!==undefined && (typeof body.seed!=="string" || !/^[a-zA-Z0-9-]{8,64}$/.test(body.seed))) throw new InputError([{field:"seed",message:"Use 8-64 letters, numbers or hyphens"}]);
  if (body.previousRun !== undefined && body.previousRun !== null) {
    const prev = body.previousRun as RunRequest["previousRun"];
    if (!prev || typeof prev.prediction?.biogas !== "number" || !Number.isFinite(prev.prediction.biogas)) throw new InputError([{field:"previousRun",message:"A numeric previous biogas result is required"}]);
  }
  const inputs = validateInputs(body.operatingConditions !== undefined ? body.operatingConditions : profile?.inputs);
  const matchesProfile = profile && Object.keys(inputs).every(k=>inputs[k as keyof ModelInput]===profile.inputs[k as keyof ModelInput]);
  return {inputs,request:body as RunRequest,profileId:matchesProfile?profile.id:"CUSTOM",inputSource:body.operatingConditions!==undefined?"submitted_operating_conditions":"stored_reference_profile"};
}
