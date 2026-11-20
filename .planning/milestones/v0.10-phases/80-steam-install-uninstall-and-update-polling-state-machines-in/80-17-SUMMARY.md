---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 17
subsystem: steam-polling
tags: [rust, steam, dispatch, facade, cli, replay, parity]
requires: [80-16, 80-13, 80-08, 80-05, 80-02, 80-03]
provides:
  - "dispatch: every OPS entry handled (24 ops), camelCase args with deny_unknown_fields, catch_unwind, {op}:bad-args / {op}:wrong-thread / steampoll:not-configured"
  - "dispatch::facade::{install, install_for_test, reset_for_test, current, registry, outbox, polls}"
  - "gamelib-steampoll-cli: --list, --ndjson, replay <timeline.json>"
  - "replay::replay(&Value) -> Result<Vec<StreamRecord>, String>"
  - "DownloadMonitor::inject_reading (testing feature)"
  - "meta/gamelibSteampollCli.ts: resolveSteampollCliPath, assertSteampollCliPresent, parseSteampollReplayResult, runSteampollReplaySync"
affects: [80-18 (generated validation in front of dispatch), 80-19 (parity diff), 80-20/21 (shell installs the facade, spawns rearm)]
key-files:
  created:
    - src-tauri/crates/gamelib-steampoll/tests/dispatch.rs
    - src-tauri/crates/gamelib-steampoll-cli/src/replay.rs
    - src-tauri/crates/gamelib-steampoll-cli/tests/cli.rs
    - meta/gamelibSteampollCli.ts
  modified:
    - src-tauri/crates/gamelib-steampoll/src/dispatch.rs
    - src-tauri/crates/gamelib-steampoll/src/monitor.rs
    - src-tauri/crates/gamelib-steampoll/src/acf_state.rs
    - src-tauri/crates/gamelib-steampoll/src/install_loop.rs
    - src-tauri/crates/gamelib-steampoll/tests/contracts.rs
    - src-tauri/crates/gamelib-steampoll-cli/Cargo.toml
    - src-tauri/crates/gamelib-steampoll-cli/src/main.rs
    - src-tauri/Cargo.lock
decisions:
  - "Facade is a Mutex<Option<Arc<Facade>>> (not OnceLock) so tests can replace it; registry()/outbox()/polls() return owned clones (Registry and InstallPolls are Clone), not &'static references. install() is set-once for production."
  - "Op args are one camelCase object per op; running_hold returns a numeric claimId the facade maps back to the crate's ClaimId, running_release of an unknown claim is a no-op."
  - "Only the two async ops (read_running_app_id, mac_arch_verdict) block_on the runtime and answer {op}:wrong-thread inside one; the rest run on any thread."
  - "mac_arch_verdict op takes {installPath} and always probes as AcfSource::Native on the facade's platform (the TS call site already gates on native macOS)."
  - "Replay writes the ACF text itself: gamelib_steamfiles::acf::write_app_manifest cannot express BytesStaged/BytesToStage/TargetBuildID/ScheduledAutoUpdate or separate byte counters."
  - "Replay injects monitor readings through DownloadMonitor::inject_reading rather than synthesising nettop rows (plan 06 covers the monitor internals)."
metrics:
  tasks: 2
  files: 12
  completed: 2026-11-16
---

# Phase 80 Plan 17: dispatch contract, facade and replay runner Summary

All 24 ops of the steampoll crate are reachable through `dispatch`, a process-wide facade holds what the shell installs, and `gamelib-steampoll-cli replay` runs any plan-02 timeline under paused time. Measured against the frozen TS streams, 37 of the 39 timelines replay byte-identical; the other two are the documented transport differences.

## Commits

- 8f60745f8: op table, facade, tests/dispatch.rs (8 tests), deny_unknown_fields on PollRoots / PollOptions / StartInstallArgs, stale contracts test updated
- 03cd08023: CLI (--list, --ndjson, replay), replay.rs, tests/cli.rs (9 tests), monitor injection hook, meta/gamelibSteampollCli.ts

## Verification

`cargo test -p gamelib-steampoll` and `-p gamelib-steampoll-cli` green; `cargo clippy --all-targets -- -D warnings` and `cargo fmt --check` clean; `pnpm codecheck` clean; prettier clean on `meta/gamelibSteampollCli.ts` (`--file-info` confirmed it is not ignored); `fakeHomeIsolation.test.ts` and `cargoFeatures.test.ts` green.

## Replay vs the frozen TS streams

Run over every `tests/fixtures/timelines/*.json` against `expected-ts/`: 37 identical. Not identical, both by design (no TS counterpart, README "Known TS baseline limits"):

- ack-timeout-emits-anyway: Rust waits the 5 s ack timeout after a missing ack, so the continuation lands later than the timeline's last tick (3 records vs 5).
- sidecar-not-ready-latest-wins: the outbox queues until READY and replays latest-wins.

Plan 19 owns the diff test and the DV-80-nn record.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] First interval tick anchored late in replay** - spawned loops had not been polled when the first `advance` ran, so `interval_at(Instant::now() + period)` anchored at 3 s and every poll ran one tick late. Fixed by settling the runtime before the first and each subsequent advance. 23 of 39 timelines matched before, 37 after.

**2. [Rule 1 - Bug] Stale contracts test** - `dispatch_unknown_op_is_an_error` asserted `steampoll_status` was unknown (true only while dispatch was a stub). Switched to a genuinely unknown op.

**3. [Rule 3 - Blocking] Monitor reading injection** - the timeline's `monitor` field has no other way into the loop on a non-macOS host; added a `testing`-gated `inject_reading` to `DownloadMonitor` (file not in the plan's list).

### Notes

- `deny_unknown_fields` was added to `PollRoots`, `PollOptions` and `StartInstallArgs` (T-80-51) in the existing source files. Plan 18's generated validation must send exactly the documented fields.
- The CLI installs no facade, so `--ndjson` ops that need the shell's collaborators answer `steampoll:not-configured`; file-only ops (acf_*, breadcrumb) work.
- `meta/gamelibSteampollCli.ts` takes the child env from the caller (`createFakeHomeProfile(...).childEnv(process.env)`), per the plan; unlike the steamfiles helper it creates no profile itself.

## Threat mitigations

T-80-51: per-op structs with `deny_unknown_fields`, numeric appId (1-10 digits) and the source enum, tested for bad-args per op. T-80-52: `catch_unwind` in `dispatch`, `{op}:panic`. T-80-53: no env assembled in `meta/gamelibSteampollCli.ts`; the caller supplies a fake-HOME env.

## Known Stubs

None.

## Self-Check: PASSED

dispatch.rs, tests/dispatch.rs, replay.rs, tests/cli.rs, meta/gamelibSteampollCli.ts exist; commits 8f60745f8 and 03cd08023 exist.
