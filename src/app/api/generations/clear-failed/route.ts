import { NextResponse } from "next/server";
import { clearFailedGenerations } from "@/lib/generation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await clearFailedGenerations();
    return NextResponse.json({ ok: true, deleted: result.deleted });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to clear failed generations";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
