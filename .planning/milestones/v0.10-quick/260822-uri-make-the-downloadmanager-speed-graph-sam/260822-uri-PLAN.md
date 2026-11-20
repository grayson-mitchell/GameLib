---
quick_id: 260822-uri
description: Make the DownloadManager speed graph sample on a fixed 1-second timer for all runners instead of once per percent change
date: 2026-08-22
mode: quick
---

# Quick Task 260822-uri: 1 Hz DownloadManager speed graph

## Problem

`ProgressHeader` pushes exactly one chart sample per run of a `useEffect` keyed on
`[progress, props.state]`, where `progress` comes from `hasProgress`
(`src/frontend/hooks/hasProgress.ts:42`):

```ts
if (currentProgress.percent !== installationProgress.percent)
  setProgress({ ... })
```

Any progress emit whose `percent` equals the previous one is discarded **together with
its `downSpeed`/`diskSpeed`** — which are the only values the chart plots. The chart's
sample rate is therefore the *rate of change of `percent`*, not the emit rate.

Per-runner `percent` precision differs:

| Runner | Source | Precision |
|---|---|---|
| GOG | `data.match(/Progress: (\d+\.\d+) /m)` — `gog/games.ts:255` | fractional |
| Epic | `Math.round(x * 10000) / 100` — `legendary/games.ts:457` | 2 decimals |
| Steam | `Math.min(100, Math.round(...))` — `steam/depot.ts:2345`, `steam/library.ts:2498` | **integer** |

So GOG/Epic change `percent` on essentially every emit and sample at their native
cadence, while Steam only advances once per whole percent — sub-second on a small game,
10 s+ on a large one, with the MB/s readouts frozen in between. The Steam backend is
emitting fine (`PROGRESS_THROTTLE_MS = 500`, `depot.ts:950`, so ≥2 Hz) and
`InstallProgress.ts:10` stores every emit; the loss is entirely at the `hasProgress` gate.

## Fix

Drive the chart off a fixed 1000 ms timer, reading the **ungated** zustand store. This
also makes the x-axis a meaningful rolling window (100 samples = 100 s) for every runner
instead of "100 percent-ticks".

## Constraints

- `hasProgress` stays unchanged — the percent label, ETA and `LinearProgress` read from
  it and are correct as-is.
- Frontend jest runs `testEnvironment: 'node'` with no jsdom (`src/frontend/jest.config.js`),
  so the sampling logic must live in pure exported functions to be testable. Follow the
  existing `speedSample.ts` extraction pattern.
- Preserve: full reset on `state === 'idle'`, the 100-sample window shift, and
  `nextSpeedSample`'s paused-implies-0 MB/s rule.

## Tasks

### Task 1 — Expose an ungated read of the install-progress store

**files:** `src/frontend/state/InstallProgress.ts`

**action:** Export `getInstallProgress(appName, runner)` returning
`useInstallProgressRaw.getState()[`${appName}_${runner}`]`. An imperative getter (rather
than a `subscribe` into a ref) means the 2 Hz emits drive zero additional renders — the
timer pulls the latest value when it fires.

**verify:** `pnpm exec tsc --noEmit` clean; existing store consumers untouched.

**done:** The current progress for a `(appName, runner)` pair is readable outside React's
subscription path.

### Task 2 — Move chart sampling onto a 1 s timer

**files:**
- `src/frontend/screens/DownloadManager/components/ProgressHeader/speedSample.ts`
- `src/frontend/screens/DownloadManager/components/ProgressHeader/index.tsx`

**action:** In `speedSample.ts` add, alongside the existing `nextSpeedSample`:
- `SAMPLE_INTERVAL_MS = 1000` — the tick period.
- `emptySamples(sampleSize)` — the zero-filled reset buffer.
- `appendSample(samples, state, progress, sampleSize)` — pure: computes the next point via
  `nextSpeedSample` from `progress?.downSpeed` / `progress?.diskSpeed` and the previous
  sample's `download`, appends it, and shifts the window at `sampleSize`. Returns a **new**
  array (the current code mutates `avgSpeed` in place before copying).

In `index.tsx` replace the `[progress, props.state]` effect with one keyed on
`[props.state, props.appName, props.runner]` that:
- resets to `emptySamples(sampleSize)` and returns when `state === 'idle'`;
- otherwise takes one sample immediately, then every `SAMPLE_INTERVAL_MS` via
  `setInterval`, each tick reading `getInstallProgress(appName, runner)`;
- clears the interval on unmount / dep change.

`hasProgress` is still called for `percent` / `eta` / `bytes`.

**verify:** `pnpm exec tsc --noEmit`; `pnpm exec jest src/frontend`.

**done:** Sample cadence is 1 Hz and independent of `percent`, for every runner.

### Task 3 — Tests for the timer-driven cadence

**files:** `src/frontend/screens/DownloadManager/components/ProgressHeader/__tests__/speedSample.test.ts`

**action:** Keep the four existing `nextSpeedSample` cases. Add coverage for:
- `appendSample` accrues a **distinct sample per call for an identical progress object**
  (the unchanged-percent regression) — the property that was previously impossible.
- the sample rate is identical for a Steam integer-percent payload and a GOG
  fractional-percent payload (runner-independence).
- the window shifts at `sampleSize`, keeping the newest sample last.
- `appendSample` does not mutate its input array.
- a `paused` tick decays to 0 MB/s and keeps decaying on subsequent ticks.
- `emptySamples` / `SAMPLE_INTERVAL_MS` shape.

**verify:** `pnpm exec jest src/frontend/screens/DownloadManager`.

**done:** A regression back to percent-gated sampling fails the suite.

## Must haves

- Chart sample interval is a constant 1000 ms, not a function of `percent`.
- Samples are sourced from the ungated store, never from `hasProgress`.
- `state === 'idle'` still resets the buffer; `paused` still reads 0 MB/s.
- Interval cleared on unmount.
- `pnpm exec jest src/frontend` green; `pnpm exec tsc --noEmit` clean.
