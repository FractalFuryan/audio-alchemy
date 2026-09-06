/**
 * Safe models / preset readiness probe for /api/health and /api/models.
 * Never exposes API keys or tokens.
 * Includes local + optional remote XL capability inventory.
 */

import {
  buildCapabilityStatuses,
  getProviderSafeSummary,
  probeProviderInventory,
  type ProviderInventory,
} from "./ace-provider";
import type { AceCapabilityStatus } from "./ace-capabilities";
import { getQualityTier } from "./ace-capabilities";
import {
  classifyModelFamily,
  getLocalVramBudgetGb,
  isXlCheckpoint,
  listResolvedPresets,
  type ResolvedPreset,
} from "./presets";
import {
  ffmpegAvailable,
  ffmpegBin,
  ffmpegMissingHint,
  isPostprocessEnabled,
  resolvePostFxPreset,
} from "./postprocess";
import {
  plannerAvailabilityToSafeJson,
  resolvePlannerAvailability,
  type PlannerAvailability,
} from "./ace-planner";

export interface ModelProbeItem {
  id: string;
  family: "2b-turbo" | "2b-sft" | "xl" | "unknown";
  vramHintGb: number;
  supportedLocally: boolean;
  /** Which endpoint reported this id. */
  provider?: "local" | "remote";
  reason?: string;
}

export interface ModelsProbeResult {
  source: "ace-step:/v1/models" | "env-fallback" | "multi-provider";
  items: ModelProbeItem[];
  reachable: boolean;
  inventory?: ProviderInventory;
  capabilities?: AceCapabilityStatus[];
  providers?: ReturnType<typeof getProviderSafeSummary>;
}

/** Derive Song focus planner availability from a models probe + ACE health. */
export function plannerFromModelsProbe(
  models: ModelsProbeResult,
  opts: { mode: "mock" | "ace-step"; aceConnected: boolean; loadedLmModel?: string | null }
): PlannerAvailability {
  const localIds = (models.items || [])
    .filter((m) => m.provider !== "remote")
    .map((m) => m.id);
  if (opts.loadedLmModel?.trim()) localIds.push(opts.loadedLmModel.trim());
  const liveLocalInventory =
    (models.source === "ace-step:/v1/models" || models.source === "multi-provider") &&
    localIds.length > 0 &&
    Boolean(models.inventory?.local?.reachable);
  return resolvePlannerAvailability({
    mode: opts.mode,
    aceConnected: opts.aceConnected,
    localModelIds: localIds,
    liveLocalInventory,
  });
}

export function safePlannerJson(p: PlannerAvailability): Record<string, unknown> {
  return plannerAvailabilityToSafeJson(p);
}

function toItem(id: string, provider: "local" | "remote" = "local"): ModelProbeItem {
  const family = classifyModelFamily(id);
  const xl = isXlCheckpoint(id);
  const vram = getLocalVramBudgetGb();
  if (xl && provider === "local" && vram <= 12) {
    return {
      id,
      family: "xl",
      vramHintGb: 20,
      supportedLocally: false,
      provider,
      reason: "XL requires more VRAM than local 10GB budget — use optional remote endpoint",
    };
  }
  if (xl && provider === "remote") {
    return {
      id,
      family: "xl",
      vramHintGb: 20,
      supportedLocally: false,
      provider,
      reason: undefined,
    };
  }
  return {
    id,
    family,
    vramHintGb: family === "xl" ? 20 : 10,
    supportedLocally: provider === "local" && !xl,
    provider,
  };
}

function envFallbackItems(): ModelProbeItem[] {
  const presets = listResolvedPresets();
  const ids = [...new Set(presets.map((p) => p.model).filter(Boolean) as string[])];
  return ids.map((id) => toItem(id, "local"));
}

export async function probeModels(): Promise<ModelsProbeResult> {
  const inventory = await probeProviderInventory();
  const tier = getQualityTier();
  const capabilities = buildCapabilityStatuses(inventory, tier);
  const providers = getProviderSafeSummary(inventory);

  const items: ModelProbeItem[] = [];
  for (const id of inventory.local.models) {
    items.push(toItem(id, "local"));
  }
  for (const id of inventory.remote.models) {
    items.push(toItem(id, "remote"));
  }

  const reachable = inventory.local.reachable || inventory.remote.reachable;

  if (items.length > 0) {
    return {
      source:
        inventory.remote.configured || inventory.local.models.length
          ? "multi-provider"
          : "ace-step:/v1/models",
      items,
      reachable,
      inventory,
      capabilities,
      providers,
    };
  }

  // Env fallback for local presets when inventory empty
  const fallback = envFallbackItems();
  return {
    source: "env-fallback",
    items: fallback,
    reachable: inventory.local.reachable,
    inventory,
    capabilities,
    providers,
  };
}

