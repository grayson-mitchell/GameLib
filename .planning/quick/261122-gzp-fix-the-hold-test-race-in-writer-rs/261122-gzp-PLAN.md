---
phase: quick-261122-gzp
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/crates/gamelib-log/src/writer.rs
autonomous: true
requirements:
  - QUICK-261122-gzp

estimate:
  tokens: 40000
  raw_tokens: 40000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "Logger::hold() returns only after the writer thread has handled every message sent before it and is parked inside the Hold arm. A new deterministic test proves it: a 20,000-entry game batch submitted before hold() is fully on disk the instant hold() returns (no flush), and exactly CHANNEL_CAPACITY submissions fit after it before the first drop is counted"
    - "hold() fails loudly: if the writer has not acknowledged the hold within test_support::GENEROUS (10 s), hold() panics with a message, so a dead or wedged writer fails the test instead of letting a burst race it"
    - "The two tests that flaked at HEAD (five_thousand_log_calls_into_a_stalled_writer_never_block_and_are_counted and the_drop_report_counts_entries_not_messages) see exactly one drop report in every run: 0 failures in 200 runs of the writer:: tests, 8 binaries in parallel with --test-threads=16. The planner measured the HEAD baseline on 2026-11-22 with the same harness: 1 failure in 80 runs, and 2 in 120 (one of each test)"
    - "Production behaviour is unchanged. Outside the test modules, the only edits are to items that are already #[cfg(test)]: the Msg::Hold variant, Logger::hold, and the Msg::Hold match arm in WriterState::handle. report_drops() and close_windows() still run first in handle() for every message. send(), barrier(), flush() and run() are unchanged"
    - "All four existing hold() call sites (writer.rs, about lines 754, 810, 850 and 881) still pass unchanged, and cargo test -p gamelib-log (the lib plus the golden.rs and limiter_golden.rs integration tests), clippy -D warnings and rustfmt --check are clean"
  artifacts:
    - path: "src-tauri/crates/gamelib-log/src/writer.rs"
      provides: "A handshaking test-only Logger::hold(), a Msg::Hold { entered, release } variant whose arm acks on entry, and the deterministic regression test hold_returns_only_once_the_writer_is_parked"
      contains: "fn hold_returns_only_once_the_writer_is_parked"
  key_links:
    - from: "src-tauri/crates/gamelib-log/src/writer.rs"
      to: "src-tauri/crates/gamelib-log/src/writer.rs"
      via: "Logger::hold() sends Msg::Hold { entered, release } and blocks on entered's receiver, and WriterState::handle's Msg::Hold arm sends on entered before it blocks on release. This is the handshake: hold() cannot return before the writer is parked"
      pattern: "entered"
---

<objective>
Fix a test-only race in the gamelib-log writer. `Logger::hold()` (writer.rs:177, `#[cfg(test)]`) sends `Msg::Hold(rx)` and returns at once, without waiting for the writer thread to take the hold. Under load the writer has not dequeued `Msg::Hold` when the test's burst begins, so the bounded ingest queue fills and drops are counted early. When the writer then dequeues the Hold, `handle()` runs `report_drops()` before the `match` (writer.rs:303) and writes a first report. It parks, the rest of the burst is counted, and a second report follows the release. The tests assert one report. The counts still sum correctly, and production is unaffected because `Msg::Hold` is `#[cfg(test)]`.

The fix makes `hold()` a handshake. The writer acks from inside the Hold arm, and `hold()` waits for that ack. A burst that follows can then only hit a parked writer with an empty queue, and the single drop report comes on the first message after release.

Purpose: two writer tests flake under load. The planner reproduced both at HEAD on 2026-11-22: five_thousand_log_calls_into_a_stalled_writer_never_block_and_are_counted failed at writer.rs:763, and the_drop_report_counts_entries_not_messages failed at writer.rs:840 because it parses only the first report. Both fail at roughly 1 run in 60–80 of the parallel harness, and the first also failed once during a full jest run.
Output: a handshaking `hold()`, a deterministic regression test, and stress evidence. Everything is in src-tauri/crates/gamelib-log/src/writer.rs and nothing else.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@src-tauri/crates/gamelib-log/src/writer.rs

