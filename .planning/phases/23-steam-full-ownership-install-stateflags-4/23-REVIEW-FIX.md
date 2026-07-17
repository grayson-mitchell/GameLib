---
phase: 23-steam-full-ownership-install-stateflags-4
fixed_at: 2026-07-17T09:44:28Z
review_path: .planning/phases/23-steam-full-ownership-install-stateflags-4/23-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 23: Code Review Fix Report

**Fixed at:** 2026-07-17T09:44:28Z
**Source review:** .planning/phases/23-steam-full-ownership-install-stateflags-4/23-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (CR-01, WR-01, WR-02, WR-03 — Info findings IN-01/IN-02 explicitly out of scope per task)
- Fixed: 4
- Skipped: 0

**IMPORTANT — commits are NOT on the current branch:** All four fix commits
live on a preserved worktree branch `gsd-reviewfix/23-1597`, not on
`fix/steam-list-view-store-label` (the branch checked out in the main repo).
The branch had diverged (2 new docs commits landed on
`fix/steam-list-view-store-label` while this fixer's isolated worktree was
running), so the required `git merge --ff-only` safety check correctly
refused to fast-forward rather than silently rewriting history. Per protocol,
the temp branch was preserved instead of force-merged. **A human/orchestrator
must run one of the following before these fixes take effect:**

```bash
git merge gsd-reviewfix/23-1597       # ordinary merge commit, or
git rebase gsd-reviewfix/23-1597      # if a linear history is preferred
```

then `git branch -D gsd-reviewfix/23-1597` once merged.

## Fixed Issues

### CR-01: Startup-resume path grants StateFlags=4 without ever verifying (or re-applying) file modes

**Files modified:** `src/backend/storeManagers/steam/depot.ts`, `src/backend/storeManagers/steam/library.ts`, `src/backend/storeManagers/steam/__tests__/library.test.ts`
**Commit:** `0be64250` (on `gsd-reviewfix/23-1597`)
**Applied fix:** Extracted the fresh-install path's reconciled-file mode-heal
step into a new exported `healReconciledFileModes(plan, installRoot,
jobFiles)` in `depot.ts`, shared by both `downloadDepotFiles` and
`library.ts`'s `buildResumeFinalizeOpts`. `buildResumeFinalizeOpts` now calls
this function after `reconcilePartialState` and computes `allModesApplied:
allFilesVerified && allModesHealed` instead of the previous
`allModesApplied: allFilesVerified` (which trusted content-only sha1
verification as a proxy for "modes applied" — the exact gap CR-01 flagged).
Any healing failure is threaded into the `failures` array, which
`canWriteFullOwnership` already fails closed on. Went with the review's
option (a) (real re-application, not the minimal always-false option (b)),
matching the fresh-install path's own discipline.
**Tests added:** two new tests in the `startup resume reconciliation (D-04)`
describe block — "resume re-applies file modes via healReconciledFileModes"
(asserts the shared heal function is actually invoked before StateFlags=4 is
earned) and "a mode-healing failure forces the resume to the safe
StateFlags=1026 fallback" (simulates the exact sha1-passed-but-never-chmod'd
crash window CR-01 targets; asserts `1026` is written, never `4`). Both
verified against the real `finalizeToSteam` implementation via
`jest.requireActual`.

### WR-01: Mode-heal loop applies file-mode operations to Directory/Symlink manifest entries without the same guard `downloadSingleFile` uses

**Files modified:** `src/backend/storeManagers/steam/depot.ts`, `src/backend/storeManagers/steam/__tests__/depot.test.ts`
**Commit:** `baf8625f` (on `gsd-reviewfix/23-1597`)
**Applied fix:** The new shared `healReconciledFileModes` (introduced in the
CR-01 commit) bakes in the Directory(64)/Symlink(512) early-return guard from
the start, mirroring `downloadSingleFile`'s own discipline. This commit
refactors `downloadDepotFiles`'s own inline mode-heal loop to call
`healReconciledFileModes` instead of duplicating the (buggy, unguarded) logic
— closing the gap for the fresh-install/live-resume path too, not just the
CR-01 resume path.
**Tests added:** a regression test writing a real pre-existing directory to
disk with `flags: 64 | 8` (Directory | ReadOnly) and asserting the
directory's owner-execute (traversable) bit survives `downloadDepotFiles` —
confirmed this exercises the guarded code path via the existing real-tmpdir
test style.

