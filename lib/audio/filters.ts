/**
 * Filter definitions — the core abstraction.
 *
 * Each filter is a plain object with a `createNodes` factory function.
 * No class hierarchy, no inheritance. The engine chains them in sequence.
 */

/** Max feedback level to prevent infinite loops in delay/reverb. */
export const MAX_FEEDBACK = 0.95;

export type ParamScale = "linear" | "log";

export interface FilterParam {
  key: string;
  label: string;
  unit?: string;
  /** Short hint shown below the slider — helps beginners understand the param */
  hint?: string;
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
  description: "Boost or soften your sound",
  params: [
    { key: "level", label: "Level", unit: "%", hint: "100% = normal, higher = louder/distorted", min: 0, max: 500, step: 1, default: 100 },
  ],
  createNodes(ctx, params) {
    const node = ctx.createGain();
    node.gain.value = (params.level ?? 100) / 100;
    return [node];
  },
};

const lowPass: FilterDefinition = {
  id: "lowpass",
  name: "Low-Pass",
  description: "Warmer, darker — like hearing through a wall",
  params: [
    { key: "frequency", label: "Cutoff", unit: "Hz", hint: "Lower = darker, muffled", min: 200, max: 8000, step: 10, default: 2000, scale: "log" },
    { key: "q", label: "Resonance", hint: "Higher = more pronounced at cutoff", min: 0.1, max: 20, step: 0.1, default: 1 },
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
  description: "Cleaner, thinner — cuts the rumble",
  params: [
    { key: "frequency", label: "Cutoff", unit: "Hz", hint: "Higher = thinner, cleaner", min: 200, max: 8000, step: 10, default: 500, scale: "log" },
    { key: "q", label: "Resonance", hint: "Higher = more pronounced at cutoff", min: 0.1, max: 20, step: 0.1, default: 1 },
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
  description: "Thicken and tighten your sound",
  params: [
    { key: "threshold", label: "Threshold", unit: "dB", hint: "Louder signals above this get compressed", min: -60, max: 0, step: 1, default: -24 },
    { key: "ratio", label: "Ratio", unit: ":1", hint: "How much to compress — higher = flatter", min: 1, max: 20, step: 0.5, default: 12 },
    { key: "attack", label: "Attack", unit: "s", hint: "How fast compression kicks in", min: 0, max: 1, step: 0.001, default: 0.003 },
    { key: "release", label: "Release", unit: "s", hint: "How fast compression lets go", min: 0, max: 1, step: 0.01, default: 0.25 },
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
  description: "Add space and rhythm with echoes",
  params: [
    { key: "time", label: "Delay Time", unit: "s", hint: "Time between echoes", min: 0.05, max: 1, step: 0.01, default: 0.3 },
    { key: "feedback", label: "Feedback", unit: "%", hint: "How many times echoes repeat", min: 0, max: 90, step: 1, default: 40 },
    { key: "mix", label: "Wet/Dry", unit: "%", hint: "0% = dry, 100% = full echo", min: 0, max: 100, step: 1, default: 50 },
  ],
  createNodes(ctx, params) {
    const time = params.time ?? 0.3;
    const feedback = Math.min((params.feedback ?? 40) / 100, MAX_FEEDBACK);
    const mix = (params.mix ?? 50) / 100;

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

    const merger = ctx.createGain();

    // Wire: input → dryGain → merger
    //       input → delayNode → wetGain → merger
    //       delayNode → feedbackGain → delayNode (feedback loop)
    dryGain.connect(merger);
    delayNode.connect(wetGain);
    wetGain.connect(merger);
    delayNode.connect(feedbackGain);
    feedbackGain.connect(delayNode);

    // Input splitter fans out to dry + wet paths; merger combines them.
    const inputSplitter = ctx.createGain();
    inputSplitter.connect(dryGain);
    inputSplitter.connect(delayNode);

    return [inputSplitter, merger];
  },
};

const reverb: FilterDefinition = {
  id: "reverb",
  name: "Reverb",
  description: "Add depth and space — like singing in a room",
  params: [
    { key: "decay", label: "Decay", unit: "s", hint: "Longer = bigger room", min: 0.1, max: 5, step: 0.1, default: 1.5 },
    { key: "mix", label: "Wet/Dry", unit: "%", hint: "0% = dry, 100% = full reverb", min: 0, max: 100, step: 1, default: 40 },
  ],
  createNodes(ctx, params) {
    const decay = params.decay ?? 1.5;
    const mix = (params.mix ?? 40) / 100;

    // Generate impulse response: exponential decay white noise
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * decay);
    const impulse = ctx.createBuffer(2, length, sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
      }
    }

    const convolver = ctx.createConvolver();
    convolver.buffer = impulse;

    // Dry/wet mix routing (same pattern as delay)
    const dryGain = ctx.createGain();
    dryGain.gain.value = 1 - mix;

    const wetGain = ctx.createGain();
    wetGain.gain.value = mix;

    const merger = ctx.createGain();

    dryGain.connect(merger);
    convolver.connect(wetGain);
    wetGain.connect(merger);

    const inputSplitter = ctx.createGain();
    inputSplitter.connect(dryGain);
    inputSplitter.connect(convolver);

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
  reverb,
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

// ---------------------------------------------------------------------------
// Presets — one-tap configurations for common use cases
// ---------------------------------------------------------------------------

export interface FilterPreset {
  id: string;
  name: string;
  description: string;
  /** Map of filter ID → param overrides. Filters not listed stay disabled. */
  filters: Record<string, Record<string, number>>;
}

export const PRESETS: FilterPreset[] = [
  {
    id: "warm-vocal",
    name: "Warm Vocal",
    description: "Compression + light reverb",
    filters: {
      compressor: { threshold: -20, ratio: 4, attack: 0.003, release: 0.25 },
      reverb: { decay: 1.2, mix: 25 },
    },
  },
  {
    id: "lofi-radio",
    name: "Lo-Fi Radio",
    description: "Muffled, compressed, boosted",
    filters: {
      lowpass: { frequency: 800, q: 1 },
      compressor: { threshold: -30, ratio: 12, attack: 0.01, release: 0.25 },
      gain: { level: 150 },
    },
  },
  {
    id: "ambient-space",
    name: "Ambient Space",
    description: "Long reverb + slow echoes",
    filters: {
      reverb: { decay: 4, mix: 60 },
      delay: { time: 0.5, feedback: 50, mix: 40 },
    },
  },
  {
    id: "telephone",
    name: "Telephone",
    description: "Thin, tinny, retro",
    filters: {
      highpass: { frequency: 800, q: 1 },
      lowpass: { frequency: 3000, q: 2 },
      compressor: { threshold: -15, ratio: 8, attack: 0.001, release: 0.1 },
    },
  },
  {
    id: "distorted",
    name: "Distorted",
    description: "Cranked gain + heavy compression",
    filters: {
      gain: { level: 450 },
      compressor: { threshold: -10, ratio: 20, attack: 0.001, release: 0.05 },
    },
  },
  {
    id: "underwater",
    name: "Underwater",
    description: "Deep, muffled, dreamy",
    filters: {
      lowpass: { frequency: 400, q: 5 },
      reverb: { decay: 3, mix: 70 },
      gain: { level: 80 },
    },
  },
];
