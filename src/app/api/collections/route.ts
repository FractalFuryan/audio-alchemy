import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { createCollection, listCollections } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const collections = listCollections();
    return NextResponse.json({ collections });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to list collections";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name : "";
    const col = createCollection(name, uuidv4());
    return NextResponse.json({ collection: col }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create collection";
    const status = /required|already exists/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
