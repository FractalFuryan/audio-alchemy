import { NextRequest, NextResponse } from "next/server";
import {
  importLibraryArchive,
  validateLibraryArchive,
  type ImportConflictMode,
} from "@/lib/library-backup";
import { actionableErrorJson } from "@/lib/user-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST multipart: file=zip, conflict=skip|rename
 * Validates before writing; never overwrites existing tracks silently.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const conflictRaw = String(form.get("conflict") || "skip").toLowerCase();
    const conflict: ImportConflictMode =
      conflictRaw === "rename" ? "rename" : "skip";

    if (
      file == null ||
      typeof file === "string" ||
      typeof (file as Blob).arrayBuffer !== "function"
    ) {
      return NextResponse.json(
        {
          error: "Missing library backup file.",
          code: "validation",
          hint: "Upload an Audio Alchemy library .zip exported from this app.",
        },
        { status: 400 }
      );
    }

    const blob = file as Blob;
    const ab = await blob.arrayBuffer();
    const buf = Buffer.from(ab);
    if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
      return NextResponse.json(
        {
          error: "File does not look like a ZIP archive.",
          code: "validation",
          hint: "Use a library backup exported from Audio Alchemy (manifest.json + audio/).",
        },
        { status: 400 }
      );
    }

    // Validate-only first (throws on bad schema / missing audio listed in manifest).
    validateLibraryArchive(buf);
    const report = importLibraryArchive(buf, conflict);
    return NextResponse.json({ report }, { status: report.ok ? 200 : 207 });
  } catch (err) {
    const body = actionableErrorJson(err);
    const message = err instanceof Error ? err.message : body.error;
    if (/Invalid library backup|unsupported schema|missing manifest/i.test(message)) {
      return NextResponse.json(
        {
          error: message,
          code: "validation",
          hint: "Export a fresh backup from Library, or fix the archive layout (manifest.json + audio/).",
        },
        { status: 400 }
      );
    }
    const status = body.code === "validation" ? 400 : 500;
    return NextResponse.json(body, { status });
  }
}
