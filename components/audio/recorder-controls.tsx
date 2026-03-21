"use client";

import { Mic, Square, Headphones, RotateCcw, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { RecorderStatus } from "@/hooks/use-recorder";

interface RecorderControlsProps {
  status: RecorderStatus;
  duration: number;
  error: string | null;
  onRequestMic: () => void;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  monitorEnabled?: boolean;
  onToggleMonitor?: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, "0")}.${ms}`;
}

export function RecorderControls({
  status,
  duration,
  error,
  onRequestMic,
  onStart,
  onStop,
  onReset,
  monitorEnabled = false,
  onToggleMonitor,
}: RecorderControlsProps) {
  // Idle state — big CTA to get started
  if (status === "idle" || status === "requesting") {
    return (
      <div className="flex flex-col items-center gap-6">
        <button
          onClick={onRequestMic}
          disabled={status === "requesting"}
          className={cn(
            "flex h-20 w-20 items-center justify-center rounded-full",
            "bg-[var(--accent)] text-[var(--accent-foreground)]",
            "transition-all hover:bg-[var(--accent-hover)] hover:scale-105 active:scale-95",
            "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "shadow-[var(--shadow-lg)]"
          )}
          aria-label={
            status === "requesting" ? "Requesting microphone..." : "Start recording"
          }
        >
          <Mic className="h-8 w-8" aria-hidden="true" />
        </button>
        <p className="text-sm text-[var(--text-secondary)]">
          {status === "requesting"
            ? "Waiting for microphone access..."
            : "Tap to record"}
        </p>
      </div>
    );
  }

  // Error state — actionable recovery
  if (status === "error") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-[var(--destructive)]/20 bg-[var(--destructive-surface)] px-6 py-8 text-center">
        <AlertCircle
          className="h-8 w-8 text-[var(--destructive)]"
          aria-hidden="true"
        />
        <div>
          <h3 className="text-sm font-medium text-[var(--destructive)]">
            Can&apos;t access microphone
          </h3>
          <p className="mt-1 max-w-sm text-xs text-[var(--text-secondary)]">
            {error}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRequestMic}>
          Try again
        </Button>
      </div>
    );
  }

  // Recording + stopped states — controls bar
  const isRecording = status === "recording";

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Timer */}
      <div
        className={cn(
          "tabular-nums text-2xl font-medium tracking-tight",
          isRecording ? "text-[var(--recording-pulse)]" : "text-[var(--text-primary)]"
        )}
        role="timer"
        aria-label={`Recording duration: ${formatTime(duration)}`}
      >
        {formatTime(duration)}
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-4">
        {/* Monitor toggle */}
        {onToggleMonitor && (
          <button
            onClick={onToggleMonitor}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full transition-colors",
              "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
              monitorEnabled
                ? "bg-[var(--accent-surface)] text-[var(--accent)]"
                : "bg-[var(--bg-interactive)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            )}
            aria-label={monitorEnabled ? "Disable headphone monitoring" : "Enable headphone monitoring"}
            title={monitorEnabled ? "Monitoring on" : "Monitoring off"}
          >
            <Headphones className="h-5 w-5" aria-hidden="true" />
          </button>
        )}

        {/* Record / Stop button */}
        {isRecording ? (
          <button
            onClick={onStop}
            className={cn(
              "flex h-16 w-16 items-center justify-center rounded-full",
              "bg-[var(--recording-pulse)] text-[var(--text-primary)]",
              "transition-all hover:bg-[var(--recording-hover)] active:scale-95",
              "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
              "animate-[pulse-recording_2s_ease-in-out_infinite]"
            )}
            aria-label="Stop recording"
          >
            <Square className="h-6 w-6 fill-current" aria-hidden="true" />
          </button>
        ) : (
          <button
            onClick={onStart}
            className={cn(
              "flex h-16 w-16 items-center justify-center rounded-full",
              "bg-[var(--accent)] text-[var(--accent-foreground)]",
              "transition-all hover:bg-[var(--accent-hover)] hover:scale-105 active:scale-95",
              "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
              "shadow-[var(--shadow-lg)]"
            )}
            aria-label={status === "stopped" ? "Record again" : "Start recording"}
          >
            <Mic className="h-6 w-6" aria-hidden="true" />
          </button>
        )}

        {/* Reset button (only when stopped) */}
        {status === "stopped" && (
          <button
            onClick={onReset}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full",
              "bg-[var(--bg-interactive)] text-[var(--text-tertiary)]",
              "transition-colors hover:text-[var(--text-secondary)]",
              "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            )}
            aria-label="Discard recording"
          >
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Status text */}
      <p className="text-xs text-[var(--text-secondary)]">
        {isRecording
          ? "Recording..."
          : status === "stopped"
            ? "Recording complete"
            : "Ready to record"}
      </p>
    </div>
  );
}
