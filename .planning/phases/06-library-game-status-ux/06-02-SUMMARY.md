---
phase: 06-library-game-status-ux
plan: 02
subsystem: steam-game-status
tags: [steam, game-status, playing-badge, poller, cross-platform]
requires:
  - "SteamLibraryManager.init() (existing)"
  - "sendFrontendMessage gameStatusUpdate → libraryStatus → getCardStatus → isPlaying chain (existing)"
provides:
  - "readRunningAppId — cross-platform Steam RunningAppID reader"
  - "pollRunningOnce / startRunningPoll / stopRunningPoll — running-game poller"
  - "GameCard !isSteam guards hiding the Stop action for playing Steam games (D-08)"
affects:
  - "src/backend/storeManagers/steam/library.ts"
  - "src/backend/main.ts"
  - "src/frontend/screens/Library/components/GameCard/index.tsx"
tech-stack:
  added: []
  patterns:
    - "Module-level poller mirroring the existing install-poll lifecycle"
    - "Per-platform OS-state reader dispatched by isWindows/isMac"
    - "argv-form spawnSync/execFileSync (no shell) for reg.exe and ps"
key-files:
  created: []
  modified:
    - "src/backend/storeManagers/steam/library.ts"
    - "src/backend/storeManagers/steam/__tests__/library.test.ts"
    - "src/backend/main.ts"
    - "src/frontend/screens/Library/components/GameCard/index.tsx"
decisions:
  - "D-05: detect active session via Steam RunningAppID (registry.vdf macOS/Linux, HKCU reg Windows) with ps/reaper fallback on Linux"
  - "D-06: 5s poll cadence, poller runs only while app is open (started in init, stopped on before-quit)"
  - "D-07: reuse existing isPlaying UI via gameStatusUpdate chain; no new badge"
  - "D-08: hide Stop button + context-menu item for Steam while Playing (observe-only)"
metrics:
  duration: "~1h15m wall-clock (includes a connection-interruption gap; ~20m active)"
  completed: "2026-07-02"
  tasks: 3
  files: 4
---

# Phase 6 Plan 02: Steam Playing Badge & Stop Hide Summary

Live "Playing" status badge for active Steam sessions via a cross-platform
`RunningAppID` poller, with the Stop action hidden for Steam because GameLib
never owns the fire-and-forget `steam://rungameid` process (GAME-05, D-05–D-08).

## What Was Built

