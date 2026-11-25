# Phase 88.1 deferred items

Out-of-scope discoveries logged during execution; not fixed by the plan that found them.

## 88.1-16

- `src/backend/__tests__/infoShimSchedule.test.ts` fails on `every row is imported by exactly its listed callers`
  (rows `anticheatStatus` and `anticheatDownload`): `ANTICHEAT_CALLERS` lists `src/backend/launcher.ts`, which no longer
  imports `src/backend/info/anticheat.ts`. Introduced by 88.1-15 (commit 6a9669b06). Fix: remove `src/backend/launcher.ts`
  from `ANTICHEAT_CALLERS` (the comment above the rows names the launcher's `gameAnticheatInfo` lookup, which moved to Rust).
