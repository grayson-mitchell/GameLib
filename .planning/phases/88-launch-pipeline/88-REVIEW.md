---
phase: 88-launch-pipeline
reviewed: 2026-11-25T00:00:00Z
depth: standard
files_reviewed: 96
files_reviewed_list:
  - .github/workflows/rust-test.yml
  - .prettierignore
  - meta/__tests__/rustTestWorkflow.test.ts
  - meta/backendDiCeilings/__tests__.json
  - meta/buildOverlayArchive.ts
  - meta/buildSteamClientLayerArchive.ts
  - src-tauri/Cargo.toml
  - src-tauri/crates/README.md
  - src-tauri/crates/gamelib-engine/src/fetch.rs
  - src-tauri/crates/gamelib-knownfix-cli/Cargo.toml
  - src-tauri/crates/gamelib-knownfix-cli/src/main.rs
  - src-tauri/crates/gamelib-knownfix-cli/tests/cli.rs
  - src-tauri/crates/gamelib-knownfix/Cargo.toml
  - src-tauri/crates/gamelib-knownfix/src/catalogue.rs
  - src-tauri/crates/gamelib-knownfix/src/ctx.rs
  - src-tauri/crates/gamelib-knownfix/src/jsvalue.rs
  - src-tauri/crates/gamelib-knownfix/src/launch.rs
  - src-tauri/crates/gamelib-knownfix/src/lib.rs
  - src-tauri/crates/gamelib-knownfix/src/overlay/archive.rs
  - src-tauri/crates/gamelib-knownfix/src/overlay/env.rs
  - src-tauri/crates/gamelib-knownfix/src/overlay/install.rs
  - src-tauri/crates/gamelib-knownfix/src/overlay/mod.rs
  - src-tauri/crates/gamelib-knownfix/src/reader.rs
  - src-tauri/crates/gamelib-knownfix/src/registry.rs
  - src-tauri/crates/gamelib-knownfix/src/remote.rs
  - src-tauri/crates/gamelib-knownfix/src/report.rs
  - src-tauri/crates/gamelib-knownfix/src/types.rs
  - src-tauri/crates/gamelib-knownfix/tests/bundled_seeds.rs
  - src-tauri/crates/gamelib-knownfix/tests/golden_fetcher.rs
  - src-tauri/crates/gamelib-knownfix/tests/golden_launch_overrides.rs
  - src-tauri/crates/gamelib-knownfix/tests/golden_overlay_archive.rs
  - src-tauri/crates/gamelib-knownfix/tests/golden_overlay_install.rs
  - src-tauri/crates/gamelib-knownfix/tests/golden_reader.rs
  - src-tauri/crates/gamelib-knownfix/tests/golden_registry.rs
  - src-tauri/crates/gamelib-knownfix/tests/golden_report.rs
  - src-tauri/crates/gamelib-launch-cli/Cargo.toml
  - src-tauri/crates/gamelib-launch-cli/src/main.rs
  - src-tauri/crates/gamelib-launch-cli/tests/cli.rs
  - src-tauri/crates/gamelib-launch/Cargo.toml
  - src-tauri/crates/gamelib-launch/src/ctx.rs
  - src-tauri/crates/gamelib-launch/src/lib.rs
  - src-tauri/src/ipc_contract.rs
  - src-tauri/src/knownfix_dispatch.rs
  - src-tauri/src/main.rs
  - src-tauri/src/native_router.rs
  - src-tauri/src/rust_dispatch.rs
  - src-tauri/src/wine_dispatch.rs
  - src/backend/__tests__/cargoFeatures.test.ts
  - src/backend/__tests__/diPhaseGates.test.ts
  - src/backend/__tests__/engineWinePortComplete.test.ts
  - src/backend/__tests__/engineWineShimSchedule.test.ts
  - src/backend/__tests__/knownFixLaunchReply.test.ts
  - src/backend/__tests__/launchPortComplete.test.ts
  - src/backend/__tests__/oracle/oracleCommon.ts
  - src/backend/__tests__/steamBridgeKnownFixes.test.ts
  - src/backend/appRuntime.ts
  - src/backend/downloadmanager/utils.ts
  - src/backend/knownFixLaunchReply.ts
  - src/backend/launcher.ts
  - src/backend/launchrust/__tests__/knownFixTwins.vectors.test.ts
  - src/backend/launchrust/__tests__/knownFixes.shims.test.ts
  - src/backend/launchrust/knownFixTwins.ts
  - src/backend/launchrust/knownFixes.ts
  - src/backend/sidecar/enrichmentFlowRegistration.ts
  - src/backend/sidecar/sidecarRpc.ts
  - src/backend/storeManagers/gog/games.ts
  - src/backend/storeManagers/legendary/games.ts
  - src/backend/storeManagers/nile/games.ts
  - src/backend/storeManagers/steam/bridge/drm/steamclientLayerInstall.ts
  - src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts
  - src/backend/storeManagers/steam/bridgeInstallState.ts
  - src/backend/storeManagers/steam/bridgeKnownFixes.ts
  - src/backend/storeManagers/steam/drmKnownFix.ts
  - src/backend/storeManagers/steam/gameLaunchOverlay.ts
  - src/backend/storeManagers/steam/library/macArch.ts
  - src/backend/storeManagers/steam/macArchKnownFix.ts
  - src/backend/storeManagers/storeManagerCommon/games.ts
  - src/backend/testUtils/engineWineOracle/harness.ts
  - src/backend/testUtils/launchOracle/__tests__/baseEnv.test.ts
  - src/backend/testUtils/launchOracle/__tests__/census.test.ts
  - src/backend/testUtils/launchOracle/baseEnv.ts
  - src/backend/testUtils/launchOracle/census.ts
  - src/backend/testUtils/launchOracle/pairwise.ts
  - src/backend/testUtils/launchOracle/probes.ts
  - src/backend/testUtils/launchOracle/spawnClass.ts
  - src/common/__tests__/knownFixOverlayCatalogue.test.ts
  - src/common/knownFixOverlayCatalogue.json
  - src/common/knownFixOverlayCatalogue.ts
  - src/common/knownFixReport.ts
  - src/common/types.ts
  - src/common/types/ipc/enrichment.ts
  - src/common/types/ipc/ipcSchemaSnapshot.json
  - src/common/types/ipc/native.ts
  - src/common/types/ipc/nativeChannels.json
  - src/common/types/ipc/rustInvoke.ts
  - src/common/types/sidecarTransport.ts