### WR-02: Symlink target containment check does not normalize backslashes, unlike `resolveContainedPath`

**Files modified:** `src/backend/storeManagers/steam/depot.ts`, `src/backend/storeManagers/steam/__tests__/depot.test.ts`
**Commit:** `bfbc9d6c` (on `gsd-reviewfix/23-1597`)
**Applied fix:** `resolve(dirname(dest), file.linktarget)` → `resolve(dirname(dest), file.linktarget.replace(/\\/g, '/'))`, matching `resolveContainedPath`'s established convention.
**Tests added:** a regression test with a nested symlink (`sub/game.lnkname`,
so `dirname(dest) !== installRoot` and a naive string-prefix check can't
coincidentally catch the case) and a backslash-encoded 2-level-up traversal
target (`..\\..\\evil`). **Verified by manual bisection** (temporarily
reverted the one-line fix, confirmed the test fails with `Expected length: 1,
Received length: 0`; restored the fix, confirmed it passes) — this test is a
true regression guard, not a vacuous assertion.

### WR-03: Startup-resume path never runs `installdir` through the `sanitizeInstalldir` whitelist guard the fresh-install path enforces

**Files modified:** `src/backend/storeManagers/steam/library.ts`, `src/backend/storeManagers/steam/installLocation.ts`, `src/backend/storeManagers/steam/__tests__/library.test.ts`
**Commit:** `544b08cc` (on `gsd-reviewfix/23-1597`)
**Applied fix:** Exported `sanitizeInstalldir` from `installLocation.ts`.
`buildResumeFinalizeOpts` now sanitizes `target.installdir` once at function
entry and uses the sanitized local (`installdir`) everywhere a filesystem
root is built (`buildDepotPlan`'s opts, the `installRoot` `resolve()` call,
and both the success and honest-empty-fallback `FinalizeToSteamOpts` return
shapes) instead of the raw ACF-sourced value.
**Tests added:** a regression test simulating a hostile on-disk ACF
(`installdir: '../evil'`) and asserting `buildDepotPlan` is called with the
sanitized fallback (`app_730`), never the raw hostile value. **Verified by
manual bisection** (temporarily reverted the sanitize call, confirmed the
test fails with the received `installdir: "../evil"`; restored the fix,
confirmed it passes).

## Skipped Issues

None — all four in-scope findings were fixed.

## Verification

- `npx tsc --noEmit` — clean on all touched files (0 errors) across all four commits, checked incrementally after each fix.
- `npx eslint` on all touched files — 0 errors (354 pre-existing warnings, unrelated to these changes — same warning classes/counts present before any edits).
- `pnpm jest src/backend/storeManagers/steam` — **14 test suites, 549/549 tests passed** (includes 5 new regression tests added across the four fixes: 2 for CR-01, 1 for WR-01, 1 for WR-02, 1 for WR-03).
  - A benign post-teardown `TypeError` from a leaked `setInterval` (`pollInstallOnce`) fired asynchronously after Jest's fake timers were torn down in an unrelated test — this did not fail any test and predates this fix session (not caused by any of the four commits above).
- WR-02's and WR-03's new regression tests were additionally verified by manual bisection (temporarily reverting the one-line fix, confirming the test fails, then restoring the fix and confirming it passes) — not just "added and green," but confirmed load-bearing.

## Rollback capability

No findings required rollback — all four fixes applied, verified, and
committed cleanly on the first attempt.

---

_Fixed: 2026-07-17T09:44:28Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
