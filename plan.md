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

**Files:**
- `lib/audio/filters.ts` — refine 5 filter definitions (gain, low-pass, high-pass, compressor, delay). Clean up existing code per simplifier feedback.
- `lib/audio/engine.ts` — refine AudioEngine class. Fix duplicate JSDoc. Extract `safeDisconnect` helper.
- `lib/audio/recorder.ts` — new. MediaRecorder factory (requestMic, start, stop → Blob). States: idle, requesting, ready, recording, stopped.
- `lib/audio/utils.ts` — new. Merge waveform + buffer utils: `generatePeaks(audioBuffer, buckets)`, `blobToAudioBuffer(blob, ctx)`, `audioBufferToWav(buffer)` (PCM encoder).
- `lib/audio/waveform-server.ts` — refine server-side WAV peak parser. Extract repeated `Array(n).fill(0)`.

**Tests (`__tests__/audio/`):**
- `filters.test.ts`
  - Each filter's `createNodes` returns non-empty AudioNode array
  - Gain at 0 produces silence, gain at 2 doubles amplitude (via OfflineAudioContext)
  - Low-pass at 200Hz cuts high frequencies (compare energy above/below cutoff)
  - High-pass at 2000Hz cuts low frequencies
  - Compressor reduces dynamic range (peak amplitude of loud signal is lower after compression)
  - Delay produces output longer than input (echo tail extends duration)
  - Delay feedback loop: output at t > delayTime has non-zero amplitude
  - Delay wet/dry mix: mix=0 produces dry-only, mix=1 produces wet-only
- `engine.test.ts`
  - `rebuildGraph` with empty filter list: source connects directly to analyser
  - `rebuildGraph` with 2 filters: signal passes through both
  - `renderOffline` produces AudioBuffer with correct length, sampleRate, numberOfChannels
  - `renderOffline` with gain=2 doubles amplitude vs gain=1
  - `renderOffline` with no enabled filters returns original audio
  - `setMonitor(true)` sets gain to 1, `setMonitor(false)` sets gain to 0
  - `dispose()` closes AudioContext
  - `connectBuffer` does NOT modify monitor state (regression test for the bug we fixed)
- `utils.test.ts`
  - `audioBufferToWav` produces valid WAV header (RIFF, fmt, data chunks)
  - `audioBufferToWav` round-trips: encode → decode → compare samples (within float precision)
  - `generatePeaks` returns correct bucket count
  - `generatePeaks` of silence returns all zeros
  - `generatePeaks` of full-scale sine returns peaks near 1.0
- `waveform-server.test.ts`
  - Valid WAV → correct peak count and normalized values
  - Invalid/empty buffer → returns array of zeros (graceful degradation)
  - 8-bit WAV → correct peaks (not just 16-bit)

**Success criteria:**
- `pnpm test` — all tests pass, zero skips
- `pnpm typecheck` — clean
- Filter tests use real `OfflineAudioContext` (not mocks) to verify actual audio behavior
- No UI needed — pure lib code

**Blocked by:** nothing

---

## PR 2: shadcn/ui components + design token polish `[ ]`
> Foundation for all UI work. Must land before any component PRs.

**Files:**
- Init shadcn: button, card, switch, slider, input, badge, skeleton, dialog, sonner (toast)
- `components/ui/button.tsx` — add `accent` variant (amber bg, dark text, hover state)
- `globals.css` additions:
  - `.tabular-nums` utility class
  - `--transition-default` composed shorthand
  - `@keyframes shimmer` for skeleton loading
  - `@keyframes pulse-recording` for record button
  - `@keyframes breathe` for loading state
  - `--waveform-glow` shadow token
- Comment in `globals.css` documenting typography decision (Tailwind defaults = the system)

**Tests (`__tests__/ui/`):**
- `button.test.tsx`
  - Renders with default variant
  - Renders with accent variant (correct classes applied)
  - Renders with destructive variant
  - Forwards ref correctly
  - Handles disabled state
  - Handles onClick

