---
phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i
plan: 11
subsystem: ui
tags: [react, zustand, i18n, gap-closure, steam, crossover]

# Dependency graph
requires:
  - phase: 17-06
    provides: useSteamBottleSetup zustand store, SteamBottleSetup toast surface, handleSteamBottleSetupRequiredSignal
  - phase: 17-09
    provides: GamePage/GameContext `is` derivation pattern (status→is booleans)
provides:
  - "isSteamBottleSetupActiveFor(state, appName, runner) — exported pure selector, single source of truth for setup-in-progress"
  - "is.settingUpBottle threaded through GameContextType → GamePage/index.tsx → MainButton/GameStatus"
  - "handleInstall guard preventing a no-op window.api.install() re-dispatch while setup is active"
  - "status.settingUpBottle i18n key (en/gamepage.json)"
affects: [17-07 UAT retest, any future plan touching MainButton/GameStatus/GamePage `is` derivation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared pure selector pattern: a zustand store exposes a plain-function selector (isSteamBottleSetupActiveFor) that multiple independent UI surfaces (toast + game page) import and call against the same store snapshot, instead of each surface re-deriving its own boolean from raw store fields."

key-files:
  created: []
  modified:
    - src/frontend/state/SteamBottleSetup.ts
    - src/frontend/types.ts
    - src/frontend/screens/Game/GameContext.tsx
    - src/frontend/screens/Game/GamePage/index.tsx
    - src/frontend/screens/Game/GamePage/components/MainButton.tsx
    - src/frontend/screens/Game/GamePage/components/GameStatus.tsx
    - public/locales/en/gamepage.json
    - src/frontend/state/__tests__/SteamBottleSetup.test.ts

key-decisions:
  - "Reused the existing useSteamBottleSetup store as the single source of truth rather than inventing a parallel state channel — GamePage now reads the same store the toast already reads."
  - "Guard placed in handleInstall (frontend early-return) rather than touching backend isBottleReady()/isBottleEligible() — backend deferral logic is untouched, confirmed via non-regression diff."

patterns-established:
  - "Shared pure selector consumed by two independent UI surfaces (toast store selector) to prevent state-source desync bugs — reusable if a third surface needs to reflect setup-in-progress."

requirements-completed: [MACSTEAM-04, MACSTEAM-02]

# Metrics
duration: ~8min
completed: 2026-07-11
---

# Phase 17 Plan 11: Install Button/Status Desync Fix (GAP 3 gap-closure) Summary

**Game-page Install button and status message now derive `is.settingUpBottle` from the same `useSteamBottleSetup` store the guided-setup toast reads, via one shared exported selector — closing the button/status/toast desync and blocking a no-op re-install click during setup.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-11T01:51:00Z
- **Completed:** 2026-07-11T01:58:09Z
- **Tasks:** 2 completed
- **Files modified:** 8

## Accomplishments
- Traced desync root cause confirmed exactly as documented in the plan: `MainButton`/`GameStatus` read `is` (derived from the DownloadManager `libraryStatus` queue), which the backend's `deferredToSetup` finally-block clears back to `notInstalled`/`done` — while the toast reads a completely separate `useSteamBottleSetup` store that stays open. Fixed by making the game page read the SAME store instead of adding a second channel.
- Exported `isSteamBottleSetupActiveFor(state, appName, runner)` as the single predicate both the toast (`isOpen` directly) and the game page (`is.settingUpBottle`) now agree derives from — locked with 4 new CI unit tests.
- `is.settingUpBottle` threaded end-to-end: store → `GamePage/index.tsx` derivation → `GameContextType`/`GameContext` initial default → `MainButton` (disables Install + spinner label) → `GameStatus` (overrides "This game is not installed").
- `handleInstall` now early-returns when `settingUpBottle` is true, before the Steam install branch, so a click during setup can no longer re-dispatch `window.api.install()` and dead-end into a queued-then-revert flash.
- Backend (`steam/games.ts`), DownloadManager (`downloadmanager/utils.ts`), `hasStatus.ts`, and `InstallGameModal.ts` are confirmed untouched (`git diff --name-only` verified against the plan's non-regression list).

## Task Commits

Each task was committed atomically:

1. **Task 1: Single-source-of-truth selector + is.settingUpBottle plumbing + install-click guard** - `a93ec612` (fix)
2. **Task 2: Button + status message reflect settingUpBottle + i18n + selector test** - `1758871c` (fix)

_No TDD gate applies to this plan (tests were added alongside implementation in Task 2, not as a preceding RED phase)._

## Files Created/Modified
- `src/frontend/state/SteamBottleSetup.ts` - added exported `isSteamBottleSetupActiveFor` pure selector (isOpen && appName match && runner==='steam')
- `src/frontend/types.ts` - added `settingUpBottle: boolean` to `GameContextType.is`
- `src/frontend/screens/Game/GameContext.tsx` - added `settingUpBottle: false` default
- `src/frontend/screens/Game/GamePage/index.tsx` - reads `useSteamBottleSetup()`, derives `settingUpBottle`, adds it to `contextValues.is`, and guards `handleInstall` with an early return
- `src/frontend/screens/Game/GamePage/components/MainButton.tsx` - `is.settingUpBottle` added to `disabledInstallButtons`; `getButtonLabel()` gains a spinner branch ("Setting up Steam…") before the default Install label
- `src/frontend/screens/Game/GamePage/components/GameStatus.tsx` - `getInstallLabel()` returns the setup message immediately before the `status.notinstalled` fallback
- `public/locales/en/gamepage.json` - new `status.settingUpBottle` key ("Setting up Steam…")
- `src/frontend/state/__tests__/SteamBottleSetup.test.ts` - 4 new tests for `isSteamBottleSetupActiveFor` (match / different appName / non-steam runner / closed store)

## Decisions Made
- Reuse the existing `useSteamBottleSetup` store as the single source of truth (no new state channel) — matches the plan's explicit instruction and keeps the toast and game page permanently in sync by construction.
- Placed the install-click guard as a frontend-only early return in `handleInstall`; backend routing (`isBottleEligible`/`isBottleReady`) is left untouched, preserving the T-17-11-GUARD threat disposition (mitigate via non-regression, not by touching backend validation).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None specific to this plan's files. Noted (not fixed, out of scope): a full `npm test` run surfaces a stray post-suite `TypeError` from a leftover `setTimeout` poll in `src/backend/storeManagers/steam/library.ts` (`pollInstallOnce`/`readAcfState`) firing after Jest teardown. All 48 suites / 938 tests still pass — this is a pre-existing async-leak in a file this plan never touches. Logged in `deferred-items.md`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Unblocks the deferred UAT retest of 17-UAT.md test 2 (macOS + CrossOver, human-observable): Install button should read "Setting up Steam…" (disabled) and the status message should mirror it, in sync with the toast, with re-clicking Install producing no queued/revert flash.
- Also unblocks UAT tests 4-7 (login/install/launch/badge), which per the plan could not be observed until setup-in-progress was reflected on the game page.
- No blockers for downstream phases; this was a targeted gap-closure fix scoped entirely to frontend state-sync.

---
*Phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i*
*Completed: 2026-07-11*

## Self-Check: PASSED

All 8 modified/created source files verified present on disk; commits `a93ec612`, `1758871c`, `4afcd426` verified present in `git log --oneline --all`.
