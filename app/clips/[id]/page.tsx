"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Share2, Clock, Music } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Waveform } from "@/components/audio/waveform";
import { Player } from "@/components/audio/player";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTime } from "@/lib/format";
import type { Clip } from "@/lib/db/schema";

export default function ClipDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [clip, setClip] = useState<Clip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [looping, setLooping] = useState(false);
  const audioRef = useState<HTMLAudioElement | null>(null);
  const [audio] = audioRef;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/clips/${id}`);
        if (!res.ok) {
          setError(res.status === 404 ? "Clip not found" : "Failed to load clip");
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

  // Simple HTML Audio playback
  useEffect(() => {
    if (!clip) return;
    const el = new Audio(`/api/clips/${clip.id}/audio`);
    audioRef[1](el);

    el.ontimeupdate = () => setCurrentTime(el.currentTime);
    el.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    el.onpause = () => setIsPlaying(false);
    el.onplay = () => setIsPlaying(true);

    return () => {
      el.pause();
      el.src = "";
    };
  }, [clip]);

  const handlePlay = () => {
    if (!audio) return;
    audio.loop = looping;
    audio.play();
  };

  const handleStop = () => {
    if (!audio) return;
    audio.pause();
  };

  const handleSeek = (pos: number) => {
    if (!audio || !clip) return;
    audio.currentTime = pos * clip.duration;
    setCurrentTime(audio.currentTime);
  };

  const handleToggleLoop = () => {
    const next = !looping;
    setLooping(next);
    if (audio) audio.loop = next;
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
        <Skeleton className="mb-4 h-[120px] w-full rounded-lg" />
        <Skeleton className="mb-4 h-[52px] w-full rounded-lg" />
        <Skeleton className="h-6 w-48" />
      </main>
    );
  }

  if (error || !clip) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center px-4 text-center">
        <h1 className="text-xl font-semibold">{error || "Clip not found"}</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          This clip may have been deleted or the link is incorrect.
        </p>
        <Link
          href="/"
          className="mt-4 text-sm text-[var(--accent)] hover:text-[var(--accent-hover)]"
        >
          Back to clips
        </Link>
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
              <span className="flex items-center gap-1">
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
            aria-label="Copy share link"
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
                {f.id}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

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
