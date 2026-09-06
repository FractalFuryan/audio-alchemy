"use client";

import { useCallback, useEffect, useState } from "react";

type Diagnostics = {
  mode?: string;
  aceStepConnected?: boolean | null;
  qualityTier?: string;
  gpuBusy?: boolean;
  singleFlight?: boolean;
  dataDir?: string;
  disk?: {
    ok?: boolean;
    freeLabel?: string | null;
    measuredAt?: string;
  };
  ffmpeg?: {
    available?: boolean;
    label?: string | null;
    pathConfigured?: boolean;
    hint?: string | null;
  };
  capabilities?: Array<{
    id: string;
    configured?: boolean;
    available?: boolean;
    modelId?: string | null;
  }>;
  models?: Array<{
    id: string;
    family?: string;
    provider?: string;
    supportedLocally?: boolean;
  }>;
};

type HealthPayload = {
  diagnostics?: Diagnostics;
  mode?: string;
  aceStep?: boolean;
  settings?: { busy?: boolean };
  qualityTier?: string;
  postprocess?: { ffmpegAvailable?: boolean; hint?: string | null };
  capabilities?: Diagnostics["capabilities"];
  models?: { items?: Diagnostics["models"] };
};

function StatusDot({ ok }: { ok: boolean | null | undefined }) {
  const color =
    ok === true
      ? "bg-alchemy-success"
      : ok === false
        ? "bg-alchemy-danger"
        : "bg-alchemy-muted";
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${color}`}
      aria-hidden
    />
  );
}

export function DiagnosticsPanel({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(!compact);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diag, setDiag] = useState<Diagnostics | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/health");
      const data = (await res.json()) as HealthPayload;
      if (!res.ok) throw new Error("Health check failed");
      const d: Diagnostics = data.diagnostics ?? {
        mode: data.mode,
        aceStepConnected:
          data.mode === "mock" ? null : Boolean(data.aceStep),
        qualityTier: data.qualityTier,
        gpuBusy: Boolean(data.settings?.busy),
        singleFlight: true,
        dataDir: "./data",
        ffmpeg: {
          available: data.postprocess?.ffmpegAvailable,
          hint: data.postprocess?.hint,
        },
        capabilities: data.capabilities,
        models: data.models?.items,
      };
      setDiag(d);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load diagnostics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  const aceOk =
    diag?.mode === "mock"
      ? null
      : diag?.aceStepConnected === true
        ? true
        : diag?.aceStepConnected === false
          ? false
          : undefined;

  return (
    <section
      className={`aa-card overflow-hidden ${className}`}
      aria-label="Local diagnostics"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left focus-visible:ring-2 focus-visible:ring-alchemy-gold/50"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-medium text-alchemy-text">
          <StatusDot ok={loading ? undefined : aceOk === false ? false : true} />
          Diagnostics
          {diag?.gpuBusy ? (
            <span className="rounded-full border border-alchemy-gold/50 bg-alchemy-gold/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-alchemy-gold">
              GPU busy
            </span>
          ) : null}
        </span>
        <span className="text-xs text-alchemy-muted">{open ? "Hide" : "Show"}</span>
      </button>

      {open ? (
        <div className="border-t border-alchemy-border px-4 py-3 font-mono text-[11px] leading-relaxed text-alchemy-muted sm:text-xs">
          {loading && !diag ? (
            <p>Checking local status…</p>
          ) : error ? (
            <p className="text-alchemy-danger">{error}</p>
          ) : diag ? (
            <ul className="space-y-1.5">
              <li>
                ACE-Step:{" "}
                <span className="text-alchemy-text">
                  {diag.mode === "mock"
                    ? "mock mode (no worker)"
                    : diag.aceStepConnected
                      ? "connected"
                      : "offline"}
                </span>
              </li>
              <li>
                Quality tier:{" "}
                <span className="text-alchemy-text">
                  {diag.qualityTier || "local-sft"}
                </span>
              </li>
              <li>
                GPU / single-flight:{" "}
                <span
                  className={
                    diag.gpuBusy ? "text-alchemy-gold" : "text-alchemy-text"
                  }
                >
                  {diag.gpuBusy ? "busy" : "idle"}
                  {diag.singleFlight ? " · single-flight on" : ""}
                </span>
              </li>
              <li>
                Data dir:{" "}
                <span className="text-alchemy-text">
                  {diag.dataDir || "./data"}
                </span>
                {diag.disk?.freeLabel ? (
                  <span>
                    {" "}
                    · free {diag.disk.freeLabel}
                    {diag.disk.measuredAt
                      ? ` @ ${diag.disk.measuredAt}`
                      : ""}
                  </span>
                ) : diag.disk?.ok === false ? (
                  <span> · free space unavailable</span>
                ) : null}
              </li>
              <li>
                ffmpeg:{" "}
                <span
                  className={
                    diag.ffmpeg?.available
                      ? "text-alchemy-success"
                      : "text-alchemy-gold"
                  }
                >
                  {diag.ffmpeg?.available
                    ? diag.ffmpeg.label || "available"
                    : "missing"}
                  {diag.ffmpeg?.pathConfigured ? " (FFMPEG_PATH)" : ""}
                </span>
              </li>
              {diag.capabilities?.length ? (
                <li className="pt-1">
                  Capabilities:{" "}
                  <span className="text-alchemy-text">
                    {diag.capabilities
                      .map((c) => {
                        const state = c.available
                          ? "available"
                          : c.configured
                            ? "configured"
                            : "off";
                        return `${c.id}(${state}${
                          c.modelId && c.available ? `:${c.modelId}` : ""
                        })`;
                      })
                      .join(" · ")}
                  </span>
                </li>
              ) : null}
              {diag.models?.length ? (
                <li>
                  Models loaded/reported:{" "}
                  <span className="text-alchemy-text">
                    {diag.models
                      .slice(0, 8)
                      .map(
                        (m) =>
                          `${m.id}${m.provider ? `@${m.provider}` : ""}`
                      )
                      .join(", ")}
                    {diag.models.length > 8
                      ? ` (+${diag.models.length - 8})`
                      : ""}
                  </span>
                </li>
              ) : (
                <li>Models: <span className="text-alchemy-text">none reported (env fallback may apply)</span></li>
              )}
              {diag.ffmpeg?.hint && !diag.ffmpeg.available ? (
                <li className="pt-1 text-alchemy-gold/90 normal-case font-sans text-[11px]">
                  {diag.ffmpeg.hint}
                </li>
              ) : null}
            </ul>
          ) : null}
          <div className="mt-3 flex gap-2 font-sans">
            <button
              type="button"
              className="aa-btn !py-1 text-xs"
              onClick={() => {
                setLoading(true);
                void load();
              }}
            >
              Refresh
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
