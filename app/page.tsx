"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Mic, Play, Pause, Clock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Waveform } from "@/components/audio/waveform";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Clip } from "@/lib/db/schema";

function getRelativeTime(date: Date | string | number): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function FeedPage() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/clips");
        if (!res.ok) throw new Error("Failed to load clips");
        setClips(await res.json());
      } catch {
        setError("Could not load clips");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handlePlay = (clipId: string) => {
    // Stop current
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }

    if (playingId === clipId) {
      setPlayingId(null);
      return;
    }

    const audio = new Audio(`/api/clips/${clipId}/audio`);
    audioRef.current = audio;
    audio.onended = () => setPlayingId(null);
    audio.play();
    setPlayingId(clipId);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <header className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-balance">ClipLab</h1>
          <p className="mt-1 text-[var(--text-secondary)]">
            Record, filter, and share audio clips
          </p>
        </div>
        <Link
          href="/record"
          className={buttonVariants({ variant: "accent", size: "lg" })}
        >
          <Mic className="h-4 w-4" aria-hidden="true" />
          Record
        </Link>
      </header>

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-[var(--destructive)]/20 bg-[var(--destructive-surface)] px-6 py-8 text-center">
          <p className="text-sm text-[var(--destructive)]">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Try again
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && clips.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] px-8 py-16 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-surface)]">
            <Mic className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-medium">No clips yet</h2>
          <p className="mt-2 max-w-sm text-sm text-[var(--text-secondary)]">
            Record your first audio clip, apply filters, and share it with the
            world.
          </p>
          <Link
            href="/record"
            className={cn("mt-6", buttonVariants({ variant: "accent", size: "lg" }))}
          >
            <Mic className="h-4 w-4" aria-hidden="true" />
            Record your first clip
          </Link>
        </div>
      )}

      {/* Clip list */}
      {!loading && !error && clips.length > 0 && (
        <div className="space-y-3">
          {clips.map((clip) => {
            const isThisPlaying = playingId === clip.id;
            const peaks = clip.peaks as number[] | null;
            const filterConfig = clip.filterConfig as Array<{ id: string }> | null;

            return (
              <div
                key={clip.id}
                className="group rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4 transition-colors hover:border-[var(--border-hover)]"
              >
                <div className="flex items-center gap-4">
                  {/* Play button */}
                  <button
                    onClick={() => handlePlay(clip.id)}
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
                      "bg-[var(--accent)] text-[var(--accent-foreground)]",
                      "transition-all hover:bg-[var(--accent-hover)] active:scale-95",
                      "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                    )}
                    aria-label={isThisPlaying ? `Pause ${clip.name}` : `Play ${clip.name}`}
                  >
                    {isThisPlaying ? (
                      <Pause className="h-4 w-4 fill-current" aria-hidden="true" />
                    ) : (
                      <Play className="h-4 w-4 fill-current ml-0.5" aria-hidden="true" />
                    )}
                  </button>

                  {/* Info */}
                  <Link href={`/clips/${clip.id}`} className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="truncate text-sm font-medium text-[var(--text-primary)]">
                        {clip.name}
                      </h3>
                      <span className="ml-2 shrink-0 tabular-nums text-xs text-[var(--text-tertiary)]">
                        {formatTime(clip.duration)}
                      </span>
                    </div>

                    {/* Mini waveform */}
                    <div className="mt-2">
                      <Waveform mode="static" peaks={peaks} height={40} />
                    </div>

                    {/* Metadata row */}
                    <div className="mt-2 flex items-center gap-2">
                      <span className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {getRelativeTime(clip.createdAt)}
                      </span>
                      {filterConfig && filterConfig.length > 0 && (
                        <div className="flex gap-1">
                          {filterConfig.map((f) => (
                            <Badge key={f.id} variant="secondary" className="text-[10px] px-1.5 py-0">
                              {f.id}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
