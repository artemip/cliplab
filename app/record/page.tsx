"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRecorder } from "@/hooks/use-recorder";
import { useAudioEngine } from "@/hooks/use-audio-engine";
import { RecorderControls } from "@/components/audio/recorder-controls";
import { Waveform } from "@/components/audio/waveform";
import { Player } from "@/components/audio/player";
import { FilterRack } from "@/components/audio/filter-rack";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AudioEngine } from "@/lib/audio/engine";
import { generatePeaks, audioBufferToWav } from "@/lib/audio/utils";

export default function RecordPage() {
  const recorder = useRecorder();
  const engine = useAudioEngine();
  const liveEngineRef = useRef<AudioEngine | null>(null);
  const [liveAnalyserData, setLiveAnalyserData] = useState<Float32Array | null>(null);
  const [recordedPeaks, setRecordedPeaks] = useState<number[] | null>(null);
  const [clipName, setClipName] = useState("Clip 1");
  const [uploading, setUploading] = useState(false);
  const clipCountRef = useRef(2); // Next clip name after "Clip 1"
  const rafRef = useRef<number | null>(null);
  const router = useRouter();

  // Separate engine for live mic monitoring during recording
  useEffect(() => {
    const liveEngine = new AudioEngine();
    liveEngineRef.current = liveEngine;
    return () => liveEngine.dispose();
  }, []);

  // Connect mic stream for live waveform
  useEffect(() => {
    const liveEngine = liveEngineRef.current;
    if (!liveEngine || !recorder.stream) return;

    // Resume AudioContext (requires user gesture — mic grant counts)
    liveEngine.resume();
    liveEngine.connectStream(recorder.stream);

    const analyser = liveEngine.analyserNode;
    const bufA = new Float32Array(analyser.fftSize);
    const bufB = new Float32Array(analyser.fftSize);
    let useA = true;

    const read = () => {
      const buf = useA ? bufA : bufB;
      analyser.getFloatTimeDomainData(buf);
      setLiveAnalyserData(buf);
      useA = !useA;
      rafRef.current = requestAnimationFrame(read);
    };

    rafRef.current = requestAnimationFrame(read);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      liveEngine.disconnectSource();
    };
  }, [recorder.stream]);

  // Generate peaks when recording stops
  useEffect(() => {
    if (recorder.status !== "stopped" || !recorder.blob) return;
    let cancelled = false;

    (async () => {
      try {
        const liveEngine = liveEngineRef.current;
        if (!liveEngine) return;
        const ab = await recorder.blob!.arrayBuffer();
        if (cancelled) return;
        const audioBuffer = await liveEngine.context.decodeAudioData(ab);
        if (cancelled) return;
        setRecordedPeaks(generatePeaks(audioBuffer, 200));
      } catch {
        if (!cancelled) setRecordedPeaks(null);
      }
    })();

    return () => { cancelled = true; };
  }, [recorder.status, recorder.blob]);

  const handleUpload = async () => {
    if (!recorder.blob) return;
    setUploading(true);
    try {
      // Render with filters baked in
      const rendered = await engine.renderWithFilters(recorder.blob);
      const wavBlob = audioBufferToWav(rendered);

      // Build form data
      const formData = new FormData();
      formData.append("audio", wavBlob, `${clipName}.wav`);
      formData.append("name", clipName);
      formData.append("duration", String(rendered.duration));
      const activeFilters = engine.filters
        .filter((f) => f.enabled)
        .map((f) => ({ id: f.definition.id, params: f.params }));
      if (activeFilters.length > 0) {
        formData.append("filterConfig", JSON.stringify(activeFilters));
      }

      const res = await fetch("/api/clips", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");

      const clip = await res.json();
      toast.success("Clip saved!");
      // Prepare next clip name for if user comes back
      setClipName(`Clip ${clipCountRef.current}`);
      clipCountRef.current += 1;
      router.push(`/clips/${clip.id}`);
    } catch (err) {
      toast.error("Failed to save clip. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const handlePlay = async () => {
    if (!recorder.blob) return;
    await engine.play(recorder.blob);
  };

  // Keyboard: Space toggles record/play
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();

      if (recorder.status === "recording") {
        recorder.stopRecording();
      } else if (recorder.status === "idle") {
        recorder.requestMic();
      } else if (recorder.status === "ready") {
        recorder.startRecording();
      } else if (recorder.status === "stopped") {
        if (engine.isPlaying) {
          engine.stop();
        } else {
          handlePlay();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [recorder.status, engine.isPlaying]);

  const isLive = recorder.status === "recording" || recorder.status === "ready";
  const isStopped = recorder.status === "stopped";
  const displayPeaks = isStopped ? recordedPeaks : null;
  const progress = engine.duration > 0 ? engine.currentTime / engine.duration : 0;

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      {/* Header */}
      <Link
        href="/"
        className="mb-4 inline-flex min-h-[44px] items-center gap-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to clips
      </Link>

      {/* Waveform */}
      <div className="mb-4">
        {isLive ? (
          <Waveform mode="live" analyserData={liveAnalyserData} height={120} />
        ) : isStopped ? (
          <Waveform
            mode="static"
            peaks={displayPeaks}
            progress={progress}
            onSeek={engine.seek}
            height={120}
          />
        ) : (
          <Waveform mode="static" peaks={null} height={120} />
        )}
      </div>

      {/* Player (only when stopped) */}
      {isStopped && (
        <div className="mb-6 flex justify-center">
          <Player
            isPlaying={engine.isPlaying}
            looping={engine.looping}
            currentTime={engine.currentTime}
            duration={engine.duration}
            onPlay={handlePlay}
            onStop={engine.stop}
            onToggleLoop={engine.toggleLoop}
          />
        </div>
      )}

      {/* Recorder controls */}
      <div className="mb-6">
        <RecorderControls
          status={recorder.status}
          duration={recorder.duration}
          error={recorder.error}
          onRequestMic={recorder.requestMic}
          onStart={recorder.startRecording}
          onStop={recorder.stopRecording}
          onReset={recorder.reset}
          monitorEnabled={engine.monitorEnabled}
          onToggleMonitor={engine.toggleMonitor}
        />
      </div>

      {/* Filter rack (only when stopped — experiment before saving) */}
      {isStopped && (
        <div className="mb-6">
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
      )}

      {/* Save clip (only when stopped — after filters are configured) */}
      {isStopped && (
        <div className="flex items-center gap-3">
          <Input
            value={clipName}
            onChange={(e) => setClipName(e.target.value)}
            placeholder="Name your clip"
            className="flex-1"
            aria-label="Clip name"
          />
          <Button
            variant="accent"
            size="lg"
            onClick={handleUpload}
            disabled={uploading || !clipName.trim()}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="h-4 w-4" aria-hidden="true" />
            )}
            {uploading ? "Saving..." : "Save clip"}
          </Button>
        </div>
      )}
    </main>
  );
}
