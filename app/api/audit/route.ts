import {NextResponse} from "next/server";
import {getSession} from "../../lib/auth";
import {getEvidence,listEvidence,validRunId,verifyEvidence} from "../../lib/audit";
import {csvCell} from "../../lib/evidence";

export const runtime="nodejs";
export const maxDuration=60;
const headers={"Cache-Control":"no-store"};
export async function GET(request:Request){
  const session=await getSession(request);
  if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});
  if(session.role!=="admin")return NextResponse.json({error:"Admin access required"},{status:403,headers});
  const url=new URL(request.url),id=url.searchParams.get("runId");
  try{
    if(id){
      if(!validRunId(id))return NextResponse.json({error:"Invalid run ID"},{status:400,headers});
      const record=await getEvidence(id);
      if(!record)return NextResponse.json({error:"Record not found"},{status:404,headers});
      const integrity=verifyEvidence(record);
      const format=url.searchParams.get("format");
      if(format==="json")return new Response(JSON.stringify({integrity,record},null,2),{headers:{...headers,"Content-Type":"application/json","Content-Disposition":`attachment; filename="aquaivolt-${id}.json"`}});
      if(format==="csv"){
        const columns=["id","createdAt","kind","username","modelVersion","manifestHash","recordHash","signature","inputs","request","response"] as const;
        const csv=["integrity,"+columns.join(","),[integrity,...columns.map(k=>typeof record[k]==="object"?JSON.stringify(record[k]):record[k])].map(csvCell).join(",")].join("\r\n");
        return new Response(csv,{headers:{...headers,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="aquaivolt-evidence-${id}.csv"`}});
      }
      return NextResponse.json({integrity,record},{headers});
    }
    const requested=Number(url.searchParams.get("limit")??20);
    if(!Number.isInteger(requested)||requested<1||requested>50)return NextResponse.json({error:"Limit must be 1-50"},{status:400,headers});
    const page=await listEvidence(requested,url.searchParams.get("cursor")??undefined);
    return NextResponse.json({runs:page.records.map(r=>({id:r.id,createdAt:r.createdAt,kind:r.kind,username:r.username,modelVersion:r.modelVersion,integrity:verifyEvidence(r),recordHash:r.recordHash})),cursor:page.cursor,hasMore:page.hasMore},{headers});
  }catch{return NextResponse.json({error:"Audit storage could not be read. Retry later; no records have been discarded."},{status:503,headers});}
}
