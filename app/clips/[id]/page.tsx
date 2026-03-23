"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Share2, Clock, Music, Save, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Waveform } from "@/components/audio/waveform";
import { Player } from "@/components/audio/player";
import { FilterRack } from "@/components/audio/filter-rack";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatTime, getRelativeTime } from "@/lib/format";
import { FILTER_REGISTRY } from "@/lib/audio/filters";
import { useAudioEngine } from "@/hooks/use-audio-engine";
import { audioBufferToWav } from "@/lib/audio/utils";
import type { Clip } from "@/lib/db/schema";

const filterDisplayNames = Object.fromEntries(
  FILTER_REGISTRY.map((f) => [f.id, f.name])
);

export default function ClipDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [clip, setClip] = useState<Clip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [is404, setIs404] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const engine = useAudioEngine();
  const blobRef = useRef<Blob | null>(null);
  const rawBlobRef = useRef<Blob | null>(null);

  // Fetch clip data
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/clips/${id}`);
        if (!res.ok) {
          if (res.status === 404) setIs404(true);
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

  // Fetch audio blobs for playback + editing
  useEffect(() => {
    if (!clip) return;
    (async () => {
      try {
        const [audioRes, rawRes] = await Promise.all([
          fetch(`/api/clips/${clip.id}/audio`),
          fetch(`/api/clips/${clip.id}/raw`).catch(() => null),
        ]);
        blobRef.current = await audioRes.blob();
        if (rawRes?.ok) {
          rawBlobRef.current = await rawRes.blob();
        }
      } catch {
        // Fetch failed — playback may not work
      }
    })();
  }, [clip]);

  const handlePlay = async () => {
    if (!blobRef.current) return;
    await engine.play(blobRef.current);
  };

  const handleSeek = (pos: number) => {
    engine.seek(pos);
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied!");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const handleDownload = () => {
    if (!blobRef.current || !clip) return;
    const url = URL.createObjectURL(blobRef.current);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${clip.name}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveEdited = async () => {
    // Use raw audio if available (re-render from unfiltered source)
    const sourceBlob = rawBlobRef.current || blobRef.current;
    if (!sourceBlob || !clip) return;
    setSaving(true);
    try {
      const rendered = await engine.renderWithFilters(sourceBlob);
      const wavBlob = audioBufferToWav(rendered);

      const formData = new FormData();
      formData.append("audio", wavBlob, `${clip.name}.wav`);
      if (rawBlobRef.current) {
        formData.append("raw", rawBlobRef.current, `${clip.name}_raw.wav`);
      }
      formData.append("name", clip.name);
      formData.append("duration", String(rendered.duration));
      const activeFilters = engine.filters
        .filter((f) => f.enabled)
        .map((f) => ({ id: f.definition.id, params: f.params }));
      if (activeFilters.length > 0) {
        formData.append("filterConfig", JSON.stringify(activeFilters));
      }

      const res = await fetch("/api/clips", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Save failed");

      const newClip = await res.json();
      toast.success("New version saved!");
      router.push(`/clips/${newClip.id}`);
    } catch {
      toast.error("Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const progress = engine.duration > 0 ? engine.currentTime / engine.duration : 0;

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

  const peaks = clip.peaks as number[] | null;
  const filterConfig = clip.filterConfig as Array<{ id: string; params: Record<string, number> }> | null;
  const timeAgo = getRelativeTime(clip.createdAt);
  const hasActiveFilters = engine.filters.some((f) => f.enabled);

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

      {/* Title + actions row */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-balance">{clip.name}</h1>
          <div className="mt-1 flex items-center gap-3 text-xs text-[var(--text-secondary)]">
            <span className="flex items-center gap-1 tabular-nums">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {formatTime(clip.duration)}
            </span>
            <span>{timeAgo}</span>
          </div>
          {/* Filter badges */}
          {filterConfig && filterConfig.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {filterConfig.map((f) => (
                <Badge key={f.id} variant="secondary" className="text-xs">
                  {filterDisplayNames[f.id] || f.id}
                </Badge>
              ))}
            </div>
          )}
        </div>
        {/* Share + Download together */}
        <div className="flex items-center gap-1.5">
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
          <button
            onClick={handleDownload}
            className={cn(
              "flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm",
              "bg-[var(--bg-interactive)] text-[var(--text-secondary)]",
              "transition-colors hover:text-[var(--text-primary)] active:scale-95",
              "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            )}
            aria-label="Download clip"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Waveform */}
      <div className="mb-4">
        <Waveform
          mode="static"
          peaks={peaks}
          progress={engine.isPlaying ? progress : 0}
          onSeek={handleSeek}
          height={140}
        />
      </div>

      {/* Player */}
      <div className="mb-6">
        <Player
          isPlaying={engine.isPlaying}
          looping={engine.looping}
          currentTime={engine.currentTime}
          duration={engine.duration || clip.duration}
          onPlay={handlePlay}
          onStop={engine.stop}
          onToggleLoop={engine.toggleLoop}
        />
      </div>

      {/* Edit toggle */}
      <div className="mb-4">
        <button
          onClick={() => {
            if (!editing && filterConfig) {
              // Pre-apply saved filter config when entering edit mode
              for (const fc of filterConfig) {
                engine.toggleFilter(fc.id);
                for (const [key, val] of Object.entries(fc.params)) {
                  engine.updateParam(fc.id, key, val);
                }
              }
            }
            setEditing(!editing);
          }}
          className={cn(
            "text-sm font-medium transition-colors",
            editing
              ? "text-[var(--accent)] hover:text-[var(--accent-hover)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          )}
        >
          {editing ? "Done editing" : "Edit →"}
        </button>
      </div>

      {/* Filter rack + save controls (editing mode) */}
      {editing && (
        <>
          {/* Save controls at top of edit area */}
          {hasActiveFilters && (
            <div className="mb-4 flex gap-2">
              <Button
                variant="accent"
                size="lg"
                onClick={handleSaveEdited}
                disabled={saving}
                className="flex-1"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                {saving ? "Saving..." : "Save as new clip"}
              </Button>
            </div>
          )}

          <div className="mb-4">
            <FilterRack
              filters={engine.filters}
              presets={engine.presets}
              bypassed={engine.bypassed}
              activePreset={engine.activePreset}
              onToggleFilter={engine.toggleFilter}
              onUpdateParam={engine.updateParam}
              onResetFilter={engine.resetFilter}
              onToggleBypass={engine.toggleBypass}
              onApplyPreset={engine.applyPreset}
            />
          </div>
        </>
      )}
    </main>
  );
}
