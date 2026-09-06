/**
 * Derive a clean, short track title from a free-form prompt.
 * Shared by server (generation.ts) and client (CreateForm preview).
 */

const FILLER_PREFIX =
  /^(please\s+)?(can\s+you\s+)?(make|create|generate|compose|write|produce|build|give\s+me|i\s+want|i'?d\s+like|play)\s+(me\s+)?(a|an|some|the)?\s*/i;

const FILLER_WORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "and",
  "or",
  "to",
  "for",
  "with",
  "in",
  "on",
  "at",
  "by",
  "from",
  "into",
  "about",
  "like",
  "some",
  "my",
  "your",
  "our",
  "track",
  "song",
  "music",
  "piece",
  "tune",
  "beat",
  "audio",
  "sound",
]);

const MAX_TITLE = 56;

function toTitleCase(words: string[]): string {
  return words
    .map((w, i) => {
      const lower = w.toLowerCase();
      // Keep short connectors lowercase when not first word
      if (i > 0 && FILLER_WORDS.has(lower) && lower.length <= 3) {
        return lower;
      }
      if (/^[A-Z0-9]+$/.test(w) && w.length <= 4) return w; // BPM, EDM, etc.
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/**
 * Strip filler, take first clause, Title Case, clamp length.
 * If `explicit` is provided and non-empty, use that (trimmed, clamped).
 */
export function titleFromPrompt(prompt: string, explicit?: string): string {
  if (explicit?.trim()) {
    return explicit.trim().replace(/\s+/g, " ").slice(0, 80);
  }

  let text = (prompt || "").trim().replace(/\s+/g, " ");
  if (!text) return "Untitled generation";

  // First clause only
  const clauseMatch = text.match(/^(.+?)([.!?;:\n—–]| - | – | — )/);
  if (clauseMatch) {
    text = clauseMatch[1].trim();
  }

  text = text.replace(FILLER_PREFIX, "").trim();
  if (!text) {
    text = (prompt || "").trim().replace(/\s+/g, " ");
  }

  // Drop trailing filler phrases
  text = text.replace(/\s+(please|thanks|thank you)\.?$/i, "").trim();

  const rawWords = text.split(/\s+/).filter(Boolean);
  // Soft-strip leading articles only (keep musical descriptors)
  while (rawWords.length > 1 && FILLER_WORDS.has(rawWords[0].toLowerCase())) {
    const w = rawWords[0].toLowerCase();
    if (w === "a" || w === "an" || w === "the" || w === "some") {
      rawWords.shift();
    } else {
      break;
    }
  }

  let titled = toTitleCase(rawWords);
  if (!titled) return "Untitled generation";

  if (titled.length > MAX_TITLE) {
    const cut = titled.slice(0, MAX_TITLE - 1);
    const lastSpace = cut.lastIndexOf(" ");
    titled = (lastSpace > 24 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
  }

  return titled;
}
