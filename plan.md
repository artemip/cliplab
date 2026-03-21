# ClipLab — Roadmap

## Context

Take-home interview for Arena (formerly LMArena — AI evaluation platform, UC Berkeley, Angelopoulos/Chiang/Stoica, $1.7B). Their stack is NextJS + Tailwind + ShadCN + HonoJS + Postgres + Vitest — we mirror it exactly. 3-day window, 4-8 hours max. Arena cares about: how you think about problems/products, clean UX, thoughtful abstractions (filters as composable modules), good refactoring, reasonable error handling + state management.

## Architecture

**Audio pipeline**: Record raw via MediaRecorder → preview w/ filters via Web Audio API graph → export via OfflineAudioContext (bakes filters into final WAV) → upload to backend. Filters are non-destructive — users tweak after recording, bake only on export.

**Filter abstraction**: Each filter is a plain `FilterDefinition` object w/ a `createNodes(ctx, params)` factory returning `AudioNode[]`. No classes. Flat `FILTER_REGISTRY` array. Adding a filter = adding one object.

**AudioContext lifecycle**: One context per session, created on first user gesture. Shared between recorder (MediaStreamSource) and engine (filter graph). `dispose()` on unmount. Chrome/Safari require user gesture to `resume()`.

**Graph rebuild**: On any filter change, disconnect all nodes and reconnect from scratch. O(n) where n<10, microseconds. Eliminates incremental mutation bugs. Tradeoff: delay echoes restart (no state transfer). Production would crossfade.

**Known risks**: Safari OfflineAudioContext quirks, WAV header parsing edge cases (graceful degradation), iOS background tab suspension (`audioContext.state === 'interrupted'`), WAV file size (~10MB/min, fine for demo).

**Storage**: SQLite (Drizzle ORM) for metadata, filesystem (`uploads/`) for audio. Zero external deps.

## UX Principles