Rules that apply to this change. Planner decisions, kept within Claude's discretion: this quick task has no CONTEXT.md, so it has no D-NN decisions.
- **Shared tree.** Another session (Phase 85) is editing src/backend/stores/* and the gamelib-store crate in this working tree on main right now. Touch ONLY src-tauri/crates/gamelib-log/src/writer.rs. Stage that path explicitly (`git add src-tauri/crates/gamelib-log/src/writer.rs`). Never use `git add -A`, `git add .`, `git commit -a`, or a gsd-tools/gsd-sdk `commit` without `--files`, which sweeps every dirty `.planning` file into the commit. If cargo prints "Blocking waiting for file lock", the other session is building. Wait for it. Do not switch `CARGO_TARGET_DIR`.
- **Rust shutdown contract (gamelib-conventions).** It does not apply here. This change spawns no process, thread, task or timer and adds no exit work. The writer thread spawn in `Logger::start` already exists and must stay as it is.
- **Prettier `<verify>` rule (gamelib-conventions).** `npx prettier --file-info src-tauri/crates/gamelib-log/src/writer.rs` reports `{ "ignored": false, "inferredParser": null }` (measured 2026-11-22). Prettier has no parser for `.rs`, so `--check` would error instead of proving anything, and it is left out on purpose. The formatter gate for this file is rustfmt, `cargo fmt -p gamelib-log -- --check`, which passes at HEAD (exit 0, measured 2026-11-22).
- **Baselines at HEAD (measured 2026-11-22).** `cargo clippy -p gamelib-log --all-targets -- -D warnings` is clean. The lib test binary lists 79 tests. Use the stress harness in Task 2 unchanged: it is the harness that reproduced the race.

Interfaces in writer.rs that the executor needs, all already present:
- `enum Msg { Batches(Vec<TargetBatch>), Flush(SyncSender<()>), Tick(SyncSender<()>), #[cfg(test)] Hold(Receiver<()>) }` (lines 100-109)
- `#[cfg(test)] fn hold(&self) -> std::sync::mpsc::Sender<()>` (lines 175-181). The release side the tests drop.
- `fn barrier(&self, within, make)` (lines 219-238). This is the existing ack pattern: a `sync_channel(1)` ack sender inside the message, and the writer does `let _ = ack.try_send(())`. Mirror it.
- `WriterState::handle` (lines 302-322). The Hold arm is currently `Msg::Hold(rx) => while rx.recv().is_ok() {}`.
- `Logger { tx, dropped: Arc<AtomicU64>, .. }` and `const CHANNEL_CAPACITY: usize = 4096`. Both are private to the writer module and so visible from its child `tests` module.
- `test_support` provides `GENEROUS` (10 s), `game(app)`, `raw(text)`, `batch(target, rotate, entries)`, `path(home, parts)` and `read(p)` (empty string if missing).
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Make hold() a handshake, proven by a deterministic regression test (RED at HEAD, then GREEN)</name>
  <files>src-tauri/crates/gamelib-log/src/writer.rs</files>
  <behavior>
    - Test hold_returns_only_once_the_writer_is_parked goes in mod tests in writer.rs. It starts a Logger on a FakeHome and submits ONE game batch, `batch(game("480"), true, entries)`, where entries holds 20,000 distinct raw chunks such as `slow {i}\n`. It calls `let release = logger.hold();` and then, with no flush, asserts that `read(&path(&home, &["games", "480_steam", "launch.log"]))` has exactly 20,000 lines. That is everything sent before hold() is on disk when it returns
    - Same test, parked-ness: it makes exactly CHANNEL_CAPACITY `logger.log(Prefix::Backend, Level::Info, &format!("fill {i}"))` calls and asserts `logger.dropped.load(Ordering::Relaxed) == 0`. A full queue's worth fits, so the writer took the Hold off the queue and is consuming nothing. One more log call follows, then the assertion that dropped is 1
    - Same test, report: it drops release, asserts `logger.flush(GENEROUS)`, and reads gamelib.log. That file has exactly one match of `lines dropped (ingest full)` and contains `log writer: 1 lines dropped (ingest full)`
    - RED at HEAD: before hold() changes, this test must fail at the launch.log line-count assertion (0 or a partial count, not 20,000), because HEAD's hold() returns while the writer is still busy with the batch. If the line-count assertion passes at HEAD, raise the entry count (for example to 100,000) until it fails there. Never weaken an assertion to get a RED
    - GREEN: after the handshake, the test passes, and so do the four existing hold() users (five_thousand_log_calls_into_a_stalled_writer_never_block_and_are_counted, the_drop_report_counts_entries_not_messages, a_rotation_in_a_dropped_frame_is_applied_to_the_next_batch_for_that_target, a_dropped_general_batch_owes_no_rotation), with no edits to them
  </behavior>
  <action>
    Step 1 (RED). Add the test named in behavior to `mod tests` in src-tauri/crates/gamelib-log/src/writer.rs. Put it next to five_thousand_log_calls_into_a_stalled_writer_never_block_and_are_counted, and give it a short comment saying why it exists: hold() must not return before the writer is parked, or a burst races the Hold and the drop report splits in two. It uses `Ordering` from the existing `use super::*` (std::sync::atomic::Ordering is imported at the top of writer.rs) and the private `logger.dropped` field and `CHANNEL_CAPACITY` const, both visible from the child module. Run it against the unmodified hold(). Confirm it fails at the launch.log line-count assertion, and copy the failing assertion text into the SUMMARY as RED evidence. Do not commit a red tree. The RED evidence goes in the SUMMARY.

    Step 2 (GREEN). Make hold() a handshake. Every edit stays inside items that are already `#[cfg(test)]`:
    (a) Change the test-only variant `Hold(Receiver<()>)` to a struct variant `Hold { entered: SyncSender<()>, release: Receiver<()> }`, still `#[cfg(test)]`. Update its doc comment: the writer acks `entered` once it is inside the Hold arm, then parks until `release`'s sender is dropped.
    (b) In `Logger::hold()`, create the release pair with `std::sync::mpsc::channel()` as now. Create the ack pair with `sync_channel(1)`, mirroring `barrier()`. Send `Msg::Hold { entered, release }` with the existing blocking `self.tx.send`. Then block on the ack receiver with `recv_timeout(test_support::GENEROUS)` and panic with a clear message if it errors, for example via `.expect("log writer never took the hold")`. That one check covers both a timeout and a dead writer, whose Disconnected error arrives at once because the returned SendError drops the message and its ack sender. Return the release sender as before, so callers keep `let release = logger.hold(); ... drop(release);` unchanged. Update the doc comment: hold() returns only once the writer has handled every earlier message and is parked, and it panics if the writer does not take the hold within GENEROUS.
    (c) In `WriterState::handle`, the `#[cfg(test)]` arm becomes: destructure `Msg::Hold { entered, release }`, do `let _ = entered.try_send(());`, then keep the existing park loop over `release.recv()`. Leave the `self.report_drops(); self.close_windows();` prologue above the match untouched. With the handshake no drop can exist when the Hold is handled, so the prologue is a no-op for it, and production messages need the prologue exactly as it is.
    Do not touch `send`, `barrier`, `flush`, `tick_for_tests`, `run`, `start`, `report_drops`, any other existing test, or any file other than writer.rs. Do not add a `#[cfg(test)]` delay or hook to the writer's spawn path. The regression test reaches the racy timing with a large batch alone.

    Step 3. Run the new test and the whole `writer::tests` module green, then commit writer.rs alone, staged by explicit path, with a message like `fix(quick-261122-gzp): make the log writer's test-only hold() a handshake`.
  </action>
  <verify>
    <automated>test "$(grep -v '^[[:space:]]*//' src-tauri/crates/gamelib-log/src/writer.rs | grep -c 'fn hold_returns_only_once_the_writer_is_parked')" = 1 && test "$(grep -c 'entered' src-tauri/crates/gamelib-log/src/writer.rs)" -ge 3 && cd src-tauri && cargo test -p gamelib-log --lib -- --exact writer::tests::hold_returns_only_once_the_writer_is_parked && cargo test -p gamelib-log --lib -- writer::tests</automated>
    Gate baselines: test-name count [HEAD=0 EXPECT==1 @ab648b57d]; `entered` line count [HEAD=0 EXPECT>=3 @ab648b57d] (variant field, hold() construction, arm ack). Prettier is omitted because `--file-info` reports `inferredParser: null` for .rs (see context). Task 2 runs rustfmt.
  </verify>
  <done>The RED output at HEAD is recorded in the SUMMARY: the launch.log line-count assertion failed. The new test and all writer::tests pass. hold() blocks until the writer acks from inside the Hold arm and panics after GENEROUS without an ack. The only non-test-module diff lines sit inside the three already-#[cfg(test)] items. One commit contains writer.rs only.</done>
