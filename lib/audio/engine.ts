/**
 * AudioEngine — manages the Web Audio API graph.
 *
 * Holds an AudioContext, builds filter chains, and handles
 * both real-time playback and offline rendering for export.
 */

import type { FilterDefinition } from "./filters";

export interface ActiveFilter {
  definition: FilterDefinition;
  params: Record<string, number>;
  enabled: boolean;
}

function safeDisconnect(node: AudioNode): void {
  try {
    node.disconnect();
  } catch {
    // Already disconnected — Web Audio API throws if node has no connections
  }
}

export class AudioEngine {
  private ctx: AudioContext;
  private source: AudioNode | null = null;
  private filterNodes: AudioNode[][] = [];
  private analyser: AnalyserNode;
  private monitorGain: GainNode;

  constructor() {
    this.ctx = new AudioContext();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.monitorGain = this.ctx.createGain();
    this.monitorGain.gain.value = 0;
    // Wire analyser → monitor → destination once. Only the source→filter→analyser
    // path gets rebuilt on filter changes.
    this.analyser.connect(this.monitorGain);
    this.monitorGain.connect(this.ctx.destination);
  }

  get context(): AudioContext {
    return this.ctx;
  }

  get analyserNode(): AnalyserNode {
    return this.analyser;
  }

  get sampleRate(): number {
    return this.ctx.sampleRate;
  }

  /** Ensure the AudioContext is running (browsers require user gesture). */
  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  /** Toggle monitor output (headphone monitoring during recording). */
  setMonitor(enabled: boolean): void {
    this.monitorGain.gain.value = enabled ? 1 : 0;
  }

  /** Connect a MediaStream (mic) as the audio source. */
  connectStream(stream: MediaStream): MediaStreamAudioSourceNode {
    this.disconnectSource();
    const source = this.ctx.createMediaStreamSource(stream);
    this.source = source;
    this.rebuildConnections();
    return source;
  }

  /**
   * Connect an AudioBuffer for playback.
   * Returns the BufferSourceNode so the caller can listen for `onended`.
   * Caller must explicitly call setMonitor(true) for audible output.
   */
  connectBuffer(buffer: AudioBuffer): AudioBufferSourceNode {
    this.disconnectSource();
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    this.source = source;
    this.rebuildConnections();
    return source;
  }

  /** Disconnect the current source and tear down filter nodes. */
  disconnectSource(): void {
    if (this.source) {
      safeDisconnect(this.source);
      this.source = null;
    }
    this.disconnectFilterNodes();
  }

  /**
   * Rebuild the audio graph with the given filter chain.
   * Disconnects everything and reconnects from scratch — O(n) where n < 10.
   */
  rebuildGraph(filters: ActiveFilter[]): void {
    this.disconnectFilterNodes();

    this.filterNodes = [];
    for (const filter of filters) {
      if (filter.enabled) {
        const nodes = filter.definition.createNodes(this.ctx, filter.params);
        this.filterNodes.push(nodes);
      }
    }

    this.rebuildConnections();
  }

  /** Render an AudioBuffer through the filter chain offline (bakes filters in). */
  async renderOffline(
    buffer: AudioBuffer,
    filters: ActiveFilter[]
  ): Promise<AudioBuffer> {
    // Extend buffer to capture delay echo tail.
    // At feedback level g, echoes decay as g^n per repeat. We need enough
    // repeats until amplitude drops below audible threshold (-60dB ≈ 0.001).
    // n = log(0.001) / log(g), then extra time = n * delayTime.
    const delayFilters = filters.filter(
      (f) => f.enabled && f.definition.id === "delay"
    );
    let extraSeconds = 0;
    for (const f of delayFilters) {
      const time = f.params.time ?? 0.3;
      const feedback = Math.min((f.params.feedback ?? 40) / 100, 0.99);
      const repeats =
        feedback > 0.01
          ? Math.ceil(Math.log(0.001) / Math.log(feedback))
          : 1;
      extraSeconds = Math.max(extraSeconds, time * repeats);
    }
    const extraFrames = Math.ceil(extraSeconds * buffer.sampleRate);

    const offlineCtx = new OfflineAudioContext(
      buffer.numberOfChannels,
      buffer.length + extraFrames,
      buffer.sampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;

    const enabledFilters = filters.filter((f) => f.enabled);
    let lastNode: AudioNode = source;

    for (const filter of enabledFilters) {
      const nodes = filter.definition.createNodes(offlineCtx, filter.params);
      lastNode.connect(nodes[0]);
      lastNode = nodes[nodes.length - 1];
    }

    lastNode.connect(offlineCtx.destination);
    source.start(0);

    return offlineCtx.startRendering();
  }

  /** Clean up — close AudioContext and disconnect everything. */
  dispose(): void {
    this.disconnectSource(); // also disconnects filter nodes
    if (this.ctx.state !== "closed") {
      this.ctx.close();
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private disconnectFilterNodes(): void {
    for (const nodes of this.filterNodes) {
      for (const node of nodes) {
        safeDisconnect(node);
      }
    }
    this.filterNodes = [];
  }

  private rebuildConnections(): void {
    if (!this.source) return;

    // Disconnect source from previous wiring to avoid additive connections
    safeDisconnect(this.source);

    let lastNode: AudioNode = this.source;

    for (const nodes of this.filterNodes) {
      lastNode.connect(nodes[0]);
      lastNode = nodes[nodes.length - 1];
    }

    // Connect last filter (or source) to analyser.
    // analyser → monitorGain → destination is wired once in constructor.
    lastNode.connect(this.analyser);
  }
}
