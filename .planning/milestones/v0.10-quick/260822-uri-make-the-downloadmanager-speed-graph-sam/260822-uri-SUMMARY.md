---
quick_id: 260822-uri
status: complete
date: 2026-08-22
---

# Quick Task 260822-uri — Summary

## What changed

The DownloadManager speed chart now samples on a fixed 1000 ms timer for every runner,
instead of once per change in `percent`.

| Task | Commit | Files |
|---|---|---|
| 1 — ungated store read | `3d4dafc50` | `src/frontend/state/InstallProgress.ts` |
| 2 — 1 s timer sampling | `76b67a362` | `ProgressHeader/index.tsx`, `ProgressHeader/speedSample.ts` |
| 3 — cadence tests | `77e7f25e4` | `ProgressHeader/__tests__/speedSample.test.ts` |

### Root cause

`ProgressHeader` pushed one sample per run of a `useEffect` keyed on `[progress, state]`,
where `progress` came from `hasProgress`. That hook only calls `setProgress` when `percent`
differs from the previous value (`hasProgress.ts:42`), so every emit with an unchanged
percent was discarded — **along with its `downSpeed`/`diskSpeed`, the only values the chart
plots**. The sample rate was therefore the rate of change of `percent`.

Steam is the only runner emitting an integer percent (`Math.round`, `steam/depot.ts:2345`,
`steam/library.ts:2498`); GOG parses a fractional one (`gog/games.ts:255`) and Epic reports
2 decimals (`legendary/games.ts:457`). Steam's backend was emitting correctly at ≥2 Hz
(`PROGRESS_THROTTLE_MS = 500`) and `InstallProgress.ts:10` stored every emit — the loss was
entirely at the frontend gate.

### Implementation

- `getInstallProgress(appName, runner)` — a non-subscribing read of the zustand store, so
  the timer can pull the newest emit when it fires without turning 2 Hz emits into renders.
- `speedSample.ts` gains `SAMPLE_INTERVAL_MS`, `emptySamples()` and `appendSample()`. The
  sampling logic is pure because the frontend jest project runs `testEnvironment: 'node'`
  with no jsdom, so components cannot be rendered in tests.
- `appendSample` returns a new array; the old code mutated `avgSpeed` in place via
  `shift()`/`push()` before copying it.
- The effect is now keyed on `[state, appName, runner]`, takes one sample immediately, then
  ticks every second, and clears the interval on unmount / dep change.
- `hasProgress` is untouched — it still drives the percent label, ETA, bytes and
  `LinearProgress`, where the percent gate is harmless.

### Side effects (intended)

- The x-axis becomes a real rolling window: 100 samples = 100 seconds for every runner,
  rather than "100 percent-ticks" (~1000 s on a large Steam install).
- A paused download now walks down to 0 MB/s on the timer instead of freezing at whatever
  the chart last held.

## Verification

- `pnpm exec jest src/frontend` — 119 suites, 1964 tests, all pass.
- `pnpm exec tsc --noEmit` — clean.
- `pnpm exec eslint` on the four changed files — 0 errors (severity 2).
- `pnpm exec prettier --check` on the four changed files, in place — clean.
- **Red-proof:** temporarily reintroducing a percent-equality gate inside `appendSample`
  fails 3 of the new cases, including `accrues a sample per call even when percent never
  changes` (10 expected, 1 received). The gate measures the intended property, not a
  landmark. Temporary edit reverted and confirmed absent before committing.

## STATE.md handling

The quick-task row was appended to the `Quick Tasks Completed` table **by hand** — no
`gsd-sdk state.*` verb was invoked, since every one of them is a known recurring corruption
defect on this file. Whole-file diff confirmed exactly 1 insertion, 0 deletions.

The frontmatter `last_activity` / `stopped_at` fields were deliberately **left untouched**.
They currently hold a `PHASE 37 COMPLETE` record written at 2026-08-22T18:45 by a concurrent
session; overwriting a phase-completion record with a quick-task line would destroy the more
significant entry. The table row is the durable record for this task.

## Not done / follow-ups

- Not verified on a live install — this is a frontend cadence change proved by unit test
  and code reading only. A visual UAT during a real Steam download would confirm the chart
  moves once per second.
- Steam's integer `percent` was left as-is. The percent label and progress bar still step
  in whole numbers on Steam while GOG/Epic step fractionally. That is cosmetic and no
  longer affects the chart; making it fractional remains an option if the stepping bar
  bothers anyone.
