// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { RecorderControls } from "@/components/audio/recorder-controls";

afterEach(cleanup);

describe("RecorderControls", () => {
  const defaultProps = {
    status: "idle" as const,
    duration: 0,
    error: null,
    onRequestMic: vi.fn(),
    onStart: vi.fn(),
    onStop: vi.fn(),
    onReset: vi.fn(),
  };

  describe("idle state", () => {
    it("renders mic button with correct aria-label", () => {
      const { container } = render(<RecorderControls {...defaultProps} />);
      const btn = container.querySelector("button");
      expect(btn?.getAttribute("aria-label")).toBe("Start recording");
    });

    it("calls onRequestMic when clicked", () => {
      const onRequestMic = vi.fn();
      const { container } = render(
        <RecorderControls {...defaultProps} onRequestMic={onRequestMic} />
      );
      fireEvent.click(container.querySelector("button")!);
      expect(onRequestMic).toHaveBeenCalledOnce();
    });

    it("shows requesting text when status is requesting", () => {
      const { container } = render(
        <RecorderControls {...defaultProps} status="requesting" />
      );
      expect(container.textContent).toContain("Waiting for microphone");
    });
  });

  describe("error state", () => {
    it("renders error message", () => {
      const { container } = render(
        <RecorderControls
          {...defaultProps}
          status="error"
          error="Mic access denied"
        />
      );
      expect(container.textContent).toContain("Mic access denied");
    });

    it("renders try again button", () => {
      const { container } = render(
        <RecorderControls {...defaultProps} status="error" error="err" />
      );
      const btn = container.querySelector("button");
      expect(btn?.textContent).toContain("Try again");
    });
  });

  describe("recording state", () => {
    it("renders stop button", () => {
      const { container } = render(
        <RecorderControls {...defaultProps} status="recording" duration={3.5} />
      );
      const stopBtn = container.querySelector('[aria-label="Stop recording"]');
      expect(stopBtn).toBeTruthy();
    });

    it("shows timer with duration", () => {
      const { container } = render(
        <RecorderControls {...defaultProps} status="recording" duration={65.3} />
      );
      // Float precision: 65.3 % 1 ≈ 0.299, floor(0.299 * 10) = 2
      expect(container.textContent).toContain("1:05");
    });

    it("calls onStop when stop button clicked", () => {
      const onStop = vi.fn();
      const { container } = render(
        <RecorderControls {...defaultProps} status="recording" onStop={onStop} />
      );
      fireEvent.click(container.querySelector('[aria-label="Stop recording"]')!);
      expect(onStop).toHaveBeenCalledOnce();
    });

    it("has recording pulse animation class", () => {
      const { container } = render(
        <RecorderControls {...defaultProps} status="recording" />
      );
      const stopBtn = container.querySelector('[aria-label="Stop recording"]');
      expect(stopBtn?.className).toContain("animate-");
    });
  });

  describe("stopped state", () => {
    it("renders record again and discard buttons", () => {
      const { container } = render(
        <RecorderControls {...defaultProps} status="stopped" duration={5.0} />
      );
      expect(container.querySelector('[aria-label="Record again"]')).toBeTruthy();
      expect(container.querySelector('[aria-label="Discard recording"]')).toBeTruthy();
    });

    it("shows recording complete text", () => {
      const { container } = render(
        <RecorderControls {...defaultProps} status="stopped" />
      );
      expect(container.textContent).toContain("Recording complete");
    });
  });

  describe("monitor toggle", () => {
    it("renders headphone button when onToggleMonitor provided", () => {
      const { container } = render(
        <RecorderControls
          {...defaultProps}
          status="recording"
          onToggleMonitor={vi.fn()}
        />
      );
      expect(
        container.querySelector('[aria-label*="monitoring"]')
      ).toBeTruthy();
    });

    it("does not render headphone button when onToggleMonitor not provided", () => {
      const { container } = render(
        <RecorderControls {...defaultProps} status="recording" />
      );
      expect(
        container.querySelector('[aria-label*="monitoring"]')
      ).toBeFalsy();
    });
  });
});
