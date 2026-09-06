import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { getGeneration, resolveAudioAbsolutePath } from "@/lib/generation";
import { formatActionableError } from "@/lib/user-errors";

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
      return NextResponse.json(
        {
          error: "That track was not found.",
          code: "not_found",
          hint: "Refresh the library — it may have been deleted.",
        },
        { status: 404 }
      );
    }
    if (gen.status !== "completed") {
      return NextResponse.json(
        {
          error: "Audio is not ready yet.",
          code: "missing_audio",
          hint: `Track status is ${gen.status}. Wait for completion or retry the generation.`,
          status: gen.status,
        },
        { status: 409 }
      );
    }
    const abs = resolveAudioAbsolutePath(gen);
    if (!abs) {
      const a = formatActionableError(new Error("Audio file missing"));
      return NextResponse.json(
        { error: a.message, code: a.code, hint: a.hint },
        { status: 404 }
      );
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
    const a = formatActionableError(err);
    return NextResponse.json(
      { error: a.message, code: a.code, hint: a.hint },
      { status: 500 }
    );
  }
}
