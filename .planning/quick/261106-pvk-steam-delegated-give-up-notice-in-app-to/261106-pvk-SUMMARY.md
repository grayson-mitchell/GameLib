---
phase: quick-261106-pvk
plan: 01
subsystem: steam-notices
tags: [steam, toast, notice-stack, ipc, cancel]
requires: [261105-vfq]
provides: [steamRequestNotice push, request slot in SteamEngineLaunchNotice, delegated-cancel abort gate]
affects: [library.ts, dispatch.ts, SteamEngineLaunchNotice, GlobalState]
key-files:
  created:
    - src/frontend/state/SteamRequestNotice.ts
    - src/frontend/state/__tests__/SteamRequestNotice.test.ts
  modified:
    - src/common/types/steam.ts
    - src/common/types/ipc.ts
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
    - src/backend/gamedetails/dispatch.ts
    - src/backend/gamedetails/__tests__/gameDetailsModules.test.ts
    - src/preload/api/steam.ts
    - src/frontend/state/GlobalState.tsx
    - src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx
    - src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/SteamEngineLaunchNotice.test.tsx
    - public/locales/en/gamelib.json
    - meta/i18nCatalogPresenceBaseline.json
decisions:
  - New one-way push `steamRequestNotice` (not the engine-state push, which needs a base state a delegated install lacks).
  - Request slot lives in the existing SteamEngineLaunchNotice / NoticeStack region; no new component or positioned element.
  - Cancel ERROR fixed narrowly in dispatch.kill(); aborthandler and download-queue code untouched.
metrics:
  tasks: 3
  completed: 2026-11-06
---

# Quick 261106-pvk: Steam give-up notice in-app, no false Cancel ERROR

Both 2-minute Steam give-ups (install and uninstall not started) now push `steamRequestNotice` to a fourth slot in the in-app bottom-right toast stack instead of calling `notify()`, and Cancel on a Steam-delegated install no longer logs "Aborting not possible".

## Commits
- `4d8aade9b` Task 1: backend push, `isDelegatedInstallPolling`, `kill()` gate, tests PVK-1..6
- `0ca02bbd0` Task 2: preload slot, `SteamRequestNotice` store, GlobalState listener, tests
- `0b24d6f2c` Task 3: request slot in `SteamEngineLaunchNotice`, `steam.requestNotice.fallbackTitle`, i18n baseline

## Behaviour
- library.ts: both give-up branches send `steamRequestNotice {appId, title, kind, seq}` (module counter `steamRequestNoticeSeq`); logWarning, `gameStatusUpdate done` and stop order kept. All other `notify()` calls unchanged. No new timer or handle.
- dispatch.kill(): `callAbortController` skipped only for `runner === 'steam' && isDelegatedInstallPolling(appName)`; abort-before-stop order retained; predicate not evaluated for other runners.
- Renderer: validated store (appId regex, closed kind union, numeric seq, string title; lower/equal seq ignored). Slot shows once per seq, countdown frozen (`--waiting`) until GameLib is visible and focused, 8s auto-hide, embed suppression includes it. Body is a catalogue string chosen by `kind` (existing keys, text unchanged); empty title falls back to "Steam".

## Verification
- Jest: library.test.ts (338), gamedetails, downloadmanager utils + installStallWatchdog, aborthandler, electronReachLedger, gameDetailsImportGate, state tests, SteamEngineLaunchNotice + NoticeStack all pass. Wider run (`src/frontend/state`, `src/frontend/components/UI`, library, gamedetails): 1662 pass, 1 fail (below).
- `pnpm codecheck` clean. eslint on the touched component: 0 errors; 4 warnings (3 react-hooks/exhaustive-deps on pre-existing effects, 1 no-unsafe-argument in the test at pre-existing code).
- `pnpm i18n` ok (no keys dropped), `pnpm i18n-churn-guard` clean, `pnpm lint-translations:gamelib` exit 0 after regenerating the baseline (adds only 48 `steam.requestNotice.fallbackTitle` pairs plus the generatedAt/total fields).
- Scoped `prettier --check` passes on every checked-in .ts/.tsx/.json path (all `--file-info` ignored:false); `public/locales/en/gamelib.json` is prettier-ignored so omitted.
- `grep notStarted` outside comments in library.ts: 0.

## Deviations
**[Rule 1] VFQ-3 test asserted `notify` for the install give-up** (library.test.ts). Updated to assert `steamRequestNotice` and no `notify`; same behaviour change as PVK-1. TDD ordering: tests were written alongside implementation in one pass rather than strictly red-first.

## Known failures not from this task
- `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` "render-site census" expects 27 `is-text` sites, finds 29. This diff adds no `is-text`, so it is pre-existing; not fixed.
- The `macArchKnownFixRouting` Intel failure was not hit in the runs above.

## Owed
Live check on signed-out Mac Steam (`pnpm tauri:dev`, GameLib on the same monitor): confirm the toast appears in-app after ~2 min for install and uninstall, and that Cancel logs no ERROR. The todo is untouched and still pending.

## Self-Check: PASSED
Commits 4d8aade9b, 0ca02bbd0, 0b24d6f2c exist; created files present.
