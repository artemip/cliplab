/**
 * MediaRecorder wrapper — records raw audio from the mic.
 * Factory function pattern (not a class). Returns a disposable recorder.
 */

export type RecorderStatus =
  | "idle"
  | "requesting"
  | "ready"
  | "recording"
  | "stopped";

export interface RecorderState {
  status: RecorderStatus;
  blob: Blob | null;
  duration: number;
  error: string | null;
  stream: MediaStream | null;
}

type StateListener = (state: RecorderState) => void;

export function createRecorder() {
  let state: RecorderState = {
    status: "idle",
    blob: null,
    duration: 0,
    error: null,
    stream: null,
  };

  let mediaRecorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let timerInterval: ReturnType<typeof setInterval> | null = null;
  let startTime = 0;
  const listeners = new Set<StateListener>();

  function setState(patch: Partial<RecorderState>) {
    state = { ...state, ...patch };
    for (const listener of listeners) {
      listener(state);
    }
  }

  async function requestMic(): Promise<MediaStream> {
    setState({ status: "requesting", error: null });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setState({ status: "ready", stream });
      return stream;
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone access denied. Check your browser settings to allow mic access for this site."
          : `Could not access microphone: ${err instanceof Error ? err.message : "Unknown error"}`;

      setState({ status: "idle", error: message });
      throw new Error(message);
    }
  }

  function start() {
    if (state.status !== "ready" || !state.stream) {
      throw new Error("Must request mic before recording");
    }

    chunks = [];
    mediaRecorder = new MediaRecorder(state.stream);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: mediaRecorder?.mimeType ?? "audio/webm" });
      setState({ status: "stopped", blob });
      stopTimer();
    };

    mediaRecorder.start(100); // Collect data every 100ms
    startTime = Date.now();
    startTimer();
    setState({ status: "recording", blob: null, duration: 0 });
  }

  function stop(): void {
    if (state.status !== "recording" || !mediaRecorder) {
      throw new Error("Not currently recording");
    }
    mediaRecorder.stop();
  }

  function reset(): void {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    stopTimer();
    chunks = [];
    mediaRecorder = null;
    // Keep stream alive for re-recording without re-requesting permission
    setState({
      status: state.stream ? "ready" : "idle",
      blob: null,
      duration: 0,
      error: null,
    });
  }

  function dispose(): void {
    stopTimer();
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    if (state.stream) {
      for (const track of state.stream.getTracks()) {
        track.stop();
      }
    }
    setState({ status: "idle", blob: null, stream: null, duration: 0 });
  }

  function startTimer() {
    stopTimer();
    timerInterval = setInterval(() => {
      setState({ duration: (Date.now() - startTime) / 1000 });
    }, 100);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function getState(): RecorderState {
    return state;
  }

  function onStateChange(cb: StateListener): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  return {
    requestMic,
    start,
    stop,
    reset,
    dispose,
    getState,
    onStateChange,
  };
}

export type Recorder = ReturnType<typeof createRecorder>;