</task>

<task type="auto">
  <name>Task 2: Prove the race is gone under load and the crate gates are clean</name>
  <files>src-tauri/crates/gamelib-log/src/writer.rs (modified only if a gate below fails; otherwise this task writes nothing)</files>
  <action>
    Run the stress harness in verify, unchanged. It resolves the gamelib-log lib test binary with `cargo test --no-run --message-format=json` and jq, then runs the `writer::` tests 200 times, 8 binaries in parallel, each with `--test-threads=16`. The parallel copies are the CPU load. It takes about 60 s; on 2026-11-22, 80 runs took 23 s. At HEAD the same harness failed 1 of 80 and 2 of 120 runs, with both racy tests caught, so 200 clean runs together with Task 1's deterministic test are the evidence the race is gone. Record the FAILS count in the SUMMARY.
    If any run fails, do not raise run counts or loosen assertions to get green. Rerun with output captured instead (drop the `>/dev/null 2>&1` and grep for `panicked` and the `writer::` test names) to see which test failed. Fix the cause in writer.rs within the same #[cfg(test)] scope rules as Task 1, and re-run the full verify. A failure in a test that does not use hold() is a separate flake: record it in the SUMMARY and do not fix it here.
    Then run the crate gates: the full `cargo test -p gamelib-log` (lib plus the golden.rs and limiter_golden.rs integration tests), clippy with `-D warnings` over all targets, and `cargo fmt -p gamelib-log -- --check`. If rustfmt fails, run `cargo fmt -p gamelib-log` and amend nothing; commit the formatting as a follow-up `style(quick-261122-gzp)` commit staged by explicit path. Finally, run `graphify update .` from the repo root, as CLAUDE.md requires after a code change. Its output is graphify-out/, which is gitignored and never committed.
  </action>
  <verify>
    <automated>cd src-tauri && BIN=$(cargo test -p gamelib-log --lib --no-run --message-format=json 2>/dev/null | jq -r 'select(.reason=="compiler-artifact" and .profile.test==true and .target.name=="gamelib_log") | .executable') && test -x "$BIN" && FAILS=$(seq 1 200 | xargs -P 8 -I{} sh -c '"$0" writer:: --test-threads=16 -q >/dev/null 2>&1 || echo FAIL' "$BIN" | grep -c FAIL); echo "stress FAILS=$FAILS of 200"; test "$FAILS" = 0 && cargo test -p gamelib-log && cargo clippy -p gamelib-log --all-targets -- -D warnings && cargo fmt -p gamelib-log -- --check</automated>
    Gate baselines: stress FAILS per 80 runs [HEAD=1 EXPECT==0 @ab648b57d], measured 2026-11-22 (also 2 failing runs in 120, so about 3 are expected in 200 at HEAD; this gate needs 0 in 200). These two are regression guards that must hold before and after: clippy exit status [HEAD=0 EXPECT==0 @ab648b57d GUARD MUTATION: an unused `use` added to writer.rs fails clippy -D warnings], and rustfmt --check exit status [HEAD=0 EXPECT==0 @ab648b57d GUARD MUTATION: a mis-indented line in writer.rs fails cargo fmt --check]. Prettier is omitted because it has no parser for .rs (`--file-info` reports `inferredParser: null`). A prettier check over this path would error, not assure.
  </verify>
  <done>200 of 200 stressed runs of writer:: pass and the FAILS=0 line is in the SUMMARY. `cargo test -p gamelib-log`, clippy -D warnings and rustfmt --check are all green. `git status --short src-tauri/crates/gamelib-log` is clean after the commit(s). No file outside writer.rs was staged or committed by this task.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none | Test-only change. Every edited item is `#[cfg(test)]`, so it is compiled out of the shipped binary, and no input crosses a trust boundary. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261122-gzp-01 | Denial of Service | `Logger::hold()` test hook (writer.rs) | low | mitigate | The ack wait is bounded by `recv_timeout(test_support::GENEROUS)` and panics on timeout or disconnect, so a dead or wedged writer cannot hang the test suite. |
