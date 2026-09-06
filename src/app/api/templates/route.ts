import { NextRequest, NextResponse } from "next/server";
import { listTemplatePacks, loadPromptTemplates } from "@/lib/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public prompt template packs — no secrets. Optional ?pack= filter. */
export async function GET(req: NextRequest) {
  const pack = req.nextUrl.searchParams.get("pack")?.trim() || undefined;
  const templates = loadPromptTemplates(pack);
  const packs = listTemplatePacks();
  return NextResponse.json({ templates, packs });
}
