import { spawnSync, spawn } from "child_process";
import fs from "fs";
import path from "path";

export type PostprocessResult =
  | { ok: true; path: string; mime: string; skipped?: false }
  | { ok: true; path: string; mime: string; skipped: true; reason: string }
  | { ok: false; path: string; mime: string; error: string };

function envTruthy(name: string): boolean {
  const v = (process.env[name] || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** Resolve ffmpeg binary: FFMPEG_PATH if set, else "ffmpeg" from PATH. */
export function ffmpegBin(): string {
  const fromEnv = (process.env.FFMPEG_PATH || "").trim();
  return fromEnv || "ffmpeg";
}

export function isPostprocessEnabled(): boolean {
  return envTruthy("POSTPROCESS");
}

export function ffmpegAvailable(): boolean {
  try {
    const r = spawnSync(ffmpegBin(), ["-version"], {
      encoding: "utf8",
      timeout: 5000,
    });
    return r.status === 0;
  } catch {
    return false;
  }
}

function mimeForExt(ext: string): string {
  const e = ext.replace(/^\./, "").toLowerCase();
  if (e === "wav") return "audio/wav";
  if (e === "flac") return "audio/flac";
  if (e === "ogg" || e === "opus") return "audio/ogg";
  if (e === "aac" || e === "m4a") return "audio/aac";
  return "audio/mpeg";
}

function buildFilterChain(): string {
  const hp = Number(process.env.POSTPROCESS_HIGHPASS_HZ || "80");
  const loudI = process.env.POSTPROCESS_LOUDNORM_I || "-14";
  const loudTP = process.env.POSTPROCESS_LOUDNORM_TP || "-1.0";
  const loudLRA = process.env.POSTPROCESS_LOUDNORM_LRA || "11";
  const peakDb = Number(process.env.POSTPROCESS_TRUE_PEAK_DB || "-1");
  // -1 dBTP ≈ 0.89125 linear
  const limitLin = Math.pow(10, peakDb / 20);

  const parts = [
    `highpass=f=${Number.isFinite(hp) ? hp : 80}`,
    // Gentle presence shelf — subtle, CPU-cheap
    `equalizer=f=2500:t=q:w=1.2:g=1.5`,
    `loudnorm=I=${loudI}:TP=${loudTP}:LRA=${loudLRA}`,
    `alimiter=limit=${limitLin.toFixed(5)}:level=disabled`,
  ];
  return parts.join(",");
}

/**
 * Optional CPU ffmpeg post-FX after raw generation audio is written.
 * On failure or missing ffmpeg, keeps the original file and does not fail the job.
 */
export async function maybePostprocessAudio(opts: {
  absPath: string;
  mime: string;
  onStage?: (message: string, pct?: number) => void;
}): Promise<PostprocessResult> {
  const { absPath, mime, onStage } = opts;

  if (!isPostprocessEnabled()) {
    return { ok: true, path: absPath, mime, skipped: true, reason: "POSTPROCESS off" };
  }

  if (!ffmpegAvailable()) {
    console.warn(
      "[postprocess] POSTPROCESS is enabled but ffmpeg was not found (PATH or FFMPEG_PATH). On Windows, WSL ffmpeg is not visible to Windows Node — set FFMPEG_PATH to a Windows ffmpeg.exe, or install ffmpeg for this OS. Skipping post-FX (keeping original audio)."
    );
    return {
      ok: true,
      path: absPath,
      mime,
      skipped: true,
      reason: "ffmpeg not found (PATH or FFMPEG_PATH)",
    };
  }

  if (!fs.existsSync(absPath)) {
    return {
      ok: false,
      path: absPath,
      mime,
      error: `Audio file missing: ${absPath}`,
    };
  }

  onStage?.("Post-processing audio (ffmpeg)…", 90);

  const ext = path.extname(absPath) || ".mp3";
  const tmpOut = `${absPath}.pp${ext}`;
  const filter = buildFilterChain();

  try {
    await runFfmpeg([
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      absPath,
      "-af",
      filter,
      // Re-encode to same container family; wav stays pcm, else libmp3lame/aac/etc.
      ...encodeArgsForExt(ext),
      tmpOut,
    ]);

    if (!fs.existsSync(tmpOut) || fs.statSync(tmpOut).size < 64) {
      throw new Error("ffmpeg produced empty or missing output");
    }

    // Replace original in place (same basename so DB path stays valid).
    fs.renameSync(tmpOut, absPath);
    return { ok: true, path: absPath, mime: mimeForExt(ext) || mime };
  } catch (err) {
    try {
      if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
    } catch {
      // ignore
    }
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[postprocess] ffmpeg post-FX failed — keeping original audio. ${message}`
    );
    return { ok: false, path: absPath, mime, error: message };
  }
}

function encodeArgsForExt(ext: string): string[] {
  const e = ext.replace(/^\./, "").toLowerCase();
  if (e === "wav") return ["-c:a", "pcm_s16le"];
  if (e === "flac") return ["-c:a", "flac"];
  if (e === "ogg" || e === "opus") return ["-c:a", "libopus", "-b:a", "128k"];
  if (e === "aac" || e === "m4a") return ["-c:a", "aac", "-b:a", "192k"];
  // mp3 / default
  return ["-c:a", "libmp3lame", "-b:a", "192k"];
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBin(), args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `ffmpeg exited ${code}`));
    });
  });
}

/** Optional integrated loudness probe for eval harness (EBU R128 via ffmpeg loudnorm print). */
export async function probeLoudnessLufs(absPath: string): Promise<string> {
  if (!ffmpegAvailable() || !fs.existsSync(absPath)) return "";
  try {
    const result = await new Promise<string>((resolve) => {
      const child = spawn(
        ffmpegBin(),
        [
          "-hide_banner",
          "-i",
          absPath,
          "-af",
          "loudnorm=I=-14:TP=-1.0:LRA=11:print_format=summary",
          "-f",
          "null",
          "-",
        ],
        { stdio: ["ignore", "pipe", "pipe"] }
      );
      let stderr = "";
      child.stderr?.on("data", (d) => {
        stderr += d.toString();
      });
      child.on("close", () => resolve(stderr));
      child.on("error", () => resolve(""));
    });
    const m = result.match(/Input Integrated:\s*([-\d.]+)\s*LUFS/i);
    return m ? m[1] : "";
  } catch {
    return "";
  }
}

