import Database from "better-sqlite3";
import { getDbPath } from "./paths";
import type {
  Collection,
  Generation,
  GenerationStatus,
  GenerationMode,
  GenerationUpdatePatch,
  ListGenerationsQuery,
  GenerationSort,
  PlanningMode,
} from "./types";
import { parseUserTags } from "./library-meta";

let dbInstance: Database.Database | null = null;

const MIGRATION_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "external_task_id", ddl: "ALTER TABLE generations ADD COLUMN external_task_id TEXT" },
  { name: "stage", ddl: "ALTER TABLE generations ADD COLUMN stage TEXT" },
  { name: "progress_message", ddl: "ALTER TABLE generations ADD COLUMN progress_message TEXT" },
  { name: "progress_pct", ddl: "ALTER TABLE generations ADD COLUMN progress_pct REAL" },
  {
    name: "attempt_count",
    ddl: "ALTER TABLE generations ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0",
  },
  {
    name: "cancel_requested",
    ddl: "ALTER TABLE generations ADD COLUMN cancel_requested INTEGER NOT NULL DEFAULT 0",
  },
  { name: "seed", ddl: "ALTER TABLE generations ADD COLUMN seed TEXT" },
  { name: "bpm", ddl: "ALTER TABLE generations ADD COLUMN bpm REAL" },
  { name: "musical_key", ddl: "ALTER TABLE generations ADD COLUMN musical_key TEXT" },
  { name: "model_name", ddl: "ALTER TABLE generations ADD COLUMN model_name TEXT" },
  { name: "generation_ms", ddl: "ALTER TABLE generations ADD COLUMN generation_ms INTEGER" },
  {
    name: "audio_duration_sec",
    ddl: "ALTER TABLE generations ADD COLUMN audio_duration_sec REAL",
  },
  { name: "result_json", ddl: "ALTER TABLE generations ADD COLUMN result_json TEXT" },
  { name: "preset", ddl: "ALTER TABLE generations ADD COLUMN preset TEXT" },
  { name: "requested_model_name", ddl: "ALTER TABLE generations ADD COLUMN requested_model_name TEXT" },
  { name: "actual_model_name", ddl: "ALTER TABLE generations ADD COLUMN actual_model_name TEXT" },
  { name: "requested_capability", ddl: "ALTER TABLE generations ADD COLUMN requested_capability TEXT" },
  { name: "actual_capability", ddl: "ALTER TABLE generations ADD COLUMN actual_capability TEXT" },
  { name: "provider", ddl: "ALTER TABLE generations ADD COLUMN provider TEXT" },
  // Phase 3 — library workflow (non-destructive)
  {
    name: "favorite",
    ddl: "ALTER TABLE generations ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0",
  },
  { name: "user_tags", ddl: "ALTER TABLE generations ADD COLUMN user_tags TEXT" },
  { name: "collection_id", ddl: "ALTER TABLE generations ADD COLUMN collection_id TEXT" },
  // Phase 4 — optional post-FX preset (off|light|loudness)
  { name: "post_fx_preset", ddl: "ALTER TABLE generations ADD COLUMN post_fx_preset TEXT" },
  // Song focus — planning fields (non-destructive; never store chain-of-thought)
  { name: "planning_mode", ddl: "ALTER TABLE generations ADD COLUMN planning_mode TEXT" },
  { name: "original_prompt", ddl: "ALTER TABLE generations ADD COLUMN original_prompt TEXT" },
  { name: "music_brief", ddl: "ALTER TABLE generations ADD COLUMN music_brief TEXT" },
];

function migrateGenerations(db: Database.Database): void {
  const cols = db
    .prepare("PRAGMA table_info(generations)")
    .all() as Array<{ name: string }>;
  const existing = new Set(cols.map((c) => c.name));
  for (const col of MIGRATION_COLUMNS) {
    if (existing.has(col.name)) continue;
    try {
      db.exec(col.ddl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/duplicate column/i.test(msg)) throw err;
    }
  }
}

