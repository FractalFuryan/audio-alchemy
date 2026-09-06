"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Generation, GenerationMode, PlanningMode } from "@/lib/types";
import {
  clearConflictingTags,
  compileMusicBrief,
  type PromptCompileResult,
} from "@/lib/prompt-compiler";
import {
  enginePillLabel,
  inventoryHasSft,
  isSongFocusBlocked,
  qualitySegmentHint,
  resolveEnginePillState,
} from "@/lib/create-health-ui";
import { resolveDisplayModelLabel } from "@/lib/ace-capabilities";
import { titleFromPrompt } from "@/lib/title";
import { AudioPlayer } from "./AudioPlayer";
import { DiagnosticsPanel } from "./DiagnosticsPanel";

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
    ffmpegPathConfigured?: boolean;
    hint?: string | null;
    defaultPreset?: "off" | "light" | "loudness";
    envDefaultPreset?: "off" | "light" | "loudness";
    presets?: Array<{
      id: "off" | "light" | "loudness";
      label: string;
      description?: string;
    }>;
  };
  planner?: {
    available?: boolean;
    reason?: string | null;
    matchedModels?: string[];
    heuristic?: string;
    aceConnected?: boolean;
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
  const variationId = searchParams.get("variation");

  const [prompt, setPrompt] = useState("");
  const [variationOf, setVariationOf] = useState<string | null>(null);
  const [variationBanner, setVariationBanner] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [style, setStyle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [durationSec, setDurationSec] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorHint, setErrorHint] = useState<string | null>(null);
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
  const [presetTouched, setPresetTouched] = useState(false);
  const [fineTuneOpen, setFineTuneOpen] = useState(false);
  const [postFxPreset, setPostFxPreset] = useState<"off" | "light" | "loudness">("off");
  const [planningMode, setPlanningMode] = useState<PlanningMode>("direct");
  const [musicBrief, setMusicBrief] = useState("");
  const [briefTouched, setBriefTouched] = useState(false);
  const [briefOpen, setBriefOpen] = useState(true);
  const [compileResult, setCompileResult] = useState<PromptCompileResult | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advInferenceSteps, setAdvInferenceSteps] = useState<string>("");
  const [advModel, setAdvModel] = useState("");
  const [advAudioFormat, setAdvAudioFormat] = useState<string>("");
  const [advTouched, setAdvTouched] = useState(false);
  const linkedLoaded = useRef<string | null>(null);
  const presetAutoApplied = useRef(false);

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
      const next: HealthInfo = {
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
        planner:
          data.planner && typeof data.planner === "object" ? data.planner : undefined,
      };
      setHealth(next);

      // Quality preferred when local SFT inventory is confirmed; else Fast.
      if (!presetTouched && !presetAutoApplied.current) {
        const sft = inventoryHasSft(next);
        const inventoryKnown =
          Array.isArray(next.models?.items) && (next.models?.items?.length ?? 0) > 0;
        if (sft) {
          setPreset("quality");
          presetAutoApplied.current = true;
        } else if (inventoryKnown || next.mode === "mock") {
          setPreset("fast");
          presetAutoApplied.current = true;
        }
      }
    } catch {
      setHealth({ ok: false, mode: "mock", aceStep: false });
    } finally {
      setHealthLoading(false);
    }
  }, [presetTouched]);

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
    if (appliedPackTags.length > 0) {
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
    if (!variationId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/generations/${variationId}`);
        const data = await res.json();
        if (cancelled || !data.generation) return;
        const g = data.generation as Generation;
        setPrompt(g.prompt || "");
        setStyle(g.style || "");
        setLyrics(g.lyrics || "");
        setDurationSec(g.durationSec || 60);
        const base = (g.title || "Untitled").trim();
        const nextTitle = base.toLowerCase().startsWith("variation of")
          ? base
          : `Variation of ${base}`.slice(0, 80);
        setTitle(nextTitle);
        setTitleTouched(true);
        if (g.preset === "fast" || g.preset === "quality") {
          setPreset(g.preset);
          setPresetTouched(true);
        }
        if (g.requestedModelName) {
          setAdvModel(g.requestedModelName);
          setAdvTouched(true);
          setAdvancedOpen(true);
        }
        setVariationOf(g.id);
        setVariationBanner(g.title || g.id.slice(0, 8));
        setGeneration(null);
        setFineTuneOpen(true);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [variationId]);

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

  const plannerConfirmed = Boolean(health?.planner?.available);
  const plannerReason =
    health?.planner?.reason ||
    "Local ACE planner/LM not available";

  useEffect(() => {
    const result = compileMusicBrief({ prompt, style, lyrics });
    setCompileResult(result);
    if (planningMode === "song-focus" && !briefTouched) {
      setMusicBrief(result.musicBrief);
    }
  }, [prompt, style, lyrics, planningMode, briefTouched]);

  const songFocusBlocked = isSongFocusBlocked({
    planningMode,
    healthLoading,
    healthKnown: health != null,
    plannerAvailable: plannerConfirmed,
    mode: health?.mode,
  });
  const canGenerate =
    !busy &&
    !healthLoading &&
    Boolean(prompt.trim()) &&
    !aceUnhealthy &&
    !aceBusy &&
    !songFocusBlocked &&
    (planningMode !== "song-focus" || Boolean(musicBrief.trim()));

  const styleTags = useMemo(
    () =>
      style
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [style]
  );

  const sftAvailable = useMemo(() => (health ? inventoryHasSft(health) : false), [health]);

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
    setErrorHint(null);
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
          planningMode,
          ...(planningMode === "song-focus"
            ? { musicBrief: musicBrief.trim(), thinking: true }
            : { thinking: false }),
          ...(variationOf ? { variationOf } : {}),
          ...(advInferenceSteps.trim()
            ? { inferenceSteps: Number(advInferenceSteps) }
            : {}),
          ...(advModel.trim() ? { model: advModel.trim() } : {}),
          ...(advAudioFormat.trim() ? { audioFormat: advAudioFormat.trim() } : {}),
          batchSize: 1,
          postFxPreset,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.generation) {
          setGeneration(data.generation as Generation);
        }
        if (typeof data.hint === "string") setErrorHint(data.hint);
        throw new Error(data.error || "Generation failed");
      }
      const gen = data.generation as Generation;
      setGeneration(gen);
      setVariationOf(null);
      setVariationBanner(null);
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

  const segmentBtn = (active: boolean, blocked = false) =>
    `rounded-lg border px-2.5 py-2 text-left transition focus-visible:ring-2 focus-visible:ring-alchemy-accent/60 disabled:opacity-50 ${
      active
        ? blocked
          ? "border-alchemy-gold/70 bg-alchemy-gold/10 text-alchemy-text"
          : "border-alchemy-accentGlow bg-alchemy-accent/15 text-alchemy-text shadow-glow-accent"
        : "border-alchemy-border bg-alchemy-bg/80 text-alchemy-muted hover:border-alchemy-accent/40"
    }`;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-col items-center justify-center gap-1 pt-0 pb-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/audio-alchemy-logo.png"
          alt="Audio Alchemy"
          className="h-14 w-auto max-w-[min(100%,300px)] object-contain sm:h-16"
        />
      </div>

      <form
        onSubmit={onSubmit}
        className="aa-card aa-card-light p-4 sm:p-5"
      >
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-alchemy-text sm:text-2xl">
              Create
            </h1>
            <p className="mt-0.5 text-xs text-alchemy-muted sm:text-sm">
              Describe a track. You own what you generate.
            </p>
          </div>
          <EngineStatusPill
            health={health}
            loading={healthLoading}
            generating={Boolean(isOpen) || busy}
          />
        </div>

        {aceUnhealthy ? (
          <div className="mb-3 rounded-lg border border-alchemy-danger/40 bg-alchemy-danger/10 px-3 py-2 text-sm text-alchemy-danger">
            <p className="font-medium">Local engine unreachable.</p>
            <p className="mt-1 text-xs text-alchemy-gold/90">
              Start ACE-Step or use Diagnostics. Generate stays disabled until health recovers.
            </p>
          </div>
        ) : null}

        {aceBusy && !aceUnhealthy ? (
          <div className="mb-3 rounded-lg border border-alchemy-gold/40 bg-alchemy-gold/10 px-3 py-2 text-sm text-alchemy-gold">
            <p className="font-medium">Engine busy (one job at a time).</p>
            <p className="mt-1 text-xs opacity-90">
              Wait for the current job or cancel it, then retry.
            </p>
          </div>
        ) : null}

        {variationBanner ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-alchemy-accent/40 bg-alchemy-accent/10 px-3 py-2 text-sm text-alchemy-text">
            <span>
              Variation of <strong className="text-alchemy-gold">{variationBanner}</strong>
              {" — "}new seed on Generate.
            </span>
            <button
              type="button"
              className="aa-btn !py-1 text-xs"
              onClick={() => {
                setVariationOf(null);
                setVariationBanner(null);
                router.replace("/", { scroll: false });
              }}
            >
              Clear
            </button>
          </div>
        ) : null}

        {/* Minimal default: Prompt */}
        <section className="mb-3">
          <label
            htmlFor="create-prompt"
            className="block text-sm font-medium text-alchemy-text mb-1"
          >
            Prompt
          </label>
          <textarea
            id="create-prompt"
            required
            disabled={formDisabled}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="Dreamy synthwave with warm pads and a steady pulse…"
            className="w-full rounded-xl border border-alchemy-border bg-alchemy-bg px-3 py-2.5 text-base text-alchemy-text placeholder:text-alchemy-muted/70 focus:outline-none focus:ring-2 focus:ring-alchemy-accent/50 disabled:opacity-60"
          />
        </section>

        {/* Direct / Song focus — compact segmented */}
        <section className="mb-3">
          <p className="mb-1 text-sm font-medium text-alchemy-text" id="planning-label">
            Planning
          </p>
          <div
            className="grid grid-cols-2 gap-1.5"
            role="group"
            aria-labelledby="planning-label"
          >
            {(
              [
                { id: "direct" as const, label: "Direct", hint: "As written" },
                {
                  id: "song-focus" as const,
                  label: "Song focus",
                  hint: "Local planner",
                },
              ] as const
            ).map((item) => {
              const active = planningMode === item.id;
              const blocked =
                item.id === "song-focus" &&
                !healthLoading &&
                health != null &&
                (!plannerConfirmed || health.mode !== "ace-step");
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={formDisabled}
                  aria-pressed={active}
                  title={
                    item.id === "song-focus"
                      ? "Uses local ACE planner when confirmed. Slower. Prompt stays on this machine."
                      : "Submit your prompt as written."
                  }
                  onClick={() => {
                    setPlanningMode(item.id);
                    setBriefTouched(false);
                    if (item.id === "song-focus") {
                      const r = compileMusicBrief({ prompt, style, lyrics });
                      setCompileResult(r);
                      setMusicBrief(r.musicBrief);
                      setBriefOpen(true);
                    }
                  }}
                  className={segmentBtn(active, blocked)}
                >
                  <span className="block text-sm font-semibold text-alchemy-text">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-alchemy-muted">
                    {item.hint}
                  </span>
                </button>
              );
            })}
          </div>

          {planningMode === "song-focus" && healthLoading ? (
            <p className="mt-1.5 text-xs text-alchemy-muted">Checking local engine…</p>
          ) : null}

          {planningMode === "song-focus" && songFocusBlocked ? (
            <div className="mt-2 rounded-lg border border-alchemy-gold/40 bg-alchemy-gold/10 px-3 py-2 text-xs text-alchemy-gold">
              <p className="font-medium">Song focus unavailable</p>
              <p className="mt-1 opacity-90">{plannerReason}</p>
              <p className="mt-1 opacity-90">
                Choose <strong className="text-alchemy-text">Direct</strong> to generate.
                No silent fallback while Song focus stays selected.
              </p>
              <button
                type="button"
                className="aa-btn mt-2 !py-1 text-xs"
                disabled={formDisabled}
                onClick={() => setPlanningMode("direct")}
              >
                Switch to Direct
              </button>
            </div>
          ) : null}

          {planningMode === "song-focus" && !songFocusBlocked && !healthLoading ? (
            <div className="mt-2 space-y-2">
              {compileResult && compileResult.conflicts.length > 0 ? (
                <div className="rounded-lg border border-alchemy-gold/40 bg-alchemy-gold/10 px-3 py-2 text-xs text-alchemy-gold">
                  <p className="font-medium">Style tags conflict with the prompt</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {compileResult.conflicts.map((c) => (
                      <li key={c.tag + c.reason}>
                        <span className="text-alchemy-text">{c.tag}</span> — {c.reason}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="aa-btn mt-2 !py-1 text-xs"
                    disabled={formDisabled}
                    onClick={() => {
                      const next = clearConflictingTags(style, compileResult.conflicts);
                      setStyle(next);
                      setBriefTouched(false);
                    }}
                  >
                    Clear conflicting tags
                  </button>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => setBriefOpen((o) => !o)}
                className="flex w-full items-center justify-between rounded-lg border border-alchemy-border bg-alchemy-bg/50 px-3 py-1.5 text-left text-xs text-alchemy-text hover:border-alchemy-accent/40"
              >
                <span className="font-medium">Music brief</span>
                <span className="text-alchemy-muted">
                  {briefOpen ? "Hide" : "Show"} · editable
                </span>
              </button>
              {briefOpen ? (
                <div className="space-y-2 rounded-lg border border-alchemy-border bg-alchemy-bg/30 px-3 py-2">
                  <textarea
                    id="create-music-brief"
                    aria-label="Music brief"
                    disabled={formDisabled}
                    value={musicBrief}
                    onChange={(e) => {
                      setBriefTouched(true);
                      setMusicBrief(e.target.value);
                    }}
                    rows={4}
                    className="w-full rounded-lg border border-alchemy-border bg-alchemy-bg px-3 py-2 text-sm text-alchemy-text font-mono focus:outline-none focus:ring-2 focus:ring-alchemy-accent/50 disabled:opacity-60"
                  />
                  <button
                    type="button"
                    className="aa-btn !py-1 text-xs"
                    disabled={formDisabled}
                    onClick={() => {
                      const r = compileMusicBrief({ prompt, style, lyrics });
                      setCompileResult(r);
                      setMusicBrief(r.musicBrief);
                      setBriefTouched(false);
                    }}
                  >
                    Recompile from prompt
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* Quality / Fast — compact segmented */}
        <section className="mb-3">
          <p className="mb-1 text-sm font-medium text-alchemy-text" id="preset-label">
            Quality
          </p>
          <div
            className="grid grid-cols-2 gap-1.5"
            role="group"
            aria-labelledby="preset-label"
          >
            {(["quality", "fast"] as const).map((id) => {
              const item = health?.presets?.items?.find((x) => x.id === id);
              const active = preset === id;
              const blocked = item?.ready === false;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={formDisabled || blocked}
                  aria-pressed={active}
                  title={
                    id === "quality"
                      ? sftAvailable
                        ? "Higher fidelity · local SFT confirmed"
                        : "Higher fidelity · more steps"
                      : "Lower latency · Turbo-class"
                  }
                  onClick={() => {
                    setPreset(id);
                    setPresetTouched(true);
                    setAdvTouched(true);
                    if (item?.inferenceSteps != null) {
                      setAdvInferenceSteps(String(item.inferenceSteps));
                    }
                    if (item?.model) setAdvModel(item.model);
                  }}
                  className={segmentBtn(active, false)}
                >
                  <span className="block text-sm font-semibold text-alchemy-text">
                    {id === "fast" ? "Fast" : "Quality"}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-alchemy-muted">
                    {id === "fast"
                      ? "Turbo · lower latency"
                      : qualitySegmentHint({ loading: healthLoading, sftAvailable })}
                  </span>
                  {blocked ? (
                    <span className="mt-0.5 block text-[11px] text-alchemy-danger">
                      {item?.readinessReason || "Not ready"}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {/* Explanation only after interaction when Fast is selected without confirmed SFT */}
          {presetTouched && !sftAvailable && preset === "fast" && !healthLoading ? (
            <p className="mt-1.5 text-xs text-alchemy-muted">
              Fast selected. Local SFT not confirmed in inventory — Quality uses more steps
              when available.
            </p>
          ) : null}
          {presetTouched && sftAvailable && preset === "quality" ? (
            <p className="mt-1.5 text-xs text-alchemy-muted">
              Quality preferred — local SFT confirmed.
            </p>
          ) : null}
        </section>

        {error ? (
          <div className="mb-3 rounded-lg border border-alchemy-danger/40 bg-alchemy-danger/10 px-3 py-2 text-sm text-alchemy-danger">
            <p>{error}</p>
            {errorHint ? (
              <p className="mt-1 text-xs text-alchemy-gold/90">{errorHint}</p>
            ) : null}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!canGenerate || Boolean(isOpen)}
          className="aa-btn-primary"
        >
          {busy
            ? "Starting…"
            : isOpen
              ? "Generating…"
              : aceUnhealthy
                ? "Engine unavailable"
                : aceBusy
                  ? "Engine busy"
                  : songFocusBlocked
                    ? "Song focus unavailable"
                    : "Generate"}
        </button>

        {/* One Fine-tune drawer */}
        <section className="mt-3">
          <button
            type="button"
            onClick={() => setFineTuneOpen((o) => !o)}
            aria-expanded={fineTuneOpen}
            className="flex w-full items-center justify-between rounded-xl border border-alchemy-border bg-alchemy-bg/50 px-3 py-2 text-left text-sm text-alchemy-text hover:border-alchemy-accent/40"
          >
            <span className="font-medium text-alchemy-muted">
              Fine-tune — style, lyrics, duration, templates, sound polish
            </span>
            <span className="shrink-0 text-xs text-alchemy-muted">
              {fineTuneOpen ? "Hide" : "Show"}
            </span>
          </button>

          {fineTuneOpen ? (
            <div className="mt-2 space-y-4 rounded-xl border border-alchemy-border bg-alchemy-bg/25 px-3 py-3">
              {/* Templates */}
              {templates.length > 0 ? (
                <div>
                  <label
                    htmlFor="create-pack"
                    className="block text-sm font-medium text-alchemy-text mb-1"
                    title="Genre pack filters templates"
                  >
                    Templates
                  </label>
                  <select
                    id="create-pack"
                    disabled={formDisabled}
                    value={packFilter}
                    onChange={(e) => onPackFilterChange(e.target.value)}
                    className="mb-1.5 w-full rounded-xl border border-alchemy-border bg-alchemy-bg px-3 py-2 text-sm text-alchemy-text focus:outline-none focus:ring-2 focus:ring-alchemy-accent/50 disabled:opacity-60"
                  >
                    <option value="">All packs</option>
                    {packs.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="create-template" className="sr-only">
                    Template
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
                    className="mb-1.5 w-full rounded-xl border border-alchemy-border bg-alchemy-bg px-3 py-2 text-sm text-alchemy-text focus:outline-none focus:ring-2 focus:ring-alchemy-accent/50 disabled:opacity-60"
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
                  <label className="mt-1.5 flex items-center gap-2 text-xs text-alchemy-muted">
                    <input
                      type="checkbox"
                      checked={keepTagsOnTemplate}
                      onChange={(e) => setKeepTagsOnTemplate(e.target.checked)}
                      disabled={formDisabled}
                      className="accent-alchemy-accent"
                    />
                    Keep my tags when switching template
                  </label>
                </div>
              ) : null}

              {/* Title */}
              <div>
                <label
                  htmlFor="create-title"
                  className="block text-sm font-medium text-alchemy-text mb-1"
                >
                  Title{" "}
                  <span className="text-alchemy-muted font-normal">(auto)</span>
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
                  className="w-full rounded-xl border border-alchemy-border bg-alchemy-bg px-3 py-2 text-sm text-alchemy-text placeholder:text-alchemy-muted/70 focus:outline-none focus:ring-2 focus:ring-alchemy-accent/50 disabled:opacity-60"
                />
              </div>

              {/* Style tags */}
              <div>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="create-style"
                    className="block text-sm font-medium text-alchemy-text"
                    title="Comma-separated; conflicting genre stacks can hurt results"
                  >
                    Style tags
                  </label>
                  <button
                    type="button"
                    disabled={formDisabled || styleTags.length === 0}
                    onClick={clearTags}
                    className="rounded-lg border border-alchemy-border bg-alchemy-elevated px-2 py-0.5 text-xs text-alchemy-muted hover:border-alchemy-danger/40 hover:text-alchemy-danger disabled:opacity-40"
                  >
                    Clear
                  </button>
                </div>
                <input
                  id="create-style"
                  disabled={formDisabled}
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  placeholder="lo-fi, ambient, cinematic"
                  className="mb-1.5 w-full rounded-xl border border-alchemy-border bg-alchemy-bg px-3 py-2 text-sm text-alchemy-text placeholder:text-alchemy-muted/70 focus:outline-none focus:ring-2 focus:ring-alchemy-accent/50 disabled:opacity-60"
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
              </div>

              {/* Lyrics */}
              <div>
                <label
                  htmlFor="create-lyrics"
                  className="block text-sm font-medium text-alchemy-text mb-1"
                  title="Blank or [inst] for instrumental"
                >
                  Lyrics
                </label>
                <textarea
                  id="create-lyrics"
                  disabled={formDisabled}
                  value={lyrics}
                  onChange={(e) => setLyrics(e.target.value)}
                  rows={4}
                  placeholder={"[Verse]\nLeave blank or use [inst] for instrumental…"}
                  className="w-full rounded-xl border border-alchemy-border bg-alchemy-bg px-3 py-2 text-sm text-alchemy-text placeholder:text-alchemy-muted/70 focus:outline-none focus:ring-2 focus:ring-alchemy-accent/50 font-mono disabled:opacity-60"
                />
              </div>

              {/* Duration */}
              <div>
                <label
                  htmlFor="create-duration"
                  className="block text-sm font-medium text-alchemy-text mb-1"
                >
                  Duration:{" "}
                  <span className="text-alchemy-accent tabular-nums">{durationSec}s</span>
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
                <div className="mt-0.5 flex justify-between text-[11px] text-alchemy-muted">
                  <span>30s</span>
                  <span>180s</span>
                </div>
              </div>

              {/* Post-processing */}
              <div>
                <p
                  className="mb-1 text-sm font-medium text-alchemy-text"
                  title="Optional ffmpeg polish after generation; Off by default"
                >
                  Post-processing / sound polish
                </p>
                <div className="grid gap-1.5 sm:grid-cols-3">
                  {(
                    [
                      { id: "off" as const, label: "Off" },
                      { id: "light" as const, label: "Light polish" },
                      { id: "loudness" as const, label: "Loudness" },
                    ] as const
                  ).map((item) => {
                    const active = postFxPreset === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={formDisabled}
                        aria-pressed={active}
                        onClick={() => setPostFxPreset(item.id)}
                        className={segmentBtn(active)}
                      >
                        <span className="block text-sm font-semibold text-alchemy-text">
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {postFxPreset !== "off" &&
                !healthLoading &&
                health?.postprocess?.ffmpegAvailable === false ? (
                  <p className="mt-1 text-xs text-alchemy-gold">
                    ffmpeg not found — FX will be skipped
                    {health.postprocess.hint ? ` · ${health.postprocess.hint}` : ""}
                  </p>
                ) : null}
              </div>

              {/* Advanced / expert */}
              <div>
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((o) => !o)}
                  aria-expanded={advancedOpen}
                  className="flex w-full items-center justify-between rounded-lg border border-alchemy-border bg-alchemy-bg/50 px-3 py-1.5 text-left text-sm text-alchemy-text hover:border-alchemy-accent/40"
                >
                  <span className="font-medium">Advanced / expert</span>
                  <span className="text-xs text-alchemy-muted">
                    {advancedOpen ? "Hide" : "Show"}
                  </span>
                </button>
                {advancedOpen ? (
                  <div className="mt-2 space-y-2 rounded-lg border border-alchemy-border bg-alchemy-bg/40 px-3 py-3 text-xs text-alchemy-muted">
                    <p title="Requested model is never labeled as actual until confirmed">
                      Planning:{" "}
                      <span className="text-alchemy-text">
                        {planningMode === "song-focus"
                          ? healthLoading
                            ? "Song focus · checking…"
                            : plannerConfirmed
                              ? "Song focus (planner on)"
                              : "Song focus (unavailable — pick Direct)"
                          : "Direct"}
                      </span>
                      {" · "}
                      Preset:{" "}
                      <span className="text-alchemy-text">
                        {preset === "fast" ? "Fast" : "Quality"}
                      </span>
                      {sftAvailable ? " · SFT confirmed" : ""}
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
                          placeholder={String(
                            qualityReady?.inferenceSteps ??
                              fastReady?.inferenceSteps ??
                              health?.settings?.inferenceSteps ??
                              8
                          )}
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
                          Model override (optional)
                        </span>
                        <input
                          disabled={formDisabled}
                          value={advModel}
                          onChange={(e) => {
                            setAdvTouched(true);
                            setAdvModel(e.target.value);
                          }}
                          placeholder="server default"
                          className="w-full rounded-lg border border-alchemy-border bg-alchemy-bg px-2 py-1.5 text-sm text-alchemy-text disabled:opacity-60"
                        />
                      </label>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      </form>

      {/* Diagnostics — collapsed by default; not in primary flow */}
      <DiagnosticsPanel compact />

      <aside className="aa-card aa-card-light p-4 sm:p-5" aria-live="polite">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-alchemy-muted/80">
          Result
        </h2>
        {!generation ? (
          <div className="aa-empty aa-empty-quiet mt-3 py-5">
            <p className="text-alchemy-muted/80">No track yet.</p>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <div>
              <p
                className={`font-medium text-alchemy-text ${
                  generation.status === "completed" ? "text-lg" : ""
                }`}
              >
                {generation.title}
              </p>
              <p className="mt-1 text-xs text-alchemy-muted">
                Status: <StatusPill status={generation.status} />
                {generation.attemptCount > 1
                  ? ` · attempt ${generation.attemptCount}`
                  : ""}
              </p>
              <RunningModelLine generation={generation} />
              {generation.errorMessage ? (
                <p className="mt-2 rounded-lg border border-alchemy-danger/40 bg-alchemy-danger/10 px-3 py-2 text-sm text-alchemy-danger">
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
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={`/api/audio/${generation.id}?download=1`}
                    className="aa-btn border-alchemy-accent/40 text-alchemy-text"
                  >
                    Download
                  </a>
                  <button
                    type="button"
                    onClick={() => router.push("/library")}
                    className="aa-btn border-alchemy-accent/40 text-alchemy-text"
                  >
                    Open library
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void onDelete()}
                    className="aa-btn-danger !border-transparent !bg-transparent !px-2 !py-1 text-xs opacity-60 hover:opacity-100"
                  >
                    Delete
                  </button>
                </div>
              </>
            ) : isOpen ? (
              <GenerationProgress
                generation={generation}
                progressLabel={progressLabel}
                actionBusy={actionBusy}
                onCancel={() => void onCancel()}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {(generation.status === "failed" ||
                  generation.status === "cancelled") && (
                  <button
                    type="button"
                    disabled={actionBusy || aceUnhealthy}
                    onClick={() => void onRetry()}
                    className="aa-btn"
                  >
                    Retry
                  </button>
                )}
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void onDelete()}
                  className="aa-btn-danger !border-transparent !bg-transparent !px-2 !py-1 text-xs opacity-60 hover:opacity-100"
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

function RunningModelLine({ generation }: { generation: Generation }) {
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
  const providerLabel = generation.provider
    ? generation.provider === "local"
      ? "local"
      : generation.provider === "remote"
        ? "remote"
        : generation.provider
    : null;

  return (
    <div className="mt-2 space-y-1 text-xs text-alchemy-muted">
      <p>
        {display.confirmed ? (
          <>
            <span className="text-alchemy-success">Used</span>
            {": "}
            <span className="font-medium text-alchemy-text">
              {[presetLabel, providerLabel, display.detail].filter(Boolean).join(" · ")}
            </span>
          </>
        ) : (
          <>
            <span className="text-alchemy-gold">Requested</span>
            {": "}
            <span className="font-medium text-alchemy-text">
              {[presetLabel, providerLabel, display.detail].filter(Boolean).join(" · ")}
            </span>
            <span className="mt-0.5 block text-[11px] text-alchemy-muted/90">
              Actual model shown only after the worker confirms it.
            </span>
          </>
        )}
      </p>
    </div>
  );
}

function GenerationProgress({
  generation,
  progressLabel,
  actionBusy,
  onCancel,
}: {
  generation: Generation;
  progressLabel: string | null;
  actionBusy: boolean;
  onCancel: () => void;
}) {
  const display = resolveDisplayModelLabel({
    requestedModelName: generation.requestedModelName ?? generation.modelName,
    actualModelName: generation.actualModelName,
    requestedCapability: generation.requestedCapability,
    actualCapability: generation.actualCapability,
    status: generation.status,
  });
  const stage = generation.stage || (generation.status === "pending" ? "queued" : "processing");
  const pct =
    generation.progressPct != null
      ? Math.min(100, Math.max(0, generation.progressPct))
      : null;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-alchemy-accent/30 bg-alchemy-bg/60 p-4 shadow-glow-accent">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-alchemy-text">
            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-alchemy-accent" />
            <span className="font-medium">{progressLabel || "Generating…"}</span>
          </div>
          {pct != null ? (
            <span className="text-xs tabular-nums text-alchemy-muted">{Math.round(pct)}%</span>
          ) : null}
        </div>
        <dl className="mt-3 grid gap-1.5 text-[11px] text-alchemy-muted sm:grid-cols-2">
          <div>
            <dt className="inline text-alchemy-muted/80">Stage · </dt>
            <dd className="inline text-alchemy-text">{stage}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="inline text-alchemy-muted/80">
              {display.confirmed ? "Actual · " : "Requested · "}
            </dt>
            <dd className="inline text-alchemy-text">
              {[generation.provider, display.detail].filter(Boolean).join(" · ") || "—"}
            </dd>
          </div>
        </dl>
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-alchemy-elevated">
            <div
              className={`h-full rounded-full bg-gen-gradient transition-all ${
                pct == null ? "w-1/3 animate-pulse" : ""
              }`}
              style={pct != null ? { width: `${pct}%` } : undefined}
            />
          </div>
        </div>
      </div>
      <button
        type="button"
        disabled={actionBusy}
        onClick={onCancel}
        className="aa-btn-danger !border-transparent !bg-transparent !px-2 !py-1 text-xs opacity-70 hover:opacity-100"
      >
        {actionBusy ? "Cancelling…" : "Cancel"}
      </button>
    </div>
  );
}

/**
 * Truthful engine status near Create title.
 * Never labels mock when ACE-Step is available; never invents readiness while loading.
 */
function EngineStatusPill({
  health,
  loading,
  generating,
}: {
  health: HealthInfo | null;
  loading: boolean;
  generating: boolean;
}) {
  const state = resolveEnginePillState({
    loading,
    generating,
    mode: health?.mode,
    aceStep: health?.aceStep,
  });
  const label = enginePillLabel(state);
  const className =
    state === "generating"
      ? "rounded-full border border-alchemy-accent/50 bg-alchemy-accent/10 px-2.5 py-1 text-[11px] font-medium text-alchemy-accentHover"
      : state === "ready"
        ? "rounded-full border border-alchemy-success/40 bg-alchemy-success/10 px-2.5 py-1 text-[11px] font-medium text-alchemy-success"
        : state === "unavailable"
          ? "rounded-full border border-alchemy-danger/40 bg-alchemy-danger/10 px-2.5 py-1 text-[11px] font-medium text-alchemy-danger"
          : "rounded-full border border-alchemy-border bg-alchemy-elevated px-2.5 py-1 text-[11px] text-alchemy-muted";
  const title =
    state === "ready" && health?.mode === "ace-step"
      ? "ACE-Step connected"
      : state === "ready" && health?.mode === "mock"
        ? "Local demo synthesizer"
        : state === "unavailable"
          ? "ACE-Step offline"
          : undefined;
  return (
    <span className={className} title={title}>
      {label}
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
