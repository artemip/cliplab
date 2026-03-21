"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useRecorder } from "@/hooks/use-recorder";
import { RecorderControls } from "@/components/audio/recorder-controls";
import { Waveform } from "@/components/audio/waveform";
import { AudioEngine } from "@/lib/audio/engine";
import { generatePeaks } from "@/lib/audio/utils";

export default function RecordPage() {
  const recorder = useRecorder();
  const engineRef = useRef<AudioEngine | null>(null);
  const [analyserData, setAnalyserData] = useState<Float32Array | null>(null);
  const [monitorEnabled, setMonitorEnabled] = useState(false);
  const [recordedPeaks, setRecordedPeaks] = useState<number[] | null>(null);
  const rafRef = useRef<number | null>(null);

  // Create engine on mount
  useEffect(() => {
    const engine = new AudioEngine();
    engineRef.current = engine;
    return () => engine.dispose();
  }, []);

  // Connect stream to engine when mic is ready
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !recorder.stream) return;

    engine.connectStream(recorder.stream);

    // Set up analyser data reading
    const analyser = engine.analyserNode;
    const dataArray = new Float32Array(analyser.fftSize);

    const readAnalyser = () => {
      analyser.getFloatTimeDomainData(dataArray);
      // Trigger re-render with new reference so React sees the change
      setAnalyserData(new Float32Array(dataArray));
      rafRef.current = requestAnimationFrame(readAnalyser);
    };

    rafRef.current = requestAnimationFrame(readAnalyser);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      engine.disconnectSource();
    };
  }, [recorder.stream]);

  // Generate peaks from recorded blob
  useEffect(() => {
    if (recorder.status !== "stopped" || !recorder.blob) return;

    const engine = engineRef.current;
    if (!engine) return;

    (async () => {
      try {
        const arrayBuffer = await recorder.blob!.arrayBuffer();
        const audioBuffer = await engine.context.decodeAudioData(arrayBuffer);
        const peaks = generatePeaks(audioBuffer, 200);
        setRecordedPeaks(peaks);
      } catch {
        // Decoding may fail — show empty waveform
        setRecordedPeaks(null);
      }
    })();
  }, [recorder.status, recorder.blob]);

  // Reset peaks when re-recording
  useEffect(() => {
    if (recorder.status === "ready" || recorder.status === "recording") {
      setRecordedPeaks(null);
    }
  }, [recorder.status]);

  const toggleMonitor = () => {
    const next = !monitorEnabled;
    setMonitorEnabled(next);
    engineRef.current?.setMonitor(next);
  };

  const isLive =
    recorder.status === "recording" || recorder.status === "ready";
  const isStopped = recorder.status === "stopped";

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 py-6">
      {/* Header */}
      <Link
        href="/"
        className="mb-6 inline-flex min-h-[44px] items-center gap-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to clips
      </Link>

      {/* Waveform area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8">
        {isLive && (
          <Waveform
            mode="live"
            analyserData={analyserData}
            height={140}
            className="w-full"
          />
        )}

        {isStopped && (
          <Waveform
            mode="static"
            peaks={recordedPeaks}
            height={140}
            className="w-full"
          />
        )}

        {(recorder.status === "idle" ||
          recorder.status === "requesting" ||
          recorder.status === "error") && (
          <div className="w-full">
            <Waveform mode="static" peaks={null} height={140} />
          </div>
        )}

        {/* Controls — fixed bottom on mobile */}
        <div className="w-full pb-safe">
          <RecorderControls
            status={recorder.status}
            duration={recorder.duration}
            error={recorder.error}
            onRequestMic={recorder.requestMic}
            onStart={recorder.startRecording}
            onStop={recorder.stopRecording}
            onReset={recorder.reset}
            monitorEnabled={monitorEnabled}
            onToggleMonitor={toggleMonitor}
          />
        </div>
      </div>
    </main>
  );
}
