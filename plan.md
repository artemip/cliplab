# ClipLab — Roadmap

Each item is a PR. Each PR is independently testable, shippable, and goes through agent review (9+/10 target). Ordered by dependency — later PRs build on earlier ones.

---

## PR 1: Audio engine + filter tests
> The core abstraction Arena will scrutinize.

**Build:**
- `lib/audio/filters.ts` — 5 filter definitions (gain, low-pass, high-pass, compressor, delay)
- `lib/audio/engine.ts` — AudioEngine class (rebuildGraph, connectStream, connectBuffer, renderOffline, setMonitor, dispose)
- `lib/audio/recorder.ts` — MediaRecorder factory (requestMic, start, stop → Blob)
- `lib/audio/utils.ts` — generatePeaks, blobToAudioBuffer, audioBufferToWav
- `__tests__/filters.test.ts` — createNodes returns correct types, delay feedback wiring, renderOffline correctness, gain amplitude scaling

**Testable:** `pnpm test` — all filter tests pass. No UI needed.

**Blocked by:** nothing (scaffold already committed)

---

## PR 2: shadcn/ui components + design token polish
> Foundation for all UI work. Must land before any component PRs.

**Build:**
- Init shadcn: button (w/ accent variant), card, switch, slider, input, badge, skeleton, dialog, sonner
- `globals.css` refinements: typography decision documented, `tabular-nums` utility, composed transition shorthand, skeleton shimmer keyframe, `--waveform-glow` token
- Shared button patterns extracted (accent button w/ icon used on feed + record pages)

**Testable:** `pnpm dev` — components render correctly. `pnpm typecheck` passes. Visual spot-check.

**Blocked by:** nothing

---

## PR 3: Waveform canvas component
> The visual centerpiece. Needed by both recording and playback.

**Build:**
- `components/audio/waveform.tsx` — canvas-based, two modes:
  - **Live**: reads AnalyserNode data via requestAnimationFrame, 60fps, amber bars
  - **Static**: renders peaks array w/ playback progress line + seek cursor
- Click-to-seek on static mode (click position → normalized time)
- `ResizeObserver` for responsive canvas sizing
- Seek feedback: transient highlight at click point
- `aria-label` on the canvas element

**Testable:** Render in a test page w/ hardcoded peaks array. Click-to-seek fires callback. Canvas resizes w/ container. Visual check at 375px + 1280px.

**Blocked by:** PR 2 (tokens)

---

## PR 4: Recording flow — use-recorder hook + recorder-controls
> Mic → record → stop → raw Blob. No filters yet.

**Build:**
- `hooks/use-recorder.ts` — mic permission flow, recording state machine (idle → requesting → ready → recording → stopped), timer, Blob output, error handling (mic denied, interrupted)
- `components/audio/recorder-controls.tsx` — big amber record button (glowing, pulses red during recording), stop button, timer w/ tabular-nums, live waveform via AnalyserNode, headphone monitor toggle
- `app/record/page.tsx` — basic layout: waveform top, record button center/bottom. States: idle (big record CTA), recording (live viz + timer), stopped (static waveform of recorded audio)
- Mobile: record button in fixed bottom bar

**Testable:** Navigate to `/record`, grant mic, record 5s, stop. See live waveform during recording. See static waveform of captured audio after stop. Timer counts up. Mic denied → error message w/ recovery instructions. Works on mobile viewport.

**Blocked by:** PR 1 (engine/recorder), PR 3 (waveform)

---

## PR 5: Filter rack + use-audio-engine hook
> The interaction magic. Toggle filters, hear the difference instantly.

**Build:**
- `hooks/use-audio-engine.ts` — filter state array, toggleFilter, updateParam, resetFilter, bypassAll, monitorEnabled, rebuildGraph on changes, analyser data loop, auto-replay on filter toggle, renderWithFilters (offline export)
- `components/audio/filter-rack.tsx` — filter cards w/ toggle + name + description, top 2 expanded by default (Compressor, Delay), collapsible param sliders, per-filter reset, global bypass toggle. Active = amber left border, bypassed = dimmed. Sliders fire on `input` (continuous)
- `components/audio/player.tsx` — play/pause button, time display (tabular-nums), waveform seek integration
- Wire into `app/record/page.tsx` — after recording, show filter rack + player below waveform. Toggle filters → hear change immediately.

