export type GenerationStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type GenerationMode = "mock" | "ace-step";

export type QualityPresetId = "fast" | "quality";

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
  generationMs: number | null;
  audioDurationSec: number | null;
  resultJson: string | null;
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
    | "generationMs"
    | "audioDurationSec"
    | "resultJson"
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
}
