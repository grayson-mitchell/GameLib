---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
part: B (Tauri shell)
fixed_at: 2026-11-16
review_path: .planning/phases/80-steam-install-uninstall-and-update-polling-state-machines-in/80-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 3
skipped: 1
status: partial
---

# Phase 80: Code Review Fix Report, Part B (Tauri shell)

**Fixed at:** 2026-11-16
**Source review:** `.planning/phases/80-steam-install-uninstall-and-update-polling-state-machines-in/80-REVIEW.md` (Part B only)
**Iteration:** 1

**Summary:**

- Findings in scope: 4 (B-CR-01, B-WR-01 to B-WR-03; Info is out of scope)
- Fixed: 3 (B-CR-01, B-WR-02, B-WR-03)
- Skipped: 1 (B-WR-01). No shell code change was needed: Part A's crate fix covers it, B-WR-02 narrows what is left, and the rest belongs to Part C.

Verification at the final tree (worktree on `main` + these 3 commits):

- **Shell tests:** `cargo test --bin gamelib-shell` passes (477 passed, 2 ignored; 472 passed at the start).
- **Crate tests:** `cargo test -p gamelib-steampoll --features testing` passes.
- **Clippy:** the shell is not `-D warnings`-clean at baseline (about 23 pre-existing diagnostics). It is held by `meta/clippyRatchet.cjs`, which passes at the committed ceilings (darwin, toolchain 1.99.1), and no diagnostic points at `steampoll_dispatch.rs`. `cargo clippy -p gamelib-steampoll --all-targets --features testing -- -D warnings` is clean.
- **Formatting:**
  - The shell crate is not `cargo fmt --check`-clean at baseline either (25 files already differ).
  - I compared fmt hunk counts per file before and after. `steampoll_dispatch.rs` stays clean. `main.rs` drops from 24 hunks to 23, because the edited `timeout_for` line was one of them. No file gained a hunk.
  - The crate passes `cargo fmt --check`.
- **TS:** `npx prettier --check meta/genIpcContract.ts meta/__tests__/genIpcContract.test.ts` is clean. `genIpcContract.test.ts` (25) and `longRunningChannels.test.ts` (50) pass, and `pnpm check:ipc-contract` is up to date.
- **Pre-existing failures:** `tauriShellSource.test.ts` has 2 failures, and neither is in a file this part touched. They are a store-embed `.title(format!` pin and a Windows registry `?` pin.

## Fixed Issues

### B-CR-01: State events not acked after READY are never replayed

**Files modified:** `src-tauri/src/steampoll_dispatch.rs`, `src-tauri/src/main.rs`
**Commit:** a3285aaff
**Status:** fixed: requires human verification (delivery and timing logic; not live-tested)
**Applied fix:**

- **Retry loop:** `on_sidecar_ready_steampoll` now starts one detached `steampoll-outbox-retry` thread, which runs `run_outbox_retry_loop`.
  - It first does the READY replay (`outbox.mark_ready`).
  - Then, every `RETRY_FLUSH_INTERVAL_MS` (10 s), it calls `outbox.retry_pending(host)`.
  - It uses `block_on` on the steampoll runtime handle, from a non-runtime thread.
  - It relies on the crate for not-ready, idle and overlap handling, as the Part A report says it can.
- **Exit:** the thread waits in `recv_timeout` on a channel whose sender sits in `RETRY_STOP`.
  - `steampoll_exit_shutdown` takes and drops that sender first, so the loop ends and starts no new replay during shutdown.
  - Nothing joins the thread, so it cannot hold up quit.
  - A replay already in flight at exit is not waited for. Its writes to a closed pipe fail as not acked.
  - The steampoll runtime is a never-dropped static, so it holds up nothing at exit either.