**Success criteria:**
- `pnpm dev` — all shadcn components importable and renderable
- `pnpm typecheck` — clean
- `pnpm test` — button tests pass
- Accent button visually correct (amber bg, dark text, hover brightens)
- Skeleton shimmer animation plays (visual check)

**Blocked by:** nothing

---

## PR 3: Waveform canvas component `[ ]`
> The visual centerpiece. Needed by both recording and playback.

**Files:**
- `components/audio/waveform.tsx` — canvas component, two modes:
  - **Live**: accepts `analyserData: Float32Array`, draws amplitude bars at 60fps, amber color
  - **Static**: accepts `peaks: number[]`, draws waveform shape, playback progress line (amber fill up to current position, idle color after), seek cursor on hover
- Click-to-seek: `onClick` → compute normalized position (0-1) → fire `onSeek(position)` callback
- `ResizeObserver` to keep canvas pixel-perfect at any container width
- Seek feedback: brief amber flash at click point (200ms fade)
- `aria-label="Audio waveform"` + `role="slider"` w/ `aria-valuemin/max/now` for accessibility

**Tests (`__tests__/components/`):**
- `waveform.test.tsx`
  - Renders canvas element with correct aria attributes
  - Calls `onSeek` with normalized position on click (0 at left edge, 1 at right edge)
  - Applies correct dimensions from container (mock ResizeObserver)
  - Static mode: renders without error when peaks is empty array
  - Static mode: renders without error when peaks is undefined/null
  - Live mode: renders without error when analyserData is empty
  - Does not throw when unmounted during animation frame

**Success criteria:**
- Canvas renders peaks visually (screenshot at 1280px + 375px)
- Click-to-seek fires with correct position value
- Responsive: resizes cleanly with container
- No memory leaks (animation loop cancels on unmount)
- `pnpm test` — all waveform tests pass

**Blocked by:** PR 2 (tokens + components)

---

## PR 4: Recording flow — use-recorder hook + recorder-controls `[ ]`
> Mic → record → stop → raw Blob. No filters yet.

**Files:**
- `hooks/use-recorder.ts` — state machine: `idle → requesting → ready → recording → stopped`. Exposes: `requestMic()`, `startRecording()`, `stopRecording()`, `status`, `blob`, `duration`, `error`, `stream` (for waveform). Handles mic denied, AudioContext interrupted (mobile background tab).
- `components/audio/recorder-controls.tsx` — record button (large amber circle, `pulse-recording` keyframe when active, red bg during recording), stop button, timer (`tabular-nums`), headphone monitor toggle (headphone icon, off by default), live waveform (passes AnalyserNode data to waveform component)
- `app/record/page.tsx` — layout: waveform area top, controls bottom. 4 states: idle (big record CTA explaining what the app does), recording (live waveform + timer + stop button), stopped (static waveform of captured audio + "what's next" affordance), error (mic denied w/ "how to fix" instructions + retry button). Mobile: record button in fixed bottom bar (thumb zone).

**Tests (`__tests__/hooks/`):**
- `use-recorder.test.ts`
  - Initial state is `idle`
  - `requestMic` transitions to `requesting`, then `ready` (mock getUserMedia)
  - `requestMic` when denied transitions to `error` with descriptive message
  - `startRecording` from `ready` transitions to `recording`
  - `stopRecording` transitions to `stopped` and produces a Blob
  - `duration` increments while recording (mock timers)
  - Cannot `startRecording` from `idle` (must request mic first)
  - Cannot `startRecording` from `stopped` without re-requesting mic

**Tests (`__tests__/components/`):**
- `recorder-controls.test.tsx`
  - Renders record button in idle state
  - Shows timer during recording
  - Shows stop button during recording
  - Shows error message when mic denied
  - Record button has correct aria-label

**Success criteria:**
- Navigate to `/record` → grant mic → see live waveform → record 5s → stop → see static waveform of captured audio
- Timer counts up during recording with `tabular-nums` (no digit jumping)
- Deny mic → see helpful error message with instructions
- Mobile: record button is in thumb zone (visual check at 375px)
- `pnpm test` — all recorder tests pass

**Blocked by:** PR 1 (engine/recorder), PR 3 (waveform)

---

