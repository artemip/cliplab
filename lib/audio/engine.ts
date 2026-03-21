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
    this.monitorGain.gain.value = 0; // Off by default — avoid echo
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

  /**
   * Ensure the AudioContext is running (browsers require user gesture).
   */
  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  /**
   * Set monitor output (headphone monitoring during recording).
   */
  setMonitor(enabled: boolean): void {
    this.monitorGain.gain.value = enabled ? 1 : 0;
  }

  /**
   * Connect a MediaStream (mic) as the audio source.
   */
  connectStream(stream: MediaStream): MediaStreamAudioSourceNode {
    this.disconnectSource();
    const source = this.ctx.createMediaStreamSource(stream);
    this.source = source;
    this.rebuildConnections();
    return source;
  }

  /**
   * Connect an AudioBuffer (recorded clip) for playback.
   * Returns the BufferSourceNode so the caller can listen for `onended`.
   */
  /**
   * Connect an AudioBuffer (recorded clip) for playback.
   * Returns the BufferSourceNode so the caller can listen for `onended`.
   * NOTE: Caller must explicitly call setMonitor(true) for playback audio.
   */
  connectBuffer(buffer: AudioBuffer): AudioBufferSourceNode {
    this.disconnectSource();
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    this.source = source;
    this.rebuildConnections();
    return source;
  }

  /**
   * Disconnect the current source.
   */
  disconnectSource(): void {
    if (this.source) {
      try {
        this.source.disconnect();
      } catch {
        // Already disconnected
      }
      this.source = null;
    }
    this.disconnectFilterNodes();
  }

  /**
   * Rebuild the audio graph with the given filter chain.
   * Disconnects everything and reconnects from scratch.
   * This is O(n) where n = number of filters, takes microseconds.
   */
  rebuildGraph(filters: ActiveFilter[]): void {
    this.disconnectFilterNodes();

    // Create nodes for enabled filters
    this.filterNodes = [];
    for (const filter of filters) {
      if (filter.enabled) {
        const nodes = filter.definition.createNodes(this.ctx, filter.params);
        this.filterNodes.push(nodes);
      }
    }

    this.rebuildConnections();
  }

  /**
   * Render an AudioBuffer through the filter chain offline.
   * Returns a new AudioBuffer with filters baked in.
   */
  async renderOffline(
    buffer: AudioBuffer,
    filters: ActiveFilter[]
  ): Promise<AudioBuffer> {
    const offlineCtx = new OfflineAudioContext(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;

    // Build filter chain
    const enabledFilters = filters.filter((f) => f.enabled);
    const filterNodeChains: AudioNode[][] = [];

    for (const filter of enabledFilters) {
      const nodes = filter.definition.createNodes(offlineCtx, filter.params);
      filterNodeChains.push(nodes);
    }

    // Connect: source → filter chains → destination
    let lastNode: AudioNode = source;

    for (const nodes of filterNodeChains) {
      lastNode.connect(nodes[0]);
      lastNode = nodes[nodes.length - 1];
    }

    lastNode.connect(offlineCtx.destination);
    source.start(0);

    return offlineCtx.startRendering();
  }

  /**
   * Decode a Blob (audio file) into an AudioBuffer.
   */
  async decodeBlob(blob: Blob): Promise<AudioBuffer> {
    const arrayBuffer = await blob.arrayBuffer();
    return this.ctx.decodeAudioData(arrayBuffer);
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    this.disconnectSource();
    this.disconnectFilterNodes();
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
        try {
          node.disconnect();
        } catch {
          // Already disconnected
        }
      }
    }
    this.filterNodes = [];
  }

  private rebuildConnections(): void {
    if (!this.source) return;

    // Chain: source → [filter chains] → analyser → monitorGain → destination
    let lastNode: AudioNode = this.source;

    for (const nodes of this.filterNodes) {
      lastNode.connect(nodes[0]);
      lastNode = nodes[nodes.length - 1];
    }

    lastNode.connect(this.analyser);
    this.analyser.connect(this.monitorGain);
  }
}
