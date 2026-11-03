import { NextResponse } from "next/server";
import { retrieveKnowledge } from "../../lib/rag";
import { getSession } from "../../lib/auth";
import {getEvidence,validRunId,verifyEvidence} from "../../lib/audit";
import type {ResearchResult} from "../../lib/hrt-research-execution";

type Inputs = { feedstock?:string; feedRate?: number; temperature?: number; ph?: number; olr?: number; hrt?: number; codIn?:number; vfa?:number; mixing?:number };
type Prediction = { biogas?: number; methane?:number; electricity?: number; carbon?: number; modelName?:string; runId?:string; alerts?:{label:string;status:string;message:string;value:number;unit:string;limit:string}[]; recommendations?:{title:string;detail:string}[]; bestSetpoints?: { feedRate:number; temperature:number; ph:number; olr:number; hrt:number; codIn:number; vfa:number; mixing:number } };
type Message = { role?: string; text?: string };

function fallbackAnswer(question: string, inputs: Inputs, prediction: Prediction | null) {
  const q = question.toLowerCase();
  if(!prediction?.bestSetpoints&&(q.includes("recommend")||q.includes("best")||q.includes("setpoint")||q.includes("improve")||q.includes("ph")))return "No run-specific recommendation is available before optimization. Results are advisory model estimates and require operator review.";
  const best = prediction?.bestSetpoints ?? { feedRate:870, temperature:37, ph:7.2, olr:3.2, hrt:22, codIn:7000, vfa:1100, mixing:50 };
  const outputs = prediction?.biogas !== undefined
    ? `The current AI biogas optimization result is ${prediction.biogas.toFixed(1)} m3/day biogas, ${prediction.methane?.toFixed(1)} m3 CH4/day methane, and ${prediction.electricity?.toFixed(1)} kWh/day.`
    : "Run AI biogas optimization first and I can explain the scenario-specific result.";

  if (q.includes("best") || q.includes("recommend") || q.includes("setpoint") || q.includes("improve")) {
    return `For the selected feedstock's strongest supplied scenario: feed ${best.feedRate} kg VS/day, pH ${best.ph.toFixed(2)}, temperature ${best.temperature.toFixed(1)} C, OLR ${best.olr.toFixed(1)} kg COD/m3/day, HRT ${best.hrt} days, COD ${best.codIn} mg/L, VFA ${best.vfa} mg/L, and mixing ${best.mixing} RPM. ${outputs} Validate physical changes with the operator and VFA/alkalinity checks.`;
  }
  if (q.includes("ph")) {
    return `Your pH is ${inputs.ph ?? "not entered"}. The active data model's best result is near pH ${best.ph.toFixed(2)}. ${outputs} Treat this as a simulation recommendation, not an automatic dosing instruction.`;
  }
  if (q.includes("methane") || q.includes("electricity") || q.includes("biogas")) {
    return `${outputs} Biogas volume, methane volume, and generator power come from the multi-input optimization model; daily electricity is estimated generator kW multiplied by 24 hours. Feedstock, feed rate, temperature, pH, OLR, HRT, COD, VFA, and mixing all influence the result.`;
  }
  if (q.includes("alert") || q.includes("alarm") || q.includes("limit") || q.includes("attention")) {
    const active = prediction?.alerts?.filter((alert) => alert.status !== "normal") ?? [];
    if (!prediction) return "Run AI biogas optimization first so I can evaluate the current gas thresholds.";
    if (!active.length) return `No configured gas threshold is active for this simulation. ${outputs} These are model-derived checks, not physical leakage alarms.`;
    return `${active.map((alert) => `${alert.label}: ${alert.value.toFixed(1)} ${alert.unit} (${alert.message}; configured ${alert.limit})`).join(" ")} Review these simulated alerts with the operator; no equipment command has been sent.`;
  }
  if (q.includes("model") || q.includes("random") || q.includes("prediction")) {
    return `This dashboard uses deterministic multi-input scenario inference plus a seeded, bounded candidate search that can recommend a different high-ranking safe scenario on each run. Feedstock, feed rate, temperature, pH, OLR, HRT, COD, VFA, and mixing are all considered. It is anchored to the supplied optimization cases and uses the SCADA data ranges for coverage, so it remains a prototype rather than a live-plant validated model. ${outputs}`;
  }
  if (q.includes("hrt") || q.includes("retention")) {
    return `HRT is measured in days by the active model and displayed in hours by multiplying by 24. ${prediction?.bestSetpoints?`The selected HRT is ${best.hrt} days (${(best.hrt*24).toFixed(1)} hours).`:"No run-specific HRT is available yet."} A shorter HRT is not guaranteed. The separate hours-scale workbooks are research extrapolations, not the active model's anchors.`;
  }
  return `${outputs} I can explain the model, the source workbooks, safe limits, or the best modeled setpoints.`;
}

