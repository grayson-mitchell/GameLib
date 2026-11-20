---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
reviewed: 2026-11-16
depth: standard
status: issues_found
iteration: 2
files_reviewed: 109
findings:
  critical: 0
  warning: 5
  info: 14
  total: 19
---

# Phase 80 Code Review (re-review after fix pass)

Re-review after the 27 `fix(80):` commits that followed the first review (b7dbc199e, 37 findings; fix reports 80-REVIEW-FIX-A/B/C.md). Split three ways as before: A = Rust crates (43 files), B = Tauri shell (8), C = TS backend + meta + .github (58). Each part verifies the prior findings, checks the fix commits for regressions (`git diff b7dbc199e..HEAD`), and re-reviews its scope by the phase diff (base b1f3f4a05^). Finding IDs are local to each part (A-WR-01 etc.).

## Orchestrator triage

- **Prior Criticals both fixed** (A-CR-01, B-CR-01). Of the prior Warnings: fixed except A-WR-01, A-WR-07, B-WR-02, C-WR-06 (partial — their gaps are the new Warnings below) and C-WR-09 (skipped, design decision, still open).
- **A-WR-01 is the priority — data-loss risk:** the installdir conflict scan compares the cleaned target against the *other* manifests' raw installdirs, so a co-installed `Studio/GameB` / `Studio/` / `.\Studio` is not seen and `remove_dir_all(common/Studio)` deletes it.
- **Same bug, unreviewed path:** TS `uninstallBottleGameDirectly` (`gameUninstall.ts:768-797`) still deletes the first installdir segment — the original A-WR-01 on the bottle path. Not counted (noted by Part A).
- **New Warnings:** A-WR-02 stop/start race leaves an uncancellable poller; B-WR-01 the 4.5 s deadline is not re-checked after the stdin lock / wait not sized from it; B-WR-02 retry-thread spawn failure leaves the outbox not-ready for the session; C-WR-01 a late win32 `launching` can overwrite `playing` or outlive the watch (regression from C-WR-06).
- **Retry noise theme (Info):** A-IN-01 unbounded log growth while hung, C-IN-04 poison events re-sent every 10 s uncapped.

## Part A — Rust crates


### Phase 80 (Part A, Rust crates): Code Review Report, re-review after the fix pass

**Reviewed:** 2026-11-16
**Depth:** standard. I read the fix diff `b7dbc199e..HEAD` in full for the steampoll crate, including the Part B and Part C additions (`start_install_reporting`, `refresh_bridge_finalized`, `apply_effects_with`, dispatch `[null]`). Large pre-existing files were read by their phase diff from `b1f3f4a05^`.
**Files Reviewed:** 43
**Status:** issues_found

## Summary

The fix pass is solid. CR-01 is closed: the library root now comes from the directory the manifest was actually read from, and an absolute, drive-prefixed, `.`/`..` or nested `installdir` is refused before any join. WR-03 to WR-06, WR-08 and WR-09 are fixed correctly, and I found no regression in them.

Two prior findings are only partly fixed:

- **WR-01 (now WR-01 below):** only the manifest being removed is validated. The conflict scan still compares that clean segment against the *other* manifests' raw `installdir` values, so a co-installed `Studio/GameB` next to a single-segment `Studio` still has its files deleted.
- **WR-07 (now WR-02 below):** the generation counter closes the dying-task case. A concurrent `stop()` that lands between `start()`'s state unlock and its `registry.register` still leaves an uncancellable poller, and a later `start()` adds a second one.

