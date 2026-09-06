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

// On Windows the extensionless tsc launcher cannot be spawned directly.
// Invoke it through the current Node executable so this test is portable.
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

// Restore env
for (const k of Object.keys(process.env)) {
  if (!(k in prev)) delete process.env[k];
}
Object.assign(process.env, prev);

fs.rmSync(outDir, { recursive: true, force: true });

console.log(
  `OK: ${passed} assertions passed (ACE-Step unit helpers + capabilities + truthful labeling)`
);
