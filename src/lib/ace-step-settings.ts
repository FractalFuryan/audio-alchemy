/**
 * ACE-Step inference settings for RTX 3080 10GB-friendly defaults.
 * Secrets (ACESTEP_API_KEY, HF_TOKEN) are never exposed via getSafeSettingsSummary().
 */

export type AceStepAudioFormat = "mp3" | "wav" | "flac" | "opus" | "aac";

export interface AceStepInferenceSettings {
  model?: string;
  inferenceSteps: number;
  audioFormat: AceStepAudioFormat;
  batchSize: number;
  thinking: boolean;
  pollIntervalMs: number;
  timeoutMs: number;
}

/** Optional per-request overrides from Create form (POST body only; never read from browser env). */
export interface AceStepSettingsOverrides {
  model?: string;
  inferenceSteps?: number;
  audioFormat?: AceStepAudioFormat;
  batchSize?: number;
  thinking?: boolean;
}

const AUDIO_FORMATS = new Set<AceStepAudioFormat>([
  "mp3",
  "wav",
  "flac",
  "opus",
  "aac",
]);

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

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw == null || raw === "") return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function parseAudioFormat(raw: string | undefined, fallback: AceStepAudioFormat): AceStepAudioFormat {
  if (!raw) return fallback;
  const lower = raw.trim().toLowerCase() as AceStepAudioFormat;
  return AUDIO_FORMATS.has(lower) ? lower : fallback;
}

/** Defaults tuned for ~10GB VRAM (modest steps, batch 1, no thinking). */
export function getAceStepEnvSettings(): AceStepInferenceSettings {
  return {
    model: envString("ACESTEP_MODEL"),
    inferenceSteps: envInt("ACESTEP_INFERENCE_STEPS", 8, 1, 100),
    audioFormat: parseAudioFormat(envString("ACESTEP_AUDIO_FORMAT"), "mp3"),
    batchSize: envInt("ACESTEP_BATCH_SIZE", 1, 1, 4),
    thinking: envBool("ACESTEP_THINKING", false),
    pollIntervalMs: envInt("ACESTEP_POLL_INTERVAL_MS", 2000, 500, 30_000),
    timeoutMs: envInt("ACESTEP_TIMEOUT_MS", 10 * 60 * 1000, 30_000, 60 * 60 * 1000),
  };
}

export function mergeAceStepSettings(
  overrides?: AceStepSettingsOverrides | null
): AceStepInferenceSettings {
  const base = getAceStepEnvSettings();
  if (!overrides) return base;

  const next: AceStepInferenceSettings = { ...base };

  if (typeof overrides.model === "string") {
    const m = overrides.model.trim();
    next.model = m || undefined;
  }
  if (overrides.inferenceSteps != null && Number.isFinite(overrides.inferenceSteps)) {
    next.inferenceSteps = Math.min(100, Math.max(1, Math.round(overrides.inferenceSteps)));
  }
  if (typeof overrides.audioFormat === "string") {
    next.audioFormat = parseAudioFormat(overrides.audioFormat, base.audioFormat);
  }
  if (overrides.batchSize != null && Number.isFinite(overrides.batchSize)) {
    // Cap hard at 1 for 10GB by default path; allow override up to 4 if explicit.
    next.batchSize = Math.min(4, Math.max(1, Math.round(overrides.batchSize)));
  }
  if (typeof overrides.thinking === "boolean") {
    next.thinking = overrides.thinking;
  }
  return next;
}

/** Parse optional Advanced fields from a JSON POST body (no secrets). */
export function parseAceStepOverridesFromBody(
  body: Record<string, unknown>
): AceStepSettingsOverrides | undefined {
  const out: AceStepSettingsOverrides = {};
  let any = false;

  if (typeof body.model === "string" && body.model.trim()) {
    out.model = body.model.trim();
    any = true;
  }
  if (body.inferenceSteps != null || body.inference_steps != null) {
    const n = Number(body.inferenceSteps ?? body.inference_steps);
    if (Number.isFinite(n)) {
      out.inferenceSteps = n;
      any = true;
    }
  }
  if (typeof body.audioFormat === "string" || typeof body.audio_format === "string") {
    const raw = String(body.audioFormat ?? body.audio_format);
    out.audioFormat = parseAudioFormat(raw, "mp3");
    any = true;
  }
  if (body.batchSize != null || body.batch_size != null) {
    const n = Number(body.batchSize ?? body.batch_size);
    if (Number.isFinite(n)) {
      out.batchSize = n;
      any = true;
    }
  }
  if (typeof body.thinking === "boolean") {
    out.thinking = body.thinking;
    any = true;
  } else if (typeof body.thinking === "string") {
    const t = body.thinking.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(t)) {
      out.thinking = true;
      any = true;
    } else if (["0", "false", "no", "off"].includes(t)) {
      out.thinking = false;
      any = true;
    }
  }

  return any ? out : undefined;
}

/** Safe summary for /api/health — booleans + numeric settings only, never keys/tokens. */
export function getSafeSettingsSummary(busy = false): {
  modelConfigured: boolean;
  model: string | null;
  inferenceSteps: number;
  audioFormat: AceStepAudioFormat;
  batchSize: number;
  thinking: boolean;
  pollIntervalMs: number;
  timeoutMs: number;
  singleFlight: true;
  busy: boolean;
  hasApiKey: boolean;
} {
  const s = getAceStepEnvSettings();
  return {
    modelConfigured: Boolean(s.model),
    model: s.model ?? null,
    inferenceSteps: s.inferenceSteps,
    audioFormat: s.audioFormat,
    batchSize: s.batchSize,
    thinking: s.thinking,
    pollIntervalMs: s.pollIntervalMs,
    timeoutMs: s.timeoutMs,
    singleFlight: true,
    busy,
    // Boolean only — never the key value
    hasApiKey: Boolean(envString("ACESTEP_API_KEY") || envString("HF_TOKEN")),
  };
}
