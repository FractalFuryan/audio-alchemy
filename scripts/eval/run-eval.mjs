/** Eval harness v0 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { setTimeout as sleep } from "timers/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const promptsPath = path.join(__dirname, "prompts.json");
const resultsRoot = path.join(__dirname, "results");

const mode =
  (process.env.GENERATION_MODE || "mock").toLowerCase() === "ace-step"
    ? "ace-step"
    : "mock";
const base = (process.env.EVAL_BASE_URL || "").replace(/\/$/, "");
if (!base) {
  console.error("EVAL_BASE_URL is required");
  process.exit(1);
}
const pollMs = Number(process.env.EVAL_POLL_MS || "2000");
const timeoutMs = Number(
  process.env.EVAL_TIMEOUT_MS || (mode === "mock" ? "60000" : "600000")
);
const evalPreset = (process.env.EVAL_PRESET || "").trim().toLowerCase();
const preset =
  evalPreset === "fast" || evalPreset === "quality" ? evalPreset : undefined;

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function waitForHealth(attempts = 80) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return await res.json();
    } catch {
      /* retry */
    }
    await sleep(250);
  }
  throw new Error(`Server health check failed at ${base}`);
}

async function pollGeneration(id) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await fetch(`${base}/api/generations/${id}`);
    const data = await res.json();
    const gen = data.generation;
    if (!gen) throw new Error(`Missing generation ${id}`);
    if (["completed", "failed", "cancelled"].includes(gen.status)) return gen;
    await sleep(pollMs);
  }
  throw new Error(`Timed out waiting for generation ${id}`);
}

async function main() {
  const prompts = JSON.parse(fs.readFileSync(promptsPath, "utf8"));
  if (!Array.isArray(prompts) || prompts.length === 0) {
    throw new Error("prompts.json empty");
  }

  const runId = [new Date().toISOString().replace(/[:.]/g, "-"), mode, preset || "default"].join("_");
  const runDir = path.join(resultsRoot, runId);
  const audioDir = path.join(runDir, "audio");
  fs.mkdirSync(audioDir, { recursive: true });

  fs.writeFileSync(
    path.join(runDir, "meta.json"),
    JSON.stringify(
      {
        runId,
        mode,
        createdAt: new Date().toISOString(),
        promptCount: prompts.length,
        postprocess: process.env.POSTPROCESS || "0",
        baseUrl: base,
        preset: preset || null,
      },
      null,
      2
    )
  );

  const health = await waitForHealth();
  console.log("[eval] health", { mode: health.mode, aceStep: health.aceStep });

  const rows = [
    [
      "id", "prompt", "path", "duration", "mode", "notes",
      "score_adherence", "score_coherence", "score_mastering",
      "loudness_lufs", "status", "generation_id",
    ].join(","),
  ];

  for (const item of prompts) {
    process.stdout.write(`[eval] ${item.id} … `);
    let notes = "";
    let status = "error";
    let generationId = "";
    let outRel = "";
    let duration = item.durationSec ?? "";
    let loudness = "";

    try {
      const create = await fetch(`${base}/api/generations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: item.prompt,
          style: item.style || undefined,
          lyrics: item.lyrics || undefined,
          durationSec: item.durationSec || 60,
          title: `eval-${item.id}`,
          ...(preset ? { preset } : {}),
        }),
      });
      const cj = await create.json();
      if (!create.ok && !cj.generation) {
        throw new Error(cj.error || `HTTP ${create.status}`);
      }
      let gen = cj.generation;
      generationId = gen.id;
      if (gen.status === "pending" || gen.status === "processing") {
        gen = await pollGeneration(gen.id);
      }
      status = gen.status;
      duration = gen.audioDurationSec ?? gen.durationSec ?? duration;

      if (gen.status === "completed" && gen.audioPath) {
        const audioRes = await fetch(`${base}/api/audio/${gen.id}`);
        if (!audioRes.ok) throw new Error(`audio HTTP ${audioRes.status}`);
        const buf = Buffer.from(await audioRes.arrayBuffer());
        const ext = path.extname(gen.audioPath) || ".wav";
        const filename = `${item.id}${ext}`;
        const abs = path.join(audioDir, filename);
        fs.writeFileSync(abs, buf);
        outRel = path.relative(runDir, abs).split(path.sep).join("/");
        notes = gen.progressMessage || "";
        if (process.env.EVAL_LOUDNESS_FILE) {
          // optional: wrapper writes id=lufs lines for merge
          loudness = "";
        }
      } else {
        notes = gen.errorMessage || gen.progressMessage || status;
      }
      console.log(status);
    } catch (err) {
      notes = err instanceof Error ? err.message : String(err);
      console.log("error:", notes);
      status = "error";
    }

    rows.push(
      [
        item.id,
        csvEscape(item.prompt),
        csvEscape(outRel),
        csvEscape(duration),
        csvEscape(mode),
        csvEscape(notes),
        "", "", "",
        csvEscape(loudness),
        csvEscape(status),
        csvEscape(generationId),
      ].join(",")
    );
  }

  const manifestPath = path.join(runDir, "manifest.csv");
  fs.writeFileSync(manifestPath, rows.join("\n") + "\n", "utf8");
  fs.writeFileSync(path.join(resultsRoot, "LATEST_RUN"), runId + "\n");
  console.log(`[eval] Wrote ${manifestPath}`);
  console.log(`[eval] Fill score_* columns for human ratings.`);
}

main().catch((err) => {
  console.error("[eval] FATAL", err);
  process.exitCode = 1;
});

