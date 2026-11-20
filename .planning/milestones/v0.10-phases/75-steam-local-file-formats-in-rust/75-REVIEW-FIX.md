---
phase: 75-steam-local-file-formats-in-rust
fixed_at: 2026-11-14T00:00:00Z
review_path: .planning/phases/75-steam-local-file-formats-in-rust/75-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 75: Code Review Fix Report

**Fixed at:** 2026-11-14
**Source review:** .planning/phases/75-steam-local-file-formats-in-rust/75-REVIEW.md
**Iteration:** 1

**Summary:**

- Findings in scope: 8 (WR-01..WR-08; Info findings out of scope)
- Fixed: 8
- Skipped: 0

Each fix has a regression test that was run against the pre-fix source and failed, then passed after the fix. WR-01, WR-02 and WR-07 change decision logic on failure paths, so they are marked **fixed: requires human verification**. The success path is unchanged in all three.

The fixes were made in place on `main`, as the orchestrator instructed, not in a review-fix worktree. No recovery sentinel was written.

## Fixed Issues

### WR-01: A rejected rustInvoke turns into the permissive answer in state and safety readers

**Status:** fixed: requires human verification
**Files modified:** `src/backend/utils.ts`, `src/backend/storeManagers/steam/library/installedMap.ts`, `src/backend/storeManagers/steam/library/refresh.ts`, `src/backend/storeManagers/steam/library/acfState.ts`, `src/backend/storeManagers/steam/library/uninstallPolling.ts`, `src/backend/storeManagers/steam/library/resume.ts`, `src/backend/storeManagers/steam/library/runningPoll.ts`, `src/backend/storeManagers/steam/macSteamAdoption.ts`, `src/backend/storeManagers/steam/gameLaunch.ts`, `src/backend/storeManagers/steam/gameUninstall.ts`, plus tests (`library.installedMap`, `library.acfState`, `library.refresh`, `library.uninstallPolling`, `library.resume`, `library.runningPoll`, `macSteamAdoption`, `removeCopies`, `games`)
**Commits:** 7c91a5fa7, cf8bb6d43 (the second trims a comment to keep `gameLaunch.ts` within the 1000-line steam ceiling)
**Applied fix:** A transport rejection is now reported as unknown instead of being read as "nothing there":

- **Library list.** `getSteamLibraries(deps, { strict: true })` rethrows a rejected read. The default call is unchanged, so the other ~25 callers and the existing jest mocks of `getSteamLibraries` still work.
- **Install-state maps.** In `installedMap`, `scanRecords` and the library-list read now propagate a rejection. `refreshInstallState` catches it, logs, and skips the reconcile, so it no longer persists `is_installed: false`. `refresh()` already fails the sync when a map builder throws.
- **`readAcfState`.** It returns a new `'unknown'` state. Bottle and bridge roots that cannot be resolved still throw, as before.
  - `pollUninstallOnce` skips the tick when its own read is unknown, so there is no "confirmed absent" and no forced-Windows clear.
  - It also defers completion when a survivor root reads unknown.
  - `removeSteamInstallCopy` and `uninstallBottleGameDirectly` refuse.
  - `rearmPersistedSteamRestartHolds` keeps the persisted hold instead of dropping it.
  - The install poll needed no change: an unknown result is a no-op tick.
- **Running check.** The new `readRunningAppIdOrThrow` feeds `decideSteamNativeDelete`, so its `running-check-failed` refusal now fires on macOS and Linux. The running poll and the other callers keep the never-throw `readRunningAppId`.
- **Mac adoption.** `readAcfSnapshot` marks a rejected Rust read with `rustReadFailed`, and `decidePlayAdoption` returns `'unknown'` for it. Play then launches without quitting Steam and keeps the pending-adoption record. Uninstall delegates to `steam://uninstall` (its existing branch for any non-`'restart'` decision). An ACF that is unreadable or does not parse still gives `stateFlags: null` and reads not-adopted, so DV-75-12 is unchanged.
- **Not changed:** `scanDownloadingAppIds`, which still returns `[]` on rejection. It only seeds resume polling and is not destructive.

### WR-02: The co-install delete guard ignores `ScanResult.skipped`

