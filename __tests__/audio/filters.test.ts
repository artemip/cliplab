import { describe, it, expect } from "vitest";
import {
  FILTER_REGISTRY,
  getDefaultParams,
  type FilterDefinition,
} from "@/lib/audio/filters";

/**
 * Filter tests.
 *
 * Web Audio API isn't available in Node, so we test the filter interface
 * contract using a mock BaseAudioContext that tracks node creation.
 */

interface MockNode {
  _type: string;
  _connections: unknown[];
  connect(dest: unknown): unknown;
  disconnect(): void;
  gain: { value: number };
  frequency: { value: number };
  Q: { value: number };
  delayTime: { value: number };
  threshold: { value: number };
  ratio: { value: number };
  attack: { value: number };
  release: { value: number };
  type: string;
}

function createMockNode(type: string): MockNode {
  const connections: unknown[] = [];
  return {
    _type: type,
    _connections: connections,
    connect(dest: unknown) {
      connections.push(dest);
      return dest;
    },
    disconnect: vi.fn(),
    gain: { value: 0 },
    frequency: { value: 0 },
    Q: { value: 0 },
    delayTime: { value: 0 },
    threshold: { value: 0 },
    ratio: { value: 0 },
    attack: { value: 0 },
    release: { value: 0 },
    type: "lowpass",
  };
}

function createMockContext(): BaseAudioContext {
  return {
    createGain: () => createMockNode("GainNode"),
    createBiquadFilter: () => createMockNode("BiquadFilterNode"),
    createDynamicsCompressor: () => createMockNode("DynamicsCompressorNode"),
    createDelay: () => createMockNode("DelayNode"),
  } as unknown as BaseAudioContext;
}

/** Cast an AudioNode from createNodes back to our mock for inspection. */
function asMock(node: AudioNode): MockNode {
  return node as unknown as MockNode;
}

describe("FILTER_REGISTRY", () => {
  it("contains exactly 5 filters", () => {
    expect(FILTER_REGISTRY).toHaveLength(5);
  });

  it("has unique IDs", () => {
    const ids = FILTER_REGISTRY.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes gain, lowpass, highpass, compressor, delay", () => {
    const ids = FILTER_REGISTRY.map((f) => f.id);
    expect(ids).toContain("gain");
    expect(ids).toContain("lowpass");
    expect(ids).toContain("highpass");
    expect(ids).toContain("compressor");
    expect(ids).toContain("delay");
  });

  it("every filter has a name, description, and at least one param", () => {
    for (const filter of FILTER_REGISTRY) {
      expect(filter.name).toBeTruthy();
      expect(filter.description).toBeTruthy();
      expect(filter.params.length).toBeGreaterThan(0);
    }
  });

  it("every param has valid min < max and a default within range", () => {
    for (const filter of FILTER_REGISTRY) {
      for (const param of filter.params) {
        expect(param.min).toBeLessThan(param.max);
        expect(param.default).toBeGreaterThanOrEqual(param.min);
        expect(param.default).toBeLessThanOrEqual(param.max);
        expect(param.step).toBeGreaterThan(0);
      }
    }
  });
});

describe("getDefaultParams", () => {
  it("returns an object with all param keys at default values", () => {
    for (const filter of FILTER_REGISTRY) {
      const defaults = getDefaultParams(filter);
      for (const param of filter.params) {
        expect(defaults).toHaveProperty(param.key);
        expect(defaults[param.key]).toBe(param.default);
      }
    }
  });
});

describe("filter createNodes", () => {
  const ctx = createMockContext();

  function testFilter(filter: FilterDefinition) {
    const params = getDefaultParams(filter);
    const nodes = filter.createNodes(ctx, params);
    expect(Array.isArray(nodes)).toBe(true);
    expect(nodes.length).toBeGreaterThan(0);
    return nodes;
  }

  it("gain: returns single GainNode, sets gain value", () => {
    const filter = FILTER_REGISTRY.find((f) => f.id === "gain")!;
    const nodes = testFilter(filter);
    expect(nodes).toHaveLength(1);
    expect(asMock(nodes[0])._type).toBe("GainNode");
  });

  it("gain: respects level param", () => {
    const filter = FILTER_REGISTRY.find((f) => f.id === "gain")!;
    const nodes = filter.createNodes(ctx, { level: 250 });
    expect(asMock(nodes[0]).gain.value).toBe(2.5);
  });

  it("lowpass: returns single BiquadFilterNode with type lowpass", () => {
    const filter = FILTER_REGISTRY.find((f) => f.id === "lowpass")!;
    const nodes = testFilter(filter);
    expect(nodes).toHaveLength(1);
    expect(asMock(nodes[0])._type).toBe("BiquadFilterNode");
    expect(asMock(nodes[0]).type).toBe("lowpass");
  });

  it("lowpass: respects frequency and Q params", () => {
    const filter = FILTER_REGISTRY.find((f) => f.id === "lowpass")!;
    const nodes = filter.createNodes(ctx, { frequency: 4000, q: 5 });
    expect(asMock(nodes[0]).frequency.value).toBe(4000);
    expect(asMock(nodes[0]).Q.value).toBe(5);
  });

  it("highpass: returns single BiquadFilterNode with type highpass", () => {
    const filter = FILTER_REGISTRY.find((f) => f.id === "highpass")!;
    const nodes = testFilter(filter);
    expect(nodes).toHaveLength(1);
    expect(asMock(nodes[0])._type).toBe("BiquadFilterNode");
    expect(asMock(nodes[0]).type).toBe("highpass");
  });

  it("compressor: returns single DynamicsCompressorNode", () => {
    const filter = FILTER_REGISTRY.find((f) => f.id === "compressor")!;
    const nodes = testFilter(filter);
    expect(nodes).toHaveLength(1);
    expect(asMock(nodes[0])._type).toBe("DynamicsCompressorNode");
  });

  it("compressor: respects all four params", () => {
    const filter = FILTER_REGISTRY.find((f) => f.id === "compressor")!;
    const nodes = filter.createNodes(ctx, {
      threshold: -30,
      ratio: 8,
      attack: 0.01,
      release: 0.5,
    });
    const mock = asMock(nodes[0]);
    expect(mock.threshold.value).toBe(-30);
    expect(mock.ratio.value).toBe(8);
    expect(mock.attack.value).toBe(0.01);
    expect(mock.release.value).toBe(0.5);
  });

  it("delay: returns [inputSplitter, merger] — two GainNodes", () => {
    const filter = FILTER_REGISTRY.find((f) => f.id === "delay")!;
    const nodes = testFilter(filter);
    expect(nodes).toHaveLength(2);
    expect(asMock(nodes[0])._type).toBe("GainNode");
    expect(asMock(nodes[1])._type).toBe("GainNode");
  });

  it("delay: input splitter connects to both dry and wet paths", () => {
    const filter = FILTER_REGISTRY.find((f) => f.id === "delay")!;
    const nodes = filter.createNodes(ctx, getDefaultParams(filter));
    expect(asMock(nodes[0])._connections).toHaveLength(2);
  });

  it("delay: handles extreme param values without throwing", () => {
    const filter = FILTER_REGISTRY.find((f) => f.id === "delay")!;
    expect(() => filter.createNodes(ctx, { time: 0.05, feedback: 0, mix: 0 })).not.toThrow();
    expect(() => filter.createNodes(ctx, { time: 1, feedback: 90, mix: 100 })).not.toThrow();
  });

  it("all filters handle missing params gracefully via ?? defaults", () => {
    for (const filter of FILTER_REGISTRY) {
      expect(() => filter.createNodes(ctx, {})).not.toThrow();
    }
  });
});
