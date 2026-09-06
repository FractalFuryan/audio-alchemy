import path from "path";
import fs from "fs";

export function getDataDir(): string {
  const dir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "audio"), { recursive: true });
  return dir;
}

export function getAudioDir(): string {
  return path.join(getDataDir(), "audio");
}

export function getDbPath(): string {
  return path.join(getDataDir(), "audio-alchemy.db");
}
