import { NextResponse } from "next/server";
import { getSession } from "../../lib/auth";
import { modelCard, modelMetadata } from "../../lib/system";
import {manifest,manifestHash} from "../../lib/manifest";
import {mlManifest,mlManifestHash} from "../../lib/ml-manifest";

export async function GET(request: Request) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    model: modelMetadata,
    card: modelCard,
    endpoint: "/api/predict",
    manifest, manifestHash,
    trainedMl:{endpoint:"/api/ml/predict",manifest:mlManifest,manifestHash:mlManifestHash,access:"admin",runtimeStatus:"Check authenticated GET /api/ml/predict for actual artifact load status"},
    generatedAt: new Date().toISOString(),
  },{headers:{"Cache-Control":"no-store"}});
}
