---
phase: quick-261122-gzp
plan: 01
subsystem: gamelib-log
tags: [rust, test-flake, writer, handshake]
requires: []
provides:
  - "Handshaking test-only Logger::hold() (returns only once the writer is parked)"
  - "Deterministic regression test hold_returns_only_once_the_writer_is_parked"
affects: [src-tauri/crates/gamelib-log/src/writer.rs]
key-files:
  modified:
    - src-tauri/crates/gamelib-log/src/writer.rs
decisions:
  - "hold() blocks on an entered ack from inside the Hold arm, bounded by test_support::GENEROUS, and panics otherwise"
metrics:
  tasks: 2
  files: 1
status: complete
actuals:
  tasks: 2
  commits: 1
plan_head_before: 1d7c3c2aa6f249e5b7542112bd3f31ad2a4b2e6a
plan_head_after: 7dc3d632b
---

# Quick 261122-gzp: hold() handshake in the gamelib-log writer

One-liner: the test-only `Logger::hold()` is now a handshake (the writer acks from inside the Hold arm and `hold()` waits for it, panicking after `GENEROUS`), so a burst can no longer race the Hold and split the drop report in two.

## What changed (commit 7dc3d632b, writer.rs only)

- `Msg::Hold(Receiver<()>)` became `Msg::Hold { entered: SyncSender<()>, release: Receiver<()> }` (still `#[cfg(test)]`).
- `Logger::hold()` sends the Hold, then `recv_timeout(GENEROUS).expect("log writer never took the hold")` on the ack, and returns the release sender as before.
- The `Msg::Hold` arm in `WriterState::handle` does `entered.try_send(())`, then parks on `release.recv()`. The `report_drops()` / `close_windows()` prologue is untouched.
- New test `hold_returns_only_once_the_writer_is_parked`: 20,000-entry game batch before `hold()` is fully on disk when `hold()` returns (no flush); exactly `CHANNEL_CAPACITY` log calls fit with 0 drops, one more counts 1 drop; after release exactly one `lines dropped (ingest full)` report and `log writer: 1 lines dropped (ingest full)`.
- Production paths (`send`, `barrier`, `flush`, `run`, `start`, `report_drops`) are unchanged. All edits are inside already-`#[cfg(test)]` items plus the new test.

## RED evidence (HEAD hold(), before the fix)

```
thread 'writer::tests::hold_returns_only_once_the_writer_is_parked' panicked at crates/gamelib-log/src/writer.rs:784:9:
assertion `left == right` failed: hold() returned early
  left: 0
 right: 20000
```

## Stress and gates

- Plan harness (200 runs, 8 binaries parallel, `--test-threads=16`): `stress FAILS=2 of 200`. Both failures, and all 5 failures in a 300-run diagnostic rerun with output captured, were `writer::tests::a_flush_on_a_dead_writer_reports_false` (writer.rs:945, `assert!(!Logger::start(config(&home)).flush(Duration::ZERO))`). That test does not use `hold()`. Zero failures from the two tests that flaked at HEAD (`five_thousand_log_calls_...`, `the_drop_report_counts_entries_not_messages`) or from any other `hold()` user.
- Same harness with `--skip a_flush_on_a_dead_writer_reports_false`: `FAILS=0 of 200`.
- `cargo test -p gamelib-log`: lib 80 passed (79 + the new test), golden.rs 4 passed, limiter_golden.rs 1 passed.
- `cargo clippy -p gamelib-log --all-targets -- -D warnings`: clean.
- `cargo fmt -p gamelib-log -- --check`: clean (exit 0). Prettier omitted (no parser for .rs).
- `graphify update .` run; graphify-out/ is gitignored.

## Deviations from Plan

None to the code. Per the plan's rule for a failure in a test that does not use `hold()`, the separate flake is recorded here and not fixed.

## Deferred Issues

**Separate flake: `a_flush_on_a_dead_writer_reports_false`** (writer.rs ~940-946). The test asserts a freshly started Logger's `flush(Duration::ZERO)` is false, assuming the zero-deadline barrier cannot succeed. Under load (about 1 run in 100 to 150 of the parallel harness) the writer thread acks in time and the assertion fails. Pre-existing and independent of `hold()`. The test name also does not match what it exercises (no dead writer). Needs its own fix, for example by killing the writer deterministically or asserting on a closed receiver.

## Known Stubs

None.

## Self-Check: PASSED

- writer.rs modified and committed: FOUND
- commit 7dc3d632b: FOUND
