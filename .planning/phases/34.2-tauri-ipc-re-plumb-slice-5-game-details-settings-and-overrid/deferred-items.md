# Deferred Items — Phase 34.2

Out-of-scope discoveries logged during plan execution per the executor's scope-boundary rule
(fix only what the current task's changes directly caused; log everything else here instead
of fixing it inline).

## From plan 34.2-03

- **Pre-existing eslint error in `src/backend/crossover_index/__tests__/index.test.ts:29`**
  (`@typescript-eslint/no-unnecessary-type-assertion`) — confirmed pre-existing via
  `git stash` + re-run (present before any of this plan's edits, in a file this plan never
  touches). Out of scope for 34.2-03's Task 2 eslint acceptance criterion, which only covers
  `launcher.ts`, `knownFixes.ts`, `crossover_index`, and `main.ts` as a group; the pre-existing
  error sits inside that directory group but predates this plan and is unrelated to the D-06
  extraction. Not fixed here.
