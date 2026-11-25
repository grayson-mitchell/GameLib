---
phase: 88-launch-pipeline
fixed_at: 2026-11-25T00:00:00Z
review_path: .planning/phases/88-launch-pipeline/88-REVIEW.md
iteration: 1
findings_in_scope: 14
fixed: 14
skipped: 0
status: all_fixed
---

# Phase 88: Code Review Fix Report

**Fixed at:** 2026-11-25
**Source review:** .planning/phases/88-launch-pipeline/88-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 14 (CR-01, CR-02, WR-01 to WR-12)
- Fixed: 14 (five of them partially; see the "Left open" lines)
- Skipped: 0

**Verification ran in the main checkout** (`workflow.use_worktrees` is `false`, so no isolated worktree was created). The Rust crates were checked with `cargo test -p gamelib-knownfix -p gamelib-knownfix-cli -p gamelib-launch-cli` on this macOS host only; the Windows and Linux legs were not run. TypeScript was checked with `npx jest <path>`, `tsc --noEmit` (no errors in the edited files) and `npx prettier --check`.

IN-* findings were left alone, as instructed.

## Fixed Issues

### CR-01: Quadratic duplicate-key scan in `JsValue::visit_map`

**Files modified:** `src-tauri/crates/gamelib-knownfix/src/jsvalue.rs`
**Commit:** 52e5daa34
**Applied fix:** `visit_map` keeps a `HashMap<String, usize>` index, so a repeated key still keeps its first place and takes the last value, and the lookup is linear. The existing order test passes.
**Left open:** the reviewer's second suggestion (parse under `spawn_blocking`, or a smaller body cap for a fix file) was not done. With the quadratic scan gone, the parse is linear in a 16 MiB body; the cap and the thread are a separate decision.

### CR-02: Windows release build lacks `core.longpaths`

**Files modified:** `.github/workflows/release-tauri.yml`
**Commit:** 776e12d3b
**Applied fix:** added the same `git config --system core.longpaths true` step, guarded by `runner.os == 'Windows'`, before the first `actions/checkout`. `releaseWorkflow.test.ts` and `rustTestWorkflow.test.ts` pass; prettier check is clean.
**Left open:** the reviewer's more robust option (shorten the golden fixture folder names and add a meta test that fails on any tracked path of 240 characters or more) was not done. It needs the golden recorder re-run. The longest tracked paths are 246 and 248 characters today, so a Windows contributor who clones without `core.longpaths` still hits the original failure.

### WR-01: Reader warnings echo raw values and key names

**Files modified:** `src-tauri/crates/gamelib-knownfix/src/reader.rs`, `src-tauri/crates/gamelib-knownfix/src/registry.rs`, `src-tauri/crates/gamelib-knownfix/src/overlay/env.rs`
**Commit:** 6a08dd043
**Applied fix:** `redact_urls` moved from `overlay/env.rs` to `registry.rs` (`pub(crate)`) and is shared. `echo()` now redacts URLs, and a new `key_shown()` cuts key names at the 200-unit bound and redacts them in all four key warnings. The commit also carries the `rustfmt` change to the CR-01 hunk.

### WR-02: Feed URL embeds an unencoded `app_name`

**Files modified:** `src-tauri/crates/gamelib-knownfix/src/remote.rs`
**Commit:** 9b62ca968
**Applied fix:** `url_safe_app_name` allows only ASCII alphanumerics and `.`, `_`, `-`, and refuses an empty name. `run` checks it before building the URL, with the same "unsafe app name" warning the existing refusal uses. A unit test covers `a?b`, `a#b`, `..%2fx`, whitespace, a newline, `/` and a non-ASCII letter. The golden fetcher replay still passes, so no recorded case uses a name outside the set.

### WR-03: Three ops take an unbounded `appName` and `installPath`

**Files modified:** `src-tauri/crates/gamelib-knownfix/src/lib.rs`
**Commit:** d655ab2a2
**Applied fix:** `decode_app_runner` (used by `knownfix_read` and `knownfix_status`) and the `knownfix_launch_overrides` arm now apply `bounded_name` to `app_name`. `install_path` is bounded to `MAX_PATH_UNITS` (32,768 UTF-16 units, the Windows extended-length limit). Every refusal is the fixed `<op>:bad-args`. A new test covers an empty name, a 257-unit name and an over-long path.
**Status note:** the 32,768 bound on `installPath` is my choice; the review named no number.

### WR-04: CLIs panic on non-UTF-8 arguments and environment

**Files modified:** `src-tauri/crates/gamelib-knownfix-cli/src/main.rs`, `src-tauri/crates/gamelib-launch-cli/src/main.rs`
**Commit:** 2d5d5ecff (shared with WR-05)
**Applied fix:** both CLIs read `args_os()` and convert lossily; `gamelib-knownfix-cli` builds its `EnvSnapshot` from `vars_os()` the same way. Both CLI test suites pass.

### WR-05: Headless CLIs default to the production relay

