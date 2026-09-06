import fs from "fs";
import path from "path";

export interface PromptTemplate {
  id: string;
  label: string;
  styleTags: string[];
  promptSkeleton: string;
  lyricsSkeleton?: string | null;
  defaultDurationSec?: number;
  pack?: string;
  structureHints?: string[];
}

/** Denylist tokens — templates must not name living artists / trademarked acts. */
const ARTIST_NAME_DENYLIST = [
  "taylor swift",
  "drake",
  "the beatles",
  "beyonce",
  "beyoncé",
  "weekend", // the weeknd — too broad alone; use fuller phrases below
  "the weeknd",
  "billie eilish",
  "bad bunny",
  "ed sheeran",
  "ariana grande",
  "bruno mars",
  "suno",
  "udio",
];

function templatesRoot(): string {
  return path.join(process.cwd(), "data", "templates");
}

function normalizeTemplate(t: Record<string, unknown>, pack?: string): PromptTemplate | null {
  if (typeof t.id !== "string" || typeof t.label !== "string") return null;
  if (typeof t.promptSkeleton !== "string" || !Array.isArray(t.styleTags)) return null;
  return {
    id: t.id,
    label: t.label,
    styleTags: (t.styleTags || []).map(String),
    promptSkeleton: t.promptSkeleton,
    lyricsSkeleton: t.lyricsSkeleton == null ? null : String(t.lyricsSkeleton),
    defaultDurationSec:
      typeof t.defaultDurationSec === "number"
        ? Math.min(180, Math.max(30, Math.round(t.defaultDurationSec)))
        : undefined,
    pack: typeof t.pack === "string" ? t.pack : pack,
    structureHints: Array.isArray(t.structureHints)
      ? t.structureHints.map(String)
      : undefined,
  };
}

export function findArtistNameViolations(text: string): string[] {
  const lower = text.toLowerCase();
  return ARTIST_NAME_DENYLIST.filter((token) => {
    if (token === "weekend") return false; // skip overly broad token
    return lower.includes(token);
  });
}

export function assertTemplateArtistFree(t: PromptTemplate): string[] {
  const blob = [t.label, t.promptSkeleton, t.lyricsSkeleton || "", ...(t.styleTags || [])].join(
    " "
  );
  return findArtistNameViolations(blob);
}

/** Assemble prompts.json + packs/*.json into one list (packs win on id collision). */
export function assemblePromptTemplates(): PromptTemplate[] {
  const root = templatesRoot();
  const byId = new Map<string, PromptTemplate>();

  const mainPath = path.join(root, "prompts.json");
  if (fs.existsSync(mainPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(mainPath, "utf8")) as unknown;
      if (Array.isArray(raw)) {
        for (const item of raw) {
          if (!item || typeof item !== "object") continue;
          const t = normalizeTemplate(item as Record<string, unknown>, "core");
          if (t) byId.set(t.id, t);
        }
      }
    } catch (err) {
      console.warn("[templates] failed to load prompts.json", err);
    }
  }

  const packsDir = path.join(root, "packs");
  if (fs.existsSync(packsDir)) {
    for (const name of fs.readdirSync(packsDir).sort()) {
      if (!name.endsWith(".json")) continue;
      const packId = name.replace(/\.json$/i, "");
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(packsDir, name), "utf8")) as unknown;
        const list = Array.isArray(raw)
          ? raw
          : raw && typeof raw === "object" && Array.isArray((raw as { templates?: unknown }).templates)
            ? (raw as { templates: unknown[] }).templates
            : [];
        for (const item of list) {
          if (!item || typeof item !== "object") continue;
          const t = normalizeTemplate(item as Record<string, unknown>, packId);
          if (t) byId.set(t.id, t);
        }
      } catch (err) {
        console.warn("[templates] failed to load pack", name, err);
      }
    }
  }

  return [...byId.values()];
}

export function loadPromptTemplates(pack?: string): PromptTemplate[] {
  const all = assemblePromptTemplates();
  const filtered = pack ? all.filter((t) => (t.pack || "core") === pack) : all;
  for (const t of filtered) {
    const violations = assertTemplateArtistFree(t);
    if (violations.length) {
      console.warn(
        `[templates] artist-name denylist hit on ${t.id}: ${violations.join(", ")}`
      );
    }
  }
  return filtered.filter((t) => assertTemplateArtistFree(t).length === 0);
}

export function listTemplatePacks(): string[] {
  const packs = new Set(assemblePromptTemplates().map((t) => t.pack || "core"));
  return [...packs].sort();
}