- Record button: large glowing amber circle, visual anchor of the app. Pulses red during recording. Fixed bottom on mobile (thumb zone).
- Live input visualization during recording is non-negotiable — users must see their voice moving something.
- Filter rack: top 2 filters expanded by default (show sliders, not collapsed cards). Continuous slider updates on `input` (not release). Per-filter reset. Global bypass for A/B.
- Auto-replay on filter toggle: playback restarts from current position with new filter state. Gesture → sound connection must be instant.
- Every view: 4 states (loading/empty/data/error). No dead ends.
- Feed: inline playback (one clip at a time), filter badges, mini waveforms.
- Detail: full waveform + player + metadata + copy-to-clipboard share URL w/ toast.
- Dark-only. Amber accent (#f59e0b). No pure white/black. All colors via CSS custom properties.
- Signs of taste: <100ms interactions, nanoid slugs (no UUIDs), tabular-nums, hidden scrollbars, canvas waveforms (60fps).

## Review Process

Every PR goes through 4 agent reviewers (Wei-Lin/arena, Alex/user, design, code-simplifier) targeting 9+/10. Local: `./scripts/review.sh --fixup`. GitHub: `claude-review.yml` runs all 4 in parallel on PRs.

---

Each item below is a PR. Each PR is independently testable, shippable, and goes through agent review. Ordered by dependency.

Status legend: `[ ]` not started, `[~]` in progress, `[x]` done

---

## PR 1: Audio engine + filter tests `[ ]`
> The core abstraction Arena will scrutinize. Must be clean, composable, testable.

**Build:**
- `lib/audio/filters.ts` — refine 5 filter definitions (gain, low-pass, high-pass, compressor, delay). Clean up existing code per simplifier feedback.
- `lib/audio/engine.ts` — refine AudioEngine class. Fix duplicate JSDoc. Extract `safeDisconnect` helper.
- `lib/audio/recorder.ts` — new. MediaRecorder factory (requestMic, start, stop → Blob). States: idle, requesting, ready, recording, stopped.
- `lib/audio/utils.ts` — new. Merge waveform + buffer utils: `generatePeaks`, `blobToAudioBuffer`, `audioBufferToWav`.
- `lib/audio/waveform-server.ts` — refine server-side WAV peak parser.

**Testing approach:**
Extensive unit tests for all audio lib code. Use real `OfflineAudioContext` (not mocks) to verify actual audio behavior — filters should demonstrably affect audio output (amplitude, frequency content, duration). Test edge cases (empty buffers, zero gain, max feedback). Test the WAV encoder round-trips correctly. Test the server-side peak parser handles valid + invalid + different bit-depth WAVs gracefully.

**Success criteria:**
- `pnpm test` — all tests pass, zero skips
- `pnpm typecheck` — clean
- Filter tests prove real audio behavior, not just "returns a node"
- No UI needed — pure lib code

**Blocked by:** nothing

---

## PR 2: shadcn/ui components + design token polish `[ ]`
> Foundation for all UI work. Must land before any component PRs.

**Build:**
- Init shadcn: button, card, switch, slider, input, badge, skeleton, dialog, sonner (toast)
- `components/ui/button.tsx` — add `accent` variant (amber bg, dark text, hover state)
- `globals.css` additions: `.tabular-nums` utility, `--transition-default` shorthand, keyframes (shimmer, pulse-recording, breathe), `--waveform-glow` token, typography decision documented as comment

**Testing approach:**
Unit tests for custom button variants (accent, destructive). Verify correct classes, ref forwarding, disabled state, onClick handling.

**Success criteria:**
- `pnpm dev` — all shadcn components importable and renderable
- `pnpm typecheck` — clean
- `pnpm test` — button tests pass
- Accent button visually correct (screenshot)
- Skeleton shimmer animation plays

**Blocked by:** nothing

---

## PR 3: Waveform canvas component `[ ]`
> The visual centerpiece. Needed by both recording and playback.

**Build:**
- `components/audio/waveform.tsx` — canvas component, two modes:
  - **Live**: accepts analyser data, draws amplitude bars at 60fps, amber color
  - **Static**: accepts peaks array, draws waveform w/ playback progress + seek cursor
- Click-to-seek: click position → normalized time (0-1) → `onSeek` callback
- `ResizeObserver` for responsive canvas sizing
- Seek feedback: transient highlight at click point
- Accessibility: `aria-label`, appropriate ARIA roles

**Testing approach:**
Test that canvas renders without error for both modes. Test click-to-seek fires callback with correct normalized position. Test graceful handling of empty/null data. Test unmount doesn't leak animation frames.

**Success criteria:**
- Canvas renders peaks visually (screenshot at 1280px + 375px)
- Click-to-seek fires correct position value
- Responsive: resizes cleanly
- No memory leaks on unmount
- `pnpm test` — all waveform tests pass

**Blocked by:** PR 2 (tokens)

---

## PR 4: Recording flow — use-recorder hook + recorder-controls `[ ]`
> Mic → record → stop → raw Blob. No filters yet.

**Build:**
- `hooks/use-recorder.ts` — state machine (idle → requesting → ready → recording → stopped). Handles mic denied, AudioContext interrupted.
- `components/audio/recorder-controls.tsx` — big amber record button (pulses red when active), stop button, timer (tabular-nums), headphone monitor toggle, live waveform
- `app/record/page.tsx` — layout w/ 4 states: idle, recording, stopped, error. Mobile: record button in fixed bottom bar.

**Testing approach:**
Test the recorder hook state machine thoroughly — valid transitions, invalid transitions, error states, timer behavior, blob output. Test the recorder controls component renders correct UI for each state and has proper ARIA labels.

**Success criteria:**
- Navigate to `/record` → grant mic → live waveform → record 5s → stop → see captured waveform
- Timer counts up with tabular-nums
- Mic denied → helpful error message
- Mobile: record button in thumb zone (375px visual check)
- `pnpm test` — all tests pass

**Blocked by:** PR 1 (engine/recorder), PR 3 (waveform)

---

## PR 5: Filter rack + use-audio-engine hook `[ ]`
> The interaction magic. Toggle filters, hear the difference instantly.

**Build:**
- `hooks/use-audio-engine.ts` — filter state management, graph orchestration, analyser data loop, auto-replay on filter toggle, offline render. Exposes: toggleFilter, updateParam, resetFilter, bypassAll, play, stop, seek.
- `components/audio/filter-rack.tsx` — filter cards w/ toggle, collapsible sliders, top 2 expanded by default, per-filter reset, global bypass. Active = amber border, bypassed = dimmed. Sliders continuous on `input`.
- `components/audio/player.tsx` — play/pause, time display (tabular-nums), waveform seek integration
- Wire into `app/record/page.tsx` — after recording, show filter rack + player

**Testing approach:**
Test the engine hook's state management: filter toggling, param updates, reset, bypass (stores + restores previous state). Test filter rack renders all filters, expanded/collapsed correctly, fires correct callbacks. Test player renders play/pause states and fires callbacks.

**Success criteria:**
- Record → stop → toggle compressor → hear the difference immediately
- Sliders update audio in real-time as you drag
- Bypass all → hear raw vs filtered A/B
- Reset → sliders snap to defaults
- `pnpm test` — all tests pass

**Blocked by:** PR 4 (recording flow)

---

## PR 6: Upload flow + clip detail page `[ ]`
> Complete the record → upload → share loop.

**Build:**
- Upload in record page: auto-name (editable), save button, loading state during render/upload, toast + redirect on success
- `app/clips/[id]/page.tsx` — Server Component w/ waveform, player, metadata, filter badges, copy-to-clipboard share URL
- `app/clips/[id]/loading.tsx` — skeleton
- Guard `JSON.parse` in Zod filterConfig transform

**Testing approach:**
Test API business logic (createClip, listClips, getClip) and Hono route handlers (all endpoints, success + error paths, Zod validation, malformed input). Test detail page renders metadata and badges. Test share button copies URL.

**Success criteria:**
- Record → filter → upload → redirected to detail page
- Detail shows waveform, plays audio, badges visible, share URL copies
- Invalid clip ID → 404
- Malformed upload data → structured 400 (not 500)
- `pnpm test` — all API + component tests pass

**Blocked by:** PR 5 (filter rack + engine hook)

---

## PR 7: Feed page + inline playback `[ ]`
> Browse and listen without navigating to detail.

**Build:**
- `components/clip-card.tsx` — mini waveform, name, duration, timestamp, filter badges, inline play button
- `app/page.tsx` — Server Component w/ clip grid, inline playback (one at a time), responsive (1 col mobile, 2 col desktop)
- `app/loading.tsx` — skeleton grid
- `app/error.tsx` — error boundary w/ retry
- Empty state wired to real data

**Testing approach:**
Test clip card renders all fields, play button fires callback without navigating, card click navigates. Test feed renders empty state, data state, handles playback mutual exclusion (play B stops A). Test error boundary renders retry.

**Success criteria:**
- Upload 3 clips → feed shows newest-first w/ waveforms + badges
- Inline play works, one clip at a time
- Click card → navigates to detail
- Empty DB → empty state, loading → skeletons, error → retry
- `pnpm test` — all tests pass

**Blocked by:** PR 6 (upload + detail)

---

## PR 8: Polish — error states, responsive, keyboard, README `[ ]`
> Final quality pass. Every rough edge filed down.

**Build:**
- Error boundaries on audio components
- Mic denied: browser-specific instructions + retry
- Responsive audit: filter rack stacks ≤ 640px, record button thumb zone, sliders usable at 375px
- Keyboard: Space = play/pause, R = record (disabled in inputs)
- Loading: breathing amber circle for audio init
- `README.md` — how to run, what was built, what was skipped, tradeoffs, next steps
- `DECISIONS.md` — final polish for reviewer readability

**Testing approach:**
Test keyboard shortcuts (correct behavior, disabled in inputs). Test error states render correctly (mic denied, upload failure, decode failure). Full integration test of the end-to-end flow.

**Success criteria:**
- Full e2e: record → filter → upload → feed → detail → playback → share. Zero dead ends.
- Mobile 375px: everything usable
- Keyboard shortcuts work correctly
- `pnpm lint && pnpm typecheck && pnpm test` — all clean
- README works in < 2 minutes
- DECISIONS.md reads well standalone

**Blocked by:** PR 7 (feed)

---

## Stretch PRs (if ahead of schedule)

### PR S1: Drag-to-scrub on waveform `[ ]`
Pointer-drag seeking via `pointerdown` + `pointermove`. Audio plays at scrub position. Blocked by: PR 5.

### PR S2: Reverb filter ("Room") `[ ]`
ConvolverNode w/ generated impulse response. Params: decay, mix. Add to FILTER_REGISTRY. Blocked by: PR 1.

### PR S3: Signal chain visualization `[ ]`
`Input → [active filters] → Output` flow indicator, active lit amber. Above filter rack. Blocked by: PR 5.

### PR S4: Pre-seeded demo clip `[ ]`
Seed script generates WAV + applies delay, inserts into DB. `pnpm db:seed`. Blocked by: PR 7.

### PR S5: Waveform amplitude glow `[ ]`
Canvas glow intensity scales w/ current amplitude. Brighter on peaks, dim on silence. Blocked by: PR 3.
