/**
 * Provider-neutral ACE capability ids.
 * Local 10GB default: local-2b-sft / local-2b-turbo only.
 * Remote XL: remote-xl-sft / remote-xl-turbo when a configured endpoint confirms inventory.
 */

import {
  classifyModelFamily,
  isXlCheckpoint,
  type ModelFamily,
} from "./model-family";

export type AceCapabilityId =
  | "local-2b-sft"
  | "local-2b-turbo"
  | "remote-xl-sft"
  | "remote-xl-turbo";

export type QualityTier = "local-sft" | "remote-xl-sft";

export const ALL_CAPABILITY_IDS: AceCapabilityId[] = [
  "local-2b-sft",
  "local-2b-turbo",
  "remote-xl-sft",
  "remote-xl-turbo",
];

export interface AceCapabilityStatus {
  id: AceCapabilityId;
  /** Env / tier configured so this path could be selected. */
  configured: boolean;
  /** Health + inventory confirm the checkpoint class is loaded. */
  available: boolean;
  /** Example model id from inventory (or configured default). */
  modelId?: string | null;
  reason?: string;
}

/** Map a raw ACE model / inventory string to a ModelFamily. */
export function familyFromInventoryString(modelId: string): ModelFamily {
  return classifyModelFamily(modelId);
}

/**
 * Map inventory model id + provider location to a capability id.
 * Local non-XL → local-2b-*; remote XL → remote-xl-*; otherwise null.
 */
export function capabilityFromModelId(
  modelId: string | undefined | null,
  location: "local" | "remote"
): AceCapabilityId | null {
  if (!modelId?.trim()) return null;
  const family = classifyModelFamily(modelId);
  const xl = isXlCheckpoint(modelId);

  if (location === "local") {
    if (xl) return null; // XL is never a local capability on 10GB policy
    if (family === "turbo") return "local-2b-turbo";
    if (family === "sft") return "local-2b-sft";
    return null;
  }

  // remote
  if (!xl) {
    // Remote may also serve 2B, but our capability ids for remote are XL-only by design.
    return null;
  }
  if (family === "turbo" || modelId.toLowerCase().includes("turbo")) {
    return "remote-xl-turbo";
  }
  // XL SFT / XL base / generic XL → treat as remote-xl-sft quality path
  return "remote-xl-sft";
}

/** Detect which capabilities appear in a list of model ids for a location. */
export function detectCapabilitiesFromInventory(
  modelIds: string[],
  location: "local" | "remote"
): Map<AceCapabilityId, string> {
  const found = new Map<AceCapabilityId, string>();
  for (const id of modelIds) {
    const cap = capabilityFromModelId(id, location);
    if (cap && !found.has(cap)) found.set(cap, id);
  }
  return found;
}

export function parseQualityTier(raw: unknown): QualityTier {
  if (typeof raw !== "string") return "local-sft";
  const v = raw.trim().toLowerCase();
  if (v === "remote-xl-sft" || v === "remote_xl_sft" || v === "remote-xl") {
    return "remote-xl-sft";
  }
  return "local-sft";
}

export function getQualityTier(): QualityTier {
  return parseQualityTier(process.env.QUALITY_TIER);
}

/** Short UI family label from a capability id (Turbo / SFT / XL). */
export function capabilityFamilyLabel(cap: AceCapabilityId | null | undefined): string {
  if (!cap) return "unknown";
  if (cap.includes("turbo")) return "Turbo";
  if (cap.includes("xl")) return "XL";
  if (cap.includes("sft")) return "SFT";
  return "unknown";
}

/**
 * Truthful display: only treat actual* as confirmed.
 * Until actual is set, UI must not present requested as the model that ran.
 */
export function resolveDisplayModelLabel(input: {
  requestedModelName?: string | null;
  actualModelName?: string | null;
  requestedCapability?: string | null;
  actualCapability?: string | null;
  status?: string | null;
}): {
  confirmed: boolean;
  familyLabel: string;
  modelLabel: string | null;
  detail: string;
} {
  const actualCap = (input.actualCapability || "").trim() || null;
  const actualModel = (input.actualModelName || "").trim() || null;
  const reqCap = (input.requestedCapability || "").trim() || null;
  const reqModel = (input.requestedModelName || "").trim() || null;

  if (actualCap || actualModel) {
    const family = actualCap
      ? capabilityFamilyLabel(actualCap as AceCapabilityId)
      : classifyModelFamily(actualModel) === "turbo"
        ? "Turbo"
        : classifyModelFamily(actualModel) === "sft"
          ? "SFT"
          : classifyModelFamily(actualModel) === "xl"
            ? "XL"
            : "unknown";
    return {
      confirmed: true,
      familyLabel: family,
      modelLabel: actualModel,
      detail: actualModel
        ? `${family} (${actualModel})`
        : `${family}${actualCap ? ` · ${actualCap}` : ""}`,
    };
  }

  const reqFamily = reqCap
    ? capabilityFamilyLabel(reqCap as AceCapabilityId)
    : reqModel
      ? classifyModelFamily(reqModel) === "turbo"
        ? "Turbo"
        : classifyModelFamily(reqModel) === "sft"
          ? "SFT"
          : classifyModelFamily(reqModel) === "xl"
            ? "XL"
            : "unknown"
      : "unknown";

  const pending =
    input.status === "completed"
      ? "actual model unconfirmed"
      : "requested (not yet confirmed)";

  return {
    confirmed: false,
    familyLabel: reqFamily,
    modelLabel: null,
    detail: reqModel
      ? `Requested ${reqFamily} (${reqModel}) — ${pending}`
      : reqCap
        ? `Requested ${reqFamily} (${reqCap}) — ${pending}`
        : pending,
  };
}
