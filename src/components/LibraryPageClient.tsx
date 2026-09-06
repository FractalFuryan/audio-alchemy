"use client";

import { useState } from "react";
import { GenerationList } from "./GenerationList";
import { LibraryBackupPanel } from "./LibraryBackupPanel";
import { DiagnosticsPanel } from "./DiagnosticsPanel";

export function LibraryPageClient() {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-alchemy-text">
          Library
        </h1>
        <p className="mt-1 text-sm text-alchemy-muted">
          Search, favorites, collections, and tags — all stored locally on this
          machine. Open a track for details, metadata export, or a variation.
          Backup/restore keeps your library portable.
        </p>
      </div>
      <LibraryBackupPanel onDone={() => setRefreshKey((k) => k + 1)} />
      <div className="mb-5">
        <DiagnosticsPanel compact />
      </div>
      <GenerationList key={refreshKey} />
    </div>
  );
}
