---
phase: 75-steam-local-file-formats-in-rust
reviewed: 2026-11-14T00:00:00Z
depth: standard
files_reviewed: 77
files_reviewed_list:
  - .gitattributes
  - .github/workflows/rust-test.yml
  - meta/bridgeCensus.ts
  - meta/gamelibSteamfilesCli.ts
  - src-tauri/Cargo.toml
  - src-tauri/crates/gamelib-depot/Cargo.toml
  - src-tauri/crates/gamelib-depot/src/acf.rs
  - src-tauri/crates/gamelib-depot/src/lib.rs
  - src-tauri/crates/gamelib-steamfiles-cli/Cargo.toml
  - src-tauri/crates/gamelib-steamfiles-cli/src/main.rs
  - src-tauri/crates/gamelib-steamfiles/Cargo.toml
  - src-tauri/crates/gamelib-steamfiles/src/acf.rs
  - src-tauri/crates/gamelib-steamfiles/src/atomic.rs
  - src-tauri/crates/gamelib-steamfiles/src/discover.rs
  - src-tauri/crates/gamelib-steamfiles/src/kv_bin.rs
  - src-tauri/crates/gamelib-steamfiles/src/kv_text.rs
  - src-tauri/crates/gamelib-steamfiles/src/lib.rs
  - src-tauri/crates/gamelib-steamfiles/src/library.rs
  - src-tauri/crates/gamelib-steamfiles/src/readers.rs
  - src-tauri/crates/gamelib-steamfiles/src/shortcuts.rs
  - src-tauri/src/depot_dispatch.rs
  - src-tauri/src/ipc_contract.rs
  - src-tauri/src/main.rs
  - src-tauri/src/rust_dispatch.rs
  - src-tauri/src/sidecar.rs
  - src-tauri/src/steamfiles_dispatch.rs
  - src/backend/config.ts
  - src/backend/downloadmanager/downloadqueue.ts
  - src/backend/shortcuts/nonesteamgame/nonesteamgame.ts
  - src/backend/sidecar/bootstrap.ts
  - src/backend/sidecar/handlers.ts
  - src/backend/sidecar/installFlowRegistration.ts
  - src/backend/sidecar/shortcutsFlowRegistration.ts
  - src/backend/sidecar/sidecarRpc.ts
  - src/backend/storeManagers/nile/games.ts
  - src/backend/storeManagers/sideload/games.ts
  - src/backend/storeManagers/steam/acfInstalldir.ts
  - src/backend/storeManagers/steam/acfInstalledDepots.ts
  - src/backend/storeManagers/steam/bridge/drm/drmLaunchSetup.ts
  - src/backend/storeManagers/steam/bridge/drm/valveClient.ts
  - src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts
  - src/backend/storeManagers/steam/bridge/sharedRedists.ts
  - src/backend/storeManagers/steam/cancelDelete.ts
  - src/backend/storeManagers/steam/depot/betaBranch.ts
  - src/backend/storeManagers/steam/depot/index.ts
  - src/backend/storeManagers/steam/depot/plan.ts
  - src/backend/storeManagers/steam/depot/sharedRedist.ts
  - src/backend/storeManagers/steam/depotRust/install.ts
  - src/backend/storeManagers/steam/depotRust/rustDepot.ts
  - src/backend/storeManagers/steam/depotRust/updateEstimate.ts
  - src/backend/storeManagers/steam/gameInstallDepot.ts
  - src/backend/storeManagers/steam/gameLaunch.ts
  - src/backend/storeManagers/steam/gameUninstall.ts
  - src/backend/storeManagers/steam/installLocation.ts
  - src/backend/storeManagers/steam/library/acfState.ts
  - src/backend/storeManagers/steam/library/acfUpdateState.ts
  - src/backend/storeManagers/steam/library/index.ts
  - src/backend/storeManagers/steam/library/installedMap.ts
  - src/backend/storeManagers/steam/library/manifestFlags.ts
  - src/backend/storeManagers/steam/library/refresh.ts
  - src/backend/storeManagers/steam/library/resume.ts
  - src/backend/storeManagers/steam/library/resumeBreadcrumbs.ts
  - src/backend/storeManagers/steam/library/runningPoll.ts
  - src/backend/storeManagers/steam/localFiles/rustSteamFiles.ts
  - src/backend/storeManagers/steam/localFiles/steamFilesTypes.ts
  - src/backend/storeManagers/steam/macSteamAdoption.ts
  - src/backend/storeManagers/steam/queueHeadRevalidation.ts
  - src/backend/storeManagers/steam/steamLaunchedDeps.ts
  - src/backend/storeManagers/steam/steamProcesses.ts
  - src/backend/storeManagers/steam/stopSteamLaunchedGame.ts
  - src/backend/storeManagers/steam/updateBridge.ts
  - src/backend/storeManagers/steam/updateDetection.ts
  - src/backend/storeManagers/steam/updateInfo.ts
  - src/backend/utils.ts
  - src/backend/utils/compatibility_layers.ts
  - src/common/types/ipc/rustInvoke.ts
  - src/common/types/sidecarTransport.ts
