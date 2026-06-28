---
phase: 03-game-operations
plan: "04"
subsystem: steam-install-ux
tags: [steam, polling, install, ux, d07]
dependency_graph:
  requires: ["03-02", "03-03"]
  provides: ["ACF-install-poller", "steam-installing-ux"]
  affects: ["frontend-game-status", "library-manager-init"]
tech_stack:
  added: []
  patterns:
    - "ACF manifest polling via setInterval with grace window and safety cap"
    - "TDD RED/GREEN cycle for backend polling lifecycle"
    - "FontAwesomeIcon faSyncAlt fa-spin spinner pattern (reuse of LibraryHeader)"
    - "runner === 'steam' guard branches in GameCard and MainButton"
key_files:
  created: []
  modified:
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/frontend/hooks/constants.ts
    - src/frontend/screens/Game/GamePage/components/MainButton.tsx
    - src/frontend/screens/Library/components/GameCard/index.tsx
    - public/locales/en/gamepage.json
decisions:
  - "TDD: stubs exported in library.ts (RED) then replaced with real implementation (GREEN)"
  - "pollInstallOnce is exported as a pure per-tick helper; startInstallPolling owns the setInterval and grace/cap logic"
  - "jest.spyOn(libraryModule, 'startInstallPolling') used in games.test.ts (TypeScript compiles named imports as property accesses — spyOn intercepts correctly)"
  - "scanDownloadingAppIds uses the same directory walk as buildInstalledMap but returns bit-4-unset appIds present in library"
  - "init() wraps scanDownloadingAppIds in try/catch so scan failure never blocks startup"
  - "GameCard uses a disabled <button> with faSyncAlt fa-spin (no SvgButton, no onClick) for Steam-installing state"
  - "Context-menu cancel item gains && !isSteam guard"
metrics:
  duration: "~35 minutes"
  completed: "2026-06-28"
  tasks_completed: 2
  tasks_total: 3
  files_changed: 8
---

# Phase 3 Plan 04: Steam Install In-Progress UX Summary

**One-liner:** ACF polling loop (3s interval, grace window, safety cap) surfacing "Steam installing" spinner + badge flip on completion, with no percentage and no pause/cancel for Steam.

## What Was Built

### Task 1: Backend ACF install poller (TDD)

Added five exported functions to `library.ts`:

**`readAcfState(appId)`** — single-manifest reader. Walks library paths, checks `appmanifest_{appId}.acf` by exact filename (not readdirSync), reads StateFlags bitmask. Returns `{ state: 'absent' | 'downloading' | 'installed', installPath?, sizeOnDisk? }`. Corrupt ACF files are swallowed (T-2-01).

**`pollInstallOnce(appId)`** — per-tick handler. On 'downloading': sends `gameStatusUpdate { status: 'installing' }` and updates `seenDownloading` on the activePolls entry. On 'installed': updates in-memory library entry (`is_installed: true`, install path/size/platform), sends `pushGameToLibrary` then `gameStatusUpdate { status: 'done' }`, then stops polling. On 'absent': no-op (grace logic lives in the setInterval callback).

**`startInstallPolling(appId, intervalMs=3000)`** — idempotent loop starter. Guards with `activePolls.has(appId)` return. Registers `{ timer, ticks: 0, seenDownloading: false }` entry. Each interval tick: increments ticks, checks `MAX_TICKS=7200` safety cap, calls `pollInstallOnce`, checks `activePolls.has(appId)` (in case installed-state stop already fired), checks grace window `GRACE_TICKS=20` (stops if `!seenDownloading && ticks >= 20`).

**`stopInstallPolling(appId)`** — clears interval, deletes activePolls entry. Safe when no entry exists.

**`scanDownloadingAppIds()`** — full directory walk (same structure as buildInstalledMap) returning string appIds whose manifest has `(StateFlags & 4) === 0` AND are present in the in-memory `library` Map.

**`SteamLibraryManager.init()`** updated to call `scanDownloadingAppIds()` after cache-load and start polling for each result (wrapped in try/catch for startup safety).

**`games.ts install()`** updated to call `startInstallPolling(this.appId)` after `shell.openExternal` succeeds. The `buildSteamProtocolUrl` appId guard already ensures only numeric appIds reach this call.

### Task 2: Steam-aware installing UX

**`gamepage.json`**: Added `status.steamInstalling = "Steam installing"`.

**`constants.ts getStatusLabel`**: Added `runner === 'steam'` guard — returns `t('gamepage:status.steamInstalling', 'Steam installing')` with no `{percent}` interpolation. All other runners continue to show `Downloading {percent}%`.

**`MainButton.tsx`**: Imports `FontAwesomeIcon` + `faSyncAlt`. `getButtonLabel()` has a new branch before the existing `is.installing` check — when `is.installing && gameInfo.runner === 'steam'`, renders spinning `faSyncAlt` icon + "Steam installing" text (no Pause/Cancel). `disabledInstallButtons` gains `(gameInfo.runner === 'steam' && is.installing)` so the button is non-actionable during a Steam install.

**`GameCard/index.tsx`**: Imports `faSyncAlt`. Derives `isSteam = runner === 'steam'`. In `renderIcon()`, adds `isInstalling && isSteam` branch that renders a disabled `<button>` with `faSyncAlt fa-spin` (no onClick, no cancel). Context-menu "cancel installation/update" item's `show` gains `&& !isSteam` guard.

## Deviations from Plan

None — plan executed exactly as written.

TDD flow:
- RED commit `393d745`: stubs (throw) in library.ts + 13 failing tests across library.test.ts and games.test.ts
- GREEN commit `d9f25fe`: full implementation, all 68 tests pass

## Known Stubs

None. All polling functions are fully implemented.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundaries introduced. The ACF polling adds disk reads from an already-trusted source (local Steam steamapps directories). T-03-06 (unbounded polling) is mitigated by the grace window and safety cap.

## Self-Check

### Created files exist
- `.planning/phases/03-game-operations/03-04-SUMMARY.md` (this file) ✓

### Commits exist
- `393d745` (test RED) ✓
- `d9f25fe` (feat GREEN) ✓
- `2f0defa` (feat Task 2) ✓

## Self-Check: PASSED