function outputText(body: unknown) {
  const response = body as { output_text?: string; output?: { content?: { type?: string; text?: string }[] }[] };
  if (response.output_text) return response.output_text;
  return response.output?.flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text").map((item) => item.text ?? "").join("\n").trim() ?? "";
}

async function generateAnswer(question: string, inputs: Inputs, prediction: Prediction | null, history: Message[], context: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const plantState = prediction?.biogas !== undefined
    ? `Current AI biogas optimization result: ${prediction.biogas.toFixed(1)} m3/day biogas, ${prediction.methane?.toFixed(1)} m3 CH4/day methane, ${prediction.electricity?.toFixed(1)} kWh/day, ${prediction.carbon?.toFixed(2)} tCO2e/day. Run ID: ${prediction.runId ?? "not available"}. Current operator recommendations: ${(prediction.recommendations ?? []).map((item) => item.title).join("; ") || "none"}.`
    : "No AI biogas optimization has been run in this chat yet.";
  const currentInputs = `Current inputs: feedstock ${inputs.feedstock ?? "n/a"}, feed rate ${inputs.feedRate ?? "n/a"} kg VS/day, temperature ${inputs.temperature ?? "n/a"} C, pH ${inputs.ph ?? "n/a"}, OLR ${inputs.olr ?? "n/a"} kg COD/m3/day, HRT ${inputs.hrt ?? "n/a"} days, COD ${inputs.codIn ?? "n/a"} mg/L, VFA ${inputs.vfa ?? "n/a"} mg/L, mixing ${inputs.mixing ?? "n/a"} RPM.`;
  const recentChat = history.slice(-6).map((message) => `${message.role === "user" ? "User" : "Copilot"}: ${String(message.text ?? "").slice(0, 500)}`).join("\n");
  const prompt = `You are Aqua Copilot, a concise, practical assistant for an AI biogas optimization dashboard prototype. Always describe the process as AI biogas optimization and its output as an optimization result; do not call it a prediction. Answer the user's question using the retrieved project evidence below and the current simulation context. Use simple language and absolute units such as m3/day and kWh/day; do not use percentage numbers. If evidence is missing, say so. Do not imply that generated data proves real plant performance. Do not instruct automatic control of equipment or dosing; frame recommendations as simulations requiring operator review. Mention the active model's data limits whenever material. Use 2 to 5 short sentences and include no markdown table.\n\nRetrieved project evidence:\n${context}\n\n${plantState}\n${currentInputs}\n\nRecent chat:\n${recentChat || "None"}\n\nUser question: ${question}`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.OPENAI_RAG_MODEL || "gpt-5.6-sol", input: prompt, max_output_tokens: 420 }),
  });
  if (!response.ok) throw new Error(`Response request failed (${response.status})`);
  return outputText(await response.json());
}