findings:
  critical: 0
  warning: 8
  info: 7
  total: 15
status: issues_found
---

# Phase 75: Code Review Report

**Reviewed:** 2026-11-14
**Depth:** standard
**Files Reviewed:** 77
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

I reviewed the phase 75 diff (`3e4cfb926..HEAD`) across the new `gamelib-steamfiles` crate and its CLI, the depot crate re-wiring, the shell dispatch, and every TS caller that moved to `invokeSteamFiles`. I did not report the 16 operator-accepted divergences (DV-75-01..16).

**What holds up:**
- **The Rust parsers are total on hostile input.** The text and binary KV parsers enforce size and depth limits, every slice index is bounds-checked, and recursion is capped at depth 64 (8 for the localconfig blob).
- **Panics are contained.** `dispatch` wraps `run_op` in `catch_unwind`.
- **Arguments are validated twice.** The shell's generated Args structs check them, then the crate checks them again with `deny_unknown_fields`.
- **No missed `await`.** Every sync-to-async conversion is awaited or returned. A grep across `src/backend` found no non-awaited calls to the converted readers.
- **The delete guards hold on transport failure.** `cancelDelete` refuses, and `findOtherManifestsWithInstalldir` returns the `<unknown>` sentinel.

**What does not hold up:** the same fail-closed treatment is not applied consistently.
1. Several readers turn a rejected rustInvoke into the *permissive* answer, such as "absent", "nothing installed" or "no game running". Two of them persist that answer: the badge flip in `refreshInstallState`, and the "confirmed absent" tick in `pollUninstallOnce`.
2. The co-install delete guard ignores the scan's `skipped` list.
3. The shared `atomic_write` uses a fixed temp name, so it is not safe when two writers target the same file at once. It also replaces symlinks with regular files.
4. The Rust ACF reader no longer validates `InstalledDepots` manifest ids the way the old TS reader did. One malformed depot entry now fails the whole bridge update.
5. The installscript reader now decodes `\n` and `\t` inside command paths, which the old `parseKv1` deliberately did not do.

None of these is a confirmed data-loss path today, so nothing is classified Critical. The co-install guard (WR-02) and the transport-failure badge flip (WR-01) are the two to fix first.

## Warnings

### WR-01: A rejected rustInvoke turns into the permissive answer in state and safety readers

**Files:**
- `src/backend/storeManagers/steam/library/installedMap.ts:34-46` (`scanRecords` returns `[]`)
- `src/backend/storeManagers/steam/library/acfState.ts:76-84` (`readAcfState` returns `'absent'`)
- `src/backend/utils.ts:611-622` (`getSteamLibraries` returns only `['/usr/share/steam']`)
- `src/backend/storeManagers/steam/library/runningPoll.ts:59-74` (`readRegistryRunningAppId` returns `0`)
- `src/backend/storeManagers/steam/macSteamAdoption.ts:152-155` (snapshot gets `stateFlags: null`, read as "not adopted")