| T-261122-gzp-02 | Tampering | production log path (`send`, `handle` prologue, `report_drops`) | low | mitigate | The edits are confined to the three already-`#[cfg(test)]` items, the prologue and `send`/`barrier` are not touched, and clippy plus the full crate test suite (including the golden integration tests) gate the build. |
| T-261122-gzp-SC | Tampering | npm/pip/cargo installs | low | accept | No dependency is added or installed. `jq` (/usr/bin/jq) and cargo are already on the machine. |
</threat_model>

<verification>
- Task 1's verify: the new deterministic test fails at HEAD (RED, recorded) and passes after the handshake, and all writer::tests pass.
- Task 2's verify: 0 failures in 200 runs under parallel load against a HEAD baseline of about 1.25–1.7% failing runs. The full crate tests, clippy -D warnings and rustfmt --check are clean.
- Diff review: `git diff HEAD~1 -- src-tauri/crates/gamelib-log/src/writer.rs` (or the range across the task's commits) shows production-path edits only inside the `#[cfg(test)]` Msg::Hold variant, `Logger::hold` and the `#[cfg(test)]` Msg::Hold arm, plus the new test.
</verification>

<success_criteria>
- `Logger::hold()` cannot return before the writer thread is parked in the Hold arm, and fails loudly if it never gets there
- Both tests that flaked at HEAD report exactly one drop line in every run under load
- Production log-writer behaviour is unchanged
- Only src-tauri/crates/gamelib-log/src/writer.rs is committed
</success_criteria>

<output>
Create `.planning/quick/261122-gzp-fix-the-hold-test-race-in-writer-rs/261122-gzp-SUMMARY.md` when done. Include the RED assertion output from Task 1 and the stress FAILS line from Task 2.
</output>
