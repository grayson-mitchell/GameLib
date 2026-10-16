---
phase: 08-new-steam-surfaces
plan: 05
subsystem: ui
tags: [react, electron, console-mode, steam, overlay, window-blur]

# Dependency graph
requires:
  - phase: 08-new-steam-surfaces
    provides: Console-mode Steam launch overlay (LaunchOverlay) that fires steam://rungameid fire-and-forget
provides:
  - Steam launch overlay dismisses on window blur (game takes foreground) instead of a fixed 1500ms timer
  - 8s max-timeout safety net so the overlay can never hang if blur never fires
  - One-shot dismiss guard preventing double-dismiss when both blur and safety timer fire
affects: [console-mode, steam-launch, uat-gap-closure]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Focus-driven overlay lifecycle: dismiss a fire-and-forget launch overlay on renderer window 'blur' with a bounded setTimeout safety net + one-shot guard"

key-files:
  created: []
  modified:
    - src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx

key-decisions:
  - "Dismiss the Steam overlay on window 'blur' (the Steam client bringing the game to the foreground) rather than a fixed 1500ms timer, which fired ~1.5s before the game visibly loaded on macOS"
  - "8000ms safety-net timeout is the can't-hang ceiling, not the expected dismiss path — chosen clearly longer than a normal handoff so blur remains the primary trigger"
  - "One-shot `dismissed` flag guards against double-dismiss when both blur and the safety timer fire"

patterns-established:
  - "Overlay dismiss trigger: prefer an observable OS/window signal (blur) over a guessed fixed timer, always paired with a bounded safety timeout and one-shot guard"

requirements-completed: [CONSOLE-01]

# Metrics
duration: 5min
completed: 2026-07-03
---

# Phase 8 Plan 05: Console Launch Overlay Dismiss-on-Blur Summary

**Steam Console launch overlay now persists until GameLib loses focus (the game foregrounds) with an 8s safety-net ceiling, replacing the premature fixed 1500ms auto-dismiss.**

## Performance

- **Duration:** ~5 min
- **Completed:** 2026-07-03
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Replaced the Steam branch's `setTimeout(onDismiss, 1500)` with a `window` `'blur'` listener that dismisses when GameLib loses focus to the launched game.
- Added an 8000ms max-timeout safety net so the overlay always dismisses even if `blur` never fires (game fails to launch, atypical window manager).
- Added a one-shot `dismissed` guard so blur + safety timer cannot double-fire `onDismiss`.
- Effect cleanup removes the blur listener and clears the safety timer on unmount (no leak).
- Non-Steam branch, spinner, "Launched in Steam" label, and BackHint gating left unchanged.

## Task Commits

Each task was committed atomically:

1. **Task 1: Dismiss the Steam launch overlay on window blur with a max-timeout safety net** - `7a9992db` (fix)

## Files Created/Modified
- `src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx` - Steam branch of the mount `useEffect` now dismisses on window `'blur'` (primary) with an 8s `setTimeout` safety net (fallback) and a one-shot guard; updated the effect comment to describe the new lifecycle.

## Decisions Made
- Blur is the primary dismiss trigger (matches the moment the game takes the foreground); the 8s timeout is documented in-code as the can't-hang ceiling, not the expected path.
- Kept the 8s safety value clearly longer than a normal handoff so the timer never pre-empts the blur signal in the common case.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- A transient "API Error: 529 Overloaded" interrupted the turn after the task commit but before the SUMMARY was written. The worktree and commit `7a9992db` were intact on resume. Verification was re-run against the correct worktree path (`.claude/worktrees/agent-a9402db080348024f`) after an initial `cd` into the main repo drifted the cwd (#3097); grep assertions and `pnpm codecheck` both pass against the worktree.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- UAT gap D closed. Manual re-UAT (via `/gsd:verify-work`) should confirm on macOS that activating an installed Steam game keeps "Launched in Steam" visible until the game foregrounds, then dismisses — and that the overlay still dismisses at the safety ceiling if focus never changes.
- Remaining active Phase 8 gaps (A, B, C, F) are handled by their own gap-closure plans.

## Self-Check

- FOUND: src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx (blur listener + 8s safety net present; 1500ms timer removed)
- FOUND: commit 7a9992db
- `pnpm codecheck` exits 0

## Self-Check: PASSED

---
*Phase: 08-new-steam-surfaces*
*Completed: 2026-07-03*