**Issue:** Before phase 75 these reads were in-process filesystem reads. A failure only affected one file at a time, never the whole scan. Now one transport rejection (the 60 s `RUST_INVOKE_TIMEOUT_MS`, the shell restarting, a dispatch-thread hiccup) turns the entire result into the "nothing there" answer. The resulting failures:
- **Persisted badge loss (`refresh.ts:553-557`).** `refreshInstallState` runs on every window focus. With an empty `installedMap`, it sets every installed native title to `is_installed: false, install: {}`. It then *persists* that to `steamLibraryStore` and pushes it to the renderer, so `install_path` and `platform` are lost until the next successful reconcile.
- **False "confirmed absent" (`uninstallPolling.ts:76`).** `pollUninstallOnce` treats `'absent'` as confirmed absence. It flips the badge and clears the forced-Windows verdict (`clearForcedWindowsViaBottle`).
- **Running-check guard bypassed (`nativeDelete.ts:46`).** `decideSteamNativeDelete` has an explicit `running-check-failed → refused` branch. `readRegistryRunningAppId` swallows the rejection and returns `0`, so that branch can never fire on macOS or Linux. Only the separate folder check is left.
- **Unneeded Steam restart.** On Play, a transport failure in `readAcfSnapshot` produces `decidePlayAdoption → 'restart'`, which quits and relaunches the user's Steam.

**Fix:** Let the rejection propagate, or return a distinct "unknown" value. Callers that mutate state should then skip the reconcile instead of acting on an empty map. For example:
```ts
// installedMap.ts
async function scanRecords(deps, dirs): Promise<ScannedAcf[] | null> {
  try { return (await invokeSteamFiles(deps, RUST_STEAMFILES_SCAN_ACFS, { steamappsDirs: dirs })).records }
  catch { return null }                       // unknown, not "nothing installed"
}
// refreshInstallState: if (installedMap === null) { logWarning(...); return }  // skip this reconcile
// readAcfState: catch { throw } or return { state: 'unknown' }; pollUninstallOnce ignores 'unknown'
// readRegistryRunningAppId: rethrow so decideSteamNativeDelete's catch refuses
```

### WR-02: The co-install delete guard ignores `ScanResult.skipped`

**File:** `src/backend/storeManagers/steam/library/acfState.ts:136-162`

**Issue:** `findOtherManifestsWithInstalldir` decides whether `rmSync(installRoot, { recursive: true })` is allowed, both in `removeSteamInstallCopy` and in `cancelDelete` / `uninstallBottleGameDirectly`. It only looks at `scan.records`. `library.rs::scan_acfs` silently moves these cases to `skipped`:
- the steamapps directory itself is unreadable (any `read_dir` error other than NotFound): one `skipped` entry with an empty `fileName`;
- the directory has more than `MAX_DIR_ENTRIES` (20,000) entries (`too-many-entries`), so later manifests are never read;
- a sibling manifest that cannot be read (EACCES, or EBUSY on Windows while Steam has it open) or is larger than 4 MiB.

In each case a co-installed app sharing the installdir is not seen. The guard returns `[]`, and the shared directory is deleted recursively. The transport-failure branch above it already returns `UNKNOWN_CONFLICT`, for exactly this reason (comment T-75-55). The `skipped` branch is the same hazard without the guard. DV-75-02 accepted the *read* semantics for truncated manifests. It does not cover a directory-level scan failure, and none of the divergences address the delete guard's use of those semantics.

**Fix:**
```ts
const dirLevelFailure = scan.skipped.some(
  (s) => s.fileName === '' || s.reason.startsWith('read:') || s.reason === 'too-many-entries'
)
if (dirLevelFailure) return [UNKNOWN_CONFLICT]
// optionally also: any skipped appmanifest_*.acf other than self -> UNKNOWN_CONFLICT
```

