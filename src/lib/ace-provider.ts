/**
 * Provider-neutral ACE routing: local ACESTEP_API_URL vs optional remote XL endpoint.
 * Outbound client only — does not expose David's home GPU.
 */

import { createAceStepClient, type AceStepClient } from "./ace-step-client";
import {
  ALL_CAPABILITY_IDS,
  capabilityFromModelId,
  detectCapabilitiesFromInventory,
  getQualityTier,
  type AceCapabilityId,
  type AceCapabilityStatus,
  type QualityTier,
} from "./ace-capabilities";
import {
  DEFAULT_FAST_MODEL,
  DEFAULT_QUALITY_MODEL,
  isXlCheckpoint,
} from "./model-family";

export type AceProviderKind = "local" | "remote";

export interface AceEndpointConfig {
  kind: AceProviderKind;
  baseUrl: string;
  apiKey?: string;
  hfToken?: string;
  /** True when URL is set in env. */
  configured: boolean;
}

export interface AceRouteResolution {
  provider: AceProviderKind;
  baseUrl: string;
  model: string;
  capability: AceCapabilityId;
  inferenceSteps: number;
}

export class AceRouteError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "AceRouteError";
    this.status = status;
  }
}

function envString(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v || undefined;
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Local ACE worker (default RTX 3080 path). */
export function getLocalEndpoint(): AceEndpointConfig {
  const baseUrl = envString("ACESTEP_API_URL") || "http://127.0.0.1:8001";
  return {
    kind: "local",
    baseUrl,
    apiKey: envString("ACESTEP_API_KEY"),
    hfToken: envString("HF_TOKEN"),
    configured: Boolean(envString("ACESTEP_API_URL")),
  };
}

/**
 * Optional remote XL endpoint (pull/client outbound only).
 * Accepts ACESTEP_REMOTE_URL or ACESTEP_XL_API_URL.
 */
export function getRemoteEndpoint(): AceEndpointConfig {
  const baseUrl =
    envString("ACESTEP_REMOTE_URL") ||
    envString("ACESTEP_XL_API_URL") ||
    "";
  return {
    kind: "remote",
    baseUrl,
    apiKey:
      envString("ACESTEP_REMOTE_API_KEY") ||
      envString("ACESTEP_XL_API_KEY") ||
      envString("ACESTEP_API_KEY"),
    hfToken: envString("HF_TOKEN"),
    configured: Boolean(baseUrl),
  };
}

export function createClientForEndpoint(ep: AceEndpointConfig): AceStepClient {
  return createAceStepClient({
    baseUrl: ep.baseUrl,
    apiKey: ep.apiKey,
    hfToken: ep.hfToken,
  });
}

export function getDefaultLocalFastModel(): string {
  return (
    envString("ACESTEP_MODEL_FAST") ||
    envString("ACESTEP_MODEL") ||
    DEFAULT_FAST_MODEL
  );
}

export function getDefaultLocalQualityModel(): string {
  return (
    envString("ACESTEP_MODEL_QUALITY") ||
    envString("ACESTEP_MODEL") ||
    DEFAULT_QUALITY_MODEL
  );
}

/** Default XL SFT checkpoint id for remote quality path. */
export function getDefaultRemoteXlSftModel(): string {
  return (
    envString("ACESTEP_MODEL_REMOTE_QUALITY") ||
    envString("ACESTEP_MODEL_XL") ||
    envString("ACESTEP_MODEL_XL_SFT") ||
    "acestep-v15-xl-sft"
  );
}

export function getDefaultRemoteXlTurboModel(): string {
  return (
    envString("ACESTEP_MODEL_REMOTE_FAST") ||
    envString("ACESTEP_MODEL_XL_TURBO") ||
    "acestep-v15-xl-turbo"
  );
}

export interface ProviderInventory {
  local: { reachable: boolean; models: string[]; source: string };
  remote: {
    configured: boolean;
    reachable: boolean;
    models: string[];
    source: string;
  };
}

export async function probeProviderInventory(): Promise<ProviderInventory> {
  const localEp = getLocalEndpoint();
  const remoteEp = getRemoteEndpoint();

  const local = await probeOne(localEp);
  const remote = remoteEp.configured
    ? await probeOne(remoteEp)
    : { reachable: false, models: [] as string[], source: "not-configured" };

  return {
    local: {
      reachable: local.reachable,
      models: local.models,
      source: local.source,
    },
    remote: {
      configured: remoteEp.configured,
      reachable: remote.reachable,
      models: remote.models,
      source: remote.source,
    },
  };
}

async function probeOne(
  ep: AceEndpointConfig
): Promise<{ reachable: boolean; models: string[]; source: string }> {
  if (!ep.baseUrl) {
    return { reachable: false, models: [], source: "not-configured" };
  }
  try {
    const client = createClientForEndpoint(ep);
    const models = await client.listModels();
    if (models.length > 0) {
      return { reachable: true, models, source: `${ep.kind}:/v1/models` };
    }
    const healthy = await client.health();
    return {
      reachable: healthy,
      models: [],
      source: healthy ? `${ep.kind}:health-only` : `${ep.kind}:unreachable`,
    };
  } catch {
    return { reachable: false, models: [], source: `${ep.kind}:error` };
  }
}

/**
 * Build capability status list: configured vs available from inventory + env.
 */
export function buildCapabilityStatuses(
  inventory: ProviderInventory,
  tier: QualityTier = getQualityTier()
): AceCapabilityStatus[] {
  const localMap = detectCapabilitiesFromInventory(inventory.local.models, "local");
  const remoteMap = detectCapabilitiesFromInventory(inventory.remote.models, "remote");

  const localConfigured = true; // local path always configured as product default
  const remoteConfigured = inventory.remote.configured;
  const remoteXlConfigured = remoteConfigured && tier === "remote-xl-sft";

  const statuses: AceCapabilityStatus[] = ALL_CAPABILITY_IDS.map((id) => {
    if (id === "local-2b-turbo") {
      const modelId =
        localMap.get(id) ||
        (inventory.local.reachable ? getDefaultLocalFastModel() : null);
      const inInventory = localMap.has(id);
      const available =
        inventory.local.reachable &&
        (inInventory ||
          (inventory.local.models.length === 0 &&
            Boolean(getDefaultLocalFastModel())));
      return {
        id,
        configured: localConfigured,
        available: Boolean(available && !isXlCheckpoint(modelId || undefined)),
        modelId: modelId || getDefaultLocalFastModel(),
        reason: available
          ? undefined
          : inventory.local.reachable
            ? "Turbo not reported in local inventory"
            : "Local ACE unreachable",
      };
    }
    if (id === "local-2b-sft") {
      const modelId =
        localMap.get(id) ||
        (inventory.local.reachable ? getDefaultLocalQualityModel() : null);
      const inInventory = localMap.has(id);
      const available =
        inventory.local.reachable &&
        (inInventory ||
          (inventory.local.models.length === 0 &&
            Boolean(getDefaultLocalQualityModel())));
      return {
        id,
        configured: localConfigured,
        available: Boolean(available && !isXlCheckpoint(modelId || undefined)),
        modelId: modelId || getDefaultLocalQualityModel(),
        reason: available
          ? undefined
          : inventory.local.reachable
            ? "SFT not reported in local inventory"
            : "Local ACE unreachable",
      };
    }
    if (id === "remote-xl-sft") {
      const modelId = remoteMap.get(id) || getDefaultRemoteXlSftModel();
      const inInventory = remoteMap.has(id);
      // Available only when remote health/inventory confirms XL-SFT class
      const available =
        remoteConfigured && inventory.remote.reachable && inInventory;
      return {
        id,
        configured: remoteConfigured || remoteXlConfigured,
        available,
        modelId: remoteConfigured ? modelId : null,
        reason: !remoteConfigured
          ? "ACESTEP_REMOTE_URL / ACESTEP_XL_API_URL not set"
          : !inventory.remote.reachable
            ? "Remote ACE endpoint unreachable"
            : !inInventory
              ? "Remote inventory does not confirm XL-SFT loaded"
              : undefined,
      };
    }
    // remote-xl-turbo
    const modelId = remoteMap.get(id) || getDefaultRemoteXlTurboModel();
    const inInventory = remoteMap.has(id);
    const available =
      remoteConfigured && inventory.remote.reachable && inInventory;
    return {
      id,
      configured: remoteConfigured,
      available,
      modelId: remoteConfigured ? modelId : null,
      reason: !remoteConfigured
        ? "Remote endpoint not configured"
        : !inventory.remote.reachable
          ? "Remote ACE endpoint unreachable"
          : !inInventory
            ? "Remote inventory does not confirm XL-Turbo loaded"
            : undefined,
    };
  });

  return statuses;
}

export interface RouteInput {
  preset: "fast" | "quality";
  /** Explicit model override from Advanced form. */
  modelOverride?: string;
  capabilities?: AceCapabilityStatus[];
  inventory?: ProviderInventory;
}

/**
 * Resolve which endpoint + model + capability to use.
 * Never silently falls back from remote-xl to local while labeling as XL.
 */
export function resolveAceRoute(input: RouteInput): AceRouteResolution {
  const tier = getQualityTier();
  const localEp = getLocalEndpoint();
  const remoteEp = getRemoteEndpoint();
  const caps =
    input.capabilities ??
    buildCapabilityStatuses(
      input.inventory ?? {
        local: { reachable: true, models: [], source: "assumed" },
        remote: {
          configured: remoteEp.configured,
          reachable: false,
          models: [],
          source: "assumed",
        },
      },
      tier
    );

  const capById = new Map(caps.map((c) => [c.id, c]));

  // Explicit override: if XL and tier/local policy, route carefully
  if (input.modelOverride?.trim()) {
    const model = input.modelOverride.trim();
    if (isXlCheckpoint(model)) {
      const xlCap =
        capabilityFromModelId(model, "remote") ||
        (model.toLowerCase().includes("turbo")
          ? "remote-xl-turbo"
          : "remote-xl-sft");
      const status = capById.get(xlCap);
      if (!remoteEp.configured) {
        throw new AceRouteError(
          "XL model requested but no remote endpoint configured (set ACESTEP_REMOTE_URL). Local 10GB GPU does not run XL.",
          400
        );
      }
      if (status && !status.available) {
        throw new AceRouteError(
          status.reason ||
            `Remote XL path unavailable (${xlCap}). Will not fall back to local and label as XL.`,
          503
        );
      }
      if (!status?.available) {
        throw new AceRouteError(
          `Remote health does not confirm ${xlCap} available. Refusing silent local fallback.`,
          503
        );
      }
      return {
        provider: "remote",
        baseUrl: remoteEp.baseUrl,
        model,
        capability: xlCap,
        inferenceSteps:
          input.preset === "fast"
            ? envInt("ACESTEP_FAST_INFERENCE_STEPS", 8, 1, 100)
            : envInt("ACESTEP_QUALITY_INFERENCE_STEPS", 32, 1, 100),
      };
    }
    // Non-XL override → local
    const cap =
      capabilityFromModelId(model, "local") ||
      (input.preset === "fast" ? "local-2b-turbo" : "local-2b-sft");
    return {
      provider: "local",
      baseUrl: localEp.baseUrl,
      model,
      capability: cap,
      inferenceSteps:
        input.preset === "fast"
          ? envInt("ACESTEP_FAST_INFERENCE_STEPS", 8, 1, 100)
          : envInt("ACESTEP_QUALITY_INFERENCE_STEPS", 32, 1, 100),
    };
  }

  if (input.preset === "fast") {
    const model = getDefaultLocalFastModel();
    return {
      provider: "local",
      baseUrl: localEp.baseUrl,
      model,
      capability: "local-2b-turbo",
      inferenceSteps: envInt("ACESTEP_FAST_INFERENCE_STEPS", 8, 1, 100),
    };
  }

  // Quality preset
  if (tier === "remote-xl-sft") {
    const xl = capById.get("remote-xl-sft");
    if (!remoteEp.configured) {
      throw new AceRouteError(
        "QUALITY_TIER=remote-xl-sft but ACESTEP_REMOTE_URL (or ACESTEP_XL_API_URL) is not set. Quality/XL path unavailable.",
        503
      );
    }
    if (!xl?.available) {
      throw new AceRouteError(
        xl?.reason ||
          "QUALITY_TIER=remote-xl-sft but remote health does not confirm XL-SFT loaded. Refusing to use local SFT labeled as XL.",
        503
      );
    }
    return {
      provider: "remote",
      baseUrl: remoteEp.baseUrl,
      model: xl.modelId || getDefaultRemoteXlSftModel(),
      capability: "remote-xl-sft",
      inferenceSteps: envInt("ACESTEP_QUALITY_INFERENCE_STEPS", 32, 1, 100),
    };
  }

  // Default local-sft quality path
  const model = getDefaultLocalQualityModel();
  if (isXlCheckpoint(model)) {
    throw new AceRouteError(
      "Local Quality model resolves to an XL checkpoint. Use ACESTEP_MODEL_QUALITY=acestep-v15-sft on 10GB, or configure QUALITY_TIER=remote-xl-sft with a remote endpoint.",
      400
    );
  }
  return {
    provider: "local",
    baseUrl: localEp.baseUrl,
    model,
    capability: "local-2b-sft",
    inferenceSteps: envInt("ACESTEP_QUALITY_INFERENCE_STEPS", 32, 1, 100),
  };
}

/** Safe summary for /api/health (no secrets). */
export function getProviderSafeSummary(inventory: ProviderInventory) {
  const tier = getQualityTier();
  const local = getLocalEndpoint();
  const remote = getRemoteEndpoint();
  const capabilities = buildCapabilityStatuses(inventory, tier);
  return {
    qualityTier: tier,
    local: {
      configured: local.configured || true,
      reachable: inventory.local.reachable,
      urlHost: safeHost(local.baseUrl),
      modelsSource: inventory.local.source,
    },
    remote: {
      configured: remote.configured,
      reachable: inventory.remote.reachable,
      urlHost: remote.configured ? safeHost(remote.baseUrl) : null,
      modelsSource: inventory.remote.source,
      hasApiKey: Boolean(
        envString("ACESTEP_REMOTE_API_KEY") ||
          envString("ACESTEP_XL_API_KEY") ||
          envString("ACESTEP_API_KEY") ||
          envString("HF_TOKEN")
      ),
    },
    capabilities,
  };
}

function safeHost(url: string): string | null {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

export function clientForRoute(route: AceRouteResolution): AceStepClient {
  const ep =
    route.provider === "remote" ? getRemoteEndpoint() : getLocalEndpoint();
  return createClientForEndpoint({
    ...ep,
    baseUrl: route.baseUrl || ep.baseUrl,
  });
}
