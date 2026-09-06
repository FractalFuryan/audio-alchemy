/**
 * Local library backup/export + import.
 * Portable zip: manifest.json + audio/* (+ README).
 * Import validates first; never silently overwrites existing tracks.
 */

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import {
  createArchiveZip,
  extractArchiveZip,
  LIBRARY_BACKUP_SCHEMA,
  type ArchiveFile,
} from "./archive-util";
import {
  createCollection,
  getCollection,
  getGeneration,
  insertGeneration,
  listCollections,
  listGenerations,
} from "./db";
import { getAudioDir } from "./paths";
import type { Collection, Generation, GenerationStatus, GenerationMode } from "./types";
import { buildMetadataExport } from "./library-meta";

export { LIBRARY_BACKUP_SCHEMA };

export type ImportConflictMode = "skip" | "rename";

export interface LibraryBackupManifest {
  schema: typeof LIBRARY_BACKUP_SCHEMA;
  exportedAt: string;
  app: "audio-alchemy";
  collections: Array<{
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  }>;
  generations: Array<Record<string, unknown>>;
  audio: Array<{
    generationId: string;
    archivePath: string;
    mime: string | null;
  }>;
}

export interface LibraryImportReport {
  ok: boolean;
  imported: number;
  skipped: number;
  renamed: number;
  collectionsCreated: number;
  conflicts: Array<{
    id: string;
    title: string;
    action: "skipped" | "renamed";
    newId?: string;
  }>;
  errors: string[];
  warnings: string[];
}

const README_TEXT = `Audio Alchemy library backup
============================

Schema: ${LIBRARY_BACKUP_SCHEMA}

Layout:
  manifest.json     — collections + generation metadata (JSON)
  audio/<file>      — audio binaries referenced by manifest.audio[].archivePath
  README.txt        — this file

Import rules (in-app):
  - Archive is validated before any write
  - Existing track IDs are never overwritten silently
  - Conflicts: skip (default) or rename (new UUID)
`;

function audioExt(mime: string | null | undefined, audioPath: string | null): string {
  if (mime?.includes("wav")) return "wav";
  if (mime?.includes("flac")) return "flac";
  if (mime?.includes("mpeg") || mime?.includes("mp3")) return "mp3";
  if (audioPath) {
    const ext = path.extname(audioPath).replace(".", "");
    if (ext) return ext;
  }
  return "bin";
}

function generationToManifestRow(gen: Generation): Record<string, unknown> {
  const meta = buildMetadataExport(
    gen,
    gen.collectionId
      ? { id: gen.collectionId, name: gen.collectionName || "" }
      : null
  );
  return {
    id: gen.id,
    title: gen.title,
    prompt: gen.prompt,
    lyrics: gen.lyrics,
    style: gen.style,
    durationSec: gen.durationSec,
    status: gen.status,
    audioPath: gen.audioPath,
    audioMime: gen.audioMime,
    errorMessage: gen.errorMessage,
    mode: gen.mode,
    createdAt: gen.createdAt,
    updatedAt: gen.updatedAt,
    seed: gen.seed,
    bpm: gen.bpm,
    musicalKey: gen.musicalKey,
    modelName: gen.modelName,
    requestedModelName: gen.requestedModelName,
    actualModelName: gen.actualModelName,
    requestedCapability: gen.requestedCapability,
    actualCapability: gen.actualCapability,
    provider: gen.provider,
    preset: gen.preset,
    postFxPreset: gen.postFxPreset,
    generationMs: gen.generationMs,
    audioDurationSec: gen.audioDurationSec,
    resultJson: gen.resultJson,
    favorite: gen.favorite,
    userTags: gen.userTags,
    collectionId: gen.collectionId,
    metadataExport: meta,
  };
}