**Status:** fixed: requires human verification
**Files modified:** `src/backend/storeManagers/steam/library/acfState.ts`, `src/backend/storeManagers/steam/__tests__/library.acfState.test.ts`, `src-tauri/crates/gamelib-steamfiles/tests/fixtures/overrides/library.json`
**Commit:** b0b2dc0f8
**Applied fix:** `findOtherManifestsWithInstalldir` now adds the `'<unknown>'` conflict when the scan skipped anything other than the app's own manifest. That covers an unreadable steamapps dir, a dir over the entry cap, and a sibling manifest that could not be read or parsed. Callers then remove only the manifest and keep the directory. The mocked-fs test "skips a corrupt ACF" now expects `['<unknown>']`.

**Replay override changes:** these are in `overrides/library.json`. `rust-results.json` and `expected.json` did not change.

- `findOtherManifestsWithInstalldir/lib1-self-installdir`: `[]` becomes `['<unknown>']`.
- `findOtherManifestsWithInstalldir/lib1-no-match`: `[]` becomes `['<unknown>']`.
- `findOtherManifestsWithInstalldir/lib1-nonnumeric-shares`: `['abc']` becomes `['<unknown>', 'abc']`.
- `findOtherManifestsWithInstalldir/with-truncated-manifest`: `['abc']` becomes `['<unknown>', 'abc']`.

The fixture `scan/lib1` contains the truncated `appmanifest_30.acf`. The scan reports it in `skipped`, so every guard query over lib1 now reports the unknown conflict. Each override carries a `divergenceNote`.

These four entries are a new behaviour difference in the delete guard. 75-PARITY.md does not record it yet, because the operator-accepted DV list was not edited here. DV-75-02 still holds for reads.

### WR-03: `atomic_write` uses a fixed temp name, so concurrent writers can tear or lose the file

**Status:** fixed
**Files modified:** `src-tauri/crates/gamelib-steamfiles/src/atomic.rs`, `src-tauri/crates/gamelib-steamfiles/src/shortcuts.rs`, `src-tauri/crates/gamelib-steamfiles/tests/shortcuts.rs`, `src-tauri/crates/gamelib-depot/tests/acf.rs`
**Commit:** 8bfaa6391
**Applied fix:**

- **Unique temp file.** Each write opens `<name>.<pid>.<seq>.tmp` in the same directory with `create_new`, and on failure removes only the temp file it created.
- **Shortcuts lock.** `apply_shortcuts` runs its re-read, edit and write under a process-wide mutex per path. The key is the canonicalised parent directory plus the file name, so it is stable whether or not the file exists yet.
- **Changed depot test.** `atomic_write_no_tmp_left` used to expect that a stale `<name>.tmp` would be consumed. It now asserts that a foreign temp file is left untouched.
- **Follow-up.** After a hard crash, a temp file could be left behind under the new unique name. `cancelDelete.ts` still removes only the legacy `<manifest>.tmp` name.

**Tests:**

- `atomic::concurrent_writers_never_tear_or_fail`: 8 threads, 256 KiB each. It failed 3 out of 3 runs before the fix.
- `existing_temp_name_is_never_clobbered`.
- `shortcuts::concurrent_adds_are_all_kept`: 16 threads. It failed 3 out of 3 runs without the lock.

### WR-04: `atomic_write` replaces a symlinked `shortcuts.vdf` or ACF with a regular file and drops the original mode

**Status:** fixed
**Files modified:** `src-tauri/crates/gamelib-steamfiles/src/atomic.rs`, `src-tauri/crates/gamelib-steamfiles/src/shortcuts.rs`
**Commit:** 29949a479
**Applied fix:**

- **Symlinks.** `resolve_final_symlinks` follows a symlink in the final path component, up to 40 hops, including relative and dangling links. The temp file is written next to the real target and renamed over it, so the link survives.
- **File mode.** On Unix, the existing file's permissions are copied to the temp file before the rename.
- **Lock key.** The shortcuts lock now keys on the resolved target, so a link and its target share one lock.

**Tests:** `symlinked_target_is_written_through` and `existing_mode_is_preserved` (0600), both Unix-only.

### WR-05: The `InstalledDepots` manifest-id check was dropped

**Status:** fixed
**Files modified:** `src/backend/storeManagers/steam/acfInstalledDepots.ts`, `src/backend/storeManagers/steam/__tests__/acfInstalledDepots.test.ts`
**Commit:** dd7ee227c
**Applied fix:** `readAcfInstalledDepots` restores the old guard and skips a depot unless both `depotId` and `manifest` pass `ID`. A depot that is skipped takes the full-download path instead of sending `fromManifest: ''`.

### WR-06: Installscript values now decode `\n` and `\t`

