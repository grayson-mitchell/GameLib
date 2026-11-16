---
created: 2026-11-16T00:00:00Z
title: 'Pre-push hook red: gameLaunch.ts over the steam line ceiling and new jest.mock ratchet hits'
area: tooling
severity: medium
platform: any
ready: code
source: phase 80 push on 2026-11-16 (pushed with --no-verify at the operator's direction)
files: [src/backend/storeManagers/steam/gameLaunch.ts, src/backend/__tests__/steamPollProfileFixtures.test.ts, src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.bottleWaiting.test.tsx, src/backend/__tests__/steamPollParity.test.ts, src/backend/__tests__/steamPollTsDriver.test.ts, meta/backendDiCeilings, meta/steamLineCeiling.cjs]
---

## Problem

On 2026-11-16 `main` was pushed with `--no-verify` because two pre-push checks stayed red after
every phase-80-caused check was fixed:

1. `pnpm steam-line-ceiling`: `src/backend/storeManagers/steam/gameLaunch.ts` has 1131 lines (max
   1000, "split it, do not allowlist it"). It was already 1131 on `origin/main` before the push
   (it crossed the ceiling in 76-01 / 79-40, 2026-11-15), so origin was red on this check too.
2. `pnpm backend-di-ceilings` (jestMock, "remove it instead"):
   - `src/backend/__tests__/steamPollProfileFixtures.test.ts` 1 (`jest.doMock('path')` so
     `process/appPaths` runs under the win32/posix path flavour). Removing it needs `appPaths` to
     take the path implementation as a parameter.
   - `GameStatus.bottleWaiting.test.tsx`, `GameStatus.redistSpinner.test.tsx` and
     `GameStatus.steamUpdate.test.tsx` (all under
     `src/frontend/screens/Game/GamePage/components/__tests__/`), each 8 vs baseline 7: quick
     261114-obu added `jest.mock('../SteamUpdateInfo')` to each. Without it the
     suite fails to load (SteamUpdateInfo pulls in `tauriAttach`, which reads `window` in the node
     environment).
   - `src/backend/__tests__/steamPollParity.test.ts` 20 and `steamPollTsDriver.test.ts` 20: the
     phase-80 TS parity harness. Phase 80 plan 29 retires this harness, so no conversion is
     planned; confirm both files are gone (or at 0) after plan 29.

## Solution

- Split `gameLaunch.ts` below 1000 lines.
- Inject the path module into `appPaths` (or test it per-platform another way) and drop the
  `doMock`.
- Make the three `GameStatus.*` suites load without mocking `SteamUpdateInfo` (inject it, or run the
  suite under jsdom), or re-pin the baseline with a written reason if the mock is the right shape.
- After plan 29, re-run `pnpm backend-di-ceilings` and confirm the parity-harness entries are gone.
- Then `bash .husky/pre-push` must exit 0 on a clean tree.