**Testable:** Record a clip → stop → toggle compressor → hear the difference. Adjust delay time slider → hear echoes change in real-time. Bypass all → hear raw vs filtered. Reset a filter → params return to defaults. Play/pause works. Seek via waveform click.

**Blocked by:** PR 4 (recording flow)

---

## PR 6: Upload flow + clip detail page
> Complete the record → upload → share loop.

**Build:**
- Upload in `app/record/page.tsx`: auto-generated name (editable input), "Save clip" button. Calls renderOffline → audioBufferToWav → POST /api/clips. Loading state during render/upload. Toast on success. Redirect to detail page.
- `app/clips/[id]/page.tsx` — Server Component. Full waveform (from stored peaks), client-side player, clip metadata (name, duration, timestamp), filter badges (amber tags), copy-to-clipboard share URL w/ toast
- `app/clips/[id]/loading.tsx` — skeleton
- Guard `JSON.parse` in Zod filterConfig transform (produce ZodError, not SyntaxError)

**Testable:** Record → filter → upload → redirected to `/clips/[id]`. Detail page shows waveform, plays audio, filter badges visible. Share URL copies to clipboard. Invalid clip ID → 404. Upload w/ bad data → structured 400 error.

**Blocked by:** PR 5 (filter rack + engine hook)

---

## PR 7: Feed page + inline playback
> Browse and listen without navigating to detail.

**Build:**
- `components/clip-card.tsx` — mini waveform (static peaks, small canvas), clip name, duration (tabular-nums), relative timestamp, filter badges, inline play button
- `app/page.tsx` — Server Component. Fetches clips from DB, renders grid of clip-cards. One clip plays at a time (starting a new one stops the previous). Link to detail page on card click (outside play button).
- `app/loading.tsx` — skeleton grid matching clip-card dimensions
- `app/error.tsx` — error boundary w/ recovery action
- Empty state: "No clips yet" + CTA to `/record` (already exists, wire to real data)

**Testable:** Upload 2-3 clips. Feed shows them newest-first w/ waveforms + badges. Tap play on clip 1 → audio plays inline. Tap play on clip 2 → clip 1 stops, clip 2 plays. Click card → navigates to detail. Empty DB → empty state renders. Loading state shows skeletons.

**Blocked by:** PR 6 (upload + detail page)

---

## PR 8: Polish — error states, responsive, keyboard, README
> Final quality pass.

**Build:**
- Error boundaries on audio components
- Mic permission denied → clear message + instructions
- Responsive audit: filter rack stacks below waveform on mobile, record button stays in thumb zone, sliders usable at 375px
- Keyboard shortcuts: Space = play/pause, R = record (only on record page, not in inputs)
- Loading states: breathing amber circle for audio init
- `README.md` — how to run, what was built, what was skipped, key tradeoffs, next steps
- `DECISIONS.md` — final review pass for completeness

**Testable:** Full end-to-end flow works. Mobile viewport looks good. Keyboard shortcuts work. README lets someone run the app in 2 minutes. `pnpm lint && pnpm typecheck && pnpm test` all pass.

**Blocked by:** PR 7 (feed)

---

## Stretch PRs (if ahead of schedule)

### PR S1: Drag-to-scrub on waveform
Pointer-drag seeking. Track `pointerdown` + `pointermove` on canvas, update playback position continuously. Blocked by: PR 5.

### PR S2: Reverb filter ("Room")
ConvolverNode w/ generated IR. Add to FILTER_REGISTRY. Blocked by: PR 1.

### PR S3: Signal chain visualization
Left-to-right flow indicator: `Input → [active filters] → Output`, active lit amber. Render above filter rack. Blocked by: PR 5.

### PR S4: Pre-seeded demo clip
Seed script that generates a short WAV w/ delay, inserts into DB on first `pnpm dev`. Blocked by: PR 7.

### PR S5: Waveform amplitude glow
Canvas glow effect that breathes w/ audio amplitude during playback. Blocked by: PR 3.
