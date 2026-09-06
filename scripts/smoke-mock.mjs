import { spawn } from "child_process";
import { setTimeout as sleep } from "timers/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const PORT = process.env.SMOKE_PORT || "3456";
const BASE = `http://127.0.0.1:${PORT}`;

const child = spawn("npx", ["next", "start", "-p", PORT], {
  cwd: root,
  env: { ...process.env, GENERATION_MODE: "mock", PORT },
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
if (!ready) await sleep(1000);

try {
  const health = await fetch(`${BASE}/api/health`);
  const hj = await health.json();
  console.log("health", hj);

  const create = await fetch(`${BASE}/api/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "Phase A smoke loft beat", durationSec: 30 }),
  });
  const cj = await create.json();
  console.log("create status", create.status, {
    id: cj.generation?.id,
    status: cj.generation?.status,
    audioPath: cj.generation?.audioPath,
    stage: cj.generation?.stage,
    mode: cj.generation?.mode,
  });
  if (!create.ok || cj.generation?.status !== "completed") {
    console.error("SMOKE FAIL", cj);
    process.exitCode = 1;
  } else {
    const del = await fetch(`${BASE}/api/generations/${cj.generation.id}`, {
      method: "DELETE",
    });
    console.log("delete", del.status, await del.json());
    console.log("SMOKE OK");
  }
} catch (err) {
  console.error("SMOKE ERROR", err);
  process.exitCode = 1;
} finally {
  child.kill("SIGTERM");
  await sleep(400);
  try { child.kill("SIGKILL"); } catch {}
}
