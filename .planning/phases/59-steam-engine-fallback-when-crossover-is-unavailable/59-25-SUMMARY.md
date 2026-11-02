---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 25
subsystem: settings
tags: [gap-closure, G17, settings, ipc]
requires: []
provides:
  - createSettingSetter (pure setter)
  - applyGameSetting (retrying, logged per-game write)
affects: [59-30]
key-files:
  created:
    - src/backend/sidecar/gameSettingWrite.ts
    - src/backend/sidecar/__tests__/gameSettingWrite.test.ts
    - src/frontend/screens/Settings/components/__tests__/SteamEngineOverride.save.test.tsx
    - src/frontend/hooks/__tests__/useSettingsContext.setSetting.test.ts
  modified:
    - src/frontend/hooks/useSettingsContext.ts
    - src/frontend/screens/Settings/components/SteamEngineOverride.tsx
    - src/backend/sidecar/settingsFlowRegistration.ts
requirements-completed: [D-14]
completed: 2026-11-02
---

# Phase 59 Plan 25: G17 engine override save drop Summary

The G17 drop was located as class (c), at or after the IPC hop, but the exact cause is NOT proven. A defensive fix and diagnostics were added; G17 stays open until 59-30 item 22.

## Evidence

Task 1 desk test: every case passed (Automatic and CrossOver from a stored pinned build, pinned to pinned, no-op, stored `wine-manager:0.0-missing`). The renderer setter chain is correct, so this ruled out class (b), the stale guard and no-change check.

Task 2 live probes (operator did only the pinned-set step; the Automatic and CrossOver clicks of steps 3-4 were NOT performed). The first save after opening Settings was dropped and the retry landed:

```
(19:15:59) [Frontend]: [G17-probe] render override=automatic loaded=true
(19:16:04) [Frontend]: [G17-probe] select onChange raw=pinned:wine-staging-11.20 value=automatic
(19:16:04) [Frontend]: [G17-probe] setSetting app=1284190 key=steamEngineOverride new=pinned:wine-staging-11.20 current=automatic earlyReturn=false
   (no backend "Setting steamEngineOverride" line)
(19:16:10) [Frontend]: [G17-probe] render override=automatic loaded=false   (reopened: still automatic)
(19:16:17) [Frontend]: [G17-probe] select onChange raw=pinned:wine-staging-11.20 value=automatic
(19:16:17) [Frontend]: [G17-probe] setSetting ... earlyReturn=false
(19:16:17) 1284190: Setting steamEngineOverride to "pinned:wine-staging-11.20"
```

Classification: (c). MUI fired and the setter sent. The onChange fired, so this is not class (a).

## Root cause analysis (honest status)

Traced `window.api.setSetting` -> `tauriTransport.send` -> Rust `sidecar_send` -> send-writer queue -> `sidecarRpc.dispatchSend` -> `ipcMain.on('setSetting')` -> `GameConfig.get(appName).setSetting`. The shell log has no write_frame failure and the renderer logged no send rejection. The one place a failure is invisible by construction: `dispatchSend` catches a listener throw and writes it to the sidecar stderr only. `GameConfig.get()` reads and parses the title's GamesConfig and runs `upgrade()` (a read-parse-rewrite) before the logged `setSetting`, so a transient throw there (for example a file read mid-rewrite) drops the write with no line in gamelib.log. That fits "intermittent, first save fails, retry lands". It is a hypothesis; the throw was not observed.

## Fix

- `applyGameSetting` (new `gameSettingWrite.ts`, used by the setSetting handler): one retry, and a `logError` line in gamelib.log if both attempts throw. This is a backend deviation outside `files_modified`, which the coordinator allowed.
- `createSettingSetter` extracted and simplified (the always-true `!== undefined || !== null` guard removed; behaviour unchanged).
- All `[G17-probe]` logging removed (grep: 0 remaining).
- Tests: save-chain test (`SteamEngineOverride.save.test.tsx`), `useSettingsContext.setSetting.test.ts`, `gameSettingWrite.test.ts`. The four frontend suites plus `settingsFlows.test.ts` pass; `pnpm codecheck` is green and prettier is clean.

## Acceptance gate

Node tests cannot prove the live fix. 59-30 re-UAT item 22 (live Automatic and CrossOver clicks, expecting a `Setting steamEngineOverride` line each time) is the G17 acceptance gate. If it still drops with no `setSetting ... failed after retry` error line, the drop is before the sidecar handler and needs `GAMELIB_TRACE_SEND=1` (Rust send-trace) to continue.

## Deviations from Plan

**1. [Rule 3] Backend change outside files_modified** - `settingsFlowRegistration.ts` and new `gameSettingWrite.ts` (commit 04347fd14), as authorised by the coordinator after the class (c) result.

**2. Task 2 partial** - only the pinned-set step was exercised live; the Automatic and CrossOver clicks were not.

## Task Commits
1. Task 1: b9d5c71d7
2. Task 3: 04347fd14

## Self-Check: PASSED
