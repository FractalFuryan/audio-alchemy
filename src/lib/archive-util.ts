/**
 * Library backup archive schema + helpers.
 * Windows uses its built-in bsdtar ZIP support; other platforms retain the
 * small Python stdlib fallback.
 */

import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

export const LIBRARY_BACKUP_SCHEMA = "audio-alchemy.library-backup.v1" as const;

export interface ArchiveFile {
  name: string;
  data: Buffer;
}

function scriptPath(): string {
  return path.join(process.cwd(), "scripts", "library-archive.py");
}

function assertSafeEntryName(name: string): string {
  const normalized = name
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^(?:\.\/)+/, "");
  if (
    !normalized ||
    normalized.includes("..") ||
    normalized.startsWith("/") ||
    path.isAbsolute(normalized)
  ) {
    throw new Error("Unsafe archive entry name");
  }
  return normalized;
}

function isWindows(): boolean {
  return process.platform === "win32";
}

export function createArchiveZip(files: ArchiveFile[]): Buffer {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aa-arch-out-"));
  try {
    const staging = path.join(tmp, "staging");
    fs.mkdirSync(staging, { recursive: true });
    const names: string[] = [];
    for (const f of files) {
      const name = assertSafeEntryName(f.name);
      const dest = path.join(staging, name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, f.data);
      names.push(name);
    }
    const zipPath = path.join(tmp, "out.zip");
    const listPath = path.join(tmp, "files.json");
    fs.writeFileSync(listPath, JSON.stringify(names), "utf8");
    const r = isWindows()
      ? spawnSync("tar.exe", ["-a", "-c", "-f", zipPath, "-C", staging, "."], {
          encoding: "utf8",
        })
      : spawnSync("python3", [scriptPath(), "create", staging, listPath, zipPath], {
          encoding: "utf8",
        });
    if (r.status !== 0) {
      throw new Error(
        `Archive create failed: ${(r.stderr || r.stdout || "error").slice(0, 400)}`
      );
    }
    return fs.readFileSync(zipPath);
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

export function extractArchiveZip(buf: Buffer): ArchiveFile[] {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aa-arch-in-"));
  try {
    const zipPath = path.join(tmp, "in.zip");
    const outDir = path.join(tmp, "out");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(zipPath, buf);
    if (isWindows()) {
      const listed = spawnSync("tar.exe", ["-tf", zipPath], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
      if (listed.status !== 0) {
        throw new Error(
          `Archive list failed: ${(listed.stderr || listed.stdout || "error").slice(0, 400)}`
        );
      }
      const names = listed.stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .filter((name) => !name.endsWith("/"))
        .map(assertSafeEntryName);
      const extracted = spawnSync("tar.exe", ["-xf", zipPath, "-C", outDir], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
      if (extracted.status !== 0) {
        throw new Error(
          `Archive extract failed: ${(extracted.stderr || extracted.stdout || "error").slice(0, 400)}`
        );
      }
      return names.map((name) => ({ name, data: fs.readFileSync(path.join(outDir, name)) }));
    }
    const listPath = path.join(tmp, "names.json");
    const r = spawnSync("python3", [scriptPath(), "extract", zipPath, outDir, listPath], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    if (r.status !== 0) {
      throw new Error(
        `Archive extract failed: ${(r.stderr || r.stdout || "error").slice(0, 400)}`
      );
    }
    const names = JSON.parse(fs.readFileSync(listPath, "utf8")) as string[];
    return names.map((name) => {
      const safe = assertSafeEntryName(name);
      return { name: safe, data: fs.readFileSync(path.join(outDir, safe)) };
    });
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
