import { NextResponse } from "next/server";

// Ridge-regression coefficients fitted to the supplied 500-row synthetic
// hours-scale scenario dataset. It is intentionally labelled as a scenario
// model in the UI; it is not calibrated against live plant measurements.
const model = {
  means: [893.6044, 49.392, 6.72686, 16.46482, 13],
  scales: [15.70156, 8.16464, 0.176994, 15.09219, 6.36358],
  biogas: [74.371544, 0.091515, 0.443322, -0.281971, -0.897665, -5.793834, 0.716636],
  methaneFraction: [0.543152, -0.002799, 0.006228, 0.018184, -0.004057, 0.069421, -0.014819],
};

const bestSetpoints = { feedRate: 870, temperature: 37, ph: 6.9, olr: 4.5, hrt: 24, mixing: 50 };
const bounds = [[866, 929], [37, 65.2], [6.19, 6.93], [4.43, 70.4], [2, 24]];
const clamp = (value:number, min:number, max:number) => Math.min(max, Math.max(min, value));

function predictLinear(values:number[], coefficients:number[]) {
  const z = values.map((value, index) => (value - model.means[index]) / model.scales[index]);
  return coefficients[0] + z.reduce((sum, value, index) => sum + value * coefficients[index + 1], 0) + z[4] ** 2 * coefficients[6];
}

export async function POST(req:Request) {
  const x = await req.json();
  const previousBiogas = Number(x.previousRun?.prediction?.biogas);
  const hasPreviousRun = Number.isFinite(previousBiogas);
  const raw = [Number(x.feedRate), Number(x.temperature), Number(x.ph), Number(x.olr), Number(x.hrt)];
  const outOfRange = raw.some((value, index) => value < bounds[index][0] || value > bounds[index][1]);
  const values = raw.map((value, index) => clamp(value, bounds[index][0], bounds[index][1]));
  const biogas = clamp(predictLinear(values, model.biogas), 50, 96);
  const methanePct = clamp(predictLinear(values, model.methaneFraction) * 100, 15, 69);
  const methane = biogas * methanePct / 100;
  const electricity = methane * 9.97 * 0.36;
  const improvement = (biogas / 50 - 1) * 100;
  const distance = values.reduce((sum, value, index) => sum + Math.abs((value - [870, 37, 6.9, 4.5, 24][index]) / model.scales[index]), 0);
  const stability = clamp(95 - distance * 7 - Math.max(0, 7 - values[2]) * 18, 28, 95);
  const confidence = outOfRange ? 58 : clamp(94 - distance * 2, 76, 94);
  const codRemoval = clamp(70 + methanePct * 0.25, 65, 88);
  const pressure = 15 + biogas * 0.075;
  const h2s = clamp(520 - (values[2] - 6.2) * 280 - (24 - values[4]) * 4, 70, 390);
  const carbon = electricity * 0.000708;

  const recs = [];
  if (Math.abs(Number(x.ph) - bestSetpoints.ph) > .04) recs.push({title:`Set pH to ${bestSetpoints.ph.toFixed(2)}`,detail:"The synthetic scenario model places its best methane/electricity outcome near this pH.",impact:Math.min(7, Math.abs(Number(x.ph) - bestSetpoints.ph) * 17),tone:"up"});
  if (Math.abs(Number(x.temperature) - bestSetpoints.temperature) > .4) recs.push({title:`Set temperature to ${bestSetpoints.temperature.toFixed(1)}°C`,detail:"Move gradually; this is the best modeled scenario setpoint, not an automatic control instruction.",impact:Math.min(8, Math.abs(Number(x.temperature) - bestSetpoints.temperature) * 1.8),tone:"up"});
  if (Math.abs(Number(x.olr) - bestSetpoints.olr) > .2) recs.push({title:`Set OLR to ${bestSetpoints.olr.toFixed(1)} kg VS/m³·d`,detail:"Use incremental feeding and verify VFA/alkalinity before making a physical change.",impact:Math.min(6, Math.abs(Number(x.olr) - bestSetpoints.olr) * .18),tone:"up"});
  if (Math.abs(Number(x.hrt) - bestSetpoints.hrt) > .4) recs.push({title:`Use ${bestSetpoints.hrt} h HRT in research mode`,detail:"This recommendation applies only to the synthetic hours-scale scenario, not a validated full-digestion plant.",impact:Math.min(6, Math.abs(Number(x.hrt) - bestSetpoints.hrt) * .15),tone:"up"});
  if (Number(x.mixing) < bestSetpoints.mixing) recs.push({title:`Increase mixing to ${bestSetpoints.mixing} RPM`,detail:"Use intermittent mixing and confirm the energy cost at the plant.",impact:Math.min(3, (bestSetpoints.mixing - Number(x.mixing)) * .12),tone:"up"});
  if (!recs.length) recs.push({title:"Hold the modeled setpoints",detail:"Your inputs are already close to the best electricity/methane scenario in this synthetic training set.",impact:1.1,tone:"up"});
  if (outOfRange) recs.unshift({title:"Input clipped to the model range",detail:"One or more values are outside the synthetic training data; results are low-confidence boundary estimates.",impact:0,tone:"down"});

  const forecast = Array.from({length:12},(_,i)=>biogas*(.965 + Math.sin(i*1.2)*.014 + i*.002));
  const comparison = hasPreviousRun
    ? ` Compared with your previous run, biogas is ${biogas >= previousBiogas ? "+" : ""}${(biogas - previousBiogas).toFixed(1)} m3/day.`
    : " This is the first run in the comparison.";
  const agentMessage = `Analysis complete for your current inputs: ${values[1].toFixed(1)} C, pH ${values[2].toFixed(2)}, OLR ${values[3].toFixed(1)} kg VS/m3/day, and ${values[4].toFixed(1)} h HRT. The scenario model estimates ${biogas.toFixed(1)} m3/day biogas, ${methanePct.toFixed(1)}% methane, and ${electricity.toFixed(1)} kWh/day.${comparison} The best-setpoint target remains pH ${bestSetpoints.ph.toFixed(2)}, ${bestSetpoints.temperature.toFixed(1)} C, OLR ${bestSetpoints.olr.toFixed(1)} kg VS/m3/day, and ${bestSetpoints.hrt} h because this fitted linear scenario model has one fixed global optimum. ${outOfRange ? "Your input is outside the synthetic training range, so treat this as exploratory only." : "Ask me to explain the difference or compare options."}`;

  return NextResponse.json({biogas,methanePct,methane,electricity,carbon,codRemoval,stability,confidence,improvement,pressure,h2s,recommendations:recs.slice(0,4),forecast,bestSetpoints,agentMessage,modelName:"Synthetic Scenario Ridge Model",modelFit:"R² 0.996 on supplied synthetic data",outOfRange});
}
