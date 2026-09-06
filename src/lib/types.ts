export type GenerationStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type GenerationMode = "mock" | "ace-step";

export type QualityPresetId = "fast" | "quality";

/** Create planning path: Direct (default) or Song focus (local ACE planner). */
export type PlanningMode = "direct" | "song-focus";

/** Optional Create post-FX; default off. */
export type PostFxPreset = "off" | "light" | "loudness";

export interface Collection {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Generation {
  id: string;
  title: string;
  prompt: string;
  lyrics: string | null;
  style: string | null;
  durationSec: number;
  status: GenerationStatus;
  audioPath: string | null;
  audioMime: string | null;
  errorMessage: string | null;
  mode: GenerationMode;
  createdAt: string;
  updatedAt: string;
  /** ACE-Step (or other) remote task id for durable polling. */
  externalTaskId: string | null;
  stage: string | null;
  progressMessage: string | null;
  progressPct: number | null;
  attemptCount: number;
  cancelRequested: boolean;
  seed: string | null;
  bpm: number | null;
  musicalKey: string | null;
  modelName: string | null;
  /** Requested checkpoint id at submit time (may differ from what actually ran). */
  requestedModelName: string | null;
  /** Confirmed checkpoint id from result payload; null until confirmed. */
  actualModelName: string | null;
  /** Requested capability id (e.g. local-2b-sft, remote-xl-sft). */
  requestedCapability: string | null;
  /** Confirmed capability id from result / completed generation; null until confirmed. */
  actualCapability: string | null;
  /** Provider that was routed: local | remote. */
  provider: string | null;
  /** Fast vs Quality preset used for this generation (persisted). */
  preset: QualityPresetId | null;
  /** Optional post-FX preset (off|light|loudness); default off. */
  postFxPreset: PostFxPreset | null;
  generationMs: number | null;
  audioDurationSec: number | null;
  resultJson: string | null;
  /** Direct vs Song focus; null on legacy rows. */
  planningMode: PlanningMode | null;
  /** User's original typed prompt (Song focus); null when Direct / legacy. */
  originalPrompt: string | null;
  /** Final music brief submitted to ACE (Song focus); null when Direct / legacy. */
  musicBrief: string | null;
  /** Local library favorite flag. */
  favorite: boolean;
  /** User-defined library tags (JSON array in SQLite). */
  userTags: string | null;
  /** Local collection/folder id; null = unfiled. */
  collectionId: string | null;
  /** Joined collection name when listed with join (optional). */
  collectionName?: string | null;
}

export type GenerationUpdatePatch = Partial<
  Pick<
    Generation,
    | "title"
    | "status"
    | "audioPath"
    | "audioMime"
    | "errorMessage"
    | "externalTaskId"
    | "stage"
    | "progressMessage"
    | "progressPct"
    | "attemptCount"
    | "cancelRequested"
    | "seed"
    | "bpm"
    | "musicalKey"
    | "modelName"
    | "requestedModelName"
    | "actualModelName"
    | "requestedCapability"
    | "actualCapability"
    | "provider"
    | "preset"
    | "postFxPreset"
    | "planningMode"
    | "originalPrompt"
    | "musicBrief"
    | "generationMs"
    | "audioDurationSec"
    | "resultJson"
    | "favorite"
    | "userTags"
    | "collectionId"
  >
>;

export interface CreateGenerationInput {
  prompt: string;
  lyrics?: string;
  style?: string;
  durationSec: number;
  title?: string;
  /** Fast (Turbo) or Quality (SFT). */
  preset?: QualityPresetId;
  /** Optional ACE-Step overrides (server applies; never browser env secrets). */
  model?: string;
  inferenceSteps?: number;
  audioFormat?: "mp3" | "wav" | "flac" | "opus" | "aac";
  batchSize?: number;
  thinking?: boolean;
  /** When set, create is a variation of this track (new seed). */
  variationOf?: string;
  /** Optional post-FX: off (default) | light | loudness. */
  postFxPreset?: PostFxPreset;
  /** Direct (default) or Song focus. */
  planningMode?: PlanningMode;
  /**
   * Final music brief for Song focus (compiled + user edits).
   * Direct mode ignores this and submits prompt as today.
   */
  musicBrief?: string;
}

export type GenerationSort =
  | "created_at_desc"
  | "created_at_asc"
  | "title_asc"
  | "title_desc"
  | "duration_desc";

export interface ListGenerationsQuery {
  q?: string;
  status?: GenerationStatus[];
  sort?: GenerationSort;
  /** When true, only favorites. */
  favorite?: boolean;
  /** Filter by collection id; use "" or "none" for unfiled. */
  collectionId?: string | null;
  /** Filter tracks that include this user tag (case-insensitive). */
  tag?: string;
}
