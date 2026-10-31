import {NextResponse} from "next/server";
import {getSession} from "../../lib/auth";
import {InputError} from "../../lib/inputs";
import {evaluateObservations,recordObservation,validationProtocol} from "../../lib/plant-validation";

export const runtime="nodejs";
export const maxDuration=60;
const headers={"Cache-Control":"no-store"};
export async function GET(request:Request){
  const session=await getSession(request);
  if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});
  if(session.role!=="admin")return NextResponse.json({error:"Admin access required"},{status:403,headers});
  return NextResponse.json(validationProtocol,{headers});
}
export async function POST(request:Request){
  const session=await getSession(request);
  if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});
  if(session.role!=="admin")return NextResponse.json({error:"Admin access required"},{status:403,headers});
  let body;
  try{
    const raw=await request.text();
    if(raw.length>32000)return NextResponse.json({error:"Request too large"},{status:413,headers});
    body=JSON.parse(raw);
  }catch{return NextResponse.json({error:"Valid JSON is required"},{status:400,headers});}
  try{
    if(body?.action==="record")return NextResponse.json(await recordObservation(body,session),{status:201,headers});
    if(body?.action==="evaluate")return NextResponse.json(await evaluateObservations(body,session),{status:201,headers});
    return NextResponse.json({error:"Use action record or evaluate"},{status:422,headers});
  }catch(error){
    if(error instanceof InputError)return NextResponse.json({error:error.message,issues:error.issues},{status:422,headers});
    return NextResponse.json({error:"Persistent validation evidence could not be confirmed. No validation approval was issued."},{status:503,headers});
  }
}
