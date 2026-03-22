"use client";

import { useState } from "react";
import { ChevronDown, RotateCcw, Power } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import type { FilterState } from "@/hooks/use-audio-engine";
import type { FilterPreset } from "@/lib/audio/filters";

interface FilterRackProps {
  filters: FilterState[];
  presets: FilterPreset[];
  bypassed: boolean;
  activePreset: string | null;
  onToggleFilter: (id: string) => void;
  onUpdateParam: (id: string, key: string, value: number) => void;
  onResetFilter: (id: string) => void;
  onToggleBypass: () => void;
  onApplyPreset: (presetId: string) => void;
}

// Filters to expand by default (the most transformative for vocals)
const DEFAULT_EXPANDED = new Set(["compressor", "delay"]);

export function FilterRack({
  filters,
  presets,
  bypassed,
  activePreset,
  onToggleFilter,
  onUpdateParam,
  onResetFilter,
  onToggleBypass,
  onApplyPreset,
}: FilterRackProps) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(DEFAULT_EXPANDED)
  );

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {/* Presets + bypass */}
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((preset) => {
          const isActive = activePreset === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => onApplyPreset(preset.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium min-h-[44px] flex items-center",
                "transition-all active:scale-95",
                "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
                isActive
                  ? "bg-[var(--accent)] text-[var(--accent-foreground)] shadow-sm"
                  : "bg-[var(--accent-surface)] text-[var(--accent)] hover:bg-[var(--accent-surface-hover)]"
              )}
              aria-pressed={isActive}
            >
              {preset.name}
            </button>
          );
        })}

        {/* Bypass all */}
        <button
          onClick={onToggleBypass}
          className={cn(
            "ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium min-h-[44px] transition-all active:scale-95",
            "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
            bypassed
              ? "bg-[var(--destructive-surface)] text-[var(--destructive)]"
              : "bg-[var(--bg-interactive)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          )}
          aria-label={bypassed ? "Enable all filters" : "Bypass all filters"}
        >
          <Power className="h-3 w-3" aria-hidden="true" />
          {bypassed ? "Bypassed" : "Bypass"}
        </button>
      </div>

      {/* Filter cards */}
      <div
        className={cn(
          "space-y-2 transition-opacity",
          bypassed && "opacity-[var(--opacity-dimmed)] pointer-events-none"
        )}
      >
        {filters.map((filter) => {
          const isExpanded = expanded.has(filter.definition.id);
          const isEnabled = filter.enabled;

          return (
            <div
              key={filter.definition.id}
              className={cn(
                "rounded-lg border bg-[var(--bg-elevated)] transition-colors",
                isEnabled
                  ? "border-l-2 border-l-[var(--accent)] border-[var(--border-default)]"
                  : "border-[var(--border-default)]"
              )}
            >
              {/* Header */}
              <div className="flex items-center gap-3 px-3 py-3">
                <Switch
                  checked={isEnabled}
                  onCheckedChange={() => onToggleFilter(filter.definition.id)}
                  aria-label={`${isEnabled ? "Disable" : "Enable"} ${filter.definition.name}`}
                />
                <button
                  onClick={() => toggleExpanded(filter.definition.id)}
                  className="flex flex-1 items-center gap-2 text-left rounded min-h-[44px] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                  aria-expanded={isExpanded}
                  aria-controls={`${filter.definition.id}-params`}
                >
                  <div className="flex-1">
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {filter.definition.name}
                    </span>
                    <span className="ml-2 text-xs text-[var(--text-tertiary)]">
                      {filter.definition.description}
                    </span>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-[var(--text-tertiary)] transition-transform",
                      isExpanded && "rotate-180"
                    )}
                    aria-hidden="true"
                  />
                </button>
              </div>

              {/* Params (collapsible with animation) */}
              <div
                className="grid transition-[grid-template-rows] duration-[var(--duration-normal)]"
                style={{
                  gridTemplateRows: isExpanded ? "1fr" : "0fr",
                  transitionTimingFunction: "var(--ease-default)",
                }}
              >
                <div className="overflow-hidden">
                <div
                  id={`${filter.definition.id}-params`}
                  className="border-t border-[var(--border-default)] px-3 py-3 space-y-3"
                >
                  {filter.definition.params.map((param) => (
                    <div key={param.key} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-[var(--text-secondary)]">
                          {param.label}
                        </span>
                        <span className="tabular-nums text-xs text-[var(--text-tertiary)]">
                          {filter.params[param.key]?.toFixed(
                            param.step < 1
                              ? Math.max(0, -Math.floor(Math.log10(param.step)))
                              : 0
                          )}
                          {param.unit ? ` ${param.unit}` : ""}
                        </span>
                      </div>
                      <Slider
                        min={param.min}
                        max={param.max}
                        step={param.step}
                        value={[filter.params[param.key] ?? param.default]}
                        onValueChange={(val) => {
                          const v = Array.isArray(val) ? val[0] : val;
                          onUpdateParam(filter.definition.id, param.key, v);
                        }}
                        aria-label={`${filter.definition.name} ${param.label}`}
                      />
                      {param.hint && (
                        <p className="text-xs text-[var(--text-tertiary)]">
                          {param.hint}
                        </p>
                      )}
                    </div>
                  ))}

                  {/* Reset button */}
                  <button
                    onClick={() => onResetFilter(filter.definition.id)}
                    className={cn(
                      "flex items-center gap-1 text-xs text-[var(--text-tertiary)] min-h-[44px]",
                      "transition-colors hover:text-[var(--text-secondary)] active:scale-95",
                      "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                    )}
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                    Reset to defaults
                  </button>
                </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
