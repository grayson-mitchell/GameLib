# Phase 81 deferred items

Out-of-scope discoveries logged by plan executors. Not fixed in the plan that found them.

## Found in 81-01 (2026-11-18)

- `pnpm backend-di-ceilings` fails for `launchWithoutSteam.test.ts`, `NativePortInfo.test.tsx` and
  `LaunchWithoutSteam.test.tsx`. None touches steamPoll; pre-existing.
- `pnpm find-deadcode` reports `NativePortDataStyle` and `NativePortMac` in
  `nativePortCatalogue.ts`. Not steamPoll-related; pre-existing.
- `eslint import-x/no-duplicates` warnings in `src/backend/sidecar/steamPollEventRegistration.ts`
  (`installRoot` imported twice). Pre-existing, not introduced by 81-01.

## Found in 81-02 (2026-11-18)

- `src/backend/storeManagers/steam/localFiles/__tests__/acfUpdateReplay.test.ts` fails with
  `no oracle case acfUpdate/readLocalConfigBetaKey/playtime/10` (a missing oracle fixture case).
  Reproduced with 81-02's mockedFsSteamFiles edit reverted, so it is pre-existing and not steamPoll
  adoption work. The plan's jest verify path includes this directory; every other suite there passes.