findings:
  critical: 2
  warning: 12
  info: 18
  total: 32
status: issues_found
---

# Phase 88 — Code Review

Split review (three parallel gsd-code-reviewer lanes at standard depth) because the phase scope was 124 non-fixture files / ~109k lines. Finding IDs are numbered straight through lane A, then B, then C (CR-01..02, WR-01..12, IN-01..18). A re-review must continue this numbering (see the round-2 collision note).

Orchestrator verification notes (2026-11-25):
- CR-01 confirmed by reading `jsvalue.rs` `visit_map`: linear duplicate-key scan per key.
- WR-05 is CLI-only: the shell's `relay_url_from` already defaults to the production relay, so the shell's behaviour is unchanged; the CLI default matches it.
- WR-08 confirmed by reading `golden_overlay_archive.rs` `run_step`: the gzip size/sha/base64 come from the golden whenever the replay's sha differs, so gzip output is never independently compared. This contradicts the 88-17 SUMMARY's "Rust still compares the gzip bytes on all three OSes". Tar bytes and headers are compared.
- CR-02 matches the 88-17 executor's own note on `release-tauri.yml`.
- Already recorded and not re-reported: `registry.rs` `shown()` without `redact_urls`, `launch.rs` echoing a rejected exeOverride (88-SECURITY.md observations).

## Lane A — Rust crates (gamelib-knownfix, gamelib-launch, CLIs)

## Phase 88 (lane A): Code Review Report

**Reviewed:** 2026-11-25
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found

### Summary

Lane A covers gamelib-knownfix, gamelib-launch, their two CLIs and the POST / no-redirect change to
`gamelib-engine/src/fetch.rs`. I read every file whole, and compared the ports line by line with the TS
at the diff base (`63c2873bb`): `knownFixes.ts`, `knownFixLaunch.ts`, `knownFixesFetcher.ts`,
`knownFixOverlayArchive.ts`, `knownFixOverlayInstall.ts`, `knownFixOverlays.ts`, `knownFixesRegistry.ts`
and `knownFixReport.ts`.

The security-relevant logic is a faithful port, and I found no behavioural divergence in the checks that
matter:

- **Archive reader:** same check order, same strictness; the cap is enforced with `take(cap + 1)`.
- **Pins:** sha256 and size are checked on the archive and again per extracted file.
- **Path containment:** the reader, the remote destination and the `exeOverride` realpath check all match.
- **Registry validators:** the same character classes, bounds and `/`-leading-name refusal.
- **Report wire body:** the same fields and key order.

Spawn and shutdown convention: nothing in these crates spawns a process itself. The registry run goes
through the wine command core. Every op, the overlay install and the report task hold a `knownfix`
registrant, and the network waits are raced against the shutdown token.

One real problem stands out. The JS-order JSON value type has a quadratic duplicate-key scan, and it is
fed 16 MiB bodies from third-party feeds on an async worker. The rest are robustness, log-hygiene and
consistency issues. The two issues already recorded (registry `shown()` without `redact_urls`, and the
launch.rs `exeOverride` echo) are not repeated.

The Info section holds six lower-severity items. I did not run a necessity assessment, so there is no
`necessity:` key.

### Critical Issues

### CR-01: Quadratic duplicate-key scan in `JsValue::visit_map` lets a downloaded fix file stall the known-fix runtime

**File:** `src-tauri/crates/gamelib-knownfix/src/jsvalue.rs:206-216` (reached from `remote.rs:181`, `reader.rs:160`)
**Issue:** `visit_map` finds a repeated key with `entries.iter_mut().find(|(existing, _)| *existing == key)`
for every key, so parsing an object with n distinct keys costs O(n^2) string compares. The remote layer
is the one the design treats as hostile (T-88-27, "a downloaded file can never carry a tier-2 key").
`fetch_remote_known_fixes` parses a body of up to `MAX_GET_BODY` (16 MiB) from the GameLib feed and, on a
404, from Heroic's third-party feed. `JsValue::parse` runs inline in the async `run` (no
`spawn_blocking`).

- A 16 MiB object of short distinct keys is roughly 1.5M keys, so about 10^12 compares. That is minutes
  to hours, against `JSON.parse`'s linear time in the TS.
- Even a 1 MB file (about 100k keys) is a multi-second stall.
- The crate's own runtime has two worker threads (`lib.rs:386`). One such body parks a worker on
  CPU-bound work; two bodies park both. Every known-fix op then stalls, and the shutdown token cannot be
  observed, so the 5 s exit budget is blown.
- The same code reads local and bundled files synchronously in `reader::read_within`.

I did not measure this. It follows from the loop's shape and the 16 MiB cap.

**Fix:**
```rust
fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<JsValue, A::Error> {
    let mut entries: Vec<(String, JsValue)> = Vec::new();
    let mut index: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    while let Some(key) = map.next_key::<String>()? {
        let value = map.next_value::<JsValue>()?;
        match index.get(&key) {
            Some(&at) => entries[at].1 = value,
            None => {
                index.insert(key.clone(), entries.len());
                entries.push((key, value));
            }
        }
    }
    Ok(JsValue::Object(js_order(entries)))
}
```
`js_order` is already linear plus a sort. Also run the remote body's parse and filter under
`spawn_blocking`, or cap the body for a fix file (a fix file is KBs; 16 MiB is the seam's cap, not a
sensible one here).

### Warnings

### WR-01: Reader warnings echo raw file values and key names, with no URL redaction and no length bound on key names

