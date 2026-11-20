---
phase: 82-guardrails-hygiene-and-shared-safety-primitives
reviewed: 2026-11-21T00:00:00Z
depth: standard
files_reviewed: 146
files_reviewed_list:
  - .github/workflows/rust-test.yml
  - meta/__tests__/backendDiCeilings.test.ts
  - meta/__tests__/bridgeCensus.test.ts
  - meta/__tests__/fixtures/callback_registry_harness.c
  - meta/__tests__/genI18nGateScope.test.ts
  - meta/__tests__/hardcodedStringGate.test.ts
  - meta/__tests__/lintScoped.test.ts
  - meta/__tests__/rustTestWorkflow.test.ts
  - meta/__tests__/steamLineCeiling.test.ts
  - meta/backendDiCeilings/storeManagers.steam.json
  - meta/bridgeCensus.ts
  - meta/i18nForkTouchedFiles.json
  - meta/i18nGateScope.json
  - meta/lintScoped.cjs
  - public/locales/en/gamelib.json
  - src-tauri/Cargo.lock
  - src-tauri/Cargo.toml
  - src-tauri/crates/README.md
  - src-tauri/crates/gamelib-depot/tests/fetch.rs
  - src-tauri/crates/gamelib-depot/tests/post.rs
  - src-tauri/crates/gamelib-safety/Cargo.toml
  - src-tauri/crates/gamelib-safety/src/lib.rs
  - src-tauri/crates/gamelib-safety/src/remove.rs
  - src-tauri/crates/gamelib-safety/src/safe_path.rs
  - src-tauri/crates/gamelib-safety/src/tri.rs
  - src-tauri/crates/gamelib-safety/src/wire.rs
  - src-tauri/crates/gamelib-safety/tests/adversarial.rs
  - src-tauri/crates/gamelib-steamcm/src/wrap.rs
  - src-tauri/crates/gamelib-steamfiles/tests/fixtures/expected.json
  - src-tauri/crates/gamelib-steamfiles/tests/fixtures/invocations.json
  - src-tauri/crates/gamelib-steamfiles/tests/fixtures/rust-results.json
  - src-tauri/crates/gamelib-steampoll/tests/adoption.rs
  - src-tauri/crates/gamelib-testutil/Cargo.toml
  - src-tauri/crates/gamelib-testutil/src/lib.rs
  - src-tauri/deny.toml
  - src-tauri/src/ipc_contract.rs
  - src/backend/__tests__/cargoFeatures.test.ts
  - src/backend/__tests__/depotPortComplete.test.ts
  - src/backend/__tests__/diPhaseGates.test.ts
  - src/backend/__tests__/e2eSurfaceGone.test.ts
  - src/backend/__tests__/moduleStateCensus.test.ts
  - src/backend/__tests__/safetyWireParity.test.ts
  - src/backend/__tests__/scannerPortComplete.test.ts
  - src/backend/__tests__/steamAuthSessionPolicy.test.ts
  - src/backend/__tests__/steamCmPortComplete.test.ts
  - src/backend/__tests__/steamFilesPortComplete.test.ts
  - src/backend/__tests__/steamPollsPortComplete.test.ts
  - src/backend/__tests__/storeKinds.test.ts
  - src/backend/__tests__/tauriShellSource.test.ts
  - src/backend/__tests__/utils.test.ts
  - src/backend/anticheat/utils.ts
  - src/backend/downloadmanager/downloadqueue.ts
  - src/backend/online_monitor.ts
  - src/backend/process/README.md
  - src/backend/process/appPaths.ts
  - src/backend/safety/__tests__/knownInstalls.test.ts
  - src/backend/safety/__tests__/nonSteamDeleteGate.test.ts
  - src/backend/safety/__tests__/protectedRoots.test.ts
  - src/backend/safety/__tests__/rustSafety.test.ts
  - src/backend/safety/__tests__/steamDeleteGate.test.ts
  - src/backend/safety/knownInstalls.ts
  - src/backend/safety/protectedRoots.ts
  - src/backend/sidecar/__tests__/appFolderStep.test.ts
  - src/backend/sidecar/__tests__/appShellImportGate.test.ts
  - src/backend/sidecar/__tests__/bootstrapWirings.test.ts
  - src/backend/sidecar/__tests__/electronReachLedger.test.ts
  - src/backend/sidecar/__tests__/externalDynamicImportGate.test.ts
  - src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts
  - src/backend/sidecar/__tests__/gameDetailsImportGate.test.ts
  - src/backend/sidecar/__tests__/ipcDomainCensus.test.ts
  - src/backend/sidecar/__tests__/ipcRegistry.test.ts
  - src/backend/sidecar/__tests__/ipcSchemaCoverage.test.ts
  - src/backend/sidecar/__tests__/ipcSchemas/mainWindowTestStubs.test.ts
  - src/backend/sidecar/__tests__/pathsBootOrder.test.ts
  - src/backend/sidecar/__tests__/phase70PassthroughCensus.test.ts
  - src/backend/sidecar/__tests__/resolveAppPaths.test.ts
  - src/backend/sidecar/__tests__/shellFilesFlows.test.ts
  - src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts
  - src/backend/sidecar/appFolderStep.ts
  - src/backend/sidecar/bootstrap.ts
  - src/backend/sidecar/handlers.ts
  - src/backend/sidecar/ipcRegistry.ts
  - src/backend/sidecar/processGuards.ts
  - src/backend/sidecar/shellFilesFlowRegistration.ts
  - src/backend/storeManagers/gog/__tests__/gogRuntime.test.ts
  - src/backend/storeManagers/gog/__tests__/uninstallSafety.test.ts
  - src/backend/storeManagers/gog/games.ts
  - src/backend/storeManagers/gog/gogRuntime.ts
  - src/backend/storeManagers/gog/library.ts
  - src/backend/storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts
  - src/backend/storeManagers/legendary/__tests__/legendaryRuntime.test.ts
  - src/backend/storeManagers/legendary/legendaryRuntime.ts
  - src/backend/storeManagers/legendary/library.ts
  - src/backend/storeManagers/nile/__tests__/nileRuntime.test.ts
  - src/backend/storeManagers/nile/library.ts
  - src/backend/storeManagers/nile/nileRuntime.ts
  - src/backend/storeManagers/sideload/__tests__/uninstallSafety.test.ts
  - src/backend/storeManagers/sideload/games.ts
  - src/backend/storeManagers/steam/__tests__/bottledSteam.test.ts
  - src/backend/storeManagers/steam/__tests__/bridgeBottleLifecycle.test.ts
  - src/backend/storeManagers/steam/__tests__/bridgeRemovalSafety.test.ts
  - src/backend/storeManagers/steam/__tests__/cancelDelete.test.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/backend/storeManagers/steam/__tests__/pollsRustBranch.acf.test.ts
  - src/backend/storeManagers/steam/__tests__/removeCopies.test.ts
  - src/backend/storeManagers/steam/__tests__/staleQueueHeadCancel.regression.test.ts
  - src/backend/storeManagers/steam/__tests__/steamDirectRemovalSafety.test.ts
  - src/backend/storeManagers/steam/__tests__/steamLaunchRuntime.test.ts
  - src/backend/storeManagers/steam/__tests__/validateNative.test.ts
  - src/backend/storeManagers/steam/__tests__/verifyBridge.test.ts
  - src/backend/storeManagers/steam/bottledSteam.ts
  - src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts
  - src/backend/storeManagers/steam/bridge/shimCoverage.ts
  - src/backend/storeManagers/steam/bridgeBottleLifecycle.ts
  - src/backend/storeManagers/steam/cancelDelete.ts
  - src/backend/storeManagers/steam/depotRust/__tests__/rustVerify.test.ts
  - src/backend/storeManagers/steam/gameInstallBridge.ts
  - src/backend/storeManagers/steam/gameUninstall.ts
  - src/backend/storeManagers/steam/installdirShape.ts
  - src/backend/storeManagers/steam/library/acfState.ts
  - src/backend/storeManagers/steam/removeAllCopies.ts
  - src/backend/storeManagers/steam/steamLaunchRuntime.ts
  - src/backend/storeManagers/steam/validateNative.ts
  - src/backend/storeManagers/steam/verifyBridge.ts
  - src/backend/stores/__tests__/fixtures/registeredStores.json
  - src/backend/testUtils/__tests__/censusFloor.test.ts
  - src/backend/testUtils/__tests__/fakeSafetyRust.test.ts
  - src/backend/testUtils/__tests__/rawRecursiveDeletes.test.ts
  - src/backend/testUtils/censusFloor.ts
  - src/backend/testUtils/fakeSafetyRust.ts
  - src/backend/testUtils/ipcDomainParse.ts
  - src/backend/testUtils/rawRecursiveDeletes.ts
  - src/backend/utils.ts
  - src/backend/utils/__tests__/uninstaller.test.ts
  - src/backend/utils/releases.ts
  - src/backend/utils/uninstaller.ts
  - src/common/types.ts
  - src/common/types/ipc/channelSchemas.ts
  - src/common/types/ipc/index.ts
  - src/common/types/ipc/testStubs.ts
  - src/common/types/safety.ts
  - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
  - src/frontend/components/UI/RemovalRefusedNotice/__tests__/RemovalRefusedNotice.test.tsx
  - src/frontend/components/UI/RemovalRefusedNotice/index.tsx
  - src/frontend/dev/__tests__/noticePreview.test.ts
  - src/frontend/dev/noticePreview.ts
