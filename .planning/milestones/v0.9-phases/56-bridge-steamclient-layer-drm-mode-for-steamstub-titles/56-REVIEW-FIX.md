---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
fixed_at: 2026-10-29T00:00:00Z
review_path: .planning/phases/56-bridge-steamclient-layer-drm-mode-for-steamstub-titles/56-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 56: Code Review Fix Report

**Fixed at:** 2026-10-29
**Source review:** .planning/phases/56-bridge-steamclient-layer-drm-mode-for-steamstub-titles/56-REVIEW.md
**Iteration:** 1

**Summary:**

- Findings in scope: 3 (WR-01, WR-02, WR-03; fix_scope critical_warning, so IN-01..IN-04 are out of scope)
- Fixed: 3. WR-02 was fixed in this run. WR-01 and WR-03 were already fixed by earlier quick tasks; this run checked them against the current code and made no new commit for them.
- Skipped: 0

## Fixed Issues

### WR-01: The post-launch terminal `done` is gated on `drm.progressSent`

**Files modified:** none in this run
**Commit:** `9773a9276` (quick-261029-m68, earlier)
**Applied fix:** Already in place. `src/backend/storeManagers/steam/games.ts` (around line 3949) wraps `launchDrmModeGame` in a `try/finally` that sends `status: 'done'` whenever `launched` is false. That covers both a false return and a throw. It no longer depends on `drm.progressSent`. `games.test.ts` covers four cases: no progress, done after a redist status, a throw that still propagates, and success with no `done`. Full `games.test.ts` passes 484/484.

### WR-02: `child.unref?.()` does not release the event loop

**Files modified:** `src/backend/storeManagers/steam/bridge/drm/boundedListing.ts` (new), `src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts`, `src/backend/storeManagers/steam/bridge/drm/__tests__/boundedListing.test.ts` (new); todo `.planning/todos/pending/2026-10-29-stage-listing-children-unref-does-not-release-event-loop.md` (Resolution section)
**Commit:** `4f41cfab7` (fix), `838e0bffd` (todo resolution)
**Applied fix:** A new helper, `runBoundedListing`, drops execFile's `timeout` option. It bounds the child with its own unref'd SIGKILL timer, which is cleared when the child exits, and unrefs the child plus `stdout`/`stderr`. Both `ps`/`lsof` listing sites in `stageDrmBottle.ts` now use it. The `ps` site still maps an error to `''`, and the lsof/ps site still returns stdout either way. The helper has no GameLib imports, so the test can compile it alone with esbuild and time a plain node child. That child's env comes from `createFakeHomeProfile()`. Measured: the helper on `sleep 2` exits in about 44 ms. A control arm using the old shape (execFile with `timeout` plus `child.unref()`) is held for about 2049 ms, which shows the test can tell the two apart.

### WR-03: CR-01 only half closed for a symlinked `steamapps/common`

**Files modified:** none in this run
**Commit:** `995f3daaa` (quick-261029-m0u, earlier)
**Applied fix:** Already in place, using the library-aware policy. `drmScanExe.ts` realpaths `dirname(exePath)` once to get `ueRootReal`. Both the bootstrap exe and every Shipping candidate must resolve inside it before `detect()` reads them, so the policy is now the same for both exes. `drmExe` is still the lexical `resolve(candidate)`, so `stageDrmBottle`'s driveC check still holds. `drmScanExe.test.ts` covers a symlinked Bottles dir, a symlinked `steamapps/common`, a bootstrap symlinked outside the game folder, and in-folder escapes.

## Merge state (action needed)

The WR-02 commits `4f41cfab7` and `838e0bffd` are on the temp branch `gsd-reviewfix/56-64559`. They are NOT on `main` yet. The cleanup tail's `git merge --ff-only` failed (exit 128) because another session committed 4 commits to `main` during the run, ending at `7c49ad37a`. Following the protocol, the branch was kept for a manual merge. The worktree and the recovery sentinel were removed. The two sides change different files, so `git merge gsd-reviewfix/56-64559` or `git cherry-pick 4f41cfab7 838e0bffd` from `main` should apply cleanly. If you cherry-pick, the todo's Resolution names `4f41cfab7`, so update it to the new hash.

## Verification

- `npx jest src/backend/storeManagers/steam/bridge/drm`: 11 suites passed, 1 skipped; 305 tests passed, 3 skipped (308 total)
- `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts`: 484/484 passed
- `npx jest src/backend/__tests__/fakeHomeIsolation.test.ts`: 7/7 passed
- `pnpm codecheck`: clean
- `npx prettier --check` on the three source and test paths written for WR-02: clean. The todo path is prettier-ignored (`--file-info`), so no formatter check applies to it.
- `pnpm planning-gates`: 12/12 passed

---

_Fixed: 2026-10-29_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
