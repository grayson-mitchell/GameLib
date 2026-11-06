---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 08
subsystem: steam-engine
tags: [steam, ipc, status, i18n]
requires: [59-07]
provides:
  - getSteamEngineState / listSteamEngineOptions / dismissSteamEngineNotice invoke channels and steamEngineStateChanged push
  - Status 'engine-download' across game page, library card, console mode
  - steam.engine.* strings in gamelib.json
key-files:
  created:
    - src/backend/sidecar/__tests__/steamEngineFlows.test.ts
  modified:
    - src/common/types/ipc.ts
    - src/preload/api/steam.ts
    - src/backend/sidecar/steamAuthFlowRegistration.ts
    - src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts
    - src/common/types.ts
    - src/frontend/state/GlobalState.tsx
    - src/frontend/hooks/constants.ts
    - src/frontend/types.ts
    - src/frontend/screens/Game/GameContext.tsx
    - src/frontend/screens/Game/GamePage/index.tsx
    - src/frontend/screens/Game/GamePage/components/GameStatus.tsx
    - src/frontend/screens/Game/GamePage/components/MainButton.tsx
    - src/frontend/screens/Library/components/GameCard/constants.ts
    - src/frontend/screens/Library/components/GameCard/index.tsx
    - src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx
    - src/frontend/screens/ConsoleMode/components/ConsoleCard/index.tsx
    - public/locales/en/gamelib.json
decisions:
  - "Engine IPC handlers pass args[0] uncast; engineState guards validate"
  - "GamePage carries engine-download as its own is.downloadingEngine flag (not folded into preparingDrm) so 59-11 can render it independently"
metrics:
  tasks: 3
  completed: 2026-11-01
---

# Phase 59 Plan 08: Engine IPC, engine-download status, strings Summary

Shared contract for the engine UI: three validated invoke channels plus a `steamEngineStateChanged` push (census 22 -> 25), a new `engine-download` status rendered wherever `drm-setup` is, and 58 `steam.engine.*` English strings.

## Tasks

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1. IPC channels, publisher, census | bd0009d97 | 4 new tests; census, steamAuthFlows green |
| 2. engine-download status | 6cb24cc57 | `pnpm codecheck` clean; 60 frontend suites / 864 tests pass |
| 3. gamelib.json strings | 55c7504d8 | only the en gamelib catalogue staged |

## Deviations from Plan

**1. [Rule 3 - Blocking] Extra files for the game page.** The page's busy state flows through `is.*` flags, so `is.downloadingEngine` was added to `src/frontend/types.ts`, `GameContext.tsx`, `GameStatus.tsx` (progress line) and `MainButton.tsx` (busy and label), plus three MainButton tests that build a full `is` object (`importDemotion`, `installClickRouting`, `steamSplitButton`). No badge was added (59-11 owns it). Other consumers needed no change: DownloadHero keys on queue entries, not Status.

## Verification notes

- `pnpm lint-translations:gamelib` fails: 54 new "not localised" findings per non-en locale for the new keys. The repo's practice is a separate follow-up that adds keys to the non-en catalogues (cf. quick-261029-nmt); not done here. Total failures also include large pre-existing findings.
- `pnpm i18n-churn-guard` fails only because of the user's pre-existing uncommitted edit to `public/locales/en/gamepage.json` (untouched and unstaged here).
- Keys are not yet referenced by t() calls except `steam.engine.status.downloading`; the rest land in 59-09..59-12.

## Known Stubs

None.

## Self-Check: PASSED

Commits bd0009d97, 6cb24cc57, 55c7504d8 present; steamEngineFlows.test.ts exists.