export function presetReadiness(
  presets: ResolvedPreset[],
  models: ModelsProbeResult
): Array<ResolvedPreset & { ready: boolean; readinessReason?: string }> {
  const localIds = new Set(
    models.items.filter((m) => m.provider !== "remote").map((m) => m.id)
  );
  const hasLiveLocalList =
    (models.source === "ace-step:/v1/models" || models.source === "multi-provider") &&
    localIds.size > 0;

  const caps = models.capabilities || [];
  const tier = getQualityTier();
  const remoteXl = caps.find((c) => c.id === "remote-xl-sft");

  return presets.map((p) => {
    if (!p.supportedLocally) {
      return { ...p, ready: false, readinessReason: p.unsupportedReason };
    }

    // When QUALITY_TIER=remote-xl-sft, Quality preset readiness follows remote XL
    if (p.id === "quality" && tier === "remote-xl-sft") {
      if (!remoteXl?.available) {
        return {
          ...p,
          ready: false,
          readinessReason:
            remoteXl?.reason ||
            "QUALITY_TIER=remote-xl-sft but remote XL-SFT is not available",
        };
      }
      return {
        ...p,
        model: remoteXl.modelId || p.model,
        ready: true,
      };
    }

    if (hasLiveLocalList && p.model && !localIds.has(p.model)) {
      // Still ready if family match exists for local
      const family = classifyModelFamily(p.model);
      const familyHit = models.items.some(
        (m) => m.provider !== "remote" && m.family === family && m.supportedLocally
      );
      if (!familyHit) {
        return {
          ...p,
          ready: false,
          readinessReason: "Configured model not reported by local ACE-Step /v1/models",
        };
      }
    }
    return { ...p, ready: true };
  });
}

export function getPostprocessHealth() {
  const envEnabled = isPostprocessEnabled();
  const available = ffmpegAvailable();
  const bin = ffmpegBin();
  const fromEnv = Boolean((process.env.FFMPEG_PATH || "").trim());
  const envDefaultPreset = resolvePostFxPreset(null);
  let hint: string | null = null;
  if (!available) {
    hint = ffmpegMissingHint();
  } else if (envEnabled) {
    hint = fromEnv
      ? `Env POSTPROCESS on (default ${envDefaultPreset}) via FFMPEG_PATH.`
      : `Env POSTPROCESS on (default ${envDefaultPreset}); using ffmpeg from PATH.`;
  } else {
    hint = fromEnv
      ? "ffmpeg available via FFMPEG_PATH. Post-FX is optional and off by default in Create."
      : "ffmpeg available on PATH. Post-FX is optional and off by default in Create.";
  }
  return {
    enabled: envEnabled,
    ffmpegAvailable: available,
    ffmpegPathConfigured: fromEnv,
    ffmpegBin: fromEnv ? bin : available ? "ffmpeg" : null,
    defaultPreset: "off" as const,
    envDefaultPreset,
    presets: [
      { id: "off" as const, label: "Off", description: "No post-FX (default)." },
      {
        id: "light" as const,
        label: "Light polish",
        description: "High-pass + gentle presence EQ + soft true-peak limit.",
      },
      {
        id: "loudness" as const,
        label: "Loudness normalize",
        description: "loudnorm to env targets + true-peak limit.",
      },
    ],
    hint,
  };
}

export async function assertModelAvailableOrThrow(model: string | undefined): Promise<void> {
  if (!model) return;
  if (isXlCheckpoint(model) && getLocalVramBudgetGb() <= 12) {
    // XL may still be valid via remote — checked by resolveAceRoute
    const probe = await probeModels();
    const remoteHit = probe.items.some(
      (m) => m.provider === "remote" && m.id === model
    );
    const xlCap = probe.capabilities?.find(
      (c) =>
        (c.id === "remote-xl-sft" || c.id === "remote-xl-turbo") && c.available
    );
    if (!remoteHit && !xlCap) {
      throw new Error(
        "XL checkpoints are not supported on this device (local VRAM budget ~10GB). Configure ACESTEP_REMOTE_URL and QUALITY_TIER=remote-xl-sft when a remote XL endpoint confirms inventory."
      );
    }
    return;
  }
  const probe = await probeModels();
  if (
    probe.source === "env-fallback" ||
    probe.items.filter((m) => m.provider !== "remote").length === 0
  ) {
    return;
  }
  const localItems = probe.items.filter((m) => m.provider !== "remote");
  if (!localItems.some((m) => m.id === model) && !isXlCheckpoint(model)) {
    throw new Error(
      "Model is not available on the ACE-Step worker (GET /v1/models). Check ACESTEP_MODEL_FAST / ACESTEP_MODEL_QUALITY."
    );
  }
  const item = localItems.find((m) => m.id === model);
  if (item && !item.supportedLocally) {
    throw new Error(item.reason || "Model is not supported locally.");
  }
}