**Status:** fixed
**Files modified:** `src-tauri/crates/gamelib-steamfiles/src/kv_text.rs`, `src-tauri/crates/gamelib-steamfiles/src/readers.rs`, `src-tauri/crates/gamelib-steamfiles/tests/readers.rs`
**Commit:** 1cf90847c
**Applied fix:**

- **New decoder.** `RawStr::decoded_quote_backslash_only` decodes only `\\` and `\"`, the same set the old `parseKv1` decoded.
- **Where it applies.** The installscript reader uses it for `child_str` values (process, command, HasRunKey and the others) and for entry names.
- **Unchanged.** `RawStr::decoded` and DV-75-07 (installdir) are unchanged. The existing `installscript_escapes_decoded` test still passes, and the golden results did not change.

### WR-07: Truncated or unreadable manifests now read as "not installed" in every destructive guard

**Status:** fixed: requires human verification
**Files modified:** `src-tauri/crates/gamelib-depot/src/acf.rs`, `src-tauri/crates/gamelib-depot/tests/finalize_op.rs`, `src/backend/storeManagers/steam/library/manifestFlags.ts`, `src/backend/storeManagers/steam/gameInstallDepot.ts`, `src/backend/storeManagers/steam/cancelDelete.ts`, `src/backend/storeManagers/steam/__tests__/cancelDelete.test.ts`, `src/backend/storeManagers/steam/__tests__/library.manifestFlags.test.ts`
**Commit:** 4c0d4c702
**Applied fix:** This covers all three layers of the cancel-delete defence:

1. **Cancel-preserve check.** `read_existing_state_flags` falls back to the pre-Phase-75 line scan, capped at 64 MiB, when the strict parse yields no record for a file that exists. The preserve check therefore still sees `"StateFlags" "4"` in a truncated manifest. This applies to both the depot job finalize and `depot_finalize`.
2. **`installedAtStart`.** It uses the new `readInstalledAtStart`, which returns `true` when the manifest exists but does not parse, or when the read rejects.
3. **`cancelDelete`.** It now refuses with `manifest unparseable` when the manifest exists but does not parse, instead of treating it as residue. The old test "treats an unparseable manifest as residue and deletes" now asserts this refusal.

### WR-08: `run_finalize_op` builds a path from `app_id` before validating it

**Status:** fixed
**Files modified:** `src-tauri/crates/gamelib-depot/src/acf.rs`, `src-tauri/crates/gamelib-depot/src/lib.rs`, `src-tauri/crates/gamelib-depot/tests/finalize_op.rs`
**Commit:** aab06189e
**Applied fix:** The id check is factored into `acf::check_app_id`. `run_finalize_op` calls it before the cancel-preserve read, and `finalize` calls it as before. The error shape is unchanged. The regression test uses `1/../../outside/appmanifest_480` to point at an installed manifest outside steamapps. Before the fix it returned `preserved: true`; now it returns the error.

## Verification

- `cargo test -p gamelib-steamfiles -p gamelib-steamfiles-cli -p gamelib-depot`: all pass, and golden passes without re-recording.
- `cargo clippy -p gamelib-steamfiles -p gamelib-depot --all-targets -- -D warnings`: clean.
- `cargo check --tests --target x86_64-pc-windows-msvc`:
  - `-p gamelib-steamfiles` passes.
  - `-p gamelib-depot` fails on this Mac before any Rust code compiles. The failures are in the C build scripts of `ring`, `lzma-sys` and `zstd-sys`, because there is no MSVC C toolchain or sysroot. That is an environment limit and is not related to these changes.
- `npx tsc --noEmit -p .`: clean.
- `npx jest src/backend/storeManagers/steam src/backend/sidecar`: 7554 passed, 2 failed. The two failures are `shimCoverage` and `shimGenerate`, both known pre-existing.
- `pnpm -s lint:src`: 0 errors and 990 warnings, exit 0.
- `pnpm -s lint:tests`: 0 errors, but it exits 1 because 682 warnings is over the 661 ceiling. Every test file touched here has the same warning count as at `8de4a612c`, so the excess comes from elsewhere.
- `pnpm -s find-deadcode`: no findings beyond `humble/*` and `WebView/storeExitRefresh.ts`.
- `pnpm -s steam-line-ceiling`: exit 0. `gameLaunch.ts` is at 999 lines after cf8bb6d43.
- `pnpm -s backend-di-ceilings`: 20 FAIL lines, within the limit of 20. No new `jest.mock(` calls were added.

---

_Fixed: 2026-11-14_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
