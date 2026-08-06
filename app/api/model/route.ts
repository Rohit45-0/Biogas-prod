import { NextResponse } from "next/server";
import { getSession } from "../../lib/auth";
import { modelCard, modelMetadata } from "../../lib/system";

export async function GET(request: Request) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    model: modelMetadata,
    card: modelCard,
    endpoint: "/api/predict",
    generatedAt: new Date().toISOString(),
  });
}
