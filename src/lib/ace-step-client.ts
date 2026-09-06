/**
 * TypeScript client for ACE-Step 1.5 REST API.
 *
 * Expected endpoints (from ace-step/ACE-Step-1.5 docs/en/API.md):
 * - POST /release_task     — submit generation, returns task_id
 * - POST /query_result     — poll status until 1 (ok) or 2 (failed)
 * - GET  /v1/audio?path=   — download generated audio
 * - GET  /health           — health check
 * - GET  /v1/models        — list models
 *
 * Auth (optional): Authorization: Bearer <ACESTEP_API_KEY> or body.ai_token
 * Default server port in upstream docs is often 8001.
 */

export interface AceStepGenerateParams {
  prompt: string;
  lyrics?: string;
  /** Duration in seconds (maps to audio_duration). */
  durationSec?: number;
  style?: string;
  thinking?: boolean;
  audioFormat?: "mp3" | "wav" | "flac" | "opus" | "aac";
  batchSize?: number;
  inferenceSteps?: number;
  model?: string;
}

export interface AceStepTaskCreated {
  taskId: string;
  status?: string;
  queuePosition?: number;
}

export interface AceStepResultMetadata {
  bpm?: number;
  musicalKey?: string;
  seed?: string;
  modelName?: string;
  durationSec?: number;
  generationMs?: number;
}

export interface AceStepPollResult {
  taskId: string;
  /** 0 = queued/running, 1 = succeeded, 2 = failed */
  status: number;
  audioUrl?: string;
  stage?: string;
  progressMessage?: string;
  progressPct?: number;
  error?: string;
  metadata?: AceStepResultMetadata;
  raw?: unknown;
}

export interface AceStepClientConfig {
  baseUrl: string;
  apiKey?: string;
  /** Optional HF token forwarded as Authorization if no apiKey. */
  hfToken?: string;
  fetchImpl?: typeof fetch;
}

export interface AceStepClient {
  health(): Promise<boolean>;
  releaseTask(params: AceStepGenerateParams): Promise<AceStepTaskCreated>;
  queryResult(taskIds: string[]): Promise<AceStepPollResult[]>;
  downloadAudio(fileUrlOrPath: string): Promise<{ buffer: Buffer; mime: string }>;
  /** Thin helper; prefer releaseTask + queryResult for durable jobs. */
  listModels(): Promise<string[]>;
  generateAndWait(
    params: AceStepGenerateParams,
    options?: { timeoutMs?: number; pollIntervalMs?: number }
  ): Promise<{ buffer: Buffer; mime: string; taskId: string; metadata?: AceStepResultMetadata }>;
}

type ApiEnvelope<T> = {
  data: T;
  code: number;
  error: string | null;
  timestamp?: number;
};

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

function guessMime(pathOrUrl: string): string {
  const lower = pathOrUrl.toLowerCase();
  if (lower.includes(".wav")) return "audio/wav";
  if (lower.includes(".flac")) return "audio/flac";
  if (lower.includes(".opus")) return "audio/opus";
  if (lower.includes(".aac")) return "audio/aac";
  return "audio/mpeg";
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return undefined;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  }
  return undefined;
}

/** Extract first audio path from varied ACE-Step result shapes. */
export function extractAudioPath(result: unknown): string | undefined {
  if (result == null) return undefined;
  let parsed: unknown = result;
  if (typeof result === "string") {
    const trimmed = result.trim();
    if (!trimmed) return undefined;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Plain path string
      if (trimmed.includes("/") || /\.(mp3|wav|flac|ogg|opus|aac)$/i.test(trimmed)) {
        return trimmed;
      }
      return undefined;
    }
  }

  const candidates: unknown[] = [];
  if (Array.isArray(parsed)) {
    candidates.push(...parsed);
  } else {
    candidates.push(parsed);
  }

  for (const item of candidates) {
    const rec = asRecord(item);
    if (!rec) {
      if (typeof item === "string" && item.trim()) return item.trim();
      continue;
    }

    const direct = pickString(rec, [
      "file",
      "first_audio_path",
      "audio_path",
      "audioUrl",
      "audio_url",
      "path",
      "url",
    ]);
    if (direct) return direct;

    const audioPaths = rec.audio_paths ?? rec.audioPaths;
    if (Array.isArray(audioPaths) && audioPaths.length > 0) {
      const first = audioPaths[0];
      if (typeof first === "string" && first.trim()) return first.trim();
      const nested = asRecord(first);
      if (nested) {
        const nestedPath = pickString(nested, ["file", "path", "url"]);
        if (nestedPath) return nestedPath;
      }
    }

    // Nested result / data wrappers
    for (const nestKey of ["result", "data", "output", "outputs"]) {
      if (nestKey in rec) {
        const nested = extractAudioPath(rec[nestKey]);
        if (nested) return nested;
      }
    }
  }
  return undefined;
}

