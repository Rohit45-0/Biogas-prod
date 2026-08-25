import { NextResponse } from "next/server";
import { getSession } from "../../lib/auth";
import { modelCard, modelMetadata } from "../../lib/system";
import { shortHrtModelMetadata } from "../../lib/short-hrt-model";

export async function GET(request: Request) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    model: modelMetadata,
    card: modelCard,
    shortHrtModel: shortHrtModelMetadata,
    endpoint: "/api/predict",
    generatedAt: new Date().toISOString(),
  });
}
