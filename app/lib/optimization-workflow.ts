export const optimizationSteps=[
  {id:"conditions",title:"Read conditions",detail:"Operating values from the submitted reference profile."},
  {id:"validation",title:"Validate values",detail:"Nine required values checked for type and physical limits."},
  {id:"candidates",title:"Evaluate candidates",detail:"2,000 bounded candidates evaluated and ranked by the scenario engine."},
  {id:"production",title:"Compare production",detail:"Baseline and selected-candidate biogas, methane and electricity calculated."},
  {id:"diagnostics",title:"Calculate KPIs",detail:"Process diagnostics, HRT curves and recommendations calculated."},
  {id:"evidence",title:"Build evidence",detail:"Run identifier, input fingerprints and model evidence assembled."},
  {id:"storage",title:"Save audit record",detail:"Signed evidence written to persistent storage and read back for verification."},
  {id:"results",title:"Return results",detail:"Production estimates and recommendations returned to the dashboard."},
] as const;

export type OptimizationStepId=(typeof optimizationSteps)[number]["id"];
export type WorkflowEvent={type:"progress";step:OptimizationStepId;status:"running"|"complete"|"warning";detail:string;at:string;elapsedMs:number};
export type WorkflowResult={runId:string;createdAt:string;modelName:string;modelVersion:string;biogas:number;methane:number;electricity:number;audit:{saved:boolean;status:string}};
export type OptimizationWorkflowState={id:string;startedAt:number;phase:"running"|"complete"|"error";events:WorkflowEvent[];result:WorkflowResult|null;error:string};

export async function readOptimizationResponse<T extends WorkflowResult>(response:Response,onProgress:(event:WorkflowEvent)=>void):Promise<T>{
  if(!response.ok){
    const body=await response.json().catch(()=>null);
    throw new Error(body?.error||`Optimization request failed (HTTP ${response.status})`);
  }
  if(!response.headers.get("content-type")?.includes("application/x-ndjson"))return response.json();
  if(!response.body)throw new Error("The execution stream is unavailable. Check run history before starting another run.");
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let pending="",result:T|undefined;
  function consume(line:string){
    if(!line.trim())return;
    const event=JSON.parse(line);
    if(event.type==="progress"){
      if(!optimizationSteps.some(s=>s.id===event.step)||!["running","complete","warning"].includes(event.status)||typeof event.detail!=="string"||!Number.isFinite(event.elapsedMs)||typeof event.at!=="string")throw new Error("Invalid execution progress received.");
      onProgress(event);
    }else if(event.type==="result"){
      if(!event.data?.runId||!event.data?.audit)throw new Error("The final optimization result is incomplete.");
      result=event.data;
    }else if(event.type==="error")throw new Error(event.error||"Optimization execution failed.");
    else throw new Error("Unrecognized execution message.");
  }
  try{
    while(true){
      const chunk=await reader.read();
      pending+=decoder.decode(chunk.value,{stream:!chunk.done});
      let newline;
      while((newline=pending.indexOf("\n"))!==-1){consume(pending.slice(0,newline));pending=pending.slice(newline+1);}
      if(chunk.done)break;
    }
    consume(pending);
    if(!result)throw new Error("Connection ended before the final result. Check run history before starting another run.");
    return result;
  }catch(error){await reader.cancel().catch(()=>{});throw error;}
  finally{reader.releaseLock();}
}
