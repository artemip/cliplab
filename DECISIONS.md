# DECISIONS.md

Architecture, product, and design decisions for ClipLab — and the reasoning behind them. Written for reviewers who want to understand how we think, not just what we built.

---

## Audio Architecture

### Non-destructive filter pipeline

We record raw audio via MediaRecorder and apply filters at playback time through a Web Audio API node graph. When the user is ready to share, we bake filters into the final WAV using an OfflineAudioContext. This means users can toggle filters on and off, adjust parameters, and A/B compare — all without re-recording. It's how every serious DAW works, and it's strictly better UX than the simpler alternative of recording through the filter chain.

The tradeoff is complexity: we manage two audio paths (live preview graph and offline render graph) instead of one. Worth it for the user experience.

### Filters as composable data, not a class hierarchy

Each filter is a plain `FilterDefinition` object with a `createNodes(ctx, params)` factory function. The full set of filters lives in a flat array (`FILTER_REGISTRY`). Adding a new filter means adding one object — no engine changes, no base class, no registration ceremony.

The factory returns `AudioNode[]` (not a single node) because some filters genuinely need multiple nodes wired together. The delay filter, for example, builds a parallel dry/wet routing graph with a feedback loop — four internal nodes behind a two-element array interface. This was the key design insight that made the abstraction work cleanly.

We considered a class hierarchy (`class GainFilter extends BaseFilter`) but filters don't share behavior — they share an interface. A flat array of objects is simpler, more testable, and composes better.

### Full graph rebuild on every change

When any filter is toggled or a parameter changes, we disconnect the entire audio graph and reconnect from scratch. This is O(n) where n is the number of filters (always < 10) and takes microseconds. The alternative — surgical connect/disconnect of individual nodes — would save no perceptible time but introduce an entire category of state management bugs (dangling connections, orphaned feedback loops, nodes wired to the wrong destination).

The tradeoff: a rebuild can produce a brief audio discontinuity at the splice point. For slider drags it's imperceptible. For toggling the delay filter, echoes restart rather than blending out. Acceptable for this scope; production would crossfade between old and new graphs.

### WAV over WebM/Opus

We encode to WAV (PCM) on the client and upload `.wav` files. WAV is universally playable across every browser and OS, and server-side peak generation is trivial — just read the PCM samples and bucket the amplitudes. WebM/Opus from MediaRecorder has inconsistent cross-browser support and would require a proper audio decoder on the server for waveform generation.

The tradeoff is file size: WAV is ~10x larger than Opus. For a demo with local filesystem storage and short clips, this doesn't matter. Production would encode to Opus.

---

## Stack & Infrastructure

### Mirrors Arena's stack

Next.js 15 + Tailwind v4 + shadcn/ui + Hono + Vitest + Zod + TypeScript strict. This is Arena's own stack — every pattern in this codebase is directly transferable to their product. We deliberately matched it to demonstrate fluency rather than personal preference.

### SQLite over Postgres

SQLite via Drizzle ORM gives us zero external dependencies — `pnpm install && pnpm dev` just works, no Docker, no connection strings, no provisioning. Drizzle's dialect-agnostic schema means swapping to Postgres is a config change plus a driver import. For a single-user demo, SQLite is the right tool. For production multi-user, Postgres is the obvious upgrade.

### Filesystem over S3

Audio files live in an `uploads/` directory. For an interview demo, this is the simplest thing that works — and simplicity is a deliberate choice, not a shortcut. We document S3 as the production path in the README.

### Hono for API routes

Thin controllers in `hono/`, business logic in `lib/api/`. We chose Hono over raw Next.js API routes for the same reasons Arena did: middleware composability, clean error handling, and a framework that stays out of the way. Zod validates all external input at the boundary; ZodErrors become structured 400 responses with field-level issues.

---

## Product & UX

### Warm amber accent

`#f59e0b` evokes VU meters, analog warmth, and tube amp glow. It's an intentional departure from the blue/cyan of typical dev tools — this is an audio app, and it should feel like one. The full token ramp (accent, hover, muted, surface, border, foreground) gives enough flexibility for all interactive states without ever reaching for a hardcoded hex value.

### Canvas waveforms

The waveform is the primary visual element of the entire app. During recording it needs 60fps updates from the AnalyserNode; during playback it needs click-to-seek with a moving playhead. Canvas redraws the entire frame each tick with no DOM manipulation. SVG would require updating hundreds of elements per frame, causing layout thrashing. WebGL is overkill. Canvas is the right tool.

### Raw mic capture (no browser processing)

We pass `{ audio: true }` to `getUserMedia` without disabling browser audio processing (noise suppression, echo cancellation). For podcast/voice clips this is fine — browser defaults improve quality. For lo-fi music or raw capture, users may want unprocessed audio. A stretch goal is to add `{ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }` as a "raw mode" toggle.

### Auto-replay on filter toggle

When a user toggles a filter during preview, playback restarts from the current position with the new filter state applied. The connection between gesture and sound should be instant — if the user has to manually press play to hear the difference, the feedback loop is broken and the app feels like a settings panel instead of an instrument.

### One-tap recording

Tapping the mic button requests permission AND starts recording in one action. No intermediate "ready" state where the user has to tap again. This matches Voice Memos' one-tap UX. The `useRecorder` hook's `requestMic()` calls `startRecordingWithStream()` immediately after `getUserMedia` succeeds.

### Presets for lowering the floor

Three one-tap presets (Warm Vocal, Lo-Fi Radio, Ambient Space) configure multiple filters at once. A beginner taps "Warm Vocal" and hears compression + reverb applied instantly — no need to understand what "threshold" or "ratio" mean. Individual sliders remain available for power users who want fine control. Lower the floor, raise the ceiling.

### Two AudioEngine instances on the record page

One engine handles live mic monitoring during recording (connected to the MediaStream). A separate engine (via `useAudioEngine` hook) handles playback with filters after recording stops. This avoids conflicts between the recording and playback audio graphs — they have different sources, different filter chains, and different destinations.

---

## Design System

### Dark-only

No light mode. One theme, done well. Every color comes from CSS custom properties defined in `globals.css` — no hardcoded hex values in components, no pure white or black anywhere. The token system covers backgrounds (3 tiers), text (3 tiers), accent (full ramp), semantic colors (destructive, success, info), audio-specific tokens (waveform states, recording pulse), animation durations, focus rings, and overlays.

### Tailwind spacing defaults

We use Tailwind's built-in 4px spacing scale rather than custom `--space-*` tokens. Custom tokens would add indirection without value at this project's scale. This is a deliberate decision, not an oversight — documented here so reviewers know we considered it.

---

## What We'd Do Differently in Production

- **Opus encoding** for 10x smaller files and streaming-friendly format
- **S3 / R2** for audio storage with CDN distribution
- **Postgres** for multi-user, concurrent writes, full-text search
- **Crossfade on graph rebuild** to eliminate audio discontinuities
- **Auth + per-user feeds** via session-based auth or OAuth
- **Infinite scroll** with cursor-based pagination on the feed
- **Filter reordering** via drag-and-drop (signal chain order matters creatively)
- **Undo history** on filter parameter changes (Cmd+Z)
