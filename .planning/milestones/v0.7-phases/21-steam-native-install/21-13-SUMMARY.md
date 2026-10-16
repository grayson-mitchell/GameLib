---
phase: 21-steam-native-install
plan: 13
subsystem: infra
tags: [steam, depot, filesystem, symlink, security]

# Dependency graph
requires:
  - phase: 21-steam-native-install (21-04, 21-05, 21-06, 21-11)
    provides: buildDepotPlan/downloadDepotFiles/finalizeToSteam engine and the bottle-native
      install path, all of which share downloadSingleFile's file-writing code
provides:
  - Directory manifest entries (EDepotFileFlag.Directory=64) written as real directories
  - Symlink manifest entries (EDepotFileFlag.Symlink=512) written as real, containment-checked
    symlinks carrying their manifest linktarget
  - WR-02: size>0 manifest files with zero chunks recorded as a failure, never a silent
    empty success
  - WR-03: DownloadManager progress percent clamped at 100
  - Regression test coverage (Directory/Symlink/traversal/zero-chunk/clamp) for the class of
    defect the previously-green suite never exercised
affects: [21-14, phase-21-secure-phase, phase-21-verification-reverify]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Flag-branching before size===0 fast path — Directory/Symlink manifest entries are also
      size 0 with no chunks, so any size-first check would swallow them"
    - "Symlink target containment reuses resolveContainedPath's resolve()+relative() discipline
      (never path.join) against installRoot, matching the link-path's own containment check"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/depot.ts
    - src/backend/storeManagers/steam/__tests__/depot.test.ts

key-decisions:
  - "DIRECTORY_FLAG=64/SYMLINK_FLAG=512 hardcoded as module constants with a comment citing
    steam-user's own EDepotFileFlag.js enum (steam-user does not export this enum from its
    public entrypoint) — confirmed by reading node_modules/steam-user/enums/EDepotFileFlag.js
    directly rather than trusting 21-REVIEW.md's claim"
  - "linktarget captured on DepotPlanFile via the same optional-field cast pattern already
    used for flags in fetchDepotPlanEntry — no new parsing logic, RawManifestFile.linktarget
    widened from content_manifest.proto field 7 (string)"
  - "Symlink branch resolves the target relative to the link's OWN directory
    (resolve(dirname(dest), linktarget)) before containment-checking it against installRoot —
    a manifest linktarget is itself relative to the symlink's location, not the install root"

requirements-completed: [SNI-01, SNI-04, SNI-08]

# Metrics
duration: 20min
completed: 2026-07-16
---

# Phase 21 Plan 13: CR-01 Directory/Symlink Depot-Entry Fix Summary

**Depot manifest Directory (flag 64) and Symlink (flag 512) entries now write real directories/symlinks instead of empty regular files, closing the ENOTDIR/EISDIR-inducing CR-01 blocker shared by native install, finalize/adoption, and macOS bottle install.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-16T01:10:00Z
- **Completed:** 2026-07-16T01:30:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `downloadSingleFile` now branches on `file.flags` for `DIRECTORY_FLAG` (64) and `SYMLINK_FLAG` (512) BEFORE the empty-file fast path — directory entries become real directories (`mkdir(dest, {recursive:true})`); symlink entries become real symlinks whose resolved target is containment-checked against `installRoot` (rejecting an escaping target via `PathTraversalError`), created with the manifest's `linktarget` string as the link text.
- `DepotPlanFile` gained a `linktarget?: string` field, captured in `fetchDepotPlanEntry` from the parsed manifest's `linktarget` (content_manifest.proto field 7), alongside the existing `flags` capture.
- WR-02 closed in the same code path: a `size>0` file with zero chunks now throws a descriptive error (recorded as a per-file failure) instead of silently writing an empty file and reporting success.
- WR-03 closed: `emitProgress`'s percent is now clamped with `Math.min(100, ...)`, matching `library.ts`'s `pollInstallOnce` clamp.
- Six new regression cases added to `depot.test.ts`, exercising exactly the class of defect the prior green suite never touched: Directory-as-real-directory, Directory+child-file ordering (the literal ENOTDIR/EISDIR regression), Symlink-as-real-symlink with correct link text, symlink-traversal-reject, WR-02 zero-chunk failure, and WR-03 percent-clamp.

