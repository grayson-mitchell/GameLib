---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
part: C (TS backend)
fixed_at: 2026-11-16T09:47:27Z
review_path: .planning/phases/80-steam-install-uninstall-and-update-polling-state-machines-in/80-REVIEW.md
iteration: 2
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 80: Code Review Fix Report, Part C (TS backend), iteration 2

**Fixed at:** 2026-11-16T09:47:27Z
**Source review:** `.planning/phases/80-steam-install-uninstall-and-update-polling-state-machines-in/80-REVIEW.md` (Part C re-review)
**Iteration:** 2

**Summary:**

- Findings in scope: 2. These are C/WR-01 from the re-review, plus C/EXTRA-01, which the orchestrator added: the TS bottle-uninstall twin of Part A's original WR-01.
- Fixed: 2
- Skipped: 0
- Out of scope: Part C Info items IN-01 to IN-06 (fix scope is critical_warning).

## Fixed Issues

### C/WR-01: The win32 launch watch can send `launching` after `playing`, or after the watch has ended

**Files modified:** `src/backend/storeManagers/steam/steamLaunchWatch.ts`, `src/backend/storeManagers/steam/__tests__/steamLaunchWatch.test.ts`
**Commit:** e0bf2782b
**Status:** fixed: requires human verification (this is a logic and ordering fix)

**Applied fix:**
- Added a `finished` flag. It is set as the first statement of the run's `.finally()`.
- The late `decideLaunching` callback now returns early on `reports || cancelled || doneSent || playingSent || finished`.
- Corrected the comment: it used to claim a finished watch was already covered.

**Regression tests** (both fail on the pre-fix source, with `launching` received):
- `C-WR-01 (80 iter 2) win32: a claim landing after the search sent playing sends no launching`
- `C-WR-01 (80 iter 2) win32: a claim landing after the watch ended without done sends no launching`. This is the no-install-folder path: `released` is `[false]` and no `done` is sent.

### C/EXTRA-01: `uninstallBottleGameDirectly` deleted the first folder of a nested installdir

**Files modified:** `src/backend/storeManagers/steam/gameUninstall.ts`, `src/backend/storeManagers/steam/__tests__/games.test.ts`
**Commit:** 237a1b41d
**Status:** fixed: requires human verification (this is a delete-guard logic fix)

**Applied fix:**
- **`installdirShape(installdir)`** mirrors `installdir_shape` in `gamelib-steampoll/src/acf_copies.rs`. It returns `single`, `nested` or `escaping`.
  - Backslash, `:` and NUL are refused on every OS.
  - An absolute path and an empty installdir are refused.
  - Any `.` or `..` segment is refused. This is slightly stricter than Rust, which drops a non-leading `.`.
  - Empty segments from a repeated or trailing `/` are ignored, as Rust's `Path::components` does.
- **`rawInstalldirFromInstallPath(steamappsDir, installPath)`** recovers the verbatim installdir.
  - `readAcfState` gives TS only Rust's `installPath`. Rust builds that as `Path(steamappsDir).join("common").join(installdir)` with no normalization, and `steamappsDir` is the same `getBottleSteamappsDir` value on both sides.
  - The installdir is therefore the tail after `<steamappsDir>/common/`.
  - Any other prefix gives `undefined`. That covers an absolute installdir, which replaces the whole path.
  - This is needed because `resolve()` hides `.` and `..`.
- **Refusals.** A nested installdir is refused with "not a single folder under common/". Anything else that is not `single` is refused through the existing "unsafe path" branch. So is a validated segment that disagrees with the resolve/relative segment. Each refusal returns `refused: true` before any `rmSync`, so the disk is untouched, the manifest included. This matches the Rust `remove_copy`, where every refusal leaves the disk untouched.
- **Kept as defense in depth:** the existing resolve/relative containment check.
- **Shared-folder conflict check.** This path already delegates it to Rust through `findOtherManifestsWithInstalldir` (`find_other_manifests_with_installdir`). That scan compares case-insensitively on macOS and Windows. Normalizing the other manifests' installdirs to their first folder is Part A's A/WR-01 in `acf_copies.rs`, so this fix did not touch it. A comment at the call site records that.

**Regression tests** (real filesystem, in the SharedDepots describe of `games.test.ts`):
- A nested `Studio/GameB` is refused. A co-installed `Studio/GameA/GameA.exe`, `Studio/GameB` and the manifest all survive, and the conflict scan and `pollUninstallOnce` are never reached.
- Escaping installdirs `Studio/../Hoard`, `./Hoard`, `Studio\GameB` and `C:Hoard` are refused, and nothing is deleted.
- An empty installdir is refused. The old code also refused it.
- Discriminator: `Hoard/` with a trailing separator still deletes only `common/Hoard`.
- Pure tables for `installdirShape` and `rawInstalldirFromInstallPath`.

To run the old code against the new tests, I took the HEAD `gameUninstall.ts` and appended the new helpers so the file still compiled. On that, 5 tests fail: nested, `..`, `.`, backslash and colon. The empty case and the discriminator pass, as expected.

## Verification

- `npx jest` on the four suites that reference the changed modules: 761 passed. The suites are `games.test.ts`, `steamLaunchWatch.test.ts`, `gamesModuleSurface.test.ts` and `pollsRustBranch.uninstallRunning.test.ts`.
- `npx tsc --noEmit`: clean.
- `npx eslint` on the changed sources and the launch-watch test: clean.
- `npx prettier --file-info`: none of the four paths is ignored (parser `typescript`). Scoped `npx prettier --check` over the four paths: clean.
- No new test spawns a child process, so `createFakeHomeProfile()` does not apply.
- Worked on temp branch `gsd-reviewfix/80-C-8081` in `/tmp/sv-80-reviewfix-P2M6Ym`. main had not moved, so `git rebase main` was a no-op, and `main` was fast-forwarded with `--ff-only`.

## Notes

- On Windows, Win32 strips a trailing dot or space, so `Studio.` and `Studio` are one folder. The TS shape check does not fold these. The bottle path is CrossOver on macOS, and the Rust conflict scan owns that normalization (Part A).

---

_Fixed: 2026-11-16T09:47:27Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