function migrateCollections(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_name_unique ON collections(name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_generations_favorite ON generations(favorite);
    CREATE INDEX IF NOT EXISTS idx_generations_collection_id ON generations(collection_id);
  `);
}

function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  const db = new Database(getDbPath());
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS generations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      lyrics TEXT,
      style TEXT,
      duration_sec INTEGER NOT NULL,
      status TEXT NOT NULL,
      audio_path TEXT,
      audio_mime TEXT,
      error_message TEXT,
      mode TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      external_task_id TEXT,
      stage TEXT,
      progress_message TEXT,
      progress_pct REAL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      cancel_requested INTEGER NOT NULL DEFAULT 0,
      seed TEXT,
      bpm REAL,
      musical_key TEXT,
      model_name TEXT,
      preset TEXT,
      requested_model_name TEXT,
      actual_model_name TEXT,
      requested_capability TEXT,
      actual_capability TEXT,
      provider TEXT,
      generation_ms INTEGER,
      audio_duration_sec REAL,
      result_json TEXT,
      favorite INTEGER NOT NULL DEFAULT 0,
      user_tags TEXT,
      collection_id TEXT,
      post_fx_preset TEXT,
      planning_mode TEXT,
      original_prompt TEXT,
      music_brief TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at DESC);
  `);
  migrateGenerations(db);
  migrateCollections(db);
  dbInstance = db;
  return db;
}

/** Test helper: reset singleton (e.g. after pointing DATA_DIR at a temp dir). */
export function resetDbSingletonForTests(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore
    }
  }
  dbInstance = null;
}

function nullableNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function rowToGeneration(row: Record<string, unknown>): Generation {
  return {
    id: String(row.id),
    title: String(row.title),
    prompt: String(row.prompt),
    lyrics: row.lyrics == null ? null : String(row.lyrics),
    style: row.style == null ? null : String(row.style),
    durationSec: Number(row.duration_sec),
    status: String(row.status) as GenerationStatus,
    audioPath: row.audio_path == null ? null : String(row.audio_path),
    audioMime: row.audio_mime == null ? null : String(row.audio_mime),
    errorMessage: row.error_message == null ? null : String(row.error_message),
    mode: String(row.mode) as GenerationMode,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    externalTaskId: row.external_task_id == null ? null : String(row.external_task_id),
    stage: row.stage == null ? null : String(row.stage),
    progressMessage: row.progress_message == null ? null : String(row.progress_message),
    progressPct: nullableNumber(row.progress_pct),
    attemptCount: Number(row.attempt_count ?? 0),
    cancelRequested: Number(row.cancel_requested ?? 0) === 1,
    seed: row.seed == null ? null : String(row.seed),
    bpm: nullableNumber(row.bpm),
    musicalKey: row.musical_key == null ? null : String(row.musical_key),
    modelName: row.model_name == null ? null : String(row.model_name),
    requestedModelName:
      row.requested_model_name == null ? null : String(row.requested_model_name),
    actualModelName:
      row.actual_model_name == null ? null : String(row.actual_model_name),
    requestedCapability:
      row.requested_capability == null ? null : String(row.requested_capability),
    actualCapability:
      row.actual_capability == null ? null : String(row.actual_capability),
    provider: row.provider == null ? null : String(row.provider),
    preset:
      row.preset === "fast" || row.preset === "quality"
        ? (row.preset as "fast" | "quality")
        : null,
    generationMs: nullableNumber(row.generation_ms),
    audioDurationSec: nullableNumber(row.audio_duration_sec),
    resultJson: row.result_json == null ? null : String(row.result_json),
    favorite: Number(row.favorite ?? 0) === 1,
    userTags: row.user_tags == null ? null : String(row.user_tags),
    collectionId: row.collection_id == null ? null : String(row.collection_id),
    collectionName:
      row.collection_name == null ? null : String(row.collection_name),
    postFxPreset:
      row.post_fx_preset === "off" ||
      row.post_fx_preset === "light" ||
      row.post_fx_preset === "loudness"
        ? (row.post_fx_preset as "off" | "light" | "loudness")
        : null,
    planningMode:
      row.planning_mode === "direct" || row.planning_mode === "song-focus"
        ? (row.planning_mode as PlanningMode)
        : null,
    originalPrompt:
      row.original_prompt == null ? null : String(row.original_prompt),
    musicBrief: row.music_brief == null ? null : String(row.music_brief),
  };
}

