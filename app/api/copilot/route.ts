import { NextResponse } from "next/server";
import { retrieveKnowledge } from "../../lib/rag";
import { getSession } from "../../lib/auth";

type Inputs = { feedstock?:string; feedRate?: number; temperature?: number; ph?: number; olr?: number; hrt?: number; codIn?:number; vfa?:number; mixing?:number };
type Prediction = { biogas?: number; methanePct?: number; electricity?: number; carbon?: number; modelName?:string; confidence?:number; bestSetpoints?: { feedRate:number; temperature:number; ph:number; olr:number; hrt:number; codIn:number; vfa:number; mixing:number } };
type Message = { role?: string; text?: string };

function fallbackAnswer(question: string, inputs: Inputs, prediction: Prediction | null) {
  const q = question.toLowerCase();
  const best = prediction?.bestSetpoints ?? { feedRate:870, temperature:37, ph:7.2, olr:3.2, hrt:22, codIn:7000, vfa:1100, mixing:50 };
  const outputs = prediction?.biogas !== undefined
    ? `The current estimate is ${prediction.biogas.toFixed(1)} m3/day biogas, ${prediction.methanePct?.toFixed(1)}% CH4, and ${prediction.electricity?.toFixed(1)} kWh/day.`
    : "Run a prediction first and I can explain the scenario-specific result.";

  if (q.includes("best") || q.includes("recommend") || q.includes("setpoint") || q.includes("improve")) {
    return `For the selected feedstock's strongest supplied scenario: feed ${best.feedRate} kg VS/day, pH ${best.ph.toFixed(2)}, temperature ${best.temperature.toFixed(1)} C, OLR ${best.olr.toFixed(1)} kg COD/m3/day, HRT ${best.hrt} days, COD ${best.codIn} mg/L, VFA ${best.vfa} mg/L, and mixing ${best.mixing} RPM. ${outputs} Validate physical changes with the operator and VFA/alkalinity checks.`;
  }
  if (q.includes("ph")) {
    return `Your pH is ${inputs.ph ?? "not entered"}. The active synthetic model's best result is near pH ${best.ph.toFixed(2)}. ${outputs} Treat this as a simulation recommendation, not an automatic dosing instruction.`;
  }
  if (q.includes("methane") || q.includes("electricity") || q.includes("biogas")) {
    return `${outputs} Biogas, methane percentage, and generator power come from the multi-input scenario inference; daily electricity is predicted generator kW multiplied by 24 hours. Feedstock, feed rate, temperature, pH, OLR, HRT, COD, VFA, and mixing all influence the result.`;
  }
  if (q.includes("model") || q.includes("random") || q.includes("prediction")) {
    return `This dashboard uses a deterministic multi-input, distance-weighted scenario model, not random numbers. Feedstock, feed rate, temperature, pH, OLR, HRT, COD, VFA, and mixing are all considered. It is anchored to the supplied optimization cases and uses the synthetic SCADA ranges for coverage, so it remains a prototype rather than a live-plant validated model. ${outputs}`;
  }
  if (q.includes("hrt") || q.includes("retention")) {
    return "The active dashboard model now uses the normal 15.45-34.62 day HRT range from the synthetic SCADA coverage data. The separate below-6-hour and hours-scale workbooks remain research extrapolations and are not used for normal-mode recommendations.";
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
    ? `Current prediction: ${prediction.biogas.toFixed(1)} m3/day biogas, ${prediction.methanePct?.toFixed(1)}% CH4, ${prediction.electricity?.toFixed(1)} kWh/day, ${prediction.carbon?.toFixed(2)} tCO2e/day.`
    : "No prediction has been run in this chat yet.";
  const currentInputs = `Current inputs: feedstock ${inputs.feedstock ?? "n/a"}, feed rate ${inputs.feedRate ?? "n/a"} kg VS/day, temperature ${inputs.temperature ?? "n/a"} C, pH ${inputs.ph ?? "n/a"}, OLR ${inputs.olr ?? "n/a"} kg COD/m3/day, HRT ${inputs.hrt ?? "n/a"} days, COD ${inputs.codIn ?? "n/a"} mg/L, VFA ${inputs.vfa ?? "n/a"} mg/L, mixing ${inputs.mixing ?? "n/a"} RPM.`;
  const recentChat = history.slice(-6).map((message) => `${message.role === "user" ? "User" : "Copilot"}: ${String(message.text ?? "").slice(0, 500)}`).join("\n");
  const prompt = `You are Aqua Copilot, a concise, practical assistant for a biogas dashboard prototype. Answer the user's question using the retrieved project evidence below and the current simulation context. If evidence is missing, say so. Do not imply that synthetic data proves real plant performance. Do not instruct automatic control of equipment or dosing; frame recommendations as simulations requiring operator review. Mention the active model's synthetic limits whenever material. Use 2 to 5 short sentences and include no markdown table.\n\nRetrieved project evidence:\n${context}\n\n${plantState}\n${currentInputs}\n\nRecent chat:\n${recentChat || "None"}\n\nUser question: ${question}`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.OPENAI_RAG_MODEL || "gpt-5.6-sol", input: prompt, max_output_tokens: 420 }),
  });
  if (!response.ok) throw new Error(`Response request failed (${response.status})`);
  return outputText(await response.json());
}

export async function POST(req: Request) {
  if (!await getSession(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { question, inputs = {}, prediction = null, history = [] } = await req.json() as { question?: string; inputs?: Inputs; prediction?: Prediction | null; history?: Message[] };
  const text = String(question ?? "").trim();
  if (!text) return NextResponse.json({ answer: "Please enter a question." }, { status: 400 });

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
