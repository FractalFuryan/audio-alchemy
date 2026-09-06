/**
 * Deterministic prompt compiler — NOT an LLM.
 * Organizes user prompt + style tags into a concise editable music brief.
 * Preserves the user's actual words; only normalizes whitespace, dedupes tags,
 * and orders content into sections. Lyrics stay separate.
 */

export type PlanningMode = "direct" | "song-focus";

export function parsePlanningMode(raw: unknown): PlanningMode | null {
  if (raw === "direct" || raw === "song-focus") return raw;
  if (raw === "song_focus" || raw === "songFocus") return "song-focus";
  return null;
}

/** thinking:true only when Song focus is explicitly selected — never silently. */
export function thinkingForPlanningMode(
  mode: PlanningMode | null | undefined
): boolean {
  return mode === "song-focus";
}

export interface StyleConflict {
  tag: string;
  reason: string;
}

export interface PromptCompileInput {
  prompt: string;
  style?: string | null;
  lyrics?: string | null;
}

export interface PromptCompileResult {
  /** Concise music brief for ACE submit (Song focus). */
  musicBrief: string;
  /** Deduped style tags (conflicts still listed separately). */
  styleTags: string[];
  /** Lyrics kept separate — never folded into the music brief. */
  lyrics: string | null;
  conflicts: StyleConflict[];
  sections: {
    coreSound: string[];
    energyMood: string[];
    arrangement: string[];
    production: string[];
    constraints: string[];
  };
}

const ENERGY_MOOD_RE =
  /\b(calm|chill|relaxed|peaceful|serene|dreamy|ethereal|dark|moody|melanchol\w*|sad|happy|upbeat|energetic|aggressive|intense|epic|cinematic|warm|cold|nostalgic|hopeful|tense|groovy|funky|romantic|haunting|bright|mellow|powerful|soft|hard|emotional|euphoric|somber|playful|driving)\b/i;

const ARRANGEMENT_RE =
  /\b(intro|outro|verse|chorus|bridge|breakdown|drop|build[- ]?up|buildup|pre[- ]?chorus|hook|solo|interlude|section|arrangement|structure|song form|A\/B|ABA)\b/i;

const PRODUCTION_RE =
  /\b(lo-?fi|lofi|hi-?fi|reverb|delay|compressed|compression|distorted|distortion|sidechain|saturat\w*|tape|analog|digital|polished|raw|dry|wet|wide|stereo|mono|mix|master|production|produced|layered|sparse|dense|crisp|muddy|glitchy|granular|filtered|chorus effect|phaser|flanger)\b/i;

const CONSTRAINT_RE =
  /\b(instrumental|no vocals?|without vocals?|vocals? only|a cappella|acapella|no (?:synth|guitar|drums?|bass|piano|strings?)(?:\s+\w+)?|without (?:synth|guitar|drums?|bass|piano|strings?)(?:\s+\w+)?|no lead|unplugged|acoustic only)\b/i;

const INSTRUMENT_RE =
  /\b(guitar|bass|drums?|piano|keys|synth|synths|pad|pads|strings?|violin|cello|brass|sax(?:ophone)?|flute|vocals?|voice|choir|organ|rhodes|ukulele|banjo|harp|percussion|808|909|arp|lead|riff)\b/i;

const GENRE_RE =
  /\b(lo-?fi|lofi|ambient|cinematic|synthwave|retrowave|vaporwave|acoustic|jazz|blues|rock|metal|metalcore|punk|pop|hip-?hop|rap|r&b|rnb|soul|funk|disco|house|techno|trance|drum(?:\s*|-)and(?:\s*|-)bass|dnb|dubstep|edm|classical|orchestral|folk|country|reggae|ska|gospel|indie|alternative|electronic|electro|dance|trap|phonk|shoegaze|post-rock|progressive|industrial|hardcore)\b/i;

/** Opposing genre families for conflict detection (tag vs prompt). */
const GENRE_FAMILIES: Array<{ id: string; pattern: RegExp }> = [
  { id: "metal", pattern: /\b(metal|metalcore|hardcore|death metal|black metal)\b/i },
  { id: "jazz", pattern: /\b(jazz|bebop|swing)\b/i },
  { id: "lofi", pattern: /\b(lo-?fi|lofi|chillhop)\b/i },
  { id: "edm", pattern: /\b(edm|house|techno|trance|dubstep|drum(?:\s*|-)and(?:\s*|-)bass|dnb)\b/i },
  { id: "classical", pattern: /\b(classical|orchestral|symphony)\b/i },
  { id: "hiphop", pattern: /\b(hip-?hop|rap|trap|phonk)\b/i },
  { id: "folk", pattern: /\b(folk|country|bluegrass)\b/i },
  { id: "synthwave", pattern: /\b(synthwave|retrowave|vaporwave)\b/i },
  { id: "ambient", pattern: /\b(ambient|drone)\b/i },
  { id: "punk", pattern: /\b(punk|ska)\b/i },
];

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = normalizeWhitespace(raw);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export function parseStyleTags(style: string | null | undefined): string[] {
  if (!style?.trim()) return [];
  return dedupeTags(style.split(","));
}

