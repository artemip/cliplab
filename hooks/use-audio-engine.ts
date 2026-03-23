"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  FILTER_REGISTRY,
  PRESETS,
  getDefaultParams,
  type FilterDefinition,
  type FilterPreset,
} from "@/lib/audio/filters";
import { AudioEngine, type ActiveFilter } from "@/lib/audio/engine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FilterState {
  definition: FilterDefinition;
  params: Record<string, number>;
  enabled: boolean;
}

export interface UseAudioEngineReturn {
  /** Current filter states */
  filters: FilterState[];
  /** Whether all filters are bypassed */
  bypassed: boolean;
  /** Whether monitor (headphone) output is enabled */
  monitorEnabled: boolean;
  /** Whether playback is looping */
  looping: boolean;
  /** Whether audio is currently playing */
  isPlaying: boolean;
  /** Current playback time in seconds */
  currentTime: number;
  /** Total duration in seconds */
  duration: number;
  /** Analyser data for waveform visualization */
  analyserData: Float32Array | null;
  /** Available presets */
  presets: FilterPreset[];
  /** Currently active preset (null if manually configured) */
  activePreset: string | null;

  // Actions
  toggleFilter: (id: string) => void;
  updateParam: (id: string, key: string, value: number) => void;
  resetFilter: (id: string) => void;
  toggleBypass: () => void;
  toggleMonitor: () => void;
  toggleLoop: () => void;
  applyPreset: (presetId: string) => void;
  applyFilterConfig: (config: Array<{ id: string; params: Record<string, number> }>) => void;
  resetAllFilters: () => void;
  play: (blob: Blob) => Promise<void>;
  stop: () => void;
  seek: (position: number) => void;
  renderWithFilters: (blob: Blob) => Promise<AudioBuffer>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAudioEngine(): UseAudioEngineReturn {
  const engineRef = useRef<AudioEngine | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const startTimeRef = useRef(0);
  const offsetRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const rebuildRafRef = useRef<number | null>(null);
  const pendingFiltersRef = useRef<FilterState[] | null>(null);

  const [filters, setFilters] = useState<FilterState[]>(() =>
    FILTER_REGISTRY.map((def) => ({
      definition: def,
      params: getDefaultParams(def),
      enabled: false,
    }))
  );
  const [bypassed, setBypassed] = useState(false);
  const [monitorEnabled, setMonitorEnabled] = useState(false);
  const [looping, setLooping] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [analyserData, setAnalyserData] = useState<Float32Array | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  // Refs for values needed in callbacks — synced via effect
  const filtersRef = useRef(filters);
  const bypassedRef = useRef(bypassed);
  const loopingRef = useRef(looping);

  useEffect(() => { filtersRef.current = filters; }, [filters]);
  useEffect(() => { bypassedRef.current = bypassed; }, [bypassed]);
  useEffect(() => { loopingRef.current = looping; }, [looping]);

  // Create engine on mount
  useEffect(() => {
    const engine = new AudioEngine();
    engineRef.current = engine;
    return () => engine.dispose();
  }, []);

  // Convert FilterState[] to ActiveFilter[] for the engine
  function getActiveFilters(): ActiveFilter[] {
    const current = bypassedRef.current ? [] : filtersRef.current;
    return current
      .filter((f) => f.enabled)
      .map((f) => ({
        definition: f.definition,
        params: f.params,
        enabled: true,
      }));
  }

  // Playback time tracking
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }

    const engine = engineRef.current;
    if (!engine) return;

    const analyser = engine.analyserNode;
    const dataArray = new Float32Array(analyser.fftSize);
    // Double-buffer
    const bufferB = new Float32Array(analyser.fftSize);
    let useA = true;

    const tick = () => {
      let elapsed = engine.context.currentTime - startTimeRef.current + offsetRef.current;
      // When looping, wrap elapsed time to stay within duration
      const buf0 = audioBufferRef.current;
      if (loopingRef.current && buf0 && buf0.duration > 0) {
        elapsed = elapsed % buf0.duration;
      }
      setCurrentTime(Math.max(0, elapsed));

      const buf = useA ? dataArray : bufferB;
      analyser.getFloatTimeDomainData(buf);
      setAnalyserData(buf);
      useA = !useA;

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [isPlaying]);

