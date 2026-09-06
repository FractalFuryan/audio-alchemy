/**
 * Client-safe model family helpers (no env / Node deps).
 * Used by Create UI + presets registry.
 */

export type ModelFamily = "turbo" | "sft" | "xl" | "unknown";

/** Heuristic: treat checkpoint ids containing xl as needing >10GB. */
export function isXlCheckpoint(modelId: string | undefined | null): boolean {
  if (!modelId) return false;
  const m = modelId.toLowerCase();
  return (
    m.includes("-xl-") ||
    m.includes("_xl_") ||
    m.includes("xl-turbo") ||
    m.includes("xl-sft") ||
    m.includes("xl-base") ||
    m.includes("v15-xl") ||
    m.split(/[^a-z0-9]+/).includes("xl")
  );
}

export function classifyModelFamily(modelId: string | undefined | null): ModelFamily {
  if (!modelId) return "unknown";
  const m = modelId.toLowerCase();
  if (isXlCheckpoint(m)) return "xl";
  if (m.includes("turbo")) return "turbo";
  if (m.includes("sft")) return "sft";
  return "unknown";
}

/** Short label for UI: Turbo / SFT / XL / checkpoint. */
export function modelFamilyLabel(modelId: string | undefined | null): string {
  const family = classifyModelFamily(modelId);
  if (family === "turbo") return "Turbo";
  if (family === "sft") return "SFT";
  if (family === "xl") return "XL";
  return modelId?.trim() || "unknown";
}

/** Official ACE-Step 1.5 defaults for local presets (env overrides win). */
export const DEFAULT_FAST_MODEL = "acestep-v15-turbo";
export const DEFAULT_QUALITY_MODEL = "acestep-v15-sft";