No legitimate Steam installdir should be refused. Steam installdirs are a single folder name, and `:` and `\` cannot appear in a Windows folder name, so no shipping depot uses them. A refusal fails safe: the result is `Refused` and the disk is untouched.

## Verification of the prior Part A findings

### CR-01: fixed

- `read_acf_state_located` returns the `steamapps_dir` that `find_acf` matched. `remove_copy` builds `common/<segment>`, the manifest path, the guard input and the conflict-scan dir from it alone.
- `installdir_shape` refuses `\`, `:` and NUL on every OS. It also refuses `is_absolute()`/`has_root()` paths and any non-`Normal` component (`.`, `..`, prefix). Those checks cover `/abs`, `C:\x`, `C:x`, `\\server\x` and `..\..`.
- The guard is no longer tautological, because `steamapps_dir` cannot be steered by manifest content. The two new security tests put a victim under a real `other/steamapps/common` and would have failed on the old derivation.
- `AcfState::Installed.install_path` is still `join(dir, "common", installdir)`. That is only reported to the sidecar, and no Rust delete path consumes it any more. The only `remove_dir_all` in the crate is in `remove_copy`.

### WR-01: partly fixed (see the new WR-01)

The manifest being removed is now refused when nested. The other side of the comparison was not normalized.

### WR-02: fixed

`same_installdir` folds case on macOS and Windows and stays exact on Linux, which is correct for ext4-hosted Wine prefixes. There is a small residual in Unicode normalization, covered in IN-04.

### WR-03: fixed

- `STORE_LOCK` is held across load → rename in both `record_value` and `clear`. Because it is static, it also covers `rearm.rs`'s second `HoldStore`.
- I grepped `src/` for other writers of the store. Nothing outside the crate writes it (only a test names it), so a process-wide lock is enough.
- Lock order is `polls` → `STORE_LOCK` (via `upgrade` → `hold.clear`). Nothing takes them in reverse, so there is no deadlock.
- Temp names are unique per write.

### WR-04: fixed

`hold_before` is snapshotted with the clone, and the copy-back is dropped when the slot's `steam_hold` moved. That covers the adoption release, `Unprobed`/`Holding` → `Released`.

The claim that "the first step changed nothing" holds. `installed()` returns the probe request before touching `poll` (install_once.rs:487-497), and `downloading()` never asks for a probe.

The early return also cannot lose a `pending_outcome`. A probe only happens on the non-update path, and `pending_outcome` is only ever set by the update path.

### WR-05: fixed

The `source` re-check now sits in the second critical section, after the WR-04 check.

### WR-06: fixed

`try_register` checks and inserts under one map lock, and `start_uninstall` uses it. The semantics are unchanged from `is_active`: a cancelled-but-still-draining poll still blocks a restart, as before.

### WR-07: partly fixed (see the new WR-02)

### WR-08: fixed (crate side)

- `note_applied` runs on every applied ack, live or replayed, and drops older queued events in the install-state group.
- `enqueue` refuses an event older than an applied or queued one in the group.
- `flush` replays in ascending seq, re-checks each entry is still queued, and stops when the sidecar is not ready. The `flushing` guard is reset by `Drop`, so a dropped future cannot wedge it.

The `updateDone` exclusion is sound. Its handler (`steamPollEventRegistration.ts`) only invalidates the update state and re-pushes the existing entry; it writes no install fields. Superseding an `installed` with it would lose the install-path write.

The only cross-kind residual is narrow. An older unacked `installed` replayed after a newer applied `updateDone` re-writes the `installed` buildid, which can be older than the post-update build. This needs an `installed` ack to fail and an update to finish inside one 10 s retry window, so I have not raised it as a finding.

The Part C seq guard (`steamPollEventRegistration.ts`) uses the same group, and stale events are answered `applied: true`, so the crate drops them instead of retrying.

### WR-09: fixed (not live-verified, as the fix report says)

`start()` replaces a `failed` entry after `kill_monitor`. `is_live` is false for a missing or failed entry, and the loop restarts at most once every 5 ticks, and only while the poll is `live_monitor_eligible`.

A monitor that is still looking up the Steam pid counts as live, so it is not doubled. The no-pid path removes the entry, so the next throttled tick retries.

### Fixes from Parts B and C inside this crate

All three look correct:

- **`start_install_reporting`** reads `awaiting_update` under the same `polls` lock as the start or upgrade.
- **`refresh_bridge_finalized`** only rewrites an installer-owned `Installed` continuation, and the read has no await before `resolve`.
- **Dispatch** now accepts `[null]`.

## Warnings

### WR-01: The conflict scan compares the validated segment against other manifests' raw `installdir`, so a nested or trailing-separator co-install is still deleted

**File:** `src-tauri/crates/gamelib-steampoll/src/acf_copies.rs:99-107` (the caller is at 341-361)
**Issue:** `remove_copy` now requires its own `installdir` to be one segment, say `Studio`. `find_other_manifests_with_installdir` then compares `"Studio"` against each other manifest's raw `installdir`.

Some co-installed manifests name the same directory and still compare unequal:

- `Studio/GameB` (nested)
- `Studio/` (trailing separator)
- `.\Studio`
- on Windows, `Studio.` or `Studio ` (Win32 strips a trailing dot or space)

Each of these is reported as "no conflict", and `remove_dir_all(common/Studio)` deletes the other app's files. This is the original WR-01 data-loss shape with the two roles swapped. The fix report says the scan now "compares like with like", but only one side was normalized, and no test covers it: `refuses_nested_installdir_and_keeps_shared_parent` only nests the manifest being removed.

**Fix:** Normalize the other side to its first component before comparing. Count anything that cannot be parsed as a conflict, because that only downgrades the removal to manifest-only:

```rust
/// First plain segment of another manifest's installdir; None = treat as a conflict.
fn first_segment(d: &str) -> Option<String> {
    let seg = d.split(['/', '\\']).find(|s| !s.is_empty() && *s != ".")?;
    if seg == ".." || seg.contains(':') { return None; }
    #[cfg(windows)]
    let seg = seg.trim_end_matches(['.', ' ']);
    Some(seg.to_string())
}
// in the scan:
let Some(d) = rec.record.installdir.as_deref() else { continue };
match first_segment(d) {
    Some(s) if !same_installdir(&s, installdir_segment) => continue,
    _ => {} // same dir, or unparseable: conflict
}
```

Add a security test with `put(&sa, "10", "Studio")` next to `put(&sa, "11", "Studio/GameB")`, asserting that `common/Studio/GameB` survives.

### WR-02: `RunningPoll::start` still races a concurrent `stop`, leaving an uncancellable poller (WR-07 residual)

**File:** `src-tauri/crates/gamelib-steampoll/src/running.rs:191-229`
**Issue:** `start()` sets `started = true` and bumps `gen` under the state lock. It then releases the lock, and only afterwards calls `registry.register(PollKind::Running, POLL_KEY)` (line 201). If `stop()` runs from another dispatch thread in that window, it goes wrong in three steps:

1. **`stop()` misses the task:** `registry.cancel` finds no entry, or only the old one, so it cancels nothing. It sets `started = false` and bumps `gen`.
2. **`start()` spawns an uncancellable task:** it registers a fresh token and spawns task A. A is running, but `started` is false and nothing cancelled it.
3. **The next `start()` doubles it:** it spawns task B, and `register` *replaces* the map entry without cancelling A's token. A is now unreachable. `stop()` can only cancel B, and A emits `playing`/`done` frames for the rest of the process.

The new generation counter does not help here. It only decides who clears `started`, and A never exits.
**Fix:** Make registration part of the same critical section, or keep the token in `State` so `stop()` can always reach it:

```rust
pub fn start(&self) {
    let mut st = lock(&self.inner.state);
    if st.started { return; }
    st.started = true;
    st.gen += 1;
    let gen = st.gen;
    // state -> registry map is the only order taken; PollGuard::drop takes the map alone.
    let (token, guard) = self.inner.registry.register(PollKind::Running, POLL_KEY);
    st.token = Some(token.clone());
    drop(st);
    /* spawn as before */
}
pub fn stop(&self) {
    let mut st = lock(&self.inner.state);
    if let Some(t) = st.token.take() { t.cancel(); }
    st.started = false; st.gen += 1; st.last_known = 0; st.claims.clear();
}
```

Add a test that interleaves `start`/`stop` from threads behind a barrier and then asserts one probe per tick.

## Info

### IN-01: Prior IN-03 got worse: the in-session retry appends to the unbounded `Outbox::logs` every few seconds while the sidecar is hung

**File:** `src-tauri/crates/gamelib-steampoll/src/outbox.rs:98-104, 256-260`
**Issue:** `flush` used to run once per READY. It now also runs every `RETRY_FLUSH_INTERVAL_MS` from the shell. While the sidecar is alive but not acking, each queued event logs `replay … ack timeout` on every pass, about one line per 5 s timeout, for the rest of the session. The `Vec<String>` is never trimmed.
**Fix:** Cap `logs` as a ring buffer (for example 500 lines), or compile it only under `cfg(any(test, feature = "testing"))`. Consider logging a replay timeout once per (appId, kind, seq).

### IN-02: `mark_ready` silently skips its replay when a retry flush is already running

**File:** `src-tauri/crates/gamelib-steampoll/src/outbox.rs:215-218, 233-236`
**Issue:** On a re-READY, `mark_ready` sets `ready` and calls `flush`, which returns at once if the `flushing` guard is held. That happens when a retry flush started before the sidecar died and is still waiting out a 5 s timeout. The old flush does carry on against the new sidecar once `is_ready()` is true again. But the entry that timed out waits for the next 10 s retry. The doc comment says `mark_ready` "replays the queue", which is not guaranteed.
**Fix:** Set a `flush_requested` flag when the guard is held, and have the running flush loop once more before releasing it. Or document the up-to-one-period delay.

### IN-03: A cancelled `RunningPoll` task still finishes its in-flight probe after `stop()` and emits from the reset state

**File:** `src-tauri/crates/gamelib-steampoll/src/running.rs:210-213, 283`
**Issue:** `tokio::select!` only races the branch futures. Once `ticks.tick()` wins, `poll.poll_once().await` runs to completion even if the token is cancelled meanwhile. So a `stop()` during a probe is followed by `transition(current)` against `last_known = 0`. That emits `playing` for the running game after the stop, and sets `last_known` again. The comment at line 283 ("stop() can cancel the task mid-probe") is inaccurate.
**Fix:** In the tick arm, `select!` the probe against `token.cancelled()`, or check `token.is_cancelled()` (or the generation) before applying `transition`.

### IN-04: The macOS case fold ignores Unicode normalization

**File:** `src-tauri/crates/gamelib-steampoll/src/acf_copies.rs:118-122`
**Issue:** APFS and HFS+ are normalization-insensitive as well as case-insensitive. An `installdir` of `Café` in NFC and one in NFD are one directory on disk, but `to_lowercase` compares them as different, so the conflict is missed. This is an edge case: installdirs are almost always ASCII.
**Fix:** Compare `canonicalize(common/<a>)` against `canonicalize(common/<b>)` when both exist. Or treat any non-ASCII pair whose ASCII-folded forms differ only in non-ASCII bytes as a conflict, which is the safe direction.

## Prior findings

| Prior ID | Status | Notes |
| --- | --- | --- |
| A-CR-01 | Fixed | The root is pinned to the manifest's own steamapps dir. Escaping installdirs are refused. Security tests added. |
| A-WR-01 | Partly fixed | The nested manifest being removed is refused. A nested or trailing-separator *other* manifest still is not detected (new WR-01). |
| A-WR-02 | Fixed | Case-insensitive on macOS and Windows. Unicode-normalization residual in IN-04. |
| A-WR-03 | Fixed | Static `STORE_LOCK` across load and rename. Unique temp names. No other writer exists. |
| A-WR-04 | Fixed | `steam_hold` snapshot. A moved state drops the probe outcome. |
| A-WR-05 | Fixed | Source re-check in the second critical section. |
| A-WR-06 | Fixed | `Registry::try_register`. |
| A-WR-07 | Partly fixed | The dying-task case is closed. `stop()` racing between `start()`'s unlock and `register` still orphans a poller (new WR-02). |
| A-WR-08 | Fixed | Install-state supersede group, ascending replay, `retry_pending`. `updateDone` exclusion verified. |
| A-WR-09 | Fixed | Dead monitor replaced, with a throttled restart. Not live-verified. |
| A-IN-01 | Not fixed | `let _ = remove_file(&manifest_path)` is unchanged (acf_copies.rs:364, 383). |
| A-IN-02 | Not fixed | `canon_root.parent().is_some()` is still dead (acf_copies.rs:285). |
| A-IN-03 | Not fixed, worse | See IN-01. |
| A-IN-04 | Not fixed | `pending_outcome.take()` still precedes the first retarget guard (install_loop.rs:706-717). The new WR-04/05 early returns do not add to it. |
| A-IN-05 | Not fixed | `gamelib-steampoll-cli/Cargo.toml:13` still enables `testing`. |

## Cross-part note (outside Part A scope, not counted)

The TS `uninstallBottleGameDirectly` (`src/backend/storeManagers/steam/gameUninstall.ts:768-797`) still takes `relFromCommon.split(sep)[0]` as the segment it deletes. A nested bottle `installdir` therefore deletes its shared parent there too: the original A-WR-01 shape, on a TS path the Rust fix does not cover. Its conflict scan calls the Rust `find_other_manifests_with_installdir`, so it would also benefit from the WR-01 fix above.

---

_Reviewed: 2026-11-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

## Part B — Tauri shell


### Phase 80 (Part B, Tauri shell): Code Review Report, re-review

**Reviewed:** 2026-11-16
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

**What I reviewed:**
- The fix-pass diff `b7dbc199e..HEAD` over the 8 scope files. It holds 3 `fix(80):` commits (a3285aaff, c65ec88bd, 66c3ca42f) and 4 `fix(79):` commits that also touch `sidecar.rs` and `ipc_contract.rs` (1645ab6d5, a152a9caa, 2be7ead56, 179ac05b7).
- `steampoll_dispatch.rs` in full.
- The phase diff from `b1f3f4a05^` for `main.rs`, `sidecar.rs`, `shell_state.rs`, `rust_dispatch.rs`, `notification_show.rs` and `Cargo.toml`.

**Code I read to check contracts:**
- `outbox.rs`: `send_with_timeout`, `flush`, `retry_pending`, `enqueue`.
- `runtime.rs`: the multi-thread runtime, so `Handle::block_on` from a std thread drives timers.
- `dispatch.rs` and `install_loop.rs` from C-WR-03.
- The TS seq guard in `steamPollEventRegistration.ts`.

**Result:** the fix pass is mostly sound.
- B-CR-01 and B-WR-03 are fixed.
- The B-WR-01 skip argument holds.
- B-WR-02 is only partly fixed. The new deadline is checked once, before the closure takes the stdin lock and writes the frame. The wait for the ack is sized at that moment, not after the write. So a slow or contended stdin write can still make the invoke outlive the crate's 5 s timer, and the frame can still be written after the crate has re-queued the event. The cause is a sidecar that is not reading, which is the same busy-Node condition the finding was about.
- New issue: if the retry thread fails to spawn, the READY replay never runs and the outbox stays not-ready for the whole session.

**Regression questions from the brief:**
- **Does the retry thread delay exit?** No. It is a detached `std::thread` and nothing joins it. `steampoll_exit_shutdown` drops the sender first, which wakes `recv_timeout` with `Disconnected` immediately. A flush already in flight is not waited for. Two `Handle::block_on` calls from separate non-runtime threads (retry thread and main thread) on the multi-thread runtime are fine.
- **Does a repeat READY start a second loop?** No. A repeat READY finds `RETRY_STOP` set and spawns one `mark_ready` on the runtime. The crate's `flushing` swap makes that a no-op while the loop is flushing.
- **Is the stop channel ordered correctly at exit?** Yes. The stop runs before `cancel_all_and_wait`, so no new retry tick starts during cancellation.
- **`OnceLock` against `try_state`:** the `OnceLock` is set before `start_reader`, so the boot race is closed. The `try_state` fallback is now unreachable (IN-01).
- **The 4.5 s / 5 s split:**
  - A queued closure that starts after the deadline now skips the write. That closes the orphaned-write case when the write itself is fast.
  - It is still open when the write or the stdin lock blocks (WR-01).
  - No ack is lost on the normal path. `tokio::time::timeout` reads `Instant::now()` after `host.state_event(ev)` has run, so the shell deadline is always at least 500 ms before the crate deadline.
- **`steampoll_install_start` returning bool:** consistent. The shell validates arguments only and passes results through unchanged (`rpc_steampoll_install_start` → crate `dispatch`). The shell has no result schema to update, and the `sidecarTransport.ts` doc now states the boolean.

**Phase-79 commits in the range:**
- These are the `sidecar_eof_teardown` split and the redacting `Debug` impls. They are outside phase 80 and were reviewed under phase 79.
- I checked only how they interact with steampoll. `on_sidecar_eof_steampoll` still runs before the teardown, in line on the reader thread, so their reordering does not affect the poll host.

## Prior findings

| ID | Title | Verdict | Notes |
| --- | --- | --- | --- |
| B-CR-01 | Unacked state events after READY never replayed | **Fixed** | `run_outbox_retry_loop` calls `retry_pending` every `RETRY_FLUSH_INTERVAL_MS`. `STEAMPOLL_SIDECAR` is set before `start_reader` (`main.rs:848`), which closes the boot `try_state` race. Two loop tests cover redelivery, idle, not-ready and stop. New gap on thread-spawn failure, see WR-02. |
| B-WR-01 | READY replay races live transitions | **Fixed (no shell change; the skip argument holds)** | (1) Crate A-WR-08: `note_applied` drops superseded queued install-state events, and `flush` re-checks `still_queued` before each send. (2) What remains is two sends crossing on the wire, and C-IN-04 closes that: `steamPollEventRegistration.ts:236-262` guards by seq per appId for the install-state group. (3) The guard is check-then-apply across an `await`, but `applyInstalled`, `applyUninstalled` and `markSteamInstallIncomplete` are synchronous (`:137-165`), so for the install-state kinds the check and the apply run in one turn. (4) Only `macArchVerdict` awaits, and it is keyed per (appId, kind). Holding live sends behind the replay is not needed. |
| B-WR-02 | Equal 5 s timeouts orphan the blocking invoke | **Partly fixed** | Fixed: equal bounds, the stale-start write, and the comment. Still open: the deadline is not re-checked after the stdin lock and write, and the recv bound is computed before the write. See WR-01. |
| B-WR-03 | Shell rejects `[]` for `steampoll_read_running_app_id` | **Fixed** | Generated `from_args` maps `[]` and `[null]` to `{}` (`ipc_contract.rs:2314-2318`). The crate now matches `None \| Some(Null)`. The generator test and the shell test pin both. |
| B-IN-01 | `block_on` without a `try_current` guard on exit | Open, not worse | The new `run_outbox_retry_loop` runs `block_on` on a fresh std thread, which is correct. `steampoll_exit_shutdown:245` is unchanged. |
| B-IN-02 | Exit waits run one after another | Open, not worse | The retry thread is not joined, so it adds nothing to quit time. |
| B-IN-03 | Shell arg validation drifted from the crate | Open, unchanged | — |

## Warnings

### WR-01: The B-WR-02 deadline is checked before the stdin write, not after, so a blocked write can still write late and outlive the crate's ack timer

**File:** `src-tauri/src/steampoll_dispatch.rs:390-397`, `src-tauri/src/shell_state.rs:198-206, 223-258`

**Issue:** The closure works out `bound = deadline - now` once, then calls `invoke_bounded`. Inside `invoke_bounded`, two steps can block without any limit, and neither looks at the deadline:
1. `write_frame` → `write_raw` takes the `stdin` mutex and calls a blocking `write_all` + `flush` (`shell_state.rs:198-206`). The mutex is shared with every other invoke and with every rustInvoke response frame. `write_all` blocks once the pipe buffer is full, which happens when the sidecar is not reading stdin.
2. After the write, `rx.recv_timeout(bound)` (`:258`) waits the full `bound` that was computed before the write. That is not the time left at that point.

That leaves two failures that B-WR-02 was meant to remove:
- **Late write:** the closure starts at T+0.1 s with `bound` = 4.4 s and then blocks about 5 s on the stdin lock or a full pipe. The crate times out at T+5 s and re-queues the event, and a newer live event for the app may then be applied. The blocked write then completes and puts the stale frame on the wire after it. The C-IN-04 seq guard absorbs this only if the newer event was applied before the stale frame is handled.
- **Ack discarded:** even a short delay in the write, for example 1 s spent waiting for the mutex, moves the recv deadline to about T+5.5 s. That is after the crate's 5 s timer. So an ack that arrives between 5.0 s and 5.5 s is dropped by the crate and the event is reported as not acked. This is the "two timers race" case the fix commit says is gone.

The trigger is the same condition B-WR-02 was written for: a Node event loop that is busy for seconds and not draining stdin.

**Fix:** Pass the deadline into the invoke instead of a duration. Re-check it after the lock is taken, and size the recv from it:
```rust
// shell_state.rs
pub(crate) fn invoke_until(&self, channel: String, args: Vec<Value>, deadline: Instant)
    -> Result<Value, String>
{
    let id = self.next_id();
    let (tx, rx) = mpsc_channel();
    self.pending.lock().map_err(|e| e.to_string())?.insert(id.clone(), (channel.clone(), tx));
    let req = SidecarRpcRequest { id: id.clone(), kind: "invoke", channel: channel.clone(), args };
    let value = serde_json::to_value(&req).map_err(|e| e.to_string())?;
    {
        let mut stdin = self.stdin.lock().map_err(|e| e.to_string())?;
        if Instant::now() >= deadline {           // lock wait ate the budget: do not write
            self.pending.lock().ok().and_then(|mut p| p.remove(&id));
            return Err(format!("{channel}:stale"));
        }
        /* write_all + "\n" + flush under this same guard */
    }
    let left = deadline.saturating_duration_since(Instant::now());
    match rx.recv_timeout(left) { /* same arms as invoke_bounded */ }
}
```
A blocking `write_all` into a full pipe still cannot be bounded this way. Document that last case as the residual that C-IN-04 covers, or move stdin writes to a writer thread with a bounded queue.

### WR-02: If the retry thread fails to spawn, the READY replay never runs and the outbox is never marked ready

**File:** `src-tauri/src/steampoll_dispatch.rs:199-225`

**Issue:** The READY replay (`outbox.mark_ready`) now runs only as the first statement of `run_outbox_retry_loop`. Before the fix it was spawned on the steampoll runtime.

When `thread::Builder::spawn` fails (thread or resource exhaustion), several things go wrong:
- **The replay is lost.** The closure is dropped, so `mark_ready` never runs. The outbox's `ready` flag stays `false` for the whole process.
- **Every state event is held back.** Every later `Transition` sees `is_ready() == false` and is enqueued. None is ever sent, because `retry_pending` is also gated on `is_ready()`.
- **No later READY can repair it.** `RETRY_STOP` still holds the sender, so a later READY takes the "loop already runs" branch and assumes a loop exists.
- **Only a log line remains.** The user sees no install, uninstall or update state from the Rust polls for the session, and the only trace is "retry thread failed to start".

The failure is rare, but the result is a total loss of state-event delivery, not a degraded retry.

**Fix:** On spawn failure, clear the slot and fall back to the old runtime replay:
```rust
if spawned.is_err() {
    shell_eprintln!("[shell] steampoll outbox retry thread failed to start");
    RETRY_STOP.lock().unwrap_or_else(|e| e.into_inner()).take();
    gamelib_steampoll::runtime::handle().spawn(async move {
        outbox.mark_ready(host.as_ref()).await;   // outbox/host must be cloned before the move above
    });
}
```
Alternatively, call `mark_ready` (spawned on the runtime) before starting the thread, and make the thread a pure retry ticker.

## Info

### IN-01: The `try_state` fallback in `ShellPollHost::state_event` is unreachable, and the `OnceLock` set result is discarded

**File:** `src-tauri/src/steampoll_dispatch.rs:162-166, 376-382`
**Issue:**
- `set_steampoll_sidecar_state` always runs before `start_reader` (`main.rs:848`), and READY can only come from that reader. So whenever `SIDECAR_READY` is true, `STEAMPOLL_SIDECAR` is set, and the `try_state` arm never runs.
- `let _ = STEAMPOLL_SIDECAR.set(...)` hides a second call. If `spawn_sidecar_state` ever ran twice in one process, the poll host would silently keep writing to the first `SidecarState` while `handle_exit` shuts down the managed one.

**Fix:** Drop the `try_state` arm and the `app` capture it needs. Log or `debug_assert!` when `set` returns `Err`.

### IN-02: On sidecar EOF the pending invokes are drained before the outbox is marked not-ready, so a retry flush in that gap can post an invoke nobody drains

**File:** `src-tauri/src/sidecar.rs:660-667`
**Issue:**
- **The gap:** `drain_pending_invokes` runs, then `on_sidecar_eof_cancel_jobs`, then `on_sidecar_eof_steampoll`.
- **What can land in it:** the new retry thread can start a flush there. Its `invoke_bounded` inserts a pending entry after the drain.
- **Why it is usually harmless:** the write to a dead child's stdin fails at once with EPIPE.
- **When it costs time:** if the child has closed stdout but not yet exited, the write succeeds and the invoke waits the full 4.5 s for an answer that cannot come.
- **Why it is Info:** this is pre-existing ordering, but the periodic retry makes it more likely to be hit. The cost is bounded at 4.5 s per event, and the event is re-queued.

**Fix:** Call `on_sidecar_eof_steampoll()` (which runs `mark_not_ready`) before `drain_pending_invokes`.

### IN-03: The WR-02 tests pin only constants and the pure helper, not the timer relationship they claim

**File:** `src-tauri/src/steampoll_dispatch.rs:593-615`, `src-tauri/src/main.rs:2558-2571`
**Issue:**
- **What is pinned:** `state_event_invoke_settles_before_the_crate_ack_timer` checks `4500 < 5000`, and `a_closure_started_after_the_deadline_does_not_write` tests `invoke_bound_before` on its own.
- **What is not pinned:** nothing checks that the deadline is captured before the crate's `tokio::time::timeout` starts. Nothing checks that the invoke path sizes its wait from the deadline (the gap behind WR-01). A refactor that moves the `Instant::now()` capture into the `async move` block would pass every test.
- **The `main.rs` duplicate:** it repeats the literal `4500` instead of `STATE_EVENT_INVOKE_BOUND`.

**Fix:** Add a test that drives `send_with_timeout`-equivalent wrapping around a host whose `state_event` captures its deadline the same way, and asserts the deadline is earlier than the timer's. Use `STATE_EVENT_INVOKE_BOUND` in `main.rs`.

### IN-04: A closure that starts just before the deadline writes the frame with a near-zero bound, which almost guarantees an "applied but not acked" duplicate

**File:** `src-tauri/src/steampoll_dispatch.rs:318-321, 392-396`
**Issue:**
- `invoke_bound_before` returns `Some(1 ms)` when 1 ms is left. The frame is then written, and the invoke almost always times out.
- The sidecar applies the event anyway, while the crate re-queues it and replays it 10 s later.
- The C-IN-04 guard makes the replay harmless, so this costs a wasted frame and an `invoke_abandoned` diag line each time, not a wrong state.

**Fix:** Skip the write when the time left is below a small floor, for example `if left < Duration::from_millis(250) { return None }`. The event is not written and simply stays queued.

---

_Reviewed: 2026-11-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

## Part C — TS backend


### Phase 80 (Part C): Re-review after the fix pass

**Reviewed:** 2026-11-16T09:36:47Z
**Depth:** standard. The fix(80) commits since b7dbc199e were read in full. Large pre-existing files were reviewed by their diff from b1f3f4a05^.
**Files Reviewed:** 58
**Status:** issues_found

## Summary

All of C-WR-01 to C-WR-08 and C-IN-04 landed, and most are correct. Each of the rustInvoke paths now degrades instead of throwing. The status read in `refreshInstallState` is a single read inside the scan `try`. The zod schema no longer rejects what Rust actually emits.

**Seq guard.** I found no case where it drops a legitimate Rust event within a session:

- `seq` is a single per-shell-process counter (`registry.rs:224`).
- The sidecar is a child of the shell, so each restart gets a fresh guard.
- Every tick draws one seq. It emits at most one install-group kind per app per tick (`uninstall.rs:150-262`, `install_once.rs:300-575`).
- Every other kind gets its own key.
- A second registration only loses protection; it never drops an event.
- The install-group apply has no `await`, so check-then-note is atomic for that group.
- The `macArchVerdict` writes happen before the handler's first `await`.

**WR-08 relaxation and the 10 s retry.** The stale and refusal replies (`applied:true`) are consumed correctly by `note_applied` and do not change the Rust continuation: `bridgeAuthoritative` in the reply is never read by the crate. The remaining gaps are poison events, which are retried with no cap (IN-04), and a parity test that cannot detect a refusal (IN-05).

**WR-02/03 best-effort paths.** They log and continue. Only one of them swallows a failure with a user-visible effect: a lost finalize marker (IN-06, a documented trade-off).

**New tests.** None spawns a child process, so `createFakeHomeProfile()` does not apply. `steamPollStateEventParity.test.ts` is classified in `testContainment.test.ts`.

**One new Warning.** The C-WR-06 launch-watch change makes `launching` wait for the claim. That delay can now be up to the 60 s rustInvoke bound. But the new guard checks only `cancelled || doneSent`, so a late `launching` can overwrite `playing`, or arrive after the watch has ended and leave the game stuck on "Launching".

## Prior findings

| ID | Title | Status | Verification |
| --- | --- | --- | --- |
| C-WR-01 | Kill/stop depends on a steampoll invoke | **Fixed** | c711d0414. `dispatch.ts:185-201` uses try/catch and defaults to not delegated, so the abort and `stop()` always run. In `games.ts:590-601`, a rejected cancel falls through to the bridge route. Correct. |
| C-WR-02 | Bridge `finally`/`catch` await a rustInvoke | **Fixed** | 32c3c502c. `setBridgeInstallFinalized` never rejects, and the two pre-removal stops are best-effort. Correct. The residual trade-off is in IN-06. |
| C-WR-03 | Notices and post-handoff bookkeeping throw | **Fixed (one limit documented)** | 68ad4227d. `noticeSeq` never rejects, and the uninstall and update hand-offs are logged instead of failing. `steampoll_install_start` now returns ownership, which removes the double-`done` race. The fallback seq can still be hidden by a notice from a Rust loop (IN-02). |
| C-WR-04 | Unhandled rejections | **Fixed** | fd8699e62. The claim's handler is attached at creation, and both `stopUninstallPolling` fire-and-forgets have a `.catch`. Correct. |
| C-WR-05 | Bridge-finalized read at tick start | **Fixed (Rust)** | 30880a6ad. `Continuation::refresh_bridge_finalized` re-reads the marker after the ack, only for installer-owned `Installed` continuations (`effects.rs:118-139`, `install_loop.rs:590-600`). Correct. |
| C-WR-06 | Mirror and claim ordering | **Partly fixed** | db4d406f9. The mirror chain is correct: `tail` never rejects, because production `requestRustInvoke` returns a rejected promise and never throws synchronously. The `clear()` override mirrors every key it removes. The launch-watch half adds a new race; see WR-01 below. |
| C-WR-07 | `refreshInstallState` rejects mid-reconcile | **Fixed** | f5a680142. There is one status read, inside the `try`, shared by the hold filter and the active-poll set. A rejected read returns before any mutation. Correct. |
| C-WR-08 | Schema stricter than producer; no parity test | **Fixed** | ffd108571. The schema now accepts every fixture variant, a non-numeric SizeOnDisk becomes 0 bytes, and `rearmSettled` is acked before its detached reconcile. The finite bounds and missing retry cap are in IN-04; the weak handler assertion is in IN-05. |
| C-WR-09 | `pollUninstallOnce` duplicates the Rust pipeline | **Not fixed (skipped, design decision)** | Unchanged apart from the `.catch` from WR-04. The skip reasoning holds (LOCKED operator decisions, live UAT per path). It is still open debt. |
| C-IN-04 | Handler ignores `seq` | **Fixed** | 2c461c7c5. The grouping matches `outbox::is_install_state_kind`, and a failed apply records no seq. I found no case where a legitimate event is dropped (see Summary). The cross-kind gap is in IN-03. |

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: The win32 launch watch can send `launching` after `playing`, or after the watch has ended

**File:** `src/backend/storeManagers/steam/steamLaunchWatch.ts:184-198` (with the `finally` at 368-386)

**Issue:** After C-WR-06, `decideLaunching` runs only once `releasePoller.held` settles. That is the `steampoll_running_hold` rustInvoke, which can take up to `RUST_INVOKE_TIMEOUT_MS` (60 s, `sidecarRpc.ts:84`), and it is followed by a second async read in `whenPollerReports`. Meanwhile `runWin32` keeps going. The only guard is `if (reports || cancelled || doneSent) return`, so two interleavings now produce a wrong status:

1. **Late `launching` overwrites `playing`.**
   - The search loop finds the game, sets `playingSent = true` and sends `playing`.
   - The claim lands after that, and the poller is held, so it has not reported the appId.
   - `decideLaunching` sends `launching`.
   - Nothing re-sends `playing`: `reassert` is set only by a relaunch. The card shows "Launching" for the whole session, until the game exits and `done` is sent.
2. **Late `launching` after the watch has ended.**
   - `run()` returns without `doneSent`. This happens when there is no install folder (`run`, about line 360), when the start window elapses, or when the watch leaves it to the RunningAppID poller.
   - The `finally` runs while `launchingSent` is still false, so it skips its fallback `done` and calls `finish()`.
   - The claim then lands and `launching` is sent. No code path will ever send `done`, so the game is stuck on "Launching" until the app restarts.

The new comment says "A watch cancelled or finished meanwhile sends nothing", but a finished watch is not checked. Before this change only the `pollerReports` read was async, so the window was one invoke wide. It is now two invokes plus a hold that can last up to 60 s, so this regression is tied to the fix. The new test (`steamLaunchWatch.test.ts`, C-WR-06) covers only cancel-before-claim.

**Fix:** Track that the watch has finished and that `playing` was sent, and check both in the late callback:
```ts
let finished = false
const decideLaunching = () =>
  whenPollerReports(deps, appId, (reports) => {
    if (reports || cancelled || doneSent || playingSent || finished) return
    ...
  })
