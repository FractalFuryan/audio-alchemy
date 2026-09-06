"use client";

import { useRef, useState } from "react";

type ImportReport = {
  ok: boolean;
  imported: number;
  skipped: number;
  renamed: number;
  collectionsCreated: number;
  conflicts: Array<{
    id: string;
    title: string;
    action: "skipped" | "renamed";
    newId?: string;
  }>;
  errors: string[];
  warnings: string[];
};

export function LibraryBackupPanel({ onDone }: { onDone?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [conflict, setConflict] = useState<"skip" | "rename">("skip");
  const [message, setMessage] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onExport() {
    setExporting(true);
    setError(null);
    setMessage(null);
    setHint(null);
    try {
      const res = await fetch("/api/library/export");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Export failed");
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const match = /filename="([^"]+)"/.exec(cd);
      const filename = match?.[1] || "audio-alchemy-library.zip";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setMessage(`Exported ${filename}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function onImportFile(file: File) {
    setImporting(true);
    setError(null);
    setMessage(null);
    setHint(null);
    setReport(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("conflict", conflict);
      const res = await fetch("/api/library/import", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok && !data.report) {
        setError(data.error || "Import failed");
        setHint(data.hint || null);
        return;
      }
      const r = data.report as ImportReport;
      setReport(r);
      setMessage(
        r.ok
          ? `Import finished: ${r.imported} added, ${r.skipped} skipped, ${r.renamed} renamed.`
          : `Import completed with issues: ${r.imported} added.`
      );
      if (data.hint) setHint(data.hint);
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="aa-card mb-5 p-4 sm:p-5" aria-label="Library backup">
      <h2 className="text-sm font-semibold text-alchemy-gold">
        Backup &amp; restore
      </h2>
      <p className="mt-1 text-xs text-alchemy-muted">
        Export SQLite metadata + audio as a portable zip. Import validates
        first and never overwrites existing tracks silently (skip or rename).
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="aa-btn-primary !py-1.5 !text-xs"
          disabled={exporting || importing}
          onClick={() => void onExport()}
        >
          {exporting ? "Exporting…" : "Export library zip"}
        </button>
        <button
          type="button"
          className="aa-btn !py-1.5 !text-xs"
          disabled={exporting || importing}
          onClick={() => inputRef.current?.click()}
        >
          {importing ? "Importing…" : "Import zip…"}
        </button>
        <label className="flex items-center gap-1.5 text-xs text-alchemy-muted">
          On conflict:
          <select
            className="rounded-lg border border-alchemy-border bg-alchemy-bg px-2 py-1 text-alchemy-text"
            value={conflict}
            disabled={importing}
            onChange={(e) =>
              setConflict(e.target.value === "rename" ? "rename" : "skip")
            }
          >
            <option value="skip">Skip existing</option>
            <option value="rename">Rename (new id)</option>
          </select>
        </label>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImportFile(f);
          }}
        />
      </div>

      {message ? (
        <p className="mt-3 text-sm text-alchemy-success">{message}</p>
      ) : null}
      {hint ? <p className="mt-1 text-xs text-alchemy-gold">{hint}</p> : null}
      {error ? (
        <p className="mt-3 rounded-lg border border-alchemy-danger/40 bg-alchemy-danger/10 px-3 py-2 text-sm text-alchemy-danger">
          {error}
        </p>
      ) : null}
      {report?.conflicts?.length ? (
        <details className="mt-2 text-xs text-alchemy-muted">
          <summary className="cursor-pointer text-alchemy-text">
            Conflict report ({report.conflicts.length})
          </summary>
          <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-auto pl-5">
            {report.conflicts.map((c) => (
              <li key={`${c.id}-${c.action}-${c.newId || ""}`}>
                {c.title} ({c.id.slice(0, 8)}…) — {c.action}
                {c.newId ? ` → ${c.newId.slice(0, 8)}…` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {report?.errors?.length ? (
        <ul className="mt-2 list-disc pl-5 text-xs text-alchemy-danger">
          {report.errors.slice(0, 8).map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
