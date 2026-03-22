"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface SliderProps {
  min?: number
  max?: number
  step?: number
  value?: number[]
  defaultValue?: number[]
  onValueChange?: (value: number[]) => void
  className?: string
  "aria-label"?: string
}

/**
 * Simple range slider — replaces @base-ui/react Slider to avoid the
 * <script> tag console warning. Single-thumb only.
 */
function Slider({
  min = 0,
  max = 100,
  step = 1,
  value,
  defaultValue,
  onValueChange,
  className,
  "aria-label": ariaLabel,
}: SliderProps) {
  const currentValue = value?.[0] ?? defaultValue?.[0] ?? min
  const percent = ((currentValue - min) / (max - min)) * 100

  return (
    <div className={cn("relative flex w-full touch-none items-center select-none", className)} data-slot="slider">
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="absolute h-full bg-primary"
          style={{ width: `${percent}%` }}
          data-slot="slider-range"
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={currentValue}
        onChange={(e) => onValueChange?.([parseFloat(e.target.value)])}
        className={cn(
          "peer absolute inset-0 h-full w-full cursor-pointer opacity-0",
          "[&::-webkit-slider-thumb]:appearance-none",
        )}
        aria-label={ariaLabel}
      />
      {/* Visual thumb — shows focus ring when input is focused */}
      <div
        className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-ring bg-foreground transition-shadow top-1/2 peer-focus-visible:shadow-[var(--focus-ring)]"
        style={{ left: `clamp(6px, ${percent}%, calc(100% - 6px))` }}
        data-slot="slider-thumb"
      />
    </div>
  )
}

export { Slider }
