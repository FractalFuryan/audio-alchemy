/**
 * Local ACE planner / LM availability detection (Song focus).
 *
 * Detection heuristic (documented):
 * 1. ACE must be connected (health reachable) for the active generation mode.
 * 2. Probe local model inventory from GET /v1/models (via models probe).
 * 3. Treat a model id as planner/LM when it matches any of:
 *    - substring "planner"
 *    - token "lm" bounded by start/separator/end (e.g. ace-lm, lm-0.6b)
 *    - "thinking" (ACE thinking / planner LM naming)
 *    - "0.6b" / "0.6B" / "06b" (local 0.6B LM class)
 *    - "language-model" / "language_model"
 *    - "ace-lm" / "acelm"
 * 4. Remote-only inventory matches do NOT enable Song focus (planner stays local).
 * 5. Env-fallback inventory without a live list never claims planner available.
 * 6. Never expose chain-of-thought, tokens, or filesystem paths — only boolean +
 *    matched model ids + short reason.
 */

export interface PlannerAvailability {
  available: boolean;
  /** Short, user-facing reason when unavailable. */
  reason: string | null;
  /** Model ids from local inventory that matched the LM/planner heuristic. */
  matchedModels: string[];
  /** Documented heuristic id for UI/docs. */
  heuristic: "local-inventory-lm-planner-v1";
  aceConnected: boolean;
}

const HEURISTIC = "local-inventory-lm-planner-v1" as const;

/** True when a model id looks like the local ACE planner / 0.6B LM. */
export function looksLikePlannerOrLm(modelId: string): boolean {
  const id = modelId.trim().toLowerCase();
  if (!id) return false;
  if (/planner/.test(id)) return true;
  if (/thinking/.test(id)) return true;
  if (/language[-_]?model/.test(id)) return true;
  if (/ace[-_]?lm/.test(id)) return true;
  if (/(?:^|[-_./])lm(?:[-_./]|$)/.test(id)) return true;
  if (/0\.?6\s*b|06b/.test(id)) return true;
  return false;
}

export function findPlannerModels(modelIds: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of modelIds) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    if (!looksLikePlannerOrLm(raw)) continue;
    const key = raw.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw.trim());
  }
  return out;
}

export interface ResolvePlannerAvailabilityInput {
  /** GENERATION_MODE */
  mode: "mock" | "ace-step";
  /** Local ACE /health reachable (ignored in mock). */
  aceConnected: boolean;
  /** Local inventory model ids only. */
  localModelIds: string[];
  /** True when /v1/models (or multi-provider local list) actually returned ids. */
  liveLocalInventory: boolean;
}

/**
 * Resolve whether Song focus may enable thinking:true.
 * Never silently claims available without ACE + inventory evidence.
 */
export function resolvePlannerAvailability(
  input: ResolvePlannerAvailabilityInput
): PlannerAvailability {
  if (input.mode === "mock") {
    return {
      available: false,
      reason: "Song focus needs ACE-Step connected (mock mode has no local planner).",
      matchedModels: [],
      heuristic: HEURISTIC,
      aceConnected: false,
    };
  }

  if (!input.aceConnected) {
    return {
      available: false,
      reason: "ACE-Step is offline — Song focus needs a connected local worker.",
      matchedModels: [],
      heuristic: HEURISTIC,
      aceConnected: false,
    };
  }

  if (!input.liveLocalInventory) {
    return {
      available: false,
      reason:
        "Local ACE planner/LM not confirmed (model inventory unreachable or empty).",
      matchedModels: [],
      heuristic: HEURISTIC,
      aceConnected: true,
    };
  }

  const matched = findPlannerModels(input.localModelIds);
  if (matched.length === 0) {
    return {
      available: false,
      reason:
        "Local ACE planner/LM not reported in model inventory (need an LM/planner/0.6B id).",
      matchedModels: [],
      heuristic: HEURISTIC,
      aceConnected: true,
    };
  }

  return {
    available: true,
    reason: null,
    matchedModels: matched,
    heuristic: HEURISTIC,
    aceConnected: true,
  };
}

/** Safe JSON blob for /api/health — no secrets or paths. */
export function plannerAvailabilityToSafeJson(
  p: PlannerAvailability
): Record<string, unknown> {
  return {
    available: p.available,
    reason: p.reason,
    matchedModels: p.matchedModels,
    heuristic: p.heuristic,
    aceConnected: p.aceConnected,
  };
}
