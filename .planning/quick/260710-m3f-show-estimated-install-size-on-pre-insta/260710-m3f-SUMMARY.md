---
phase: quick-260710-m3f
plan: 01
subsystem: ui
tags: [steam, ipc, react, i18n, install-size]

# Dependency graph
requires:
  - phase: 260710-kba
    provides: getFileSize-formatted install_size string convention for Steam
provides:
  - "getSteamInstallSize IPC handler (backend + type + preload invoker)"
  - "Pre-install Steam game page estimated Install Size row"
affects: [game-details-ui, steam-store-manager]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Extract Steam-only conditional UI into its own child component (SteamInstallSize) so React hooks stay unconditional rather than being called after early returns in the parent"

key-files:
  created: []
  modified:
    - src/common/types/ipc.ts
    - src/backend/main.ts
    - src/preload/api/steam.ts
    - src/frontend/screens/Game/GamePage/components/DownloadSizeInfo.tsx
    - public/locales/en/gamepage.json

key-decisions:
  - "Steam pre-install page shows an estimated Install Size row ONLY — no Download Size row (locked design decision from plan)"
  - "getSteamInstallSize IPC handler is a thin pass-through; the appId /^\\d+$/ guard and bounded-regex HTML parsing already inside the estimator (T-06-01/T-06-02) are preserved unchanged"

requirements-completed: [QUICK-260710-m3f]

# Metrics
duration: ~15min
completed: 2026-07-10
---

# Quick Task 260710-m3f: Show Estimated Install Size on Pre-Install Steam Game Page Summary

**Wired the existing backend `getSteamInstallSize` estimator across the IPC boundary and rendered a single estimated "Install Size" row on not-yet-installed Steam game pages, replacing the previous silent `return null`.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2 completed
- **Files modified:** 5

## Accomplishments
- New `getSteamInstallSize` IPC handler (type declaration, backend registration, preload invoker) mirroring the existing Steam handler pattern exactly
- `DownloadSizeInfo.tsx` now renders an estimated Install Size row for not-installed online Steam games (loading label, "Unknown" fallback, "~ {size} (estimate)" success state) instead of returning null
- No Download Size row rendered for Steam, per the locked design decision
- Installed Steam games remain untouched (still handled by `InstalledInfo.tsx`)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add getSteamInstallSize IPC handler (backend + type + preload)** - `35cba277` (feat)
2. **Task 2: Render estimated Install Size row for Steam in DownloadSizeInfo** - `12d0a21a` (feat)

**Plan metadata:** committed separately by the orchestrator

## Files Created/Modified
- `src/common/types/ipc.ts` - Added `getSteamInstallSize: (appId: string) => Promise<string>` to `AsyncIPCFunctions`
- `src/backend/main.ts` - Imported `getSteamInstallSize` from `storeManagers/steam/games`; registered a thin pass-through `addHandler('getSteamInstallSize', ...)`
- `src/preload/api/steam.ts` - Added `export const getSteamInstallSize = makeHandlerInvoker('getSteamInstallSize')`
- `src/frontend/screens/Game/GamePage/components/DownloadSizeInfo.tsx` - Replaced the `runner === 'steam'` early-return with a new `SteamInstallSize` child component (unconditional hooks) that fetches and renders the estimate
- `public/locales/en/gamepage.json` - Added `game.installSizeUnknown` and `game.estimate` i18n keys

## Decisions Made
- Extracted the Steam-only UI into a separate `SteamInstallSize` component so its `useState`/`useEffect` hooks are called unconditionally, rather than adding hooks after `DownloadSizeInfo`'s existing early returns (React Rules of Hooks).
- Kept the IPC handler a pure pass-through of `appId` only (no `gameInfo`) since the frontend only calls it for not-installed games — the installed-game fast path inside `getSteamInstallSize` (which needs `gameInfo`) doesn't apply here, matching the plan's guidance.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. `pnpm codecheck` (tsc --noEmit) reported zero errors. `pnpm lint` showed one pre-existing error in an unrelated test file (`src/frontend/screens/Humble/Keys/Waiting/__tests__/index.test.tsx`, `no-unnecessary-type-assertion`) — out of scope per the plan's scope boundary (untouched by this task). All 812 existing tests pass (40 suites).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Steam pre-install pages now show an estimated Install Size, closing the size-display parity gap with Epic/GOG for the not-installed case. No blockers for future Steam UI work. Manual/runtime UAT (opening an actual not-installed Steam game page) is optional per the plan's verification section but was not performed in this automated pass — no GUI runtime available.

---
*Quick task: 260710-m3f*
*Completed: 2026-07-10*

## Self-Check: PASSED

All modified/created files verified present on disk (src/common/types/ipc.ts,
src/backend/main.ts, src/preload/api/steam.ts,
src/frontend/screens/Game/GamePage/components/DownloadSizeInfo.tsx,
public/locales/en/gamepage.json, this SUMMARY.md). Both task commits (35cba277,
12d0a21a) verified present in git log.
