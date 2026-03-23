# ClipLab

Record audio in the browser, apply stackable filters, preview with real-time playback, and share clips via short URLs.

## Quick Start

```bash
pnpm install
pnpm db:push
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Record something, apply some filters, save it, share the link.

## What It Does

**Record** — one tap to start, live waveform while recording, Space bar shortcut. Headphone monitoring toggle for vocalists.

**Filter** — 6 stackable filters (gain, low-pass, high-pass, compressor, reverb, delay) as composable modules. Each is a plain `FilterDefinition` object with a `createNodes` factory — adding a new filter is one object, zero engine changes. 4 one-tap presets (Warm Vocal, Lo-Fi Radio, Ambient Space, Megaphone) lower the floor. Individual sliders with parameter hints raise the ceiling.

**Preview** — non-destructive pipeline. Filters apply at playback time, bake on export via OfflineAudioContext. Toggle filters, adjust params, bypass all for A/B — all without re-recording. Loop playback for continuous tweaking.

**Share** — save clips with filters baked into WAV. Feed with inline playback, mini waveforms, filter badges. Clip detail page with full waveform, seek, share-to-clipboard.

## Stack

Next.js 15 + Tailwind v4 + shadcn/ui + Hono + Drizzle (SQLite) + Vitest + Zod + TypeScript strict. Mirrors Arena's production stack.

## Architecture

```
Record: mic → MediaRecorder → raw Blob
Preview: Blob → AudioBuffer → filter graph → speakers
Export:  AudioBuffer → OfflineAudioContext + filters → WAV → upload
```

See [DECISIONS.md](./DECISIONS.md) for detailed reasoning on every architectural choice.

## Commands

| Command | What |
|---------|------|
| `pnpm dev` | Dev server |
| `pnpm test` | Vitest (79 tests) |
| `pnpm typecheck` | tsc --noEmit |
| `pnpm lint` | ESLint |
| `pnpm db:push` | Push schema to SQLite |

## What's Intentionally Skipped

- **Auth / user accounts** — all clips are public. Production would add session-based auth.
- **Cloud storage** — local filesystem. Production would use S3/R2 with CDN.
- **Opus encoding** — WAV only (~10x larger). Production would encode to Opus.
- **Filter reordering** — fixed order. Drag-to-reorder is a stretch goal.
- **Deployment config** — no Docker/CI. `pnpm dev` just works.

## Key Tradeoffs

| Decision | Why |
|----------|-----|
| Non-destructive filters | Users tweak after recording. Strictly better UX. |
| Full graph rebuild | O(n) microseconds, eliminates incremental mutation bugs. |
| SQLite over Postgres | Zero deps. Drizzle makes Postgres swap a config change. |
| WAV over WebM/Opus | Universal playback. Trivial server-side peak generation. |
| Canvas over SVG | 60fps real-time waveform needs canvas, not DOM. |
| Filters as data | Plain objects > class hierarchy. Flat array, composable. |

## Next Steps

If continuing this project:
- Opus encoding for 10x smaller files
- S3/R2 for audio storage with CDN
- Postgres for multi-user concurrent writes
- Crossfade on graph rebuild (eliminate audio discontinuity)
- Drag-to-scrub on waveform
- Filter reordering via drag-and-drop
- Undo history on filter parameters
