export type AuditEntry = {key:string;id:string;storedAt:string};
type Position = {v:1;snapshot:string;after?:{storedAt:string;id:string}};
export class AuditCursorError extends Error {}
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const timestamp=(s:unknown):s is string=>typeof s==="string"&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s;

export function auditPage(entries:AuditEntry[],limit:number,cursor?:string){
  let position:Position={v:1,snapshot:new Date().toISOString()};
  if(cursor){
    try{
      if(cursor.length>1024||!/^[\w-]+$/.test(cursor))throw new Error();
      position=JSON.parse(Buffer.from(cursor,"base64url").toString("utf8"));
      if(position?.v!==1||!timestamp(position.snapshot)||!position.after||!timestamp(position.after.storedAt)||!uuid.test(position.after.id))throw new Error();
    }catch{throw new AuditCursorError("Invalid record-list cursor. Refresh the list.");}
  }
  const sorted=[...new Map(entries.map(e=>[e.key,e])).values()]
    .filter(e=>e.storedAt<=position.snapshot)
    .sort((a,b)=>b.storedAt.localeCompare(a.storedAt)||b.id.localeCompare(a.id));
  const after=position.after;
  const remaining=after?sorted.filter(e=>e.storedAt<after.storedAt||(e.storedAt===after.storedAt&&e.id<after.id)):sorted;
  const items=remaining.slice(0,limit),last=items.at(-1),hasMore=remaining.length>items.length;
  return {items,total:sorted.length,snapshot:position.snapshot,hasMore,cursor:hasMore&&last?Buffer.from(JSON.stringify({v:1,snapshot:position.snapshot,after:{storedAt:last.storedAt,id:last.id}})).toString("base64url"):undefined};
}