**File:** `src-tauri/crates/gamelib-knownfix/src/reader.rs:65-71, 249-256, 259-273, 344-355`
**Issue:** This is the same class as the recorded `registry.rs shown()` item, at a different and more
exposed site. `echo(value)` prints the ignored value of `macArch`, `drm`, `steamGameOverlay`,
`launchArgs` and `exeOverride`, cut to 200 chars, into the log with no `redact_urls`. This runs against
the remote layer's downloaded bytes on every read, so a URL placed in a rejected value reaches
`gamelib.log` (prohibition 1). Separately, the "is not a tier-1 key" and "is a tier-2 key" lines
interpolate `'{key}'` uncut. A downloaded or hand-placed file with a very long key name writes a line of
that length; the 200-char bound exists only for values. `env.rs` already has `redact_urls`; `reader.rs`
does not use it.
**Fix:** Move `redact_urls` to a shared module and wrap `echo()` with it. Cut key names through the same
bound as `echo`:
```rust
format!("... {reason}, ignoring {}.", redact_urls(&echo(value)))
// and for key names
let key_shown = redact_urls(&slice_units(key));
```

### WR-02: The feed URL embeds `app_name` unencoded, and `contained_dest` does not refuse URL metacharacters

**File:** `src-tauri/crates/gamelib-knownfix/src/remote.rs:47-59, 161, 174`
**Issue:** `contained_dest` only guards the on-disk destination (one plain entry, no leading `..`). The
request URL is built as `format!("{base}/{store}/{file}")` with `file = "{app_name}-{store}.json"`
untouched. An `app_name` holding `?`, `#`, `%2e%2e%2f`, whitespace or control characters passes the
filesystem check but re-targets the request to a different path or query on `raw.githubusercontent.com`.
The body is then filtered and written under a name that does not correspond to it. The TS built the URL
the same way, so this is an inherited gap, not a regression. The port is the natural place to close it,
and `appName` is documented as a free renderer string.
**Fix:** Refuse any app name outside a conservative set before building the URL:
```rust
if !app_name.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-')) {
    ctx.log_warn("Refusing known-fixes fetch for an unsafe app name");
    return Ok(());
}
```
Or percent-encode the file segment. Add a test with `a?b`, `a#b` and `..%2fx`.

### WR-03: Three ops take an unbounded `appName` and `installPath`; the other five bound them

**File:** `src-tauri/crates/gamelib-knownfix/src/lib.rs:74-100, 315-330`
**Issue:** `knownfix_apply_profile_registry`, `knownfix_apply_registry`, `knownfix_profile_overlay_env`,
`knownfix_resolve_overlay_env`, `knownfix_fetch_remote` and `knownfix_report_detected` bound their names
to 1..=256 UTF-16 units. `knownfix_read`, `knownfix_status` (via `decode_app_runner`) and
`knownfix_launch_overrides` do not. An empty or multi-megabyte `appName` goes straight into path building
and into the "Known fixes lookup for '{app_name}' ..." and `label` log lines. `installPath` in
`LaunchOverridesArgs` is unbounded too, and is joined and canonicalised. All three ops are reachable from
the renderer. The inconsistency is the finding: whoever added the bound to five ops clearly meant it for
all of them.
**Fix:** Apply `bounded_name` in `decode_app_runner`, and in the launch-overrides arm to `app_name`
(and a similar bound on `install_path`):
```rust
if !bounded_name(app_name) { return Err(format!("{op}:bad-args")); }
```

### WR-04: Both CLIs panic on non-UTF-8 arguments, and `gamelib-knownfix-cli` panics on a non-UTF-8 environment variable

**File:** `src-tauri/crates/gamelib-knownfix-cli/src/main.rs:109, 121`; `src-tauri/crates/gamelib-launch-cli/src/main.rs:109`
**Issue:** `std::env::vars()` panics if any variable name or value is not valid Unicode, and
`std::env::args()` panics on a non-Unicode argument. On Linux, and Windows with lone surrogates, a
perfectly normal environment can hold such a variable. The CLI snapshots the whole environment for the
wine command core, so an unrelated variable aborts every registry op with a panic and no diagnostic. The
rest of the crate carefully turns panics into `<op>:panic`, but these happen before dispatch.
**Fix:**
```rust
EnvSnapshot::from_pairs(std::env::vars_os().map(|(k, v)| {
    (k.to_string_lossy().into_owned(), v.to_string_lossy().into_owned())
}))
let argv: Vec<String> = std::env::args_os().skip(1).map(|a| a.to_string_lossy().into_owned()).collect();
```

### WR-05: The headless CLIs default to the production relay, so `knownfix_report_detected` with `enabled: true` posts for real

**File:** `src-tauri/crates/gamelib-knownfix-cli/src/main.rs:86`, `src-tauri/crates/gamelib-launch-cli/src/main.rs:80`, `src-tauri/crates/gamelib-knownfix/src/report.rs:194-200`
**Issue:** `--relay-url` defaults to `""`, and `report::relay_url` turns an empty string into
`DEFAULT_RELAY_URL`, the deployed relay. The CLI's stated contract is "it never reads the real profile"
and everything is rooted in a fake `--user-data`, but on a Mac an operator running
`op knownfix_report_detected '[{...,"enabled":true}]'` without `--relay-url` sends a report to the
production relay. The `shareDetectedFixes` opt-in gate is an argument here, so the CLI passes it by
construction. The report is only the seven-field body, but a headless parity run should not be able to
reach the live relay by omission.
**Fix:** In both CLIs default the relay to a value that fails closed, for example
`opt_flag(rest, "--relay-url").unwrap_or(gamelib_knownfix::report::RELAY_URL_PENDING_SENTINEL)`
(`report.rs` answers `no-relay` for it), and document `--relay-url` as required to post.

### Info

### IN-01: `target_already_there` mixes raw errno values from different OS namespaces

**File:** `src-tauri/crates/gamelib-knownfix/src/overlay/install.rs:289-292`
**Issue:** `Some(17 | 39 | 66 | 145 | 183)` lists Linux (17, 39), macOS (66) and Windows (145, 183) codes in
one list. On Windows 17, 39 and 66 mean unrelated errors (not-same-device, handle-disk-full,
bad-net-resource); on Linux 66 is ENOTUNIQ. It is safe today only because the caller also requires
`verify_installed_overlay(target).is_ok()`, so a misread error can at worst be swallowed when the target
already verifies. The list reads as a correctness claim it does not make.
**Fix:** Gate each code on its OS with `cfg!`, or rely on `ErrorKind::AlreadyExists` plus
`ErrorKind::DirectoryNotEmpty` when the MSRV (1.77.2) allows it (the latter is 1.83). Add a comment that
the verify is the real guard.