/** Build export zip buffer (metadata + audio files). */
export function exportLibraryArchive(): {
  filename: string;
  buffer: Buffer;
  trackCount: number;
  audioCount: number;
} {
  const collections = listCollections();
  const generations = listGenerations({});
  const audioEntries: LibraryBackupManifest["audio"] = [];
  const files: ArchiveFile[] = [];

  for (const gen of generations) {
    if (!gen.audioPath) continue;
    const abs = path.join(getAudioDir(), path.basename(gen.audioPath));
    if (!fs.existsSync(abs)) continue;
    const ext = audioExt(gen.audioMime, gen.audioPath);
    const archivePath = `audio/${gen.id}.${ext}`;
    files.push({ name: archivePath, data: fs.readFileSync(abs) });
    audioEntries.push({
      generationId: gen.id,
      archivePath,
      mime: gen.audioMime,
    });
  }

  const manifest: LibraryBackupManifest = {
    schema: LIBRARY_BACKUP_SCHEMA,
    exportedAt: new Date().toISOString(),
    app: "audio-alchemy",
    collections: collections.map((c) => ({
      id: c.id,
      name: c.name,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    generations: generations.map(generationToManifestRow),
    audio: audioEntries,
  };

  files.unshift({
    name: "manifest.json",
    data: Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
  });
  files.push({
    name: "README.txt",
    data: Buffer.from(README_TEXT, "utf8"),
  });

  const buffer = createArchiveZip(files);
  const stamp = new Date().toISOString().slice(0, 10);
  return {
    filename: `audio-alchemy-library-${stamp}.zip`,
    buffer,
    trackCount: generations.length,
    audioCount: audioEntries.length,
  };
}

function isStatus(v: unknown): v is GenerationStatus {
  return (
    v === "pending" ||
    v === "processing" ||
    v === "completed" ||
    v === "failed" ||
    v === "cancelled"
  );
}

function isMode(v: unknown): v is GenerationMode {
  return v === "mock" || v === "ace-step";
}

export interface ValidatedLibraryBackup {
  manifest: LibraryBackupManifest;
  audioById: Map<string, { archivePath: string; data: Buffer; mime: string | null }>;
}

/** Validate archive bytes without writing. Throws on hard errors. */
export function validateLibraryArchive(buf: Buffer): ValidatedLibraryBackup {
  if (!buf?.length) throw new Error("Empty archive");
  const entries = extractArchiveZip(buf);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const manifestEntry = byName.get("manifest.json");
  if (!manifestEntry) {
    throw new Error("Invalid library backup: missing manifest.json");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestEntry.data.toString("utf8"));
  } catch {
    throw new Error("Invalid library backup: manifest.json is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid library backup: manifest root must be an object");
  }
  const m = parsed as Record<string, unknown>;
  if (m.schema !== LIBRARY_BACKUP_SCHEMA) {
    throw new Error(
      `Invalid library backup: unsupported schema (expected ${LIBRARY_BACKUP_SCHEMA})`
    );
  }
  if (m.app !== "audio-alchemy") {
    throw new Error("Invalid library backup: app field must be audio-alchemy");
  }
  if (!Array.isArray(m.generations) || !Array.isArray(m.collections)) {
    throw new Error("Invalid library backup: collections/generations must be arrays");
  }
  if (!Array.isArray(m.audio)) {
    throw new Error("Invalid library backup: audio must be an array");
  }

  for (const row of m.generations as unknown[]) {
    if (!row || typeof row !== "object") {
      throw new Error("Invalid library backup: generation row must be an object");
    }
    const g = row as Record<string, unknown>;
    if (typeof g.id !== "string" || !g.id.trim()) {
      throw new Error("Invalid library backup: generation.id required");
    }
    if (typeof g.title !== "string" || typeof g.prompt !== "string") {
      throw new Error(`Invalid library backup: generation ${g.id} missing title/prompt`);
    }
    if (!isStatus(g.status)) {
      throw new Error(`Invalid library backup: generation ${g.id} has bad status`);
    }
    if (!isMode(g.mode)) {
      throw new Error(`Invalid library backup: generation ${g.id} has bad mode`);
    }
    if (!Number.isFinite(Number(g.durationSec))) {
      throw new Error(`Invalid library backup: generation ${g.id} has bad durationSec`);
    }
  }

  const audioById = new Map<
    string,
    { archivePath: string; data: Buffer; mime: string | null }
  >();
  for (const a of m.audio as unknown[]) {
    if (!a || typeof a !== "object") continue;
    const row = a as Record<string, unknown>;
    const generationId = String(row.generationId || "");
    const archivePath = String(row.archivePath || "").replace(/\\/g, "/");
    if (!generationId || !archivePath.startsWith("audio/")) {
      throw new Error("Invalid library backup: audio entry missing id/path");
    }
    if (archivePath.includes("..")) {
      throw new Error("Invalid library backup: unsafe audio path");
    }
    const file = byName.get(archivePath);
    if (!file) {
      throw new Error(
        `Invalid library backup: missing audio file ${archivePath} listed in manifest`
      );
    }
    audioById.set(generationId, {
      archivePath,
      data: file.data,
      mime: row.mime == null ? null : String(row.mime),
    });
  }

  const manifest: LibraryBackupManifest = {
    schema: LIBRARY_BACKUP_SCHEMA,
    exportedAt: typeof m.exportedAt === "string" ? m.exportedAt : "",
    app: "audio-alchemy",
    collections: (m.collections as LibraryBackupManifest["collections"]).map((c) => ({
      id: String(c.id),
      name: String(c.name),
      createdAt: String(c.createdAt || new Date().toISOString()),
      updatedAt: String(c.updatedAt || new Date().toISOString()),
    })),
    generations: m.generations as Array<Record<string, unknown>>,
    audio: m.audio as LibraryBackupManifest["audio"],
  };

  return { manifest, audioById };
}

function rowToGeneration(
  row: Record<string, unknown>,
  opts: { id: string; collectionId: string | null; audioPath: string | null }
): Generation {
  const now = new Date().toISOString();
  const postFx = row.postFxPreset;
  const preset = row.preset;
  return {
    id: opts.id,
    title: String(row.title),
    prompt: String(row.prompt),
    lyrics: row.lyrics == null ? null : String(row.lyrics),
    style: row.style == null ? null : String(row.style),
    durationSec: Number(row.durationSec) || 60,
    status: row.status as GenerationStatus,
    audioPath: opts.audioPath,
    audioMime: row.audioMime == null ? null : String(row.audioMime),
    errorMessage: row.errorMessage == null ? null : String(row.errorMessage),
    mode: row.mode as GenerationMode,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : now,
    updatedAt: now,
    externalTaskId: null,
    stage: null,
    progressMessage: null,
    progressPct: null,
    attemptCount: Number(row.attemptCount ?? 0) || 0,
    cancelRequested: false,
    seed: row.seed == null ? null : String(row.seed),
    bpm: row.bpm == null ? null : Number(row.bpm),
    musicalKey: row.musicalKey == null ? null : String(row.musicalKey),
    modelName: row.modelName == null ? null : String(row.modelName),
    requestedModelName:
      row.requestedModelName == null ? null : String(row.requestedModelName),
    actualModelName:
      row.actualModelName == null ? null : String(row.actualModelName),
    requestedCapability:
      row.requestedCapability == null ? null : String(row.requestedCapability),
    actualCapability:
      row.actualCapability == null ? null : String(row.actualCapability),
    provider: row.provider == null ? null : String(row.provider),
    preset: preset === "fast" || preset === "quality" ? preset : null,
    postFxPreset:
      postFx === "off" || postFx === "light" || postFx === "loudness"
        ? postFx
        : null,
    generationMs: row.generationMs == null ? null : Number(row.generationMs),
    audioDurationSec:
      row.audioDurationSec == null ? null : Number(row.audioDurationSec),
    resultJson: row.resultJson == null ? null : String(row.resultJson),
    planningMode:
      row.planningMode === "direct" || row.planningMode === "song-focus"
        ? row.planningMode
        : null,
    originalPrompt:
      row.originalPrompt == null ? null : String(row.originalPrompt),
    musicBrief: row.musicBrief == null ? null : String(row.musicBrief),
    favorite: Boolean(row.favorite),
    userTags: row.userTags == null ? null : String(row.userTags),
    collectionId: opts.collectionId,
  };
}

function ensureCollection(
  col: { id: string; name: string; createdAt: string; updatedAt: string },
  idMap: Map<string, string>,
  report: LibraryImportReport
): string {
  if (idMap.has(col.id)) return idMap.get(col.id)!;
  const existing = getCollection(col.id);
  if (existing) {
    idMap.set(col.id, existing.id);
    return existing.id;
  }
  // Try by name (unique NOCASE)
  try {
    const created = createCollection(col.name, col.id);
    idMap.set(col.id, created.id);
    report.collectionsCreated += 1;
    return created.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/already exists/i.test(msg)) {
      // Name taken — create with renamed id + unique name suffix
      const newId = randomUUID();
      const created = createCollection(`${col.name} (import)`, newId);
      idMap.set(col.id, created.id);
      report.collectionsCreated += 1;
      report.warnings.push(
        `Collection "${col.name}" renamed on import to avoid name clash`
      );
      return created.id;
    }
    throw err;
  }
}

/**
 * Import a validated archive. conflictMode: skip (default) or rename.
 * Never overwrites an existing generation id/audio silently.
 */
export function importLibraryArchive(
  buf: Buffer,
  conflictMode: ImportConflictMode = "skip"
): LibraryImportReport {
  const validated = validateLibraryArchive(buf);
  const report: LibraryImportReport = {
    ok: true,
    imported: 0,
    skipped: 0,
    renamed: 0,
    collectionsCreated: 0,
    conflicts: [],
    errors: [],
    warnings: [],
  };

  const collectionIdMap = new Map<string, string>();
  for (const col of validated.manifest.collections) {
    try {
      ensureCollection(col, collectionIdMap, report);
    } catch (err) {
      report.errors.push(
        err instanceof Error ? err.message : "Collection import failed"
      );
    }
  }

  const audioDir = getAudioDir();
  fs.mkdirSync(audioDir, { recursive: true });

  for (const row of validated.manifest.generations) {
    try {
      const originalId = String(row.id);
      const title = String(row.title || "Untitled");
      const exists = getGeneration(originalId);
      let id = originalId;
      let action: "skipped" | "renamed" | null = null;

      if (exists) {
        if (conflictMode === "skip") {
          report.skipped += 1;
          report.conflicts.push({ id: originalId, title, action: "skipped" });
          continue;
        }
        id = randomUUID();
        action = "renamed";
        report.renamed += 1;
        report.conflicts.push({
          id: originalId,
          title,
          action: "renamed",
          newId: id,
        });
      }

      const mappedCollection =
        row.collectionId && collectionIdMap.has(String(row.collectionId))
          ? collectionIdMap.get(String(row.collectionId))!
          : row.collectionId && getCollection(String(row.collectionId))
            ? String(row.collectionId)
            : null;

      const audio = validated.audioById.get(originalId);
      let audioPath: string | null = null;
      let audioMime = row.audioMime == null ? null : String(row.audioMime);

      if (audio) {
        const ext = path.extname(audio.archivePath) || `.${audioExt(audio.mime, null)}`;
        const filename = `${id}${ext.startsWith(".") ? ext : `.${ext}`}`;
        const dest = path.join(audioDir, filename);
        if (fs.existsSync(dest)) {
          // Should not happen for new UUIDs; still refuse overwrite.
          report.errors.push(
            `Refusing to overwrite existing audio file for ${filename}`
          );
          continue;
        }
        fs.writeFileSync(dest, audio.data);
        audioPath = filename;
        audioMime = audio.mime ?? audioMime;
      }

      const gen = rowToGeneration(row, {
        id,
        collectionId: mappedCollection,
        audioPath,
      });
      if (audioMime) gen.audioMime = audioMime;
      insertGeneration(gen);
      report.imported += 1;
      void action;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import row failed";
      report.errors.push(msg);
      if (/ENOSPC|EACCES|EPERM|read-only/i.test(msg)) {
        report.ok = false;
        break;
      }
    }
  }

  if (report.errors.length && report.imported === 0) {
    report.ok = false;
  }
  return report;
}
