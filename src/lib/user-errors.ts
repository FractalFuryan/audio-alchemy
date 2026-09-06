/**
 * Map internal / low-level errors to actionable local-user messages.
 * Never include secrets or unnecessary absolute paths.
 */

export type ActionableErrorCode =
  | "ace_offline"
  | "model_unavailable"
  | "gpu_busy"
  | "missing_audio"
  | "disk_full"
  | "write_failed"
  | "not_found"
  | "validation"
  | "cancelled"
  | "timeout"
  | "unknown";

export interface ActionableError {
  code: ActionableErrorCode;
  /** Short user-facing message. */
  message: string;
  /** Optional next step. */
  hint?: string;
  /** Original message (redacted) for logs / advanced. */
  detail?: string;
}

const ABS_PATH_RE = /(?:[A-Za-z]:\\|\/(?:home|Users|var|tmp|private)\/)[^\s"'`)\]},]+/g;

/** Strip home / absolute filesystem paths from user-visible strings. */
export function redactPaths(text: string): string {
  return text.replace(ABS_PATH_RE, "[path]");
}

function baseMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Something went wrong";
}

export function formatActionableError(err: unknown): ActionableError {
  const raw = redactPaths(baseMessage(err));
  const lower = raw.toLowerCase();

  if (
    /busy|single-flight|only one generation/i.test(raw) ||
    /gpu busy/i.test(raw)
  ) {
    return {
      code: "gpu_busy",
      message: "GPU is busy with another generation.",
      hint: "Only one ACE-Step job runs at a time (single-flight protects ~10GB VRAM). Wait or cancel the other job, then retry.",
      detail: raw,
    };
  }

  if (
    /enospc|no space left|disk.?full|edquot/i.test(lower) ||
    /ENOSPC/.test(String(err instanceof Error ? err.message : err))
  ) {
    return {
      code: "disk_full",
      message: "Not enough free disk space to save audio or library data.",
      hint: "Free space under your data directory (./data), then retry. You can export and prune old tracks from Library.",
      detail: raw,
    };
  }

  if (/eacces|eperm|read-only file system|erofs|permission denied/i.test(lower)) {
    return {
      code: "write_failed",
      message: "Could not write files to the local data directory.",
      hint: "Check that the process can write to ./data (and DATA_DIR if set). On Windows, avoid protected folders.",
      detail: raw,
    };
  }

  if (
    /audio file missing|missing audio|no audio file|audio not ready/i.test(raw)
  ) {
    return {
      code: "missing_audio",
      message: "Audio file is missing for this track.",
      hint: "The library row exists but the file under ./data/audio is gone. Re-generate, or restore from a library backup.",
      detail: raw,
    };
  }

  if (/not found/i.test(raw) && /generation|track|collection/i.test(raw)) {
    return {
      code: "not_found",
      message: "That track or collection was not found.",
      hint: "Refresh the library. It may have been deleted or never finished saving.",
      detail: raw,
    };
  }

  if (
    /unreachable|econnrefused|fetch failed|network|ace-step.*(down|offline|health)|api.*(down|unreachable)/i.test(
      lower
    ) ||
    (/ace-step/i.test(raw) && /fail|refused|timeout|connect/i.test(lower))
  ) {
    return {
      code: "ace_offline",
      message: "ACE-Step is offline or unreachable.",
      hint: "Start the ACE-Step API (often http://127.0.0.1:8001), confirm ACESTEP_API_URL, or set GENERATION_MODE=mock for local demos without a GPU worker.",
      detail: raw,
    };
  }

  if (
    /model.*(not available|unavailable|not supported|not reported)|checkpoint|xl.*(not|unavailable|vram)|fall back|quality_tier|remote-xl/i.test(
      lower
    )
  ) {
    return {
      code: "model_unavailable",
      message: "The requested model or quality tier is not available.",
      hint: "Check /api/health capabilities: local Turbo/SFT must be loaded, or configure a confirmed remote XL endpoint. Audio Alchemy will not silently fall back from XL to local.",
      detail: raw,
    };
  }

  if (/timed out|timeout/i.test(lower)) {
    return {
      code: "timeout",
      message: "Generation timed out before audio was ready.",
      hint: "Increase ACESTEP_TIMEOUT_MS, simplify the prompt/duration, or check the ACE-Step worker logs. You can retry from the result panel.",
      detail: raw,
    };
  }

  if (/cancel/i.test(lower)) {
    return {
      code: "cancelled",
      message: "Generation was cancelled.",
      hint: "Start a new generation when you are ready.",
      detail: raw,
    };
  }

  if (/required|invalid|must be|validation/i.test(lower)) {
    return {
      code: "validation",
      message: raw.slice(0, 240) || "Invalid request.",
      hint: "Check prompt, duration (30–180s), and optional advanced fields, then try again.",
      detail: raw,
    };
  }

  return {
    code: "unknown",
    message: raw.slice(0, 280) || "Something went wrong.",
    hint: "Retry once. If it persists, open Diagnostics on Create for ACE-Step / disk / ffmpeg status.",
    detail: raw,
  };
}

/** Flatten for JSON API: { error, code, hint }. */
export function actionableErrorJson(err: unknown): {
  error: string;
  code: ActionableErrorCode;
  hint?: string;
} {
  const a = formatActionableError(err);
  return {
    error: a.message,
    code: a.code,
    ...(a.hint ? { hint: a.hint } : {}),
  };
}