- **Repeat READY:** `RETRY_STOP` also stops a second READY from starting a second loop. A repeat READY only replays once more.
- **Boot `try_state` race:** a new `STEAMPOLL_SIDECAR: OnceLock<Arc<SidecarState>>` is set by `set_steampoll_sidecar_state(&state)` in `spawn_sidecar_state`, before `start_reader`. `ShellPollHost::state_event` reads it first and keeps `try_state` as a fallback. The 10 s retry would also heal a failed boot replay.
- **Tests:** two new tests.
  - An event refused at the READY replay and at the first retry is delivered by a later retry. Idle ticks send nothing, and dropping the sender ends the loop within 1 s.
  - After `mark_not_ready`, the loop keeps running but sends nothing, and the event stays queued.
- **Why this is not a tokio task:** the shell crate has no direct `tokio` dependency, and a std thread with a channel gives an immediate stop. I did not add a dependency.
- **Not covered by a test:** the OnceLock ordering. `SidecarState` needs a real `Child`, so it cannot be built in a unit test.

### B-WR-02: Two equal 5 s timeouts orphan the blocking invoke

**Files modified:** `src-tauri/src/steampoll_dispatch.rs`, `src-tauri/src/shell_state.rs`, `src-tauri/src/main.rs`
**Commit:** c65ec88bd
**Status:** fixed: requires human verification (timer relationship)
**Applied fix:**

- **New bound:** `STATE_EVENT_INVOKE_BOUND = ACK_TIMEOUT_MS - 500 ms` (4.5 s).
- **Deadline:** `ShellPollHost::state_event` captures `deadline = now + bound` in its synchronous body. That is before the crate's `send_with_timeout` builds its 5 s timer around the returned future, so the shell deadline is always at least 500 ms before the crate's.
- **No stale write:** inside `spawn_blocking`, `invoke_bound_before(deadline, now)` returns `None` once the deadline has passed. The closure then returns `Err("steamPollStateEvent:stale")` and writes no frame. That covers a closure stuck behind the 8-thread blocking pool after the crate has re-queued the event.
- **Bounded wait:** otherwise the closure calls the new `SidecarState::invoke_bounded(channel, args, Some(time_left))`. `invoke` now delegates to it with `timeout_for`. The invoke therefore settles before the crate gives up, and an ack that arrives within 4.5 s is no longer thrown away.
- **Plain-invoke bound and comment:** `timeout_for("steamPollStateEvent")` now returns the same 4.5 s bound. The inaccurate main.rs comment is rewritten.
- **Tests:**
  - The existing `timeout_for` assertion is updated to 4.5 s and now also asserts that the bound is below `ACK_TIMEOUT_MS`.
  - New: the bound keeps a margin of at least 500 ms, and a closure that starts at or after the deadline gets `None` (no write).
- **What is left:** a frame written shortly before the deadline and answered after it is still in flight when the crate gives up. The sidecar may apply it after a newer event. Only the TS seq guard (C-IN-04) closes that.

### B-WR-03: Shell contract for `steampoll_read_running_app_id` rejects `[]`

**Files modified:** `meta/genIpcContract.ts`, `meta/__tests__/genIpcContract.test.ts`, `src-tauri/src/ipc_contract.rs` (regenerated), `src-tauri/src/steampoll_dispatch.rs` (test), `src-tauri/crates/gamelib-steampoll/src/dispatch.rs`, `src-tauri/crates/gamelib-steampoll/tests/dispatch.rs`
**Commit:** 66c3ca42f
**Applied fix:**

- **Generator:** in `renderArgsStruct`, a single-object tuple whose object is optional (`minItems` absent, i.e. 0) now emits a `from_args` that treats `[]` and `[null]` as the empty object:
  ```rust
  let first = args.first().filter(|v| !v.is_null()).cloned().unwrap_or_else(|| Value::Object(serde_json::Map::new()));
  serde_json::from_value(first).map_err(|_| "steampoll_read_running_app_id:bad-args".to_string())
  ```
  Required-object tuples are unchanged. On regenerate, only `SteampollReadRunningAppIdArgs` changes.
