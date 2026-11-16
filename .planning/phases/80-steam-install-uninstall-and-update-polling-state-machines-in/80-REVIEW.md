---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
reviewed: 2026-11-16
depth: standard
status: issues_found
files_reviewed: 99
findings:
  critical: 2
  warning: 21
  info: 14
  total: 37
---

# Phase 80 Code Review

Split three ways because the phase scope (108 files, ~72k lines) exceeds one reviewer's context: A = Rust crates (43 files), B = Tauri shell (8), C = TS backend (48). Large pre-existing files were reviewed by their phase-80 diff (base b1f3f4a05^). Fixtures, JSON baselines and Cargo.lock were excluded.

## Orchestrator triage

- **A-CR-01 / A-WR-01 (installdir-derived library root / multi-segment installdir deletes common/<first segment>) are inherited, not introduced.** The deleted TS `removeSteamInstallCopy` (b1f3f4a05^:library/acfState.ts ~L340-388) derived `steamappsDir = resolve(installPath,'..','..')` and deleted `common/<first segment>` the same way; the Rust port is faithful. Still real defects worth fixing.
- **One theme spans all three parts:** state-event delivery. B-CR-01 (unacked events after READY never replayed), A-WR-08 / B-WR-01 (replay can reorder a stale `installed` after a newer `uninstalled`), C-IN-04 (TS handler ignores `seq`), C-WR-08 (zod stricter than Rust output; rejected events retried only at READY), B-WR-02 (double 5 s timeout orphans the blocking invoke). Fix together: retry/flush unacked events while running, and a per-app seq guard in `steamPollEventRegistration.ts`.
- **Second theme:** concurrency in the crate (A-WR-03 HoldStore unlocked RMW, A-WR-04/05 probe races, A-WR-06/07 double-start) and lost same-turn ordering on the TS side (C-WR-01..07).
- Live UAT (items 1-9) and CI legs passed, so none of these show on the happy path; each needs a failure, timeout or race.

## Part A — Rust crates (gamelib-steampoll, -cli, steamfiles, i18n)

Finding IDs below are local to this part (prefix them with A- when referring, e.g. A-CR-01).

## Phase 80 (Part A, Rust crates): Code Review Report

**Reviewed:** 2026-11-16
**Depth:** standard (with targeted cross-checks against the deleted TS: `updatePollOnce.ts`, `uninstallPolling.ts`, `acfState.ts` at `b1f3f4a05^`)
**Files Reviewed:** 43 (tests read only for coverage gaps)
**Status:** issues_found

### Summary

I traced the update machine against the deleted `updatePollOnce.ts` line by line. It matches: bit 4 only completes together with `saw_pending`/`saw_activity`/a build change, the no-activity completion is the TS rule, and the one-tick deferral of the InstallApp outcome is equivalent because 40 % 3 != 0. The uninstall step matches the TS too, including the MAX_TICKS cap with no terminal `done`. I found no panics on untrusted ACF, VDF or nettop input; every slice point is an ASCII boundary.

The serious problems are elsewhere:

- **CR-01:** the delete path in `acf_copies::remove_copy` can be steered outside the library the manifest came from. This is the one Rust-only guard on a recursive delete.
- **Concurrency:** the hold store, the hold-probe re-entry in the install loop, uninstall start, and running-poll start/stop each have a race. All four are real, because the shell dispatches from worker threads and the loops await child processes for seconds at a time.

### Critical Issues

#### CR-01: `remove_copy` recovers `steamapps` from the installdir-derived path, so a crafted `installdir` deletes a directory in a different library

**File:** `src-tauri/crates/gamelib-steampoll/src/acf_copies.rs:273-318` (with `acf_state.rs:129-133`)
**Issue:** `read_acf_state` builds `install_path = join(<dir the manifest was found in>, "common", installdir)` but does not return that directory. `remove_copy` then normalizes `install_path` and takes `steamapps_dir = normalized/../..`. That means the "library root" the guard checks is derived from the untrusted `installdir`, not from where the manifest actually is. Two examples:

- `installdir = "../../../other/steamapps/common/Victim"` in `<T>/bottle/steamapps/appmanifest_10.acf` normalizes to `<T>/other/steamapps/common/Victim`.
- An absolute `installdir = "/any/path/steamapps/common/Victim"` replaces the base entirely (`Path::join` with an absolute path). On Windows a drive-prefixed path does the same.

In both cases `steamapps_dir` becomes `<…>/steamapps` of the victim's tree. `guard_install_root(steamapps_dir, install_root)` is then tautological: the canonical root is inside `canonicalize(steamapps_dir)/common` by construction. The conflict scan also runs against the *victim's* `steamapps`, so it finds nothing unless that tree happens to hold a manifest with the same installdir. `remove_dir_all` then deletes the directory.

The module doc (lines 10-12) claims "an `installdir` that is absolute or climbs out of `common/` is refused". `refuses_absolute_installdir` and `refuses_traversal_installdir` only pass because their victim path has no `steamapps/common` in it. The TS had the same derivation, but this guard was meant to be the strict Rust-only replacement (D-12, T-80-11/12).
**Fix:** Validate `installdir` itself and pin the library root to the directory the manifest was read from:

```rust
// acf_state.rs: carry the real dir on Installed
AcfState::Installed { steamapps_dir: dir.clone(), installdir: record.installdir.clone().unwrap_or_default(), .. }

// acf_copies.rs
fn valid_installdir(s: &str) -> bool {
    !s.is_empty() && s != "." && s != ".."
        && !s.contains(['/', '\\', ':', '\0'])   // single plain segment only
}
if !valid_installdir(&installdir) { return refused(source, "bad installdir"); }
let steamapps_dir = PathBuf::from(&steamapps_dir_from_reader);
let install_root = steamapps_dir.join("common").join(&installdir);
```

