/**
 * AudioEngine — manages the Web Audio API graph.
 *
 * Holds an AudioContext, builds filter chains, and handles
 * both real-time playback and offline rendering for export.
 */

import { MAX_FEEDBACK, type FilterDefinition } from "./filters";

export interface ActiveFilter {
  definition: FilterDefinition;
  params: Record<string, number>;
  enabled: boolean;
}

/** Threshold constants for tail calculation. */
const SILENCE_THRESHOLD = 0.001; // -60 dB
const MAX_TAIL_SECONDS = 30; // cap allocation

function safeDisconnect(node: AudioNode): void {
  try {
    node.disconnect();
  } catch {
    // Web Audio API throws if node has no connections
  }
}

/**
 * Build a filter chain: connect source → enabled filters → destination.
 * Shared between live graph and offline render.
 */
function connectFilterChain(
  ctx: BaseAudioContext,
  source: AudioNode,
  destination: AudioNode,
  filters: ActiveFilter[]
): AudioNode[][] {
  const filterNodes: AudioNode[][] = [];
  let lastNode = source;

  for (const filter of filters) {
    if (filter.enabled) {
      const nodes = filter.definition.createNodes(ctx, filter.params);
      lastNode.connect(nodes[0]);
      lastNode = nodes[nodes.length - 1];
      filterNodes.push(nodes);
    }
  }

  lastNode.connect(destination);
  return filterNodes;
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
  connectStream(
    stream: MediaStream,
    filters: ActiveFilter[] = []
  ): MediaStreamAudioSourceNode {
    this.disconnectSource();
    const source = this.ctx.createMediaStreamSource(stream);
    this.source = source;
    this.filterNodes = connectFilterChain(
      this.ctx,
      source,
      this.analyser,
      filters
    );
    return source;
  }

  /**
   * Connect an AudioBuffer for playback.
   * Returns the BufferSourceNode so the caller can listen for `onended`.
   * Caller must explicitly call setMonitor(true) for audible output.
   */
  connectBuffer(
    buffer: AudioBuffer,
    filters: ActiveFilter[] = []
  ): AudioBufferSourceNode {
    this.disconnectSource();
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    this.source = source;
    this.filterNodes = connectFilterChain(
      this.ctx,
      source,
      this.analyser,
      filters
    );
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

    if (this.source) {
      safeDisconnect(this.source);
      this.filterNodes = connectFilterChain(
        this.ctx,
        this.source,
        this.analyser,
        filters
      );
    }
  }

  /** Render an AudioBuffer through the filter chain offline (bakes filters in). */
  async renderOffline(
    buffer: AudioBuffer,
    filters: ActiveFilter[]
  ): Promise<AudioBuffer> {
    const extraFrames = Math.ceil(
      this.calculateFilterTail(filters) * buffer.sampleRate
    );

    const offlineCtx = new OfflineAudioContext(
      buffer.numberOfChannels,
      buffer.length + extraFrames,
      buffer.sampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;

    connectFilterChain(offlineCtx, source, offlineCtx.destination, filters);
    source.start(0);

    return offlineCtx.startRendering();
  }

  /** Clean up — close AudioContext and disconnect everything. */
  dispose(): void {
    this.disconnectSource();
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

  /**
   * Calculate extra seconds needed for filter tails (delay echoes + reverb decay).
   */
  private calculateFilterTail(filters: ActiveFilter[]): number {
    let extraSeconds = 0;

    for (const f of filters) {
      if (!f.enabled) continue;

      if (f.definition.id === "delay") {
        const time = f.params.time ?? 0.3;
        const feedback = Math.min((f.params.feedback ?? 40) / 100, MAX_FEEDBACK);
        const repeats =
          feedback > 0.01
            ? Math.ceil(Math.log(SILENCE_THRESHOLD) / Math.log(feedback))
            : 1;
        extraSeconds = Math.max(extraSeconds, time * repeats);
      }

      if (f.definition.id === "reverb") {
        const decay = f.params.decay ?? 1.5;
        extraSeconds = Math.max(extraSeconds, decay);
      }
    }

    return Math.min(extraSeconds, MAX_TAIL_SECONDS);
  }
}