### WR-03: `atomic_write` uses a fixed temp name, so concurrent writers can tear or lose the file

**File:** `src-tauri/crates/gamelib-steamfiles/src/atomic.rs:18-27`

**Issue:** The temp path is always `<final>.tmp`, and `File::create` truncates it. `dispatch_rust_channel` runs each rustInvoke on its own spawned thread. So two `steamfiles_shortcuts_apply` calls on the same `shortcuts.vdf` (two "Add to Steam" actions, or two installs finishing with `addSteamShortcuts` on) can overlap like this:
1. A creates the temp file and writes.
2. B truncates the same temp file and starts writing.
3. A renames it. The final file now holds B's partial bytes.
4. B's rename fails with ENOENT. B reports an error, and the user's `shortcuts.vdf` is left torn.

Separately, the read-modify-write in `apply_shortcuts` has no lock, so even without tearing one add is lost. The old TS path ran in the single-threaded sidecar and could not interleave the write itself.

**Fix:** Use a unique temp name per write (for example `<name>.<pid>.<nanos>.tmp`, or `tempfile::NamedTempFile::new_in(parent)` then `persist`). Also serialise `apply_shortcuts` per path with a process-wide `Mutex<HashSet<PathBuf>>` or a lock file, so the re-read and the write happen under one lock.

### WR-04: `atomic_write` replaces a symlinked `shortcuts.vdf` or ACF with a regular file and drops the original mode

**File:** `src-tauri/crates/gamelib-steamfiles/src/atomic.rs:20-26`

**Issue:** `rename(tmp, final_path)` replaces the *link* rather than writing through it. A user whose `userdata/<id>/config/shortcuts.vdf`, or a library ACF, is a symlink (dotfile-managed or synced setups) gets the link silently replaced by a regular file. Their real file stops receiving updates. The removed `writeFileSync` / `steam-shortcut-editor` path wrote through the link. `File::create` also uses `0666 & umask` instead of the existing file's mode.

**Fix:** Resolve the destination first, write the temp file next to the *target*, and copy the existing permissions:
```rust
let final_path = std::fs::canonicalize(final_path).unwrap_or_else(|_| final_path.to_path_buf());
let perms = std::fs::metadata(&final_path).ok().map(|m| m.permissions());
// ... after write: if let Some(p) = perms { f.set_permissions(p)?; }
```

### WR-05: The `InstalledDepots` manifest-id check was dropped; one malformed entry now fails the whole bridge update

**Files:**
- `src/backend/storeManagers/steam/acfInstalledDepots.ts:46-53`
- `src-tauri/crates/gamelib-steamfiles/src/acf.rs:89-106`

**Issue:** The removed `parseAcfInstalledDepots` skipped any depot whose `manifest` was missing or failed `ID.test`. The Rust reader defaults a missing `manifest` to `""` (`unwrap_or_default()`), and the new TS mapping copies `d.manifest` without any check. Here is how that propagates:
1. `updateEstimate.ts:56-58` puts `''` (or the non-numeric value) into `oldGidByDepot`.
2. `jobBuilder.ts:66` sends it as `fromManifest: ''`, which is not `null`.
3. `gamelib-depot::delta::shape_failure` and `manifest.rs:162` reject the whole job with `DeltaUnsupported: fromManifest must be a numeric manifest id`.

Before, that one depot just took the full-download path. `decideRetirement` can also emit a retirement with `gid: ''`.

**Fix:** Restore the guard in the TS mapping (or in `acf.rs::depots`):
```ts
installedDepots: (rec?.installedDepots ?? [])
  .filter((d) => ID.test(d.depotId) && ID.test(d.manifest))
  .map((d) => ({ ... }))
```

### WR-06: Installscript values now decode `\n` and `\t`, which corrupts single-backslash Windows paths

