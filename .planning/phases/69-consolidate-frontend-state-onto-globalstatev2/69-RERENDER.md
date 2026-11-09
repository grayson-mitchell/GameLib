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

pending 69-25