function genreFamiliesIn(text: string): Set<string> {
  const found = new Set<string>();
  for (const g of GENRE_FAMILIES) {
    if (g.pattern.test(text)) found.add(g.id);
  }
  return found;
}

/**
 * Detect style tags that conflict with the prompt (or with each other).
 * Does not invent artist names; only structural/genre/constraint conflicts.
 */
export function detectStylePromptConflicts(
  prompt: string,
  styleTags: string[]
): StyleConflict[] {
  const conflicts: StyleConflict[] = [];
  const promptNorm = normalizeWhitespace(prompt);
  const promptLower = promptNorm.toLowerCase();
  const promptFamilies = genreFamiliesIn(promptNorm);

  // Tag vs tag opposing genres
  const tagFamilies = new Map<string, string[]>();
  for (const tag of styleTags) {
    const fams = genreFamiliesIn(tag);
    for (const f of fams) {
      const list = tagFamilies.get(f) ?? [];
      list.push(tag);
      tagFamilies.set(f, list);
    }
  }

  const opposingPairs: Array<[string, string]> = [
    ["metal", "jazz"],
    ["metal", "lofi"],
    ["metal", "ambient"],
    ["metal", "classical"],
    ["jazz", "edm"],
    ["jazz", "punk"],
    ["lofi", "edm"],
    ["lofi", "punk"],
    ["classical", "edm"],
    ["classical", "hiphop"],
    ["classical", "punk"],
    ["ambient", "punk"],
    ["folk", "edm"],
    ["folk", "metal"],
  ];
  for (const [a, b] of opposingPairs) {
    if (tagFamilies.has(a) && tagFamilies.has(b)) {
      for (const t of [...(tagFamilies.get(a) || []), ...(tagFamilies.get(b) || [])]) {
        if (!conflicts.some((c) => c.tag.toLowerCase() === t.toLowerCase())) {
          conflicts.push({
            tag: t,
            reason: `Style tags mix opposing genres (${a} vs ${b}).`,
          });
        }
      }
    }
  }

  // Tag genre vs prompt genre
  for (const tag of styleTags) {
    const tagFams = genreFamiliesIn(tag);
    for (const tf of tagFams) {
      for (const pf of promptFamilies) {
        if (tf === pf) continue;
        const clash = opposingPairs.some(
          ([a, b]) =>
            (a === tf && b === pf) || (a === pf && b === tf)
        );
        if (clash) {
          if (!conflicts.some((c) => c.tag.toLowerCase() === tag.toLowerCase())) {
            conflicts.push({
              tag,
              reason: `Style tag "${tag}" conflicts with genre cues in the prompt.`,
            });
          }
        }
      }
    }
  }

  // Explicit "no X" / "without X" in prompt vs tag containing X
  const noMatches = promptNorm.matchAll(
    /\b(?:no|without)\s+([a-z0-9][a-z0-9\- ]{1,24})/gi
  );
  for (const m of noMatches) {
    const banned = normalizeWhitespace(m[1] || "").toLowerCase();
    if (!banned || banned.length < 2) continue;
    const bannedRoot = banned.split(/\s+/)[0];
    for (const tag of styleTags) {
      const tl = tag.toLowerCase();
      if (tl.includes(banned) || tl.includes(bannedRoot)) {
        if (!conflicts.some((c) => c.tag.toLowerCase() === tag.toLowerCase())) {
          conflicts.push({
            tag,
            reason: `Prompt says "no/without ${banned}" but style includes "${tag}".`,
          });
        }
      }
    }
  }

  // Instrumental / no vocals vs vocal-looking lyrics handled by caller via lyrics;
  // also flag "instrumental" tag when prompt clearly asks for sung vocals.
  const wantsVocals =
    /\b(with vocals?|sung|singer|female vocal|male vocal|choir)\b/i.test(promptNorm);
  const instrumentalTag = styleTags.find((t) =>
    /\binstrumental\b/i.test(t)
  );
  if (wantsVocals && instrumentalTag) {
    conflicts.push({
      tag: instrumentalTag,
      reason: `Style says instrumental but prompt asks for vocals.`,
    });
  }

  // Tag already fully present as a phrase in prompt — not a conflict, just dedupe later.
  void promptLower;

  return conflicts;
}

function splitClauses(prompt: string): string[] {
  return prompt
    .split(/[.;\n]+/)
    .map((c) => normalizeWhitespace(c))
    .filter(Boolean);
}

