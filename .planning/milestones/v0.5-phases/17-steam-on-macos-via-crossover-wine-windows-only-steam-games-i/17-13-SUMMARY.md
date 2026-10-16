---
phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i
plan: 13
subsystem: ui
tags: [i18n, react, macos, crossover, steam-provisioning, gap-closure]

# Dependency graph
requires:
  - phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i (plan 06)
    provides: SteamBottleSetup.tsx provisioning banner and hangHint recovery copy
provides:
  - "bottle.setup.uncheckRunSteam i18n key instructing users to untick Run Steam on SteamSetup.exe's final screen"
  - "Provisioning banner span rendering the untick-Run-Steam instruction, ordered before the login guidance span"
affects: [17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx
    - public/locales/en/gamepage.json

key-decisions:
  - "Copy/i18n-only fix per gap's locked fix direction — no process-detection or backend changes added"
  - "uncheckRunSteam span placed first among guidance spans (before login) so it's visible while the installer window is still open"

patterns-established: []

requirements-completed: [MACSTEAM-02, MACSTEAM-03]

# Metrics
duration: 8min
completed: 2026-07-11
---

# Phase 17 Plan 13: SteamWebHelper Hang Gap Closure Summary

**Provisioning banner now explicitly instructs users to untick "Run Steam" on SteamSetup.exe's final screen, closing GAP-17-STEAMWEBHELPER-HANG (MACSTEAM-02/03) with a copy/i18n-only change.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-11T02:33:00Z (approx)
- **Completed:** 2026-07-11T02:41:46Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Added `bottle.setup.uncheckRunSteam` i18n key to `public/locales/en/gamepage.json` under the existing `bottle.setup` object
- Rendered the new instruction as the first guidance span in `SteamBottleSetup.tsx`'s non-error provisioning banner branch, ahead of the existing `login` span
- Retained the existing `hangHint` steamwebhelper self-update recovery copy unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Add "untick Run Steam" instruction copy to the provisioning banner + i18n key** - `c41c8441` (fix)

**Plan metadata:** (pending — final metadata commit created by the orchestrator after the wave completes; STATE.md/ROADMAP.md are not touched by this worktree agent per parallel-execution instructions)

## Files Created/Modified
- `public/locales/en/gamepage.json` - added `bottle.setup.uncheckRunSteam` key (untick-Run-Steam instruction copy)
- `src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx` - added a new guidance `<span>` rendering `t('bottle.setup.uncheckRunSteam', ...)`, placed before the existing `login` span; no other spans reordered or removed

## Decisions Made
- Followed the gap's locked fix direction exactly: copy/i18n only, no process-detection or backend changes to auto-uncheck/monitor the installer.
- Placed the new instruction as the FIRST guidance span (before `login`) so users see it while the installer window is still open, maximizing the chance they untick "Run Steam" before clicking Finish.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Verification Results

- `node -e "const j=require('./public/locales/en/gamepage.json'); if(!j.bottle.setup.uncheckRunSteam) process.exit(1)"` — exit 0 (key present, valid JSON)
- `grep -c "uncheckRunSteam" src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx` — 1 (rendered)
- `grep -n "uncheckRunSteam\|bottle.setup.login"` — uncheckRunSteam at line 228, bottle.setup.login at line 234 (correct order: uncheckRunSteam precedes login)
- `grep -c "hangHint" src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx` — 1 (retained)
- `node -e "... j.bottle.setup.hangHint ..."` — exit 0 (retained, valid JSON)
- `git diff --name-only` — only `SteamBottleSetup.tsx` and `public/locales/en/gamepage.json` changed (no backend, no other component)
- `npm run codecheck` (tsc --noEmit) — exit 0, no errors
- HUMAN-OBSERVABLE (macOS + CrossOver, UAT retest): deferred — this plan closes the gap via copy change only; a live retest of the guided provisioning flow (uncheck Run Steam → no steamwebhelper hang) is a manual UAT step per the plan's acceptance criteria and is not automatable in this environment.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The provisioning banner copy fix for GAP-17-STEAMWEBHELPER-HANG is complete and verified via automated checks (i18n key validity, source rendering, span ordering, hangHint retention, tsc). The remaining manual UAT retest (macOS + CrossOver, confirming the actual installer flow avoids the Force-Quit hang when "Run Steam" is unticked per the new instruction) should be scheduled as part of the 17-07 UAT retest cycle referenced in the plan's context.

---
*Phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i*
*Completed: 2026-07-11*
