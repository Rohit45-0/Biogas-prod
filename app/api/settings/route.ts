import { NextResponse } from "next/server";
import { getSession } from "../../lib/auth";
import { defaultThresholds, getThresholds, saveThresholds, type ThresholdSettings } from "../../lib/audit";

export async function GET(request: Request) {
  const session = await getSession(request);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  return NextResponse.json({ settings: await getThresholds(), defaults: defaultThresholds });
}

export async function POST(request: Request) {
  const session = await getSession(request);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const body = await request.json() as Partial<ThresholdSettings>;
  const settings: ThresholdSettings = {
    methaneMinimum: Number(body.methaneMinimum), h2sWarning: Number(body.h2sWarning),
    oxygenMaximum: Number(body.oxygenMaximum), pressureMinimum: Number(body.pressureMinimum),
    pressureMaximum: Number(body.pressureMaximum), facilityName: String(body.facilityName ?? "").trim(),
    facilityLocation: String(body.facilityLocation ?? "").trim(),
  };
  const numeric = [settings.methaneMinimum, settings.h2sWarning, settings.oxygenMaximum, settings.pressureMinimum, settings.pressureMaximum];
  if (numeric.some((value) => !Number.isFinite(value)) || !settings.facilityName || !settings.facilityLocation || settings.pressureMinimum >= settings.pressureMaximum) {
    return NextResponse.json({ error: "Please provide valid thresholds and facility details." }, { status: 400 });
  }
  await saveThresholds(settings, session.username);
  return NextResponse.json({ settings });
}
