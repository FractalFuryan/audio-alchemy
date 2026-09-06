import { NextResponse } from "next/server";
import {
  checkAceStepHealth,
  getGenerationMode,
  isAceStepBusy,
} from "@/lib/generation";
import { getSafeSettingsSummary } from "@/lib/ace-step-settings";
import { getDefaultPresetId, listResolvedPresets } from "@/lib/presets";
import {
  getPostprocessHealth,
  presetReadiness,
  probeModels,
} from "@/lib/models-probe";
import { getQualityTier } from "@/lib/ace-capabilities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health probe — never returns API keys, tokens, or other secrets.
 * Includes preset readiness, models probe, capabilities, and postprocess ffmpeg hint.
 */
export async function GET() {
  const mode = getGenerationMode();
  const aceStep = await checkAceStepHealth();
  const busy = mode === "ace-step" ? isAceStepBusy() : false;
  const settings = getSafeSettingsSummary(busy);
  const models = await probeModels();
  const presets = presetReadiness(listResolvedPresets(), models);
  const postprocess = getPostprocessHealth();

  return NextResponse.json({
    ok: true,
    mode,
    aceStep,
    settings,
    qualityTier: getQualityTier(),
    presets: {
      default: getDefaultPresetId(),
      items: presets,
    },
    models,
    capabilities: models.capabilities ?? [],
    providers: models.providers ?? null,
    postprocess,
  });
}