### IN-02: `guarded`, `CatchUnwind`, `runtime` and `dispatch_sync` are copy-pasted across crates

**File:** `src-tauri/crates/gamelib-knownfix/src/lib.rs:342-406`, `src-tauri/crates/gamelib-launch/src/lib.rs:45-109`
**Issue:** The two crates, and `gamelib-wine` per their own comments, carry the same hand-written
catch-unwind future, op wrapper and runtime builder. Only the registrant name and thread name differ.
Fixes to one (for example making `register` observe an already-begun shutdown) will not reach the others.
**Fix:** Move the generic wrapper and `dispatch_sync` into `gamelib-core` (or the engine crate), taking
the registrant and thread names as parameters.

### IN-03: Unused dependencies and feature flags in the new manifests

**File:** `src-tauri/crates/gamelib-knownfix/Cargo.toml:16-34`, `src-tauri/crates/gamelib-launch/Cargo.toml:11-25`
**Issue:** `gamelib-knownfix` declares `gamelib-proc` and nothing in `src/` uses it, so the comment
"Every child process goes through `gamelib-proc`" is not backed by the dependency. `gamelib-core` is a
normal dependency but used only under `#[cfg(test)]`. The `process` and `io-util` tokio features are
unused. `gamelib-launch` declares `gamelib-wine`, `gamelib-core` and `serde` (derive) and uses none of
them in `src/`, plus tokio's `process`, `fs`, `io-util` and `macros`. The launch crate is a skeleton, so
some of this is forward declaration, but unused `gamelib-proc` gives a false assurance for the spawn
convention.
**Fix:** Drop the unused entries until a plan needs them, move `gamelib-core` to `[dev-dependencies]` in
`gamelib-knownfix`, and keep the spawn rule documented rather than implied by a dependency.

### IN-04: Cancelling the install that is initialising a cell removes the cell while a joiner is still using it

**File:** `src-tauri/crates/gamelib-knownfix/src/ctx.rs:98-112`, `src-tauri/crates/gamelib-knownfix/src/overlay/install.rs:481-493, 510-521`
**Issue:** `Forget::drop` removes the table entry whenever the cell it holds is the current one. If caller
A is initialising and caller B has joined, A being dropped (the op future cancelled, or a shutdown race)
removes the entry while B takes over the `get_or_init`. A later caller C then gets a fresh cell and runs a
second concurrent download and staging of the same overlay. The partial directories are distinct and the
rename race is handled by `AlreadyThere`, so this is bounded. It still breaks the "one download per
overlay" claim in the doc comment.
**Fix:** Remove the entry only when the cell has been initialised (`cell.initialized()`), or only on the
path where this caller ran the initialiser.

### IN-05: A corrupt compiled-in catalogue is reported as "unknown overlay id"

**File:** `src-tauri/crates/gamelib-knownfix/src/catalogue.rs:84-86`, `src-tauri/crates/gamelib-knownfix/src/overlay/env.rs:178-185`
**Issue:** `lookup` does `catalogue().ok()?`, discarding the `overlay-catalogue:corrupt-table` error. A
catalogue that fails to parse (a field added to the shared JSON, with `deny_unknown_fields` on the Rust
side) makes every overlay entry warn "overlay entry rejected (unknown overlay id)", which sends a
maintainer looking at the profile, not the catalogue. The comment on `catalogue()` promises that "A parse
failure is an error, never an empty catalogue", and `lookup` keeps the error from reaching the log.
**Fix:** Have `validate_overlay_entries` call `catalogue()` once and warn with the fixed
`overlay-catalogue:corrupt-table` word when it is `Err`, before the per-entry loop.

### IN-06: The remote cache's temp file name is per process, so two concurrent fetches of one app collide

**File:** `src-tauri/crates/gamelib-knownfix/src/remote.rs:199-206`
**Issue:** `tmp = <file>.tmp-<pid>` is the TS's name. Two `fetch_remote_known_fixes` calls for the same
app in one process (a re-install, or an install racing an update) write the same temp file. One renames it
into place while the other is still writing, and the second `rename` then fails with `NotFound` and logs
"Known fixes fetch failed". The cache file can also be read half-written by the launch reader in that
window.
**Fix:** Add a per-call suffix, such as the nanosecond clock reading or a counter, to the temp name. The
rollback concern (87 D-07) is about the destination file's content, not the temp name.

---

_Reviewed: 2026-11-25_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

## Lane B — Tauri shell dispatch, TS shims and call sites

## Phase 88 (lane B): Code Review Report

**Reviewed:** 2026-11-25
**Depth:** standard
**Files Reviewed:** 41 (new files whole; pre-existing files by their `63c2873bb..HEAD` known-fix and launch hunks)
**Status:** issues_found

### Summary

Lane B covers the Rust shell arms, the TypeScript shims and twins, the settle helpers and the launch call sites.

The settle helpers hold up. Every call site that awaits a known-fix Rust call goes through a `settle*` function, and each one catches rejections, so a rejected or timed-out call logs a warning and the launch goes on with defaults. `downloadFixesFor` and the three `reportDetectedFix` call sites use `.catch`. The bounded channels reject after 60 s. The shell decodes arguments before it looks at the context, with fixed literals that never echo input. Only the overlay-base env keys cross the boundary, not the whole process env. I found no empty-reply or shape-narrowing hole in `narrow`, `settleKnownFixOverlayEnv` or the `exeOverride` handling.

Three problems stand out:

- **CR-02:** a checkout failure on the Windows release leg, caused by the long golden-fixture paths.
- **WR-06:** one malformed tier-1 env value now silently drops all tier-2 overlay env for the launch. The old TS did not do this.
- **WR-07:** the two unbounded channels have no sidecar-side backstop.

### Critical Issues

### CR-02: Windows release build checks out a tree with paths over 260 characters and does not enable `core.longpaths`

