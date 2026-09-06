"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  src: string;
  title?: string;
  compact?: boolean;
};

export function AudioPlayer({ src, title, compact }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    setPlaying(false);
    setProgress(0);
  }, [src]);

  function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  }

  return (
    <div
      className={`rounded-xl border border-alchemy-border bg-alchemy-elevated/80 ${
        compact ? "p-3" : "p-4"
      }`}
    >
      {title ? (
        <p className="mb-2 truncate text-sm font-medium text-alchemy-text">{title}</p>
      ) : null}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gen-gradient font-semibold text-white shadow-glow-accent transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-alchemy-gold/50"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <div className="min-w-0 flex-1">
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={progress}
            onChange={(e) => {
              const v = Number(e.target.value);
              setProgress(v);
              if (audioRef.current) audioRef.current.currentTime = v;
            }}
            className="w-full accent-alchemy-accent"
          />
          <div className="mt-1 flex justify-between text-[11px] text-alchemy-muted tabular-nums">
            <span>{formatTime(progress)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />
    </div>
  );
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
