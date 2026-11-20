---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
part: B (Tauri shell)
fixed_at: 2026-11-16
review_path: .planning/phases/80-steam-install-uninstall-and-update-polling-state-machines-in/80-REVIEW.md
iteration: 2
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 80: Code Review Fix Report, Part B (Tauri shell), iteration 2

**Fixed at:** 2026-11-16
**Source review:** .planning/phases/80-steam-install-uninstall-and-update-polling-state-machines-in/80-REVIEW.md (Part B, re-review)
**Iteration:** 2

**Summary:**
- Findings in scope: 2 (B-WR-01, B-WR-02)
- Fixed: 2
- Skipped: 0
- B-IN-04 (Info) is also covered by the B-WR-01 fix, through a 250 ms minimum margin.
- No crate files were touched. Parts A and C were left to their own fixers.

## Fixed Issues

### B-WR-01: The deadline is checked before the stdin write, not after, so a blocked write can still write late and outlive the crate's ack timer

**Files modified:** `src-tauri/src/shell_state.rs`, `src-tauri/src/steampoll_dispatch.rs`, `src-tauri/src/main.rs` (comment only)
**Commit:** 9af1a4394
**Status:** fixed: requires human verification (timing logic)

**Applied fix:**
- **`SidecarState::invoke_until(channel, args, deadline, min_left)`** does four things in order:
  1. A cheap pre-check.
  2. Takes the stdin lock, then re-checks the deadline. If time has run out, it does not write the frame, removes the pending entry and returns `"<channel>:stale"`. The id is not recorded as abandoned, because the frame was never sent.
  3. Writes the frame under that same lock.
  4. Waits for the reply with `recv_timeout(deadline - now)`, measured after the write.
- **Minimum margin.** If `min_left` or less remains, that counts as no time. The poll host passes `STATE_EVENT_MIN_WRITE_LEFT` = 250 ms, which also covers B-IN-04.
- **`invoke_bounded` removed.** Its only other caller was `invoke`, which now does the write itself. Both paths share a new `await_reply`, so the timeout and sidecar-closed arms each exist once. This keeps the counted TS source pins green (`abandonedInvokeAttribution.test.ts`, `shellDiagPersistence.test.ts`).
- **New helpers.** `write_line` is the newline-framed write done under a guard the caller already holds. `time_left_to_write` is a pure helper.
- **`ShellPollHost::state_event`** now calls `invoke_until`. `invoke_bound_before` is gone.
- **Documented residual.** A blocking `write_all` into a full pipe still cannot be bounded, so the frame can land late. The TS per-appId seq guard (C-IN-04) covers that case. This is stated in the `invoke_until` doc comment.
- **Tests:**
  - `a_closure_started_after_the_deadline_does_not_write` was rewritten against `time_left_to_write` and now includes the 1 ms and exactly-at-floor cases.
  - New `invoke_until_rechecks_the_deadline_under_the_stdin_lock` checks the order in the source. `SidecarState` needs a real child process, so it cannot be built in a unit test. The test asserts this order: lock, re-check, write, `left` computed, `await_reply(Some(left))`.

### B-WR-02: If the retry thread fails to spawn, the READY replay never runs and the outbox is never marked ready

**Files modified:** `src-tauri/src/steampoll_dispatch.rs`
**Commit:** 1ee6107a0
**Status:** fixed

**Applied fix:**
- `on_sidecar_ready_steampoll` now calls `start_outbox_retry(&RETRY_STOP, outbox, host, period, spawn)`. The thread spawner is passed in.
- **On spawn failure:**
  1. Logs the failure.
  2. Clears the slot, so a later READY can try again.
  3. Runs `mark_ready` on the steampoll runtime (`replay_on_runtime`).
- **Already-running loop:** unchanged. It replays once more on the runtime.
- **New test:** `a_failed_retry_thread_spawn_still_replays_and_frees_the_slot` gives the function a spawner that fails. It asserts three things:
  - the queued event is delivered;
  - the outbox reports `is_ready()`;
  - the slot is `None`.
  A second call with a working spawner then starts the loop.
- **Exit:** the thread stays detached and unjoined. The exit path is unchanged: `steampoll_exit_shutdown` drops the sender first.

## Verification

- `cargo test --bin gamelib-shell` passes: 483 tests, 0 failed, 2 ignored. It was run on the rebased branch.
- `node meta/clippyRatchet.cjs` with toolchain 1.99.1 (`--workspace --all-targets`) reports `PASS (darwin, toolchain 1.99.1)` after each fix. No warnings in `steampoll_dispatch.rs`. The only `shell_state.rs` warning is the existing `type_complexity` on the `pending` field (line 14).
- `cargo fmt --check` found no new hunks in the changed files. The whole crate went from 181 "Diff in" hunks to 180: a stray blank line at the end of `shell_state.rs` went away as a side effect.
- Jest on `abandonedInvokeAttribution.test.ts` and `shellDiagPersistence.test.ts` passes (26/26).
- `sidecarShutdownFlagSource.test.ts` fails 4 tests. They fail the same way on the base commit without these changes, so they predate this pass. They concern the `start_reader`/`surface_dead_sidecar` slices that the phase-79 work moved. Not touched.

---

_Fixed: 2026-11-16_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