**Files:**
- `src-tauri/crates/gamelib-steamfiles/src/kv_text.rs:38-63` (`RawStr::decoded`)
- `src-tauri/crates/gamelib-steamfiles/src/readers.rs:172-177` (`child_str`)

**Issue:** The replaced `parseKv1` deliberately decoded only `\\` and `\"`. `read_installscript` goes through `RawStr::decoded`, which also turns `\n` into a newline and `\t` into a tab. Valve installscripts often contain unescaped Windows paths, for example `%INSTALLDIR%\_CommonRedist\DotNet\4.8\ndp48-x86-x64-allos-enu.exe` or `...\tools\...`. With this change, `process N`, `command N` and `HasRunKey` come back with an embedded newline or tab. The redist command is then either refused by the metachar or path checks (the redist is silently skipped) or built with the wrong path. The six real files in the parity sweep happened to use `\\`, so the sweep did not exercise this. DV-75-07 covers escape decoding for `installdir` only.

**Fix:** Give the installscript reader its own decode that matches the old behaviour, or make the escape set configurable:
```rust
pub fn decoded_quote_backslash_only(&self) -> String { /* only \\ and \" */ }
// readers.rs child_str: Value::Str(s) => Some(s.decoded_quote_backslash_only())
```

### WR-07: Truncated or unreadable manifests now read as "not installed" in every destructive guard

**Files:**
- `src-tauri/crates/gamelib-depot/src/acf.rs:112-116` (`read_existing_state_flags`)
- `src/backend/storeManagers/steam/cancelDelete.ts:201-204`
- `src/backend/storeManagers/steam/gameInstallDepot.ts:502-509` (`installedAtStart`)

**Issue:** The old depot `read_existing_state_flags` scanned lines, so it still found `"StateFlags" "4"` in a manifest that was truncated after that line. The new one goes through the strict parser and returns `None`. The same "unparseable means not installed" rule now feeds all three layers of the Zomboid data-loss defence:
1. the cancel-preserve check in `run_finalize_op` and in the job finalize;
2. `installedAtStart` (via `readAppManifestFlags`, which returns `null`);
3. `cancelDelete`, which treats `exists && !parsed` as residue.

So a fully installed title whose ACF is truncated or oversized, followed by a cancelled update, gets its ACF rewritten to 1026 and its install directory deleted by cancel-delete. Under the old TS readers this case hung rather than deleting. DV-75-02 accepted strict parsing for *reads*. It does not discuss these delete guards.

**Fix:** On the destructive paths only, treat `exists && !parsed` as "cannot prove not installed": refuse in `cancelDelete`, and set `installedAtStart = true` when `exists && !parsed`. In `read_existing_state_flags`, keep a line-scan fallback for the preserve check when the strict parse fails.

### WR-08: `run_finalize_op` builds a path from `app_id` before validating it

**File:** `src-tauri/crates/gamelib-depot/src/lib.rs:158-164`

**Issue:** On `outcome: "cancelled"`, `read_existing_state_flags(steamapps_dir, &a.app_id)` joins `appmanifest_{app_id}.acf` before `acf::finalize` runs its `is_numeric(app_id)` check. With an `app_id` like `../../x`, it reads (and parses) a file outside `steamapps`. The result can also short-circuit to `{ preserved: true }`, a success-shaped reply for an invalid request. The sidecar is trusted, but every other op in both crates validates ids before any filesystem access.

**Fix:**
```rust
fn run_finalize_op(a: FinalizeOpArgs) -> Value {
    if !acf::is_numeric(&a.app_id) { return json!({ "error": { "kind": "BadArgs", "message": "non-numeric appId" } }); }
    ...
```

## Info

### IN-01: Several readers load the whole file before applying their size limit

**File:** `src-tauri/crates/gamelib-steamfiles/src/readers.rs:189, 259, 321`; `shortcuts.rs:108, 205`; `lib.rs:90`

