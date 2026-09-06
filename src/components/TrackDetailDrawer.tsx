"use client";

import { useEffect, useMemo, useState } from "react";
import type { Collection, Generation } from "@/lib/types";
import { resolveDisplayModelLabel } from "@/lib/ace-capabilities";
import { parseUserTags } from "@/lib/library-meta";
import { AudioPlayer } from "./AudioPlayer";

interface TrackDetailDrawerProps {
  generation: Generation;
  collections: Collection[];
  busy?: boolean;
  onClose: () => void;
  onToggleFavorite: (id: string, favorite: boolean) => void;
  onSaveTags: (id: string, tags: string[]) => Promise<void>;
  onSetCollection: (id: string, collectionId: string | null) => Promise<void>;
  onGenerateVariation: (id: string) => void;
}

export function TrackDetailDrawer({
  generation: g,
  collections,
  busy,
  onClose,
  onToggleFavorite,
  onSaveTags,
  onSetCollection,
  onGenerateVariation,
}: TrackDetailDrawerProps) {
  const [tagInput, setTagInput] = useState(() => parseUserTags(g.userTags).join(", "));
  const [collectionId, setCollectionId] = useState(g.collectionId ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTagInput(parseUserTags(g.userTags).join(", "));
    setCollectionId(g.collectionId ?? "");
  }, [g.id, g.userTags, g.collectionId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const display = useMemo(
    () =>
      resolveDisplayModelLabel({
        requestedModelName: g.requestedModelName ?? g.modelName,
        actualModelName: g.actualModelName,
        requestedCapability: g.requestedCapability,
        actualCapability: g.actualCapability,
        status: g.status,
      }),
    [g]
  );

  const userTags = parseUserTags(g.userTags);
  const styleTags = (g.style || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  async function saveTags() {
    setSaving(true);
    try {
      const tags = tagInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await onSaveTags(g.id, tags);
    } finally {
      setSaving(false);
    }
  }

  async function saveCollection(next: string) {
    setCollectionId(next);
    setSaving(true);
    try {
      await onSetCollection(g.id, next || null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="track-detail-title"
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-alchemy-border bg-alchemy-surface shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-alchemy-border/80 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-alchemy-gold/90">
              Track detail
            </p>
            <h2
              id="track-detail-title"
              className="mt-0.5 truncate text-lg font-semibold text-alchemy-text"
            >
              {g.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="aa-btn !px-2 !py-1 text-xs"
            aria-label="Close detail"
          >
            Close
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {g.status === "completed" ? (
            <AudioPlayer src={`/api/audio/${g.id}`} title={g.title} compact />
          ) : null}

          <section className="space-y-1">
            <h3 className="text-xs font-medium uppercase tracking-wide text-alchemy-muted">
              Prompt
            </h3>
            <p className="whitespace-pre-wrap text-sm text-alchemy-text">
              {g.originalPrompt || g.prompt}
            </p>
          </section>

          {g.planningMode === "song-focus" && g.musicBrief ? (
            <section className="space-y-1">
              <h3 className="text-xs font-medium uppercase tracking-wide text-alchemy-muted">
                Music brief{" "}
                <span className="font-normal normal-case text-alchemy-gold">(Song focus)</span>
              </h3>
              <p className="whitespace-pre-wrap rounded-xl border border-alchemy-accent/25 bg-alchemy-accent/5 p-3 text-sm text-alchemy-text">
                {g.musicBrief}
              </p>
            </section>
          ) : null}

          {g.lyrics ? (
            <section className="space-y-1">
              <h3 className="text-xs font-medium uppercase tracking-wide text-alchemy-muted">
                Lyrics
              </h3>
              <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl border border-alchemy-border/70 bg-alchemy-bg/60 p-3 text-xs text-alchemy-text">
                {g.lyrics}
              </pre>
            </section>
          ) : null}

          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-alchemy-muted">
              Style tags
            </h3>
            {styleTags.length ? (
              <div className="flex flex-wrap gap-1.5">
                {styleTags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-alchemy-accent/40 bg-alchemy-accent/15 px-2 py-0.5 text-[11px] text-alchemy-text"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-alchemy-muted">None</p>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-alchemy-muted">
              Library tags
            </h3>
            <div className="flex gap-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="comma-separated tags"
                className="aa-input !py-2 text-xs"
                disabled={busy || saving}
              />
              <button
                type="button"
                className="aa-btn shrink-0 !py-2 text-xs"
                disabled={busy || saving}
                onClick={() => void saveTags()}
              >
                Save
              </button>
            </div>
            {userTags.length ? (
              <div className="flex flex-wrap gap-1.5">
                {userTags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-alchemy-gold/40 bg-alchemy-gold/10 px-2 py-0.5 text-[11px] text-alchemy-gold"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-alchemy-muted">
              Collection
            </h3>
            <select
              value={collectionId}
              onChange={(e) => void saveCollection(e.target.value)}
              className="aa-input !py-2 text-sm"
              disabled={busy || saving}
            >
              <option value="">Unfiled</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </section>

          <section className="space-y-2 rounded-xl border border-alchemy-border/70 bg-alchemy-bg/40 p-3">
            <h3 className="text-xs font-medium uppercase tracking-wide text-alchemy-muted">
              Generation
            </h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
              <dt className="text-alchemy-muted">Duration</dt>
              <dd className="text-alchemy-text">
                {formatDuration(g.audioDurationSec ?? g.durationSec)}
                {g.audioDurationSec != null ? " (audio)" : " (requested)"}
              </dd>
              <dt className="text-alchemy-muted">Generated</dt>
              <dd className="text-alchemy-text">{formatWhen(g.createdAt)}</dd>
              <dt className="text-alchemy-muted">Updated</dt>
              <dd className="text-alchemy-text">{formatWhen(g.updatedAt)}</dd>
              <dt className="text-alchemy-muted">Status</dt>
              <dd className="text-alchemy-text">{g.status}</dd>
              <dt className="text-alchemy-muted">Planning</dt>
              <dd className="text-alchemy-text">
                {g.planningMode === "song-focus"
                  ? "Song focus"
                  : g.planningMode === "direct"
                    ? "Direct"
                    : "—"}
              </dd>
              <dt className="text-alchemy-muted">Provider</dt>
              <dd className="text-alchemy-text">{g.provider || "—"}</dd>
              <dt className="text-alchemy-muted">Model</dt>
              <dd className="text-alchemy-text">
                {display.confirmed ? (
                  <span>
                    {display.detail}
                    <span className="ml-1 text-alchemy-success">(confirmed)</span>
                  </span>
                ) : (
                  <span className="text-alchemy-gold">{display.detail}</span>
                )}
              </dd>
              {g.preset ? (
                <>
                  <dt className="text-alchemy-muted">Preset</dt>
                  <dd className="text-alchemy-text">
                    {g.preset === "fast" ? "Fast" : "Quality"}
                  </dd>
                </>
              ) : null}
              {g.bpm != null ? (
                <>
                  <dt className="text-alchemy-muted">BPM</dt>
                  <dd className="text-alchemy-text">{Math.round(g.bpm)}</dd>
                </>
              ) : null}
              {g.musicalKey ? (
                <>
                  <dt className="text-alchemy-muted">Key</dt>
                  <dd className="text-alchemy-text">{g.musicalKey}</dd>
                </>
              ) : null}
              {g.seed ? (
                <>
                  <dt className="text-alchemy-muted">Seed</dt>
                  <dd className="break-all text-alchemy-text">{g.seed}</dd>
                </>
              ) : null}
              {g.generationMs != null ? (
                <>
                  <dt className="text-alchemy-muted">Gen time</dt>
                  <dd className="text-alchemy-text">{formatGenerationMs(g.generationMs)}</dd>
                </>
              ) : null}
            </dl>
          </section>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-alchemy-border/80 px-4 py-3">
          <button
            type="button"
            className="aa-btn !py-1.5 text-xs"
            disabled={busy}
            onClick={() => onToggleFavorite(g.id, !g.favorite)}
            aria-pressed={g.favorite}
          >
            {g.favorite ? "★ Favorited" : "☆ Favorite"}
          </button>
          {g.status === "completed" ? (
            <>
              <a
                href={`/api/audio/${g.id}?download=1`}
                className="aa-btn !py-1.5 text-xs"
              >
                Audio
              </a>
              <a
                href={`/api/generations/${g.id}/metadata?download=1`}
                className="aa-btn !py-1.5 text-xs"
                title="Download JSON metadata"
              >
                Metadata JSON
              </a>
              <button
                type="button"
                className="aa-btn-primary !w-auto !px-3 !py-1.5 text-xs"
                disabled={busy}
                onClick={() => onGenerateVariation(g.id)}
              >
                Generate variation
              </button>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function formatDuration(sec: number): string {
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}

function formatGenerationMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return `${m}m ${rem}s`;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
