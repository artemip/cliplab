"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useRecorder } from "@/hooks/use-recorder";
import { useAudioEngine } from "@/hooks/use-audio-engine";
import { RecorderControls } from "@/components/audio/recorder-controls";
import { Waveform } from "@/components/audio/waveform";
import { Player } from "@/components/audio/player";
import { FilterRack } from "@/components/audio/filter-rack";
import { AudioEngine } from "@/lib/audio/engine";
import { generatePeaks } from "@/lib/audio/utils";

export default function RecordPage() {
  const recorder = useRecorder();
  const engine = useAudioEngine();
  const liveEngineRef = useRef<AudioEngine | null>(null);
  const [liveAnalyserData, setLiveAnalyserData] = useState<Float32Array | null>(null);
  const [recordedPeaks, setRecordedPeaks] = useState<number[] | null>(null);
  const rafRef = useRef<number | null>(null);

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
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 py-6 pb-[env(safe-area-inset-bottom)]">
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

      {/* Filter rack (only when stopped) */}
      {isStopped && (
        <div className="flex-1">
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
    </main>
  );
}
