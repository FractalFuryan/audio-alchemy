import { NextRequest, NextResponse } from "next/server";
import {
  getGeneration,
  reconcileGeneration,
  cancelGeneration,
  renameGeneration,
  deleteGeneration,
} from "@/lib/generation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const gen = await reconcileGeneration(id);
    if (!gen) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ generation: gen });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load generation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const existing = getGeneration(id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    let gen = existing;

    if (body && typeof body.title === "string") {
      const renamed = await renameGeneration(id, body.title);
      if (!renamed) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      gen = renamed;
    }

    if (body && body.cancel === true) {
      const cancelled = await cancelGeneration(id);
      if (!cancelled) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      gen = cancelled;
    }

    return NextResponse.json({ generation: gen });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update generation";
    const status = message.includes("required") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const ok = await deleteGeneration(id);
    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete generation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
