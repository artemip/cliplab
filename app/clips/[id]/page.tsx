"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Share2, Clock, Music } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Waveform } from "@/components/audio/waveform";
import { Player } from "@/components/audio/player";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTime, getRelativeTime } from "@/lib/format";
import { FILTER_REGISTRY } from "@/lib/audio/filters";
import type { Clip } from "@/lib/db/schema";

const filterDisplayNames = Object.fromEntries(
  FILTER_REGISTRY.map((f) => [f.id, f.name])
);

export default function ClipDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [clip, setClip] = useState<Clip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [is404, setIs404] = useState(false);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [looping, setLooping] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/clips/${id}`);
        if (!res.ok) {
          if (res.status === 404) {
            setIs404(true);
            setError("Clip not found");
          } else {
            setError("Failed to load clip");
          }
          return;
        }
        setClip(await res.json());
      } catch {
        setError("Failed to load clip");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // HTML Audio playback with rAF for smooth progress
  const progressRafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!clip) return;
    const el = new Audio(`/api/clips/${clip.id}/audio`);
    audioRef.current = el;

    el.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    el.onpause = () => {
      setIsPlaying(false);
      if (progressRafRef.current) cancelAnimationFrame(progressRafRef.current);
    };
    el.onplay = () => {
      setIsPlaying(true);
      // Smooth progress via rAF (not ontimeupdate which fires ~4x/sec)
      const tick = () => {
        if (audioRef.current) {
          setCurrentTime(audioRef.current.currentTime);
        }
        progressRafRef.current = requestAnimationFrame(tick);
      };
      progressRafRef.current = requestAnimationFrame(tick);
    };

    return () => {
      el.pause();
      el.src = "";
      if (progressRafRef.current) cancelAnimationFrame(progressRafRef.current);
    };
  }, [clip]);

  const handlePlay = () => {
    if (!audioRef.current) return;
    audioRef.current.loop = looping;
    audioRef.current.play().catch((e) => {
      if (e.name !== "AbortError") console.warn("[ClipLab] Playback failed:", e);
    });
  };

  const handleStop = () => {
    if (!audioRef.current) return;
    audioRef.current.pause();
  };

  const handleSeek = (pos: number) => {
    if (!audioRef.current || !clip) return;
    audioRef.current.currentTime = pos * clip.duration;
    setCurrentTime(audioRef.current.currentTime);
  };

  const handleToggleLoop = () => {
    const next = !looping;
    setLooping(next);
    if (audioRef.current) audioRef.current.loop = next;
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied!");
    } catch {
      toast.error("Could not copy link");
    }
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-4 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <Skeleton className="mb-6 h-5 w-24" />
        <Skeleton className="mb-4 h-[140px] w-full rounded-lg" />
        <Skeleton className="mb-6 h-[52px] w-full rounded-lg" />
        <div className="flex justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-11 w-20 rounded-lg" />
        </div>
      </main>
    );
  }

  if (error || !clip) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center px-4 text-center">
        <h1 className="text-xl font-semibold">{error || "Clip not found"}</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {is404
            ? "This clip may have been deleted or the link is incorrect."
            : "Something went wrong loading this clip."}
        </p>
        <div className="mt-4 flex items-center gap-3">
          {!is404 && (
            <button
              onClick={() => window.location.reload()}
              className="min-h-[44px] px-3 text-sm text-[var(--accent)] hover:text-[var(--accent-hover)] active:scale-95 transition-all"
            >
              Try again
            </button>
          )}
          <Link
            href="/"
            className="min-h-[44px] flex items-center text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Back to clips
          </Link>
        </div>
      </main>
    );
  }

  const progress = clip.duration > 0 ? currentTime / clip.duration : 0;
  const peaks = clip.peaks as number[] | null;
  const filterConfig = clip.filterConfig as Array<{ id: string; params: Record<string, number> }> | null;
  const timeAgo = getRelativeTime(clip.createdAt);

  return (
    <main className="mx-auto max-w-2xl px-4 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      {/* Header */}
      <Link
        href="/"
        className="mb-6 inline-flex min-h-[44px] items-center gap-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to clips
      </Link>

      {/* Waveform */}
      <div className="mb-4">
        <Waveform
          mode="static"
          peaks={peaks}
          progress={progress}
          onSeek={handleSeek}
          height={140}
        />
      </div>

      {/* Player */}
      <div className="mb-6">
        <Player
          isPlaying={isPlaying}
          looping={looping}
          currentTime={currentTime}
          duration={clip.duration}
          onPlay={handlePlay}
          onStop={handleStop}
          onToggleLoop={handleToggleLoop}
        />
      </div>

      {/* Metadata */}
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-balance">{clip.name}</h1>
            <div className="mt-1 flex items-center gap-3 text-xs text-[var(--text-secondary)]">
              <span className="flex items-center gap-1 tabular-nums">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {formatTime(clip.duration)}
              </span>
              <span>{timeAgo}</span>
            </div>
          </div>
          <button
            onClick={handleShare}
            className={cn(
              "flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm",
              "bg-[var(--bg-interactive)] text-[var(--text-secondary)]",
              "transition-colors hover:text-[var(--text-primary)] active:scale-95",
              "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            )}
            aria-label="Share — copy link"
          >
            <Share2 className="h-4 w-4" aria-hidden="true" />
            Share
          </button>
        </div>

        {/* Filter badges */}
        {filterConfig && filterConfig.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <Music className="h-3.5 w-3.5 text-[var(--text-tertiary)] mt-0.5" aria-hidden="true" />
            {filterConfig.map((f) => (
              <Badge key={f.id} variant="secondary" className="text-xs">
                {filterDisplayNames[f.id] || f.id}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
