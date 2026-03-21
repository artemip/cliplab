"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WaveformBaseProps {
  className?: string;
  height?: number;
}

interface LiveWaveformProps extends WaveformBaseProps {
  mode: "live";
  /**
   * Time-domain data from AnalyserNode.getFloatTimeDomainData().
   * Caller should mutate in-place each frame (standard Web Audio pattern).
   */
  analyserData: Float32Array | null;
}

interface StaticWaveformProps extends WaveformBaseProps {
  mode: "static";
  peaks: number[] | null;
  progress?: number;
  onSeek?: (position: number) => void;
}

export type WaveformProps = LiveWaveformProps | StaticWaveformProps;

// ---------------------------------------------------------------------------
// Colors — resolved once per component mount, cached in ref
// ---------------------------------------------------------------------------

interface Colors {
  active: string;
  idle: string;
  progress: string;
  glow: string;
  hover: string;
}

const FALLBACK_COLORS: Colors = {
  active: "#f59e0b",
  idle: "#334155",
  progress: "#fbbf24",
  glow: "rgba(245, 158, 11, 0.4)",
  hover: "rgba(245, 158, 11, 0.3)",
};

function resolveColors(): Colors {
  if (typeof window === "undefined") return FALLBACK_COLORS;
  const s = getComputedStyle(document.documentElement);
  const g = (n: string, f: string) => s.getPropertyValue(n).trim() || f;
  return {
    active: g("--waveform-active", FALLBACK_COLORS.active),
    idle: g("--waveform-idle", FALLBACK_COLORS.idle),
    progress: g("--waveform-progress", FALLBACK_COLORS.progress),
    glow: g("--waveform-glow", FALLBACK_COLORS.glow).replace(/^0 0 \d+px /, "") || FALLBACK_COLORS.glow,
    hover: FALLBACK_COLORS.hover,
  };
}

// ---------------------------------------------------------------------------
// Drawing — thin bars, high density, rounded caps
// ---------------------------------------------------------------------------

const BAR_GAP = 1;
const MIN_BAR_HEIGHT = 2;
const BAR_WIDTH = 2; // thin bars for density

function drawLive(
  ctx: CanvasRenderingContext2D,
  data: Float32Array,
  w: number,
  h: number,
  c: Colors
) {
  const barCount = Math.floor(w / (BAR_WIDTH + BAR_GAP));
  if (barCount === 0) return;
  const samplesPerBar = Math.floor(data.length / barCount);

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = c.active;

  for (let i = 0; i < barCount; i++) {
    let max = 0;
    const start = i * samplesPerBar;
    for (let s = start; s < start + samplesPerBar && s < data.length; s++) {
      const a = Math.abs(data[s]);
      if (a > max) max = a;
    }
    const bh = Math.max(MIN_BAR_HEIGHT, max * h * 0.9);
    const x = i * (BAR_WIDTH + BAR_GAP);
    const y = (h - bh) / 2;
    ctx.beginPath();
    ctx.roundRect(x, y, BAR_WIDTH, bh, 1);
    ctx.fill();
  }
}

function drawStatic(
  ctx: CanvasRenderingContext2D,
  peaks: number[],
  w: number,
  h: number,
  progress: number,
  hoverPos: number | null,
  c: Colors
) {
  const barCount = Math.floor(w / (BAR_WIDTH + BAR_GAP));
  if (barCount === 0) return;

  // Resample peaks to match bar count
  const step = peaks.length / barCount;
  const px = progress * w;

  ctx.clearRect(0, 0, w, h);

  // Pass 1: idle bars
  ctx.fillStyle = c.idle;
  for (let i = 0; i < barCount; i++) {
    const x = i * (BAR_WIDTH + BAR_GAP);
    if (x + BAR_WIDTH / 2 > px) {
      const peakIdx = Math.min(Math.floor(i * step), peaks.length - 1);
      const bh = Math.max(MIN_BAR_HEIGHT, peaks[peakIdx] * h * 0.85);
      ctx.beginPath();
      ctx.roundRect(x, (h - bh) / 2, BAR_WIDTH, bh, 1);
      ctx.fill();
    }
  }

  // Pass 2: active bars
  ctx.fillStyle = c.active;
  for (let i = 0; i < barCount; i++) {
    const x = i * (BAR_WIDTH + BAR_GAP);
    if (x + BAR_WIDTH / 2 <= px) {
      const peakIdx = Math.min(Math.floor(i * step), peaks.length - 1);
      const bh = Math.max(MIN_BAR_HEIGHT, peaks[peakIdx] * h * 0.85);
      ctx.beginPath();
      ctx.roundRect(x, (h - bh) / 2, BAR_WIDTH, bh, 1);
      ctx.fill();
    }
  }

  // Playhead with glow
  if (progress > 0 && progress < 1) {
    const playX = Math.floor(px);
    // Glow
    ctx.shadowColor = c.glow;
    ctx.shadowBlur = 6;
    ctx.fillStyle = c.progress;
    ctx.fillRect(playX - 1, 0, 2, h);
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
  }

  // Hover preview line
  if (hoverPos !== null && hoverPos >= 0 && hoverPos <= 1) {
    const hx = Math.floor(hoverPos * w);
    ctx.fillStyle = c.hover;
    ctx.fillRect(hx - 1, 0, 2, h);
  }
}