- **TS touched, and why:** `ipc_contract.rs` is generated, and `pnpm check:ipc-contract` fails CI on a hand edit. So the generator (TS, in `meta/`) had to change. No sidecar or `src/` TS was touched.
- **Crate touched, and why:** the reviewer asked for this too. `steampoll_read_running_app_id` dispatch now matches `None | Some(Value::Null)` as the default. Without that, the shell would accept `[null]` and the crate would still answer `bad-args`.
- **Tests:**
  - A generator test covers the optional form and checks that the required form still uses `ok_or_else`.
  - A shell test covers `[]`, `[null]` and `{strict:true}`, and that `"x"` is still `bad-args`.
  - The crate dispatch test now also covers `[null]`, which answers `0`.

## Skipped Issues

### B-WR-01: READY replay races live transitions

**File:** `src-tauri/src/steampoll_dispatch.rs:160-171`, `:282`
**Reason:** No shell code change needed. The finding is covered by the crate (A-WR-08, `777db1416`) and narrowed by B-WR-02. What is left belongs to Part C (C-IN-04).

- **Queued vs live:** the crate now drops queued install-state events superseded by an applied live one (`note_applied`). The replay re-checks each entry before sending it, so the reviewer's case of a queued seq 5 `installed` arriving after a live seq 9 `uninstalled` can no longer be sent from the queue.
- **Late blocking write:** B-WR-02 removed the path where the shell wrote a frame after the crate had given up.
- **Holding live sends behind the replay:** this would need `apply_effects` to keep enqueuing while a flush runs. That is crate logic, not shell logic, and the Part A report calls it optional now. I did not change it. `SIDECAR_READY` being set before `outbox.mark_ready` is harmless, because the crate gates live sends on `outbox.is_ready()`, not on the shell flag.
- **What is left:** a replayed or live event already on the wire when a newer one for the same app is applied first. Only the sidecar seq guard closes that.

**Original issue:** `on_sidecar_ready_steampoll` set ready, then `mark_ready` replayed a snapshot while live transitions were sent straight away. A stale queued `installed` could land after a newer `uninstalled` for a different kind of the same app, because the TS handler has no seq guard.

## Notes for Part C

- **C-IN-04 (seq guard, still required):**
  - **Remaining windows:** after Parts A and B, the windows left are (a) an event in flight at the 4.5 s shell deadline that the sidecar applies late, and (b) a replayed and a live event for the same app crossing on the wire.
  - **Guard scope:** keep one last-applied seq per appId for `installed` / `uninstalled` / `installIncomplete` (match `outbox::is_install_state_kind`), and one per (appId, kind) for the other kinds.
  - **Old events:** answer `{ applied: true }` without changing anything when the seq is not newer. That way the crate's `note_applied` drops the entry instead of retrying it.
  - **Session state only:** seq restarts at 1 every app launch, so the guard must be per-process state and never persisted.
- **C-WR-08 (rejected events now retried every 10 s):**
  - **Why it is noisy now:** with the B-CR-01 loop live, every event the sidecar rejects is re-sent every 10 s for the rest of the session. That covers a zod failure (for example a `sizeOnDisk` shape mismatch) and an `applied: false` reply. Each re-send costs one invoke frame plus one crate log line. It is bounded per (appId, kind), and per appId for the install-state group, but it is noisy.
  - **Preferred fix:** relax the zod schema to match what Rust actually emits, so these events stop failing.
  - **For a deliberately refused event:** answer `applied: true` (consumed) rather than `false`, so it is not retried forever.
  - **Retry cap:** if a cap is still wanted, it belongs in the crate outbox (per-event attempt count). The shell loop has no per-event view.
- **New shell error string:** `steamPollStateEvent:stale` is returned inside the shell only and never reaches TS. The sidecar sees no new frame shape.

## Other notes

- **Worktree:** the work was done in an isolated worktree on branch `gsd-reviewfix/80-22782` and fast-forwarded onto `main`. `build/` entries were symlinked and the sidecar binary copied from the main checkout, only to satisfy tauri-build's resource checks. Nothing in them was committed.
- **graphify:** I did not run `graphify update .`, so the graph does not reflect these three commits yet.

---

_Fixed: 2026-11-16_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
