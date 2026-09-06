/** Compare Fast (Turbo) vs Quality (SFT) eval runs -> compare.csv + blind sheet */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { setTimeout as sleep } from "timers/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resultsRoot = path.join(__dirname, "results");
const runEvalPath = path.join(__dirname, "run-eval.mjs");

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { header: [], rows: [] };
  const header = lines[0].split(",");
  const rows = lines.slice(1).map((line) => {
    const cols = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ",") {
        cols.push(cur);
        cur = "";
      } else cur += ch;
    }
    cols.push(cur);
    const obj = {};
    header.forEach((h, idx) => {
      obj[h] = cols[idx] ?? "";
    });
    return obj;
  });
  return { header, rows };
}

async function runEvalWithPreset(preset) {
  const env = { ...process.env, EVAL_PRESET: preset };
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runEvalPath], {
      env,
      cwd: path.join(__dirname, "..", ".."),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += d.toString();
      process.stdout.write(d);
    });
    child.stderr.on("data", (d) => {
      err += d.toString();
      process.stderr.write(d);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`eval preset=${preset} exited ${code}: ${err || out}`));
        return;
      }
      const dirs = fs
        .readdirSync(resultsRoot)
        .map((name) => ({ name, full: path.join(resultsRoot, name) }))
        .filter((d) => fs.statSync(d.full).isDirectory())
        .sort((a, b) => fs.statSync(b.full).mtimeMs - fs.statSync(a.full).mtimeMs);
      const hit = dirs.find((d) => {
        const metaPath = path.join(d.full, "meta.json");
        if (!fs.existsSync(metaPath)) return false;
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
          return meta.preset === preset;
        } catch {
          return false;
        }
      }) || dirs[0];
      if (!hit) {
        reject(new Error(`No results dir found after preset=${preset}`));
        return;
      }
      resolve(hit.full);
    });
  });
}


const SCORE_DIMS = [
  "realism",
  "drum_authenticity",
  "guitar_tone",
  "arrangement",
  "prompt_adherence",
  "artifacts",
];

function joinCompare(fastDir, qualityDir, outPath) {
  const fast = parseCsv(fs.readFileSync(path.join(fastDir, "manifest.csv"), "utf8"));
  const quality = parseCsv(fs.readFileSync(path.join(qualityDir, "manifest.csv"), "utf8"));
  const qById = new Map(quality.rows.map((r) => [r.id, r]));
  const scoreCols = SCORE_DIMS.flatMap((d) => [`score_${d}_fast`, `score_${d}_quality`]);
  const header = [
    "id", "prompt", "path_fast", "path_quality", "status_fast", "status_quality",
    "generation_id_fast", "generation_id_quality", "loudness_lufs_fast", "loudness_lufs_quality",
    ...scoreCols, "preference", "notes",
  ];
  const lines = [header.join(",")];
  for (const fr of fast.rows) {
    const qr = qById.get(fr.id) || {};
    const emptyScores = scoreCols.map(() => "");
    lines.push(
      [fr.id, fr.prompt, fr.path, qr.path || "", fr.status, qr.status || "",
       fr.generation_id, qr.generation_id || "", fr.loudness_lufs, qr.loudness_lufs || "",
       ...emptyScores, "", ""].map(csvEscape).join(",")
    );
  }
  fs.writeFileSync(outPath, lines.join("\n") + "\n");
  return outPath;
}

/** Blind listening sheet: randomized left/right, hidden preset names. */
function writeBlindSheet(fastDir, qualityDir, outPath) {
  const fast = parseCsv(fs.readFileSync(path.join(fastDir, "manifest.csv"), "utf8"));
  const quality = parseCsv(fs.readFileSync(path.join(qualityDir, "manifest.csv"), "utf8"));
  const qById = new Map(quality.rows.map((r) => [r.id, r]));
  const header = [
    "pair_id", "rater_id_hash", "left_label", "right_label", "left_path", "right_path", "preference",
    ...SCORE_DIMS.flatMap((d) => [`score_left_${d}`, `score_right_${d}`]),
    "notes",
  ];
  const lines = [header.join(",")];
  const keyRows = [];
  let pair = 1;
  for (const fr of fast.rows) {
    const qr = qById.get(fr.id);
    if (!qr || !fr.path || !qr.path) continue;
    let h = 0;
    for (let i = 0; i < fr.id.length; i++) h = (h * 31 + fr.id.charCodeAt(i)) >>> 0;
    const fastOnLeft = h % 2 === 0;
    const leftPath = fastOnLeft ? fr.path : qr.path;
    const rightPath = fastOnLeft ? qr.path : fr.path;
    const emptyScores = SCORE_DIMS.flatMap(() => ["", ""]);
    lines.push(
      [String(pair), "", "A", "B", leftPath, rightPath, "", ...emptyScores, ""]
        .map(csvEscape)
        .join(",")
    );
    keyRows.push({
      pair_id: pair,
      prompt_id: fr.id,
      left_is: fastOnLeft ? "fast" : "quality",
      right_is: fastOnLeft ? "quality" : "fast",
    });
    pair += 1;
  }
  fs.writeFileSync(outPath, lines.join("\n") + "\n");
  return keyRows;
}

async function main() {
  let fastDir = process.env.COMPARE_FAST_DIR;
  let qualityDir = process.env.COMPARE_QUALITY_DIR;
  if (!fastDir || !qualityDir) {
    if (!process.env.EVAL_BASE_URL) {
      console.error("EVAL_BASE_URL required (or COMPARE_FAST_DIR + COMPARE_QUALITY_DIR)");
      process.exit(1);
    }
    console.log("[compare] running Fast (Turbo) eval…");
    fastDir = await runEvalWithPreset("fast");
    await sleep(500);
    console.log("[compare] running Quality (SFT) eval…");
    qualityDir = await runEvalWithPreset("quality");
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(resultsRoot, `compare_${stamp}`);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "compare.csv");
  joinCompare(fastDir, qualityDir, outPath);
  const blindPath = path.join(outDir, "blind_listening.csv");
  const keyRows = writeBlindSheet(fastDir, qualityDir, blindPath);
  fs.writeFileSync(
    path.join(outDir, "blind_key.json"),
    JSON.stringify(
      {
        note: "Do not show this key to raters during listening. left_is/right_is are preset ids.",
        pairs: keyRows,
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(outDir, "meta.json"),
    JSON.stringify(
      {
        fastDir,
        qualityDir,
        createdAt: new Date().toISOString(),
        scoreDimensions: SCORE_DIMS,
        protocol: "same prompt · Turbo (fast) vs SFT (quality) · blind A/B",
      },
      null,
      2
    )
  );
  console.log("[compare] wrote", outPath);
  console.log("[compare] wrote", blindPath);
  console.log("[compare] wrote blind_key.json (keep sealed until scoring)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
