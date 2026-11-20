# Phase 69 Re-render Measurements

D-14: record Library and GameCard re-render cost before any slice migrates, and again at the end (69-25).

## Method

- Route: option-a, jsdom harness under jest (`meta/rerender`).
- Command: `PERF_ERA=<era> pnpm perf:rerender` (era `baseline` here).
- N=5 runs per step, median reported.
- Synthetic library: 2,000 games split 600/500/300/500/100.
- Steps: toggleAppearance (flip a UI/appearance setting), gameStatusPush (push a game status update), dialogOpenClose (open then close a dialog), libraryRefreshPush (push a refreshed library).
- Commit counts are the primary metric; jsdom durations are indicative only (not WebKit timings).

## Baseline

Measured at commit `097106497` (unmigrated tree: GlobalState.tsx untouched, no domain store files), 2026-11-10. Raw numbers: `meta/rerender/results/baseline.json`. Two consecutive runs agreed on every commit count.

| Step               | Library commits | Library actualDuration ms | GameCard commits | GameCard actualDuration ms |
| ------------------ | --------------- | ------------------------- | ---------------- | -------------------------- |
| toggleAppearance   | 1               | 19.76                     | 100              | 18.4                       |
| gameStatusPush     | 3               | 37.73                     | 200              | 36.45                      |
| dialogOpenClose    | 2               | 38.24                     | 200              | 35.68                      |
| libraryRefreshPush | 3               | 50.52                     | 266              | 47.84                      |

## Final

Measured at commit `0af370d15` (migrated tree: `GlobalState.tsx`, `ContextProvider` and `ContextType` deleted; domain stores in place), 2026-11-10, via `PERF_ERA=final pnpm perf:rerender`. Raw numbers: `meta/rerender/results/final.json` (second run kept). Two consecutive runs agreed on every commit count (durations differed by under 2 ms).

| Step               | Library commits | Library actualDuration ms | GameCard commits | GameCard actualDuration ms |
| ------------------ | --------------- | ------------------------- | ---------------- | -------------------------- |
| toggleAppearance   | 1               | 30.41                     | 100              | 29.92                      |
| gameStatusPush     | 3               | 60.92                     | 200              | 59.25                      |
| dialogOpenClose    | 0               | 0                         | 0                | 0                          |
| libraryRefreshPush | 2               | 63.02                     | 200              | 59.57                      |

## Comparison

Seam note: the baseline was measured (69-04) with the harness mounting through the old `GlobalState`/`ContextProvider` seam. 69-24 deleted that seam and adapted `meta/rerender/seam.tsx` to mount through the store-based boot path (`runPostMountBoot` + `BootSequence`). Scenario, synthetic library and steps are unchanged, but the mount path is not identical, so treat the comparison as indicative. For context, the mid-migration run at 69-20 was temporarily higher (2/200, 4/300, 2/200, 4/366) because state was double-rendered through the bridge.

| Step               | Library commits (base -> final) | Delta | GameCard commits (base -> final) | Delta | Library ms (base -> final) | GameCard ms (base -> final) |
| ------------------ | ------------------------------- | ----- | -------------------------------- | ----- | -------------------------- | --------------------------- |
| toggleAppearance   | 1 -> 1                          | 0     | 100 -> 100                       | 0     | 19.76 -> 30.41             | 18.4 -> 29.92               |
| gameStatusPush     | 3 -> 3                          | 0     | 200 -> 200                       | 0     | 37.73 -> 60.92             | 36.45 -> 59.25              |
| dialogOpenClose    | 2 -> 0                          | -2    | 200 -> 0                         | -200  | 38.24 -> 0                 | 35.68 -> 0                  |
| libraryRefreshPush | 3 -> 2                          | -1    | 266 -> 200                       | -66   | 50.52 -> 63.02             | 47.84 -> 59.57              |

Reading:

- dialogOpenClose is the clear win (2/200 -> 0/0). Under the single context value every consumer re-rendered on any change, so opening a dialog re-rendered Library and every card. With selector subscriptions, Library no longer subscribes to dialog state, so a dialog change never reaches it.
- libraryRefreshPush improved (3/266 -> 2/200): the refresh now goes through the library store only, removing the extra commit and the 66 extra card commits previously caused by the context value changing twice.
- toggleAppearance and gameStatusPush did NOT improve: commit counts are identical (1/100, 3/200). Those steps change data Library and each card legitimately depend on, so a selector subscription still has to re-render them.
- Durations went UP on every step that still renders (roughly 50-60 percent, e.g. toggleAppearance 19.76 -> 30.41 ms). These are jsdom actualDurations, indicative only, and the machine ran a concurrent session during the final run, and the mount seam differs, so this is not conclusive. It is reported plainly and not tuned here; commit counts (the primary metric) did not regress at any step. If a real-WebKit measurement later shows slower renders, that is a separate investigation.
