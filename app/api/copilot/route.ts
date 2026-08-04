import { NextResponse } from "next/server";

export async function POST(req:Request) {
  const {question, inputs, prediction} = await req.json();
  const q = String(question).toLowerCase();
  const best = prediction?.bestSetpoints ?? { feedRate:870, temperature:37, ph:6.9, olr:4.5, hrt:24, mixing:50 };
  const outputs = prediction ? `The current estimate is ${prediction.biogas.toFixed(1)} m³/day biogas, ${prediction.methanePct.toFixed(1)}% CH₄, and ${prediction.electricity.toFixed(1)} kWh/day.` : "Run a prediction first and I’ll explain the scenario-specific result.";
  let answer = "";

  if (q.includes("best") || q.includes("recommend") || q.includes("setpoint") || q.includes("improve")) {
    answer = `For the best methane/electricity outcome in this synthetic scenario model: pH ${best.ph.toFixed(2)}, temperature ${best.temperature.toFixed(1)}°C, OLR ${best.olr.toFixed(1)} kg VS/m³·d, HRT ${best.hrt} hours, and mixing ${best.mixing} RPM. ${outputs} These are research-scenario recommendations, so validate physical changes with the operator and VFA/alkalinity checks.`;
  } else if (q.includes("ph")) {
    answer = `Your pH is ${inputs.ph}. The synthetic scenario model’s best result is near pH ${best.ph.toFixed(2)}. ${inputs.ph < best.ph ? "Raise it gradually and observe VFA/alkalinity before increasing feed." : inputs.ph > best.ph ? "Reduce alkalinity dosing gradually and check ammonia inhibition." : "It is already close to the modeled setpoint."}`;
  } else if (q.includes("methane") || q.includes("electricity") || q.includes("biogas")) {
    answer = `${outputs} Methane is calculated from predicted biogas × predicted CH₄ fraction, while electricity is methane × 9.97 kWh/m³ × 36% generator efficiency. The most influential scenario variables are HRT, pH, temperature, and OLR.`;
  } else if (q.includes("explain") || q.includes("model") || q.includes("prediction")) {
    answer = `This is a compact ridge-regression model trained on the supplied 500-row synthetic 2–24-hour HRT scenario dataset. It predicts biogas and methane fraction from feed rate, temperature, pH, OLR, and HRT; electricity, carbon, stability, and gas quality are then calculated transparently. It is a demo/digital-twin scenario model, not a live-site validated model. ${outputs}`;
  } else if (q.includes("hrt") || q.includes("retention")) {
    answer = `This model is limited to a synthetic 2–24-hour research scenario. The supplied workbook itself says hours-scale full digestion is not site validated. Use it for simulation only; do not apply it as an operating recommendation without a pilot and expert review.`;
  } else if (q.includes("carbon")) {
    answer = prediction ? `Estimated avoided grid emissions are ${prediction.carbon.toFixed(2)} tCO₂e/day, using predicted electricity and a configurable prototype factor of 0.708 kgCO₂e/kWh. Replace that factor with the approved local grid factor before reporting emissions.` : "Carbon is calculated after prediction from electricity generated and a configurable grid-emission factor.";
  } else if (q.includes("data") || q.includes("source") || q.includes("synthetic")) {
    answer = "The active model is trained on the supplied 500-row Hours-Scale AI Synthetic dataset. It is interpolation/noise-augmented synthetic data, so it is appropriate for an interactive demo but not proof of live-plant performance. The knowledge base also covers the SCADA template, validation runs, optimization scenarios, and short-HRT research scenarios.";
  } else {
    answer = `${outputs} I can recommend the best modeled setpoints, explain the model, compare methane/electricity, explain HRT safety, or describe the synthetic data limits.`;
  }
  return NextResponse.json({answer});
}
