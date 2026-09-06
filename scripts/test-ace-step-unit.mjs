/**
 * Unit tests for ACE-Step extract helpers, settings, capabilities, and truthful labeling.
 * Compiles TS helpers with local tsc, then asserts coverage.
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, ".tmp-unit");
const require = createRequire(import.meta.url);

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    throw new Error(`${cmd} ${args.join(" ")} failed`);
  }
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// The extensionless TypeScript launcher cannot be spawned directly on Windows.
run(process.execPath, [
  path.join(root, "node_modules/typescript/bin/tsc"),
  "--outDir",
  outDir,
  "--module",
  "commonjs",
  "--moduleResolution",
  "node",
  "--esModuleInterop",
  "--target",
  "ES2020",
  "--skipLibCheck",
  "src/lib/ace-step-client.ts",
  "src/lib/ace-step-settings.ts",
  "src/lib/model-family.ts",
  "src/lib/ace-capabilities.ts",
  "src/lib/ace-provider.ts",
  "src/lib/library-meta.ts",
  "src/lib/paths.ts",
  "src/lib/db.ts",
  "src/lib/postprocess.ts",
  "src/lib/templates.ts",
  "src/lib/diagnostics.ts",
  "src/lib/user-errors.ts",
  "src/lib/archive-util.ts",
  "src/lib/library-backup.ts",
  "src/lib/prompt-compiler.ts",
  "src/lib/ace-planner.ts",
  "src/lib/create-health-ui.ts",
  "src/lib/generation-mode.ts",
]);

const { extractAudioPath, extractResultMetadata } = require(
  path.join(outDir, "ace-step-client.js")
);
const {
  getAceStepEnvSettings,
  mergeAceStepSettings,
  getSafeSettingsSummary,
  parseAceStepOverridesFromBody,
} = require(path.join(outDir, "ace-step-settings.js"));
const {
  capabilityFromModelId,
  detectCapabilitiesFromInventory,
  resolveDisplayModelLabel,
  parseQualityTier,
  capabilityFamilyLabel,
} = require(path.join(outDir, "ace-capabilities.js"));
const {
  resolveAceRoute,
  AceRouteError,
  buildCapabilityStatuses,
} = require(path.join(outDir, "ace-provider.js"));
const {
  parsePostFxPreset,
  resolvePostFxPreset,
  buildFilterChain,
  postFxPresetLabel,
} = require(path.join(outDir, "postprocess.js"));
const { loadPromptTemplates, listTemplatePacks, assertTemplateArtistFree } = require(path.join(outDir, "templates.js"));
const {
  compileMusicBrief,
  dedupeTags,
  detectStylePromptConflicts,
  clearConflictingTags,
  thinkingForPlanningMode,
  parsePlanningMode,
} = require(path.join(outDir, "prompt-compiler.js"));
const {
  looksLikePlannerOrLm,
  findPlannerModels,
  resolvePlannerAvailability,
} = require(path.join(outDir, "ace-planner.js"));
const {
  resolveEnginePillState,
  enginePillLabel,
  inventoryHasSft,
  qualitySegmentHint,
  isSongFocusBlocked,
} = require(path.join(outDir, "create-health-ui.js"));

let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  passed += 1;
}

// --- extractAudioPath: file / first_audio_path / audio_paths ---
assert(
  extractAudioPath({ file: "/tmp/out.mp3" }) === "/tmp/out.mp3",
  "file key"
);
assert(
  extractAudioPath({ first_audio_path: "/data/a.wav" }) === "/data/a.wav",
  "first_audio_path"
);
assert(
  extractAudioPath({ audio_paths: ["/a.mp3", "/b.mp3"] }) === "/a.mp3",
  "audio_paths array of strings"
);
assert(
  extractAudioPath({ audio_paths: [{ path: "/nested.flac" }] }) === "/nested.flac",
  "audio_paths nested objects"
);
assert(
  extractAudioPath({ audioPaths: ["https://x/y.mp3"] }) === "https://x/y.mp3",
  "audioPaths camelCase"
);
assert(
  extractAudioPath('{"file":"/from-json.mp3"}') === "/from-json.mp3",
  "JSON string envelope"
);
assert(
  extractAudioPath("/plain/path.mp3") === "/plain/path.mp3",
  "plain path string"
);
assert(
  extractAudioPath({ result: { data: { first_audio_path: "/deep.mp3" } } }) ===
    "/deep.mp3",
  "nested result.data"
);
assert(extractAudioPath(null) === undefined, "null -> undefined");
assert(extractAudioPath({}) === undefined, "empty object");

const meta = extractResultMetadata({
  bpm: 120,
  key: "Am",
  seed: 42,
  model_name: "ace-step",
  audio_duration: 60.5,
  generation_ms: 9000,
});
assert(meta.bpm === 120, "meta bpm");
assert(meta.musicalKey === "Am", "meta key");
assert(meta.seed === "42", "meta seed");
assert(meta.modelName === "ace-step", "meta model");
assert(meta.durationSec === 60.5, "meta duration");
assert(meta.generationMs === 9000, "meta gen ms");

// --- settings ---
const prev = { ...process.env };
process.env.ACESTEP_INFERENCE_STEPS = "8";
process.env.ACESTEP_AUDIO_FORMAT = "mp3";
process.env.ACESTEP_BATCH_SIZE = "1";
process.env.ACESTEP_THINKING = "false";
process.env.ACESTEP_POLL_INTERVAL_MS = "2000";
process.env.ACESTEP_TIMEOUT_MS = "600000";
delete process.env.ACESTEP_MODEL;
delete process.env.ACESTEP_API_KEY;
delete process.env.HF_TOKEN;

const env = getAceStepEnvSettings();
assert(env.inferenceSteps === 8, "default steps");
assert(env.audioFormat === "mp3", "default format");
assert(env.batchSize === 1, "default batch");
assert(env.thinking === false, "default thinking");
assert(env.pollIntervalMs === 2000, "poll");
assert(env.timeoutMs === 600000, "timeout");

const merged = mergeAceStepSettings({
  inferenceSteps: 12,
  thinking: true,
  model: "custom-model",
});
assert(merged.inferenceSteps === 12, "override steps");
assert(merged.thinking === true, "override thinking");
assert(merged.model === "custom-model", "override model");
assert(merged.batchSize === 1, "batch unchanged");

const body = parseAceStepOverridesFromBody({
  inference_steps: 6,
  audio_format: "wav",
  thinking: "true",
});
assert(body?.inferenceSteps === 6, "body steps");
assert(body?.audioFormat === "wav", "body format");
assert(body?.thinking === true, "body thinking");

const summary = getSafeSettingsSummary(false);
assert(summary.singleFlight === true, "singleFlight flag");
assert(summary.hasApiKey === false, "no key");
assert(!("ACESTEP_API_KEY" in summary), "no secret key field");
assert(typeof summary === "object", "summary object");
const json = JSON.stringify(summary);
assert(!json.includes("sk-"), "no sk tokens");
assert(summary.inferenceSteps === 8, "summary steps");

// --- capability detection from inventory ---
assert(
  capabilityFromModelId("acestep-v15-turbo", "local") === "local-2b-turbo",
  "cap local turbo"
);
assert(
  capabilityFromModelId("acestep-v15-sft", "local") === "local-2b-sft",
  "cap local sft"
);
assert(
  capabilityFromModelId("acestep-v15-xl-sft", "local") === null,
  "cap local rejects xl"
);
assert(
  capabilityFromModelId("acestep-v15-xl-sft", "remote") === "remote-xl-sft",
  "cap remote xl-sft"
);
assert(
  capabilityFromModelId("acestep-v15-xl-turbo", "remote") === "remote-xl-turbo",
  "cap remote xl-turbo"
);
assert(
  capabilityFromModelId("acestep-v15-sft", "remote") === null,
  "cap remote ignores non-xl"
);

const localMap = detectCapabilitiesFromInventory(
  ["acestep-v15-turbo", "acestep-v15-sft", "acestep-v15-xl-sft"],
  "local"
);
assert(localMap.has("local-2b-turbo"), "inventory local turbo");
assert(localMap.has("local-2b-sft"), "inventory local sft");
assert(!localMap.has("remote-xl-sft"), "inventory local skips xl");

const remoteMap = detectCapabilitiesFromInventory(
  ["acestep-v15-xl-sft", "acestep-v15-xl-turbo", "acestep-v15-sft"],
  "remote"
);
assert(remoteMap.get("remote-xl-sft") === "acestep-v15-xl-sft", "inventory remote xl-sft");
assert(remoteMap.has("remote-xl-turbo"), "inventory remote xl-turbo");
assert(!remoteMap.has("local-2b-sft"), "inventory remote skips 2b");

assert(parseQualityTier("local-sft") === "local-sft", "tier local");
assert(parseQualityTier("remote-xl-sft") === "remote-xl-sft", "tier remote");
assert(parseQualityTier("bogus") === "local-sft", "tier fallback");
assert(capabilityFamilyLabel("remote-xl-sft") === "XL", "family XL");
assert(capabilityFamilyLabel("local-2b-turbo") === "Turbo", "family Turbo");
assert(capabilityFamilyLabel("local-2b-sft") === "SFT", "family SFT");

// buildCapabilityStatuses: available vs configured
const capsConfiguredOnly = buildCapabilityStatuses(
  {
    local: { reachable: true, models: ["acestep-v15-turbo", "acestep-v15-sft"], source: "t" },
    remote: {
      configured: true,
      reachable: true,
      models: [], // no XL in inventory → not available
      source: "t",
    },
  },
  "remote-xl-sft"
);
const xlCap = capsConfiguredOnly.find((c) => c.id === "remote-xl-sft");
assert(xlCap?.configured === true, "xl configured when remote URL set");
assert(xlCap?.available === false, "xl not available without inventory");

const capsAvailable = buildCapabilityStatuses(
  {
    local: { reachable: true, models: ["acestep-v15-sft"], source: "t" },
    remote: {
      configured: true,
      reachable: true,
      models: ["acestep-v15-xl-sft"],
      source: "t",
    },
  },
  "remote-xl-sft"
);
assert(
  capsAvailable.find((c) => c.id === "remote-xl-sft")?.available === true,
  "xl available when inventory confirms"
);

// --- truthful model-result labeling (requested ≠ actual until confirmed) ---
const pendingLabel = resolveDisplayModelLabel({
  requestedModelName: "acestep-v15-xl-sft",
  requestedCapability: "remote-xl-sft",
  actualModelName: null,
  actualCapability: null,
  status: "processing",
});
assert(pendingLabel.confirmed === false, "pending not confirmed");
assert(
  pendingLabel.detail.includes("not yet confirmed") ||
    pendingLabel.detail.includes("Requested"),
  "pending shows requested not actual"
);
assert(pendingLabel.modelLabel === null, "pending modelLabel null");

const completedUnconfirmed = resolveDisplayModelLabel({
  requestedModelName: "acestep-v15-sft",
  requestedCapability: "local-2b-sft",
  actualModelName: null,
  actualCapability: null,
  status: "completed",
});
assert(completedUnconfirmed.confirmed === false, "completed without meta unconfirmed");
assert(
  !completedUnconfirmed.detail.startsWith("SFT (acestep") ||
    completedUnconfirmed.detail.includes("unconfirmed") ||
    completedUnconfirmed.detail.includes("Requested"),
  "must not present requested as ran"
);

const confirmed = resolveDisplayModelLabel({
  requestedModelName: "acestep-v15-xl-sft",
  requestedCapability: "remote-xl-sft",
  actualModelName: "acestep-v15-xl-sft",
  actualCapability: "remote-xl-sft",
  status: "completed",
});
assert(confirmed.confirmed === true, "confirmed when actual set");
assert(confirmed.familyLabel === "XL", "confirmed family XL");
assert(confirmed.modelLabel === "acestep-v15-xl-sft", "confirmed model id");

const mismatch = resolveDisplayModelLabel({
  requestedModelName: "acestep-v15-xl-sft",
  requestedCapability: "remote-xl-sft",
  actualModelName: "acestep-v15-sft",
  actualCapability: "local-2b-sft",
  status: "completed",
});
assert(mismatch.confirmed === true, "mismatch still confirmed from actual");
assert(mismatch.familyLabel === "SFT", "actual family wins over requested XL");
assert(mismatch.modelLabel === "acestep-v15-sft", "actual model wins");

// --- routing: remote-xl-sft without availability → clear error, no silent local ---
process.env.QUALITY_TIER = "remote-xl-sft";
process.env.ACESTEP_REMOTE_URL = "http://127.0.0.1:8002";
delete process.env.ACESTEP_XL_API_URL;

let threw = false;
try {
  resolveAceRoute({
    preset: "quality",
    capabilities: capsConfiguredOnly,
    inventory: {
      local: { reachable: true, models: ["acestep-v15-sft"], source: "t" },
      remote: { configured: true, reachable: true, models: [], source: "t" },
    },
  });
} catch (e) {
  threw = e instanceof AceRouteError || /XL|remote|fall back/i.test(String(e.message));
  assert(
    /fall back|confirm|unavailable|not confirm/i.test(String(e.message)),
    "error mentions no silent fallback"
  );
}
assert(threw, "remote-xl-sft without inventory throws");

// Local default quality still works
process.env.QUALITY_TIER = "local-sft";
delete process.env.ACESTEP_REMOTE_URL;
const localRoute = resolveAceRoute({
  preset: "quality",
  capabilities: buildCapabilityStatuses(
    {
      local: { reachable: true, models: ["acestep-v15-sft"], source: "t" },
      remote: { configured: false, reachable: false, models: [], source: "n" },
    },
    "local-sft"
  ),
});
assert(localRoute.provider === "local", "default quality is local");
assert(localRoute.capability === "local-2b-sft", "default quality capability");
assert(!/xl/i.test(localRoute.model), "default quality model not xl");

const fastRoute = resolveAceRoute({ preset: "fast" });
assert(fastRoute.capability === "local-2b-turbo", "fast is local turbo");
assert(fastRoute.provider === "local", "fast provider local");


// --- Phase 3 library: favorites/collections helpers, variation, metadata export ---
const {
  buildMetadataExport,
  buildVariationCreateInput,
  parseUserTags,
  serializeUserTags,
  metadataExportFilename,
  normalizeTagList,
} = require(path.join(outDir, "library-meta.js"));

const sampleGen = {
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  title: "Neon Pulse",
  prompt: "synthwave night drive",
  lyrics: "city lights",
  style: "synthwave, retro",
  durationSec: 60,
  status: "completed",
  audioPath: "aaaaaaaa.mp3",
  audioMime: "audio/mpeg",
  errorMessage: null,
  mode: "mock",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:01:00.000Z",
  externalTaskId: null,
  stage: "done",
  progressMessage: "Complete",
  progressPct: 100,
  attemptCount: 1,
  cancelRequested: false,
  seed: "seed-1",
  bpm: 118,
  musicalKey: "Am",
  modelName: "acestep-v15-sft",
  requestedModelName: "acestep-v15-xl-sft",
  actualModelName: "acestep-v15-sft",
  requestedCapability: "remote-xl-sft",
  actualCapability: "local-2b-sft",
  provider: "local",
  preset: "quality",
  postFxPreset: "off",
  planningMode: "direct",
  originalPrompt: null,
  musicBrief: null,
  generationMs: 12000,
  audioDurationSec: 58.2,
  resultJson: JSON.stringify({ note: "ok" }),
  favorite: true,
  userTags: JSON.stringify(["demo", "fav"]),
  collectionId: "col-1",
};

assert(parseUserTags('["A","a","B"]').join(",") === "A,B", "parseUserTags dedupe");
assert(serializeUserTags([" x ", "X", "y"]) === JSON.stringify(["x", "y"]), "serializeUserTags");
assert(normalizeTagList(["", "  "]).length === 0, "normalize empty");

const variation = buildVariationCreateInput(sampleGen);
assert(variation.prompt === sampleGen.prompt, "variation prompt");
assert(variation.lyrics === sampleGen.lyrics, "variation lyrics");
assert(variation.style === sampleGen.style, "variation style");
assert(variation.durationSec === 60, "variation duration");
assert(variation.preset === "quality", "variation preset");
assert(variation.model === "acestep-v15-xl-sft", "variation carries requested model");
assert(variation.variationOf === sampleGen.id, "variationOf id");
assert(variation.useRandomSeed === true, "variation new seed flag");
assert(/^Variation of /i.test(variation.title || ""), "variation title prefix");

const metaDoc = buildMetadataExport(sampleGen, { id: "col-1", name: "Demos" });
assert(metaDoc.schema === "audio-alchemy.track-metadata.v1", "meta schema");
assert(metaDoc.title === "Neon Pulse", "meta title");
assert(metaDoc.prompt === sampleGen.prompt, "meta prompt");
assert(metaDoc.lyrics === "city lights", "meta lyrics");
assert(metaDoc.favorite === true, "meta favorite");
assert(metaDoc.collection?.name === "Demos", "meta collection");
assert(metaDoc.userTags.includes("demo"), "meta user tags");
assert(metaDoc.styleTags.includes("synthwave"), "meta style tags");
assert(metaDoc.model.confirmed === true, "meta confirmed when actual set");
assert(metaDoc.model.actualConfirmedModel === "acestep-v15-sft", "meta actual model");
assert(metaDoc.model.actualModelName === "acestep-v15-sft", "meta actual field");
assert(metaDoc.model.requestedModelName === "acestep-v15-xl-sft", "meta keeps requested separate");
assert(metaDoc.settings.seed === "seed-1", "meta seed");
assert(metaDoc.timestamps.createdAt === sampleGen.createdAt, "meta timestamps");

const unconfirmed = buildMetadataExport({
  ...sampleGen,
  actualModelName: null,
  actualCapability: null,
  favorite: false,
  userTags: null,
  collectionId: null,
});
assert(unconfirmed.model.confirmed === false, "unconfirmed meta");
assert(unconfirmed.model.actualConfirmedModel === null, "never copy requested as actual");
assert(unconfirmed.favorite === false, "unconfirmed favorite false");

assert(
  metadataExportFilename(sampleGen).endsWith(".metadata.json"),
  "metadata filename suffix"
);
assert(metadataExportFilename(sampleGen).includes("neon-pulse"), "metadata filename stem");

// SQLite library filters (temp DATA_DIR) — favorites / collections / search
const os = require("os");
const tmpData = fs.mkdtempSync(path.join(os.tmpdir(), "aa-lib-"));
process.env.DATA_DIR = tmpData;
const { resetDbSingletonForTests, insertGeneration, updateGeneration, listGenerations, createCollection, listCollections, deleteCollection, getGeneration } = require(path.join(outDir, "db.js"));
resetDbSingletonForTests();

const now = new Date().toISOString();
const col = createCollection("Phase3 Demos", "col-phase3");
assert(listCollections().some((c) => c.id === col.id), "collection created");

const g1 = {
  ...sampleGen,
  id: "11111111-1111-1111-1111-111111111111",
  favorite: false,
  userTags: serializeUserTags(["alpha", "beta"]),
  collectionId: col.id,
  createdAt: now,
  updatedAt: now,
  actualModelName: null,
  actualCapability: null,
};
const g2 = {
  ...sampleGen,
  id: "22222222-2222-2222-2222-222222222222",
  title: "Other Track",
  prompt: "jazz piano",
  style: "jazz",
  favorite: true,
  userTags: serializeUserTags(["gamma"]),
  collectionId: null,
  createdAt: now,
  updatedAt: now,
};
insertGeneration(g1);
insertGeneration(g2);

assert(listGenerations({ favorite: true }).length === 1, "favorites filter");
assert(listGenerations({ favorite: true })[0].id === g2.id, "favorites id");
assert(listGenerations({ collectionId: col.id }).length === 1, "collection filter");
assert(listGenerations({ collectionId: "none" }).length === 1, "unfiled filter");
assert(listGenerations({ q: "Phase3" }).some((g) => g.id === g1.id), "search collection name");
assert(listGenerations({ q: "alpha" }).some((g) => g.id === g1.id), "search user tags");
assert(listGenerations({ q: "jazz" }).some((g) => g.id === g2.id), "search style/prompt");

updateGeneration(g1.id, { favorite: true });
assert(getGeneration(g1.id)?.favorite === true, "favorite toggle");

deleteCollection(col.id);
assert(getGeneration(g1.id)?.collectionId == null, "delete collection unfiles tracks");
assert(listCollections().length === 0, "collection deleted");

resetDbSingletonForTests();
try { fs.rmSync(tmpData, { recursive: true, force: true }); } catch {}


// --- Phase 4 post-FX presets ---
assert(parsePostFxPreset("off") === "off", "parse off");
assert(parsePostFxPreset("light") === "light", "parse light");
assert(parsePostFxPreset("loudness") === "loudness", "parse loudness");
assert(parsePostFxPreset("light-polish") === "light", "parse light-polish");
assert(parsePostFxPreset("bogus") == null, "parse unknown null");
assert(postFxPresetLabel("light") === "Light polish", "label light");

const prevPp = process.env.POSTPROCESS;
const prevPpPreset = process.env.POSTPROCESS_PRESET;
delete process.env.POSTPROCESS;
delete process.env.POSTPROCESS_PRESET;
assert(resolvePostFxPreset(null) === "off", "default off without env");
assert(resolvePostFxPreset("loudness") === "loudness", "request wins");
process.env.POSTPROCESS = "1";
assert(resolvePostFxPreset(null) === "light", "env POSTPROCESS maps to light");
process.env.POSTPROCESS_PRESET = "loudness";
assert(resolvePostFxPreset(null) === "loudness", "env POSTPROCESS_PRESET");
assert(resolvePostFxPreset("off") === "off", "explicit off wins over env");
const lightChain = buildFilterChain("light");
assert(lightChain.includes("highpass"), "light has highpass");
assert(lightChain.includes("equalizer"), "light has EQ");
assert(!lightChain.includes("loudnorm"), "light has no loudnorm");
const loudChain = buildFilterChain("loudness");
assert(loudChain.includes("loudnorm"), "loudness has loudnorm");
assert(!loudChain.includes("highpass"), "loudness no highpass");
if (prevPp == null) delete process.env.POSTPROCESS; else process.env.POSTPROCESS = prevPp;
if (prevPpPreset == null) delete process.env.POSTPROCESS_PRESET; else process.env.POSTPROCESS_PRESET = prevPpPreset;

// Templates / packs (metal kept, artist-free)
const packs = listTemplatePacks();
assert(packs.includes("metal"), "metal pack present");
const metal = loadPromptTemplates("metal");
assert(metal.length >= 5, "metal templates kept");
const all = loadPromptTemplates();
assert(all.length >= 20, "extended template set");
for (const tmpl of all) {
  assert(assertTemplateArtistFree(tmpl).length === 0, "artist-free " + tmpl.id);
}

assert(metaDoc.settings.postFxPreset === "off", "meta postFxPreset");

// --- Phase 5: diagnostics redaction, actionable errors, library backup ---
const {
  getSafeDataDirLabel,
  collectSecretLeaks,
  buildDiagnosticsSnapshot,
  isSecretKeyName,
} = require(path.join(outDir, "diagnostics.js"));
const {
  formatActionableError,
  redactPaths,
} = require(path.join(outDir, "user-errors.js"));
const {
  LIBRARY_BACKUP_SCHEMA,
  exportLibraryArchive,
  validateLibraryArchive,
  importLibraryArchive,
} = require(path.join(outDir, "library-backup.js"));
const { createArchiveZip, extractArchiveZip } = require(path.join(outDir, "archive-util.js"));

assert(isSecretKeyName("ACESTEP_API_KEY"), "secret key name api");
assert(isSecretKeyName("hf_token"), "secret key name token");
assert(!isSecretKeyName("hasApiKey"), "hasApiKey not a secret value key by itself for boolean");
assert(!isSecretKeyName("qualityTier"), "qualityTier not secret");

const leaky = { settings: { hasApiKey: true, ACESTEP_API_KEY: "redacted-test-secret" } };
assert(collectSecretLeaks(leaky).some((x) => /API_KEY/i.test(x)), "detects api key leak");
assert(collectSecretLeaks({ token: "hf_abc" }).length >= 1, "detects token leak");
assert(collectSecretLeaks({ hasApiKey: true, mode: "mock" }).length === 0, "booleans ok");

const defaultLabel = getSafeDataDirLabel(path.join(process.cwd(), "data"));
assert(defaultLabel === "./data", "default data dir label ./data");
const customAbs = getSafeDataDirLabel("/home/dave/secret-project/store");
assert(customAbs === "store", "absolute DATA_DIR shows basename only");
assert(!customAbs.includes("/home"), "no home path in data dir label");

process.env.ACESTEP_API_KEY = "redacted-value-that-must-not-appear";
process.env.HF_TOKEN = "hf_should-never-appear";
const diag = buildDiagnosticsSnapshot({
  mode: "ace-step",
  aceStepConnected: false,
  gpuBusy: true,
  capabilities: [{ id: "local-2b-sft", configured: true, available: true, modelId: "acestep-v15-sft" }],
  models: [{ id: "acestep-v15-sft", family: "2b-sft", provider: "local", supportedLocally: true }],
});
assert(diag.singleFlight === true, "diag singleFlight");
assert(diag.gpuBusy === true, "diag gpu busy");
assert(diag.aceStepConnected === false, "diag ace offline");
assert(diag.qualityTier, "diag quality tier");
assert(diag.dataDir === "./data" || !diag.dataDir.includes("/home"), "diag dataDir safe");
const diagJson = JSON.stringify(diag);
assert(!diagJson.includes("redacted-value-that-must-not-appear"), "diag no api key value");
assert(!diagJson.includes("hf_should-never-appear"), "diag no hf token value");
assert(collectSecretLeaks(diag).length === 0, "diag snapshot has no secret leaks");
delete process.env.ACESTEP_API_KEY;
delete process.env.HF_TOKEN;

const busyErr = formatActionableError(new Error("ACE-Step busy (single-flight)"));
assert(busyErr.code === "gpu_busy", "actionable gpu_busy");
assert(/wait|cancel/i.test(busyErr.hint || ""), "gpu hint actionable");
const offlineErr = formatActionableError(new Error("fetch failed ECONNREFUSED"));
assert(offlineErr.code === "ace_offline", "actionable ace_offline");
const modelErr = formatActionableError(new Error("XL checkpoints are not supported / fall back"));
assert(modelErr.code === "model_unavailable", "actionable model_unavailable");
const missErr = formatActionableError(new Error("Audio file missing"));
assert(missErr.code === "missing_audio", "actionable missing_audio");
const diskErr = formatActionableError(new Error("ENOSPC: no space left on device"));
assert(diskErr.code === "disk_full", "actionable disk_full");
const writeErr = formatActionableError(new Error("EACCES: permission denied"));
assert(writeErr.code === "write_failed", "actionable write_failed");
assert(
  !redactPaths("failed writing /home/dave/data/x.wav").includes("/home/dave"),
  "redact home paths"
);

// Archive round-trip
const z = createArchiveZip([
  { name: "manifest.json", data: Buffer.from('{"ok":true}', "utf8") },
  { name: "audio/a.wav", data: Buffer.from("RIFF") },
]);
const extracted = extractArchiveZip(z);
assert(extracted.some((e) => e.name === "manifest.json"), "zip has manifest");
assert(extracted.some((e) => e.name === "audio/a.wav"), "zip has audio");

// Library backup export/import against temp DB (reuse reset helpers)
const tmpBackup = fs.mkdtempSync(path.join(os.tmpdir(), "aa-bak-"));
process.env.DATA_DIR = tmpBackup;
resetDbSingletonForTests();
const {
  insertGeneration: insertGen2,
  listGenerations: listGen2,
  createCollection: createCol2,
  getGeneration: getGen2,
} = require(path.join(outDir, "db.js"));

const colB = createCol2("Backup Pack", "col-backup");
const nowB = new Date().toISOString();
const audioName = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.wav";
fs.mkdirSync(path.join(tmpBackup, "audio"), { recursive: true });
fs.writeFileSync(path.join(tmpBackup, "audio", audioName), Buffer.from("RIFFDEMO"));
insertGen2({
  ...sampleGen,
  id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  title: "Backup Track",
  favorite: true,
  userTags: serializeUserTags(["backup"]),
  collectionId: colB.id,
  audioPath: audioName,
  audioMime: "audio/wav",
  status: "completed",
  createdAt: nowB,
  updatedAt: nowB,
  actualModelName: "acestep-v15-sft",
  actualCapability: "local-2b-sft",
});

const exported = exportLibraryArchive();
assert(exported.buffer.length > 32, "export zip non-empty");
assert(exported.trackCount === 1, "export track count");
assert(exported.audioCount === 1, "export audio count");
assert(exported.filename.endsWith(".zip"), "export filename zip");

const validated = validateLibraryArchive(exported.buffer);
assert(validated.manifest.schema === LIBRARY_BACKUP_SCHEMA, "manifest schema");
assert(validated.manifest.generations.length === 1, "manifest gens");
assert(validated.audioById.has("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"), "audio mapped");

// Bad schema rejected
let badThrew = false;
try {
  validateLibraryArchive(
    createArchiveZip([
      {
        name: "manifest.json",
        data: Buffer.from(JSON.stringify({ schema: "nope", app: "audio-alchemy", generations: [], collections: [], audio: [] }), "utf8"),
      },
    ])
  );
} catch (e) {
  badThrew = /schema/i.test(String(e.message));
}
assert(badThrew, "rejects bad schema");

// Import conflict: skip existing
const skipReport = importLibraryArchive(exported.buffer, "skip");
assert(skipReport.skipped === 1, "skip existing id");
assert(skipReport.imported === 0, "skip imports none");
assert(listGen2({}).length === 1, "still one track after skip");

// Import conflict: rename
const renameReport = importLibraryArchive(exported.buffer, "rename");
assert(renameReport.renamed === 1, "rename conflict");
assert(renameReport.imported === 1, "rename imported");
assert(listGen2({}).length === 2, "two tracks after rename");
assert(renameReport.conflicts[0]?.newId, "rename has newId");
assert(getGen2(renameReport.conflicts[0].newId), "renamed track exists");
assert(
  getGen2("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")?.title === "Backup Track",
  "original not overwritten"
);

// Variation payload still truthful (extend)
const v2 = buildVariationCreateInput({
  ...sampleGen,
  requestedModelName: "acestep-v15-xl-sft",
  actualModelName: null,
});
assert(v2.useRandomSeed === true, "variation random seed");
assert(v2.model === "acestep-v15-xl-sft", "variation requested model only");

resetDbSingletonForTests();
try { fs.rmSync(tmpBackup, { recursive: true, force: true }); } catch {}

// Migration columns still present on fresh DB
const tmpMig = fs.mkdtempSync(path.join(os.tmpdir(), "aa-mig-"));
process.env.DATA_DIR = tmpMig;
resetDbSingletonForTests();
const Database = require("better-sqlite3");
const { getDbPath } = require(path.join(outDir, "paths.js"));
// Touch DB via listGenerations
listGen2({});
const dbCheck = new Database(getDbPath());
const colNames = dbCheck.prepare("PRAGMA table_info(generations)").all().map((c) => c.name);
dbCheck.close();
for (const col of ["favorite", "user_tags", "collection_id", "post_fx_preset", "planning_mode", "original_prompt", "music_brief"]) {
  assert(colNames.includes(col), "migration column " + col);
}
const tables = new Database(getDbPath()).prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
assert(tables.includes("collections"), "collections table migrated");
new Database(getDbPath()).close();
resetDbSingletonForTests();
try { fs.rmSync(tmpMig, { recursive: true, force: true }); } catch {}


// --- Song focus: prompt compiler, planner detection, thinking gate, persistence ---
assert(dedupeTags(["Lo-Fi", "lo-fi", "ambient", " ambient "]).join(",") === "Lo-Fi,ambient", "tag dedupe case/ws");
assert(parsePlanningMode("song-focus") === "song-focus", "parse song-focus");
assert(parsePlanningMode("direct") === "direct", "parse direct");
assert(parsePlanningMode("nope") == null, "parse invalid null");
assert(thinkingForPlanningMode("song-focus") === true, "thinking only song-focus");
assert(thinkingForPlanningMode("direct") === false, "thinking off for direct");
assert(thinkingForPlanningMode(null) === false, "thinking off for null");
assert(thinkingForPlanningMode(undefined) === false, "thinking off for undefined");

const compiled = compileMusicBrief({
  prompt: "Dreamy synthwave with warm pads. Soft verse then big chorus. No synth lead.",
  style: "synthwave, synthwave, warm",
  lyrics: "[Verse]\\nhello",
});
assert(compiled.lyrics && compiled.lyrics.includes("hello"), "lyrics kept separate");
assert(/Core sound/i.test(compiled.musicBrief), "brief has core sound");
assert(/Constraints/i.test(compiled.musicBrief) || /no synth lead/i.test(compiled.musicBrief), "constraints preserved");
assert(compiled.styleTags.filter((t) => t.toLowerCase() === "synthwave").length === 1, "style tag dedupe");
// Do not duplicate style tag text already in prompt into brief awkwardly as duplicate paragraphs
assert(!/synthwave.*synthwave.*synthwave/i.test(compiled.musicBrief), "no triple style duplication");

const conflicts = detectStylePromptConflicts(
  "crushing modern metal with down-tuned guitars",
  ["jazz", "lo-fi"]
);
assert(conflicts.length >= 1, "style/prompt genre conflict detected");
const cleared = clearConflictingTags("jazz, lo-fi, modern metal", conflicts);
assert(!/jazz/i.test(cleared) || conflicts.every((c) => c.tag.toLowerCase() !== "jazz") || !cleared.toLowerCase().includes("jazz"), "clear conflicting tags removes clash");

assert(looksLikePlannerOrLm("ace-lm-0.6b") === true, "detect ace-lm-0.6b");
assert(looksLikePlannerOrLm("acestep-planner") === true, "detect planner");
assert(looksLikePlannerOrLm("acestep-v15-sft") === false, "sft is not planner");
assert(findPlannerModels(["acestep-v15-sft", "ace-step-lm", "x"]).includes("ace-step-lm"), "find planner models");

const lmUnavailable = resolvePlannerAvailability({
  mode: "ace-step",
  aceConnected: true,
  localModelIds: ["acestep-v15-sft", "acestep-v15-turbo"],
  liveLocalInventory: true,
});
assert(lmUnavailable.available === false, "LM unavailable when inventory lacks planner");
assert(/planner|LM|inventory/i.test(lmUnavailable.reason || ""), "unavailable reason clear");

const lmOffline = resolvePlannerAvailability({
  mode: "ace-step",
  aceConnected: false,
  localModelIds: ["ace-lm-0.6b"],
  liveLocalInventory: true,
});
assert(lmOffline.available === false, "planner unavailable when ACE offline");

const lmMock = resolvePlannerAvailability({
  mode: "mock",
  aceConnected: false,
  localModelIds: ["ace-lm-0.6b"],
  liveLocalInventory: true,
});
assert(lmMock.available === false, "planner unavailable in mock");

const lmOk = resolvePlannerAvailability({
  mode: "ace-step",
  aceConnected: true,
  localModelIds: ["acestep-v15-sft", "ace-lm-0.6b"],
  liveLocalInventory: true,
});
assert(lmOk.available === true, "planner available with LM id + ACE up");
assert(lmOk.matchedModels.some((m) => /lm/i.test(m)), "matched LM id");

const lmNoLive = resolvePlannerAvailability({
  mode: "ace-step",
  aceConnected: true,
  localModelIds: ["ace-lm-0.6b"],
  liveLocalInventory: false,
});
assert(lmNoLive.available === false, "env-fallback never claims planner");

// Persistence of planning fields on insert/get
const tmpPlan = fs.mkdtempSync(path.join(os.tmpdir(), "aa-plan-"));
process.env.DATA_DIR = tmpPlan;
resetDbSingletonForTests();
const {
  insertGeneration: insertPlan,
  getGeneration: getPlan,
  listGenerations: listPlan,
} = require(path.join(outDir, "db.js"));
const nowP = new Date().toISOString();
insertPlan({
  ...sampleGen,
  id: "33333333-3333-3333-3333-333333333333",
  planningMode: "song-focus",
  originalPrompt: "user original idea about neon streets",
  musicBrief: "Core sound: synthwave. Energy and mood: neon night drive",
  prompt: "user original idea about neon streets",
  favorite: false,
  userTags: null,
  collectionId: null,
  createdAt: nowP,
  updatedAt: nowP,
  actualModelName: "acestep-v15-sft",
  actualCapability: "local-2b-sft",
  requestedModelName: "acestep-v15-sft",
  requestedCapability: "local-2b-sft",
});
const gotPlan = getPlan("33333333-3333-3333-3333-333333333333");
assert(gotPlan?.planningMode === "song-focus", "persist planningMode");
assert(gotPlan?.originalPrompt?.includes("neon streets"), "persist originalPrompt");
assert(gotPlan?.musicBrief?.includes("Core sound"), "persist musicBrief");
assert(gotPlan?.actualModelName === "acestep-v15-sft", "persist actual model");
assert(gotPlan?.actualModelName !== gotPlan?.requestedModelName || gotPlan?.actualCapability === "local-2b-sft", "actual confirmed path");
// metadata export includes planning, never CoT
const planMeta = buildMetadataExport(gotPlan);
assert(planMeta.settings.planningMode === "song-focus", "meta planningMode");
assert(planMeta.musicBrief && planMeta.musicBrief.includes("Core sound"), "meta musicBrief");
assert(planMeta.originalPrompt && planMeta.originalPrompt.includes("neon"), "meta originalPrompt");
assert(!JSON.stringify(planMeta).includes("chain-of-thought"), "no CoT in metadata");
assert(listPlan({ q: "neon streets" }).some((g) => g.id === gotPlan.id), "search original prompt");
resetDbSingletonForTests();
try { fs.rmSync(tmpPlan, { recursive: true, force: true }); } catch {}

// requested-as-actual regression (song focus must not change labeling rules)
const sfLabel = resolveDisplayModelLabel({
  requestedModelName: "acestep-v15-sft",
  requestedCapability: "local-2b-sft",
  actualModelName: null,
  actualCapability: null,
  status: "processing",
});
assert(sfLabel.confirmed === false, "song-focus path still unconfirmed without actual");
assert(sfLabel.modelLabel === null, "no requested-as-actual modelLabel");


// Phase 6 — Create health truthfulness
assert(enginePillLabel(resolveEnginePillState({ loading: true, generating: false })) === "Checking local engine…", "pill checking");
assert(enginePillLabel(resolveEnginePillState({ loading: false, generating: true, mode: "ace-step", aceStep: true })) === "Generating", "pill generating");
assert(enginePillLabel(resolveEnginePillState({ loading: false, generating: false, mode: "mock", aceStep: false })) === "Local engine ready", "pill mock ready (never mock wording)");
assert(enginePillLabel(resolveEnginePillState({ loading: false, generating: false, mode: "ace-step", aceStep: true })) === "Local engine ready", "pill ace online");
assert(enginePillLabel(resolveEnginePillState({ loading: false, generating: false, mode: "ace-step", aceStep: false })) === "Engine unavailable", "pill ace offline");
assert(inventoryHasSft({ models: { items: [{ id: "acestep-v15-sft" }] } }) === true, "sft inventory true");
assert(inventoryHasSft({ models: { items: [{ id: "acestep-v15-turbo" }] } }) === false, "sft inventory false");
assert(qualitySegmentHint({ loading: false, sftAvailable: true }) === "SFT · higher fidelity", "quality hint sft");
assert(!qualitySegmentHint({ loading: false, sftAvailable: false }).includes("unconfirmed"), "quality hint never unconfirmed");
assert(qualitySegmentHint({ loading: true, sftAvailable: false }) === "Checking local engine…", "quality hint checking");
assert(isSongFocusBlocked({ planningMode: "song-focus", healthLoading: true, healthKnown: false, plannerAvailable: false, mode: "ace-step" }) === false, "song focus not blocked while checking");
assert(isSongFocusBlocked({ planningMode: "song-focus", healthLoading: false, healthKnown: true, plannerAvailable: true, mode: "ace-step" }) === false, "song focus ok when planner confirmed");
assert(isSongFocusBlocked({ planningMode: "song-focus", healthLoading: false, healthKnown: true, plannerAvailable: false, mode: "ace-step" }) === true, "song focus blocked without planner");
assert(isSongFocusBlocked({ planningMode: "direct", healthLoading: false, healthKnown: true, plannerAvailable: false, mode: "ace-step" }) === false, "direct never song-blocked");

// Restore env
for (const k of Object.keys(process.env)) {
  if (!(k in prev)) delete process.env[k];
}
Object.assign(process.env, prev);

fs.rmSync(outDir, { recursive: true, force: true });

console.log(
  `OK: ${passed} assertions passed (ACE-Step + Phase 3–7 + Song focus + Create health)`
);
