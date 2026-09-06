import { NextResponse } from "next/server";
import { listResolvedPresets } from "@/lib/presets";
import { presetReadiness, probeModels } from "@/lib/models-probe";
import { getQualityTier } from "@/lib/ace-capabilities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public models + preset readiness + capabilities — no secrets. */
export async function GET() {
  const models = await probeModels();
  const presets = presetReadiness(listResolvedPresets(), models);
  return NextResponse.json({
    models,
    presets,
    capabilities: models.capabilities ?? [],
    providers: models.providers ?? null,
    qualityTier: getQualityTier(),
  });
}