export async function POST(req: Request) {
  const session=await getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { question, inputs = {}, prediction = null, history = [], mode, researchRunId } = await req.json() as { question?: string; inputs?: Inputs; prediction?: Prediction | null; history?: Message[];mode?:string;researchRunId?:string };
  const text = String(question ?? "").trim();
  if (!text) return NextResponse.json({ answer: "Please enter a question." }, { status: 400 });

  if(mode==="HOURS_RESEARCH"){
    if(!researchRunId)return NextResponse.json({answer:"Run and save an hours-scale study first. The active model evaluates HRT from 2 to 24 hours using synthetic workbook data; plant performance has not yet been validated.",sources:[]});
    if(session.role!=="admin")return NextResponse.json({error:"Admin access required to read saved research evidence"},{status:403});
    if(typeof researchRunId!=="string"||!validRunId(researchRunId))return NextResponse.json({error:"Invalid research run ID"},{status:400});
    try{
      const record=await getEvidence(researchRunId);
      if(!record||record.kind!=="hrt_research")return NextResponse.json({error:"Hours-scale run not found"},{status:404});
      if(!verifyEvidence(record))return NextResponse.json({error:"Saved research evidence failed integrity verification"},{status:409});
      const result=record.response as ResearchResult,p=result.selected,q=text.toLowerCase();
      const current=result.comparison;
      const outputs=`${current?`The current scenario at ${current.hrtHours.toFixed(2)} hours predicts ${current.biogasM3Day.toFixed(2)} m³/day biogas, ${current.methaneM3Day.toFixed(2)} m³ CH₄/day methane and ${current.electricityKwhDay.toFixed(2)} kWh/day electricity potential. `:""}The AI selected scenario at ${p.hrtHours.toFixed(2)} hours estimates ${p.biogasM3Day.toFixed(2)} m³/day biogas, ${p.methaneM3Day.toFixed(2)} m³ CH₄/day methane and ${p.electricityKwhDay.toFixed(2)} kWh/day electricity potential.`;
      const goal=result.request.objective==="target_hrt"?"It evaluates the specific HRT you entered.":result.request.objective==="maximum_energy"?"It selects the highest predicted electricity output along the hours-scale trajectory.":`It selects the shortest evaluated HRT retaining at least ${result.request.retainedMethanePct}% of the modelled peak methane output.`;
      let answer=`The selected HRT is ${p.hrtHours.toFixed(2)} hours, compared with the ${result.scenario?.mode==="automatic"?"generated":"entered"} ${result.retentionTime.beforeHours.toFixed(2)} hours. ${goal} The signed change is ${result.retentionTime.changeHours.toFixed(2)} hours (${result.retentionTime.direction}).`;
      if(/same|repeat|random|new scenario/.test(q))answer=`${result.scenario?.mode==="automatic"?"This run generated a new synthetic HRT input and evaluated it with the fitted model. Its saved seed reproduces the scenario.":"This run uses the manually entered comparison HRT."} Predictions change when the model input changes. The recommendation searches the same 2–24 hour trajectory, so the same optimization goal can return the same optimum. ${outputs}`;
      else if(/recommend|setpoint|temperature|ph|feed|loading/.test(q))answer=`The selected scenario uses HRT ${p.hrtHours.toFixed(2)} hours, temperature ${p.temperature.toFixed(2)} °C, pH ${p.ph.toFixed(2)}, feed rate ${p.feedRate.toFixed(2)} kg VS/day and organic loading ${p.olr.toFixed(2)} kg VS/m³/day. These process settings vary together along the fitted trajectory; separate control effects are not established.`;
      else if(/model|train|accur|data/.test(q))answer=`This run uses ${result.modelVersion}, a fitted hours-scale model based on 500 synthetic workbook rows. It evaluates 2,000 candidate HRT points within 2–24 hours. Synthetic evaluation scores do not establish plant accuracy; prediction intervals are not calibrated.`;
      else if(/biogas|methane|electric|production/.test(q))answer=`${outputs} Electricity potential is methane volume × 9.97 kWh/m³ × 0.36, using the workbook assumptions.`;
      else answer+=` ${outputs}`;
      if(!result.goal.satisfied)answer+=" This selected target does not meet the requested methane-retention goal.";
      answer+=" These are synthetic research estimates; actual plant performance remains to be validated.";
      return NextResponse.json({answer,sources:[result.source.file],runId:record.id,retrieval:"verified_saved_research_record"});
    }catch{return NextResponse.json({error:"Saved research evidence could not be read"},{status:503});}
  }

  const retrieved = await retrieveKnowledge(text);
  const context = retrieved.chunks.map((chunk, index) => `[${index + 1}] ${chunk.source}: ${chunk.text}`).join("\n\n");
  let answer = "";
  try {
    answer = (await generateAnswer(text, inputs, prediction, Array.isArray(history) ? history : [], context)) || "";
  } catch {
    // Keep the prototype usable if the API key is unavailable or quota is exhausted.
  }
  if (!answer) answer = fallbackAnswer(text, inputs, prediction);
  const sources = [...new Set(retrieved.chunks.map((chunk) => chunk.source))];
  return NextResponse.json({ answer, sources, retrieval: retrieved.retrieval });
}