// in .finally(), first line:
finished = true
```
Add tests where `held` lands (a) after the search sends `playing` and (b) after `run()` returns with no install folder. Assert that `launching` is not sent in either case.

## Info

### IN-01: Orphaned JSDoc, and module-global notice state

**File:** `src/backend/storeManagers/steam/gameUninstall.ts:188-196`

**Issue:** The `failUninstall` JSDoc ("quick 261108-anw: a delete errored ...") now sits above `let lastNoticeSeq = 0`, and `failUninstall` itself (about line 246) has no doc. `lastNoticeSeq` is also module-global, which breaks the per-boot session-state rule in `gameSessionState.ts` ("every map and set is per-instance, so two boots never share a session"). Two boots in one jest registry share it.

**Fix:** Move the JSDoc back onto `failUninstall`. Keep `lastNoticeSeq` in the per-boot `SteamGameSessionState`, or pass it in through `deps`.

### IN-02: The fallback notice seq can still be hidden, and its comment overclaims

**File:** `src/backend/storeManagers/steam/gameUninstall.ts:198-225`

**Issue:** The doc says the fallback is "never equal to, or ahead of, the next one Rust issues" and is newer than everything handed out. It is newer only than the seqs this process has seen. The Rust install and uninstall loops issue their own notice seqs (`install_loop.rs:838`, `uninstall.rs:129`), which TS never sees. The frontend keeps one global `latest` (`SteamRequestNotice.ts:47`). So after any loop notice, a fallback `uninstall-failed` notice is silently dropped, which is the exact symptom C-WR-03 targeted. The fix report mentions this, but the code comment does not.

**Fix:** At minimum, correct the comment. For a real fix, have the frontend order notices by `(seq, receivedAt)`, or have the sidecar learn the highest seq from the Rust loop notices (they pass through the shell, which could stamp them).

### IN-03: The seq guard leaves `bridgeUninstalled` and `forcedWindowsViaBottleCleared` unordered against install state

**File:** `src/backend/sidecar/steamPollEventRegistration.ts:199-210`

**Issue:** Both kinds are emitted by the same uninstall tick as `uninstalled`, and both write bridge/install-related state. Each is keyed on its own `(appId, kind)`. Example: a queued `bridgeUninstalled` (seq 8) that is replayed after a newer `installed` (seq 50, a bridge reinstall) still runs `markBridgeGameUninstalled`. The crate's `note_applied` likewise drops only install-group kinds. This is unlikely with a 10 s retry, because a reinstall takes minutes. But the header's claim that "an older event can arrive after a newer one" is covered is only true within a group.

**Fix:** Before applying a `bridgeUninstalled` or `forcedWindowsViaBottleCleared`, also check it against the app's install-group seq. Or document the gap in the header next to the TS-write caveat.

### IN-04: Poison events still retry every 10 s with no cap; the schema bounds are still finite

**File:** `src/common/types/ipc/sidecarInternal.ts:105-107`; `src/backend/sidecar/steamPollEventRegistration.ts:263-271`

**Issue:** Rust passes `SizeOnDisk` and `buildid` through unbounded, so a corrupt ACF value over 256 characters still fails `validateInbound`. So do an unknown future `kind` and an apply that throws every time, for example a store write that keeps failing in `applyMacArchVerdict`. Before Part B such an event was retried only at READY. With the 10 s `retry_pending` loop it is now re-sent, and for a throwing apply a warning is logged, every 10 s for the whole session. This is the prior C-IN-04 "re-queued forever" note, now worse because the retry is periodic.

**Fix:** In the handler, truncate instead of rejecting (`z.string().transform(s => s.slice(0, 256))`, or validate with `.max` only on `installPath`). In the crate outbox, add a per-entry attempt cap that logs and drops the entry. The fixer deferred that cap to Part A.

### IN-05: The parity test's handler assertion cannot detect a refusal

**File:** `src/backend/sidecar/__tests__/steamPollStateEventParity.test.ts:70-101`

**Issue:** The test is named "applies every producer event without a refusal" and asserts `reply.applied === true`. Since C-WR-08, refusals and stale events also answer `applied: true`, so this assertion passes even if the handler applies nothing. The fixture's first event (appId `4294967295`, seq 2^53-1) is not in the seeded library, so it always takes the no-entry refusal path. The NaN check reads only the final state (the seq-7 survivor). The non-numeric `"not-a-number"` case (seq 3) is overwritten before it is checked.

**Fix:** Seed every fixture appId. After each event, assert the resulting library entry (for example, that `install_size` matches `/^\d/` right after each `installed` or survivor event), not only the `applied` flag.

### IN-06: A lost finalize marker silently re-opens the C-WR-05 "finishing after done" symptom

**File:** `src/backend/storeManagers/steam/gameInstallBridge.ts:59-72`

**Issue:** This is the documented trade-off of C-WR-02. If `setBridgeInstallFinalized(true)` fails, the error is logged only. The Rust poll's `Installed` continuation then reads `finalized = false` and emits `steam-bridge-finishing` after the installer's `done`. The card then stays on "finishing" until restart, and the only trace is a warning in the log. That is the 261031-ihs defect, now behind a transport failure.

**Fix:** Acceptable as written. Optionally retry the marker once before giving up, or send `done` again after a failed marker write so the last frame is terminal.

---

_Reviewed: 2026-11-16T09:36:47Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

