"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export type RecorderStatus =
  | "idle"
  | "requesting"
  | "ready"
  | "recording"
  | "stopped"
  | "error";

export interface UseRecorderReturn {
  status: RecorderStatus;
  /** Raw recorded audio blob (available after stop) */
  blob: Blob | null;
  /** Recording duration in seconds */
  duration: number;
  /** Error message (available in error state) */
  error: string | null;
  /** Active MediaStream (available after mic granted) */
  stream: MediaStream | null;
  /** Request mic permission */
  requestMic: () => Promise<void>;
  /** Start recording (must call requestMic first) */
  startRecording: () => void;
  /** Stop recording */
  stopRecording: () => void;
  /** Reset to ready state (keeps stream alive for re-recording) */
  reset: () => void;
}

export function useRecorder(): UseRecorderReturn {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
      }
    };
  }, [stream]);

  const requestMic = useCallback(async () => {
    setStatus("requesting");
    setError(null);

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      setStream(mediaStream);
      setStatus("ready");
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone access denied. Open your browser settings to allow mic access for this site."
          : `Could not access microphone: ${err instanceof Error ? err.message : "Unknown error"}`;
      setError(message);
      setStatus("error");
    }
  }, []);

  const startRecording = useCallback(() => {
    if (!stream) return;

    if (timerRef.current) clearInterval(timerRef.current);
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const audioBlob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      setBlob(audioBlob);
      setStatus("stopped");
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    recorder.start(100);
    startTimeRef.current = Date.now();
    setDuration(0);
    setBlob(null);
    setStatus("recording");

    // Timer updates every 100ms
    timerRef.current = setInterval(() => {
      setDuration((Date.now() - startTimeRef.current) / 1000);
    }, 100);
  }, [stream]);

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const reset = useCallback(() => {
    setBlob(null);
    setDuration(0);
    setError(null);
    if (stream) {
      setStatus("ready");
    } else {
      setStatus("idle");
    }
  }, [stream]);

  return {
    status,
    blob,
    duration,
    error,
    stream,
    requestMic,
    startRecording,
    stopRecording,
    reset,
  };
}