function classifyClause(clause: string): keyof PromptCompileResult["sections"] | "other" {
  if (CONSTRAINT_RE.test(clause)) return "constraints";
  if (ARRANGEMENT_RE.test(clause)) return "arrangement";
  if (PRODUCTION_RE.test(clause) && !GENRE_RE.test(clause) && !INSTRUMENT_RE.test(clause)) {
    return "production";
  }
  if (ENERGY_MOOD_RE.test(clause) && !GENRE_RE.test(clause) && !INSTRUMENT_RE.test(clause)) {
    return "energyMood";
  }
  if (GENRE_RE.test(clause) || INSTRUMENT_RE.test(clause)) return "coreSound";
  if (PRODUCTION_RE.test(clause)) return "production";
  if (ENERGY_MOOD_RE.test(clause)) return "energyMood";
  return "other";
}

function tagAlreadyInPrompt(tag: string, promptLower: string): boolean {
  const t = tag.toLowerCase();
  if (!t) return false;
  // Whole-tag phrase match (avoid tiny false positives)
  if (t.length >= 3 && promptLower.includes(t)) return true;
  return false;
}

/**
 * Compile user input into an ordered, deduped music brief.
 * Does not call any LLM. Preserves user wording.
 */
export function compileMusicBrief(input: PromptCompileInput): PromptCompileResult {
  const prompt = normalizeWhitespace(input.prompt || "");
  const styleTags = parseStyleTags(input.style);
  const lyricsRaw = input.lyrics?.trim() || "";
  const lyrics = lyricsRaw ? lyricsRaw.replace(/\r\n/g, "\n") : null;

  const conflicts = detectStylePromptConflicts(prompt, styleTags);
  const promptLower = prompt.toLowerCase();

  // Style tags that are not already duplicated in the prompt text
  const uniqueStyleTags = styleTags.filter((t) => !tagAlreadyInPrompt(t, promptLower));

  const sections: PromptCompileResult["sections"] = {
    coreSound: [],
    energyMood: [],
    arrangement: [],
    production: [],
    constraints: [],
  };

  // Seed core sound from unique style tags (genre/instrument-ish first)
  for (const tag of uniqueStyleTags) {
    if (GENRE_RE.test(tag) || INSTRUMENT_RE.test(tag)) {
      sections.coreSound.push(tag);
    } else if (ENERGY_MOOD_RE.test(tag)) {
      sections.energyMood.push(tag);
    } else if (PRODUCTION_RE.test(tag)) {
      sections.production.push(tag);
    } else if (CONSTRAINT_RE.test(tag)) {
      sections.constraints.push(tag);
    } else {
      sections.coreSound.push(tag);
    }
  }

  const others: string[] = [];
  for (const clause of splitClauses(prompt)) {
    const bucket = classifyClause(clause);
    if (bucket === "other") {
      others.push(clause);
    } else {
      // Avoid duplicating exact clause already captured from tags
      const list = sections[bucket];
      if (!list.some((x) => x.toLowerCase() === clause.toLowerCase())) {
        list.push(clause);
      }
    }
  }

  // Leftover prompt clauses (main idea) go to core sound if empty, else energy/mood append area
  for (const clause of others) {
    if (
      sections.coreSound.some((x) => x.toLowerCase() === clause.toLowerCase()) ||
      sections.energyMood.some((x) => x.toLowerCase() === clause.toLowerCase())
    ) {
      continue;
    }
    if (sections.coreSound.length === 0) {
      sections.coreSound.push(clause);
    } else {
      // Keep main idea visible — prefer core sound for uncategorized narrative
      sections.coreSound.push(clause);
    }
  }

  const parts: string[] = [];
  const pushSection = (label: string, items: string[]) => {
    const deduped = dedupeTags(items);
    if (!deduped.length) return;
    parts.push(`${label}: ${deduped.join("; ")}`);
  };

  pushSection("Core sound", sections.coreSound);
  pushSection("Energy and mood", sections.energyMood);
  pushSection("Arrangement", sections.arrangement);
  pushSection("Production", sections.production);
  pushSection("Constraints", sections.constraints);

  let musicBrief = parts.join(". ");
  if (!musicBrief && prompt) {
    musicBrief = prompt;
  }

  return {
    musicBrief,
    styleTags,
    lyrics,
    conflicts,
    sections,
  };
}

/** Remove conflicting tags from a style string (one-click clear). */
export function clearConflictingTags(
  style: string | null | undefined,
  conflicts: StyleConflict[]
): string {
  const deny = new Set(conflicts.map((c) => c.tag.toLowerCase()));
  return parseStyleTags(style)
    .filter((t) => !deny.has(t.toLowerCase()))
    .join(", ");
}
