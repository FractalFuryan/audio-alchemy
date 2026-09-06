import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { createAceStepClient, extractAudioPath } from "./ace-step-client";
import {
  getAceStepEnvSettings,
  type AceStepSettingsOverrides,
} from "./ace-step-settings";
import {
  parsePresetId,
  resolveInferenceFromPreset,
  PresetResolutionError,
} from "./presets";
import { assertModelAvailableOrThrow, probeModels } from "./models-probe";
import {
  AceRouteError,
  clientForRoute,
  createClientForEndpoint,
  getLocalEndpoint,
  getRemoteEndpoint,
  resolveAceRoute,
  type AceRouteResolution,
} from "./ace-provider";
import {
  capabilityFromModelId,
  type AceCapabilityId,
} from "./ace-capabilities";
import {
  insertGeneration,
  updateGeneration,
  getGeneration,
  listGenerations,
  listOpenGenerations,
  listGenerationsByStatus,
  deleteGenerationRow,
  getCollection,
} from "./db";
import { serializeUserTags, normalizeTagList } from "./library-meta";
import { getAudioDir } from "./paths";
import { synthesizeMockWav } from "./wav";
import type { CreateGenerationInput, Generation, GenerationMode, PlanningMode } from "./types";
import { getGenerationMode } from "./generation-mode";
import { titleFromPrompt } from "./title";
import { formatActionableError } from "./user-errors";
import { maybePostprocessAudio, parsePostFxPreset } from "./postprocess";
import { compileMusicBrief, parsePlanningMode, thinkingForPlanningMode } from "./prompt-compiler";
import {
  plannerFromModelsProbe,
} from "./models-probe";

const MOCK_STALE_MS = 30_000;

/** In-process single-flight guard while release_task is in flight (protects 10GB VRAM). */
let aceStepSubmitInFlight = false;

export { getGenerationMode } from "./generation-mode";

function createAceClient() {
  const ep = getLocalEndpoint();
  return createClientForEndpoint(ep);
}

function clientForGeneration(gen: Generation) {
  if (gen.provider === "remote") {
    const ep = getRemoteEndpoint();
    if (ep.configured) return createClientForEndpoint(ep);
  }
  return createAceClient();
}

function confirmActualFromMeta(
  requestedModel: string | null | undefined,
  requestedCap: string | null | undefined,
  metaModel: string | undefined,
  provider: "local" | "remote"
): { actualModelName: string | null; actualCapability: string | null; modelName: string | null } {
  // Only confirm when result payload reports a model id.
  if (!metaModel?.trim()) {
    return { actualModelName: null, actualCapability: null, modelName: requestedModel ?? null };
  }
  const actual = metaModel.trim();
  const loc = provider === "remote" ? "remote" : "local";
  const cap =
    capabilityFromModelId(actual, loc) ||
    (requestedCap as AceCapabilityId | null) ||
    null;
  return {
    actualModelName: actual,
    actualCapability: cap,
    modelName: actual,
  };
}

function extForMime(mime: string): string {
  if (mime.includes("wav")) return "wav";
  if (mime.includes("flac")) return "flac";
  if (mime.includes("ogg") || mime.includes("opus")) return "ogg";
  return "mp3";
}

