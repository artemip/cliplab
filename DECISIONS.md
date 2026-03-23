# DECISIONS.md

Architecture, product, and design decisions for ClipLab — and the reasoning behind them.

---

## Audio Pipeline

### Non-destructive filter chain

We record raw audio via MediaRecorder and apply filters at playback time through a Web Audio API node graph. When the user saves, we bake filters into WAV via OfflineAudioContext. Users can toggle filters, adjust parameters, and A/B compare — all without re-recording. It's how every serious DAW works and it's strictly better UX than recording through the filter chain.

Both the raw (unfiltered) and rendered audio are stored on save. This enables re-editing: open a saved clip, toggle different filters on the raw source, and save again — either in-place or as a new copy. The raw blob round-trips through storage without ever being modified.

The tradeoff is complexity — two audio paths (live preview graph and offline render graph), two stored files per clip, and an engine that manages graph state across both. Worth it.

### Filters as composable data

Each filter is a plain `FilterDefinition` object with a `createNodes(ctx, params)` factory. The full registry is a flat array. Adding a filter means adding one object — no engine changes, no base class, no registration ceremony.

The factory returns `AudioNode[]` (not a single node) because some filters need multiple nodes. The delay filter builds a parallel dry/wet routing graph with a feedback loop — four internal nodes behind a two-element interface. This was the key insight that made the abstraction work: expose a uniform chain interface, let internals be as complex as needed.

We considered a class hierarchy (`class GainFilter extends BaseFilter`) but filters don't share behavior — they share an interface. A flat array of objects is simpler, testable, and composable.

### Full graph rebuild, no restart

When any filter is toggled or a parameter changes, we disconnect the entire graph and reconnect from scratch. The `AudioBufferSourceNode` keeps producing audio even while disconnected — the new filter chain picks up seamlessly with no audible gap. This means users hear filter changes instantly during playback without any restart.

The rebuild is O(n) where n < 10 and takes microseconds. Surgical connect/disconnect of individual nodes would save no perceptible time but introduce state management bugs (dangling connections, orphaned feedback loops). For rapid slider drags, we coalesce parameter updates via `requestAnimationFrame` so at most one rebuild happens per frame.

The tradeoff: delay echoes restart rather than blending out on toggle. Acceptable for demo scope; production would crossfade between old and new graphs.

### WAV over WebM/Opus

We encode to WAV (PCM) on the client. WAV is universally playable and server-side peak generation is trivial — read PCM samples, bucket the amplitudes, done. WebM/Opus from MediaRecorder has inconsistent cross-browser support and would require an audio decoder on the server for waveform generation.

The tradeoff is ~10x larger files. For a demo with local storage and short clips, irrelevant. Production would encode to Opus.

---

## Stack & Infrastructure

### Mirrors Arena's stack

Next.js 15 + Tailwind v4 + shadcn/ui + Hono + Vitest + Zod + TypeScript strict. Every pattern in this codebase is directly transferable to Arena's product. Deliberately matched to demonstrate fluency.

### SQLite over Postgres

SQLite via Drizzle ORM — zero external dependencies. `pnpm install && pnpm dev` just works. Drizzle's dialect-agnostic schema means swapping to Postgres is a config change plus a driver import. For a single-user demo, SQLite is the right tool.

### Hono for API routes

Thin controllers in `hono/`, business logic in `lib/api/`. Same reasons Arena chose Hono: middleware composability, clean error handling, a framework that stays out of the way. Zod validates all external input at the boundary.

---

## Product & UX

### One-tap recording

Tapping the mic button requests permission AND starts recording in one action. No intermediate "ready" state. This matches Voice Memos' one-tap UX — the `useRecorder` hook calls `startRecordingWithStream()` immediately after `getUserMedia` succeeds.

### Presets lower the floor, sliders raise the ceiling

Four one-tap presets (Warm Vocal, Lo-Fi Radio, Ambient Space, Megaphone) configure multiple filters at once. A beginner taps "Warm Vocal" and hears compression + reverb instantly — no need to understand "threshold" or "ratio." Individual sliders remain available for power users who want fine control.

### Save vs Save copy

The clip editor offers both "Save" (PATCH — overwrites in-place) and "Save copy" (POST — creates a new clip). Save-in-place is what users expect from "Edit." Save-copy exists for the fork-and-experiment workflow. Both re-render from raw audio through OfflineAudioContext, so the stored WAV always reflects the current filter config.

### Duplicate clip names allowed

We don't enforce unique names. A user might record three takes of "Morning melody" — the content is clearly different on listen, and nanoid IDs in URLs distinguish them. Forcing unique names would add friction for zero benefit. Names are identifiers for humans, not keys for machines.

### Two AudioEngine instances on the record page

One engine handles live mic monitoring (connected to MediaStream). A separate engine handles filtered playback after recording stops. They have different sources, different filter chains, and different destinations — combining them would create conflicts.

### Canvas waveforms

The waveform is the primary visual element. During recording it needs 60fps updates from AnalyserNode; during playback it needs click-to-seek with a moving playhead. Canvas redraws the entire frame each tick with zero DOM manipulation. SVG would thrash layout updating hundreds of elements per frame.

---

## Design System

### Dark-only, warm amber accent

No light mode — one theme, done well. `#f59e0b` evokes VU meters and analog warmth. Every color comes from CSS custom properties — no hardcoded hex in components. The token system covers backgrounds (3 tiers), text (3 tiers), full accent ramp, semantic colors, audio-specific tokens (waveform states, recording pulse), animation durations, focus rings, and overlays.

### Styled confirm dialogs over native

All destructive actions (discard recording, discard edits, leave with unsaved work) use a custom `ConfirmDialog` component backed by Radix Dialog. `window.confirm()` renders white system chrome that breaks the dark theme at the most emotionally charged moments. The dialog is reusable — 47 lines, used in 3 places.

---

## What We'd Do Differently in Production

- **Opus encoding** — 10x smaller files, streaming-friendly
- **S3 / R2** — audio storage w/ CDN distribution
- **Postgres** — multi-user, concurrent writes, full-text search
- **Crossfade on graph rebuild** — eliminate audio discontinuities
- **Auth + per-user feeds** — session-based auth or OAuth
- **Filter reordering** — drag-and-drop (signal chain order matters creatively)
- **Undo history** — Cmd+Z on filter parameter changes