**Task 1 — Per-platform RunningAppID readers + running-game poller (`library.ts`, TDD)**
- `readRunningAppId()` (exported) dispatches by platform:
  - Windows: `windowsRunningAppId()` reads `HKCU\Software\Valve\Steam\RunningAppID`
    via argv-form `spawnSync('reg', [...])` (no shell; hardcoded key — T-06-04),
    parsing `REG_DWORD 0x<hex>` with `parseInt(hex, 16)`.
  - macOS: `macOsRunningAppId()` parses `~/Library/Application Support/Steam/registry.vdf`
    via `@node-steam/vdf` at exact key path `Registry.HKCU.Software.Valve.Steam.RunningAppID`
    (Pitfall 4 casing — T-06-06).
  - Linux: `linuxRegistryVdfRunningAppId()` reads `~/.steam/registry.vdf` (NOT
    `~/.steam/steam` — Pitfall 3); when it returns 0 (broken since 2023,
    ValveSoftware/steam-for-linux#9672) falls back to `linuxFallbackRunningAppId()`
    which scans `execFileSync('ps', ['-eo','args'])` for `reaper SteamLaunch --AppId (\d+)`
    (argv-form, narrow regex — T-06-05).
  - Every reader returns `0` on missing file / non-zero exit / thrown error; none throw.
- `pollRunningOnce()` (exported) compares `readRunningAppId()` to `lastKnownRunningAppId`
  and on a delta sends `done` for the old non-zero id then `playing` for the new
  non-zero id via `sendFrontendMessage('gameStatusUpdate', { appName: String(id), runner: 'steam', status })`.
  AppID is scoped numeric-only (T-06-07). No message on no-change.
- `startRunningPoll(intervalMs = 5000)` idempotent (`if (runningPollTimer) return`);
  `stopRunningPoll()` clears the timer, nulls it, and resets `lastKnownRunningAppId` to 0.
- 56 unit tests: per-platform readers (dispatch + error paths), poll deltas
  (0→X, X→0, X→Y, no-change), and start/stop idempotency.

**Task 2 — Poller lifecycle wiring (`library.ts` init + `main.ts` quit)**
- `SteamLibraryManager.init()` calls `startRunningPoll()` (idempotent, re-init safe).
- `main.ts` imports `stopRunningPoll` and calls it from `app.on('before-quit', ...)`
  so the interval never dangles. `before-quit` fires on every platform (including
  macOS, where `window-all-closed` does not quit). Because the Electron main
  process only runs while the app is open, this satisfies D-06 without per-window
  tracking.

**Task 3 — Hide Stop for playing Steam games (`GameCard/index.tsx`, D-08)**
- Inline Stop icon gated `if (isPlaying && !isSteam)` — a playing Steam game falls
  through to the installed-game play icon; the Playing badge still renders via
  `gameCardStatus`.
- Context-menu Stop item gated `show: isPlaying && !isSteam`.
- No changes to `constants.ts`, `hooks/constants.ts`, or CSS — the `playing` label
  and `getCardStatus` already exist. Stop behavior for other runners is unchanged.

## How It Works (end-to-end)

`startRunningPoll()` (from init) → every 5s `pollRunningOnce()` reads the OS
`RunningAppID` → on a 0→X delta publishes `gameStatusUpdate { status: 'playing' }`
→ `GlobalState.handleGameStatus` adds it to `libraryStatus` → `hasStatus` →
`getCardStatus` → `isPlaying: true` → GameCard renders the "Playing" badge (Stop
hidden for Steam). On X→0 it publishes `done`, clearing the badge. `stopRunningPoll()`
on `before-quit` tears down the timer.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] macOS registry.vdf path built from `userHome` instead of `defaultSteamPath`**
- **Found during:** Task 1
- **Issue:** RESEARCH referenced `join(defaultSteamPath, 'registry.vdf')` for macOS,
  but `defaultSteamPath` is a runtime `GlobalConfig` value not importable as a plain
  constant in `library.ts`; using it would also complicate the unit-test mocks.
- **Fix:** Built the macOS path directly from the stable `userHome` constant:
  `join(userHome, 'Library', 'Application Support', 'Steam', 'registry.vdf')` — the
  canonical macOS Steam location (matches `getSteamCompatFolder()` in config.ts).
- **Files modified:** src/backend/storeManagers/steam/library.ts
- **Commit:** 867be624

No other deviations — the plan was executed as written.

## TDD Gate Compliance

Task 1 is `tdd="true"`. RED was verified before GREEN: the new tests were written
first and confirmed failing (19 failures — `readRunningAppId`/`pollRunningOnce`/
`startRunningPoll`/`stopRunningPoll` `is not a function`) prior to implementation,
then all 56 pass after implementation.

**Note on commit granularity:** A connection interruption occurred after the RED
run but before any commit existed. On resume, the test and implementation were both
already present in the working tree and were committed together as a single
`feat(06-02)` commit (867be624) rather than separate `test`/`feat` commits. The
RED→GREEN sequence was still followed and verified; only the commit split was
collapsed due to interruption-recovery.

## Verification

- `pnpm test --testPathPattern="steam.*library"` → 56 passed, 1 suite passed.
- `pnpm run codecheck` (`tsc --noEmit`) → exits 0 after Tasks 2 and 3.
- `grep -c 'isPlaying && !isSteam' GameCard/index.tsx` → 2.
- Manual UAT (launch a Steam game, observe badge within ~5s, clears within ~5s of
  exit, no Stop button for Steam) is deferred to `/gsd:verify-work` per 06-VALIDATION.

## Known Stubs

None. All readers, the poller, and the GameCard guards are fully wired to live
OS state and the existing frontend status chain.

## Self-Check: PASSED
- FOUND: src/backend/storeManagers/steam/library.ts (readRunningAppId, pollRunningOnce, startRunningPoll, stopRunningPoll)
- FOUND: src/backend/storeManagers/steam/__tests__/library.test.ts (56 tests pass)
- FOUND: src/backend/main.ts (stopRunningPoll on before-quit)
- FOUND: src/frontend/screens/Library/components/GameCard/index.tsx (2x isPlaying && !isSteam)
- FOUND commit 867be624 (Task 1), 821b3160 (Task 2), 1fd18584 (Task 3)
