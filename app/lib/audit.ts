import { get, list, put } from "@vercel/blob";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fingerprint, signEvidence, verifySignature } from "./evidence";
import {auditPage,type AuditEntry} from "./audit-pagination";

export type ThresholdSettings = {methaneMinimum:number;h2sWarning:number;oxygenMaximum:number;pressureMinimum:number;pressureMaximum:number;facilityName:string;facilityLocation:string};
export const defaultThresholds:ThresholdSettings={methaneMinimum:55,h2sWarning:500,oxygenMaximum:2,pressureMinimum:12,pressureMaximum:30,facilityName:"Aquaivolt Demonstration Plant",facilityLocation:"Lebanon"};
export type EvidenceRecord = {
  id:string;createdAt:string;username:string;role:string;kind:"optimization"|"verification"|"ml_prediction"|"ml_verification"|"plant_observation"|"plant_evaluation";
  request:unknown;inputs:unknown;response:unknown;modelVersion:string;manifestHash:string;
  requestHash:string;inputsHash:string;responseHash:string;outputHash:string;
};
export type SignedRecord = EvidenceRecord & {recordHash:string;signature:string};
export class AuditUnavailable extends Error {constructor(){super("Persistent audit storage is unavailable");}}

// Local files are explicit development/test storage. Production uses private Blob only.
function localDirectory(){return !process.env.VERCEL && process.env.AQUA_AUDIT_DIR ? path.resolve(process.env.AQUA_AUDIT_DIR) : undefined;}
export function storageProvider(){return process.env.BLOB_READ_WRITE_TOKEN?"vercel-private-blob":localDirectory()?"local-development-files":"unconfigured";}
const idPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const validRunId=(id:string)=>idPattern.test(id);
const keyFor=(id:string)=>`audit-v2/records/${id}.json`;

async function readObject(key:string):Promise<unknown|null> {
  if(process.env.BLOB_READ_WRITE_TOKEN){
    const result=await get(key,{access:"private",useCache:false,abortSignal:AbortSignal.timeout(12000)});
    if(!result)return null;
    if(result.statusCode!==200)throw new AuditUnavailable();
    return new Response(result.stream).json();
  }
  const directory=localDirectory();
  if(!directory)throw new AuditUnavailable();
  try{return JSON.parse(await readFile(path.join(directory,key),"utf8"));}
  catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return null;throw error;}
}
async function writeObject(key:string,value:unknown,overwrite=false) {
  const body=JSON.stringify(value);
  if(process.env.BLOB_READ_WRITE_TOKEN){
    await put(key,body,{access:"private",addRandomSuffix:false,allowOverwrite:overwrite,contentType:"application/json",abortSignal:AbortSignal.timeout(12000)});
    return;
  }
  const directory=localDirectory();if(!directory)throw new AuditUnavailable();
  const file=path.join(directory,key);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,body,{flag:overwrite?"w":"wx"});
}
export async function storeEvidence(record:EvidenceRecord) {
  const signed:SignedRecord={...record,recordHash:fingerprint(record),signature:signEvidence(record)};
  await writeObject(keyFor(record.id),signed);
  const readback=await getEvidence(record.id);
  if(!readback || readback.recordHash!==signed.recordHash || !verifyEvidence(readback))throw new AuditUnavailable();
  return signed;
}
export function verifyEvidence(record:SignedRecord) {
  if(!record||typeof record.signature!=="string"||typeof record.recordHash!=="string")return false;
  const {signature,recordHash,...content}=record;
  return fingerprint(content)===recordHash && verifySignature(content,signature)
    && fingerprint(content.request)===content.requestHash && fingerprint(content.inputs)===content.inputsHash
    && fingerprint(content.response)===content.responseHash;
}
export async function getEvidence(id:string):Promise<SignedRecord|null> {
  if(!validRunId(id))return null;
  return await readObject(keyFor(id)) as SignedRecord|null;
}
export async function listEvidence(limit=20,cursor?:string) {
  const count=Math.max(1,Math.min(50,limit));
  // Validate cursors before accessing storage. Never paginate UUID names and then sort just that page.
  auditPage([],count,cursor);
  const entries:AuditEntry[]=[];
  if(process.env.BLOB_READ_WRITE_TOKEN){
    let storageCursor:string|undefined;
    do{
      const page=await list({prefix:"audit-v2/records/",limit:1000,cursor:storageCursor,abortSignal:AbortSignal.timeout(12000)});
      for(const blob of page.blobs){
        const id=blob.pathname.slice("audit-v2/records/".length).replace(/\.json$/,"");
        if(validRunId(id)&&blob.pathname===keyFor(id))entries.push({id,key:blob.pathname,storedAt:new Date(blob.uploadedAt).toISOString()});
      }
      if(page.hasMore&&(!page.cursor||page.cursor===storageCursor))throw new AuditUnavailable();
      storageCursor=page.hasMore?page.cursor:undefined;
    }while(storageCursor);
  }else{
    const directory=localDirectory();if(!directory)throw new AuditUnavailable();
    const root=path.join(directory,"audit-v2/records");await mkdir(root,{recursive:true});
    const names=(await readdir(root)).filter(n=>n.endsWith(".json")&&validRunId(n.slice(0,-5)));
    for(const name of names){
      const info=await stat(path.join(root,name));
      entries.push({id:name.slice(0,-5),key:`audit-v2/records/${name}`,storedAt:info.birthtime.toISOString()});
    }
  }
  const page=auditPage(entries,count,cursor);
  const items=await Promise.all(page.items.map(async entry=>{
    try{
      const record=await readObject(entry.key) as SignedRecord|null;
      if(!record||record.id!==entry.id)throw new Error();
      return {...entry,record,readError:false};
    }catch{return {...entry,record:null,readError:true};}
  }));
  return {...page,items};
}
export async function auditStoreReady(){
  try{
    if(process.env.BLOB_READ_WRITE_TOKEN){await list({prefix:"audit-v2/",limit:1,abortSignal:AbortSignal.timeout(6000)});return true;}
    const directory=localDirectory();if(!directory)return false;await mkdir(directory,{recursive:true});return true;
  }catch{return false;}
}
export async function getThresholds():Promise<ThresholdSettings>{
  try{return (await readObject("audit-v2/settings.json") as ThresholdSettings)||{...defaultThresholds};}catch{return {...defaultThresholds};}
}
export async function saveThresholds(settings:ThresholdSettings,_username:string){await writeObject("audit-v2/settings.json",settings,true);}
