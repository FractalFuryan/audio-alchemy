import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { getGeneration, resolveAudioAbsolutePath } from "@/lib/generation";

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
    if (gen.status !== "completed") {
      return NextResponse.json(
        { error: "Audio not ready", status: gen.status },
        { status: 409 }
      );
    }
    const abs = resolveAudioAbsolutePath(gen);
    if (!abs) {
      return NextResponse.json({ error: "Audio file missing" }, { status: 404 });
    }

    const data = fs.readFileSync(abs);
    const mime = gen.audioMime || "audio/wav";
    const download = req.nextUrl.searchParams.get("download") === "1";
    const ext = mime.includes("wav")
      ? "wav"
      : mime.includes("flac")
        ? "flac"
        : "mp3";
    const safeName = gen.title.replace(/[^\w\-]+/g, "_").slice(0, 40) || gen.id;
    const disposition = download ? "attachment" : "inline";

    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(data.length),
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `${disposition}; filename="${safeName}.${ext}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to serve audio";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
