import { NextResponse } from "next/server";
import {
  checkAceStepHealth,
  getAceStepHealthInfo,
  getGenerationMode,
  isAceStepBusy,
} from "@/lib/generation";
import { getSafeSettingsSummary } from "@/lib/ace-step-settings";
import { getDefaultPresetId, listResolvedPresets } from "@/lib/presets";
import {
  getPostprocessHealth,
  plannerFromModelsProbe,
  presetReadiness,
  probeModels,
  safePlannerJson,
} from "@/lib/models-probe";
import { getQualityTier } from "@/lib/ace-capabilities";
import {
  buildDiagnosticsSnapshot,
  collectSecretLeaks,
} from "@/lib/diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health probe — never returns API keys, tokens, or other secrets.
 * Includes diagnostics (disk, ffmpeg, GPU busy) with path redaction.
 */
export async function GET() {
  const mode = getGenerationMode();
  const aceHealth = await getAceStepHealthInfo();
  const aceStep = aceHealth.connected;
  const busy = mode === "ace-step" ? isAceStepBusy() : false;
  const settings = getSafeSettingsSummary(busy);
  const models = await probeModels();
  const presets = presetReadiness(listResolvedPresets(), models);
  const postprocess = getPostprocessHealth();

  // Redact absolute ffmpeg path from health postprocess blob.
  const postprocessSafe = {
    ...postprocess,
    ffmpegBin: postprocess.ffmpegPathConfigured
      ? postprocess.ffmpegAvailable
        ? "ffmpeg"
        : null
      : postprocess.ffmpegAvailable
        ? "ffmpeg"
        : null,
  };

  const diagnostics = buildDiagnosticsSnapshot({
    mode,
    aceStepConnected: mode === "ace-step" ? aceStep : null,
    gpuBusy: busy,
    capabilities: models.capabilities ?? [],
    models: models.items ?? [],
  });

  const planner = safePlannerJson(
    plannerFromModelsProbe(models, {
      mode,
      aceConnected: mode === "ace-step" ? aceStep : false,
      loadedLmModel: aceHealth.loadedLmModel,
    })
  );

  const body = {
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
    postprocess: postprocessSafe,
    planner,
    diagnostics,
  };

  const leaks = collectSecretLeaks(body);
  if (leaks.length) {
    // Strip any accidental secret-looking string fields rather than failing health.
    console.error("[health] secret leak keys blocked:", leaks.join(", "));
  }

  return NextResponse.json(body);
}