**Issue:** `read_acf` and `read_library_folders` check `metadata().len()` before reading. `read_installscript`, `running_app_id`, `localconfig_beta_key`, `read_shortcuts`, `apply_shortcuts` and `shortcuts_roundtrip` call `std::fs::read` first and only then apply `max_bytes`. So a huge file is fully allocated first. A FIFO named like the target also blocks the dispatch thread indefinitely, since `read_acf` reports `len()` 0 for a FIFO.

**Fix:** Add a shared `read_capped(path, max)` helper that checks `metadata().is_file()` and the length, then reads through `File::take(max + 1)`.

### IN-02: Shortcut index overflow at `u64::MAX`

**File:** `src-tauri/crates/gamelib-steamfiles/src/shortcuts.rs:251-255`

**Issue:** `m + 1` overflows when an existing key is `18446744073709551615`. In debug builds this panics (caught as `:panic`). In release builds it wraps to `0` and writes a duplicate index key into the user's `shortcuts.vdf`. Keys longer than 20 digits are ignored by `parse::<u64>()`, so collisions are possible there too.

**Fix:** Use `m.checked_add(1)`, and fail with `bad-index` on `None`.

### IN-03: `build_app_manifest_text` interpolates unvalidated fields

**File:** `src-tauri/crates/gamelib-steamfiles/src/acf.rs:236-288`

**Issue:** The builder is now public in a shared crate. `size_on_disk`, `state_flags`, `last_owner` and `bytes` are written into quoted values without escaping or numeric checks (only `appid`, `buildid` and the depot ids are checked). Today's callers pass safe values. A future caller could inject keys into the ACF.

**Fix:** Run `assert_numeric` on those fields, or pass them through `vdf_escape`.

### IN-04: `readAcfSnapshot` reads the file twice

**File:** `src/backend/storeManagers/steam/macSteamAdoption.ts:133-155`

**Issue:** The function reads `content` and `mtimeMs` in TS, then reads `stateFlags` and `buildid` in a separate Rust read of the same path. If Steam rewrites the ACF between the two reads, the snapshot mixes two file versions, and `isSteamAdoptedAcf` compares content from one version with flags from the other.

**Fix:** Take `stat` before and after the Rust read, and retry or mark the snapshot unknown if `mtimeMs` changed.

### IN-05: Steam root discovery yields a relative path when HOME is unset

**File:** `src-tauri/crates/gamelib-steamfiles/src/discover.rs:58`

**Issue:** `probe.home().unwrap_or_default()` gives an empty `PathBuf`, so `GAMELIB_STEAM_ROOT_DEFAULT` becomes `.steam/steam` or `Library/Application Support/Steam`, relative to the sidecar's working directory. The same happens on Windows without `PROGRAMFILES(X86)`, which gives `Steam`.

**Fix:** Return an empty path or a sentinel `source: "none"` when the home directory is missing, and let the TS fallback keep `paths.userHome`.

### IN-06: `invokeSteamFiles` writes a debug log line on every call

**File:** `src/backend/storeManagers/steam/localFiles/rustSteamFiles.ts:19`

**Issue:** The running poll reads `registry.vdf` on every tick, and install and uninstall polls read ACFs on every tick. With debug logging on, each tick adds a `[steamfiles] rust ...` line, which crowds out the logs the operator relies on (the UAT log-rotation loss mentioned in 75-PARITY).

**Fix:** Drop the per-call log, or log only on rejection.

### IN-07: `bridgeCensus.readManifests` docstring says "never throws on bad data"

**File:** `meta/bridgeCensus.ts:1372-1403`

**Issue:** `runSteamfilesCliSync` throws on any non-zero CLI exit. That includes a dispatch error such as an unknown op or bad args, or the CLI binary being rebuilt mid-run. So one bad bottle aborts the whole census instead of being skipped.

**Fix:** Wrap the default `scan` in try/catch and return an empty `records` list on failure. Keep the up-front `assertSteamfilesCliPresent` as the only hard failure.

---

_Reviewed: 2026-11-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
