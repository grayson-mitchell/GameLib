# Phase 85 deferred items

## From 85-01

- `pnpm backend-di-ceilings` fails on three steam bridge test files that plan 85-01 did not touch:
  `src/backend/storeManagers/steam/__tests__/games.test.ts` (47 > baseline 45, jestMock),
  `src/backend/storeManagers/steam/bridge/__tests__/otherSessionPlaying.test.ts` (2, no baseline entry) and
  `src/backend/storeManagers/steam/bridge/__tests__/steamOfflineMode.test.ts` (1, no baseline entry).
  They come from the `wip(debug)` work on the bridged-launch refusal (`fb7f9b243`), not from this phase. Out of scope; whoever owns that work
  should record the counts in a `meta/backendDiCeilings/*.json` shard or drop the `jest.mock` calls.
