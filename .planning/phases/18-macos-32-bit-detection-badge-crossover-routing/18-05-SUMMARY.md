---
phase: 18-macos-32-bit-detection-badge-crossover-routing
plan: 05
subsystem: steam-library
tags: [electron, ipc, typescript, jest, steam, macos, mach-o]

# Dependency graph
requires:
  - phase: 18-03
    provides: verifyMacArchGroundTruth() — post-install Mach-O ground-truth check persisting mac_arch to steamMetadataStore
  - phase: 18-04
    provides: MacArchBadge component (frontend, renders GameInfo.mac_arch) — deferred UAT because the badge was unreachable
provides:
  - Backend GameInfo.mac_arch propagation from verifyMacArchGroundTruth to the in-memory library Map + frontend IPC push
  - refresh() cachedMeta.mac_arch seed so a cached '32' verdict survives every startup/resync
  - Regression tests locking both propagation paths (library.test.ts, 107/107 passing)
affects: [18-04-uat, macarchbadge, steam-library-refresh]

# Tech tracking
tech-stack:
  added: []
  patterns: [library.set + sendFrontendMessage('pushGameToLibrary', ...) propagation pattern applied to a third call site]

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts

key-decisions:
  - "verifyMacArchGroundTruth only updates+pushes when the appId is already present in the in-memory library Map — never fabricates a GameInfo when absent, since the store write already carries the verdict for the next refresh() rebuild"
  - "refresh() default for mac_arch is 'unknown', never '32' — preserves the false-flag-safe invariant (MAC32-01/T-18-05-02): a missing/blank cache can never be coerced into a 32-bit verdict"

patterns-established:
  - "Any backend mutation of a library GameInfo field that must reach the frontend follows: read library.get(appId) -> merge field -> library.set(appId, updated) -> sendFrontendMessage('pushGameToLibrary', updated), guarded on Map presence"

requirements-completed: [MAC32-04]

# Metrics
duration: ~5min
completed: 2026-07-12
---

# Phase 18 Plan 05: Badge Data-Flow Gap Closure (CR-01) Summary

**Fixed two silent propagation breaks in `library.ts` so a Mach-O-resolved `mac_arch:'32'` verdict now reaches the frontend-visible `GameInfo.mac_arch` MacArchBadge renders from — both live and after a resync — closing the single BLOCKER from 18-VERIFICATION.md.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-07-12T20:38:xx+12:00
- **Completed:** 2026-07-12T20:41:42+12:00
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- `verifyMacArchGroundTruth()` now updates the in-memory `library` Map and pushes the updated `GameInfo` via `sendFrontendMessage('pushGameToLibrary', ...)` immediately after persisting to `steamMetadataStore`, guarded on the appId already being present in the Map
- `refresh()`'s constructed `gameInfo` object literal now seeds `mac_arch: cachedMeta?.mac_arch ?? 'unknown'` alongside the existing `is_mac_native`/`is_linux_native`/`is_delisted`/`steamPlatformsCaptured` cachedMeta cluster, so a cached '32' verdict survives every app restart/resync
- Two regression tests added and passing, locking both propagation paths against silent regression

## Task Commits

Each task was committed atomically:

1. **Task 1: Propagate the Mach-O '32' verdict from verifyMacArchGroundTruth to the library Map + frontend** - `efc83d37` (fix)
2. **Task 2: Seed mac_arch from cachedMeta in refresh() so a cached '32' verdict survives resync** - `f29bd8e2` (fix)
3. **Task 3: Regression test — mac_arch survives refresh() and reaches the pushGameToLibrary payload from verifyMacArchGroundTruth** - `a55bd5a4` (test)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `src/backend/storeManagers/steam/library.ts` - `verifyMacArchGroundTruth` now merges the resolved verdict onto the existing library entry and pushes it to the frontend; `refresh()`'s gameInfo literal seeds `mac_arch` from cachedMeta
- `src/backend/storeManagers/steam/__tests__/library.test.ts` - Two new regression tests: refresh() survival (cached '32' pushed, uncached defaults to 'unknown') and verifyMacArchGroundTruth push (seeds real `library` Map, drives an i386 lipo verdict, asserts both the IPC payload and the Map entry carry `mac_arch:'32'`)

## Decisions Made
- No fabricated `GameInfo` when the appId is absent from the in-memory `library` Map at the point `verifyMacArchGroundTruth` resolves — the `steamMetadataStore` write already carries the verdict forward to the next `refresh()` rebuild, so a missing-from-Map case is a documented no-op (logged at info level), not a push, not a throw
- `refresh()`'s default seed is `'unknown'`, never `'32'`, matching the existing false-flag-safe invariant (MAC32-01) also codified in the plan's threat register (T-18-05-02, disposition `mitigate`)

## Deviations from Plan

None - plan executed exactly as written. Both propagation-break fixes matched the plan's `<action>` blocks precisely (mirroring the existing `library.set` + `sendFrontendMessage('pushGameToLibrary', ...)` pattern used elsewhere in the same file), and the two regression tests follow the plan's specified setup (existing refresh() test scaffolding for (a), the existing i386 lipo mock + real `library` Map import for (b), with `library.delete(APP_ID)` added to the existing `afterEach` for cleanup).

## Issues Encountered

None during implementation. One process-level self-correction: an early `git commit` attempt for Task 1 was run from the main repo checkout (`cd`'d into `/Users/graysonmitchell/Projects/GameLib` instead of the worktree) — a cwd-drift mistake, not a code issue. Caught immediately via the pre-commit cwd assertion (git status showed no changes staged despite the file being edited correctly on disk), corrected by re-running all git operations from the actual worktree root, and the commit landed cleanly on the worktree branch. No code was affected; the file edits were always written to the correct worktree path.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- MAC32-04 unblocked: a game whose `mac_arch` resolves to `'32'` via Mach-O ground truth now renders `MacArchBadge` without an app restart, and the verdict survives a `refresh()` resync
- Both propagation breaks identified in 18-VERIFICATION.md CR-01 are closed and locked by regression tests (107/107 passing in `library.test.ts`)
- No out-of-scope files touched — `git diff --name-only` from the plan's base commit confirms only `library.ts` and `library.test.ts` changed
- The deferred 18-04 visual placement/styling UAT (Task 3) is now re-runnable end-to-end on real macOS + CrossOver hardware

---
*Phase: 18-macos-32-bit-detection-badge-crossover-routing*
*Completed: 2026-07-12*
