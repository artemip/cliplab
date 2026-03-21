# CLAUDE.md — ClipLab Development Constitution

> Record, filter, and share audio clips. Clean abstractions, world-class UX.

## What Is ClipLab

A web app for recording audio in the browser, applying stackable audio filters (gain, EQ, compression, delay), previewing filtered playback, and uploading clips to a shared feed. Built as a take-home for Arena (formerly LMArena, the AI evaluation platform from UC Berkeley).

## Stack

Mirrors Arena's own stack intentionally — Next.js + Tailwind + shadcn + Hono + Vitest:

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript (strict), Tailwind CSS v4
- **UI**: shadcn/ui + Radix primitives, Lucide icons, `cn()` for conditional classes
- **Backend**: Hono (thin controllers in `hono/`, logic in `lib/api/`)
- **Database**: SQLite via Drizzle ORM (`lib/db/`) — SQLite for zero-dep demo, Drizzle makes Postgres swap trivial
- **Audio**: Web Audio API + MediaRecorder (client), WAV peak generation (server)
- **Validation**: Zod for all external input
- **Storage**: Filesystem (`uploads/`) for audio files
- **Testing**: Vitest

## Architecture

### Audio Pipeline

```
Record: mic → MediaRecorder → raw Blob (no filters)
Preview: raw Blob → AudioBuffer → filter graph → speakers
Export:  AudioBuffer → OfflineAudioContext + filters → WAV → upload
```

Filters are non-destructive. Users record raw, preview w/ filters, then bake filters on export via OfflineAudioContext.

### Filter Abstraction

Each filter is a `FilterDefinition` — a plain object w/ a `createNodes(ctx, params)` factory. No class hierarchy. The audio engine chains enabled filters in sequence and rebuilds the graph on any change.

```
source → [gain] → [lowpass] → [compressor] → [delay] → destination
```

Graph rebuilds on every filter toggle/param change. O(n) where n < 10, takes microseconds.

## Project Structure

```
app/              # Next.js pages + API catch-all
components/       # React components (audio/, ui/)
lib/              # Business logic
  audio/          # Filter definitions, engine, recorder, waveform, buffer utils
  api/            # Server-side clip CRUD
  db/             # Drizzle schema + connection
  schemas/        # Zod validation
hooks/            # React hooks (use-audio-engine, use-recorder, use-waveform)
hono/             # Hono router + route handlers
uploads/          # Audio files (gitignored)
```

## Rules

### TypeScript
- `strict: true`. No `any` except at system boundaries w/ explicit casts.
- Zod for ALL external input (API params, form data).
- `@/` import alias. No relative paths crossing 2+ levels.
- `cn()` for conditional classes. Never string concatenation.

### UI
- Dark-only. No light mode. No pure white (`#FFF`) or pure black (`#000`).
- All colors via CSS custom properties. No hardcoded hex in components.
- Every view handles 4 states: loading (skeleton), empty (headline + CTA), data, error (actionable + recovery).
- `tabular-nums` on all numeric data (durations, timestamps, counts).
- `text-balance` on headings.
- Canvas for waveforms (not SVG — needs 60fps).
- Signs of taste: <100ms interactions, short URL slugs (nanoid, no UUIDs), persistent state, max 3 colors/view, no visible scrollbars, optical alignment, copy-to-clipboard on share URLs.

### Audio
- Record RAW, filter on playback. Never bake filters during recording.
- OfflineAudioContext for export — bakes filters into WAV.
- WAV format for uploads — universal playback, trivial server-side peak generation.
- Filters are pure data (`FilterDefinition[]`), not class instances.

### API
- Hono handlers are thin controllers. Business logic in `lib/api/`.
- Zod validates all input at the boundary.
- Structured error responses: `{ error: string }`.

### DECISIONS.md
- Living document, refined as we build. Not a changelog — a curated, reviewer-facing summary of architecture/product/design decisions.
- When a material decision is made (architecture, product, design approach), update the relevant section of DECISIONS.md in the same commit.
- Don't log micro-decisions (variable names, import order). Only decisions a reviewer would care about.
- Keep it readable — organized by category, each decision explains what we chose, what we rejected, and why.

### Pre-PR Checklist
- Run `/simplify` on all changed files before committing a PR. This catches complexity, duplication, and dead code before reviewers see it.
- `pnpm lint && pnpm typecheck && pnpm test` must all pass before pushing.

### Reviews
- Every PR goes through 4 agent reviewers: arena-reviewer (Wei-Lin), user-reviewer (Alex), design-reviewer, code-simplifier.
- Target: 9+/10 from all agents before merge.
- Local: `./scripts/review.sh` (ratings) or `./scripts/review.sh --fixup` (auto-iterate).
- GitHub: `claude-review.yml` runs all 4 agents in parallel on every PR via `anthropics/claude-code-action@v1`. Each posts a comment with rating.

### Git
- Conventional commits: `feat:`, `fix:`, `chore:`, `test:`, `docs:`.

## Quick Reference

```bash
pnpm dev          # Dev server
pnpm lint         # ESLint
pnpm typecheck    # tsc --noEmit
pnpm test         # Vitest
pnpm db:push      # Push schema to SQLite
```

## ClipLab Will Never

1. **Real-time collaboration** — single-user recording tool.
2. **User auth** — all clips are public, no accounts.
3. **Audio format conversion** — WAV in, WAV out.
4. **Cloud storage** — local filesystem for demo scope.
5. **DAW features** — no timeline, no multitrack, no MIDI.
