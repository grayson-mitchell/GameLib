---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
part: A (Rust crates)
fixed_at: 2026-11-16
review_path: .planning/phases/80-steam-install-uninstall-and-update-polling-state-machines-in/80-REVIEW.md
iteration: 1
findings_in_scope: 10
fixed: 10
skipped: 0
status: all_fixed
---

# Phase 80: Code Review Fix Report, Part A (Rust crates)

**Fixed at:** 2026-11-16
**Source review:** `.planning/phases/80-steam-install-uninstall-and-update-polling-state-machines-in/80-REVIEW.md` (Part A only)
**Iteration:** 1

**Summary:**

- Findings in scope: 10 (A-CR-01, A-WR-01 to A-WR-09; Info is out of scope)
- Fixed: 10
- Skipped: 0

Every fix comes with a regression test. Where the test could build against the old code, it was run there first and failed: CR-01, WR-03, WR-04, WR-05, WR-06, WR-07. Verification at the final tree:

- `cargo test` passes for `gamelib-steampoll` (with `--features testing`), `gamelib-steampoll-cli` and `gamelib-steamfiles`.
- `cargo clippy --all-targets -D warnings` is clean on all three crates.
- `cargo fmt --check` is clean.

I did not touch any TS, so there was nothing to run prettier on. The shell crate (`src-tauri/src`) was not rebuilt. Every crate API change is additive: `Registry::register`, `Outbox::mark_ready`/`mark_not_ready` and `read_acf_state` keep their signatures.

## Fixed Issues

### A-CR-01: `remove_copy` recovers `steamapps` from the installdir-derived path

**Files modified:** `src-tauri/crates/gamelib-steampoll/src/acf_state.rs`, `src-tauri/crates/gamelib-steampoll/src/acf_copies.rs`, `src-tauri/crates/gamelib-steampoll/tests/acf_copies_security.rs`
**Commit:** 5336c1daa
**Applied fix:**

- **New reader:** `read_acf_state_located` returns an `AcfLocation`: the steamapps dir the manifest was actually read from, plus the raw `installdir`. `read_acf_state` wraps it. The serialized `AcfState` wire shape is unchanged.
- **Pinned root:** `remove_copy` now takes the library root from that location, so the guard and the conflict scan always run against the manifest's own library.
- **Refused installdirs:** an absolute, rooted or drive-prefixed `installdir`, or one with a `.`/`..` segment, is refused before any path join.
- **Cleanup:** the lexical `normalize` helper was removed.
- **Tests:** two security tests put the victim at `<tmp>/other/steamapps/common/Victim`, reached once through `../../../other/...` and once through an absolute installdir. Both failed on the old code.

### A-WR-01: A multi-segment `installdir` deletes its first segment

**Files modified:** `src-tauri/crates/gamelib-steampoll/src/acf_copies.rs`, `src-tauri/crates/gamelib-steampoll/tests/acf_copies_security.rs`
**Commit:** 10ca4484f
**Applied fix:**

