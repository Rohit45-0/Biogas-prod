import {NextResponse} from "next/server";
import {getSession} from "../../../lib/auth";
import {InputError,resolveRequest} from "../../../lib/inputs";
import {executeRequest} from "../../../lib/execution";

export const runtime="nodejs";
export const maxDuration=120;
export async function POST(request:Request){
  const session=await getSession(request);
  if(!session)return NextResponse.json({error:"Sign in required"},{status:401});
  if(session.role!=="admin")return NextResponse.json({error:"Admin access required"},{status:403});
  try{
    const text=await request.text();
    if(text.length>24000)return NextResponse.json({error:"Request too large"},{status:413});
    let body;try{body=JSON.parse(text);}catch{return NextResponse.json({error:"Invalid JSON"},{status:400});}
    if(!Array.isArray(body?.requests)||body.requests.length<2||body.requests.length>5)return NextResponse.json({error:"Submit 2-5 requests for comparison"},{status:422});
    body.requests.forEach(resolveRequest);
    const results=[];
    for(const item of body.requests)results.push(await executeRequest(item,session));
    return NextResponse.json({results,allRecorded:results.every(r=>r.audit.saved)},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    if(error instanceof InputError)return NextResponse.json({error:error.message,issues:error.issues},{status:422});
    return NextResponse.json({error:"Batch execution failed; check stored records before retrying"},{status:500});
  }
}
