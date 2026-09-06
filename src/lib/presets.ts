/**
 * Fast vs Quality preset registry for local ACE-Step on ~10GB VRAM.
 * Ownership-first product; not legal advice. No XL on 10GB.
 */

import type { AceStepInferenceSettings } from "./ace-step-settings";
import { getAceStepEnvSettings } from "./ace-step-settings";
import {
  classifyModelFamily as classifyFamily,
  DEFAULT_FAST_MODEL,
  DEFAULT_QUALITY_MODEL,
  isXlCheckpoint,
  type ModelFamily,
} from "./model-family";

export type QualityPresetId = "fast" | "quality";

export {
  DEFAULT_FAST_MODEL,
  DEFAULT_QUALITY_MODEL,
  isXlCheckpoint,
} from "./model-family";

export interface PresetDefinition {
  id: QualityPresetId;
  label: string;
  description: string;
  model: string | undefined;
  inferenceSteps: number;
  batchSize: 1;
  thinking: false;
  audioFormat: AceStepInferenceSettings["audioFormat"];
}

export interface ResolvedPreset extends PresetDefinition {
  /** True when a model id is resolved (env or built-in default). */
  modelConfigured: boolean;
  /** False for XL / oversized checkpoints under local VRAM policy. */
  supportedLocally: boolean;
  unsupportedReason?: string;
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

export function getLocalVramBudgetGb(): number {
  return envInt("ACESTEP_LOCAL_VRAM_GB", 10, 4, 80);
}

export function parsePresetId(raw: unknown): QualityPresetId | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "fast" || v === "quality") return v;
  return undefined;
}

export function getDefaultPresetId(): QualityPresetId {
  return parsePresetId(process.env.ACESTEP_PRESET_DEFAULT) ?? "fast";
}

function modelForPreset(id: QualityPresetId): string | undefined {
  if (id === "fast") {
    return (
      envString("ACESTEP_MODEL_FAST") ||
      envString("ACESTEP_MODEL") ||
      DEFAULT_FAST_MODEL
    );
  }
  return (
    envString("ACESTEP_MODEL_QUALITY") ||
    envString("ACESTEP_MODEL") ||
    DEFAULT_QUALITY_MODEL
  );
}

export function getPresetDefinition(id: QualityPresetId): PresetDefinition {
  const base = getAceStepEnvSettings();
  if (id === "fast") {
    return {
      id: "fast",
      label: "Fast",
      description: "Turbo checkpoint (acestep-v15-turbo class), low latency, batch 1.",
      model: modelForPreset("fast"),
      inferenceSteps: envInt("ACESTEP_FAST_INFERENCE_STEPS", 8, 1, 100),
      batchSize: 1,
      thinking: false,
      audioFormat: base.audioFormat,
    };
  }
  return {
    id: "quality",
    label: "Quality",
    description: "SFT checkpoint (acestep-v15-sft), higher fidelity, slower, batch 1.",
    model: modelForPreset("quality"),
    inferenceSteps: envInt("ACESTEP_QUALITY_INFERENCE_STEPS", 32, 1, 100),
    batchSize: 1,
    thinking: false,
    audioFormat: base.audioFormat,
  };
}

export function resolvePreset(id: QualityPresetId): ResolvedPreset {
  const def = getPresetDefinition(id);
  const xl = isXlCheckpoint(def.model);
  const vram = getLocalVramBudgetGb();
  if (xl && vram <= 12) {
    return {
      ...def,
      modelConfigured: Boolean(def.model),
      supportedLocally: false,
      unsupportedReason: "XL checkpoints are not supported on the local 10GB VRAM budget",
    };
  }
  return {
    ...def,
    modelConfigured: Boolean(def.model),
    supportedLocally: true,
  };
}

export function listResolvedPresets(): ResolvedPreset[] {
  return [resolvePreset("fast"), resolvePreset("quality")];
}

export interface PresetResolveInput {
  preset?: QualityPresetId;
  model?: string;
  inferenceSteps?: number;
  audioFormat?: AceStepInferenceSettings["audioFormat"];
  batchSize?: number;
  thinking?: boolean;
}

export class PresetResolutionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "PresetResolutionError";
    this.status = status;
  }
}

/**
 * Merge preset defaults with optional Advanced overrides.
 * Forces batchSize 1 and blocks XL under local VRAM policy.
 */
export function resolveInferenceFromPreset(input: PresetResolveInput = {}): AceStepInferenceSettings & {
  preset: QualityPresetId;
} {
  const presetId = input.preset ?? getDefaultPresetId();
  const preset = resolvePreset(presetId);
  const base = getAceStepEnvSettings();

  const model =
    (input.model?.trim() || preset.model || base.model)?.trim() || undefined;
  const inferenceSteps =
    input.inferenceSteps != null && Number.isFinite(input.inferenceSteps)
      ? Math.min(100, Math.max(1, Math.round(input.inferenceSteps)))
      : preset.inferenceSteps;
  const audioFormat = input.audioFormat ?? preset.audioFormat ?? base.audioFormat;
  const batchSize = 1 as const;
  const thinking = false as const;

  if (isXlCheckpoint(model) && getLocalVramBudgetGb() <= 12) {
    throw new PresetResolutionError(
      "XL checkpoints are not supported on this device (local VRAM budget ~10GB). Use Fast (Turbo) or Quality (SFT).",
      400
    );
  }

  if (!model) {
    throw new PresetResolutionError(
      `${presetId === "fast" ? "Fast" : "Quality"} preset resolved an empty model id. Check ACESTEP_MODEL_FAST / ACESTEP_MODEL_QUALITY.`,
      400
    );
  }

  return {
    preset: presetId,
    model,
    inferenceSteps,
    audioFormat,
    batchSize,
    thinking,
    pollIntervalMs: base.pollIntervalMs,
    timeoutMs: base.timeoutMs,
  };
}

/** Map to probe family ids used by /api/health models list. */
export function classifyModelFamily(
  modelId: string
): "2b-turbo" | "2b-sft" | "xl" | "unknown" {
  const family: ModelFamily = classifyFamily(modelId);
  if (family === "turbo") return "2b-turbo";
  if (family === "sft") return "2b-sft";
  if (family === "xl") return "xl";
  return "unknown";
}