**File:** `.github/workflows/release-tauri.yml:207` (the matrix leg at `:158`); the fix applied only in `.github/workflows/rust-test.yml:88-95`
**Issue:** 88-17 added golden fixture folders named after test titles, and tracked paths reach 248 characters. For example:

`src-tauri/crates/gamelib-knownfix/tests/fixtures/golden/reader/expected/knownFixesGamelibStatus--readgamelibfixstatus-quick-261027-gtd-routing-only-...-the-profile-still-counts/requests.json`

With the `D:\a\GameLib\GameLib\` prefix that is about 269 characters, over `MAX_PATH`. The phase's own comment in `rust-test.yml` records that git on Windows then stops the checkout with "unable to create file". The phase added the `git config --system core.longpaths true` step only to `rust-test.yml`.

`release-tauri.yml` has a `windows-latest` matrix leg at line 158. Its first step is a bare `actions/checkout@v6` at line 207, with no `core.longpaths` anywhere in the file (`grep longpaths .github` hits only `rust-test.yml`). Same runner image, same tree, same failure: a tagged release's Windows leg cannot check out the repo. The same applies to any Windows contributor who clones without `core.longpaths`.
**Fix:** Either add the identical step before the checkout in `release-tauri.yml`, guarded by `if: runner.os == 'Windows'` or `matrix.platform == 'windows-latest'`. Or, more robustly, shorten the fixture case-folder names. The recorder derives them from test titles, so cap or hash the slug at a length that keeps every tracked path under about 200 characters and fixes it for developers too. Add a meta test, in the style of `rustTestWorkflow.test.ts`, that fails when any tracked path is 240 characters or longer.

### Warnings

### WR-06: A single non-string tier-1 `envVariables` value rejects the whole overlay-env call, so all tier-2 overlays are silently dropped

**File:** `src/backend/launcher.ts:1060-1075` (`tier1Env` from `getKnownFixesEnvVariables`, `:1254-1262`); the zod arg schema is in `src/common/types/ipc/rustInvoke.ts:1064-1073`; the unvalidated filter is in `src/backend/launchrust/knownFixTwins.ts:216-245`
**Issue:** `filterTier1KnownFixes` allow-lists the `envVariables` key but never checks its value shape. A tier-1 file can therefore carry `{"envVariables": {"X": 1}}` or an array. Tier 1 includes the remote layer, so a downloaded fix can do this too. `getKnownFixesEnvVariables` returns it as-is, typed `Record<string,string>` but not string at runtime. The old TS used `tier1Env[k]` only to look up base values, so a malformed entry cost nothing. The new code sends `tier1Env` whole as `{ tier1Env }`, and two layers require a pure string map:

- zod `knownFixEnvMap` (`z.record(z.string(), z.string())`)
- the shell's `is_string_map` in `profile_overlay_env_over`

One bad value rejects the call. `settleKnownFixOverlayEnv` then logs a warning and returns `{}`. The user's launch silently loses every tier-2 overlay (the GStreamer plugin path, for example), and the cause is a field the remote feed controls. The Steam bridge does not have this bug: it maps values through `String(value)` (`bridgeKnownFixes.ts:350-352`). The two call sites are inconsistent, and the launcher's own `logKnownFixEnv` call already does `String(value)`, which confirms non-strings can reach this point.
**Fix:** Normalise before the call, exactly as the bridge does.
```ts
const tier1Env = Object.fromEntries(
  Object.entries(rawTier1Env).map(([k, v]) => [k, String(v)])
)
```
Also validate the `envVariables` shape in `filterTier1KnownFixes` and its Rust counterpart. This is a twin-and-golden change, so do it as a todo per D-20 and not as a drive-by edit.

### WR-07: The two unbounded known-fix channels have no sidecar-side backstop, so a lost reply hangs the launch

**File:** `src/backend/sidecar/sidecarRpc.ts:243-290` (entries added for `RUST_KNOWNFIX_APPLY_PROFILE_REGISTRY`, `_PROFILE_OVERLAY_ENV`, `_APPLY_REGISTRY` and `_RESOLVE_OVERLAY_ENV`); the call sites are `launcher.ts:1047-1075` and `bridgeKnownFixes.ts:226-238` and `:360-373`
**Issue:** These four channels now carry no timer (`timer: null`). Every launch `await`s two of them, through `settleKnownFixRegistry` and `settleKnownFixOverlayEnv`, before the game starts. The settle helpers guard against rejection, but not against a promise that never settles. The shell answers by `thread::spawn` in `sidecar.rs:573-582` with no `catch_unwind`. If that thread dies without writing a response, or the response frame is lost, the sidecar waits forever and the game never launches. There is no log line either, because nothing times out. The justification in the comments is that Rust bounds each step (15 s per `reg add`, 120 s per download). That is true of the crate's own `guarded` wrapper, but `dispatch_sync` setup, the argument decode and the shell arm sit outside it.
**Fix:** Keep these channels out of the 60 s cap but give them a generous finite ceiling, say 10 minutes, that comfortably exceeds the worst case in Rust, 120 s plus several 15 s helpers. A one-line change in `sidecarRpc.ts` keeps the timer `unref`'d, as the current timer is. Alternatively, wrap the shell arms in `catch_unwind` so a panic always writes an error frame.

### Info

### IN-07: Comments overstate how strict the shell's generated decode is, and one catalogue comment names a removed function

**File:** `src/common/types/ipc/rustInvoke.ts:1027-1029` and `src-tauri/src/ipc_contract.rs:3822-3840`; `src/common/knownFixOverlayCatalogue.ts:6`
**Issue:** The `rustInvoke.ts` comment says the Rust serde decode takes the fields with `deny_unknown_fields`, and the shell "decodes the same set again". The generated structs (`KnownfixLaunchOverridesArgs`, `KnownfixFetchRemoteArgs`, and the others) derive only `Deserialize` with no `deny_unknown_fields`. The shell's own test says "the crate's strict decode ... refuses what the generated decode lets through". Strictness exists at the zod layer and the crate, not in the shell layer as documented. Separately, the catalogue header still says a profile entry "can only name an overlay `id` (see validateOverlayEntries)". That function now lives in Rust, so the pointer is dead.
**Fix:** Correct both comments, or add `#[serde(deny_unknown_fields)]` to the generator template if the shell layer is meant to be strict.