**Files modified:** `src-tauri/crates/gamelib-knownfix-cli/src/main.rs`, `src-tauri/crates/gamelib-launch-cli/src/main.rs`
**Commit:** 2d5d5ecff (shared with WR-04)
**Applied fix:** without `--relay-url` the CLIs pass `RELAY_URL_PENDING_SENTINEL`, so `report_detected` answers `no-relay` and cannot post to the deployed relay. The CLI tests pass.

### WR-06: A non-string tier-1 `envVariables` value drops all tier-2 overlay env

**Files modified:** `src/backend/launcher.ts`
**Commit:** 744f2529e
**Applied fix:** `tier1Env` is built from the raw map with `String(value)` per entry (and an empty map for a non-object), as the Steam bridge does. The launcher jest suites pass and `tsc` reports nothing for the file.
**Status:** fixed: requires human verification (behaviour change on a launch path; no new test was added).
**Left open:** validating the `envVariables` shape in `filterTier1KnownFixes` and its Rust counterpart. The review says to track that as a todo under D-20, because it is a twin-and-golden change, so it was not touched.

### WR-07: The four known-fix channels have no sidecar-side backstop

**Files modified:** `src/backend/sidecar/sidecarRpc.ts`, `src/backend/__tests__/dialogOptionForwarding.test.ts`
**Commit:** c8a670b4a
**Applied fix:** the four channels moved out of `UNBOUNDED_RUST_CHANNELS` into a new `LONG_RUST_CHANNELS` list with a 10-minute ceiling (`RUST_LONG_INVOKE_TIMEOUT_MS`). The timer is still `unref()`'d. The gate test's expected unbounded list lost the four members, and a new test pins the long list and the 10-minute constant. `dialogOptionForwarding`, `rustInvokeChannel`, `diPhaseGates`, `engineWinePortComplete` and `launchPortComplete` suites pass.
**Status:** fixed: requires human verification (timeout policy).
**Left open:** the alternative of wrapping the shell arms in `catch_unwind` was not attempted.

### WR-08: The overlay archive replay never independently compares gzip bytes

**Files modified:** `src-tauri/crates/gamelib-knownfix/tests/golden_overlay_archive.rs`
**Commit:** c8608ba57
**Applied fix:** the replay now fails when `compressed.identical` is 0, and the module doc says the gzip bytes are compared only where they match the golden. On this host 4 of 5 build cases are identical.
**Status:** fixed: requires human verification.
**Left open:** the Rust-side pinned digest table (`rust_gzip.json`) for the differing branch was not added, because its output could not be checked on Linux or Windows from this host. The "identical >= 1" floor also rests on zlib-rs giving the same bytes on every leg, which is unverified off macOS. The 88-17 commit-message claim ("Rust still compares the gzip bytes on all three OSes") cannot be amended without rewriting history, so it is not corrected.

### WR-09: The TS twin's gzip fields are dropped by a one-case probe that degrades silently

**Files modified:** `src/backend/launchrust/__tests__/knownFixTwins.vectors.test.ts`
**Commit:** 3d4b1e926
**Applied fix:** the probe throws if the `build-three-files-sorted-by-bytes` reference case is missing, and a new test logs through `console.info` whether the gzip bytes were compared on the leg. The doc comment no longer claims Rust compares the bytes on all three OSes. The file's 267 tests pass and eslint is clean.

### WR-10: Fetcher and overlay-install replays are `cfg(unix)` only

**Files modified:** `src-tauri/crates/gamelib-knownfix/tests/golden_fetcher.rs`, `src-tauri/crates/gamelib-knownfix/tests/golden_overlay_install.rs`
**Commit:** 74f1c6c62
**Applied fix:** both file headers now say the replay is unix only, and each file has a `#[cfg(not(unix))]` test that prints the skip by name (38 and 41 cases).
**Left open:** making the fetcher's `snapshot_tree` portable (drop `mode` on non-unix) so the fetcher replay runs on Windows. It could not be run on Windows from this host, so it was left as the documented gap. The 88-17 proof's three-OS claim is also not corrected.

### WR-11: Event level comparison cannot tell info from error

**Files modified:** `src-tauri/crates/gamelib-knownfix/tests/golden_fetcher.rs`, `src-tauri/crates/gamelib-knownfix/tests/golden_report.rs`
**Commit:** 02125e871
**Applied fix:** a `golden_level` helper maps `warn` to `warning` and leaves other levels alone; both replays compare the level string for equality. Both replays still pass, so no golden line was being matched through the old leniency.
**Status:** fixed: requires human verification.

### WR-12: The registry replay drops every error-level line

**Files modified:** `src-tauri/crates/gamelib-knownfix/tests/golden_registry.rs`
**Commit:** f61c389c9
**Applied fix:** the blanket `level != "error"` filter now drops only an error line containing `wine library folders are missing` (the wine core's note). I checked first that no error-level line reaches the five wine-core cases on this host. The registry replay passes.
**Status:** fixed: requires human verification.

---

_Fixed: 2026-11-25_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
