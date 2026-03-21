# ClipLab

Record audio in the browser, apply stackable filters (gain, EQ, compression, delay), preview with real-time playback, and share clips via short URLs.

## Quick Start

```bash
pnpm install
pnpm db:push
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Stack

Next.js 15 + Tailwind v4 + shadcn/ui + Hono + Drizzle (SQLite) + Vitest — mirrors Arena's production stack.

## Architecture

**Audio pipeline**: Record raw via MediaRecorder → preview with filters via Web Audio API → export via OfflineAudioContext (bakes filters into WAV) → upload to backend. Filters are non-destructive — tweak after recording, bake only on export.

**Filter system**: Each filter is a plain `FilterDefinition` object with a `createNodes(ctx, params)` factory. No class hierarchy. Adding a filter = adding one object to a flat array. See [DECISIONS.md](./DECISIONS.md) for the full reasoning.

## Commands

| Command | What |
|---------|------|
| `pnpm dev` | Dev server |
| `pnpm test` | Vitest (41 tests) |
| `pnpm typecheck` | tsc --noEmit |
| `pnpm lint` | ESLint |
| `pnpm db:push` | Push schema to SQLite |

## What's Built

- 5 composable audio filters (gain, low-pass, high-pass, compressor, delay)
- Audio engine with graph rebuild, offline rendering, monitor toggle
- MediaRecorder wrapper with state machine and mic permission handling
- WAV encoder (client) + WAV peak parser (server) with round-trip test coverage
- Hono API with Zod validation and structured error responses
- Dark-only design system with warm amber accent and full CSS custom property tokens
- 41 unit tests

## What's Intentionally Skipped

- Auth / user accounts (all clips public)
- Cloud storage (local filesystem — S3 is the production path)
- Deployment config / Docker
- Audio format conversion (WAV only — Opus for production)
- Filter reordering UI (fixed order)

See [DECISIONS.md](./DECISIONS.md) for detailed tradeoff reasoning.
