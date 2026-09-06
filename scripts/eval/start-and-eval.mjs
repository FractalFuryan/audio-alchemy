import { spawn } from "child_process";
import { setTimeout as sleep } from "timers/promises";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const modeArg = process.argv.find((a) => a.startsWith("--mode="));
const MODE = (modeArg?.split("=")[1] || process.env.GENERATION_MODE || "mock").toLowerCase();
const PORT = process.env.EVAL_PORT || "3460";
const BASE = `http://127.0.0.1:${PORT}`;

const child = spawn("npx", ["next", "start", "-p", PORT], {
  cwd: root,
  env: { ...process.env, GENERATION_MODE: MODE, PORT },
  stdio: ["ignore", "pipe", "pipe"],
});

let ready = false;
child.stdout.on("data", (d) => {
  const s = d.toString();
  process.stdout.write(s);
  if (/Ready|started server|Local:/i.test(s)) ready = true;
});
child.stderr.on("data", (d) => {
  const s = d.toString();
  process.stderr.write(s);
  if (/Ready|started server|Local:/i.test(s)) ready = true;
});

for (let i = 0; i < 60 && !ready; i++) await sleep(250);
for (let i = 0; i < 40 && !ready; i++) {
  try {
    const res = await fetch(`${BASE}/api/health`);
    if (res.ok) { ready = true; break; }
  } catch {}
  await sleep(250);
}
if (!ready) throw new Error("Next server failed to become ready for eval");

try {
  const health = await fetch(`${BASE}/api/health`);
  const hj = await health.json();
  console.log("[eval] health", hj);

  const code = await new Promise((resolve, reject) => {
    const ev = spawn(process.execPath, [path.join(__dirname, "run-eval.mjs")], {
      cwd: root,
      env: {
        ...process.env,
        EVAL_BASE_URL: BASE,
        GENERATION_MODE: MODE,
      },
      stdio: "inherit",
    });
    ev.on("error", reject);
    ev.on("close", (c) => resolve(c || 0));
  });

  try {
    const fs = await import("fs");
    const latestPath = path.join(__dirname, "results", "LATEST_RUN");
    if (fs.existsSync(latestPath)) {
      const runId = fs.readFileSync(latestPath, "utf8").trim();
      const runDir = path.join(__dirname, "results", runId);
      const manifest = path.join(runDir, "manifest.csv");
      const filler = path.join(__dirname, "fill-loudness.py");
      if (fs.existsSync(manifest) && fs.existsSync(filler)) {
        await new Promise((resolve) => {
          const py = spawn("python3", [filler, manifest, runDir], { stdio: "inherit" });
          py.on("close", () => resolve());
          py.on("error", () => resolve());
        });
      }
    }
  } catch {}

  if (code !== 0) process.exitCode = code;
} finally {
  try { child.stdout?.destroy(); } catch {}
  try { child.stderr?.destroy(); } catch {}
  child.kill("SIGTERM");
  await sleep(400);
  try { child.kill("SIGKILL"); } catch {}
  // Ensure we leave even if the Next child keeps stdio open.
  process.exit(process.exitCode || 0);
}