  // ---------------------------------------------------------------------------
  // Internal helpers (must be before Actions that reference them)
  // ---------------------------------------------------------------------------

  function startPlayback(buffer: AudioBuffer, offset: number) {
    const engine = engineRef.current;
    if (!engine) return;

    // Null out ref BEFORE stopping to prevent onended race
    // (Chrome fires onended synchronously on stop())
    const oldSource = sourceRef.current;
    sourceRef.current = null;
    if (oldSource) {
      try { oldSource.stop(); } catch { /* ok */ }
    }

    const source = engine.connectBuffer(buffer, getActiveFilters());
    source.loop = loopingRef.current;
    sourceRef.current = source;

    source.onended = () => {
      if (sourceRef.current === source) {
        setIsPlaying(false);
        sourceRef.current = null;
        if (!loopingRef.current) {
          offsetRef.current = 0;
          setCurrentTime(0);
        }
      }
    };

    const clampedOffset = Math.min(offset, buffer.duration - 0.01);
    startTimeRef.current = engine.context.currentTime;
    offsetRef.current = clampedOffset;
    source.start(0, clampedOffset);
    setIsPlaying(true);
  }

  function rebuildWithFilters(filterStates: FilterState[]) {
    const engine = engineRef.current;
    if (!engine) return;
    const active = bypassedRef.current ? [] : filterStates
      .filter((f) => f.enabled)
      .map((f) => ({ definition: f.definition, params: f.params, enabled: true }));
    // rebuildGraph disconnects + reconnects without stopping the source.
    // AudioBufferSourceNode keeps producing audio even while disconnected,
    // so no restart needed — the new filter chain picks up seamlessly.
    engine.rebuildGraph(active);
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const toggleFilter = useCallback((id: string) => {
    setActivePreset(null); // Manual change clears preset
    setFilters((prev) => {
      const next = prev.map((f) =>
        f.definition.id === id ? { ...f, enabled: !f.enabled } : f
      );
      // Rebuild graph — source keeps playing through the reconnect
      const engine = engineRef.current;
      if (engine) {
        const active = next.filter((f) => f.enabled).map((f) => ({
          definition: f.definition,
          params: f.params,
          enabled: true,
        }));
        engine.rebuildGraph(bypassedRef.current ? [] : active);
      }
      return next;
    });
  }, []);

  const updateParam = useCallback((id: string, key: string, value: number) => {
    setActivePreset(null);
    setFilters((prev) => {
      const next = prev.map((f) =>
        f.definition.id === id
          ? { ...f, params: { ...f.params, [key]: value } }
          : f
      );
      // Coalesce rapid slider updates into one rebuild per frame
      pendingFiltersRef.current = next;
      if (!rebuildRafRef.current) {
        rebuildRafRef.current = requestAnimationFrame(() => {
          rebuildRafRef.current = null;
          if (pendingFiltersRef.current) {
            rebuildWithFilters(pendingFiltersRef.current);
            pendingFiltersRef.current = null;
          }
        });
      }
      return next;
    });
  }, []);

  const resetFilter = useCallback((id: string) => {
    setActivePreset(null);
    setFilters((prev) => {
      const next = prev.map((f) =>
        f.definition.id === id
          ? { ...f, params: getDefaultParams(f.definition) }
          : f
      );
      rebuildWithFilters(next);
      return next;
    });
  }, []);

  const toggleBypass = useCallback(() => {
    setBypassed((prev) => {
      const next = !prev;
      bypassedRef.current = next;
      // When bypassing, pass empty filters; when un-bypassing, pass current filters
      // Rebuild graph — source keeps playing through the reconnect
      const engine = engineRef.current;
      if (engine) {
        const active = next ? [] : filtersRef.current
          .filter((f) => f.enabled)
          .map((f) => ({ definition: f.definition, params: f.params, enabled: true }));
        engine.rebuildGraph(active);
      }
      return next;
    });
  }, []);

  const toggleMonitor = useCallback(() => {
    setMonitorEnabled((prev) => {
      const next = !prev;
      engineRef.current?.setMonitor(next);
      return next;
    });
  }, []);

  const resetAllFilters = useCallback(() => {
    setActivePreset(null);
    setFilters((prev) => {
      const next = prev.map((f) => ({
        ...f,
        enabled: false,
        params: getDefaultParams(f.definition),
      }));
      rebuildWithFilters(next);
      return next;
    });
  }, []);

  const toggleLoop = useCallback(() => {
    setLooping((prev) => {
      const next = !prev;
      // Update the active source's loop property immediately
      if (sourceRef.current) {
        sourceRef.current.loop = next;
      }
      return next;
    });
  }, []);

  const applyPreset = useCallback((presetId: string) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    setActivePreset(presetId);
    setFilters((prev) => {
      const next = prev.map((f) => {
        const presetParams = preset.filters[f.definition.id];
        if (presetParams) {
          return {
            ...f,
            enabled: true,
            params: { ...getDefaultParams(f.definition), ...presetParams },
          };
        }
        return { ...f, enabled: false, params: getDefaultParams(f.definition) };
      });
      rebuildWithFilters(next);
      return next;
    });
  }, []);