function unlinkAudioFor(gen: Generation): void {
  if (!gen.audioPath) return;
  const abs = path.join(getAudioDir(), path.basename(gen.audioPath));
  try {
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch {
    // best-effort
  }
}

function stylePromptFor(gen: Generation): string {
  return [gen.style, gen.prompt].filter(Boolean).join(". ");
}

/**
 * Prompt text sent to ACE-Step.
 * Direct: style + prompt (legacy path).
 * Song focus: music brief only (style already folded by compiler; avoid duplication).
 */
function aceSubmitPromptFor(gen: Generation): string {
  if (gen.planningMode === "song-focus") {
    const brief = (gen.musicBrief || gen.prompt || "").trim();
    return brief;
  }
  return stylePromptFor(gen);
}

function wantsSongFocusThinking(gen: Generation): boolean {
  return thinkingForPlanningMode(gen.planningMode);
}

/**
 * True when another ACE-Step job is open (pending/processing), optionally excluding one id.
 * Used for single-flight: only one GPU job at a time on 10GB VRAM.
 */
export function isAceStepBusy(excludeId?: string): boolean {
  if (aceStepSubmitInFlight) return true;
  return listOpenGenerations().some(
    (g) => g.mode === "ace-step" && g.id !== excludeId
  );
}

/**
 * Reject if another ace-step job is already processing / submitting.
 * Documented single-flight queue for RTX 3080 10GB VRAM protection.
 */
function toUserErrorMessage(err: unknown): string {
  const a = formatActionableError(err);
  return a.hint ? `${a.message} — ${a.hint}` : a.message;
}

export function assertAceStepSingleFlight(excludeId?: string): void {
  if (!isAceStepBusy(excludeId)) return;
  const other = listOpenGenerations().find(
    (g) => g.mode === "ace-step" && g.id !== excludeId
  );
  const hint = other
    ? `Job ${other.id.slice(0, 8)}… is ${other.status}`
    : "A submit is already in flight";
  throw new Error(
    `ACE-Step busy (${hint}). Only one generation at a time (single-flight protects 10GB VRAM). Cancel or wait, then retry.`
  );
}

/** Complete mock generation (under ~1s + optional ffmpeg post-FX). */
async function completeMockInRequest(gen: Generation): Promise<Generation> {
  updateGeneration(gen.id, {
    status: "processing",
    stage: "synthesizing",
    progressMessage: "Synthesizing mock WAV…",
    progressPct: 50,
  });

  const wav = synthesizeMockWav({
    durationSec: gen.durationSec,
    seed: `${gen.id}:${gen.prompt}`,
  });
  const filename = `${gen.id}.wav`;
  const abs = path.join(getAudioDir(), filename);
  fs.writeFileSync(abs, wav);

  let audioMime = "audio/wav";
  const pp = await maybePostprocessAudio({
    absPath: abs,
    mime: audioMime,
    preset: gen.postFxPreset,
    onStage: (message, pct) => {
      updateGeneration(gen.id, {
        status: "processing",
        stage: "postprocessing",
        progressMessage: message,
        progressPct: pct ?? 90,
      });
    },
  });
  audioMime = pp.mime;

  const updated = updateGeneration(gen.id, {
    status: "completed",
    stage: "done",
    progressMessage: pp.ok
      ? pp.skipped
        ? "Complete"
        : "Complete (post-processed)"
      : "Complete (post-FX skipped after error)",
    progressPct: 100,
    audioPath: filename,
    audioMime,
    errorMessage: null,
    audioDurationSec: Math.min(Math.max(gen.durationSec, 1), 16),
    seed: `${gen.id}:${gen.prompt}`.slice(0, 64),
  });
  return updated ?? getGeneration(gen.id)!;
}

async function submitAceStepTask(
  gen: Generation,
  overrides?: AceStepSettingsOverrides | null,
  presetId?: "fast" | "quality"
): Promise<Generation> {
  assertAceStepSingleFlight(gen.id);

  const probe = await probeModels();
  let route: AceRouteResolution;
  try {
    route = resolveAceRoute({
      preset: presetId ?? gen.preset ?? "fast",
      modelOverride: overrides?.model,
      capabilities: probe.capabilities,
      inventory: probe.inventory,
    });
  } catch (err) {
    if (err instanceof AceRouteError) throw err;
    throw err;
  }

  // Local non-XL: still enforce preset resolution + local availability
  if (route.provider === "local") {
    const useThinking = wantsSongFocusThinking(gen);
    const settings = resolveInferenceFromPreset({
      preset: presetId,
      model: overrides?.model || route.model,
      inferenceSteps: overrides?.inferenceSteps ?? route.inferenceSteps,
      audioFormat: overrides?.audioFormat,
      batchSize: 1,
      thinking: useThinking,
    });
    await assertModelAvailableOrThrow(settings.model);
    route = { ...route, model: settings.model || route.model };
  }

  const client = clientForRoute(route);
  const baseSettings = getAceStepEnvSettings();
  const audioFormat = overrides?.audioFormat ?? baseSettings.audioFormat;
  const inferenceSteps =
    overrides?.inferenceSteps != null && Number.isFinite(overrides.inferenceSteps)
      ? Math.min(100, Math.max(1, Math.round(overrides.inferenceSteps)))
      : route.inferenceSteps;

  aceStepSubmitInFlight = true;
  try {
    const healthy = await client.health();
    if (!healthy) {
      const hint =
        route.provider === "remote"
          ? "Check ACESTEP_REMOTE_URL / ACESTEP_XL_API_URL"
          : "Check ACESTEP_API_URL";
      throw new Error(
        `ACE-Step ${route.provider} API is unreachable. ${hint} and that the server is running.`
      );
    }

    const useThinking = wantsSongFocusThinking(gen);
    const created = await client.releaseTask({
      prompt: aceSubmitPromptFor(gen),
      lyrics: gen.lyrics || undefined,
      durationSec: gen.durationSec,
      audioFormat,
      batchSize: 1,
      inferenceSteps,
      // Song focus only — never silently claim thinking without planningMode
      thinking: useThinking,
      model: route.model,
    });

    const updated = updateGeneration(gen.id, {
      status: "processing",
      externalTaskId: created.taskId,
      stage: "queued",
      progressMessage:
        created.queuePosition != null
          ? `Queued on ${route.provider} (position ${created.queuePosition})`
          : `Submitted to ACE-Step (${route.provider})`,
      progressPct: 5,
      attemptCount: (gen.attemptCount || 0) + 1,
      errorMessage: null,
      cancelRequested: false,
      // Requested only — actual* stays null until result confirms
      modelName: route.model,
      requestedModelName: route.model,
      requestedCapability: route.capability,
      provider: route.provider,
      actualModelName: null,
      actualCapability: null,
      preset: presetId ?? gen.preset,
    });
    return updated ?? getGeneration(gen.id)!;
  } finally {
    aceStepSubmitInFlight = false;
  }
}

export async function createGeneration(input: CreateGenerationInput): Promise<Generation> {
  const prompt = input.prompt?.trim();
  if (!prompt) {
    throw new Error("Prompt is required");
  }
  const durationSec = Math.min(180, Math.max(30, Math.round(input.durationSec || 60)));
  const mode = getGenerationMode();
  const now = new Date().toISOString();

  const presetId = parsePresetId(input.preset) ?? undefined;
  const postFxPreset = parsePostFxPreset(input.postFxPreset) ?? "off";

  const planningMode: PlanningMode =
    parsePlanningMode(input.planningMode) ?? "direct";
  const songFocus = planningMode === "song-focus";

  // Resolve music brief for Song focus (deterministic compiler if client omitted).
  let musicBrief: string | null = null;
  let originalPrompt: string | null = null;
  if (songFocus) {
    originalPrompt = prompt;
    const provided = input.musicBrief?.trim();
    if (provided) {
      musicBrief = provided;
    } else {
      musicBrief = compileMusicBrief({
        prompt,
        style: input.style,
        lyrics: input.lyrics,
      }).musicBrief;
    }
    if (!musicBrief?.trim()) {
      throw new Error("Song focus requires a music brief");
    }
  }

  const overrides: AceStepSettingsOverrides | undefined = {
    ...(input.model != null ? { model: input.model } : {}),
    ...(input.inferenceSteps != null
      ? { inferenceSteps: input.inferenceSteps }
      : {}),
    ...(input.audioFormat != null ? { audioFormat: input.audioFormat } : {}),
    batchSize: 1,
    // thinking:true only when Song focus explicitly selected
    thinking: songFocus,
  };

  // Resolve early so XL / missing-model / remote-unavailable errors happen before insert.
  // Persist requested* only; actual* stays null until result payload confirms.
  let resolvedModelName: string | null = null;
  let requestedCapability: string | null = null;
  let routedProvider: string | null = null;
  let persistedPreset: "fast" | "quality" | null = presetId ?? null;
  try {
    if (mode === "ace-step") {
      const probe = await probeModels();
      if (songFocus) {
        const aceHealth = await getAceStepHealthInfo();
        const planner = plannerFromModelsProbe(probe, {
          mode,
          aceConnected: aceHealth.connected,
          loadedLmModel: aceHealth.loadedLmModel,
        });
        if (!planner.available) {
          throw new Error(
            planner.reason ||
              "Song focus is unavailable — local ACE planner/LM not confirmed. Choose Direct."
          );
        }
      }
      const route = resolveAceRoute({
        preset: presetId ?? "fast",
        modelOverride: overrides.model,
        capabilities: probe.capabilities,
        inventory: probe.inventory,
      });
      resolvedModelName = route.model;
      requestedCapability = route.capability;
      routedProvider = route.provider;
      persistedPreset = presetId ?? "fast";
      if (route.provider === "local") {
        const resolved = resolveInferenceFromPreset({
          preset: presetId,
          ...overrides,
          model: overrides.model || route.model,
        });
        resolvedModelName = resolved.model ?? route.model;
        persistedPreset = resolved.preset;
        await assertModelAvailableOrThrow(resolved.model);
      }
      assertAceStepSingleFlight();
    } else {
      if (songFocus) {
        throw new Error(
          "Song focus requires ACE-Step mode with a local planner/LM. Choose Direct or connect ACE-Step."
        );
      }
      const resolved = resolveInferenceFromPreset({
        preset: presetId,
        ...overrides,
      });
      resolvedModelName = resolved.model ?? null;
      persistedPreset = resolved.preset;
      requestedCapability =
        capabilityFromModelId(resolved.model, "local") ||
        (persistedPreset === "fast" ? "local-2b-turbo" : "local-2b-sft");
      routedProvider = "local";
    }
  } catch (err) {
    if (err instanceof PresetResolutionError || err instanceof AceRouteError) throw err;
    throw err;
  }

  const gen: Generation = {
    id: uuidv4(),
    title: titleFromPrompt(prompt, input.title),
    prompt,
    lyrics: input.lyrics?.trim() || null,
    style: input.style?.trim() || null,
    durationSec,
    status: "pending",
    audioPath: null,
    audioMime: null,
    errorMessage: null,
    mode,
    createdAt: now,
    updatedAt: now,
    externalTaskId: null,
    stage: "pending",
    progressMessage: "Pending",
    progressPct: 0,
    attemptCount: 0,
    cancelRequested: false,
    seed: null,
    bpm: null,
    musicalKey: null,
    modelName: resolvedModelName,
    requestedModelName: resolvedModelName,
    actualModelName: null,
    requestedCapability,
    actualCapability: null,
    provider: routedProvider,
    preset: persistedPreset,
    generationMs: null,
    audioDurationSec: null,
    resultJson: null,
    favorite: false,
    userTags: null,
    collectionId: null,
    postFxPreset,
    planningMode,
    originalPrompt,
    musicBrief,
  };
  insertGeneration(gen);

  try {
    if (mode === "mock") {
      // Complete in-request so restarts never leave mock jobs stuck.
      return await completeMockInRequest(gen);
    }

    // Health-gate + release_task; return immediately without awaiting full generation.
    const submitted = await submitAceStepTask(gen, overrides, presetId);
    // Optional background kick — reconciliation also works via GET polls.
    void reconcileGeneration(submitted.id).catch(() => undefined);
    return submitted;
  } catch (err) {
    const message = toUserErrorMessage(err);
    const failed = updateGeneration(gen.id, {
      status: "failed",
      stage: "failed",
      progressMessage: message,
      errorMessage: message,
    });
    // Prefer returning failed row rather than orphan pending; throw so API can 503/502.
    if (failed) {
      const e = new Error(message) as Error & { generation?: Generation };
      e.generation = failed;
      throw e;
    }
    throw err;
  }
}

export async function reconcileGeneration(id: string): Promise<Generation | null> {
  const gen = getGeneration(id);
  if (!gen) return null;

  if (gen.status !== "pending" && gen.status !== "processing") {
    return gen;
  }

  if (gen.cancelRequested) {
    return (
      updateGeneration(gen.id, {
        status: "cancelled",
        stage: "cancelled",
        progressMessage: "Cancelled",
        errorMessage: null,
      }) ?? gen
    );
  }

  if (gen.mode === "mock") {
    // Interrupted mock (should be rare with in-request completion).
    const age = Date.now() - new Date(gen.updatedAt).getTime();
    if (!gen.externalTaskId && age > MOCK_STALE_MS) {
      return (
        updateGeneration(gen.id, {
          status: "failed",
          stage: "failed",
          progressMessage: "Interrupted",
          errorMessage: "Interrupted before mock generation completed",
        }) ?? gen
      );
    }
    // Still fresh — leave alone (or complete now if somehow still open).
    if (!gen.externalTaskId && age <= MOCK_STALE_MS) {
      try {
        return await completeMockInRequest(gen);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Mock generation failed";
        return (
          updateGeneration(gen.id, {
            status: "failed",
            stage: "failed",
            errorMessage: message,
            progressMessage: message,
          }) ?? gen
        );
      }
    }
    return gen;
  }

  // ace-step
  if (!gen.externalTaskId) {
    return (
      updateGeneration(gen.id, {
        status: "failed",
        stage: "failed",
        progressMessage: "Interrupted",
        errorMessage: "Interrupted before ACE-Step task was submitted",
      }) ?? gen
    );
  }

  const { timeoutMs } = getAceStepEnvSettings();
  const ageMs = Date.now() - new Date(gen.createdAt).getTime();
  if (ageMs > timeoutMs) {
    return (
      updateGeneration(gen.id, {
        status: "failed",
        stage: "failed",
        progressMessage: `Timed out after ${Math.round(timeoutMs / 1000)}s`,
        errorMessage: `ACE-Step generation timed out after ${timeoutMs}ms (ACESTEP_TIMEOUT_MS)`,
      }) ?? gen
    );
  }

  try {
    const client = clientForGeneration(gen);
    const results = await client.queryResult([gen.externalTaskId]);
    const item = results[0];
    if (!item) {
      return (
        updateGeneration(gen.id, {
          stage: gen.stage || "waiting",
          progressMessage: gen.progressMessage || "Waiting for ACE-Step…",
        }) ?? gen
      );
    }

    if (gen.cancelRequested || getGeneration(gen.id)?.cancelRequested) {
      return (
        updateGeneration(gen.id, {
          status: "cancelled",
          stage: "cancelled",
          progressMessage: "Cancelled",
        }) ?? gen
      );
    }

    if (item.status === 0) {
      return (
        updateGeneration(gen.id, {
          status: "processing",
          stage: item.stage || "running",
          progressMessage: item.progressMessage || "Generating…",
          progressPct: item.progressPct ?? gen.progressPct ?? 20,
        }) ?? gen
      );
    }

    if (item.status === 2) {
      const message = toUserErrorMessage(item.error || "ACE-Step generation failed");
      return (
        updateGeneration(gen.id, {
          status: "failed",
          stage: "failed",
          progressMessage: message,
          errorMessage: message,
          resultJson: item.raw != null ? safeJson(item.raw) : gen.resultJson,
        }) ?? gen
      );
    }

    if (item.status === 1) {
      const audioUrl = item.audioUrl || extractAudioPath(item.raw);
      if (!audioUrl) {
        return (
          updateGeneration(gen.id, {
            status: "failed",
            stage: "failed",
            progressMessage: "No audio in result",
            errorMessage: "ACE-Step succeeded but no audio file URL in result",
            resultJson: item.raw != null ? safeJson(item.raw) : null,
          }) ?? gen
        );
      }

      const file = await client.downloadAudio(audioUrl);
      const ext = extForMime(file.mime);
      const filename = `${gen.id}.${ext}`;
      const abs = path.join(getAudioDir(), filename);
      fs.writeFileSync(abs, file.buffer);

      let audioMime = file.mime;
      const pp = await maybePostprocessAudio({
        absPath: abs,
        mime: audioMime,
        preset: gen.postFxPreset,
        onStage: (message, pct) => {
          updateGeneration(gen.id, {
            status: "processing",
            stage: "postprocessing",
            progressMessage: message,
            progressPct: pct ?? 90,
          });
        },
      });
      audioMime = pp.mime;

      const meta = item.metadata;
      const providerKind = gen.provider === "remote" ? "remote" : "local";
      const confirmed = confirmActualFromMeta(
        gen.requestedModelName ?? gen.modelName,
        gen.requestedCapability,
        meta?.modelName,
        providerKind
      );
      // If result did not report model, keep actual* null (do not pretend requested === actual).
      return (
        updateGeneration(gen.id, {
          status: "completed",
          stage: "done",
          progressMessage: pp.ok
            ? pp.skipped
              ? "Complete"
              : "Complete (post-processed)"
            : "Complete (post-FX skipped after error)",
          progressPct: 100,
          audioPath: filename,
          audioMime,
          errorMessage: null,
          seed: meta?.seed ?? gen.seed,
          bpm: meta?.bpm ?? gen.bpm,
          musicalKey: meta?.musicalKey ?? gen.musicalKey,
          modelName: confirmed.actualModelName ?? gen.requestedModelName ?? gen.modelName,
          actualModelName: confirmed.actualModelName,
          actualCapability: confirmed.actualCapability,
          requestedModelName: gen.requestedModelName ?? gen.modelName,
          requestedCapability: gen.requestedCapability,
          provider: gen.provider ?? providerKind,
          generationMs: meta?.generationMs ?? gen.generationMs,
          audioDurationSec: meta?.durationSec ?? gen.audioDurationSec ?? gen.durationSec,
          resultJson: item.raw != null ? safeJson(item.raw) : null,
        }) ?? gen
      );
    }

    return gen;
  } catch (err) {
    // Transient poll errors: keep processing, surface message lightly — do NOT fail the job.
    const message = err instanceof Error ? err.message : "Reconcile error";
    return (
      updateGeneration(gen.id, {
        progressMessage: `Still processing… (${message})`,
      }) ?? gen
    );
  }
}

export async function reconcileOpenJobs(): Promise<void> {
  const open = listOpenGenerations();
  for (const g of open) {
    try {
      await reconcileGeneration(g.id);
    } catch {
      // continue other jobs
    }
  }
}

export async function cancelGeneration(id: string): Promise<Generation | null> {
  const gen = getGeneration(id);
  if (!gen) return null;
  if (gen.status === "completed" || gen.status === "failed" || gen.status === "cancelled") {
    return gen;
  }
  updateGeneration(id, {
    cancelRequested: true,
    progressMessage: "Cancel requested…",
  });
  // Best-effort: ACE-Step has no cancel API; stop finalizing on next reconcile.
  return (
    updateGeneration(id, {
      status: "cancelled",
      stage: "cancelled",
      progressMessage: "Cancelled",
      cancelRequested: true,
    }) ?? getGeneration(id)
  );
}

export async function retryGeneration(id: string): Promise<Generation> {
  const gen = getGeneration(id);
  if (!gen) throw new Error("Not found");
  if (gen.status !== "failed" && gen.status !== "cancelled") {
    throw new Error("Only failed or cancelled generations can be retried");
  }

  unlinkAudioFor(gen);

  if (gen.mode === "ace-step") {
    assertAceStepSingleFlight(id);
  }

  const cleared = updateGeneration(id, {
    status: "pending",
    stage: "pending",
    progressMessage: "Retrying…",
    progressPct: 0,
    audioPath: null,
    audioMime: null,
    errorMessage: null,
    externalTaskId: null,
    cancelRequested: false,
    resultJson: null,
    seed: null,
    bpm: null,
    musicalKey: null,
    modelName: null,
    requestedModelName: null,
    actualModelName: null,
    requestedCapability: null,
    actualCapability: null,
    provider: null,
    generationMs: null,
    audioDurationSec: null,
  });
  if (!cleared) throw new Error("Failed to reset generation");

  try {
    const probe = await probeModels();
    const route = resolveAceRoute({
      preset: cleared.preset ?? "fast",
      capabilities: probe.capabilities,
      inventory: probe.inventory,
    });
    updateGeneration(id, {
      modelName: route.model,
      requestedModelName: route.model,
      requestedCapability: route.capability,
      provider: route.provider,
      actualModelName: null,
      actualCapability: null,
      preset: route.capability.includes("turbo") && cleared.preset !== "quality"
        ? cleared.preset ?? "fast"
        : cleared.preset ?? "quality",
    });
  } catch {
    /* keep prior preset; model may stay null until submit */
  }
  const refreshed = getGeneration(id) ?? cleared;

  if (refreshed.mode === "mock") {
    return await completeMockInRequest(refreshed);
  }

  try {
    // Retry uses env defaults (per-request Advanced overrides are not persisted).
    const submitted = await submitAceStepTask(refreshed, null, refreshed.preset ?? undefined);
    void reconcileGeneration(submitted.id).catch(() => undefined);
    return submitted;
  } catch (err) {
    const message = toUserErrorMessage(err);
    const failed = updateGeneration(id, {
      status: "failed",
      stage: "failed",
      progressMessage: message,
      errorMessage: message,
    });
    throw Object.assign(new Error(message), { generation: failed });
  }
}

export async function deleteGeneration(id: string): Promise<boolean> {
  const gen = getGeneration(id);
  if (!gen) return false;
  unlinkAudioFor(gen);
  return deleteGenerationRow(id);
}

/** Delete all failed + cancelled generations and unlink their audio files safely. */
export async function clearFailedGenerations(): Promise<{ deleted: number }> {
  const rows = listGenerationsByStatus(["failed", "cancelled"]);
  let deleted = 0;
  for (const gen of rows) {
    unlinkAudioFor(gen);
    if (deleteGenerationRow(gen.id)) deleted += 1;
  }
  return { deleted };
}

export async function renameGeneration(
  id: string,
  title: string
): Promise<Generation | null> {
  const trimmed = title.trim().slice(0, 80);
  if (!trimmed) throw new Error("Title is required");
  return updateGeneration(id, { title: trimmed });
}

function safeJson(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export { getGeneration, listGenerations };
export { titleFromPrompt } from "./title";

export function resolveAudioAbsolutePath(gen: Generation): string | null {
  if (!gen.audioPath) return null;
  const abs = path.join(getAudioDir(), path.basename(gen.audioPath));
  if (!fs.existsSync(abs)) return null;
  return abs;
}


export async function setGenerationFavorite(
  id: string,
  favorite: boolean
): Promise<Generation | null> {
  return updateGeneration(id, { favorite: Boolean(favorite) });
}

export async function setGenerationUserTags(
  id: string,
  tags: string[]
): Promise<Generation | null> {
  return updateGeneration(id, {
    userTags: serializeUserTags(normalizeTagList(tags)),
  });
}

export async function setGenerationCollection(
  id: string,
  collectionId: string | null
): Promise<Generation | null> {
  if (collectionId) {
    const col = getCollection(collectionId);
    if (!col) throw new Error("Collection not found");
  }
  return updateGeneration(id, { collectionId });
}

export async function checkAceStepHealth(): Promise<boolean> {
  try {
    return (await getAceStepHealthInfo()).connected;
  } catch {
    return false;
  }
}

export async function getAceStepHealthInfo() {
  return createAceClient().healthInfo();
}
