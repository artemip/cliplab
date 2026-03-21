"use client";

import { Play, Pause, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlayerProps {
  isPlaying: boolean;
  looping: boolean;
  currentTime: number;
  duration: number;
  onPlay: () => void;
  onStop: () => void;
  onToggleLoop: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function Player({
  isPlaying,
  looping,
  currentTime,
  duration,
  onPlay,
  onStop,
  onToggleLoop,
}: PlayerProps) {
  return (
    <div className="flex items-center gap-4">
      {/* Play/Pause */}
      <button
        onClick={isPlaying ? onStop : onPlay}
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full",
          "bg-[var(--accent)] text-[var(--accent-foreground)]",
          "transition-all hover:bg-[var(--accent-hover)] hover:scale-105 active:scale-95",
          "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        )}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <Pause className="h-5 w-5 fill-current" aria-hidden="true" />
        ) : (
          <Play className="h-5 w-5 fill-current ml-0.5" aria-hidden="true" />
        )}
      </button>

      {/* Time display */}
      <div className="tabular-nums text-sm text-[var(--text-secondary)]">
        <span className="text-[var(--text-primary)]">
          {formatTime(currentTime)}
        </span>
        {" / "}
        {formatTime(duration)}
      </div>

      {/* Loop toggle */}
      <button
        onClick={onToggleLoop}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full transition-all active:scale-95",
          "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
          looping
            ? "bg-[var(--accent-surface)] text-[var(--accent)]"
            : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
        )}
        aria-label={looping ? "Disable loop" : "Enable loop"}
      >
        <Repeat className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
