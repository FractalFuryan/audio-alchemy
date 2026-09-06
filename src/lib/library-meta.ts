/**
 * Pure library helpers: metadata export JSON + variation create payloads.
 * Keep truthful: never present requested model as actual/confirmed.
 */

import type { CreateGenerationInput, Generation, PlanningMode, PostFxPreset, QualityPresetId } from "./types";

export function parseUserTags(raw: string | null | undefined): string[] {
  if (raw == null || raw === "") return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return normalizeTagList(
        parsed.filter((t): t is string => typeof t === "string")
      );
    }
  } catch {
    // fall through: comma-separated
  }
  return normalizeTagList(trimmed.split(","));
}

export function serializeUserTags(tags: string[] | null | undefined): string | null {
  const list = normalizeTagList(tags ?? []);
  return list.length ? JSON.stringify(list) : null;
}

export function normalizeTagList(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim().replace(/\s+/g, " ");
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 32) break;
  }
  return out;
}

export function styleTagsFromGeneration(gen: Pick<Generation, "style">): string[] {
  if (!gen.style?.trim()) return [];
  return normalizeTagList(gen.style.split(","));
}

/** Settings carried into a variation — prompt/style/lyrics/duration/preset (+ optional model). */
export function buildVariationCreateInput(
  gen: Generation,
  opts?: { titlePrefix?: string }
): CreateGenerationInput & { variationOf: string; useRandomSeed: true } {
  const prefix = opts?.titlePrefix ?? "Variation of";
  const baseTitle = gen.title?.trim() || "Untitled";
  const title = baseTitle.toLowerCase().startsWith("variation of")
    ? baseTitle
    : `${prefix} ${baseTitle}`.slice(0, 80);

  const preset: QualityPresetId | undefined =
    gen.preset === "fast" || gen.preset === "quality" ? gen.preset : undefined;

  // Carry requested checkpoint as an optional override only — never invent "actual".
  const model = gen.requestedModelName?.trim() || undefined;

  const postFx: PostFxPreset | undefined =
    gen.postFxPreset === "off" ||
    gen.postFxPreset === "light" ||
    gen.postFxPreset === "loudness"
      ? gen.postFxPreset
      : undefined;

  return {
    prompt: gen.prompt,
    lyrics: gen.lyrics ?? undefined,
    style: gen.style ?? undefined,
    durationSec: gen.durationSec,
    title,
    ...(preset ? { preset } : {}),
    ...(model ? { model } : {}),
    ...(postFx ? { postFxPreset: postFx } : {}),
    variationOf: gen.id,
    useRandomSeed: true,
  };
}

export interface MetadataExportDocument {
  schema: "audio-alchemy.track-metadata.v1";
  id: string;
  title: string;
  prompt: string;
  lyrics: string | null;
  styleTags: string[];
  userTags: string[];
  collection: { id: string; name: string } | null;
  favorite: boolean;
  durationSec: number;
  audioDurationSec: number | null;
  timestamps: {
    createdAt: string;
    updatedAt: string;
  };
  settings: {
    mode: string;
    preset: QualityPresetId | null;
    postFxPreset: PostFxPreset | null;
    provider: string | null;
    seed: string | null;
    bpm: number | null;
    musicalKey: string | null;
    generationMs: number | null;
    planningMode: PlanningMode | null;
  };
  /** Original user prompt when Song focus; else same as prompt. */
  originalPrompt: string | null;
  /** Final submitted music brief (Song focus only). Never includes chain-of-thought. */
  musicBrief: string | null;
  /** Truthful model block — actual* only when confirmed from result. */
  model: {
    requestedModelName: string | null;
    requestedCapability: string | null;
    actualModelName: string | null;
    actualCapability: string | null;
    /** True only when actual model or capability was confirmed. */
    confirmed: boolean;
    /** Display-safe actual id; null when unconfirmed (never copies requested). */
    actualConfirmedModel: string | null;
  };
  generationMetadata: Record<string, unknown> | null;
}

export function parseResultJson(
  raw: string | null | undefined
): Record<string, unknown> | null {
  if (!raw?.trim()) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

export function buildMetadataExport(
  gen: Generation,
  collection?: { id: string; name: string } | null
): MetadataExportDocument {
  const confirmed = Boolean(
    (gen.actualModelName && gen.actualModelName.trim()) ||
      (gen.actualCapability && gen.actualCapability.trim())
  );
  return {
    schema: "audio-alchemy.track-metadata.v1",
    id: gen.id,
    title: gen.title,
    prompt: gen.prompt,
    originalPrompt: gen.originalPrompt ?? (gen.planningMode === "song-focus" ? gen.prompt : null),
    musicBrief: gen.musicBrief,
    lyrics: gen.lyrics,
    styleTags: styleTagsFromGeneration(gen),
    userTags: parseUserTags(gen.userTags),
    collection: collection
      ? { id: collection.id, name: collection.name }
      : gen.collectionId
        ? { id: gen.collectionId, name: "" }
        : null,
    favorite: Boolean(gen.favorite),
    durationSec: gen.durationSec,
    audioDurationSec: gen.audioDurationSec,
    timestamps: {
      createdAt: gen.createdAt,
      updatedAt: gen.updatedAt,
    },
    settings: {
      mode: gen.mode,
      preset: gen.preset,
      postFxPreset: gen.postFxPreset ?? null,
      provider: gen.provider,
      seed: gen.seed,
      bpm: gen.bpm,
      musicalKey: gen.musicalKey,
      generationMs: gen.generationMs,
      planningMode: gen.planningMode,
    },
    model: {
      requestedModelName: gen.requestedModelName,
      requestedCapability: gen.requestedCapability,
      actualModelName: gen.actualModelName,
      actualCapability: gen.actualCapability,
      confirmed,
      actualConfirmedModel: confirmed
        ? gen.actualModelName?.trim() || null
        : null,
    },
    generationMetadata: parseResultJson(gen.resultJson),
  };
}

/** Filename-safe stem for metadata download. */
export function metadataExportFilename(gen: Pick<Generation, "id" | "title">): string {
  const stem = (gen.title || "track")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${stem || "track"}-${gen.id.slice(0, 8)}.metadata.json`;
}
