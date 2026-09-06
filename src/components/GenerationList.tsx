"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  Collection,
  Generation,
  GenerationSort,
  GenerationStatus,
} from "@/lib/types";
import { resolveDisplayModelLabel } from "@/lib/ace-capabilities";
import { parseUserTags } from "@/lib/library-meta";
import { AudioPlayer } from "./AudioPlayer";
import { TrackDetailDrawer } from "./TrackDetailDrawer";

const STATUS_FILTERS: Array<{ value: "" | GenerationStatus; label: string }> = [
  { value: "", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "processing", label: "Processing" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

const SORT_OPTIONS: Array<{ value: GenerationSort; label: string }> = [
  { value: "created_at_desc", label: "Newest first" },
  { value: "created_at_asc", label: "Oldest first" },
  { value: "title_asc", label: "Title A–Z" },
  { value: "title_desc", label: "Title Z–A" },
  { value: "duration_desc", label: "Longest first" },
];

export function GenerationList() {
  const router = useRouter();
  const [items, setItems] = useState<Generation[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [newCollectionName, setNewCollectionName] = useState("");
  const [creatingCollection, setCreatingCollection] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | GenerationStatus>("");
  const [sort, setSort] = useState<GenerationSort>("created_at_desc");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [collectionFilter, setCollectionFilter] = useState<string>("");

  useEffect(() => {
    const t = setTimeout(() => setQ(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadCollections = useCallback(async () => {
    try {
      const res = await fetch("/api/collections");
      const data = await res.json();
      if (res.ok && Array.isArray(data.collections)) {
        setCollections(data.collections as Collection[]);
      }
    } catch {
      // optional
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (status) params.set("status", status);
      params.set("sort", sort);
      if (favoritesOnly) params.set("favorite", "1");
      if (collectionFilter) params.set("collection", collectionFilter);

      const res = await fetch(`/api/generations?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setItems(data.generations as Generation[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [q, status, sort, favoritesOnly, collectionFilter]);

  useEffect(() => {
    void loadCollections();
  }, [loadCollections]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    const hasOpen = items.some(
      (g) => g.status === "pending" || g.status === "processing"
    );
    if (!hasOpen) return;
    const t = setInterval(() => void load(), 2000);
    return () => clearInterval(t);
  }, [items, load]);

  const detail = detailId ? items.find((g) => g.id === detailId) ?? null : null;

  async function onCancel(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/generations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancel: true }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function onRetry(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/generations/${id}/retry`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Retry failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(id: string, title: string) {
    if (
      !window.confirm(
        `Delete “${title}”? This removes the library entry and local audio file.`
      )
    ) {
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/generations/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Delete failed");
      if (activeId === id) setActiveId(null);
      if (editingId === id) setEditingId(null);
      if (detailId === id) setDetailId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  async function onRename(id: string) {
    const title = editTitle.trim();
    if (!title) {
      setError("Title is required");
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/generations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rename failed");
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setBusyId(null);
    }
  }

  async function onToggleFavorite(id: string, favorite: boolean) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/generations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Favorite failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Favorite failed");
    } finally {
      setBusyId(null);
    }
  }

  async function onSaveTags(id: string, tags: string[]) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/generations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userTags: tags }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Tags failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tags failed");
      throw err;
    } finally {
      setBusyId(null);
    }
  }

  async function onSetCollection(id: string, collectionId: string | null) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/generations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Collection update failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Collection update failed");
      throw err;
    } finally {
      setBusyId(null);
    }
  }

  async function onCreateCollection() {
    const name = newCollectionName.trim();
    if (!name) return;
    setCreatingCollection(true);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create collection failed");
      setNewCollectionName("");
      await loadCollections();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create collection failed");
    } finally {
      setCreatingCollection(false);
    }
  }

  async function onDeleteCollection(id: string, name: string) {
    if (
      !window.confirm(
        `Delete collection “${name}”? Tracks stay in the library (unfiled).`
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/collections/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Delete collection failed");
      if (collectionFilter === id) setCollectionFilter("");
      await loadCollections();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete collection failed");
    }
  }

  async function onClearFailed() {
    if (
      !window.confirm(
        "Clear all failed and cancelled generations? This cannot be undone."
      )
    ) {
      return;
    }
    setClearing(true);
    try {
      const res = await fetch("/api/generations/clear-failed", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Clear failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clear failed");
    } finally {
      setClearing(false);
    }
  }

  function onGenerateVariation(id: string) {
    router.push(`/?variation=${encodeURIComponent(id)}`);
  }

  const filters = (
    <div className="aa-card mb-4 space-y-3 p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="sr-only" htmlFor="library-search">
          Search library
        </label>
        <input
          id="library-search"
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search title, prompt, tags, collection…"
          className="w-full flex-1 rounded-xl border border-alchemy-border bg-alchemy-bg px-3 py-2 text-sm text-alchemy-text placeholder:text-alchemy-muted/70 focus:outline-none focus:ring-2 focus:ring-alchemy-accent/50"
        />
        <label className="flex shrink-0 items-center gap-2 text-xs text-alchemy-muted">
          <span className="whitespace-nowrap">Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as GenerationSort)}
            className="rounded-lg border border-alchemy-border bg-alchemy-bg px-2 py-2 text-sm text-alchemy-text focus:outline-none focus:ring-2 focus:ring-alchemy-accent/50"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => {
          const active = status === f.value;
          return (
            <button
              key={f.value || "all"}
              type="button"
              onClick={() => setStatus(f.value)}
              className={
                active
                  ? "rounded-full border border-alchemy-accentGlow bg-alchemy-accent/20 px-3 py-1 text-xs font-medium text-alchemy-text shadow-glow-accent"
                  : "rounded-full border border-alchemy-border bg-alchemy-elevated/60 px-3 py-1 text-xs text-alchemy-muted hover:border-alchemy-accent/40 hover:text-alchemy-text"
              }
            >
              {f.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setFavoritesOnly((v) => !v)}
          aria-pressed={favoritesOnly}
          className={
            favoritesOnly
              ? "rounded-full border border-alchemy-gold/70 bg-alchemy-gold/15 px-3 py-1 text-xs font-medium text-alchemy-gold shadow-glow-gold"
              : "rounded-full border border-alchemy-border bg-alchemy-elevated/60 px-3 py-1 text-xs text-alchemy-muted hover:border-alchemy-gold/40 hover:text-alchemy-gold"
          }
        >
          ★ Favorites
        </button>
        <div className="ml-auto">
          <button
            type="button"
            disabled={clearing}
            onClick={() => void onClearFailed()}
            className="rounded-lg border border-alchemy-border bg-alchemy-elevated px-3 py-1.5 text-xs text-alchemy-muted hover:border-alchemy-danger/50 hover:text-alchemy-danger disabled:cursor-not-allowed disabled:opacity-40"
            title="Delete all failed and cancelled entries (library-wide)"
          >
            {clearing ? "Clearing…" : "Clear failed"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-alchemy-border/50 pt-3 sm:flex-row sm:items-center">
        <label className="flex flex-1 items-center gap-2 text-xs text-alchemy-muted">
          <span className="whitespace-nowrap">Collection</span>
          <select
            value={collectionFilter}
            onChange={(e) => setCollectionFilter(e.target.value)}
            className="w-full rounded-lg border border-alchemy-border bg-alchemy-bg px-2 py-1.5 text-sm text-alchemy-text focus:outline-none focus:ring-2 focus:ring-alchemy-accent/50"
          >
            <option value="">All collections</option>
            <option value="none">Unfiled</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-1 gap-2">
          <input
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void onCreateCollection();
              }
            }}
            placeholder="New collection…"
            className="aa-input !py-1.5 text-xs"
            maxLength={80}
          />
          <button
            type="button"
            disabled={creatingCollection || !newCollectionName.trim()}
            onClick={() => void onCreateCollection()}
            className="aa-btn shrink-0 !py-1.5 text-xs"
          >
            Add
          </button>
        </div>
      </div>
      {collections.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {collections.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1 rounded-full border border-alchemy-border/80 bg-alchemy-elevated/50 px-2 py-0.5 text-[11px] text-alchemy-muted"
            >
              {c.name}
              <button
                type="button"
                className="text-alchemy-muted hover:text-alchemy-danger"
                title={`Delete ${c.name}`}
                onClick={() => void onDeleteCollection(c.id, c.name)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );

  if (loading && items.length === 0) {
    return (
      <div>
        {filters}
        <div className="aa-empty">Loading library…</div>
      </div>
    );
  }

  if (error && items.length === 0 && !loading) {
    return (
      <div>
        {filters}
        <div className="rounded-xl border border-alchemy-danger/40 bg-alchemy-danger/10 px-4 py-3 text-sm text-alchemy-danger">
          {error}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div>
        {filters}
        <div className="aa-empty space-y-2">
          <p>
            {q || status || favoritesOnly || collectionFilter
              ? "No generations match these filters."
              : "No generations yet."}
          </p>
          {!q && !status && !favoritesOnly && !collectionFilter ? (
            <p>
              <a href="/" className="font-medium text-alchemy-gold hover:text-alchemy-goldSoft">
                Create your first track
              </a>{" "}
              — it will show up here with play, download, favorites, and collections.
            </p>
          ) : (
            <p className="text-xs">Try clearing search or choosing All.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filters}
      {error ? (
        <p className="text-sm text-alchemy-danger">{error}</p>
      ) : null}
      {items.map((g) => {
        const open = activeId === g.id;
        const isBusy = busyId === g.id;
        const isOpenStatus = g.status === "pending" || g.status === "processing";
        const progressLabel = g.progressMessage || g.stage || g.status;
        const tags = parseUserTags(g.userTags);

        return (
          <article key={g.id} className="aa-card p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void onToggleFavorite(g.id, !g.favorite)}
                    className={`mt-0.5 shrink-0 text-base leading-none ${
                      g.favorite
                        ? "text-alchemy-gold"
                        : "text-alchemy-muted hover:text-alchemy-gold"
                    }`}
                    aria-label={g.favorite ? "Remove favorite" : "Add favorite"}
                    title={g.favorite ? "Unfavorite" : "Favorite"}
                  >
                    {g.favorite ? "★" : "☆"}
                  </button>
                  <div className="min-w-0 flex-1">
                    {editingId === g.id ? (
                      <div className="flex flex-wrap gap-2">
                        <input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void onRename(g.id);
                            } else if (e.key === "Escape") {
                              setEditingId(null);
                            }
                          }}
                          autoFocus
                          className="min-w-[12rem] flex-1 rounded-lg border border-alchemy-border bg-alchemy-bg px-2 py-1 text-sm text-alchemy-text"
                          maxLength={80}
                          aria-label="Rename generation"
                        />
                        <button
                          type="button"
                          disabled={isBusy || !editTitle.trim()}
                          onClick={() => void onRename(g.id)}
                          className="rounded-lg border border-alchemy-border bg-alchemy-elevated px-2 py-1 text-xs hover:border-alchemy-accent/50 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded-lg border border-alchemy-border px-2 py-1 text-xs text-alchemy-muted"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="truncate text-left font-medium text-alchemy-text hover:text-alchemy-gold"
                        onClick={() => setDetailId(g.id)}
                      >
                        {g.title}
                      </button>
                    )}
                    <p className="mt-1 line-clamp-2 text-sm text-alchemy-muted">{g.prompt}</p>
                    <p className="mt-2 text-xs text-alchemy-muted">
                      <Status status={g.status} /> · {displayDuration(g)} · {g.mode} ·{" "}
                      {formatWhen(g.createdAt)}
                      {g.collectionName ? (
                        <>
                          {" "}
                          · <span className="text-alchemy-gold/90">{g.collectionName}</span>
                        </>
                      ) : null}
                    </p>
                    {tags.length ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {tags.slice(0, 6).map((t) => (
                          <span
                            key={t}
                            className="rounded-full border border-alchemy-gold/30 bg-alchemy-gold/10 px-1.5 py-0.5 text-[10px] text-alchemy-gold"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {g.status === "completed" ? <MetadataLine g={g} /> : null}
                    {isOpenStatus ? (
                      <p className="mt-1 text-xs text-alchemy-gold">
                        {progressLabel}
                        {g.progressPct != null
                          ? ` · ${Math.round(g.progressPct)}%`
                          : ""}
                      </p>
                    ) : null}
                    {g.errorMessage ? (
                      <p className="mt-1 text-xs text-alchemy-danger">{g.errorMessage}</p>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setDetailId(g.id)}
                  className="aa-btn !py-1.5"
                >
                  Details
                </button>
                {g.status === "completed" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveId(open ? null : g.id)}
                      className="aa-btn !py-1.5"
                    >
                      {open ? "Hide player" : "Play"}
                    </button>
                    <a
                      href={`/api/audio/${g.id}?download=1`}
                      className="aa-btn !py-1.5"
                    >
                      Audio
                    </a>
                    <a
                      href={`/api/generations/${g.id}/metadata?download=1`}
                      className="aa-btn !py-1.5"
                      title="Download JSON metadata"
                    >
                      Metadata
                    </a>
                    <button
                      type="button"
                      onClick={() => onGenerateVariation(g.id)}
                      className="aa-btn !py-1.5 border-alchemy-gold/40 text-alchemy-gold"
                    >
                      Variation
                    </button>
                  </>
                ) : null}
                {isOpenStatus ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void onCancel(g.id)}
                    className="aa-btn-danger !py-1.5"
                  >
                    Cancel
                  </button>
                ) : null}
                {g.status === "failed" || g.status === "cancelled" ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void onRetry(g.id)}
                    className="aa-btn !py-1.5"
                  >
                    Retry
                  </button>
                ) : null}
                {editingId !== g.id ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      setEditingId(g.id);
                      setEditTitle(g.title);
                      setError(null);
                    }}
                    className="aa-btn !py-1.5 text-alchemy-muted"
                  >
                    Rename
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void onDelete(g.id, g.title)}
                  className="aa-btn-danger !py-1.5"
                >
                  Delete
                </button>
              </div>
            </div>
            {open && g.status === "completed" ? (
              <div className="mt-4">
                <AudioPlayer src={`/api/audio/${g.id}`} title={g.title} compact />
              </div>
            ) : null}
          </article>
        );
      })}

      {detail ? (
        <TrackDetailDrawer
          generation={detail}
          collections={collections}
          busy={busyId === detail.id}
          onClose={() => setDetailId(null)}
          onToggleFavorite={(id, favorite) => void onToggleFavorite(id, favorite)}
          onSaveTags={onSaveTags}
          onSetCollection={onSetCollection}
          onGenerateVariation={onGenerateVariation}
        />
      ) : null}
    </div>
  );
}

function MetadataLine({ g }: { g: Generation }) {
  const parts: string[] = [];
  const dur = g.audioDurationSec ?? null;
  if (dur != null && Number.isFinite(dur)) {
    parts.push(formatDurationSec(dur));
  }
  if (g.bpm != null && Number.isFinite(g.bpm)) {
    parts.push(`${Math.round(g.bpm)} BPM`);
  }
  if (g.musicalKey) parts.push(g.musicalKey);
  if (g.preset === "fast") parts.push("Fast");
  else if (g.preset === "quality") parts.push("Quality");
  if (g.provider) parts.push(g.provider);
  const display = resolveDisplayModelLabel({
    requestedModelName: g.requestedModelName ?? g.modelName,
    actualModelName: g.actualModelName,
    requestedCapability: g.requestedCapability,
    actualCapability: g.actualCapability,
    status: g.status,
  });
  parts.push(display.detail);
  if (g.seed) parts.push(`seed ${g.seed}`);
  if (g.generationMs != null && Number.isFinite(g.generationMs)) {
    parts.push(formatGenerationMs(g.generationMs));
  }
  if (parts.length === 0) return null;
  return (
    <p className="mt-1 text-xs text-alchemy-muted/90" title="Generation metadata">
      {parts.join(" · ")}
    </p>
  );
}

function displayDuration(g: Generation): string {
  const sec = g.audioDurationSec ?? g.durationSec;
  return `${Math.round(sec)}s`;
}

function formatDurationSec(sec: number): string {
  const s = Math.round(sec);
  if (s < 60) return `${s}s audio`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}

function formatGenerationMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms gen`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s gen`;
  const m = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return `${m}m ${rem}s gen`;
}

function Status({ status }: { status: string }) {
  const color =
    status === "completed"
      ? "text-alchemy-success"
      : status === "failed" || status === "cancelled"
        ? "text-alchemy-danger"
        : "text-alchemy-gold";
  return <span className={color}>{status}</span>;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
