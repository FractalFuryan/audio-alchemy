import { NextRequest, NextResponse } from "next/server";
import {
  createGeneration,
  listGenerations,
  reconcileOpenJobs,
  getGenerationMode,
} from "@/lib/generation";
import { parseAceStepOverridesFromBody } from "@/lib/ace-step-settings";
import { parsePresetId, PresetResolutionError } from "@/lib/presets";
import { AceRouteError } from "@/lib/ace-provider";
import type { GenerationSort, GenerationStatus, ListGenerationsQuery } from "@/lib/types";

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

  return { q, status, sort };
}

export async function GET(req: NextRequest) {
  try {
    await reconcileOpenJobs();
    const query = parseListQuery(req);
    const items = listGenerations(query);
    return NextResponse.json({ generations: items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list generations";
    return NextResponse.json({ error: message }, { status: 500 });
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

    // Optional Advanced overrides — applied server-side only (never browser env secrets).
    const overrides = parseAceStepOverridesFromBody(body);
    const preset = parsePresetId(body.preset);

    const gen = await createGeneration({
      prompt,
      lyrics,
      style,
      title,
      durationSec,
      ...(preset ? { preset } : {}),
      ...overrides,
    });
    return NextResponse.json({ generation: gen }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create generation";
    const withGen = err as Error & { generation?: unknown };
    let status = 500;
    if (err instanceof PresetResolutionError) status = err.status;
    else if (err instanceof AceRouteError) status = err.status;
    else if (message.includes("required")) status = 400;
    else if (/not available|not supported|XL checkpoint/i.test(message)) status = 400;
    else if (/busy|single-flight/i.test(message)) status = 409;
    else if (/unreachable|ACE-Step/i.test(message) && getGenerationMode() === "ace-step") {
      status = 503;
    }
    return NextResponse.json(
      {
        error: message,
        ...(withGen.generation ? { generation: withGen.generation } : {}),
      },
      { status }
    );
  }
}