## Task Commits

1. **Task 1: Branch downloadSingleFile on Directory/Symlink flags; capture linktarget; close WR-02 and WR-03** - `897eb515` (fix)
2. **Task 2: Regression tests for Directory, Symlink, traversal-reject, zero-chunk, and clamp** - `0208f955` (test)

**Plan metadata:** (this commit, docs)

## Files Created/Modified

- `src/backend/storeManagers/steam/depot.ts` - Added `DIRECTORY_FLAG`/`SYMLINK_FLAG` constants, `linktarget` field + capture, flag-branching in `downloadSingleFile`, WR-02 zero-chunk error, WR-03 percent clamp
- `src/backend/storeManagers/steam/__tests__/depot.test.ts` - Added 6 regression cases (Directory, Directory+child ordering, Symlink, symlink-traversal-reject, WR-02 zero-chunk, WR-03 clamp) inside the existing `downloadDepotFiles` describe block, reusing `makePlan` and the real-tmpdir black-box pattern

## Decisions Made

- Flag bit values (64/512) hardcoded with a comment citing `steam-user/enums/EDepotFileFlag.js` as source of truth — confirmed directly against that file's contents during execution (`Directory: 64`, `Symlink: 512`), satisfying the verifier's "confirm the flag bit values" missing item.
- Symlink target resolution uses `resolve(dirname(dest), file.linktarget)` (relative to the link's own directory) then containment-checks the result against `installRoot` via `relative()` — never `path.join`, per the existing `resolveContainedPath` discipline and the project's standing "path.join is not containment" lesson.
- Kept the outer `if (!file.chunks.length || Number(file.size) === 0)` structure intact and nested the WR-02 throw inside it (only fires when size !== 0, i.e. the `!chunks.length` branch of the OR) — preserves the exact task-specified priority order (genuine empty file checked before zero-chunk error) with a minimal diff.

## Deviations from Plan

None - plan executed exactly as written. All five task-1 sub-steps (Directory branch, Symlink branch, empty-file fast path, WR-02 throw, WR-03 clamp) and all six task-2 regression cases were implemented as specified in the plan's `<action>` blocks.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CR-01 is closed at the code level: `depot.ts` now correctly branches on Directory/Symlink flags before any empty-file fast path, for both the native-install and macOS-bottle-install paths (both share `downloadSingleFile`).
- WR-02 and WR-03 are closed in the same code path.
- Full depot suite: 34/34 passing (28 pre-existing + 6 new). Full steam-backend suite: 437/437 passing. `tsc --noEmit` exits 0.
- Remaining scope per 21-VERIFICATION.md: the hardware-only UAT items in `21-UAT.md` (native/bottle `.acf` real-Steam adoption, hard-DRM launch, cancel-recovery, 10GB+ streaming, multi-depot correctness) are unaffected by this plan and remain PENDING — out of scope here per the plan's own success criteria. WR-01 (VDF injection) and WR-04 (weak `sanitizeInstalldir`) remain open, tracked separately (per 21-REVIEW.md, likely 21-14).
- Next: re-run `/gsd-verify-work` or the phase verifier to confirm CR-01's `gaps_found` status is now resolved for SNI-01/04/08 at the code level (hardware UAT still gates the final "Steam adopts the install" empirical claim).

---
*Phase: 21-steam-native-install*
*Completed: 2026-07-16*

## Self-Check: PASSED

- FOUND: `src/backend/storeManagers/steam/depot.ts`
- FOUND: `src/backend/storeManagers/steam/__tests__/depot.test.ts`
- FOUND: `.planning/phases/21-steam-native-install/21-13-SUMMARY.md`
- FOUND commit: `897eb515` (Task 1)
- FOUND commit: `0208f955` (Task 2)
- FOUND commit: `4a1cd81b` (Summary)
