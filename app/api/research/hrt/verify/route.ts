import {NextResponse} from "next/server";
import {getSession} from "../../../../lib/auth";
import {validRunId} from "../../../../lib/audit";
import {verifyResearch} from "../../../../lib/hrt-research-execution";
export const runtime="nodejs";
export const maxDuration=60;
const headers={"Cache-Control":"no-store"};
export async function POST(request:Request){
  const session=await getSession(request);
  if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});
  if(session.role!=="admin")return NextResponse.json({error:"Admin access required"},{status:403,headers});
  let body:unknown;
  try{const raw=await request.text();if(raw.length>1000)return NextResponse.json({error:"Request too large"},{status:413,headers});body=JSON.parse(raw);}catch{return NextResponse.json({error:"Valid JSON is required"},{status:400,headers});}
  if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).length!==1||!("runId" in body)||typeof body.runId!=="string"||!validRunId(body.runId))return NextResponse.json({error:"A valid saved runId is required"},{status:422,headers});
  try{const result=await verifyResearch(body.runId,session);return NextResponse.json(result.data,{status:result.http,headers});}
  catch{return NextResponse.json({error:"Research verification could not finish"},{status:503,headers});}
}
