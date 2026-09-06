import { NextRequest, NextResponse } from "next/server";
import {
  createGeneration,
  listGenerations,
  reconcileOpenJobs,
  getGenerationMode,
} from "@/lib/generation";
import { parseAceStepOverridesFromBody } from "@/lib/ace-step-settings";
import { parsePresetId, PresetResolutionError } from "@/lib/presets";
import { parsePostFxPreset } from "@/lib/postprocess";
import { parsePlanningMode } from "@/lib/prompt-compiler";
import { AceRouteError } from "@/lib/ace-provider";
import type { GenerationSort, GenerationStatus, ListGenerationsQuery } from "@/lib/types";
import { formatActionableError } from "@/lib/user-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = new Set<GenerationStatus>([
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);

const ALLOWED_SORTS = new Set<GenerationSort>([
  "created_at_desc",
  "created_at_asc",
  "title_asc",
  "title_desc",
  "duration_desc",
]);

function parseListQuery(req: NextRequest): ListGenerationsQuery {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim() || undefined;

  const statusRaw = sp.get("status");
  let status: GenerationStatus[] | undefined;
  if (statusRaw) {
    const parts = statusRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean) as GenerationStatus[];
    const filtered = parts.filter((s) => ALLOWED_STATUSES.has(s));
    if (filtered.length) status = filtered;
  }

  const sortRaw = sp.get("sort") as GenerationSort | null;
  const sort =
    sortRaw && ALLOWED_SORTS.has(sortRaw) ? sortRaw : undefined;

  const favoriteRaw = sp.get("favorite");
  const favorite =
    favoriteRaw === "1" || favoriteRaw === "true"
      ? true
      : undefined;

  const collectionRaw = sp.get("collection");
  let collectionId: string | null | undefined;
  if (collectionRaw === "none" || collectionRaw === "") {
    collectionId = "none";
  } else if (collectionRaw) {
    collectionId = collectionRaw;
  }

  const tag = sp.get("tag")?.trim() || undefined;

  return { q, status, sort, favorite, collectionId, tag };
}

export async function GET(req: NextRequest) {
  try {
    await reconcileOpenJobs();
    const query = parseListQuery(req);
    const items = listGenerations(query);
    return NextResponse.json({ generations: items });
  } catch (err) {
    const a = formatActionableError(err);
    return NextResponse.json(
      { error: a.message, code: a.code, hint: a.hint },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const lyrics = typeof body.lyrics === "string" ? body.lyrics : undefined;
    const style = typeof body.style === "string" ? body.style : undefined;
    const title = typeof body.title === "string" ? body.title : undefined;
    const durationSec = Number(body.durationSec ?? body.duration ?? 60);
    const variationOf =
      typeof body.variationOf === "string" ? body.variationOf : undefined;

    const overrides = parseAceStepOverridesFromBody(body) ?? {};
    const preset = parsePresetId(body.preset);
    const postFxPreset = parsePostFxPreset(body.postFxPreset) ?? undefined;
    const planningMode = parsePlanningMode(body.planningMode) ?? "direct";
    const musicBrief =
      typeof body.musicBrief === "string" ? body.musicBrief : undefined;

    // Song focus forces thinking:true; Direct forces false (no silent claim).
    overrides.thinking = planningMode === "song-focus";

    const gen = await createGeneration({
      prompt,
      lyrics,
      style,
      title,
      durationSec,
      ...(preset ? { preset } : {}),
      ...(postFxPreset != null ? { postFxPreset } : {}),
      ...(variationOf ? { variationOf } : {}),
      planningMode,
      ...(musicBrief != null ? { musicBrief } : {}),
      ...overrides,
      thinking: planningMode === "song-focus",
    });
    return NextResponse.json({ generation: gen }, { status: 201 });
  } catch (err) {
    const a = formatActionableError(err);
    const withGen = err as Error & { generation?: unknown };
    let status = 500;
    if (err instanceof PresetResolutionError) status = err.status;
    else if (err instanceof AceRouteError) status = err.status;
    else if (a.code === "validation") status = 400;
    else if (a.code === "model_unavailable") status = 400;
    else if (a.code === "gpu_busy") status = 409;
    else if (a.code === "ace_offline" && getGenerationMode() === "ace-step") {
      status = 503;
    } else if (a.code === "disk_full" || a.code === "write_failed") {
      status = 507;
    }
    return NextResponse.json(
      {
        error: a.message,
        code: a.code,
        hint: a.hint,
        ...(withGen.generation ? { generation: withGen.generation } : {}),
      },
      { status }
    );
  }
}