Add security tests with a victim at `<tmp>/other/steamapps/common/Victim`, reached both through a relative `../../../other/...` installdir and through an absolute one.

### Warnings

#### WR-01: A multi-segment `installdir` deletes its first segment, which can be a shared parent

**File:** `src-tauri/crates/gamelib-steampoll/src/acf_copies.rs:278-302`
**Issue:** `segment` is only the first component under `common/`. For `installdir = "Studio/GameA"`, `install_root` becomes `common/Studio` and `remove_dir_all` deletes the whole `Studio` folder. The conflict check compares the segment `"Studio"` against other manifests' full `installdir` values (`"Studio/GameB"`), so it never matches, and GameB's files are deleted too.
**Fix:** Refuse any `installdir` that is not a single normal component (the `valid_installdir` check in CR-01), or require `install_norm == common_root.join(segment)` before deleting.

#### WR-02: The conflict check is case-sensitive, but macOS (APFS default) and Windows filesystems are not

**File:** `src-tauri/crates/gamelib-steampoll/src/acf_copies.rs:96`
**Issue:** `rec.record.installdir.as_deref() != Some(installdir_segment)` misses a co-installed app whose manifest says `game` when this one says `Game`. Both resolve to the same directory on a case-insensitive volume, and the shared directory is deleted. The rule exists to prevent exactly that, so being "exact like the TS" is not a defence.
**Fix:** On Darwin and Windows compare with `eq_ignore_ascii_case`, or compare canonicalized `common/<installdir>` paths for existing directories. Over-reporting a conflict only downgrades the action to manifest-only, which is the safe direction.

#### WR-03: `HoldStore` read-modify-write has no lock and a temp name shared within the process; concurrent polls lose or resurrect hold records

**File:** `src-tauri/crates/gamelib-steampoll/src/hold.rs:229-256, 282-349` (used as one `Arc<HoldStore>` by every poll via `src/steampoll_dispatch.rs:333`, plus a second instance in `rearm.rs:36`)
**Issue:** `record` and `clear` each do load → mutate → save with no mutex. Polls for different apps run on separate tokio tasks, possibly on separate worker threads. Two of them applying `WriteHoldRecord` and `ClearHoldRecord` at once can interleave: one save overwrites the other's change, so a cleared record comes back (re-arms a finished hold at boot) or a new record is lost (the hold does not survive a restart). The temp file is `<path>.tmp-<pid>`, so two writers in this process also truncate and write the same temp file at the same time, which can produce a renamed file containing mixed content.
**Fix:** Wrap the store in a process-wide `Mutex<()>` held across load+save (a `static` keyed by path, or store it in the struct and share one instance with `rearm`). Make the temp name unique per write (counter or `tempfile::NamedTempFile::new_in(dir)`).

#### WR-04: The hold-probe copy-back overwrites a hold that `upgrade(adopted_by_steam_client)` released during the probe, then re-persists it

**File:** `src-tauri/crates/gamelib-steampoll/src/install_loop.rs:695-731` (with `upgrade` at 351-357)
**Issue:** `should_hold` runs on a *clone* of `poll.hold` with the lock dropped. It awaits `pgrep`/`ps`/PowerShell for up to 5 s + 15 s. If TS calls `steampoll_install_start` with `adoptedBySteamClient: true` in that window, `upgrade` sets `steam_hold = Released` and clears the record. When the probe returns, lines 724-728 copy `steam_hold = Holding` (and the pids) back over it unconditionally. The re-entered step then applies the probe's `WriteHoldRecord` and shows "Restart Steam to finish" for a game Steam has already adopted. The record survives restarts until the pids die.
**Fix:** Snapshot `steam_hold` before the await. Copy back only if the slot's `steam_hold` still equals the snapshot; otherwise discard the probe outcome and re-run the step without `obs.hold`:

```rust
let before = hold.steam_hold; // captured with the clone
...
if slot.poll.hold.steam_hold != before { return true; } // state moved under us; next tick decides
```

#### WR-05: A source retarget during the hold probe is not re-checked, so the re-entered step reports the old root's install under the new source

**File:** `src-tauri/crates/gamelib-steampoll/src/install_loop.rs:689-692 vs 717-731`
**Issue:** The retarget guard (`slot.poll.source != snap.source`) runs only before the first `install_step`. The second lock after `should_hold` re-enters `install_step` with the same `obs.acf`, which was read from the *old* root, even if `upgrade` switched `poll.source` while the probe ran. `installed()` then emits `StateEvent::Installed` with `source_name(poll.source)` (new root) and the old root's `install_path`/`size_on_disk`/`buildid`, and stops the poll.
**Fix:** Repeat the guard in the second critical section:

```rust
if slot.poll.source != snap.source { return true; }
```

#### WR-06: `start_uninstall` is check-then-register (TOCTOU); concurrent starts spawn two uninstall tasks and one becomes uncancellable

**File:** `src-tauri/crates/gamelib-steampoll/src/uninstall.rs:330-336` (`registry.rs:108-134`)
**Issue:** `is_active` and `register` take the registry lock separately. Two dispatches on different worker threads can both see "not active" and both register. `register` replaces the map entry, so the first task's token is no longer reachable: `stop_uninstall` cancels only the second, and the first runs to completion, emitting a duplicate `uninstalled` state event and toast.
**Fix:** Add `Registry::try_register(kind, app_id) -> Option<(CancellationToken, PollGuard)>` that checks and inserts under one lock, and use it here (and in `RunningPoll::start`).

#### WR-07: `RunningPoll` stop → start race lets a dying task clear `started`, which allows a duplicate poller