- **Single-folder rule:** `installdir_shape` sorts an installdir into exactly one plain segment (allowed), nested (refused, reason "installdir is not a single folder", disk untouched) or escaping.
- **All OSes:** `\`, `:` and NUL are refused everywhere.
- **Conflict scan:** it now compares the full single segment with like.
- **Tests:** `Studio/GameA` next to `Studio/GameB` leaves both intact. A separate test covers backslash and drive-letter installdirs.

### A-WR-02: The conflict check is case-sensitive

**Files modified:** `src-tauri/crates/gamelib-steampoll/src/acf_copies.rs`, `src-tauri/crates/gamelib-steampoll/tests/acf_copies.rs`
**Commit:** c5ecbf8c4
**Applied fix:**

- **Comparison:** on macOS and Windows, `same_installdir` compares with Unicode `to_lowercase`. Linux stays exact, because Linux filesystems and Wine bottles on them are case-sensitive.
- **Over-reporting:** a false match only downgrades the removal to manifest-only, which is the safe direction.
- **Test:** platform-aware.

### A-WR-03: `HoldStore` read-modify-write has no lock and a shared temp name

**Files modified:** `src-tauri/crates/gamelib-steampoll/src/hold.rs`, `src-tauri/crates/gamelib-steampoll/tests/hold.rs`
**Commit:** ce7406574
**Applied fix:**

- **Lock:** a process-wide `static STORE_LOCK: Mutex<()>` is held from load to rename in `record_value` and `clear`. It is static, so it also covers `rearm.rs`'s separate instance of the same file.
- **Temp name:** each write now uses `<path>.tmp-<pid>-<counter>`.
- **Test:** 16 threads on separate instances record and clear for 4 rounds each. It lost records without the fix, and it also checks that no temp files are left behind.

### A-WR-04: Hold-probe copy-back overwrites a hold released during the probe

**Files modified:** `src-tauri/crates/gamelib-steampoll/src/install_loop.rs`, `src-tauri/crates/gamelib-steampoll/tests/install_loop.rs`
**Commit:** f157c11a0
**Applied fix:**

- **Check:** the loop snapshots `steam_hold` with the clone. If the slot's `steam_hold` differs after `should_hold` returns, it discards the probe outcome (including any `WriteHoldRecord`) and returns `true`, so the next tick decides.
- **Why it is safe:** the first `install_step` only asked for the probe and changed nothing.
- **Test:** a 10 s `SlowSteamRunner` with an adoption at 5 s. It re-persisted the record without the fix.

### A-WR-05: Source retarget during the hold probe is not re-checked

**Files modified:** `src-tauri/crates/gamelib-steampoll/src/install_loop.rs`, `src-tauri/crates/gamelib-steampoll/tests/install_loop.rs`
**Commit:** 0faa40730
**Applied fix:**

- **Guard:** the `slot.poll.source != snap.source` check is now repeated in the second critical section.
- **Test:** the slow probe reports Steam not running, and a retarget to the empty bottle root lands at 5 s. Without the fix, the native root's install was reported with `source: "bottle"`.

### A-WR-06: `start_uninstall` is check-then-register (TOCTOU)

**Files modified:** `src-tauri/crates/gamelib-steampoll/src/registry.rs`, `src-tauri/crates/gamelib-steampoll/src/uninstall.rs`, `src-tauri/crates/gamelib-steampoll/tests/install_loop.rs`
**Commit:** 60e036b2f
**Applied fix:**

- **New method:** `Registry::try_register` checks and inserts under one lock. `register` shares the insert helper.
- **Callers:** `start_uninstall` uses `try_register`. `RunningPoll::start` deliberately does not, because during stop → start the old guard is still registered, so it would refuse to start. WR-07 covers that path instead.
- **Test:** 8 threads × 20 rounds behind a barrier. Without the fix it started 2 polls.

### A-WR-07: `RunningPoll` stop → start race lets a dying task clear `started`

**Files modified:** `src-tauri/crates/gamelib-steampoll/src/running.rs`, `src-tauri/crates/gamelib-steampoll/tests/running.rs`
**Commit:** 2d5c07637
**Applied fix:**

- **Generation:** `State.gen` is bumped by every `start` and `stop`. The task clears `started` on exit only while its own generation is current.
- **Test:** start → stop → start → start. Without the fix it probed twice per tick (duplicate pollers).

### A-WR-08: Unacked events replay only on `mark_ready`; replay can reorder across kinds

**Files modified:** `src-tauri/crates/gamelib-steampoll/src/outbox.rs`, `src-tauri/crates/gamelib-steampoll/tests/outbox.rs`
**Commit:** 777db1416
**Status:** fixed: requires human verification (ordering logic)
**Applied fix:**

- **Install-state group:** `installed`, `uninstalled` and `installIncomplete` each write an app's whole install state, so they now supersede each other per appId.
  - **`updateDone` stays out of the group,** although the reviewer listed it. Its handler only invalidates the update state and re-pushes the entry; it writes no install state. Superseding an `installed` with it would lose the install-path write.
  - **`note_applied(ev)`:** runs on every applied ack, live or replayed. It records the highest applied install-state seq per appId (bounded to 4096 appIds) and drops older queued install-state events for that appId.
  - **`enqueue`:** keeps only the newest install-state event per appId. It refuses an event older than one already applied, for example an ack that timed out after a newer event was applied.
- **Replay:** ascending seq across all kinds. Before sending, it re-checks that each entry is still the queued one, and it stops if the sidecar goes not-ready. A `flushing` guard stops `mark_ready` and the retry from interleaving.
- **Hook for the shell's in-session retry:** `Outbox::retry_pending(host) -> usize` flushes when the sidecar is ready and something is queued, returns how many are still queued, and costs almost nothing when idle. `pub const RETRY_FLUSH_INTERVAL_MS = 10_000` is the suggested period. The crate owns no timer.
- **Other public additions:** `Outbox::queued()` and `outbox::is_install_state_kind`.
- **Tests:** four new outbox tests:
  - the reviewer's seq 5 `installed` / seq 9 `uninstalled` case
  - an older event failing after a newer one was applied
  - per-app queue dedupe across kinds
  - in-session retry while ready, and no send while not ready

### A-WR-09: A dead download monitor is never restarted

**Files modified:** `src-tauri/crates/gamelib-steampoll/src/monitor.rs`, `src-tauri/crates/gamelib-steampoll/src/install_loop.rs`, `src-tauri/crates/gamelib-steampoll/tests/monitor.rs`, `src-tauri/crates/gamelib-steampoll/tests/install_loop.rs`
**Commit:** a7ccdffd1
**Applied fix:**

- **Replace on start:** `DownloadMonitor::start` now kills and replaces a `failed` entry instead of returning. A live entry still makes it a no-op.
- **New method:** `DownloadMonitor::is_live(app_id)`.
- **Throttled restart:** every 5 ticks (15 s), an install poll that is still `live_monitor_eligible` restarts a monitor that is not live. That covers a child killed by a Steam restart and a monitor that never found Steam. The throttle bounds the pgrep cost while Steam is down.
- **Tests:** a monitor test (dead child replaced, live readings return, no doubling) and a loop test (exactly one retry per 5 ticks).
- **Not verified live:** the real Steam-restart path on macOS still needs a live check.

## Cross-part notes for Parts B and C (event-delivery theme)

What the crate now provides, and what each later part still needs to do:

- **B-CR-01 (shell flush while running):** the crate has no timer. After `mark_ready`, the shell should loop on `tokio::time::interval(Duration::from_millis(gamelib_steampoll::outbox::RETRY_FLUSH_INTERVAL_MS))` and call `outbox.retry_pending(host.as_ref()).await`. The call is cheap when nothing is queued and does nothing while not ready. It never overlaps a `mark_ready` replay, so B does not need its own guard. The `try_state` boot race (READY read before `app.manage`) is still the shell's to fix. `retry_pending` makes it self-healing once that is fixed, because the first failed replay is retried on the next tick.
- **B-WR-01 (READY replay races live sends):** the crate now closes the queued-vs-live case. An applied live `uninstalled` drops the queued older `installed`, and the replay skips anything superseded mid-flush. The remaining window is an event already in flight when a newer one overtakes it, and only the sidecar seq guard closes that (C-IN-04). Holding live sends behind the replay is optional now.
- **B-WR-02 (double 5 s timeout, late blocking write):** not addressed in the crate and out of Part A's scope. A late write of an event the crate has given up on can still land after a newer one. Because `enqueue` refuses an event older than an applied one, the stale event is at least not replayed again. The sidecar seq guard is the real fix.
- **C-IN-04 (TS seq guard):** still needed. Keep one last-applied seq per appId for the install-state group (`installed` / `uninstalled` / `installIncomplete`, matching `outbox::is_install_state_kind`), and per (appId, kind) for the other kinds. Answer `applied: true` without mutating when the incoming seq is not newer. Seq is monotonic per shell process and restarts at 1 after an app restart, so the guard must be per-process session state, never persisted.
- **C-WR-08 (zod stricter than Rust; rejected events):** with `retry_pending`, an event the sidecar rejects (fails zod, or returns `applied: false`) is re-sent every 10 s for the rest of the session. It is bounded per (appId, kind) and per appId for the state group, but it is noisy. C should relax `sizeOnDisk` so these events stop being rejected. Alternatively, the shell could cap retries per event; the crate does not cap them today.

---

_Fixed: 2026-11-16_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
