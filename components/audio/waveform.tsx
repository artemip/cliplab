"use client";

import { useRef, useEffect, useCallback } from "react";
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
   * The caller should mutate this array in-place each frame (the standard
   * Web Audio pattern). If a new array reference is passed, the animation
   * loop restarts — which works but is less efficient.
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
// Colors — resolve from CSS vars each time (cheap, no stale cache risk)
// ---------------------------------------------------------------------------

function getColors() {
  if (typeof window === "undefined") {
    return { active: "#f59e0b", idle: "#334155", progress: "#fbbf24" };
  }
  const s = getComputedStyle(document.documentElement);
  const g = (n: string, f: string) => s.getPropertyValue(n).trim() || f;
  return {
    active: g("--waveform-active", "#f59e0b"),
    idle: g("--waveform-idle", "#334155"),
    progress: g("--waveform-progress", "#fbbf24"),
  };
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function drawLive(
  ctx: CanvasRenderingContext2D,
  data: Float32Array,
  w: number,
  h: number
) {
  const { active } = getColors();
  const n = Math.min(data.length, Math.floor(w / 3));
  if (n === 0) return;
  const bw = Math.max(1, w / n - 1);
  const per = Math.floor(data.length / n);

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = active;

  for (let i = 0; i < n; i++) {
    let max = 0;
    for (let s = i * per; s < (i + 1) * per && s < data.length; s++) {
      const a = Math.abs(data[s]);
      if (a > max) max = a;
    }
    const bh = Math.max(2, max * h * 0.9);
    ctx.fillRect(i * (bw + 1), (h - bh) / 2, bw, bh);
  }
}

function drawStatic(
  ctx: CanvasRenderingContext2D,
  peaks: number[],
  w: number,
  h: number,
  progress: number
) {
  const { active, idle, progress: progressColor } = getColors();
  const n = peaks.length;
  if (n === 0) return;
  const bw = Math.max(1, w / n - 1);
  const px = progress * w;

  ctx.clearRect(0, 0, w, h);

  // Two-pass draw: idle bars first, then active bars (fewer fillStyle switches)
  ctx.fillStyle = idle;
  for (let i = 0; i < n; i++) {
    const x = i * (bw + 1);
    if (x + bw / 2 > px) {
      const bh = Math.max(2, peaks[i] * h * 0.85);
      ctx.fillRect(x, (h - bh) / 2, bw, bh);
    }
  }

  ctx.fillStyle = active;
  for (let i = 0; i < n; i++) {
    const x = i * (bw + 1);
    if (x + bw / 2 <= px) {
      const bh = Math.max(2, peaks[i] * h * 0.85);
      ctx.fillRect(x, (h - bh) / 2, bw, bh);
    }
  }

  // Playhead line
  if (progress > 0 && progress < 1) {
    ctx.fillStyle = progressColor;
    ctx.fillRect(Math.floor(px) - 1, 0, 2, h);
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
  const widthRef = useRef(0);

  const h = props.height ?? 120;

  // Stable draw function — assigned directly in render (no effect needed for refs)
  const drawRef = useRef<() => void>(() => {});
  drawRef.current = () => {
    const ctx = ctxRef.current;
    if (!ctx || widthRef.current === 0) return;

    if (props.mode === "static" && props.peaks && props.peaks.length > 0) {
      drawStatic(ctx, props.peaks, widthRef.current, h, props.progress ?? 0);
    } else if (props.mode === "static") {
      ctx.clearRect(0, 0, widthRef.current, h);
    }
  };

  // Resize observer — sizes canvas, caches context, triggers redraw
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
      if (ctx) ctx.scale(dpr, dpr);
      ctxRef.current = ctx;

      drawRef.current();
    }

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    return () => observer.disconnect();
  }, [h]);

  // Static mode: redraw on peaks/progress change
  const staticPeaks = props.mode === "static" ? props.peaks : null;
  const staticProgress = props.mode === "static" ? props.progress : undefined;
  useEffect(() => {
    if (props.mode !== "static") return;
    drawRef.current();
  }, [props.mode, staticPeaks, staticProgress]);

  // Live mode: animation loop (only starts when we have data)
  const liveData = props.mode === "live" ? props.analyserData : null;
  useEffect(() => {
    if (props.mode !== "live" || !liveData) return;

    const data = liveData;
    const loop = () => {
      const ctx = ctxRef.current;
      if (ctx && widthRef.current > 0) {
        drawLive(ctx, data, widthRef.current, h);
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [props.mode, liveData, h]);

  // Click-to-seek
  const seekable = props.mode === "static" && !!props.onSeek;
  const onSeekRef = useRef(props.mode === "static" ? props.onSeek : undefined);
  onSeekRef.current = props.mode === "static" ? props.onSeek : undefined;

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onSeekRef.current) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      onSeekRef.current(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
    },
    []
  );

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full", props.className)}
      style={{ height: h }}
    >
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className={cn("block w-full rounded-lg", seekable && "cursor-pointer")}
        style={{ height: h }}
        role="img"
        aria-label={
          seekable && props.mode === "static"
            ? `Audio waveform, ${Math.round((props.progress ?? 0) * 100)}% played`
            : "Audio waveform"
        }
      />
    </div>
  );
}
