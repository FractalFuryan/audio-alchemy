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
  isPostprocessEnabled,
} from "./postprocess";

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
  const enabled = isPostprocessEnabled();
  const available = ffmpegAvailable();
  const bin = ffmpegBin();
  const fromEnv = Boolean((process.env.FFMPEG_PATH || "").trim());
  let hint: string | null = null;
  if (enabled && !available) {
    hint =
      "POSTPROCESS is on but ffmpeg was not found. On Windows set FFMPEG_PATH to ffmpeg.exe (WSL ffmpeg is not visible to Windows Node). Post-FX will be skipped.";
  } else if (enabled && available) {
    hint = fromEnv
      ? "Post-FX enabled via FFMPEG_PATH."
      : "Post-FX enabled; using ffmpeg from PATH.";
  }
  return {
    enabled,
    ffmpegAvailable: available,
    ffmpegPathConfigured: fromEnv,
    ffmpegBin: fromEnv ? bin : available ? "ffmpeg" : null,
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