function drawEmpty(ctx: CanvasRenderingContext2D, w: number, h: number, c: Colors) {
  const barCount = Math.floor(w / (BAR_WIDTH + BAR_GAP));
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = c.idle;

  // Flat minimum-height bars as a placeholder
  for (let i = 0; i < barCount; i++) {
    const x = i * (BAR_WIDTH + BAR_GAP);
    ctx.beginPath();
    ctx.roundRect(x, (h - MIN_BAR_HEIGHT) / 2, BAR_WIDTH, MIN_BAR_HEIGHT, 1);
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Waveform(props: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const colorsRef = useRef<Colors>(FALLBACK_COLORS);
  const widthRef = useRef(0);
  const [hoverPos, setHoverPos] = useState<number | null>(null);

  const h = props.height ?? 120;

  // Resolve colors on mount
  useEffect(() => {
    colorsRef.current = resolveColors();
  }, []);

  // Check reduced motion preference
  const prefersReducedMotion = useRef(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    prefersReducedMotion.current = mq.matches;
    const handler = (e: MediaQueryListEvent) => {
      prefersReducedMotion.current = e.matches;
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Draw function ref — updated via effect to avoid "refs during render" lint error
  const drawRef = useRef<() => void>(() => {});
  const staticPeaks = props.mode === "static" ? props.peaks : null;
  const staticProgress = props.mode === "static" ? props.progress : undefined;

  useEffect(() => {
    drawRef.current = () => {
      const ctx = ctxRef.current;
      const c = colorsRef.current;
      if (!ctx || widthRef.current === 0) return;

      if (props.mode === "static" && staticPeaks && staticPeaks.length > 0) {
        drawStatic(ctx, staticPeaks, widthRef.current, h, staticProgress ?? 0, hoverPos, c);
      } else if (props.mode === "static") {
        drawEmpty(ctx, widthRef.current, h, c);
      }
    };
    // Redraw immediately when props change
    drawRef.current();
  }, [props.mode, staticPeaks, staticProgress, hoverPos, h]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    function resize() {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.floor(container!.clientWidth);
      if (w === widthRef.current) return;

      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      widthRef.current = w;

      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctxRef.current = ctx;

      drawRef.current();
    }

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    return () => observer.disconnect();
  }, [h]);


  // Live mode: animation loop
  const liveData = props.mode === "live" ? props.analyserData : null;
  useEffect(() => {
    if (props.mode !== "live" || !liveData) return;

    // Reduced motion: draw once, don't animate
    if (prefersReducedMotion.current) {
      const ctx = ctxRef.current;
      if (ctx && widthRef.current > 0) {
        drawLive(ctx, liveData, widthRef.current, h, colorsRef.current);
      }
      return;
    }

    const data = liveData;
    const c = colorsRef.current;
    const loop = () => {
      const ctx = ctxRef.current;
      if (ctx && widthRef.current > 0) {
        drawLive(ctx, data, widthRef.current, h, c);
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [props.mode, liveData, h]);

  // Seek via click or keyboard
  const seekable = props.mode === "static" && !!props.onSeek;
  const staticOnSeek = props.mode === "static" ? props.onSeek : undefined;
  const onSeekRef = useRef(staticOnSeek);
  useEffect(() => {
    onSeekRef.current = staticOnSeek;
  }, [staticOnSeek]);

  const seekTo = useCallback((position: number) => {
    onSeekRef.current?.(Math.max(0, Math.min(1, position)));
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      seekTo((e.clientX - rect.left) / rect.width);
    },
    [seekTo]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLCanvasElement>) => {
      if (!onSeekRef.current) return;
      const currentProgress =
        props.mode === "static" ? props.progress ?? 0 : 0;
      const step = 0.02; // 2% per arrow press

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          seekTo(currentProgress - step);
          break;
        case "ArrowRight":
          e.preventDefault();
          seekTo(currentProgress + step);
          break;
        case "Home":
          e.preventDefault();
          seekTo(0);
          break;
        case "End":
          e.preventDefault();
          seekTo(1);
          break;
      }
    },
    [seekTo, props.mode, props.mode === "static" ? props.progress : 0]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!seekable) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      setHoverPos((e.clientX - rect.left) / rect.width);
    },
    [seekable]
  );

  const handleMouseLeave = useCallback(() => {
    setHoverPos(null);
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full", props.className)}
      style={{ height: h }}
    >
      <canvas
        ref={canvasRef}
        onClick={seekable ? handleClick : undefined}
        onKeyDown={seekable ? handleKeyDown : undefined}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        tabIndex={seekable ? 0 : undefined}
        className={cn(
          "block w-full rounded-[var(--radius-lg)]",
          seekable && "cursor-pointer",
          "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        )}
        style={{ height: h }}
        role={seekable ? "slider" : "img"}
        aria-label="Audio waveform"
        aria-valuemin={seekable ? 0 : undefined}
        aria-valuemax={seekable ? 100 : undefined}
        aria-valuenow={
          seekable && props.mode === "static"
            ? Math.round((props.progress ?? 0) * 100)
            : undefined
        }
      />
    </div>
  );
}
