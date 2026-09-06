import { NextRequest, NextResponse } from "next/server";
import { retryGeneration } from "@/lib/generation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const gen = await retryGeneration(id);
    return NextResponse.json({ generation: gen });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to retry generation";
    let status = 500;
    if (message === "Not found") status = 404;
    else if (/Only failed|cancelled/i.test(message)) status = 400;
    else if (/busy|single-flight/i.test(message)) status = 409;
    else if (/unreachable|ACE-Step/i.test(message)) status = 503;
    const withGen = err as Error & { generation?: unknown };
    return NextResponse.json(
      {
        error: message,
        ...(withGen.generation ? { generation: withGen.generation } : {}),
      },
      { status }
    );
  }
}
