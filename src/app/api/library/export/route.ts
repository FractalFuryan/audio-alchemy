import { NextResponse } from "next/server";
import { exportLibraryArchive } from "@/lib/library-backup";
import { actionableErrorJson } from "@/lib/user-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — download portable library zip (SQLite metadata + audio). */
export async function GET() {
  try {
    const { filename, buffer, trackCount, audioCount } = exportLibraryArchive();
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(buffer.length),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Audio-Alchemy-Tracks": String(trackCount),
        "X-Audio-Alchemy-Audio-Files": String(audioCount),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const body = actionableErrorJson(err);
    return NextResponse.json(body, { status: 500 });
  }
}