## PR 5: Filter rack + use-audio-engine hook `[ ]`
> The interaction magic. Toggle filters, hear the difference instantly.

**Files:**
- `hooks/use-audio-engine.ts` — manages: `filters: ActiveFilter[]` (each w/ definition, params, enabled), `bypassAll`, `monitorEnabled`. Methods: `toggleFilter(id)`, `updateParam(id, key, value)`, `resetFilter(id)`, `toggleBypass()`, `toggleMonitor()`. Internally: creates AudioEngine, calls `rebuildGraph` on any filter state change, runs `requestAnimationFrame` loop for analyser data, auto-replays from current position when filter toggled during playback. Exposes `analyserData`, `play(buffer)`, `stop()`, `seek(position)`, `isPlaying`, `currentTime`, `renderWithFilters(buffer)`.
- `components/audio/filter-rack.tsx` — maps `FILTER_REGISTRY` to cards. Each card: shadcn Switch toggle + name + description. Top 2 (Compressor, Delay) expanded by default showing sliders. Others collapsed, expand on click. Per-filter "Reset" text button. Global "Bypass all" switch at top. Active card: amber left border. Bypassed/disabled card: `opacity: var(--opacity-dimmed)`. Sliders: shadcn Slider, fires `onValueChange` continuously (not on commit).
- `components/audio/player.tsx` — play/pause button (icon toggles), elapsed / total time display (`tabular-nums`), integrates w/ waveform seek. Play = `engine.play(buffer)`, pause = `engine.stop()`, seek = waveform `onSeek` → `engine.seek(pos)`.
- `app/record/page.tsx` — wire: after recording, show player + filter rack + waveform below the recorder controls. Full preview experience.

**Tests (`__tests__/hooks/`):**
- `use-audio-engine.test.ts`
  - Initial state: all filters from FILTER_REGISTRY, each disabled, default params
  - `toggleFilter` enables/disables the correct filter
  - `updateParam` updates the correct param for the correct filter
  - `resetFilter` returns all params to defaults
  - `toggleBypass` sets all filters' enabled to false (and restores on un-bypass)
  - Multiple filters enabled: all are passed to `rebuildGraph` in order
  - Filter toggle during playback triggers auto-replay (mock engine)

**Tests (`__tests__/components/`):**
- `filter-rack.test.tsx`
  - Renders all 5 filters from registry
  - Compressor and Delay cards are expanded by default
  - Toggling a switch calls `onToggle` with correct filter ID
  - Moving a slider calls `onParamChange` with filter ID, param key, value
  - "Reset" button calls `onReset` with filter ID
  - "Bypass all" toggle calls `onBypassAll`
  - Active filter has amber left border class
  - Disabled filter has dimmed opacity class
- `player.test.tsx`
  - Renders play button initially
  - Click play → button changes to pause icon
  - Shows time display with tabular-nums class
  - Calls onPlay/onPause/onSeek callbacks correctly

**Success criteria:**
- Record a clip → stop → toggle compressor on → hear the difference immediately (continuous, not on-release)
- Adjust delay time slider → hear echoes change in real-time as you drag
- Toggle bypass all → hear raw audio, toggle off → hear filtered
- Reset a filter → sliders return to default positions
- Play/pause works, time display updates, seek via waveform click works
- `pnpm test` — all tests pass

**Blocked by:** PR 4 (recording flow)

---

## PR 6: Upload flow + clip detail page `[ ]`
> Complete the record → upload → share loop.

**Files:**
- `app/record/page.tsx` additions: after preview, show auto-generated clip name (editable input, "Clip N" default), "Save clip" accent button. On save: show loading state → `renderWithFilters(buffer)` → `audioBufferToWav(result)` → POST `/api/clips` as FormData (audio file + name + duration + filterConfig JSON) → on success toast + redirect to `/clips/[id]`.
- `app/clips/[id]/page.tsx` — Server Component. Fetch clip by ID (404 if missing). Render: full-width waveform (static peaks from DB), client-side player, clip name (h1), duration + "recorded X ago" timestamp, filter badges (amber `<Badge>` per applied filter), share button (copies current URL to clipboard + toast "Link copied").
- `app/clips/[id]/loading.tsx` — skeleton matching detail layout
- `lib/schemas/clips.ts` — guard `JSON.parse` in filterConfig transform: wrap in try/catch, throw ZodError on malformed JSON

