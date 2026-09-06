"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Generation, GenerationMode } from "@/lib/types";
import { modelFamilyLabel, classifyModelFamily } from "@/lib/model-family";
import { resolveDisplayModelLabel } from "@/lib/ace-capabilities";
import { titleFromPrompt } from "@/lib/title";
import { AudioPlayer } from "./AudioPlayer";

type HealthSettings = {
  modelConfigured?: boolean;
  model?: string | null;
  inferenceSteps?: number;
  audioFormat?: string;
  batchSize?: number;
  thinking?: boolean;
  pollIntervalMs?: number;
  timeoutMs?: number;
  singleFlight?: boolean;
  busy?: boolean;
  hasApiKey?: boolean;
};

type PresetItem = {
  id: "fast" | "quality";
  label?: string;
  description?: string;
  model?: string;
  inferenceSteps?: number;
  ready?: boolean;
  readinessReason?: string;
  supportedLocally?: boolean;
};

type ModelProbeItem = {
  id: string;
  family?: string;
  supportedLocally?: boolean;
};

type CapabilityItem = {
  id: string;
  configured?: boolean;
  available?: boolean;
  modelId?: string | null;
  reason?: string;
};

type HealthInfo = {
  ok: boolean;
  mode: GenerationMode;
  aceStep: boolean;
  settings?: HealthSettings;
  qualityTier?: string;
  presets?: { default?: "fast" | "quality"; items?: PresetItem[] };
  models?: { source?: string; items?: ModelProbeItem[]; reachable?: boolean };
  capabilities?: CapabilityItem[];
  providers?: {
    remote?: { configured?: boolean; reachable?: boolean };
  } | null;
  postprocess?: {
    enabled?: boolean;
    ffmpegAvailable?: boolean;
    hint?: string | null;
  };
};

type PromptTemplate = {
  id: string;
  label: string;
  styleTags: string[];
  promptSkeleton: string;
  lyricsSkeleton?: string | null;
  defaultDurationSec?: number;
  pack?: string;
};

const STYLE_SUGGESTIONS = [
  "lo-fi",
  "ambient",
  "cinematic",
  "synthwave",
  "acoustic",
  "jazz",
  "modern metal",
  "metalcore",
];

