/**
 * Client-safe helpers for Create-screen health truthfulness (Phase 6).
 * No Node / env deps — safe to import from client components and unit tests.
 */

import { classifyModelFamily } from "./model-family";

export type EnginePillState =
  | "checking"
  | "generating"
  | "ready"
  | "unavailable";

export function resolveEnginePillState(input: {
  loading: boolean;
  generating: boolean;
  mode?: "mock" | "ace-step" | null;
  aceStep?: boolean;
}): EnginePillState {
  if (input.generating) return "generating";
  if (input.loading || input.mode == null) return "checking";
  if (input.mode === "ace-step" && input.aceStep) return "ready";
  if (input.mode === "ace-step" && !input.aceStep) return "unavailable";
  if (input.mode === "mock") return "ready";
  return "checking";
}

export function enginePillLabel(state: EnginePillState): string {
  switch (state) {
    case "generating":
      return "Generating";
    case "ready":
      return "Local engine ready";
    case "unavailable":
      return "Engine unavailable";
    default:
      return "Checking local engine…";
  }
}

export function inventoryHasSft(input: {
  models?: { items?: Array<{ id: string }> | null } | null;
  presets?: {
    items?: Array<{ id: string; model?: string }> | null;
  } | null;
}): boolean {
  const items = input.models?.items || [];
  if (items.some((m) => classifyModelFamily(m.id) === "sft")) return true;
  const qualityItem = input.presets?.items?.find((x) => x.id === "quality");
  const qualityModel = qualityItem?.model;
  if (qualityModel && classifyModelFamily(qualityModel) === "sft") {
    if (items.some((m) => m.id === qualityModel)) return true;
  }
  return false;
}

/** Quality segment helper text — never says "unconfirmed" when SFT is present. */
export function qualitySegmentHint(input: {
  loading: boolean;
  sftAvailable: boolean;
}): string {
  if (input.loading) return "Checking local engine…";
  if (input.sftAvailable) return "SFT · higher fidelity";
  return "More steps · higher fidelity";
}

/** Song focus blocked only after health is known and planner is not confirmed. */
export function isSongFocusBlocked(input: {
  planningMode: "direct" | "song-focus";
  healthLoading: boolean;
  healthKnown: boolean;
  plannerAvailable: boolean;
  mode?: "mock" | "ace-step" | null;
}): boolean {
  if (input.planningMode !== "song-focus") return false;
  if (input.healthLoading || !input.healthKnown) return false;
  if (!input.plannerAvailable) return true;
  if (input.mode !== "ace-step") return true;
  return false;
}
