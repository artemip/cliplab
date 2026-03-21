// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Waveform component tests.
 *
 * Canvas rendering can't be visually verified in jsdom, so we test:
 * - Component renders without error for both modes
 * - Click-to-seek fires callback with correct normalized position
 * - Graceful handling of empty/null data
 * - ARIA attributes are set correctly
 * - Cleanup on unmount (no leaked animation frames)
 */

// Mock ResizeObserver for jsdom
class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe() {
    // Fire immediately with a mock entry
    this.callback(
      [
        {
          contentRect: { width: 800, height: 120 } as DOMRectReadOnly,
        } as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver
    );
  }
  unobserve() {}
  disconnect() {}
}

// Mock canvas context
function createMockCanvasContext() {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
    scale: vi.fn(),
    fillStyle: "",
  };
}

beforeEach(() => {
  // Install mocks
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
  vi.stubGlobal("devicePixelRatio", 1);

  // Mock matchMedia for prefers-reduced-motion
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  }));

  // Mock canvas getContext
  HTMLCanvasElement.prototype.getContext = vi.fn(() =>
    createMockCanvasContext()
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;

  // Mock requestAnimationFrame
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    return setTimeout(() => cb(performance.now()), 0) as unknown as number;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
});

// We need jsdom for DOM testing
// Configure vitest to use jsdom for this file
import { render, fireEvent, cleanup } from "@testing-library/react";
import { Waveform } from "@/components/audio/waveform";

describe("Waveform", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe("static mode", () => {
    it("renders without error with valid peaks", () => {
      const peaks = Array.from({ length: 50 }, () => Math.random());
      const { container } = render(
        <Waveform mode="static" peaks={peaks} progress={0.5} />
      );
      expect(container.querySelector("canvas")).toBeTruthy();
    });

    it("renders without error with null peaks", () => {
      const { container } = render(
        <Waveform mode="static" peaks={null} />
      );
      expect(container.querySelector("canvas")).toBeTruthy();
    });

    it("renders without error with empty peaks array", () => {
      const { container } = render(
        <Waveform mode="static" peaks={[]} />
      );
      expect(container.querySelector("canvas")).toBeTruthy();
    });

    it("has aria-label on canvas", () => {
      const { container } = render(
        <Waveform mode="static" peaks={[0.5, 0.8]} />
      );
      const canvas = container.querySelector("canvas");
      expect(canvas?.getAttribute("aria-label")).toBe("Audio waveform");
    });

    it("has role=img when not seekable", () => {
      const { container } = render(
        <Waveform mode="static" peaks={[0.5]} />
      );
      const canvas = container.querySelector("canvas");
      expect(canvas?.getAttribute("role")).toBe("img");
    });

    it("has role=slider when seekable", () => {
      const { container } = render(
        <Waveform mode="static" peaks={[0.5]} onSeek={() => {}} />
      );
      const canvas = container.querySelector("canvas");
      expect(canvas?.getAttribute("role")).toBe("slider");
    });

    it("has tabIndex when seekable", () => {
      const { container } = render(
        <Waveform mode="static" peaks={[0.5]} onSeek={() => {}} />
      );
      const canvas = container.querySelector("canvas");
      expect(canvas?.getAttribute("tabindex")).toBe("0");
    });

    it("has cursor-pointer when seekable", () => {
      const { container } = render(
        <Waveform mode="static" peaks={[0.5]} onSeek={() => {}} />
      );
      const canvas = container.querySelector("canvas");
      expect(canvas?.className).toContain("cursor-pointer");
    });

    it("fires onSeek with normalized position on click", () => {
      const onSeek = vi.fn();
      const { container } = render(
        <Waveform mode="static" peaks={[0.5, 0.8]} onSeek={onSeek} />
      );
      const canvas = container.querySelector("canvas")!;

      // Mock getBoundingClientRect
      canvas.getBoundingClientRect = vi.fn(() => ({
        left: 0,
        right: 800,
        width: 800,
        top: 0,
        bottom: 120,
        height: 120,
        x: 0,
        y: 0,
        toJSON: () => {},
      }));

      fireEvent.click(canvas, { clientX: 400, clientY: 60 });
      expect(onSeek).toHaveBeenCalledWith(0.5);
    });

    it("fires onSeek clamped to [0, 1]", () => {
      const onSeek = vi.fn();
      const { container } = render(
        <Waveform mode="static" peaks={[0.5]} onSeek={onSeek} />
      );
      const canvas = container.querySelector("canvas")!;

      canvas.getBoundingClientRect = vi.fn(() => ({
        left: 100,
        right: 900,
        width: 800,
        top: 0,
        bottom: 120,
        height: 120,
        x: 100,
        y: 0,
        toJSON: () => {},
      }));

      // Click before the canvas left edge
      fireEvent.click(canvas, { clientX: 50, clientY: 60 });
      expect(onSeek).toHaveBeenCalledWith(0);
    });

    it("does not fire onSeek when no handler provided", () => {
      const { container } = render(
        <Waveform mode="static" peaks={[0.5]} />
      );
      const canvas = container.querySelector("canvas")!;
      // Should not throw
      fireEvent.click(canvas, { clientX: 400, clientY: 60 });
    });

    it("sets aria-valuenow based on progress when seekable", () => {
      const { container } = render(
        <Waveform mode="static" peaks={[0.5]} onSeek={() => {}} progress={0.73} />
      );
      const canvas = container.querySelector("canvas");
      expect(canvas?.getAttribute("aria-valuenow")).toBe("73");
    });

    it("has focus-visible styles", () => {
      const { container } = render(
        <Waveform mode="static" peaks={[0.5]} onSeek={() => {}} />
      );
      const canvas = container.querySelector("canvas");
      expect(canvas?.className).toContain("focus-visible");
    });
  });

  describe("live mode", () => {
    it("renders without error with analyser data", () => {
      const data = new Float32Array(1024).fill(0);
      const { container } = render(
        <Waveform mode="live" analyserData={data} />
      );
      expect(container.querySelector("canvas")).toBeTruthy();
    });

    it("renders without error with null analyser data", () => {
      const { container } = render(
        <Waveform mode="live" analyserData={null} />
      );
      expect(container.querySelector("canvas")).toBeTruthy();
    });

    it("has role=img (live waveform is not interactive)", () => {
      const { container } = render(
        <Waveform mode="live" analyserData={null} />
      );
      const canvas = container.querySelector("canvas");
      expect(canvas?.getAttribute("role")).toBe("img");
    });
  });

  describe("responsive", () => {
    it("applies custom height", () => {
      const { container } = render(
        <Waveform mode="static" peaks={[0.5]} height={80} />
      );
      const canvas = container.querySelector("canvas");
      expect(canvas?.style.height).toBe("80px");
    });

    it("defaults to 120px height", () => {
      const { container } = render(
        <Waveform mode="static" peaks={[0.5]} />
      );
      const canvas = container.querySelector("canvas");
      expect(canvas?.style.height).toBe("120px");
    });

    it("accepts className prop", () => {
      const { container } = render(
        <Waveform mode="static" peaks={[0.5]} className="my-custom-class" />
      );
      const wrapper = container.firstElementChild;
      expect(wrapper?.className).toContain("my-custom-class");
    });
  });
});