function rowToCollection(row: Record<string, unknown>): Collection {
  return {
    id: String(row.id),
    name: String(row.name),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function insertGeneration(gen: Generation): Generation {
  const db = getDb();
  db.prepare(`
    INSERT INTO generations (
      id, title, prompt, lyrics, style, duration_sec, status,
      audio_path, audio_mime, error_message, mode, created_at, updated_at,
      external_task_id, stage, progress_message, progress_pct,
      attempt_count, cancel_requested, seed, bpm, musical_key,
      model_name, preset, requested_model_name, actual_model_name,
      requested_capability, actual_capability, provider,
      generation_ms, audio_duration_sec, result_json,
      favorite, user_tags, collection_id, post_fx_preset,
      planning_mode, original_prompt, music_brief
    ) VALUES (
      @id, @title, @prompt, @lyrics, @style, @durationSec, @status,
      @audioPath, @audioMime, @errorMessage, @mode, @createdAt, @updatedAt,
      @externalTaskId, @stage, @progressMessage, @progressPct,
      @attemptCount, @cancelRequested, @seed, @bpm, @musicalKey,
      @modelName, @preset, @requestedModelName, @actualModelName,
      @requestedCapability, @actualCapability, @provider,
      @generationMs, @audioDurationSec, @resultJson,
      @favorite, @userTags, @collectionId, @postFxPreset,
      @planningMode, @originalPrompt, @musicBrief
    )
  `).run({
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
    externalTaskId: gen.externalTaskId,
    stage: gen.stage,
    progressMessage: gen.progressMessage,
    progressPct: gen.progressPct,
    attemptCount: gen.attemptCount,
    cancelRequested: gen.cancelRequested ? 1 : 0,
    seed: gen.seed,
    bpm: gen.bpm,
    musicalKey: gen.musicalKey,
    modelName: gen.modelName,
    preset: gen.preset,
    requestedModelName: gen.requestedModelName,
    actualModelName: gen.actualModelName,
    requestedCapability: gen.requestedCapability,
    actualCapability: gen.actualCapability,
    provider: gen.provider,
    generationMs: gen.generationMs,
    audioDurationSec: gen.audioDurationSec,
    resultJson: gen.resultJson,
    favorite: gen.favorite ? 1 : 0,
    userTags: gen.userTags,
    collectionId: gen.collectionId,
    postFxPreset: gen.postFxPreset,
    planningMode: gen.planningMode,
    originalPrompt: gen.originalPrompt,
    musicBrief: gen.musicBrief,
  });
  return gen;
}

export function updateGeneration(
  id: string,
  patch: GenerationUpdatePatch
): Generation | null {
  const existing = getGeneration(id);
  if (!existing) return null;
  const updated: Generation = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  getDb()
    .prepare(`
      UPDATE generations SET
        title = @title,
        status = @status,
        audio_path = @audioPath,
        audio_mime = @audioMime,
        error_message = @errorMessage,
        updated_at = @updatedAt,
        external_task_id = @externalTaskId,
        stage = @stage,
        progress_message = @progressMessage,
        progress_pct = @progressPct,
        attempt_count = @attemptCount,
        cancel_requested = @cancelRequested,
        seed = @seed,
        bpm = @bpm,
        musical_key = @musicalKey,
        model_name = @modelName,
        preset = @preset,
        requested_model_name = @requestedModelName,
        actual_model_name = @actualModelName,
        requested_capability = @requestedCapability,
        actual_capability = @actualCapability,
        provider = @provider,
        generation_ms = @generationMs,
        audio_duration_sec = @audioDurationSec,
        result_json = @resultJson,
        favorite = @favorite,
        user_tags = @userTags,
        collection_id = @collectionId,
        post_fx_preset = @postFxPreset,
        planning_mode = @planningMode,
        original_prompt = @originalPrompt,
        music_brief = @musicBrief
      WHERE id = @id
    `)
    .run({
      id: updated.id,
      title: updated.title,
      status: updated.status,
      audioPath: updated.audioPath,
      audioMime: updated.audioMime,
      errorMessage: updated.errorMessage,
      updatedAt: updated.updatedAt,
      externalTaskId: updated.externalTaskId,
      stage: updated.stage,
      progressMessage: updated.progressMessage,
      progressPct: updated.progressPct,
      attemptCount: updated.attemptCount,
      cancelRequested: updated.cancelRequested ? 1 : 0,
      seed: updated.seed,
      bpm: updated.bpm,
      musicalKey: updated.musicalKey,
      modelName: updated.modelName,
      preset: updated.preset,
      requestedModelName: updated.requestedModelName,
      actualModelName: updated.actualModelName,
      requestedCapability: updated.requestedCapability,
      actualCapability: updated.actualCapability,
      provider: updated.provider,
      generationMs: updated.generationMs,
      audioDurationSec: updated.audioDurationSec,
      resultJson: updated.resultJson,
      favorite: updated.favorite ? 1 : 0,
      userTags: updated.userTags,
      collectionId: updated.collectionId,
      postFxPreset: updated.postFxPreset,
      planningMode: updated.planningMode,
      originalPrompt: updated.originalPrompt,
      musicBrief: updated.musicBrief,
    });
  return updated;
}

export function getGeneration(id: string): Generation | null {
  const row = getDb()
    .prepare(
      `SELECT g.*, c.name AS collection_name
       FROM generations g
       LEFT JOIN collections c ON c.id = g.collection_id
       WHERE g.id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToGeneration(row) : null;
}

const ALLOWED_STATUSES: ReadonlySet<string> = new Set([
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);

const SORT_SQL: Record<GenerationSort, string> = {
  created_at_desc: "g.created_at DESC",
  created_at_asc: "g.created_at ASC",
  title_asc: "g.title COLLATE NOCASE ASC",
  title_desc: "g.title COLLATE NOCASE DESC",
  duration_desc:
    "COALESCE(g.audio_duration_sec, g.duration_sec) DESC, g.created_at DESC",
};

export function listGenerations(query: ListGenerationsQuery = {}): Generation[] {
  const clauses: string[] = [];
  const params: unknown[] = [];

  const statuses = (query.status ?? []).filter((s) => ALLOWED_STATUSES.has(s));
  if (statuses.length === 1) {
    clauses.push("g.status = ?");
    params.push(statuses[0]);
  } else if (statuses.length > 1) {
    clauses.push(`g.status IN (${statuses.map(() => "?").join(", ")})`);
    params.push(...statuses);
  }

  if (query.favorite === true) {
    clauses.push("g.favorite = 1");
  }

  if (query.collectionId === "" || query.collectionId === "none") {
    clauses.push("g.collection_id IS NULL");
  } else if (query.collectionId) {
    clauses.push("g.collection_id = ?");
    params.push(query.collectionId);
  }

  const tag = query.tag?.trim();
  if (tag) {
    const like = `%${tag.replace(/[%_]/g, (ch) => `\\${ch}`)}%`;
    clauses.push(
      `(IFNULL(g.user_tags, '') LIKE ? ESCAPE '\\' OR IFNULL(g.style, '') LIKE ? ESCAPE '\\')`
    );
    params.push(like, like);
  }

  const q = query.q?.trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, (ch) => `\\${ch}`)}%`;
    clauses.push(
      `(g.title LIKE ? ESCAPE '\\'
        OR g.prompt LIKE ? ESCAPE '\\'
        OR IFNULL(g.lyrics, '') LIKE ? ESCAPE '\\'
        OR IFNULL(g.style, '') LIKE ? ESCAPE '\\'
        OR IFNULL(g.user_tags, '') LIKE ? ESCAPE '\\'
        OR IFNULL(c.name, '') LIKE ? ESCAPE '\\')`
    );
    params.push(like, like, like, like, like, like);
  }

  const sort: GenerationSort =
    query.sort && query.sort in SORT_SQL ? query.sort : "created_at_desc";
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const sql = `
    SELECT g.*, c.name AS collection_name
    FROM generations g
    LEFT JOIN collections c ON c.id = g.collection_id
    ${where}
    ORDER BY ${SORT_SQL[sort]}
  `;
  const rows = getDb().prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(rowToGeneration);
}

/** List rows matching exact statuses (for bulk cleanup). */
export function listGenerationsByStatus(statuses: GenerationStatus[]): Generation[] {
  const allowed = statuses.filter((s) => ALLOWED_STATUSES.has(s));
  if (allowed.length === 0) return [];
  return listGenerations({ status: allowed });
}

export function listOpenGenerations(): Generation[] {
  const rows = getDb()
    .prepare(
      `SELECT g.*, c.name AS collection_name
       FROM generations g
       LEFT JOIN collections c ON c.id = g.collection_id
       WHERE g.status IN ('pending', 'processing')
       ORDER BY g.created_at ASC`
    )
    .all() as Record<string, unknown>[];
  return rows.map(rowToGeneration);
}

export function deleteGenerationRow(id: string): boolean {
  const result = getDb().prepare("DELETE FROM generations WHERE id = ?").run(id);
  return result.changes > 0;
}

// --- Collections (local folders) ---

export function listCollections(): Collection[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM collections ORDER BY name COLLATE NOCASE ASC`
    )
    .all() as Record<string, unknown>[];
  return rows.map(rowToCollection);
}

export function getCollection(id: string): Collection | null {
  const row = getDb()
    .prepare(`SELECT * FROM collections WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToCollection(row) : null;
}

export function createCollection(name: string, id: string): Collection {
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) throw new Error("Collection name is required");
  const now = new Date().toISOString();
  const col: Collection = {
    id,
    name: trimmed,
    createdAt: now,
    updatedAt: now,
  };
  try {
    getDb()
      .prepare(
        `INSERT INTO collections (id, name, created_at, updated_at)
         VALUES (@id, @name, @createdAt, @updatedAt)`
      )
      .run({
        id: col.id,
        name: col.name,
        createdAt: col.createdAt,
        updatedAt: col.updatedAt,
      });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/UNIQUE/i.test(msg)) {
      throw new Error("A collection with that name already exists");
    }
    throw err;
  }
  return col;
}

export function renameCollection(id: string, name: string): Collection | null {
  const existing = getCollection(id);
  if (!existing) return null;
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) throw new Error("Collection name is required");
  const updatedAt = new Date().toISOString();
  try {
    getDb()
      .prepare(
        `UPDATE collections SET name = ?, updated_at = ? WHERE id = ?`
      )
      .run(trimmed, updatedAt, id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/UNIQUE/i.test(msg)) {
      throw new Error("A collection with that name already exists");
    }
    throw err;
  }
  return { ...existing, name: trimmed, updatedAt };
}

/** Deletes the folder only; generations become unfiled (non-destructive). */
export function deleteCollection(id: string): boolean {
  const db = getDb();
  const existing = getCollection(id);
  if (!existing) return false;
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE generations SET collection_id = NULL, updated_at = ? WHERE collection_id = ?`
    ).run(new Date().toISOString(), id);
    db.prepare(`DELETE FROM collections WHERE id = ?`).run(id);
  });
  tx();
  return true;
}

export function generationHasUserTag(gen: Generation, tag: string): boolean {
  const needle = tag.trim().toLowerCase();
  if (!needle) return false;
  return parseUserTags(gen.userTags).some((t) => t.toLowerCase() === needle);
}