findings:
  critical: 1
  warning: 9
  info: 5
  total: 15
  necessity: 0
status: issues_found
---

# Phase 82: Code Review Report

**Reviewed:** 2026-11-21T00:00:00Z
**Depth:** standard
**Files Reviewed:** 146
**Status:** issues_found

## Summary

Reviewed the committed content of the 146 listed files (the working copy matches HEAD for every
source file read; only `public/locales/en/gamelib.json` differs from HEAD, and its HEAD content
was used). Time went mostly to the 66 production files: the `gamelib-safety` crate (`safe_path.rs`,
`remove.rs`, `wire.rs`, `tri.rs`, `lib.rs`), the TS adapter and its four callers
(`rustSafety.ts`, `knownInstalls.ts`, `protectedRoots.ts`, `uninstaller.ts`, `utils.ts`
`resetHeroic`, GOG/sideload `uninstall`, the Steam uninstall/cancel/bridge-bottle/copy-removal
cluster) and the census/removal-gate test helpers.

The core design holds up. `guardedRemoveTree` is fail-closed: `checkRemoval` and `removeTree`
share one catch, every non-`yes` or malformed reply reads as `unknown`/`failed`, and Rust
`remove_tree` re-runs every check and refuses unless the overall verdict is `yes`. Links are
unlinked, never followed, and the trailing-separator and canonical-parent handling is sound. I did
not find a path where a Rust-guarded delete runs without an overall `yes`.