**File:** `src-tauri/crates/gamelib-steampoll/src/running.rs:187-220`
**Issue:** `stop()` cancels the task and sets `started = false`. If `start()` runs before the old task observes the cancellation, it sets `started = true` and spawns task B. The old task then reaches line 209 and sets `started = false` while B is running. The next `start()` spawns task C. B is now orphaned: its registry entry was replaced, so `stop()` cannot reach it. Two pollers then emit duplicate `playing`/`done` frames.
**Fix:** Track a generation. Have the task clear `started` only if its generation is still current, or remove line 209 and let only `stop()` own the flag.

#### WR-08: Unacked state events only replay on the next `mark_ready`, and replay is per (appId, kind), so an older event of one kind can be replayed after a newer event of another kind

**File:** `src-tauri/crates/gamelib-steampoll/src/outbox.rs:56-127, 169-171`
**Issue:** First problem: when the sidecar is READY but an ack times out or returns `applied: false`, the event is queued, but `flush` runs only from `mark_ready` (the shell's sidecar restart). The event therefore stays pending for the rest of the session.

Second problem: the dedupe key is `(appId, kind)`. Suppose `installed` (seq 5) timed out and is queued, then a later `uninstalled` (seq 9) for the same app is acked directly. On the next `mark_ready`, `installed` seq 5 is replayed after the sidecar has applied seq 9, which flips the badge back to installed. "Events carry full state, so replay is idempotent" holds only within one kind. Whether this bites depends on the sidecar rejecting stale seqs per appId (part C should confirm).
**Fix:** When a newer event for the same appId is acked, drop older queued events for that appId whose kinds conflict (installed / uninstalled / installIncomplete / updateDone). Or key the queue by appId for the install-state kinds. Also schedule a bounded retry flush while ready rather than waiting for a sidecar restart.

#### WR-09: A dead download monitor is never restarted; after a Steam restart, live progress is lost for the rest of the poll

**File:** `src-tauri/crates/gamelib-steampoll/src/monitor.rs:284-290, 341-345`
**Issue:** The watchdog exits when the watched `steam_osx` pid dies. The reader task then sets `failed = true`, but the entry stays in `monitors`. Every later `start()` (including `upgrade`'s `spawn_monitor_start`) sees `contains_key` and returns, and `read()` returns `None` forever. A Steam restart mid-download, which is common in the restart-hold flows, silently drops the macOS live progress and speed for the rest of the install.
**Fix:** In `start()`, replace an existing entry whose `failed` is true (kill it first) instead of returning, or remove the entry from the map when the reader task ends.

### Info

#### IN-01: `remove_copy` reports `Removed` even when deleting the manifest fails

**File:** `src-tauri/crates/gamelib-steampoll/src/acf_copies.rs:308, 327`
**Issue:** `let _ = std::fs::remove_file(&manifest_path)` is ignored. If the directory is gone but the manifest remains (EACCES, or a read-only bottle), the caller is told the removal succeeded and the next `read_acf_state` reports Installed with a missing directory.
**Fix:** Report `Refused { reason: "manifest remove failed" }`, or a `manifest_left: true` flag, when the error is not NotFound.

#### IN-02: Dead condition in `guard_install_root`

**File:** `src-tauri/crates/gamelib-steampoll/src/acf_copies.rs:245`
**Issue:** `&& canon_root.parent().is_some()` is always true for a path that `starts_with(<abs>/common)`. Separately, `canon_root == canon_steamapps/common` is not rejected here; it is only prevented by the caller's non-empty segment.
**Fix:** Replace it with `&& canon_root != canon_steamapps.join("common")` so the guard is self-contained.

#### IN-03: `Outbox::logs` grows without bound for the whole process lifetime

**File:** `src-tauri/crates/gamelib-steampoll/src/outbox.rs:26, 48-54`
**Issue:** Every `Effect::Log` is appended to an in-memory `Vec<String>` that is never trimmed. That includes the per-tick "deferring completion" warning in `uninstall.rs:181`, which can repeat for hours. The comment says it is kept for tests and diagnostics.
**Fix:** Cap it as a ring buffer (for example the last 500 lines), or gate it behind `cfg(any(test, feature = "testing"))`.

#### IN-04: A pending InstallApp outcome is dropped on the retarget early-return, leaving `in_flight` stuck

**File:** `src-tauri/crates/gamelib-steampoll/src/install_loop.rs:679, 689-692`
**Issue:** `pending_outcome.take()` runs before the retarget check. When the tick returns early, the outcome is discarded, `InstallAppRetry.in_flight` stays `true`, and the retry never fires again for that poll.
**Fix:** Take the outcome only after the guard passes, or put it back into `*pending_outcome` before `return true`.

#### IN-05: The CLI enables the `testing` feature of `gamelib-steampoll` inside the shared workspace

**File:** `src-tauri/crates/gamelib-steampoll-cli/Cargo.toml:13`
**Issue:** Under resolver 2, any `cargo build/clippy/test --workspace` unifies `testing` into the app build as well. That compiles `install_for_test` / `inject_reading` into the shell binary for that build. A release `tauri build` of the app package alone is not affected.
**Fix:** Move the replay harness behind a CLI-local feature, or keep it out of workspace default-members so workspace builds do not unify it.

---

_Reviewed: 2026-11-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

## Part B — Tauri shell (src-tauri/src, Cargo, CI)

Finding IDs below are local to this part (prefix them with B- when referring, e.g. B-CR-01).

## Phase 80 (Part B, Tauri shell): Code Review Report

**Reviewed:** 2026-11-16
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

### Narrative Findings (AI reviewer)

### Summary

Scope: `steampoll_dispatch.rs` (new) in full, and the phase-80 diff hunks of `ipc_contract.rs`, `main.rs`, `sidecar.rs`, `rust_dispatch.rs`, `notification_show.rs`, `Cargo.toml` and `rust-test.yml` (diff base `b1f3f4a05^`). To check the contracts I also read the crate code these files call (`outbox.rs`, `dispatch.rs`, `runtime.rs`, `registry.rs`, `running.rs`), `SidecarState::invoke`, and the TS callers and zod schemas.

The 24-arm channel table, the enum and name round-trip, the `notification_show` refactor and the CI and Cargo wiring are consistent. The main defect is in how the shell drives the state-event outbox. The shell triggers a replay only from the sidecar READY sentinel. READY fires once per process, because a sidecar death means a full `app.restart()`. So any state event that is not acked after boot is never re-sent. Smaller issues: the replay can race with live events, the two equal 5 s timeouts interact badly, and the shell's args contract for `steampoll_read_running_app_id` is stricter than the TS schema and the crate.

### Critical Issues

#### CR-01: State events not acked after READY are never replayed (the only flush trigger is the one-shot READY sentinel)

**File:** `src-tauri/src/steampoll_dispatch.rs:160-171` (with `src-tauri/src/sidecar.rs:464`, `crates/gamelib-steampoll/src/outbox.rs:93-127,169-171`)
**Issue:** The steps that lose the event:
1. `apply_effects` enqueues every `Transition` whose ack is not `applied`. That covers an ack timeout, an invoke error, a handler throw, and `try_state` missing.
2. `Outbox::flush` is called only from `mark_ready`.
3. `mark_ready` is called only from `on_sidecar_ready_steampoll`, which runs once, on the READY line.
4. A sidecar death is never respawned in place (sidecar.rs:694, "Restart is a full `app.restart()`"). So no second READY arrives.

Result: once the sidecar is READY, a single slow ack drops that state change for the rest of the session. A slow ack means the Node event loop is busy for more than `ACK_TIMEOUT_MS` = 5 s, for example during a library refresh or a large synchronous `steamLibraryStore.set`. Examples of lost changes: `installed` (is_installed/install path never written to the library store), `uninstalled`, `updateDone`, `macArchVerdict`. The event sits in the in-memory queue until the process exits. Entries that fail during the READY replay itself stay queued the same way.

There is also a boot window where this happens. `state_event` returns `not_acked` when `app.try_state::<Arc<SidecarState>>()` is `None`. `manage_sidecar_state` (main.rs:1105) runs after `spawn_sidecar_state` has started the reader thread. If READY is read before `app.manage(state)`, the whole boot replay fails and is never retried.

**Fix:** Give the outbox a retry trigger that does not depend on READY, and remove the `try_state` race:
```rust
// steampoll_dispatch.rs, in on_sidecar_ready_steampoll (or steampoll_boot):
let outbox = facade.outbox.clone();
let host = facade.registry.host().clone();
gamelib_steampoll::runtime::handle().spawn(async move {
    outbox.mark_ready(host.as_ref()).await;
    let mut tick = tokio::time::interval(Duration::from_secs(10));
    loop {
        tick.tick().await;
        if outbox.is_ready() && outbox.queued_len() > 0 {
            outbox.flush(host.as_ref()).await;
        }
    }
});
```
(Or flush after each applied live ack in the crate.) Separately, store the `Arc<SidecarState>` in a `OnceLock` that `ShellPollHost` reads, set before `start_reader` runs, so that `state_event` does not depend on `app.manage` ordering.

### Warnings

#### WR-01: READY replay races live transitions; stale queued events can overwrite newer state for a different kind

**File:** `src-tauri/src/steampoll_dispatch.rs:160-171`, `src-tauri/src/steampoll_dispatch.rs:282`
**Issue:** `on_sidecar_ready_steampoll` sets `SIDECAR_READY` synchronously. `outbox.mark_ready` then sets the outbox `ready` flag and replays a snapshot one event at a time, waiting up to 5 s for each. While the replay runs, any live `Transition` sees `outbox.is_ready() == true` and is sent straight away. Two things can go wrong:
- Latest-wins only applies per `(appId, kind)`. A queued `installed` (seq 5) for app X can be replayed after a live `uninstalled` (seq 9) for X has already been applied.
- The sidecar handler (`steamPollEventRegistration.ts`) has no seq guard.

Either way the library ends up `is_installed: true` for a game that was just removed. The pre-READY window is exactly when this happens: boot rearm and install polls started by the sidecar's boot resume are producing events then.
**Fix:** Keep live sends behind the replay. Leave `ready` false (live events keep enqueuing) until `flush` has drained, and loop `flush` until the queue is empty or stops shrinking. Or pass `seq` to the TS handler and have it refuse an event older than the last one it applied for that appId.

#### WR-02: Two equal 5 s timeouts orphan the blocking invoke, so a timed-out event can still be written late and out of order

**File:** `src-tauri/src/steampoll_dispatch.rs:279-300`, `src-tauri/src/main.rs:402-405`
**Issue:**
- **The two timers:** `send_with_timeout` wraps `state_event` in `tokio::time::timeout(5 s)`. Inside, `spawn_blocking` runs `SidecarState::invoke`, and `timeout_for("steamPollStateEvent")` sets that invoke's own timeout to the same 5 s.
- **The outer timer always wins:** it starts before the blocking task is scheduled and before the frame is written, so it fires first. The future is dropped, but a `spawn_blocking` task cannot be cancelled.
- **The frame can be written late:** the steampoll runtime caps blocking threads at 8. Under load, a queued closure that has not started yet still runs later and writes the frame to the sidecar. By then the event has already been re-enqueued as not acked, and a newer event for the same app may already have been applied. So the stale event lands last.
- **An answered ack can be discarded:** a reply that arrives just before 5 s on the invoke side is thrown away by the outer timer.
- **The comment is inaccurate:** main.rs:403 says the bound is matched so that "the pending entry is removed then". It does not hold the two timers in a safe relationship.

**Fix:** Set the shell invoke bound clearly below the crate bound (e.g. `ACK_TIMEOUT_MS - 500`). Inside the blocking closure, check a deadline captured before `spawn_blocking` and skip the write once it has passed:
```rust
let deadline = std::time::Instant::now() + Duration::from_millis(ACK_TIMEOUT_MS - 500);
spawn_blocking(move || {
    if std::time::Instant::now() >= deadline { return Err("steamPollStateEvent:stale".into()); }
    state.invoke("steamPollStateEvent".to_string(), vec![arg])
})
```

#### WR-03: Shell contract for `steampoll_read_running_app_id` rejects `[]`, which the TS schema and the crate both accept

**File:** `src-tauri/src/ipc_contract.rs` (`SteampollReadRunningAppIdArgs::from_args`, new hunk near the end of the file), `src-tauri/src/steampoll_dispatch.rs:89-92`
**Issue:**
- **What each layer accepts:** the zod schema is `z.tuple([z.object({ strict }).strict().optional()])` (rustInvoke.ts:391), so `[]` and `[undefined]` are both valid sends. The crate's dispatch handles the missing case explicitly (`match args.first() { None => StrictArgs::default(), ... }`). The shell's generated `from_args` does `args.first().ok_or_else(bad-args)`, so `[]` is rejected before the crate sees it.
- **Why it matters:** `[undefined]` is sent over JSON as `[null]`, which fails `from_value::<Struct>(Null)`. The sidecarTransport.ts doc comment says "the object is optional".
- **Why it is latent:** today's only caller (`runningPoll.ts:22`) always passes `{ strict }`. The first caller that omits the object will get `bad-args`. In the non-strict path that is silently turned into `0` ("nothing running"), which can unblock a native delete while a game is running.

**Fix:**
```rust
impl SteampollReadRunningAppIdArgs {
    pub(crate) fn from_args(args: &[Value]) -> Result<Self, String> {
        match args.first() {
            None | Some(Value::Null) => Ok(Self { strict: None }),
            Some(first) => serde_json::from_value(first.clone())
                .map_err(|_| "steampoll_read_running_app_id:bad-args".to_string()),
        }
    }
}
```
Also fix the generator so that an optional tuple element produces this shape. Also make the crate treat `Some(Null)` like `None`.

### Info

#### IN-01: `steampoll_exit_shutdown` calls `Handle::block_on` without the `try_current` guard the crate uses

**File:** `src-tauri/src/steampoll_dispatch.rs:186-188`
**Issue:** `gamelib_steampoll::dispatch::block_on` refuses to run inside a runtime (`wrong-thread`). The exit hook calls `runtime::handle().block_on(...)` directly. `handle_exit` runs on the main thread from `RunEvent::Exit` today, so this is fine. But if it is ever reached from a runtime context, it panics inside the event-loop callback. That would skip `shutdown_child()`, `wake_lock_release_all()` and the socket cleanup that follow it.
**Fix:** Guard with `tokio::runtime::Handle::try_current().is_err()`. Otherwise, run the wait on a `std::thread` and join it.

#### IN-02: Exit waits run one after another, so worst-case quit time is about 10 s plus the steamcm bound

**File:** `src-tauri/src/main.rs:751-758`
**Issue:** The depot `cancel_all_and_wait(5 s)`, `steamcm_exit_shutdown` and `steampoll_exit_shutdown` (another 5 s) run in sequence. A poll cancelled mid-transition can be waiting on a 5 s sidecar ack, so a hung sidecar stretches quit time noticeably.
**Fix:** Cancel the steampoll registry (`cancel_all`) before the depot wait, then wait on both against one shared deadline.

#### IN-03: Shell-side arg validation has drifted from the crate's, so the first-layer check is weaker than intended

**File:** `src-tauri/src/ipc_contract.rs` (Steampoll*Args structs)
**Issue:** The shell structs do not use `deny_unknown_fields`, while every crate struct does. They also accept `appId: i64` (the crate uses `u32`), `claimId: i64` (the crate uses `u64`) and `bridgeAuthoritative: Option<bool>`, which accepts `null` (the crate uses `bool` with a default). The crate re-parses everything, so nothing is unsafe today. But the shell layer catches nothing the crate would not, and the error a caller sees depends on which layer rejected.
**Fix:** Emit `deny_unknown_fields` and the narrower integer types from the generator, or drop the shell pre-parse for steampoll channels and rely on the crate.

---

_Reviewed: 2026-11-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

## Part C — TS backend, sidecar, IPC types, tests

Finding IDs below are local to this part (prefix them with C- when referring, e.g. C-CR-01).

## Phase 80 (Part C): Code Review Report

**Reviewed:** 2026-11-16
**Depth:** standard (large pre-phase files reviewed as `git diff b1f3f4a05^..HEAD` hunks only)
**Files Reviewed:** 48
**Status:** issues_found

### Summary

The deletion is broadly faithful. Every per-tick library write the TS loops made (installed, survivor and not-installed uninstall branches, installIncomplete, update-done `invalidateSteamUpdateState` + push, mac-arch verdict, forced-Windows clear, bridge uninstall) is reached through `steamPollStateEvent`. Rust drives toasts and statuses through effect continuations. The zod discriminated union matches `events.rs` kind-for-kind and field-for-field. The rustInvoke arg schemas match the crate `PollOptions` / start-args field sets. No new Node timers or handles were added, so the sidecar exit contract holds on the TS side.

The main regression class: in-process synchronous bookkeeping (activePolls lookups, the notice-seq counter, the bridge-finalized set, the running-poll claim, the in-flight map) became an awaited or fire-and-forget rustInvoke. These calls were never failure points before. Now a rejected or slow invoke can abort a kill, mask an install's result, drop its `done` status and toast, or report a handoff that already happened as a failure. The shell answers each rustInvoke on its own worker thread (`sidecar.rs` `start_reader`), so the old "same synchronous turn" ordering guarantees are gone. Two of them (the launch-watch claim and the bridge-finalized read) protected fixes for bugs seen in live use. The event channel also has no cross-language schema parity test. A rejected or not-applied event is retried only at the next sidecar READY.

No Criticals: every Warning needs a steampoll rustInvoke failure, a timeout, or an interleaving race to trigger. None is a defect on the happy path.

### Warnings

#### WR-01: Kill/stop of a Steam game now depends on a steampoll rustInvoke succeeding

**File:** `src/backend/gamedetails/dispatch.ts:185-193`, `src/backend/storeManagers/steam/library/installPolling.ts:45-57`, `src/backend/storeManagers/steam/games.ts:590`
**Issue:** `kill()` now awaits `isDelegatedInstallPolling` (a `steampoll_status` invoke) before `deps.aborts.call(appName)` and before `getGame(appName).stop()`. If the invoke rejects (rustInvoke timeout, shell restart), `kill` throws. Neither the abort controller nor `stop()` runs, so the user's Stop/Cancel does nothing. Inside `stop()`, `await cancelDelegatedInstall(...)` has the same problem: a rejection there skips the bridge-kill route below it, so a running bridge game cannot be stopped. Before this change both checks were synchronous Map reads and could not fail.
**Fix:** Treat a failed status read as "not delegated", so the abort and stop still run:
```ts
const delegated = await isDelegatedInstallPolling(deps, appName).catch((e) => {
  logWarning(`kill: steampoll status failed, assuming not delegated: ${String(e)}`, LogPrefix.Steam)
  return false
})
```
In `games.ts`, use `if (await cancelDelegatedInstall(this.deps, this.appId).catch(() => false)) return`.

#### WR-02: Bridge install `finally` and `catch` now await a rustInvoke; a rejection drops `done` and the toast, and masks the real outcome

**File:** `src/backend/storeManagers/steam/gameInstallBridge.ts:103-110, 168, 180, 752-764, 458, 569, 633`
**Issue:** `setBridgeInstallFinalized` used to be a synchronous Set write. It is now an awaited `steampoll_bridge_finalized` invoke at the top of the success `finally` and of `clearFinishing()`. If it rejects:
- In the `finally` (752), `sendGameStatusUpdate(done)` and the single "Installation Finished" toast never run. A successful install throws, and the UI stays on "finishing".
- In the `catch` (180), the original install error is replaced by the transport error and `done` is skipped.
- At 458 a transport hiccup aborts the install before it starts.
- At 569 and 633, `await stopInstallPolling` rejecting skips `removePerGameBridgeBottle`, which leaks the bottle on the shim/CEG refusal paths.

**Fix:** Make the marker best-effort and keep the status send unconditional:
```ts
async function setBridgeInstallFinalized(g: SteamGame, finalized: boolean) {
  await invokeSteamPoll(g.deps, RUST_STEAMPOLL_BRIDGE_FINALIZED, { appId: g.appId, finalized })
    .catch((e) => logWarning(`bridge finalized marker failed for ${g.appId}: ${String(e)}`, LogPrefix.Steam))
}
```
Apply the same `.catch` to the two `stopInstallPolling` calls before bottle removal.

#### WR-03: Failure notices and post-handoff bookkeeping now throw when steampoll is unreachable

**File:** `src/backend/storeManagers/steam/gameUninstall.ts:194-215, 356-366, 162, 380`; `src/backend/storeManagers/steam/updateNative.ts:136-140, 164-166`
**Issue:**
- `failUninstall` and `pushNotice` await `noticeSeq()` (`steampoll_next_notice_seq`) before they send `steamRequestNotice`. On a rejection, the failure path throws instead of returning `{ failed: true }`. The user gets no notice, and `uninstallGameCallback`'s single `done` contract is broken. Before this change the seq was an in-process counter.
- `uninstall()` (162) and the `steam-uninstalled` route (380) `await startUninstallPolling` after `openExternal(steam://uninstall)` has already handed off to Steam. A rejection reports the uninstall as failed, and `clearPendingAdoption` is skipped.
- `updateRegisteredSteamGame` awaits `startInstallPolling` and `pollOwnsUpdate` after InstallApp or `openExternal` already started the update. A rejection turns a running Steam update into an error result.
- `pollOwnsUpdate` is now a separate status read after the start. If the Rust update poll finishes before that read, it returns false, and the queue sends a second terminal `done` on top of the poll's own.

**Fix:** Fall back to a local monotonic counter (or `Date.now()`) when `noticeSeq` rejects; the frontend only needs ordering. Wrap the post-handoff `startUninstallPolling`/`startInstallPolling` in `.catch(logWarning)`. Have `steampoll_install_start` return whether this call registered an update poll, and drop the separate `pollOwnsUpdate` status read.

#### WR-04: Unhandled promise rejections introduced by the port

**File:** `src/backend/storeManagers/steam/steamLaunchedDeps.ts:60-85`; `src/backend/storeManagers/steam/library/uninstallPolling.ts:215, 251`
**Issue:**
- `rustPollerHold` creates the `claim` promise eagerly, but attaches a handler only when the release closure is first called, at the end of the launch watch (minutes later). If `steampoll_running_hold` rejects, it is an unhandled rejection at that moment. Only later does Node add a `PromiseRejectionHandledWarning`.
- `pollUninstallOnce` still runs in production (bridge, bottle-direct, native-direct and remove-all-copies completions). It fires `void stopUninstallPolling(...)`, which is now a rustInvoke with no `.catch`. It also makes a pointless round trip on direct paths that never started a Rust poll.

The process guard is log-only, so the sidecar does not crash, but these are exactly the defects that guard is documented as "defence in depth" for.
**Fix:** Attach a handler at creation, for example `const claim = invokeSteamPoll(...).then(id => id as number, (e) => { logWarning(...); return null })`, and skip the release when the claim is `null`. In `pollUninstallOnce`, use `void stopUninstallPolling(deps, appId).catch(() => undefined)`.

#### WR-05: The bridge-finalized check is now read at tick observation, not at the send site (regression risk for quick 261031-ihs)

**File:** `src/backend/storeManagers/steam/gameInstallBridge.ts:752-758` (with `src-tauri/crates/gamelib-steampoll/src/install_once.rs:548`, `install_loop.rs:677`)
**Issue:** The deleted TS read `isBridgeInstallFinalized` synchronously at the send site, which is the whole point of 261031-ihs ("Read synchronously at the send site"). Rust snapshots `bridge_finalized` into `obs` at the start of the tick. It carries the snapshot through the `installed` Transition, waits up to 5 s for the sidecar ack, and only then emits the `installing` / `steam-bridge-finishing` status. Meanwhile the installer's `finally` sets the flag over a separate rustInvoke and sends `done` over the sidecar stdout. A short bridge tail (no redists, prefetch fails fast) can now produce "finishing" after `done`, and the game stays on "finishing" until restart. The TS side cannot fix this alone; it is listed here because the TS change is what moved the read.
**Fix:** In Rust, re-read `bridge_finalized` in the `Continuation::Installed` handler, at the moment the status is emitted, instead of carrying `obs.bridge_finalized`. Add a rust-arm test where finalization lands between the observation and the ack.

#### WR-06: Ordering of fire-and-forget mirror and claim invokes is no longer guaranteed

**File:** `src/backend/storeManagers/steam/gameSessionState.ts:105-139`; `src/backend/storeManagers/steam/steamLaunchWatch.ts:166-185`
**Issue:**
- `MirroredInFlightMap` sends `native_in_flight {true}` on `set` and `{false}` on `delete` as independent fire-and-forget invokes. The shell answers each rustInvoke on its own worker thread, so a fast `set`→`delete` (an immediate abort or refusal) can land in Rust as false-then-true. Rust's `native_in_flight` set then stays true, which suppresses the install poll's grace give-up (`install_loop.rs:829-844`). `Map.prototype.clear()` is not overridden, so a `clear()` would silently skip the mirror.
- `steamLaunchWatch.ts:171-172` still says "The claim above already silences the poller for this appId, so this runs in the same synchronous turn". That is no longer true: `pollerHold` is an async invoke. The Rust running poll can emit `playing`/`done` for the app before the hold lands, and the `launching` send now happens after an async `last_app_id` read issued in parallel with the hold.

**Fix:** Serialise the mirror per appId with a promise chain (`this.tail = this.tail.then(() => invoke(...))`), or send the full in-flight set each time so the last write wins. Override `clear()`. For the launch watch, await the hold before deciding on `launching` (`startSteamLaunchWatch` is already async-capable via `whenPollerReports`), and update the stale comment.

#### WR-07: `refreshInstallState` can reject mid-reconcile after partial writes

**File:** `src/backend/storeManagers/steam/library/refresh.ts:180-186, 298-311`
**Issue:** `hasActiveInstallPoll` (a lazy `steampoll_status` invoke) is awaited inside the per-entry loop, outside the WR-01 `try` that guards the scans. If that invoke rejects, the loop aborts after earlier entries were already mutated, persisted and pushed. The function then rejects to its callers: the `rearmSettled` handler returns `applied:false`, which makes Rust re-queue it, and `localLibrary.ts:44` gets the rejection. The scan section deliberately skips the reconcile on a transport failure; this new call breaks that contract.
**Fix:** Pre-fetch the status inside the existing `try`, next to `withoutSteamRestartHolds`, which already makes the same call. Reuse that one result for both the hold filter and the active-poll set, instead of a second lazy read in the loop.

#### WR-08: The `steamPollStateEvent` schema is hand-mirrored, stricter than its producer, and untested against it; rejected events are lost for the session

**File:** `src/common/types/ipc/sidecarInternal.ts:96-146`; `src/backend/sidecar/steamPollEventRegistration.ts:168-183`
**Issue:**
- Rust `size_on_disk` is an unvalidated raw ACF string (`acf_state.rs:134` defaults only `None` to `"0"`; `Some("")` passes through). Zod requires `numericId` (`^\d+$`, max 20). `buildid` is capped at 32 and `installPath` at 4096. An event that fails `validateInbound` is rejected before the handler runs.
- `Outbox::flush` runs only from `mark_ready` (`outbox.rs:93-95`). So an event that is rejected, returns `applied:false` (any handler throw), or exceeds `ACK_TIMEOUT_MS` (5 s) is not retried until the next sidecar restart. The library badge never flips in-session, even though Rust's post-ack continuation still sends the "Installation Finished" toast.
- `rearmSettled` awaits a full `refreshInstallState` (several scans plus a status call) inside that 5 s budget at boot, when the sidecar is busiest.
- `steamPollChannelParity.test.ts` pins the op list, but nothing checks `StateEvent`/`AckReply` against the zod union, so the next Rust field change drifts silently.

**Fix:** Relax `sizeOnDisk` to `z.string().max(32)` (the consumer already does `Number(...)`), or normalise it in Rust. For `rearmSettled`, ack first and run the reconcile detached (`void refreshInstallState().catch(log)`). Add a parity test that serialises each `StateEvent` variant from a Rust fixture, for example via `gamelib-steampoll-cli`, and parses it with the zod schema. Raise the in-session retry gap with the Part A reviewer.

#### WR-09: `pollUninstallOnce` duplicates the Rust uninstall completion pipeline

**File:** `src/backend/storeManagers/steam/library/uninstallPolling.ts:75-269`
**Issue:** The Rust uninstall loop (`uninstall.rs:150-270`) now owns the survivor probe, the forced-Windows clear, the bridge-uninstalled step, the toast and the status. The TS `pollUninstallOnce` still implements the same pipeline in full for the five direct-removal call sites (`gameUninstall.ts:247, 319, 491, 719, 797, 827`; `gameInstall.ts:552`; `removeAllCopies.ts:92`). The two now differ:
- TS clears forced-Windows and logs per root.
- Rust emits `BridgeUninstalled` for a bridge source; TS relies on the callers.
- The survivor gating also differs: TS requires `existing` to take the survivor branch.

The LOCKED operator decisions (HOARD three-root case, the copySurvives toast) now live in two places with no parity test across them. This is the drift the port was meant to remove.
**Fix:** Route the direct paths through a single-tick Rust op, for example `steampoll_uninstall_once`, that returns the same effects as the loop, or have them start a Rust uninstall poll and let its first tick complete. Then delete `pollUninstallOnce`.

### Info

#### IN-01: Dead parameters and unsound casts left by the deletion

**File:** `src/backend/storeManagers/steam/library/runningPoll.ts:7-10, 45, 57`; `src/backend/storeManagers/steam/library/acfState.ts:54, 79, 193, 287, 342`; `src/backend/storeManagers/steam/library/uninstallPolling.ts:283`; `src/backend/storeManagers/steam/library/acfUpdateState.ts:5`
**Issue:**
- `RunningPollProbeDeps.runner` and `.paths` and the `_platform` parameters are unused now that the probe is Rust.
- `readAcfState`, `enumerateSteamInstallCopies`, `removeCopyViaRust`, `scanDownloadingAppIds` and `startUninstallPolling` take `SteamLibrariesDeps & ...` (unused) and cast `deps as unknown as RustInvokeDeps`. A caller without `requestRustInvoke` type-checks, then fails at runtime as a TypeError that `readAcfState` swallows into `'unknown'`, so an uninstall would never complete.
- The `readAcfState` JSDoc still says native scans use `getSteamLibraries(deps)`.

**Fix:** Change the deps types to `Pick<ManagerDeps, 'requestRustInvoke' | 'config'> & BottleSettingsDeps`, drop the casts and the dead fields, and update the doc.

#### IN-02: `steampoll_running_start` and `steampoll_running_stop` are allowlisted with no TS caller

**File:** `src/common/types/sidecarTransport.ts:672-683`, `src/common/types/ipc/rustInvoke.ts:401-402`
**Issue:** The shell starts the running poll at boot (`steampoll_boot`). Nothing in `src/` invokes these channels, yet they stay on the sidecar's rustInvoke surface, so sidecar code can stop the shell-owned poller.
**Fix:** Remove them from `RUST_INVOKE_CHANNELS`, or document why the sidecar needs them.

#### IN-03: Inconsistent invoke wrappers and test-only exports

**File:** `src/backend/storeManagers/steam/steamLaunchedDeps.ts:91-94`; `src/backend/storeManagers/steam/gameUninstall.ts:194`; `src/backend/storeManagers/steam/updateNative.ts:39`
**Issue:** `rustPollerReports` and `noticeSeq` call `deps.requestRustInvoke` directly instead of `invokeSteamPoll`, which skips its channel typing and debug log. `noticeSeq` and `pollOwnsUpdate` are exported only for tests.
**Fix:** Use `invokeSteamPoll` everywhere. Keep these helpers module-private, or move them to a small module.

#### IN-04: The handler ignores `seq`; replay is idempotent per event but not ordered against TS-originated writes

**File:** `src/backend/sidecar/steamPollEventRegistration.ts:102-159`
**Issue:** The header claims R1 idempotent replay. That holds for one event applied twice. But a queued `installed` replayed at READY can overwrite a newer state written by TS (`pollUninstallOnce`, `refreshInstallState`), because `seq` is never compared. An unknown future `kind` fails validation and is re-queued forever (bounded by the outbox key).
**Fix:** Keep a per-(appId, kind) last-applied seq in the session state and answer `applied:true` without mutating when the incoming seq is not newer. Note the cross-source caveat in the header.

#### IN-05: Weak or dead test scaffolding

**File:** `src/backend/storeManagers/steam/__tests__/library.refresh.test.ts:65-78`; `src/backend/storeManagers/steam/__tests__/pollsRustBranch.uninstallRunning.test.ts:90-92, 109-126`; `meta/genI18nGolden.ts:41`
**Issue:**
- `holdTransport` answers `steampoll_status`, but the code under test reads `deps.requestRustInvoke` (the `statusOverride` mock), so that branch is dead.
- The empty `beforeEach`/`afterEach` do nothing.
- The "never spawn" assertion is tautological, because `runner` is no longer reachable from the readers.
- `REPO_ROOT = process.cwd()` makes `i18nGolden.test.ts` depend on jest being run from the repo root.

**Fix:** Remove the dead transport and the empty hooks. Have the generator take the root as a parameter, and have the test pass `join(__dirname, '../../..')`.

#### IN-06: `startInstallPolling` silently drops a numeric interval

**File:** `src/backend/storeManagers/steam/library/installPolling.ts:23-36`
**Issue:** A bare-number second argument becomes `{}`, although Rust `PollOptions` accepts `intervalMs`. `startUninstallPolling` forwards it. The asymmetry is surprising, and `resume.ts:255` relies on the default.
**Fix:** Forward `{ intervalMs }` for symmetry, or remove the number overload.

---

_Reviewed: 2026-11-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
