/**
 * Local diagnostics snapshot for /api/health + Diagnostics panel.
 * Never exposes tokens, API keys, or unnecessary absolute filesystem paths.
 */

import fs from "fs";
import path from "path";
import { getDataDir } from "./paths";
import { getQualityTier } from "./ace-capabilities";
import {
  ffmpegAvailable,
  ffmpegBin,
  ffmpegMissingHint,
} from "./postprocess";
import { getSafeSettingsSummary } from "./ace-step-settings";

const SECRET_KEY_RE =
  /(?:^|[_-])(api[_-]?key|token|password|secret|authorization|credential|hf_token)(?:$|[_-])/i;

/** True when a JSON key name looks like a secret field (not boolean flags like hasApiKey). */
export function isSecretKeyName(key: string): boolean {
  if (/^has[A-Z_]/.test(key)) return false; // hasApiKey, hasToken flags are booleans
  return SECRET_KEY_RE.test(key) || /^(api[_-]?key|token|password|secret|authorization|hf_token)$/i.test(key);
}

/**
 * Deep-scan a value for secret-looking keys or obvious token strings.
 * Used by unit tests and as a last-line guard before returning health JSON.
 */
export function collectSecretLeaks(value: unknown, pathPrefix = ""): string[] {
  const leaks: string[] = [];
  if (value == null) return leaks;
  if (typeof value === "string") {
    if (/^(sk-|hf_|ghp_|xox[baprs]-)/i.test(value.trim())) {
      leaks.push(pathPrefix || "(string)");
    }
    return leaks;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => {
      leaks.push(...collectSecretLeaks(v, `${pathPrefix}[${i}]`));
    });
    return leaks;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const p = pathPrefix ? `${pathPrefix}.${k}` : k;
      if (isSecretKeyName(k) && typeof v === "string" && v.length > 0) {
        // Boolean flags like hasApiKey are fine; string values are not.
        if (v !== "true" && v !== "false") {
          leaks.push(p);
        }
      }
      leaks.push(...collectSecretLeaks(v, p));
    }
  }
  return leaks;
}

/** Safe label for the data directory — relative ./data or basename only. */
export function getSafeDataDirLabel(dataDir?: string): string {
  const dir = dataDir ?? getDataDir();
  const cwd = process.cwd();
  const resolvedDefault = path.resolve(cwd, "data");
  if (path.resolve(dir) === resolvedDefault) {
    return "./data";
  }
  const rel = path.relative(cwd, dir);
  if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) {
    const normalized = rel.replace(/\\/g, "/");
    return normalized.startsWith(".") ? normalized : `./${normalized}`;
  }
  // Custom absolute DATA_DIR — basename only (no home path leak).
  return path.basename(dir) || "data";
}

/** Basename-safe ffmpeg display (never full FFMPEG_PATH). */
export function getSafeFfmpegLabel(): {
  available: boolean;
  label: string | null;
  pathConfigured: boolean;
  hint: string | null;
} {
  const available = ffmpegAvailable();
  const fromEnv = Boolean((process.env.FFMPEG_PATH || "").trim());
  if (!available) {
    return {
      available: false,
      label: null,
      pathConfigured: fromEnv,
      hint: ffmpegMissingHint(),
    };
  }
  if (fromEnv) {
    const bin = ffmpegBin();
    const base = path.basename(bin);
    return {
      available: true,
      label: base || "ffmpeg",
      pathConfigured: true,
      hint: null,
    };
  }
  return {
    available: true,
    label: "ffmpeg",
    pathConfigured: false,
    hint: null,
  };
}

export interface DiskSpaceInfo {
  ok: boolean;
  freeBytes: number | null;
  totalBytes: number | null;
  freeLabel: string | null;
  /** Where free space was measured (safe label). */
  measuredAt: string;
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "?";
  const gb = n / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = n / 1024 ** 2;
  if (mb >= 1) return `${mb.toFixed(0)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

/** Best-effort free disk space for the data directory. */
export function getDiskSpaceInfo(dataDir?: string): DiskSpaceInfo {
  const dir = dataDir ?? getDataDir();
  const measuredAt = getSafeDataDirLabel(dir);
  try {
    // Node 18.15+ / 19+
    const statfs = (
      fs as typeof fs & {
        statfsSync?: (p: string) => {
          bavail: number | bigint;
          blocks: number | bigint;
          bsize: number | bigint;
        };
      }
    ).statfsSync;
    if (typeof statfs === "function") {
      const s = statfs(dir);
      const bsize = Number(s.bsize);
      const freeBytes = Number(s.bavail) * bsize;
      const totalBytes = Number(s.blocks) * bsize;
      return {
        ok: true,
        freeBytes,
        totalBytes,
        freeLabel: formatBytes(freeBytes),
        measuredAt,
      };
    }
  } catch {
    // fall through
  }
  return {
    ok: false,
    freeBytes: null,
    totalBytes: null,
    freeLabel: null,
    measuredAt,
  };
}

export interface DiagnosticsSnapshot {
  mode: "mock" | "ace-step";
  aceStepConnected: boolean | null;
  qualityTier: string;
  gpuBusy: boolean;
  singleFlight: true;
  dataDir: string;
  disk: DiskSpaceInfo;
  ffmpeg: ReturnType<typeof getSafeFfmpegLabel>;
  capabilities: Array<{
    id: string;
    configured: boolean;
    available: boolean;
    modelId: string | null;
  }>;
  models: Array<{
    id: string;
    family?: string;
    provider?: string;
    supportedLocally?: boolean;
  }>;
  settings: ReturnType<typeof getSafeSettingsSummary>;
}

export function buildDiagnosticsSnapshot(opts: {
  mode: "mock" | "ace-step";
  aceStepConnected: boolean | null;
  gpuBusy: boolean;
  capabilities?: Array<{
    id: string;
    configured?: boolean;
    available?: boolean;
    modelId?: string | null;
  }>;
  models?: Array<{
    id: string;
    family?: string;
    provider?: string;
    supportedLocally?: boolean;
  }>;
}): DiagnosticsSnapshot {
  return {
    mode: opts.mode,
    aceStepConnected: opts.mode === "mock" ? null : opts.aceStepConnected,
    qualityTier: getQualityTier(),
    gpuBusy: opts.gpuBusy,
    singleFlight: true,
    dataDir: getSafeDataDirLabel(),
    disk: getDiskSpaceInfo(),
    ffmpeg: getSafeFfmpegLabel(),
    capabilities: (opts.capabilities ?? []).map((c) => ({
      id: c.id,
      configured: Boolean(c.configured),
      available: Boolean(c.available),
      modelId: c.modelId ?? null,
    })),
    models: (opts.models ?? []).map((m) => ({
      id: m.id,
      family: m.family,
      provider: m.provider,
      supportedLocally: m.supportedLocally,
    })),
    settings: getSafeSettingsSummary(opts.gpuBusy),
  };
}