export function CreateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkedId = searchParams.get("id");

  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [style, setStyle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [durationSec, setDurationSec] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [packs, setPacks] = useState<string[]>([]);
  const [packFilter, setPackFilter] = useState<string>("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  /** Tags last applied from a template — cleared/replaced on pack/template switch. */
  const [appliedPackTags, setAppliedPackTags] = useState<string[]>([]);
  const [keepTagsOnTemplate, setKeepTagsOnTemplate] = useState(false);
  const [preset, setPreset] = useState<"fast" | "quality">("fast");
  const [fineTuneOpen, setFineTuneOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advInferenceSteps, setAdvInferenceSteps] = useState<string>("");
  const [advModel, setAdvModel] = useState("");
  const [advAudioFormat, setAdvAudioFormat] = useState<string>("");
  const [advTouched, setAdvTouched] = useState(false);
  const linkedLoaded = useRef<string | null>(null);

  const derivedTitle = useMemo(() => titleFromPrompt(prompt), [prompt]);

  useEffect(() => {
    if (!titleTouched) {
      setTitle(derivedTitle === "Untitled generation" ? "" : derivedTitle);
    }
  }, [derivedTitle, titleTouched]);

  const refreshHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      setHealth({
        ok: Boolean(data.ok),
        mode: data.mode === "ace-step" ? "ace-step" : "mock",
        aceStep: Boolean(data.aceStep),
        settings: data.settings && typeof data.settings === "object" ? data.settings : undefined,
        qualityTier: typeof data.qualityTier === "string" ? data.qualityTier : undefined,
        presets: data.presets && typeof data.presets === "object" ? data.presets : undefined,
        models: data.models && typeof data.models === "object" ? data.models : undefined,
        capabilities: Array.isArray(data.capabilities) ? data.capabilities : undefined,
        providers:
          data.providers && typeof data.providers === "object" ? data.providers : null,
        postprocess:
          data.postprocess && typeof data.postprocess === "object"
            ? data.postprocess
            : undefined,
      });
      if (
        !advTouched &&
        data.presets?.default &&
        (data.presets.default === "fast" || data.presets.default === "quality")
      ) {
        setPreset(data.presets.default);
      }
    } catch {
      setHealth({ ok: false, mode: "mock", aceStep: false });
    } finally {
      setHealthLoading(false);
    }
  }, [advTouched]);

  useEffect(() => {
    void refreshHealth();
    const t = setInterval(() => void refreshHealth(), 30_000);
    return () => clearInterval(t);
  }, [refreshHealth]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/templates");
        const data = await res.json();
        if (!cancelled && Array.isArray(data.templates)) {
          setTemplates(data.templates as PromptTemplate[]);
        }
        if (!cancelled && Array.isArray(data.packs)) {
          setPacks(data.packs as string[]);
        }
      } catch {
        // templates optional
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleTemplates = useMemo(() => {
    if (!packFilter) return templates;
    return templates.filter((t) => (t.pack || "core") === packFilter);
  }, [templates, packFilter]);

  function clearPackTagsFromStyle(currentStyle: string, packTags: string[]): string {
    if (packTags.length === 0) return currentStyle;
    const deny = new Set(packTags.map((t) => t.toLowerCase()));
    return currentStyle
      .split(",")
      .map((s) => s.trim())
      .filter((t) => t && !deny.has(t.toLowerCase()))
      .join(", ");
  }

  function applyTemplate(t: PromptTemplate) {
    setSelectedTemplateId(t.id);
    setPrompt(t.promptSkeleton);
    const nextPackTags = [...t.styleTags];
    if (keepTagsOnTemplate) {
      // Explicit keep: drop previous pack tags, then merge new pack tags with remaining user tags.
      const kept = clearPackTagsFromStyle(style, appliedPackTags);
      const keptList = kept
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const merged = [...nextPackTags];
      for (const tag of keptList) {
        if (!merged.some((m) => m.toLowerCase() === tag.toLowerCase())) {
          merged.push(tag);
        }
      }
      setStyle(merged.join(", "));
    } else {
      // Default: replace (never silently merge old template tags).
      setStyle(nextPackTags.join(", "));
    }
    setAppliedPackTags(nextPackTags);
    if (t.lyricsSkeleton != null && t.lyricsSkeleton !== "") {
      setLyrics(t.lyricsSkeleton);
    } else {
      setLyrics("");
    }
    if (t.defaultDurationSec != null) {
      setDurationSec(t.defaultDurationSec);
    }
    setTitleTouched(false);
    setError(null);
  }

  function onPackFilterChange(nextPack: string) {
    // Changing genre pack clears previous pack tags (unless user opted to keep).
    if (!keepTagsOnTemplate && appliedPackTags.length > 0) {
      setStyle(clearPackTagsFromStyle(style, appliedPackTags));
      setAppliedPackTags([]);
    } else if (appliedPackTags.length > 0) {
      // Keep mode: still remove previous pack tags, leave user tags.
      setStyle(clearPackTagsFromStyle(style, appliedPackTags));
      setAppliedPackTags([]);
    }
    setSelectedTemplateId("");
    setPackFilter(nextPack);
  }

  function clearTags() {
    setStyle("");
    setAppliedPackTags([]);
  }

  // Prefill Advanced defaults from safe /api/health settings (no secrets).
  useEffect(() => {
    if (advTouched || !health?.settings) return;
    const s = health.settings;
    if (advInferenceSteps === "" && s.inferenceSteps != null) {
      setAdvInferenceSteps(String(s.inferenceSteps));
    }
    if (!advModel && s.model) setAdvModel(String(s.model));
    if (!advAudioFormat && s.audioFormat) setAdvAudioFormat(String(s.audioFormat));
  }, [health, advTouched, advInferenceSteps, advModel, advAudioFormat]);

  useEffect(() => {
    if (!linkedId || linkedLoaded.current === linkedId) return;
    linkedLoaded.current = linkedId;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/generations/${linkedId}`);
        const data = await res.json();
        if (!cancelled && data.generation) {
          setGeneration(data.generation as Generation);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [linkedId]);

  useEffect(() => {
    if (!generation) return;
    if (
      generation.status === "completed" ||
      generation.status === "failed" ||
      generation.status === "cancelled"
    ) {
      return;
    }

    const id = generation.id;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/generations/${id}`);
        const data = await res.json();
        if (data.generation) {
          setGeneration(data.generation as Generation);
        }
      } catch {
        // ignore transient poll errors
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [generation]);

  const aceUnhealthy =
    health?.mode === "ace-step" && health.aceStep === false;
  const aceBusy =
    health?.mode === "ace-step" && Boolean(health.settings?.busy);
  const canGenerate =
    !busy &&
    !healthLoading &&
    Boolean(prompt.trim()) &&
    !aceUnhealthy &&
    !aceBusy;

  const styleTags = useMemo(
    () =>
      style
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [style]
  );

  const sftAvailable = useMemo(() => {
    const items = health?.models?.items || [];
    const qualityItem = health?.presets?.items?.find((x) => x.id === "quality");
    const qualityModel = qualityItem?.model;
    if (qualityModel && classifyModelFamily(qualityModel) === "sft") {
      // Confirmed only when inventory/probe lists an SFT family id, or env-fallback reports the quality model.
      if (items.some((m) => classifyModelFamily(m.id) === "sft")) return true;
      if (items.some((m) => m.id === qualityModel)) return true;
      // Mock / unreachable: do not claim SFT unless probe items include it.
      if (health?.mode === "mock" && items.some((m) => classifyModelFamily(m.id) === "sft")) {
        return true;
      }
    }
    return items.some((m) => classifyModelFamily(m.id) === "sft");
  }, [health]);

  const qualityReady = health?.presets?.items?.find((x) => x.id === "quality");
  const fastReady = health?.presets?.items?.find((x) => x.id === "fast");

  function toggleStyleTag(tag: string) {
    const set = new Set(styleTags.map((t) => t.toLowerCase()));
    const key = tag.toLowerCase();
    if (set.has(key)) {
      setStyle(styleTags.filter((t) => t.toLowerCase() !== key).join(", "));
    } else {
      setStyle([...styleTags, tag].join(", "));
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canGenerate) return;
    setError(null);
    setBusy(true);
    setGeneration(null);
    try {
      const res = await fetch("/api/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          style: style || undefined,
          lyrics: lyrics || undefined,
          durationSec,
          title: title.trim() || undefined,
          preset,
          ...(advInferenceSteps.trim()
            ? { inferenceSteps: Number(advInferenceSteps) }
            : {}),
          ...(advModel.trim() ? { model: advModel.trim() } : {}),
          ...(advAudioFormat.trim() ? { audioFormat: advAudioFormat.trim() } : {}),
          thinking: false,
          batchSize: 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.generation) {
          setGeneration(data.generation as Generation);
        }
        throw new Error(data.error || "Generation failed");
      }
      const gen = data.generation as Generation;
      setGeneration(gen);
      router.replace(`/?id=${gen.id}`, { scroll: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      void refreshHealth();
    } finally {
      setBusy(false);
    }
  }

  async function onCancel() {
    if (!generation) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/generations/${generation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancel: true }),
      });
      const data = await res.json();
      if (data.generation) setGeneration(data.generation as Generation);
    } finally {
      setActionBusy(false);
    }
  }

  async function onRetry() {
    if (!generation) return;
    setActionBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/generations/${generation.id}/retry`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Retry failed");
      if (data.generation) setGeneration(data.generation as Generation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
      void refreshHealth();
    } finally {
      setActionBusy(false);
    }
  }

  async function onDelete() {
    if (!generation) return;
    setActionBusy(true);
    try {
      await fetch(`/api/generations/${generation.id}`, { method: "DELETE" });
      setGeneration(null);
      router.replace("/", { scroll: false });
    } finally {
      setActionBusy(false);
    }
  }

  const isOpen =
    generation &&
    (generation.status === "pending" || generation.status === "processing");

  const progressLabel =
    generation?.progressMessage ||
    generation?.stage ||
    (isOpen ? "Generating…" : null);

  const formDisabled = busy || Boolean(isOpen);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-alchemy-border bg-alchemy-surface/90 p-5 sm:p-6 shadow-xl shadow-black/30"
      >
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-alchemy-text">
              Create
            </h1>
            <p className="mt-1 text-sm text-alchemy-muted">
              Describe a track. You own what you generate.
            </p>
          </div>
          <HealthBadge health={health} loading={healthLoading} />
        </div>

        <GpuStatusPanel health={health} loading={healthLoading} sftAvailable={sftAvailable} />

        {aceUnhealthy ? (
          <div className="mb-4 rounded-lg border border-alchemy-danger/40 bg-alchemy-danger/10 px-3 py-2 text-sm text-alchemy-danger">
            ACE-Step is unreachable. Start the API or switch{" "}
            <code className="text-xs">GENERATION_MODE</code> to{" "}
            <code className="text-xs">mock</code>. Generate is disabled until
            health recovers.
          </div>
        ) : null}

        {aceBusy && !aceUnhealthy ? (
          <div className="mb-4 rounded-lg border border-alchemy-gold/40 bg-alchemy-gold/10 px-3 py-2 text-sm text-alchemy-gold">
            Another ACE-Step job is processing (single-flight for 10GB VRAM).
            Wait or cancel it before starting a new one.
          </div>
        ) : null}

        {/* Hero prompt */}
        <section className="mb-5">
          <label
            htmlFor="create-prompt"
            className="block text-sm font-medium text-alchemy-text mb-1.5"
          >
            Prompt
          </label>
          <p className="mb-1.5 text-xs text-alchemy-muted">
            Mood, instruments, tempo, and vibe in a sentence or two.
          </p>
          <textarea
            id="create-prompt"
            required
            disabled={formDisabled}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="Dreamy synthwave with warm pads and a steady pulse…"
            className="w-full rounded-xl border border-alchemy-border bg-alchemy-bg px-3 py-3 text-base text-alchemy-text placeholder:text-alchemy-muted/70 focus:outline-none focus:ring-2 focus:ring-alchemy-accent/50 disabled:opacity-60"
          />
        </section>

        {/* Quality / Fast — immediately visible */}
        <section className="mb-5">
          <p className="mb-1.5 text-sm font-medium text-alchemy-text">Preset</p>
          <p className="mb-2 text-xs text-alchemy-muted">
            Fast targets Turbo; Quality targets{" "}
            <code className="text-[11px]">acestep-v15-sft</code>
            {sftAvailable
              ? " (SFT available on this worker)."
              : " — SFT not confirmed in model inventory yet."}{" "}
            {health?.capabilities?.some((c) => c.id === "remote-xl-sft" && c.available)
              ? "Remote XL-SFT is available via configured endpoint."
              : "XL is not offered on local 10GB VRAM (optional remote endpoint only)."}{" "}
            Batch is always 1.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(["fast", "quality"] as const).map((id) => {
              const item = health?.presets?.items?.find((x) => x.id === id);
              const active = preset === id;
              const blocked = item?.ready === false;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={formDisabled || blocked}
                  onClick={() => {
                    setPreset(id);
                    setAdvTouched(true);
                    if (item?.inferenceSteps != null) {
                      setAdvInferenceSteps(String(item.inferenceSteps));
                    }
                    if (item?.model) setAdvModel(item.model);
                  }}
                  className={`rounded-xl border px-3 py-3 text-left transition disabled:opacity-50 ${
                    active
                      ? "border-alchemy-accent/60 bg-alchemy-accent/15 text-alchemy-text"
                      : "border-alchemy-border bg-alchemy-bg text-alchemy-muted hover:border-alchemy-accent/40"
                  }`}
                >
                  <span className="block text-sm font-semibold capitalize text-alchemy-text">
                    {id === "fast" ? "Fast" : "Quality"}
                  </span>
                  <span className="mt-1 block text-[11px] leading-snug">
                    {id === "fast"
                      ? `Lower latency · Turbo${fastReady?.model ? ` · ${fastReady.model}` : ""}`
                      : health?.qualityTier === "remote-xl-sft" &&
                          health?.capabilities?.some(
                            (c) => c.id === "remote-xl-sft" && c.available
                          )
                        ? `Higher fidelity · remote XL-SFT${
                            health.capabilities.find((c) => c.id === "remote-xl-sft")
                              ?.modelId
                              ? ` · ${health.capabilities.find((c) => c.id === "remote-xl-sft")?.modelId}`
                              : ""
                          }`
                        : sftAvailable
                          ? `Higher fidelity · SFT${qualityReady?.model ? ` · ${qualityReady.model}` : ""}`
                          : `Higher fidelity · more steps${qualityReady?.model ? ` · ${qualityReady.model}` : ""} (SFT unconfirmed)`}
                  </span>
                  {blocked ? (
                    <span className="mt-1 block text-[11px] text-alchemy-danger">
                      {item?.readinessReason || "Not ready"}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {health?.postprocess?.hint ? (
            <p className="mt-2 text-xs text-alchemy-gold">{health.postprocess.hint}</p>
          ) : null}
        </section>

        {/* Fine-tune (collapsed) */}
        <section className="mb-5">
          <button
            type="button"
            onClick={() => setFineTuneOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded-xl border border-alchemy-border bg-alchemy-bg/60 px-3 py-2.5 text-left text-sm text-alchemy-text hover:border-alchemy-accent/40"
          >
            <span className="font-medium">Fine-tune</span>
            <span className="text-xs text-alchemy-muted">
              {fineTuneOpen ? "Hide" : "Show"} · templates, tags, lyrics, duration, expert
            </span>
          </button>

          {fineTuneOpen ? (
            <div className="mt-3 space-y-5 rounded-xl border border-alchemy-border bg-alchemy-bg/30 px-3 py-4">
              {/* Templates / packs */}
              {templates.length > 0 ? (
                <div>
                  <label
                    htmlFor="create-pack"
                    className="block text-sm font-medium text-alchemy-text mb-1.5"
                  >
                    Genre pack
                  </label>
                  <select
                    id="create-pack"
                    disabled={formDisabled}
                    value={packFilter}
                    onChange={(e) => onPackFilterChange(e.target.value)}
                    className="mb-2 w-full rounded-xl border border-alchemy-border bg-alchemy-bg px-3 py-2.5 text-sm text-alchemy-text focus:outline-none focus:ring-2 focus:ring-alchemy-accent/50 disabled:opacity-60"
                  >
                    <option value="">All packs</option>
                    {packs.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>

                  <label
                    htmlFor="create-template"
                    className="block text-sm font-medium text-alchemy-text mb-1.5"
                  >
                    Template{" "}
                    <span className="text-alchemy-muted font-normal">
                      (replaces style tags unless you keep them)
                    </span>
                  </label>
                  <select
                    id="create-template"
                    disabled={formDisabled}
                    value={selectedTemplateId}
                    onChange={(e) => {
                      const id = e.target.value;
                      if (!id) {
                        setSelectedTemplateId("");
                        return;
                      }
                      const t = templates.find((x) => x.id === id);
                      if (t) applyTemplate(t);
                    }}
                    className="mb-2 w-full rounded-xl border border-alchemy-border bg-alchemy-bg px-3 py-2.5 text-sm text-alchemy-text focus:outline-none focus:ring-2 focus:ring-alchemy-accent/50 disabled:opacity-60"
                  >
                    <option value="">Choose a starting template…</option>
                    {visibleTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                        {t.pack ? ` · ${t.pack}` : ""}
                      </option>
                    ))}
                  </select>
                  <div className="flex flex-wrap gap-1.5">
                    {visibleTemplates.map((t) => {
                      const active = selectedTemplateId === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          disabled={formDisabled}
                          onClick={() => applyTemplate(t)}
                          className={`rounded-full border px-2.5 py-1 text-xs transition disabled:opacity-50 ${
                            active
                              ? "border-alchemy-accent/60 bg-alchemy-accent/20 text-alchemy-accentHover"
                              : "border-alchemy-border bg-alchemy-elevated text-alchemy-muted hover:border-alchemy-accent/40 hover:text-alchemy-text"
                          }`}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                  <label className="mt-2 flex items-center gap-2 text-xs text-alchemy-muted">
                    <input
                      type="checkbox"
                      checked={keepTagsOnTemplate}
                      onChange={(e) => setKeepTagsOnTemplate(e.target.checked)}
                      disabled={formDisabled}
                      className="accent-alchemy-accent"
                    />
                    Keep my tags when switching template/pack (otherwise tags are replaced)
                  </label>
                  <p className="mt-1.5 text-xs text-alchemy-muted">
                    Applying a template overwrites prompt / lyrics / duration; style tags
                    replace the previous pack&apos;s tags unless you opt to keep them.
                  </p>
                </div>
              ) : null}

              {/* Title */}
              <div>
                <label
                  htmlFor="create-title"
                  className="block text-sm font-medium text-alchemy-text mb-1.5"
                >
                  Title{" "}
                  <span className="text-alchemy-muted font-normal">
                    (editable — auto from prompt)
                  </span>
                </label>
                <input
                  id="create-title"
                  disabled={formDisabled}
                  value={title}
                  onChange={(e) => {
                    setTitleTouched(true);
                    setTitle(e.target.value);
                  }}
                  onBlur={() => {
                    if (!title.trim() && prompt.trim()) {
                      setTitleTouched(false);
                    }
                  }}
                  maxLength={80}
                  placeholder={derivedTitle || "Untitled generation"}
                  className="w-full rounded-xl border border-alchemy-border bg-alchemy-bg px-3 py-2.5 text-sm text-alchemy-text placeholder:text-alchemy-muted/70 focus:outline-none focus:ring-2 focus:ring-alchemy-accent/50 disabled:opacity-60"
                />
              </div>

              {/* Style tags */}
              <div>
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="create-style"
                    className="block text-sm font-medium text-alchemy-text"
                  >
                    Style tags{" "}
                    <span className="text-alchemy-muted font-normal">(optional)</span>
                  </label>
                  <button
                    type="button"
                    disabled={formDisabled || styleTags.length === 0}
                    onClick={clearTags}
                    className="rounded-lg border border-alchemy-border bg-alchemy-elevated px-2.5 py-1 text-xs text-alchemy-muted hover:border-alchemy-danger/40 hover:text-alchemy-danger disabled:opacity-40"
                  >
                    Clear tags
                  </button>
                </div>
                <p className="mb-1.5 text-xs text-alchemy-muted">
                  Comma-separated tags, or tap a suggestion. Conflicting or stacked genre
                  tags often harm results — clear or replace when changing packs.
                </p>
                <input
                  id="create-style"
                  disabled={formDisabled}
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  placeholder="lo-fi, ambient, cinematic"
                  className="mb-2 w-full rounded-xl border border-alchemy-border bg-alchemy-bg px-3 py-2.5 text-sm text-alchemy-text placeholder:text-alchemy-muted/70 focus:outline-none focus:ring-2 focus:ring-alchemy-accent/50 disabled:opacity-60"
                />
                <div className="flex flex-wrap gap-1.5">
                  {STYLE_SUGGESTIONS.map((tag) => {
                    const active = styleTags.some(
                      (t) => t.toLowerCase() === tag.toLowerCase()
                    );
                    return (
                      <button
                        key={tag}
                        type="button"
                        disabled={formDisabled}
                        onClick={() => toggleStyleTag(tag)}
                        className={`rounded-full border px-2.5 py-1 text-xs transition disabled:opacity-50 ${
                          active
                            ? "border-alchemy-accent/60 bg-alchemy-accent/20 text-alchemy-accentHover"
                            : "border-alchemy-border bg-alchemy-elevated text-alchemy-muted hover:border-alchemy-accent/40 hover:text-alchemy-text"
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
                {styleTags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {styleTags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md bg-alchemy-elevated px-2 py-0.5 text-xs text-alchemy-text"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Lyrics */}
              <div>
                <label
                  htmlFor="create-lyrics"
                  className="block text-sm font-medium text-alchemy-text mb-1.5"
                >
                  Lyrics{" "}
                  <span className="text-alchemy-muted font-normal">(optional)</span>
                </label>
                <p className="mb-1.5 text-xs text-alchemy-muted">
                  Leave blank or use <code className="text-[11px]">[inst]</code> for
                  instrumental.
                </p>
                <textarea
                  id="create-lyrics"
                  disabled={formDisabled}
                  value={lyrics}
                  onChange={(e) => setLyrics(e.target.value)}
                  rows={5}
                  placeholder={"[Verse]\nLeave blank or use [inst] for instrumental…"}
                  className="w-full rounded-xl border border-alchemy-border bg-alchemy-bg px-3 py-2.5 text-sm text-alchemy-text placeholder:text-alchemy-muted/70 focus:outline-none focus:ring-2 focus:ring-alchemy-accent/50 font-mono disabled:opacity-60"
                />
              </div>

              {/* Duration */}
              <div>
                <label
                  htmlFor="create-duration"
                  className="block text-sm font-medium text-alchemy-text mb-1.5"
                >
                  Duration:{" "}
                  <span className="text-alchemy-accent tabular-nums">
                    {durationSec}s
                  </span>
                </label>
                <input
                  id="create-duration"
                  type="range"
                  min={30}
                  max={180}
                  step={5}
                  disabled={formDisabled}
                  value={durationSec}
                  onChange={(e) => setDurationSec(Number(e.target.value))}
                  className="w-full accent-alchemy-accent disabled:opacity-60"
                />
                <div className="mt-1 flex justify-between text-[11px] text-alchemy-muted">
                  <span>30s</span>
                  <span>Mock demos cap ~16s audio</span>
                  <span>180s</span>
                </div>
              </div>

              {/* Expert / Advanced */}
              <div>
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((o) => !o)}
                  className="flex w-full items-center justify-between rounded-xl border border-alchemy-border bg-alchemy-bg/60 px-3 py-2 text-left text-sm text-alchemy-text hover:border-alchemy-accent/40"
                >
                  <span className="font-medium">Expert / advanced</span>
                  <span className="text-xs text-alchemy-muted">
                    {advancedOpen ? "Hide" : "Show"} · mode / inference
                  </span>
                </button>
                {advancedOpen ? (
                  <div className="mt-2 space-y-3 rounded-xl border border-alchemy-border bg-alchemy-bg/40 px-3 py-3 text-xs text-alchemy-muted">
                    <p>
                      Mode:{" "}
                      <span className="font-medium text-alchemy-text">
                        {healthLoading ? "…" : health?.mode ?? "unknown"}
                      </span>
                      {health?.settings?.busy ? (
                        <span className="ml-2 text-alchemy-gold">
                          · GPU busy (single-flight)
                        </span>
                      ) : null}
                    </p>
                    <p>
                      ACE-Step health:{" "}
                      <span
                        className={`font-medium ${
                          health?.aceStep
                            ? "text-alchemy-success"
                            : "text-alchemy-muted"
                        }`}
                      >
                        {healthLoading
                          ? "…"
                          : health?.aceStep
                            ? "reachable"
                            : "unreachable / not required"}
                      </span>
                      {health?.settings?.hasApiKey != null ? (
                        <span className="ml-2">
                          · API key configured:{" "}
                          <span className="text-alchemy-text">
                            {health.settings.hasApiKey ? "yes" : "no"}
                          </span>
                        </span>
                      ) : null}
                    </p>
                    <p className="text-alchemy-muted/80">
                      Optional overrides POST to the Next.js API only. Keys stay on the
                      server. Defaults suit RTX 3080 10GB (batch=1, thinking off).
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-[11px] text-alchemy-muted">
                          Inference steps
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          disabled={formDisabled}
                          value={advInferenceSteps}
                          onChange={(e) => {
                            setAdvTouched(true);
                            setAdvInferenceSteps(e.target.value);
                          }}
                          placeholder={String(health?.settings?.inferenceSteps ?? 8)}
                          className="w-full rounded-lg border border-alchemy-border bg-alchemy-bg px-2 py-1.5 text-sm text-alchemy-text disabled:opacity-60"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] text-alchemy-muted">
                          Audio format
                        </span>
                        <select
                          disabled={formDisabled}
                          value={advAudioFormat || health?.settings?.audioFormat || "mp3"}
                          onChange={(e) => {
                            setAdvTouched(true);
                            setAdvAudioFormat(e.target.value);
                          }}
                          className="w-full rounded-lg border border-alchemy-border bg-alchemy-bg px-2 py-1.5 text-sm text-alchemy-text disabled:opacity-60"
                        >
                          <option value="mp3">mp3</option>
                          <option value="wav">wav</option>
                          <option value="flac">flac</option>
                          <option value="opus">opus</option>
                          <option value="aac">aac</option>
                        </select>
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="mb-1 block text-[11px] text-alchemy-muted">
                          Model (optional)
                        </span>
                        <input
                          disabled={formDisabled}
                          value={advModel}
                          onChange={(e) => {
                            setAdvTouched(true);
                            setAdvModel(e.target.value);
                          }}
                          placeholder={
                            health?.settings?.model ||
                            "server default / ACESTEP_MODEL_*"
                          }
                          className="w-full rounded-lg border border-alchemy-border bg-alchemy-bg px-2 py-1.5 text-sm text-alchemy-text disabled:opacity-60"
                        />
                      </label>
                      <label className="flex items-center gap-2 sm:col-span-2 opacity-70">
                        <input
                          type="checkbox"
                          disabled
                          checked={false}
                          readOnly
                          className="accent-alchemy-accent"
                        />
                        <span>
                          Thinking mode forced off on local 10GB (batch stays 1)
                        </span>
                      </label>
                    </div>
                    {health?.settings ? (
                      <p className="text-[11px] text-alchemy-muted/80">
                        Server: steps={health.settings.inferenceSteps}, format=
                        {health.settings.audioFormat}, batch=
                        {health.settings.batchSize}, poll=
                        {health.settings.pollIntervalMs}ms, timeout=
                        {health.settings.timeoutMs != null
                          ? Math.round(health.settings.timeoutMs / 1000)
                          : "?"}
                        s, singleFlight=
                        {health.settings.singleFlight ? "on" : "off"}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>

        {error ? (
          <p className="mb-4 rounded-lg border border-alchemy-danger/40 bg-alchemy-danger/10 px-3 py-2 text-sm text-alchemy-danger">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!canGenerate || Boolean(isOpen)}
          className="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-alchemy-accent to-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy
            ? "Starting…"
            : isOpen
              ? "Generating…"
              : aceUnhealthy
                ? "ACE-Step offline"
                : aceBusy
                  ? "GPU busy"
                  : "Generate"}
        </button>
      </form>

      <aside className="rounded-2xl border border-alchemy-border bg-alchemy-surface/70 p-5 sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-alchemy-muted">
          Result
        </h2>
        {!generation ? (
          <p className="mt-4 text-sm text-alchemy-muted">
            Your generation will appear here. Mock mode synthesizes a short
            musical demo WAV so play and download work without an ACE-Step
            server.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <div>
              <p className="font-medium text-alchemy-text">{generation.title}</p>
              <p className="mt-1 text-xs text-alchemy-muted">
                Status: <StatusPill status={generation.status} /> · mode{" "}
                {generation.mode}
                {generation.attemptCount > 1
                  ? ` · attempt ${generation.attemptCount}`
                  : ""}
              </p>
              <CheckpointUsed generation={generation} />
              {generation.errorMessage ? (
                <p className="mt-2 text-sm text-alchemy-danger">
                  {generation.errorMessage}
                </p>
              ) : null}
            </div>
            {generation.status === "completed" ? (
              <>
                <AudioPlayer
                  src={`/api/audio/${generation.id}`}
                  title={generation.title}
                />
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`/api/audio/${generation.id}?download=1`}
                    className="rounded-lg border border-alchemy-border bg-alchemy-elevated px-3 py-2 text-sm text-alchemy-text hover:border-alchemy-accent/50"
                  >
                    Download
                  </a>
                  <button
                    type="button"
                    onClick={() => router.push("/library")}
                    className="rounded-lg border border-alchemy-border bg-alchemy-elevated px-3 py-2 text-sm text-alchemy-text hover:border-alchemy-accent/50"
                  >
                    Open library
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void onDelete()}
                    className="rounded-lg border border-alchemy-border bg-alchemy-elevated px-3 py-2 text-sm text-alchemy-muted hover:border-alchemy-danger/50 hover:text-alchemy-danger disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </>
            ) : isOpen ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-alchemy-border bg-alchemy-bg/50 p-3">
                  <div className="flex items-center gap-2 text-sm text-alchemy-text">
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-alchemy-accent" />
                    {progressLabel}
                  </div>
                  {generation.progressPct != null ? (
                    <div className="mt-2">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-alchemy-elevated">
                        <div
                          className="h-full rounded-full bg-alchemy-accent transition-all"
                          style={{
                            width: `${Math.min(100, Math.max(0, generation.progressPct))}%`,
                          }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-alchemy-muted tabular-nums">
                        {Math.round(generation.progressPct)}%
                      </p>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void onCancel()}
                  className="rounded-lg border border-alchemy-border bg-alchemy-elevated px-3 py-2 text-sm text-alchemy-text hover:border-alchemy-danger/50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(generation.status === "failed" ||
                  generation.status === "cancelled") && (
                  <button
                    type="button"
                    disabled={actionBusy || aceUnhealthy}
                    onClick={() => void onRetry()}
                    className="rounded-lg border border-alchemy-border bg-alchemy-elevated px-3 py-2 text-sm text-alchemy-text hover:border-alchemy-accent/50 disabled:opacity-50"
                  >
                    Retry
                  </button>
                )}
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void onDelete()}
                  className="rounded-lg border border-alchemy-border bg-alchemy-elevated px-3 py-2 text-sm text-alchemy-muted hover:border-alchemy-danger/50 hover:text-alchemy-danger disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function CheckpointUsed({ generation }: { generation: Generation }) {
  const display = resolveDisplayModelLabel({
    requestedModelName: generation.requestedModelName ?? generation.modelName,
    actualModelName: generation.actualModelName,
    requestedCapability: generation.requestedCapability,
    actualCapability: generation.actualCapability,
    status: generation.status,
  });
  const presetLabel =
    generation.preset === "fast"
      ? "Fast"
      : generation.preset === "quality"
        ? "Quality"
        : null;
  const parts: string[] = [];
  if (presetLabel) parts.push(presetLabel);
  if (generation.provider) parts.push(generation.provider);
  parts.push(display.detail);
  return (
    <p className="mt-1 text-xs text-alchemy-muted">
      {display.confirmed ? "Checkpoint used" : "Checkpoint"}:{" "}
      <span className="font-medium text-alchemy-text">{parts.join(" · ")}</span>
    </p>
  );
}

function GpuStatusPanel({
  health,
  loading,
  sftAvailable,
}: {
  health: HealthInfo | null;
  loading: boolean;
  sftAvailable: boolean;
}) {
  if (loading || !health) {
    return (
      <div className="mb-4 rounded-lg border border-alchemy-border bg-alchemy-bg/40 px-3 py-2 text-xs text-alchemy-muted">
        Checking local ACE / GPU status…
      </div>
    );
  }
  const aceUp = health.mode === "mock" || health.aceStep;
  const fast = health.presets?.items?.find((x) => x.id === "fast");
  const quality = health.presets?.items?.find((x) => x.id === "quality");
  return (
    <div className="mb-4 rounded-lg border border-alchemy-border bg-alchemy-bg/40 px-3 py-2 text-xs text-alchemy-muted">
      <p>
        Local ACE:{" "}
        <span className={aceUp ? "text-alchemy-success font-medium" : "text-alchemy-danger font-medium"}>
          {health.mode === "mock"
            ? "mock (no GPU)"
            : health.aceStep
              ? "up"
              : "down"}
        </span>
        {health.settings?.busy ? (
          <span className="text-alchemy-gold"> · busy</span>
        ) : null}
        {health.models?.reachable != null ? (
          <span>
            {" "}
            · models probe: {health.models.reachable ? "reachable" : "env-fallback"}
          </span>
        ) : null}
      </p>
      <p className="mt-1">
        Fast:{" "}
        <span className="text-alchemy-text">
          {fast?.ready === false ? "not ready" : "ready"}
          {fast?.model ? ` (${fast.model})` : ""}
        </span>
        {" · "}
        Quality:{" "}
        <span className="text-alchemy-text">
          {quality?.ready === false ? "not ready" : "ready"}
          {quality?.model ? ` (${quality.model})` : ""}
          {sftAvailable ? " · SFT confirmed" : " · SFT unconfirmed"}
        </span>
      </p>
      {health.qualityTier || health.capabilities?.length ? (
        <p className="mt-1">
          Tier:{" "}
          <span className="text-alchemy-text">{health.qualityTier || "local-sft"}</span>
          {health.capabilities?.some((c) => c.id === "remote-xl-sft") ? (
            <>
              {" · "}
              remote-xl-sft:{" "}
              <span className="text-alchemy-text">
                {health.capabilities.find((c) => c.id === "remote-xl-sft")?.available
                  ? "available"
                  : health.capabilities.find((c) => c.id === "remote-xl-sft")?.configured
                    ? "configured (not confirmed)"
                    : "not configured"}
              </span>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function HealthBadge({
  health,
  loading,
}: {
  health: HealthInfo | null;
  loading: boolean;
}) {
  if (loading || !health) {
    return (
      <span className="rounded-full border border-alchemy-border bg-alchemy-elevated px-2.5 py-1 text-[11px] text-alchemy-muted">
        Checking…
      </span>
    );
  }
  const ok =
    health.mode === "mock" || (health.mode === "ace-step" && health.aceStep);
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
        ok
          ? "border-alchemy-success/40 bg-alchemy-success/10 text-alchemy-success"
          : "border-alchemy-danger/40 bg-alchemy-danger/10 text-alchemy-danger"
      }`}
      title={
        health.mode === "ace-step"
          ? `ACE-Step ${health.aceStep ? "ok" : "down"}`
          : "Mock synthesizer"
      }
    >
      {health.mode}
      {health.mode === "ace-step"
        ? health.aceStep
          ? " · online"
          : " · offline"
        : " · ready"}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === "completed"
      ? "text-alchemy-success"
      : status === "failed" || status === "cancelled"
        ? "text-alchemy-danger"
        : "text-alchemy-gold";
  return <span className={`font-medium ${color}`}>{status}</span>;
}