  const applyFilterConfig = useCallback((config: Array<{ id: string; params: Record<string, number> }>) => {
    setActivePreset(null);
    setFilters((prev) => {
      const configMap = new Map(config.map((c) => [c.id, c.params]));
      const next = prev.map((f) => {
        const params = configMap.get(f.definition.id);
        if (params) {
          return { ...f, enabled: true, params: { ...getDefaultParams(f.definition), ...params } };
        }
        return f;
      });
      rebuildWithFilters(next);
      return next;
    });
  }, []);

  const play = useCallback(async (blob: Blob) => {
    const engine = engineRef.current;
    if (!engine) return;

    await engine.resume();
    engine.setMonitor(true); // Playback always outputs to speakers

    const arrayBuffer = await blob.arrayBuffer();
    const buffer = await engine.context.decodeAudioData(arrayBuffer);
    audioBufferRef.current = buffer;
    setDuration(buffer.duration);

    startPlayback(buffer, 0);
  }, []);

  const stop = useCallback(() => {
    if (sourceRef.current) {
      const engine = engineRef.current;
      if (engine) {
        offsetRef.current = engine.context.currentTime - startTimeRef.current + offsetRef.current;
      }
      const old = sourceRef.current;
      sourceRef.current = null;
      try { old.stop(); } catch { /* already stopped */ }
    }
    setIsPlaying(false);
  }, []);

  const seek = useCallback((position: number) => {
    const buffer = audioBufferRef.current;
    if (!buffer) return;
    const time = position * buffer.duration;
    offsetRef.current = time;
    setCurrentTime(time);
    if (sourceRef.current) {
      startPlayback(buffer, time);
    }
  }, []);

  const renderWithFilters = useCallback(async (blob: Blob) => {
    const engine = engineRef.current;
    if (!engine) throw new Error("Engine not initialized");

    const arrayBuffer = await blob.arrayBuffer();
    const buffer = await engine.context.decodeAudioData(arrayBuffer);
    return engine.renderOffline(buffer, getActiveFilters());
  }, []);

  return {
    filters,
    bypassed,
    monitorEnabled,
    looping,
    isPlaying,
    currentTime,
    duration,
    analyserData,
    presets: PRESETS,
    activePreset,
    toggleFilter,
    updateParam,
    resetFilter,
    resetAllFilters,
    toggleBypass,
    toggleMonitor,
    toggleLoop,
    applyPreset,
    applyFilterConfig,
    play,
    stop,
    seek,
    renderWithFilters,
  };
}
