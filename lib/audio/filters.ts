/**
 * Filter definitions — the core abstraction.
 *
 * Each filter is a plain object with a `createNodes` factory function.
 * No class hierarchy, no inheritance. The engine chains them in sequence.
 */

export type ParamScale = "linear" | "log";

export interface FilterParam {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  default: number;
  scale?: ParamScale;
}

export interface FilterDefinition {
  id: string;
  name: string;
  description: string;
  params: FilterParam[];
  /**
   * Create the audio nodes for this filter.
   * Returns an array because some filters need multiple nodes chained together
   * (e.g., delay needs DelayNode + feedback GainNode).
   * The engine connects [0].input and [last].output.
   */
  createNodes(
    ctx: BaseAudioContext,
    params: Record<string, number>
  ): AudioNode[];
}

// ---------------------------------------------------------------------------
// Filter implementations
// ---------------------------------------------------------------------------

const gain: FilterDefinition = {
  id: "gain",
  name: "Gain",
  description: "Adjust the volume level",
  params: [
    { key: "level", label: "Level", unit: "x", min: 0, max: 3, step: 0.01, default: 1 },
  ],
  createNodes(ctx, params) {
    const node = ctx.createGain();
    node.gain.value = params.level ?? 1;
    return [node];
  },
};

const lowPass: FilterDefinition = {
  id: "lowpass",
  name: "Low-Pass",
  description: "Cut high frequencies — warmer, darker tone",
  params: [
    { key: "frequency", label: "Cutoff", unit: "Hz", min: 200, max: 8000, step: 10, default: 2000, scale: "log" },
    { key: "q", label: "Resonance", unit: "", min: 0.1, max: 20, step: 0.1, default: 1 },
  ],
  createNodes(ctx, params) {
    const node = ctx.createBiquadFilter();
    node.type = "lowpass";
    node.frequency.value = params.frequency ?? 2000;
    node.Q.value = params.q ?? 1;
    return [node];
  },
};

const highPass: FilterDefinition = {
  id: "highpass",
  name: "High-Pass",
  description: "Cut low frequencies — cleaner, thinner tone",
  params: [
    { key: "frequency", label: "Cutoff", unit: "Hz", min: 200, max: 8000, step: 10, default: 500, scale: "log" },
    { key: "q", label: "Resonance", unit: "", min: 0.1, max: 20, step: 0.1, default: 1 },
  ],
  createNodes(ctx, params) {
    const node = ctx.createBiquadFilter();
    node.type = "highpass";
    node.frequency.value = params.frequency ?? 500;
    node.Q.value = params.q ?? 1;
    return [node];
  },
};

const compressor: FilterDefinition = {
  id: "compressor",
  name: "Compressor",
  description: "Even out loud and quiet parts",
  params: [
    { key: "threshold", label: "Threshold", unit: "dB", min: -60, max: 0, step: 1, default: -24 },
    { key: "ratio", label: "Ratio", unit: ":1", min: 1, max: 20, step: 0.5, default: 12 },
    { key: "attack", label: "Attack", unit: "s", min: 0, max: 1, step: 0.001, default: 0.003 },
    { key: "release", label: "Release", unit: "s", min: 0, max: 1, step: 0.01, default: 0.25 },
  ],
  createNodes(ctx, params) {
    const node = ctx.createDynamicsCompressor();
    node.threshold.value = params.threshold ?? -24;
    node.ratio.value = params.ratio ?? 12;
    node.attack.value = params.attack ?? 0.003;
    node.release.value = params.release ?? 0.25;
    return [node];
  },
};

const delay: FilterDefinition = {
  id: "delay",
  name: "Echo / Delay",
  description: "Add repeating echoes",
  params: [
    { key: "time", label: "Delay Time", unit: "s", min: 0.05, max: 1, step: 0.01, default: 0.3 },
    { key: "feedback", label: "Feedback", unit: "%", min: 0, max: 0.9, step: 0.01, default: 0.4 },
    { key: "mix", label: "Wet/Dry", unit: "%", min: 0, max: 1, step: 0.01, default: 0.5 },
  ],
  createNodes(ctx, params) {
    const time = params.time ?? 0.3;
    const feedback = params.feedback ?? 0.4;
    const mix = params.mix ?? 0.5;

    // Dry path: input gain
    const dryGain = ctx.createGain();
    dryGain.gain.value = 1 - mix;

    // Wet path: delay → feedback loop → wet gain
    const delayNode = ctx.createDelay(2);
    delayNode.delayTime.value = time;

    const feedbackGain = ctx.createGain();
    feedbackGain.gain.value = feedback;

    const wetGain = ctx.createGain();
    wetGain.gain.value = mix;

    // Merger to combine dry + wet
    const merger = ctx.createGain();
    merger.gain.value = 1;

    // Wire up: input → dryGain → merger
    //          input → delayNode → wetGain → merger
    //          delayNode → feedbackGain → delayNode (feedback loop)
    dryGain.connect(merger);
    delayNode.connect(wetGain);
    wetGain.connect(merger);
    delayNode.connect(feedbackGain);
    feedbackGain.connect(delayNode);

    // Input splitter fans out to dry + wet paths; merger combines them.
    const inputSplitter = ctx.createGain();
    inputSplitter.gain.value = 1;
    inputSplitter.connect(dryGain);
    inputSplitter.connect(delayNode);

    return [inputSplitter, merger];
  },
};

/**
 * All available filters. Order here is the default signal chain order.
 */
export const FILTER_REGISTRY: FilterDefinition[] = [
  gain,
  lowPass,
  highPass,
  compressor,
  delay,
];

/**
 * Get default param values for a filter definition.
 */
export function getDefaultParams(
  definition: FilterDefinition
): Record<string, number> {
  const params: Record<string, number> = {};
  for (const p of definition.params) {
    params[p.key] = p.default;
  }
  return params;
}
