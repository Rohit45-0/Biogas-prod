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
  const current = await getThresholds();
  const settings: ThresholdSettings = {
    methaneMinimum: Number(body.methaneMinimum), h2sWarning: Number(body.h2sWarning),
    // Retain the legacy stored O2 value for backwards-compatible database rows;
    // O2 is no longer part of the client-defined dashboard composition.
    oxygenMaximum: current.oxygenMaximum, pressureMinimum: Number(body.pressureMinimum),
    pressureMaximum: Number(body.pressureMaximum), facilityName: String(body.facilityName ?? "").trim(),
    facilityLocation: String(body.facilityLocation ?? "").trim(),
  };
  const numeric = [settings.methaneMinimum, settings.h2sWarning, settings.pressureMinimum, settings.pressureMaximum];
  if (numeric.some((value) => !Number.isFinite(value)) || !settings.facilityName || !settings.facilityLocation || settings.pressureMinimum >= settings.pressureMaximum) {
    return NextResponse.json({ error: "Please provide valid thresholds and facility details." }, { status: 400 });
  }
  await saveThresholds(settings, session.username);
  return NextResponse.json({ settings });
}
