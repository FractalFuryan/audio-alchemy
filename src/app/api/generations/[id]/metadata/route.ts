import { NextRequest, NextResponse } from "next/server";
import { getGeneration } from "@/lib/generation";
import { getCollection } from "@/lib/db";
import {
  buildMetadataExport,
  metadataExportFilename,
} from "@/lib/library-meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const gen = getGeneration(id);
    if (!gen) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const collection =
      gen.collectionId != null ? getCollection(gen.collectionId) : null;
    const doc = buildMetadataExport(
      gen,
      collection ? { id: collection.id, name: collection.name } : null
    );
    const download = req.nextUrl.searchParams.get("download") === "1";
    const body = JSON.stringify(doc, null, 2);
    const headers: Record<string, string> = {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    };
    if (download) {
      headers["Content-Disposition"] =
        `attachment; filename="${metadataExportFilename(gen)}"`;
    }
    return new NextResponse(body, { status: 200, headers });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to export metadata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