export function extractResultMetadata(result: unknown): AceStepResultMetadata {
  const meta: AceStepResultMetadata = {};
  const visit = (node: unknown) => {
    const rec = asRecord(node);
    if (!rec) {
      if (Array.isArray(node)) node.forEach(visit);
      return;
    }
    const bpm = pickNumber(rec, ["bpm", "BPM"]);
    if (bpm != null && meta.bpm == null) meta.bpm = bpm;

    const key = pickString(rec, ["key", "musical_key", "musicalKey", "tonality"]);
    if (key && meta.musicalKey == null) meta.musicalKey = key;

    const seed =
      pickString(rec, ["seed"]) ??
      (pickNumber(rec, ["seed"]) != null ? String(pickNumber(rec, ["seed"])) : undefined);
    if (seed && meta.seed == null) meta.seed = seed;

    const model = pickString(rec, ["model", "model_name", "modelName"]);
    if (model && meta.modelName == null) meta.modelName = model;

    const duration = pickNumber(rec, [
      "duration",
      "duration_sec",
      "durationSec",
      "audio_duration",
      "audioDurationSec",
    ]);
    if (duration != null && meta.durationSec == null) meta.durationSec = duration;

    const genMs = pickNumber(rec, [
      "generation_ms",
      "generationMs",
      "elapsed_ms",
      "elapsedMs",
      "time_cost",
    ]);
    if (genMs != null && meta.generationMs == null) meta.generationMs = genMs;

    for (const nestKey of ["result", "data", "output", "outputs", "meta", "metadata"]) {
      if (nestKey in rec) visit(rec[nestKey]);
    }
  };

  let parsed: unknown = result;
  if (typeof result === "string") {
    try {
      parsed = JSON.parse(result);
    } catch {
      return meta;
    }
  }
  visit(parsed);
  return meta;
}

function extractProgress(item: Record<string, unknown>, result: unknown): {
  stage?: string;
  progressMessage?: string;
  progressPct?: number;
} {
  const fromItem = {
    stage: pickString(item, ["stage", "state", "phase"]),
    progressMessage: pickString(item, [
      "progress_message",
      "progressMessage",
      "message",
      "status_message",
      "statusMessage",
    ]),
    progressPct: pickNumber(item, ["progress_pct", "progressPct", "progress", "percent"]),
  };

  let parsed: unknown = result;
  if (typeof result === "string") {
    try {
      parsed = JSON.parse(result);
    } catch {
      parsed = null;
    }
  }
  const rec = asRecord(Array.isArray(parsed) ? parsed[0] : parsed);
  if (!rec) return fromItem;

  return {
    stage: fromItem.stage ?? pickString(rec, ["stage", "state", "phase"]),
    progressMessage:
      fromItem.progressMessage ??
      pickString(rec, [
        "progress_message",
        "progressMessage",
        "message",
        "status_message",
        "statusMessage",
      ]),
    progressPct:
      fromItem.progressPct ??
      pickNumber(rec, ["progress_pct", "progressPct", "progress", "percent"]),
  };
}

