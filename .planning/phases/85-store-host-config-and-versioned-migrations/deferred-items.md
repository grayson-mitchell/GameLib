# Phase 85 deferred items

## From 85-01

- `pnpm backend-di-ceilings` fails on three steam bridge test files that plan 85-01 did not touch:
  `src/backend/storeManagers/steam/__tests__/games.test.ts` (47 > baseline 45, jestMock),
  `src/backend/storeManagers/steam/bridge/__tests__/otherSessionPlaying.test.ts` (2, no baseline entry) and
  `src/backend/storeManagers/steam/bridge/__tests__/steamOfflineMode.test.ts` (1, no baseline entry).
  They come from the `wip(debug)` work on the bridged-launch refusal (`fb7f9b243`), not from this phase. Out of scope; whoever owns that work
  should record the counts in a `meta/backendDiCeilings/*.json` shard or drop the `jest.mock` calls.

## From 85-18

- `src/backend/__tests__/tauriShellSource.test.ts` "Phase 85 plan 09: store boot wiring > the ownership file flips only the tracer store"
  fails: it still asserts every family in `storeOwnership.json` is `false` and `stores` is the one tracer override, but 85-12
  (`1d7c3c2aa`) flipped `families.cache` to `true` and removed the override. The assertion was not updated when the cache family
  flipped. Not touched by 85-18 (that plan only changed the arm count and added the two gate channels in the same file); each later
  family flip (85-13..) will move the same assertion, so the owner of the next flip should rewrite it to read the expected flips
  from one place instead of pinning "all false".