**Tests (`__tests__/api/`):**
- `clips.test.ts`
  - `createClip` inserts row and returns clip with all fields
  - `createClip` generates peaks from WAV buffer
  - `createClip` uses nanoid for short IDs (length 8)
  - `listClips` returns clips newest-first
  - `listClips` respects limit and offset
  - `getClip` returns clip by ID
  - `getClip` returns null for non-existent ID
  - `getClipAudioPath` returns null for non-existent ID

**Tests (`__tests__/api/`):**
- `clips-api.test.ts` (Hono route tests)
  - POST `/api/clips` with valid FormData → 201 + clip JSON
  - POST `/api/clips` without audio file → 400
  - POST `/api/clips` with invalid name (empty) → 400 w/ structured Zod issues
  - POST `/api/clips` with malformed filterConfig JSON → 400 (not 500)
  - GET `/api/clips` → 200 + array
  - GET `/api/clips?limit=2` → returns max 2 clips
  - GET `/api/clips/:id` with valid ID → 200 + clip
  - GET `/api/clips/:id` with invalid ID → 404
  - GET `/api/clips/:id/audio` with valid ID → 200 + WAV content-type
  - GET `/api/clips/:id/audio` with invalid ID → 404
  - GET `/api/health` → 200

**Tests (`__tests__/components/`):**
- `clip-detail.test.tsx`
  - Renders clip name, duration, timestamp
  - Renders filter badges for each applied filter
  - Share button copies URL to clipboard (mock navigator.clipboard)
  - 404 page renders for missing clip

**Success criteria:**
- Record → apply filters → name clip → save → redirected to `/clips/[id]`
- Detail page renders waveform, plays audio, shows correct metadata
- Filter badges show which filters were applied
- Share URL copies to clipboard with toast confirmation
- Invalid clip ID → 404 page
- Malformed upload data → structured 400 error (not 500)
- `pnpm test` — all API + component tests pass

**Blocked by:** PR 5 (filter rack + engine hook)

---

## PR 7: Feed page + inline playback `[ ]`
> Browse and listen without navigating to detail.

**Files:**
- `components/clip-card.tsx` — mini waveform (static peaks, ~80px tall canvas), clip name (truncate w/ title tooltip), duration (`tabular-nums`), relative timestamp ("3m ago"), filter badges (small amber badges), inline play/pause button (icon-only, `aria-label`). Click card (outside play button) → navigate to detail.
- `app/page.tsx` — Server Component. Fetch clips from DB via `listClips()`. Render grid of clip-cards (responsive: 1 col mobile, 2 col desktop). Client wrapper for inline playback state: one clip plays at a time — starting a new one stops the previous (singleton AudioContext or global state).
- `app/loading.tsx` — skeleton grid: 3-4 skeleton cards matching clip-card dimensions
- `app/error.tsx` — error boundary: "Something went wrong" + retry button
- Empty state wired to real data: show when `clips.length === 0`

**Tests (`__tests__/components/`):**
- `clip-card.test.tsx`
  - Renders clip name, duration, timestamp
  - Renders mini waveform canvas
  - Renders filter badges
  - Play button has aria-label
  - Click on card (not play) fires navigation callback
  - Click play button fires play callback (does NOT navigate)
  - Shows pause icon when playing
  - Truncates long clip names with title attribute

**Tests (`__tests__/pages/`):**
- `feed.test.tsx`
  - Renders empty state when no clips
  - Renders clip cards when clips exist
  - Cards ordered newest-first
  - Playing clip A then clicking play on clip B stops A
  - Error boundary renders retry button

**Success criteria:**
- Upload 3 clips. Feed shows all three newest-first with waveforms + badges
- Tap play on clip 1 → audio plays inline, waveform shows progress
- Tap play on clip 2 → clip 1 stops, clip 2 plays
- Click card body → navigates to detail page
- Empty DB → empty state with "Record your first clip" CTA
- Loading → skeleton grid visible
- DB error → error boundary with retry
- Mobile: cards stack single column, touch targets ≥ 44px
- `pnpm test` — all feed + card tests pass