### IN-08: `overlayArchiveUrl` is exported but used only by tests, and the bridge duplicates `overlayBaseEnv`

**File:** `src/common/knownFixOverlayCatalogue.ts:84`; `src/backend/storeManagers/steam/bridgeKnownFixes.ts:357-361`
**Issue:** `overlayArchiveUrl` has no non-test consumer. It is an unused export, kept alive by `src/common/__tests__/knownFixOverlayCatalogue.test.ts` and the Rust pin. The bridge re-implements the base-env loop (`lastEnvOption(merged, key) ?? process.env[key]` over `KNOWN_FIX_OVERLAY_BASE_ENV_KEYS`) next to the shared `overlayBaseEnv(env)`. The base-env key list is the T-88-33 allow-list, so two code paths building it is a drift risk.
**Fix:** Drop the unused export, or note that it is a test and Rust-pin seam. Build the bridge's base from `overlayBaseEnv({ ...process.env, ...mergedEnvAsRecord })`, or add an optional lookup argument to `overlayBaseEnv`.

### IN-09: `aborts` is a dead dependency of `LauncherDeps` and `BridgeKnownFixDeps`

**File:** `src/backend/launcher.ts:156`; `src/backend/storeManagers/steam/bridgeKnownFixes.ts:184`
**Issue:** `aborts: Pick<AbortRegistry, 'create' | 'delete'>` was there for the known-fix overlay downloads, which are Rust's now (the old `knownFixOverlayInstall.ts` registered `known-fix-overlay:<id>` in it). Neither file reads `deps.aborts` any more. `BridgeKnownFixDeps` forces every caller and test to supply it. The `LauncherDeps` doc comment still mentions "known-fix overlay downloads".
**Fix:** Remove the field and the comment text from both interfaces, after confirming no test builds a deps literal that depends on it.

### IN-10: `getSettings()` is evaluated outside the `.catch` on the three fire-and-forget report call sites

**File:** `src/backend/storeManagers/steam/library/macArch.ts:160-174` and `:187-197`; `src/backend/storeManagers/steam/bridgeInstallState.ts:43-57`
**Issue:** These calls read `deps.config.getSettings().shareDetectedFixes === true` as an argument, so the read runs synchronously before `reportDetectedFix(...).catch(...)` begins. The previous design was a never-throw fire-and-forget. `getSettings()` can run `mkdirSync` and read the settings doc on a cold cache, so it can in principle throw synchronously. That would abort `applyMacArchVerdict` or `persistBridgeDrmSignal` after the library state is written and before the later steps (`promptI386Recovery`, the forced-bridge branch).
**Fix:** Move the read inside the guarded promise.
```ts
void (async () => reportDetectedFix(deps, fix, deps.config.getSettings().shareDetectedFixes === true))().catch(...)
```
Or compute `enabled` through a small `reportEnabled(deps)` helper that catches and returns `false`. This also removes the three-way duplication.

### IN-11: `KnownFixLaunchOverrides` is declared twice with the same shape

**File:** `src/backend/knownFixLaunchReply.ts:13`; `src/backend/launchrust/knownFixTwins.ts:380`
**Issue:** The settle helper exports the interface. The twin file has a private copy, with `exeOverride?: string` in both. The sync twin and the async shim path produce the same type through two declarations, and a future field addition on one side will not fail compilation on the other.
**Fix:** Export one definition from `knownFixLaunchReply.ts`, or from `common/`, and import it in the twin. The twin header's "must not import" list does not forbid it.

---

_Reviewed: 2026-11-25_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

## Lane C — tests, golden replays, oracle harness

## Phase 88 (lane C): Code Review Report

**Reviewed:** 2026-11-25
**Depth:** standard
**Files Reviewed:** 59 in scope (31 read in full or by hunk and listed above; the remaining Steam-manager, sidecar-schema and `library.*` test files in the scope list were spot-checked through `git diff` hunks for removed or weakened assertions and for added skips, and nothing came up)
**Status:** issues_found

### Summary

I read all seven Rust golden replay binaries, the bundled-seeds test, both CLI tests, the TS twin vectors test, the shim test, the launch oracle helpers and the schedule and port-complete gates. I ran `cargo test -p gamelib-knownfix --tests`. All binaries pass on this macOS host.

The case floors are real: reader 125, launch_overrides 19 (15 off unix), registry 57, overlay_archive 25, overlay_install 41, fetcher 38 and report 48. Each is a Rust constant, checked both before the loop and against the count actually compared. An empty case list cannot pass.

Fake HOME isolation is sound everywhere I looked. Every Rust rig uses `gamelib_testutil::FakeHome`. The CLI tests use `env_clear()` plus `--user-data` under a FakeHome, the same shape as `gamelib-engine-cli`. The TS oracle uses `createFakeHomeProfile` and `withPinnedBaseEnv`. I found no hand-rolled env literal on a spawn.

The weaknesses are about what the replays do not compare:

- **Gzip bytes are never compared.** In the overlay archive replay the gzip-byte comparison is circular (WR-08), and the 88-17 TS fix hides its own degradation (WR-09).
- **About 79 golden cases do not run on the Windows leg.** The fetcher and overlay-install replays are `cfg(unix)` only (WR-10).
- **Two event comparisons are lossy.** The fetcher and report replays cannot tell info from error (WR-11), and the launcher-path registry replay drops error-level lines entirely (WR-12).

None of these is a defect in shipped code. They are places where a green run proves less than its header says.