The defects are in what happens around that core:

- A missing trust-root directory makes the check read `unknown` for a harmless delete. Real GOG
  uninstalls hit this (CR-01), and so does the cancelled-Steam-install cleanup (WR-01).
- A single bad protected-root or known-install path blocks every removal (WR-02).
- The 60 s transport bound is applied to the delete itself (WR-03).
- Several deletes still run outside the Rust delete-time re-check (WR-05, WR-09), and an empty
  `trustRoot` string is silently read as "no trust root" (WR-04).
- The new gate and test infrastructure has blind spots that let it pass vacuously (WR-07, WR-08).

Windows-only branches (`has_reparse_bit`, `remove_link`, junction handling, UNC and
disconnected-drive resolution) have never run locally, and two of the findings sit in them.
Out-of-scope recursive deletes the phase records as accepted (`utils.ts` `removeFolder` and the
legendary/nile CLI uninstalls) were noted but not re-litigated. `deny.toml` ignore reasons for
RUSTSEC-2026-0545 and -0548 could not be verified offline (advisory DB stale); see IN-05.

## Critical Issues

### CR-01: GOG uninstall is refused whenever `gog-support` does not exist

**File:** `src/backend/storeManagers/gog/games.ts:1122-1131` (request),
`src-tauri/crates/gamelib-safety/src/remove.rs:73-75` (cause)
**Issue:** `removalRequest` always sends a `game-support` target with
`trustRoot: gogSupportPath` (`.../heroic_gogdl/gog-support`). `check_trust_root` resolves the trust
root with `dunce::canonicalize(&p).map_err(|_| unknown(CanonicalizeFailed))`, so a trust root
that does not exist reads `unknown`, the overall verdict is `unknown`, and `checkRemoval` blocks
the whole uninstall with the generic "couldn't confirm the install location" toast, before
`unins000.exe` runs. `gog-support` is not created by GameLib. `deriveGogPaths` only joins the
path, and `gog/setup.ts:215` states the support folder "doesn't need to exist". The folder only
appears for games whose manifest has support commands, so a user with only V2 installs, or none
installed yet, cannot uninstall any GOG game. The previous code guarded this with
`existsSync(supportPath)`. The author already knows the shape: `removeAppDataFiles` in
`uninstaller.ts` documents "a canonicalize-failed refusal for a missing trust root" and filters on
`existsSync` to avoid it. `gog/__tests__/uninstallSafety.test.ts:132` always `mkdirSync`s
`supportDir`, and the fake Rust ignores trust roots, so no test covers the absent case.
**Fix:** Fix the cause in the crate so every caller is covered. Resolve the trust root with
`canonical_location` (nearest existing ancestor canonical, tail lexical) instead of a bare
`dunce::canonicalize`:

```rust
let root_loc = canonical_location(&p).map_err(unknown)?; // absent root => lexical tail
let rk = fold_key(&root_loc.path, sensitive_fold);
```

A non-existent trust root then yields `absent`/contained instead of `unknown`, and a target under
it is judged on its canonical ancestor. Add a Rust adversarial row ("trust root absent, target
absent -> Yes/absent") and a GOG test whose `gogSupportPath` does not exist. As a stopgap, send
the support target only when `existsSync(supportPath)`.

## Warnings

### WR-01: Cancelled-install cleanup refuses (and keeps manifest and breadcrumb) when `steamapps/common` is absent

**File:** `src/backend/storeManagers/steam/cancelDelete.ts:182,228-257`
**Issue:** Same root cause as CR-01. The pre-check sends `installRoot` with
`trustRoot: commonRoot` (`<steamapps>/common`). When a cancel lands before the first file of a
fresh library is written, `common` need not exist. The Rust check answers `unknown`
(`canonicalize-failed`), the function pushes a "couldn't clean up the cancelled install" toast
and returns `refused`, and the `appmanifest_<id>.acf` and resume breadcrumb that would have been
cleared are left behind. The cancel cleanup test suite never leaves `common` absent.
**Fix:** The crate fix in CR-01 resolves this. Until then, treat "installRoot absent" as nothing
to ask Rust about: skip the check and go straight to removing the manifests when
`!existsSync(installRoot)`.

### WR-02: One unresolvable protected-root or known-install path blocks every removal

**File:** `src-tauri/crates/gamelib-safety/src/remove.rs:38-48,56,111`;
`src-tauri/crates/gamelib-safety/src/safe_path.rs:128-157`
**Issue:** `check_protected` and `check_known` do `location_keys(raw)?`, and any failure becomes
an `unknown` verdict for the target being removed, regardless of whether that entry is related to
it. Two realistic ways to trip it:

1. **Windows, disconnected drive.** For a path on an unplugged drive (a known install or
   `defaultInstallPath` on `D:\`), `absent_location` walks up to `D:\`, whose
   `symlink_metadata` errors. `cur.file_name()` is `None` for a drive root, so `ok_or(CanonicalizeFailed)?`
   fails. A single installed game on an external drive then makes every uninstall, prefix
   removal, reset and app-data delete answer `unknown`. This branch was never run locally.
2. **Relative setting.** A user-edited `defaultInstallPath` or `sharedWinePrefix` that is not
   absolute (`~/Games`, a relative path) returns `NotAbsolute` and poisons every removal
   permanently.

**Fix:** For caller-supplied reference paths, compare lexically when canonicalisation fails
rather than refusing. A reference you cannot resolve cannot be "inside" the target, so it either
cannot conflict or should be compared by its normalised lexical form. Keep `unknown` only for the
target's own resolution. At minimum, add the unplugged-drive and relative-setting cases to the
adversarial table.

### WR-03: `safety_remove_tree` runs under the 60 s rustInvoke timeout; a long delete reports `failed` while Rust keeps deleting

**File:** `src/backend/sidecar/sidecarRpc.ts:84,131-157,535-543`,
`src/backend/safety/rustSafety.ts:123-141`
**Issue:** `safety_remove_tree` is not in `UNBOUNDED_RUST_CHANNELS`, so the sidecar rejects the
promise after `RUST_INVOKE_TIMEOUT_MS = 60_000`. `removeTree` then returns `outcome: 'failed'`
with `rust-invoke-failed`, but the Rust call is still running `remove_dir_all`. Large installs
(tens of GB, many files, or an HDD) can exceed 60 s. The user sees "Some files may already have
been removed. Try again to finish.", the installed-store entry is kept (GOG/sideload), and a quick
retry can start a second concurrent delete over the same tree.
**Fix:** Add `RUST_SAFETY_REMOVE_TREE` to `UNBOUNDED_RUST_CHANNELS` (it is machine work but its
duration is not bounded by network or UI, the same reasoning as the depot job channels). Keep the
60 s bound on `safety_check_removal`.

### WR-04: An empty `trustRoot` string is read as "no trust root", and game-install/prefix/sideload targets then skip containment

**File:** `src-tauri/crates/gamelib-safety/src/remove.rs:72,86-98`
**Issue:** `t.trust_root.as_deref().filter(|s| !s.is_empty())` maps `Some("")` to `None`. For
`GameInstall`, `Prefix` and `SideloadFolder`, `None` falls into `may_skip` whenever any protected
root is non-empty, so the containment check is silently skipped. Any TS caller that computes a
trust root and ends up with `''` (an unset setting, a failed derivation) loses the positive
containment guarantee instead of getting `unknown`. `app-data` and `game-support` targets are
unaffected because they have no skip arm. The wire doc states trust roots are "only ever a
caller-supplied parameter", which makes an empty one a caller bug the guard should surface.
**Fix:** Distinguish absent from empty:

```rust
match t.trust_root.as_deref() {
    Some("") => Err(unknown(Reason::NoTrustRoot)),
    Some(raw) => { /* existing containment */ }
    None => { /* existing may_skip logic */ }
}
```

### WR-05: Steam copy-removal guard is advisory and fails open to an unguarded delete in the crate

**File:** `src/backend/storeManagers/steam/library/acfState.ts:310-345`
**Issue:** `refuseUnsafeCopy` returns `null`, meaning "proceed", whenever the TS-side `readAcfState`
is not `installed`, has no `installPath`, or `copyInstallRoot` cannot place the root. In each case
`remove_copy` in `gamelib-steampoll` then deletes with its own guards and never consults the
cross-store known-install list. Even on the happy path the check is on a path derived from one
ACF read and `remove_copy` re-reads the ACF and picks its own path, so the Rust verdict and the
Rust delete can disagree if Steam rewrites the manifest between the two calls. This is the one
destructive site where the "overall `yes` before any delete" rule is not enforced by the delete
call itself (recorded as D-21, but the null-return fail-open is not called out).
**Fix:** Treat a non-placeable `installed` copy as `refused` (reason `canonicalize-failed`)
instead of `null`. Longer term, have `remove_copy` take the verdict path through
`gamelib_safety::remove::remove_tree` for the install root, or accept the checked root as an
input and refuse if its own ACF read disagrees.

### WR-06: Sideload "shared folder" heuristic ignores sub-directories entirely

**File:** `src-tauri/crates/gamelib-safety/src/remove.rs:210-242`
**Issue:** `check_sideload` only flags a top-level file with an executable-looking name or exec
bit, or a top-level `*.app` directory. A folder whose top level holds the game's own exe plus
sibling directories (other games, installers' unpacked trees, user documents) passes and is
deleted whole. Example: a portable `D:\Portable\Foo.exe` sitting beside `D:\Portable\Bar\`,
`D:\Portable\Baz\`. `DirEntry::metadata` does not follow links, so a symlink to an executable
named without an extension is also ignored. The doc comment promises "removable only when its
top level holds no executable-looking entry... other than the game's own", which the code
satisfies, but the stated purpose (a `Games` folder holding several things) is not protected:
only known installs registered in GameLib are. Sideload games are by definition not guaranteed
to be registered.
**Fix:** Also count any other top-level directory as shared unless it is empty or the game's own
(`own_entry`), or require `read_dir` to hold only the game's own entry plus files. Add an
adversarial row "sideload folder holding a sibling game directory".

### WR-07: `findRawRecursiveDeletes` has blind spots, so the "no raw recursive delete" gates can pass while one exists

**File:** `src/backend/testUtils/rawRecursiveDeletes.ts:95-96,117-118`
**Issue:** The `CALL` pattern has `(?<![\w$.])`, so only bare calls and the exact qualifiers
`fs|fsp|promises|fsPromises` are seen. I ran it against probes:

- `deps.rm(x,{recursive:true})`: 0 matches.
- `deps.fs.rmSync(x,{recursive:true})`: 0 matches.
- `nfs.rmSync(x,{recursive:true})` for `import * as nfs`: 0 matches.
- `rmSync(x, OPTS)` where `OPTS` carries `recursive`: matched by `CALL` but dropped by the
  `\brecursive\b` filter on the argument text.
- Helpers such as `removeFolder(...)` (itself a raw delete) and `spawn('rm', ['-rf', ...])` are
  not recognised.

The file header lists only "aliased import, `rimraf`, fs-extra" as out of scope, so the gate's
claim is wider than its coverage. `nonSteamDeleteGate.test.ts` and `steamDeleteGate.test.ts`
both rely on it. The `deps.*` forms are exactly what the DI-converted codebase uses (for
example `legacyZoomDataCleanup.ts`).
**Fix:** Drop the `.`-lookbehind for member calls (match `\.rm(Sync)?\(` whatever the receiver)
and treat an `rm*(` call whose argument is a non-literal options value as suspect. Document the
remaining non-goals in the header, and add the probes above as detector tests.

### WR-08: Adversarial lexical rows pass vacuously if a row name drifts

**File:** `src-tauri/crates/gamelib-safety/tests/adversarial.rs:371-403`
**Issue:** `lexical_rows(filter)` selects rows with `r.name.starts_with(f)` and loops over the
result. If a row is renamed, or a filter string mistyped, zero rows match, the loop body never
runs, and the test passes. Four `#[test]`s depend on it
(`dot_segment_rows_are_refused`, `relative_empty_and_nul_rows_are_refused`,
`drive_prefix_row_is_refused`, `unc_string_and_verbatim_rows_are_refused`). This is the same
failure mode D-05 set out to close for the TS gates, and nothing asserts the count of rows
exercised. The link rows also silently skip locally (`link(...)` returns false and `continue`),
which is documented for local runs.
**Fix:** Count rows and assert `ran == filter-matched-expected`, or `assert!(ran > 0)`:

```rust
let rows: Vec<_> = lexical_table(&c).into_iter()
    .filter(|r| filter.iter().any(|f| r.name.starts_with(f))).collect();
assert!(rows.len() >= filter.len(), "filter {filter:?} matched {} rows", rows.len());
```

### WR-09: Deletes that run after the Rust check but outside the Rust delete-time re-check

**File:** `src/backend/storeManagers/steam/cancelDelete.ts:228-272`;
`src/backend/storeManagers/steam/bridgeBottleLifecycle.ts:206-260`
**Issue:** The crate's contract is "the delete call is the safety boundary" (`remove.rs` header,
D-14). Two sites verify with `checkRemoval` and then delete by another mechanism:

1. **`cancelDelete`.** After an `await checkRemoval` it runs Node
   `rmSync(installRoot, { recursive: true, force: true })`. Nothing re-runs the
   protected-root/known-install/trust-root checks at delete time, and the Rust verdict is about
   the canonical location while `rmSync` follows the lexical path (including a symlinked
   `common`). Between the reply and the delete, a game of another store can be registered into
   the folder.
2. **`removePerGameBridgeBottle`.** It runs `cxbottle --bottle <name> --delete --force` (an
   external process that resolves the bottle by name) after the check, with a guarded fallback
   delete only if the directory survives.

Both are recorded as accepted exceptions, but nothing bounds the window or re-asserts the check
for the external delete.
**Fix:** For the cancel path, move the in-flight re-check into the same synchronous section and
re-run `checkRemoval` immediately before `rmSync`, or use `guardedRemoveTree` and keep the
settle-wait before it (the Phase 75 critical section is about not racing a restarting install,
which the existing `isNativeInstallInFlight` re-check after the awaited call already covers). For
the bottle, check again after `cxbottle` returns and before declaring success.

## Info

### IN-01: Windows `is_link_metadata` treats every reparse point as a link

**File:** `src-tauri/crates/gamelib-safety/src/safe_path.rs:66-80`
**Issue:** `has_reparse_bit` is true for any reparse tag (cloud-file placeholders, ProjFS roots,
dedup/WOF), not only symlinks and mount points. A real directory carrying such a tag is reported
`is_link`, skips the content rules in `check_kind`, and is removed with a non-recursive
`remove_dir`, which fails with `delete-failed` if it is non-empty. The failure is safe, but the
user sees a delete failure with no explanation. Rust's `FileType::is_symlink` already covers
symlinks and junctions on current toolchains.
**Fix:** Restrict to `IO_REPARSE_TAG_SYMLINK` and `IO_REPARSE_TAG_MOUNT_POINT` (or rely on
`is_symlink()`), and run `remove_dir_all` for other reparse directories.

### IN-02: `remove-bottle` refusal kind is never emitted

**File:** `src/common/types/removalRefusal.ts:14`,
`src/frontend/components/UI/RemovalRefusedNotice/index.tsx:50-57`
**Issue:** `'remove-bottle'` is in `REMOVAL_REFUSAL_KINDS`, has a title branch and an i18n key,
but no backend site passes it. A refused bottle removal in `gameUninstall.ts` goes through
`refuseWithRemovalNotice` with the default kind `'uninstall'`, so the toast says "Couldn't
uninstall <game>" rather than the bottle-specific title.
**Fix:** Pass `'remove-bottle'` at the `uninstallBridgeGame` refusal, or delete the kind, key and
branch.

### IN-03: Sideload reports a `refused` second-stage guard as `failed`

**File:** `src/backend/storeManagers/sideload/games.ts:214-220`
**Issue:** `guardedRemoveTree` can return `refused` (the verdict changed between the two Rust
calls, nothing deleted). The code maps every non-`removed` outcome to `pushRefusal('failed', ...)`
and `failed: true`, so the toast says "Some files may already have been removed." The comment
justifies this for GOG (where `unins000.exe` has already run), but no external process runs in
the sideload path.
**Fix:** Pass `removed.outcome` through to `pushRefusal` and return `refused: true` when it is
`refused`.

### IN-04: Known-install list ignores entries that are not yet `is_installed`

**File:** `src/backend/safety/knownInstalls.ts:56`
**Issue:** `if (!game.is_installed) continue` drops partial or in-progress installs that already
occupy a folder. A delete of an enclosing folder is not refused for a download another store has
begun there. It also depends on each manager's `getListOfGames()` being populated at call time
(an unloaded library reads as "no other installs", not `null`).
**Fix:** Include entries with an `install_path` that are installing, or document that
in-progress installs are out of D-16, and treat an empty never-loaded library as `unknown`.

### IN-05: CI and supply-chain hygiene in touched files

**File:** `.github/workflows/rust-test.yml:77-80`, `src-tauri/deny.toml:17-18`
**Issue:**
(a) The `cargo-test` job has no `timeout-minutes`. It builds a SEA sidecar, runs a three-OS
matrix and now an extra crate step that creates real links, so a hung test holds a runner for the
platform default of 6 h.
(b) RUSTSEC-2026-0545 and -0548 reuse the zip/updater justification verbatim from -0368/-0369/-0429.
I could not confirm offline that those advisories concern `zip` (advisory DB checkout is stale),
so the ignore may be misattributed.
**Fix:** (a) Add `timeout-minutes: 45` to the job. (b) Confirm each advisory's affected crate
before keeping the shared reason; if different, write the actual reason.

---

_Reviewed: 2026-11-21T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