**Blocked by:** PR 6 (upload + detail page)

---

## PR 8: Polish — error states, responsive, keyboard, README `[ ]`
> Final quality pass. Every rough edge filed down.

**Files:**
- Error boundaries on audio components (catch AudioContext failures gracefully)
- Mic permission denied: specific message per browser + "how to enable" instructions + retry button
- Responsive audit: filter rack stacks below waveform ≤ 640px, record button stays fixed bottom, sliders usable at 375px (min track width), cards single col ≤ 640px
- Keyboard shortcuts: Space = play/pause, R = record (only on `/record`, disabled when focus is in an input)
- Loading state for audio init: breathing amber circle animation (`@keyframes breathe`)
- `README.md`: how to run (3 commands), what was built (feature list), what was skipped (with reasoning), architecture overview (audio pipeline diagram), key tradeoffs (link to DECISIONS.md), next steps
- `DECISIONS.md`: final review pass — ensure every major decision is documented, language is polished, reviewer-ready

**Tests (`__tests__/`):**
- `keyboard.test.ts`
  - Space triggers play/pause when no input focused
  - Space does NOT trigger play/pause when input is focused
  - R triggers record on `/record` page
  - R does NOT trigger when typing in name input
- `error-states.test.tsx`
  - Mic denied renders recovery instructions
  - Upload failure renders retry button
  - Audio decode failure renders error message
  - Network error on feed renders error boundary

**Success criteria:**
- Full end-to-end flow: record → filter → upload → feed → detail → playback → share. Zero dead ends.
- Mobile viewport (375px): record button in thumb zone, filter sliders draggable, cards readable
- Keyboard: Space play/pause works, R to record works, no conflicts with text inputs
- `pnpm lint` — clean
- `pnpm typecheck` — clean
- `pnpm test` — ALL tests pass (every test from every PR)
- README: someone can clone repo and run the app in < 2 minutes
- DECISIONS.md: reads well as a standalone document for Arena reviewers

**Blocked by:** PR 7 (feed)

---

## Stretch PRs (if ahead of schedule)

### PR S1: Drag-to-scrub on waveform `[ ]`
Pointer-drag seeking. `pointerdown` + `pointermove` on canvas updates playback position continuously. Audio plays at scrub position (brief frame at cursor). Distinct from click-to-seek (which jumps).
- Tests: pointermove fires onSeek continuously, pointerup stops scrubbing, does not interfere with click-to-seek
- Blocked by: PR 5

### PR S2: Reverb filter ("Room") `[ ]`
ConvolverNode w/ algorithmically generated impulse response (exponential decay white noise). Params: decay (0.1-5s), mix (0-1). Add to FILTER_REGISTRY as 6th filter.
- Tests: reverb createNodes returns ConvolverNode, renderOffline w/ reverb produces longer output (reverb tail), mix=0 is dry-only
- Blocked by: PR 1

### PR S3: Signal chain visualization `[ ]`
Left-to-right flow indicator above filter rack: `Input → [active filters] → Output`. Active filters lit amber, inactive dimmed. Updates reactively when filters toggle.
- Tests: renders correct number of nodes, active nodes have amber class, toggling filter updates viz
- Blocked by: PR 5

### PR S4: Pre-seeded demo clip `[ ]`
Seed script (`scripts/seed.ts`) that generates a short WAV programmatically (sine wave + noise), applies delay via OfflineAudioContext, inserts into DB with peaks. Runs on `pnpm db:seed`.
- Tests: seed script creates clip row, generated WAV has correct format
- Blocked by: PR 7

### PR S5: Waveform amplitude glow `[ ]`
Canvas glow effect during playback — outer shadow intensity scales w/ current amplitude from AnalyserNode. Brighter on peaks, dim on silence. Uses `--waveform-glow` token.
- Tests: glow renders without error, respects prefers-reduced-motion (no glow)
- Blocked by: PR 3