I did not assess necessity (#4100) in this lane, so there is no `necessity:` count.

### Warnings

### WR-08: The overlay archive replay never independently compares gzip bytes; the "same" branch is circular

**File:** `src-tauri/crates/gamelib-knownfix/tests/golden_overlay_archive.rs:152-175` (also `:179-196` for `buildPair`)
**Issue:** `run_step` decides whether the compressed bytes are comparable with `golden["sha256"] == sha256(&out)`. When they match, it reports `size` and `sha256` from `out`, which equal the golden by construction. When they differ, it copies `size`, `sha256` and `base64` out of the golden. No path asserts that Rust's gzip equals the golden. The `compressed.identical` and `compressed.differing` counters are only printed.

On this macOS host the replay reports `identical to the golden in 4, differing in 1`. So 1 of 5 build cases already takes the copy-from-golden branch here, and on a platform where flate2/zlib-rs differs from Node's zlib every one of them does. A regression in the writer's level, strategy or header would be invisible.

`deltas.json` says the replay compares the compressed bytes "only when the Rust writer reports the same deflate implementation". The code never checks the implementation, only the digest.

The 88-17 commit `dc0adf728` also leans on this. It tells the reader that "Rust's replay still compares the gzip bytes on all three OSes", and that is not what the code does.

**Fix:** Pin a reference that is independent of the golden. Either assert a minimum count, or pin a Rust-recorded digest for the deterministic zlib-rs output:
```rust
// after the loop in every_overlay_archive_golden_replays
assert!(
    compressed.identical >= 1,
    "no case reproduced the recorded gzip bytes; the compressed comparison is vacuous"
);
// and for the differing branch, pin the Rust output's own digest in a Rust-side table
// (rust_gzip.json) so a writer change is a visible diff instead of a silent copy.
```
Also correct the 88-17 commit-message and doc claim.

### WR-09: The TS twin's gzip fields are dropped by a one-case probe that degrades silently

**File:** `src/backend/launchrust/__tests__/knownFixTwins.vectors.test.ts:652-680`
**Issue:** `exactGzip` is computed from the single case `build-three-files-sorted-by-bytes`.
- If that id is renamed or removed, `ref` is `undefined`, `exactGzip` is `false`, and the size, sha256 and base64 fields are dropped from the comparison on every OS, macOS included. Nothing fails.
- When the probe is `false`, nothing is logged, so a CI leg that compares no gzip bytes looks the same as one that does.
- The planted-mismatch self-test was moved from `sha256` to `tarSha256`, so it no longer exercises the dropped fields. That is consistent, but it also means nothing proves the gzip comparison is live when `exactGzip` is true.

Because of WR-08, the "Rust compares them instead" fallback does not hold either. Compressed bytes end up checked nowhere on Linux and Windows.

**Fix:** Fail loudly if the reference case is missing, and make the mode visible:
```ts
const ref = cases.find((x) => x.id === 'build-three-files-sorted-by-bytes')
if (!ref) throw new Error('reference case build-three-files-sorted-by-bytes missing from golden/overlay_archive')
...
it('reports whether the gzip bytes were compared', () => {
  // surface exactGzip in the test name or a console.info so a degraded leg is visible
  expect(typeof exactGzip).toBe('boolean')
})
```

### WR-10: The fetcher and overlay-install replays are `cfg(unix)` only, so about 79 golden cases do not run on the Windows leg

**File:** `src-tauri/crates/gamelib-knownfix/tests/golden_fetcher.rs:19,178-179,281,332`; `src-tauri/crates/gamelib-knownfix/tests/golden_overlay_install.rs:23,550,1053,1109`
**Issue:** In both files `snapshot_tree`, `run_case` and the main `#[tokio::test]` are `#[cfg(unix)]`, with `#![cfg_attr(not(unix), allow(dead_code, unused_imports))]` hiding the dead code. On Windows only the floor, manifest and "has recorded exchanges" tests remain. The 38 fetcher cases and 41 overlay-install cases are never replayed, and `check_floor("... cases compared")` is never reached.

- The module docs do not say this. Compare `golden_launch_overrides.rs`, which names its skipped cases and counts only the ones that ran.
- The fetcher is cross-platform product code; only its tree snapshot is unix-specific (it records permission mode).
- Rust-test CI is three-OS, and the 88-17 proof reads as covering all three, but the Windows leg runs fewer than half the fetcher and install assertions.

**Fix:**
- For the fetcher, make `snapshot_tree` portable (omit `mode` on non-unix and compare the mode-less projection of the golden) and drop the cfg on the replay.
- For overlay-install, if it is deliberately mac/unix-only, say so in the file header and add a non-unix assertion that names the skip:
```rust
#[cfg(not(unix))]
#[test]
fn the_unix_only_replays_are_named_as_skipped() {
    println!("skipped on this leg: golden_overlay_install (41 cases), golden_fetcher (38 cases)");
}
```
- Record the Windows gap in the 88-17 proof so the three-OS claim is accurate.

### WR-11: Event level comparison in the fetcher and report replays cannot tell info from error

**File:** `src-tauri/crates/gamelib-knownfix/tests/golden_fetcher.rs:309-315`; `src-tauri/crates/gamelib-knownfix/tests/golden_report.rs:784-789`
**Issue:** Both replays compare levels with `(want["level"] == "warning") == (got.1 == "warn")`. A golden `info` accepts a Rust `error` (and a `debug`), and the reverse also passes. The goldens carry 110 info lines in the report slice and 24 in the fetcher slice. A regression that downgrades a warning-worthy path to an error, or an info line to an error, passes. The fetcher adds `want["level"] != "error"`, which only constrains the golden side. `golden_reader.rs`, `golden_launch_overrides.rs` and `golden_registry.rs` compare the level string exactly, so these two are inconsistent with them.

**Fix:** Map the Rust level once and compare equality:
```rust
let got_level = if got.1 == "warn" { "warning" } else { got.1.as_str() };
want["level"].as_str() == Some(got_level)
```

### WR-12: The launcher-path registry replay drops every error-level log line before comparing events

**File:** `src-tauri/crates/gamelib-knownfix/tests/golden_registry.rs:703-707`
**Issue:** `run_real_case` builds `events` with `.filter(|(level, _)| *level != "error")`. That hides everything the wine command core and the registry module log at error level for the five wine-core cases, and the comparison against `events.json` never sees it. The goldens contain no error-level lines, so the intent is clearly to ignore the wine core's "missing library folders" note (the later test comment says as much). But the filter is blanket: a new error line from `apply_known_fix_profile_registry`, for example a failed `reg add`, is dropped.

**Fix:** Drop only the specific known line, not the whole level:
```rust
.filter(|(level, line)| !(*level == "error" && line.contains("library folder")))
```
Or assert the error lines are exactly the expected set, so any new one fails.

### Info

### IN-12: The golden_registry `prefixDir` fold uses a raw string prefix and folds every separator outside the profile

**File:** `src-tauri/crates/gamelib-knownfix/tests/golden_registry.rs:469-488`
**Issue:** The 88-17 fix decides `inside` with `text.starts_with(rig.root().to_string_lossy())`, a string prefix with no path-boundary check. A sibling such as `<root>X` counts as inside. For paths outside the profile on Windows, every `\` becomes `/` before comparing. Rust returning `\x\pfx` for a recorded `/x/pfx` is therefore accepted, which is the stated intent. But mixed-separator drift in `prefix_dir` on Windows is also invisible now. The separator fold in `normalise_text` is likewise applied to the whole string whenever any placeholder is present.
**Fix:** Use `Path::new(&text).starts_with(rig.root())` for `inside`, and fold only the segment that follows the root.

### IN-13: The `normalise_text` replacement table puts the real-path HOME entry last, so on macOS it is dead

**File:** `src-tauri/crates/gamelib-knownfix/tests/golden_reader.rs:113-132`; `golden_launch_overrides.rs:121-142`; `golden_registry.rs:219-237`
**Issue:** The comment says "most specific root first", but `<HOME>` real (`/private/var/...`) is pushed after `<HOME>` original (`/var/...`). The original is a substring of the real path, so a real HOME path is rewritten to `/private<HOME>` and the real entry never fires. The TS side compensates with `dropRealpathPrefix`; the Rust side does not. This is latent only because no current Rust output contains a canonical HOME path. If one ever does, the failure would be a confusing `/private<HOME>` mismatch.
**Fix:** Insert the real `<HOME>` before the original (`table.insert(0, ...)`), as is already done for `<APPFOLDER>`.

### IN-14: Loose time and grace bounds in the registry replay

**File:** `src-tauri/crates/gamelib-knownfix/tests/golden_registry.rs:~864` (`started.elapsed() < 10s`) and the `Stuck` test (`< 2 * (REGISTRY_FIX_TIMEOUT + 10s)`)
**Issue:** The wall-clock bound on a 57-case replay (`std::time::Instant`, real time) can flake on a slow Windows or Linux runner. The `a_run_that_ignores_the_cancel...` bound allows a 50 s span, so it would not notice a doubled or removed grace period. It asserts "bounded", not "bounded at the specified value".
**Fix:** Assert the exact virtual duration (`REGISTRY_FIX_TIMEOUT + GRACE`) in the paused-clock test, and either drop or widen the wall-clock bound.

### IN-15: The Windows leg skips the four symlink launch-override cases, including the escape-rejection ones

**File:** `src-tauri/crates/gamelib-knownfix/tests/golden_launch_overrides.rs:30-40,371-377`
**Issue:** This is documented and the skipped ids are named and pinned, which is the right shape. Two of the skipped cases (`rejects-a-symlinked-file-escaping-the-install`, `rejects-a-path-through-a-symlinked-dir-...`) pin a path-escape defence that therefore has no Windows coverage. `fold_not_found` also accepts either `os error 2` or `3` for any not-found line, so a Windows regression that returned the wrong kind of not-found would pass. Both are acceptable for a Windows-only gap, but note them in the 88-17 proof.
**Fix:** If the Windows runner can create symlinks (admin runners can), run the four cases there, using `std::os::windows::fs::symlink_file` and `symlink_dir`. Otherwise keep the skip.

### IN-16: Test-environment hygiene nits

**File:** `src/backend/testUtils/launchOracle/__tests__/baseEnv.test.ts:44-52`; `src-tauri/crates/gamelib-knownfix/tests/bundled_seeds.rs:171-190`; `src-tauri/crates/gamelib-knownfix-cli/tests/cli.rs:~228`
**Issue:**
- `afterEach` deletes `DYLD_FALLBACK_LIBRARY_PATH` and `LD_PRELOAD` unconditionally. Only `SENTINEL` was saved, so a real value set by the runner is lost for the rest of that Jest file's `process.env` (Jest isolates `process.env` per file, so the blast radius is one file).
- `bundled_seeds.rs` panics on any non-`<id>-<store>` entry in `public/fixes` (a stray `.DS_Store`, for example).
- The knownfix-cli report-detected assertion accepts either `"disabled"` or `"not-mac"` for a call with `enabled:false`, which should deterministically be `"disabled"` if the opt-in check runs before the platform check. It also leaves a `println!("resolved exe ...")` debug line.
**Fix:** Save and restore all three env keys; skip dot-files in the seeds walk; assert the exact word and drop the debug print.

### IN-17: Tautological checks

**File:** `src/common/__tests__/knownFixOverlayCatalogue.test.ts:26-40`; the `the_floor_matches_the_manifest_and_an_empty_list_fails` tests in the Rust golden files
**Issue:** The TS "field for field" test compares the catalogue view to the JSON it is built from. The "anti-vacuity" tampered-clone test compares a clone to the original. Only the pinned literals (sha `57e5f7...`, size 8279592, the two URLs) are real checks, and the Rust CLI test pins the same sha. The `check_floor("...", 0, FLOOR).unwrap_err()` assertions test a local helper copy rather than the production comparison. This is harmless, but the "anti-vacuity" label overstates what these prove.
**Fix:** Keep the literals as the contract, and rename or remove the tautologies.

### IN-18: The port-complete gate imports another test file

**File:** `src/backend/__tests__/launchPortComplete.test.ts:50`
**Issue:** `import { rowsDueIn, SCHEDULE } from './engineWineShimSchedule.test'` re-registers every `describe` of the schedule test inside this file, so the schedule suite runs twice. This already exists in `engineWinePortComplete.test.ts` and is acknowledged there at line 405, so I record it only so the duplicate runs are not mistaken for extra coverage.
**Fix:** Move `SCHEDULE`, `rowsDueIn` and `noIntraPhaseRowsLeft` into a non-test module such as `testUtils/shimSchedule.ts` when convenient.

---

_Reviewed: 2026-11-25_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
