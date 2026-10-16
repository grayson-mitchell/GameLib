---
phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy
plan: 11
subsystem: steam-bridge
tags: [shim-placement, byte-identity, fs, node-crypto, gap-closure]

# Dependency graph
requires:
  - phase: 24-05
    provides: placeShimForGame / shimGenerate.ts (existence-guarded shim placement)
provides:
  - Identity-guarded placeShimForGame that overwrites a byte-different steam_api.dll already at shimPath
  - isByteIdentical helper (size then sha256 compare, fs-race-safe) as the new idempotency guard
affects: [24-08 installBridgeGame, 24-12, 24-13, 24-14, secure-phase-24]

# Tech tracking
tech-stack:
  added: []
  patterns: [byte-identity guard replacing existence guard for overwrite-by-design placement]

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/bridge/shimGenerate.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts

key-decisions:
  - "Identity guard (size then sha256) replaces the pure existsSync existence guard; overwrite happens whenever the target is present but not byte-identical to the built shim, after the import-coverage check passes"
  - "shim-not-built (missing built shim source) check moved above the identity check so a missing source is still a clean typed result even when a game dll is already present at shimPath"
  - "isByteIdentical wraps stat/read in try/catch and returns false on any fs error, so a race falls through to the coverage-checked overwrite rather than throwing the placement path"

patterns-established:
  - "Overwrite-by-identity: idempotency for a specific trusted binary is proven by content equality to the trusted source, not by mere presence at the target path"

requirements-completed: [R3, R6]

# Metrics
duration: ~10min
completed: 2026-07-21
---

# Phase 24 Plan 11: Byte-identity shim placement guard Summary

**Replaced `placeShimForGame`'s existence guard with a byte-identity guard (size then sha256) so the bridge shim actually overwrites a game's own depot-shipped `steam_api.dll`, closing D-UAT-24-04 (BLOCKER).**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-07-21T01:03:05Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- `placeShimForGame` now overwrites a byte-different `steam_api.dll` already present at `shimPath` with the built bridge shim, instead of always short-circuiting on `existsSync(shimPath)` (which previously made placement a permanent no-op for every game that ships its own `steam_api.dll` — effectively all of them)
- Added `isByteIdentical(pathA, pathB)`: size compare first, sha256 digest compare only on a size match, wrapped in try/catch so a filesystem race never throws the placement path
- Reordered the placement logic so the `shim-not-built` check (missing trusted source) runs BEFORE the identity check — a missing built shim is still a clean typed result even when a game dll is already sitting at `shimPath`
- Import-coverage rejection and bottle-containment guard are unchanged and still run before any overwrite decision
- Regression coverage: overwrite of a byte-different file, idempotent no-op on a byte-identical file (existing test, now genuinely exercising the identity path since the second call's target is byte-identical to the source), fresh placement with no file present, coverage-rejection leaves a pre-seeded byte-different file unmodified, `shim-not-built` returned even with a game dll already present

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace existence guard with byte-identity guard in placeShimForGame** - `88d20973` (fix)

## Files Created/Modified
- `src/backend/storeManagers/steam/bridge/shimGenerate.ts` - `isByteIdentical` helper added; placement logic reordered (source-missing check before identity check); existence guard replaced with identity guard; docstrings updated to describe overwrite-by-identity semantics and cite D-UAT-24-04
- `src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts` - added overwrite-of-byte-different-file test, coverage-rejection-leaves-file-unmodified test, shim-not-built-with-game-dll-present test

## Decisions Made
- Identity guard uses size-then-hash (not hash-only) as a cheap short-circuit before reading full file contents — matches the plan's specified approach.
- Kept `PlaceShimResult`'s public union and `placeShimForGame`'s signature unchanged (verification requirement) — the 24-08 `installBridgeGame` call site needs no changes.
- Log line at the copy step now distinguishes "overwrote" vs "placed" based on whether a file was already present at `shimPath`, for clearer runtime diagnostics without changing the typed result.

## Deviations from Plan

None - plan executed exactly as written. The plan's `<action>` spec (helper location, guard reordering, log/docstring updates, test additions) was followed verbatim.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The on-disk precondition for Gates 3/4 (R6) is restored: a bridge install will now place the real 805888-byte built shim next to the game exe, overwriting the game's own ~118368-byte copy, rather than leaving the guard permanently short-circuited.
- Downstream gap-closure plans 24-12/24-13/24-14 (install-poll-wrong-manifest, already-installed-launch-noop, sticky-flag cascade) are unaffected by this change's public contract and can proceed independently.
- Live playability re-verification (Gates 2-4) is still deferred to 24-14 per the plan's success criteria — this plan only fixes the shim-placement mechanism, not the full install→shim→launch integration.

## Self-Check: PASSED

- FOUND: src/backend/storeManagers/steam/bridge/shimGenerate.ts
- FOUND: src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
- FOUND commit: 88d20973

---
*Phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy*
*Completed: 2026-07-21*
