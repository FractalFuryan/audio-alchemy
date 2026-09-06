import { NextRequest, NextResponse } from "next/server";
import {
  deleteCollection,
  getCollection,
  renameCollection,
} from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const collection = getCollection(id);
    if (!collection) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ collection });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load collection";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name : "";
    const collection = renameCollection(id, name);
    if (!collection) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ collection });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to rename collection";
    const status = /required|already exists/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const ok = deleteCollection(id);
    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete collection";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