export function createAceStepClient(config: AceStepClientConfig): AceStepClient {
  const fetchFn = config.fetchImpl ?? fetch;
  const apiKey = config.apiKey || config.hfToken || undefined;

  function authHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { ...(extra ?? {}) };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    return headers;
  }

  async function parseEnvelope<T>(res: Response): Promise<T> {
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ACE-Step HTTP ${res.status}: ${text || res.statusText}`);
    }
    const json = (await res.json()) as ApiEnvelope<T> | T;
    if (json && typeof json === "object" && "code" in json) {
      const env = json as ApiEnvelope<T>;
      if (env.code !== 200) {
        throw new Error(env.error || `ACE-Step error code ${env.code}`);
      }
      return env.data;
    }
    return json as T;
  }

  async function health(): Promise<boolean> {
    try {
      const res = await fetchFn(joinUrl(config.baseUrl, "/health"), {
        headers: authHeaders(),
      });
      if (!res.ok) return false;
      return true;
    } catch {
      return false;
    }
  }

  async function releaseTask(params: AceStepGenerateParams): Promise<AceStepTaskCreated> {
    const promptParts = [params.style?.trim(), params.prompt.trim()].filter(Boolean);
    const body: Record<string, unknown> = {
      prompt: promptParts.join(". "),
      lyrics: params.lyrics?.trim() || "[inst]",
      audio_duration: params.durationSec,
      audio_format: params.audioFormat ?? "mp3",
      batch_size: params.batchSize ?? 1,
      inference_steps: params.inferenceSteps ?? 8,
      thinking: params.thinking ?? false,
      use_random_seed: true,
    };
    if (params.model) body.model = params.model;
    if (apiKey) body.ai_token = apiKey;

    const res = await fetchFn(joinUrl(config.baseUrl, "/release_task"), {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });

    const data = await parseEnvelope<{
      task_id?: string;
      taskId?: string;
      status?: string;
      queue_position?: number;
    }>(res);

    const taskId = data.task_id || data.taskId;
    if (!taskId) {
      throw new Error("ACE-Step release_task did not return task_id");
    }
    return {
      taskId,
      status: data.status,
      queuePosition: data.queue_position,
    };
  }

  async function queryResult(taskIds: string[]): Promise<AceStepPollResult[]> {
    const res = await fetchFn(joinUrl(config.baseUrl, "/query_result"), {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        task_id_list: taskIds,
        ...(apiKey ? { ai_token: apiKey } : {}),
      }),
    });

    const data = await parseEnvelope<
      Array<{
        task_id: string;
        status: number;
        result?: string | unknown;
        error?: string;
        [key: string]: unknown;
      }>
    >(res);

    return (data ?? []).map((item) => {
      const audioUrl =
        item.status === 1 ? extractAudioPath(item.result) : undefined;
      const progress = extractProgress(item as Record<string, unknown>, item.result);
      const metadata =
        item.status === 1 ? extractResultMetadata(item.result) : undefined;
      return {
        taskId: item.task_id,
        status: item.status,
        audioUrl,
        stage: progress.stage,
        progressMessage: progress.progressMessage,
        progressPct: progress.progressPct,
        error: typeof item.error === "string" ? item.error : undefined,
        metadata: metadata && Object.keys(metadata).length ? metadata : undefined,
        raw: item.result,
      };
    });
  }

  async function downloadAudio(
    fileUrlOrPath: string
  ): Promise<{ buffer: Buffer; mime: string }> {
    let url = fileUrlOrPath;
    if (url.startsWith("/")) {
      url = joinUrl(config.baseUrl, url);
    } else if (!/^https?:\/\//i.test(url)) {
      url = joinUrl(config.baseUrl, `/v1/audio?path=${encodeURIComponent(url)}`);
    }

    const res = await fetchFn(url, { headers: authHeaders() });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ACE-Step audio download failed (${res.status}): ${text}`);
    }
    const ab = await res.arrayBuffer();
    const mime =
      res.headers.get("content-type")?.split(";")[0]?.trim() || guessMime(fileUrlOrPath);
    return { buffer: Buffer.from(ab), mime };
  }

  async function generateAndWait(
    params: AceStepGenerateParams,
    options?: { timeoutMs?: number; pollIntervalMs?: number }
  ): Promise<{ buffer: Buffer; mime: string; taskId: string; metadata?: AceStepResultMetadata }> {
    const timeoutMs = options?.timeoutMs ?? 10 * 60 * 1000;
    const pollIntervalMs = options?.pollIntervalMs ?? 2000;
    const created = await releaseTask(params);
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const results = await queryResult([created.taskId]);
      const item = results[0];
      if (!item) {
        await sleep(pollIntervalMs);
        continue;
      }
      if (item.status === 1) {
        if (!item.audioUrl) {
          throw new Error("ACE-Step succeeded but no audio file URL in result");
        }
        const file = await downloadAudio(item.audioUrl);
        return { ...file, taskId: created.taskId, metadata: item.metadata };
      }
      if (item.status === 2) {
        throw new Error(item.error || "ACE-Step generation failed");
      }
      await sleep(pollIntervalMs);
    }
    throw new Error(`ACE-Step generation timed out after ${timeoutMs}ms`);
  }


  async function listModels(): Promise<string[]> {
    try {
      const res = await fetchFn(joinUrl(config.baseUrl, "/v1/models"), {
        headers: authHeaders(),
      });
      if (!res.ok) return [];
      const json = (await res.json()) as unknown;
      const ids: string[] = [];
      // The OpenAI-compatible endpoint may prefix an id with `acestep/`,
      // while ACE-Step task submission expects the checkpoint name itself.
      const normalizeModelId = (value: string) =>
        value.trim().replace(/^(?:ace-step|acestep)\//i, "");
      const push = (v: unknown) => {
        if (typeof v === "string" && v.trim()) ids.push(normalizeModelId(v));
        else if (v && typeof v === "object") {
          const o = v as Record<string, unknown>;
          const id = o.id ?? o.name ?? o.model ?? o.model_name;
          if (typeof id === "string" && id.trim()) ids.push(normalizeModelId(id));
        }
      };
      const collect = (payload: unknown) => {
        if (Array.isArray(payload)) {
          for (const item of payload) push(item);
        } else if (payload && typeof payload === "object") {
          const root = payload as Record<string, unknown>;
          const data = root.data ?? root.models ?? root.items;
          if (Array.isArray(data)) {
            for (const item of data) push(item);
          } else if (data && typeof data === "object" && Array.isArray((data as { models?: unknown }).models)) {
            for (const item of (data as { models: unknown[] }).models) push(item);
          }
        }
      };
      collect(json);

      // /v1/models may list only the active checkpoint. The optional ACE-Step
      // inventory endpoint also exposes installed, selectable checkpoints.
      try {
        const inventory = await fetchFn(joinUrl(config.baseUrl, "/v1/model_inventory"), {
          headers: authHeaders(),
        });
        if (inventory.ok) collect((await inventory.json()) as unknown);
      } catch {
        // Older ACE-Step releases may not provide this optional endpoint.
      }
      return [...new Set(ids)];
    } catch {
      return [];
    }
  }

  return { health, releaseTask, queryResult, downloadAudio, generateAndWait, listModels };

}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
