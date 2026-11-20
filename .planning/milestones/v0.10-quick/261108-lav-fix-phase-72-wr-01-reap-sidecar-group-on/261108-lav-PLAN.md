---
phase: quick-261108-lav
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/sidecar.rs
  - src-tauri/src/shell_state.rs
  - src-tauri/src/main.rs
  - src/backend/__tests__/sidecarShutdownFlagSource.test.ts
autonomous: true
requirements: [WR-01]

must_haves:
  truths:
    - "When the sidecar dies unexpectedly (e.g. its fatal uncaughtException exit(1)), every surviving member of its process group (comet, bridge helper, runner CLIs, games) is SIGKILLed on macOS/Linux BEFORE the 'GameLib stopped working' dialog appears, even though the sidecar itself has already exited"
    - "On Windows the same dead-sidecar path drops the kill-on-close Job Object before the dialog, so the tree dies without waiting for RunEvent::Exit"
    - "Choosing Restart or Quit in that dialog leaves no orphan from the old instance, because the tree is already reaped before the user picks either button"
    - "After the dead-sidecar reap, the later RunEvent::Exit shutdown_child() does NOT signal the recorded pgid again. The user may sit at the dialog for minutes, and by then the pgid may have been recycled to an unrelated process group"
    - "kill_process_group refuses pgid <= 1, so it can never become kill(-1) (every process the user owns) or kill(0) (the shell's own group)"
  artifacts:
    - path: "src-tauri/src/sidecar.rs"
      provides: "cfg(unix) kill_process_group(pgid) seam; surface_dead_sidecar calls state.reap_dead_sidecar_tree() before the dialog"
      contains: "fn kill_process_group"
    - path: "src-tauri/src/shell_state.rs"
      provides: "SidecarState::reap_dead_sidecar_tree + tree_reaped flag; shutdown_child skips the unix group signal once tree_reaped is set"
      contains: "fn reap_dead_sidecar_tree"
    - path: "src-tauri/src/main.rs"
      provides: "tree_reaped: AtomicBool::new(false) at the SidecarState construction site; unix #[test]s proving the seam"
      contains: "kill_process_group_reaps_members_after_leader_exits"
    - path: "src/backend/__tests__/sidecarShutdownFlagSource.test.ts"
      provides: "comment-stripped source pin: surface_dead_sidecar reaps before .dialog(), with no reap gated on a liveness check"
  key_links:
    - from: "surface_dead_sidecar (sidecar.rs)"
      to: "SidecarState::reap_dead_sidecar_tree (shell_state.rs)"
      via: "direct call before app.dialog()"
      pattern: "reap_dead_sidecar_tree\\(\\)"
    - from: "reap_dead_sidecar_tree (unix arm)"
      to: "kill_process_group"
      via: "SIGKILL to -pgid BEFORE child.wait(), so the zombie leader still pins the pgid"
      pattern: "kill_process_group\\("
---

<objective>
Close phase-72 code-review finding WR-01 (`.planning/phases/72-renderer-trust-boundary-and-process-hardening/72-REVIEW.md` lines 102-116).

`surface_dead_sidecar` (sidecar.rs ~644-691, added by plan 72-10) SIGKILLs the sidecar's process group only when `!gone`. In the usual dead-sidecar case the sidecar already exited via plan 72-08's fatal `uncaughtException` `exit(1)`. Its `try_wait()` then reports it gone, so the group is never signalled and its children are orphaned. The fix is an unconditional group reap before the dialog. On unix that is `kill(-pgid, SIGKILL)`, which still works after the leader has exited: a process group outlives its leader while members remain. On Windows it is `child.kill()` plus dropping the plan-72-12 Job Object.

Purpose: a dead sidecar must not leave comet, bridge helpers, runner CLIs or games running unsupervised, and none of them may survive into a restarted instance.
Output: an `AppHandle`-free, unit-tested `kill_process_group` seam, a `reap_dead_sidecar_tree` method, the rewired `surface_dead_sidecar`, a `tree_reaped` guard in `shutdown_child`, and one jest source pin.

**Planner finding: the review's "Restart skips RunEvent::Exit" sub-claim is wrong for this call site. Record this in the SUMMARY.** Tauri 2.11.5 is the version pinned in Cargo.lock. Its `AppHandle::restart()` (`~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/tauri-2.11.5/src/app.rs:588-612`) skips the exit events ONLY when called on the main thread. `surface_dead_sidecar` runs on the reader thread that `start_reader` (`sidecar.rs:407-408`) creates with `thread::spawn`. From there `restart()` takes the background branch: `restart_on_exit=true` + `request_exit`. That fires `RuntimeRunEvent::Exit` → the shell's `RunEvent::Exit` callback → `shutdown_child()`, and only then `process::restart` (app.rs:1430-1437). This is the same evidence REQ-34.3-06 / D-05 recorded at `store_embed.rs:2204-2228`.

So this plan does NOT add a `shutdown_child()` call before `app.restart()`. Doing so would break the pin "shutdown_child() has exactly one call site" (`src/backend/__tests__/tauriShellSource.test.ts:996-1000`) and contradict D-05. The cleanup the review asked for before restart still happens on both platforms. `reap_dead_sidecar_tree()` runs before the dialog, so by the time Restart or Quit is chosen the tree is already gone. Only the main-thread vs background-thread distinction makes the review's concern moot.

The Windows note in the review is also closed. Before this plan the job was dropped only inside `shutdown_child`. Now it is dropped in the pre-dialog reap.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@.planning/phases/72-renderer-trust-boundary-and-process-hardening/72-REVIEW.md
@src-tauri/src/shell_state.rs
@src/backend/__tests__/sidecarShutdownFlagSource.test.ts

Read these by RANGE only. main.rs is 8116 lines, so never read it whole.
- src-tauri/src/sidecar.rs lines 190-282 (configure_sidecar_process_group, create_kill_on_close_job) and 620-692 (on_sidecar_eof, surface_dead_sidecar)
- src-tauri/src/main.rs lines 860-880 (the single `SidecarState {` construction site) and 1867-1900 (the top `#[cfg(test)] mod tests` holding the `on_sidecar_eof_*` tests — add the new tests next to them, in the same style)

<interfaces>
Current code the executor works against (extracted, do not re-explore):

shell_state.rs — `pub(crate) struct SidecarState` fields: stdin, pending, abandoned, counter, `child: Mutex<Child>`, `shutting_down: AtomicBool`, `eof_surfaced: AtomicBool`, `#[cfg(windows)] job: Mutex<Option<std::os::windows::io::OwnedHandle>>`.
`impl SidecarState`: `begin_shutdown(&self)`, `next_id`, `shutdown_child(&self)`. In shutdown_child: begin_shutdown, then lock child (recovering a poisoned lock). The unix block does `let pgid = child.id() as i32;`, `libc::kill(-pgid, SIGTERM)`, a 2 s `try_wait` grace loop, then SIGKILL `-pgid` if `!exited`. The not(unix) block does `child.kill()`, then the windows sub-block `self.job.lock()` → `.take()` → `drop`. Both paths finish with `child.wait()` and its log line. The next fn after it is `fn write_raw`, which the jest pin uses as a slice anchor, so keep that order.

sidecar.rs — `fn surface_dead_sidecar(app: &AppHandle, state: &Arc<SidecarState>)` is private and called only from `on_sidecar_eof`'s closure in start_reader. Its current body: an inner block with a 10×100 ms `try_wait` loop that sets `gone`, then `if !gone { unix: libc::kill(-pgid, SIGKILL) / not(unix): child.kill(); child.wait() }`. Then `shell_eprintln!("[shell] sidecar stdout closed outside shutdown; showing dead-sidecar dialog")`, `app.dialog().message(..).title("GameLib stopped working")...blocking_show()`, `state.begin_shutdown()`, `if restart { app.restart(); } else { app.exit(0); }`.

main.rs — `mod sidecar; mod shell_state; use sidecar::*; use shell_state::*;`. Top-level imports include `std::process::{Child, ChildStdin, Command, Stdio}`, `std::io::{BufRead, BufReader, Read, Write}`, `std::sync::atomic::{AtomicBool, ...}`, `std::time::Duration`, `std::thread`. `libc` is a `[target.'cfg(unix)'.dependencies]` crate. The first `mod tests` (line 1868) reaches parent items, e.g. it calls `on_sidecar_eof` bare. Check the head of that module for its `use` lines and mirror whatever it does.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Unconditional dead-sidecar tree reap (kill_process_group seam, reap_dead_sidecar_tree, tree_reaped guard) with Rust unit tests</name>
  <files>src-tauri/src/sidecar.rs, src-tauri/src/shell_state.rs, src-tauri/src/main.rs</files>
  <behavior>
    - kill_process_group(0), kill_process_group(1), kill_process_group(-5) each return Err with ErrorKind::InvalidInput and send no signal
    - A process group outlives its leader. Spawn `/bin/sh` in its own group (`CommandExt::process_group(0)`) running `sleep 30 & echo $!`, with stdout piped and stdin/stderr null. Read ONE line with BufReader::read_line to get the member pid (never read_to_end at this point: the background sleep holds the pipe open). Then `wait()` the sh leader. `libc::kill(member, 0) == 0`: the member is alive and orphaned, and its group's leader is gone. `kill_process_group(leader_pid)` returns Ok. EOF then arrives on the rest of the pipe within 5 s: read_to_end on a spawned thread, signalled over an mpsc channel and checked with `recv_timeout(Duration::from_secs(5))`. EOF is the death signal on purpose. A killed process closes its fds even while it is still an unreaped zombie, so the check stays correct on a CI container with no PID-1 reaper, where a `kill(pid,0)` probe would wrongly report a zombie as alive
    - kill_process_group on the now-empty group returns Err whose raw_os_error() == Some(libc::ESRCH) and does not panic
  </behavior>
  <action>
**RED.** Add three `#[cfg(unix)]` tests to main.rs's first `#[cfg(test)] mod tests`, next to the `on_sidecar_eof_*` tests, matching the behavior block above:
- `kill_process_group_rejects_non_positive_and_init_pgids`
- `kill_process_group_reaps_members_after_leader_exits`
- `kill_process_group_on_empty_group_is_esrch`

The third may reuse the second's setup: call the helper a second time after EOF.

The spawned `/bin/sh` reads no user profile, and the fake-HOME convention scans only `.ts/.tsx/.cjs/.js` under `src/` and `meta/`, so it does not apply. For hygiene anyway, give the Command `.env_clear().env("PATH", "/bin:/usr/bin")`. Note this in a one-line comment.

Run `cargo test --bin gamelib-shell kill_process_group` and confirm it fails to compile or fails (RED).

**GREEN.**

(a) sidecar.rs: next to `configure_sidecar_process_group`, add `#[cfg(unix)] pub(crate) fn kill_process_group(pgid: i32) -> std::io::Result<()>`.
- If `pgid <= 1`, return `Err(std::io::Error::new(ErrorKind::InvalidInput, ..))`. The doc comment must say why: `-pgid` with pgid 1 is `kill(-1)`, every process the user owns, and with 0 it is the caller's own group.
- Otherwise call `libc::kill(-pgid, libc::SIGKILL)` inside an `unsafe` block with a `// SAFETY:` comment in the existing style. Map a `-1` return to `Err(std::io::Error::last_os_error())` and anything else to `Ok(())`.
- The doc comment states that a group outlives its leader while members remain, which is why this works after the sidecar's own exit(1).

(b) shell_state.rs:
- Add a `pub(crate) tree_reaped: AtomicBool` field with a doc comment. It latches once `reap_dead_sidecar_tree` has killed and waited the tree, and tells `shutdown_child` not to signal the pgid again.
- Add `pub(crate) fn reap_dead_sidecar_tree(&self)` to `impl SidecarState`, placed BEFORE `shutdown_child` so `fn shutdown_child … fn write_raw` stays adjacent for the existing jest slice.
  - Lock `child`, recovering a poisoned lock as shutdown_child does.
  - unix arm: `let pgid = child.id() as i32;` then `kill_process_group(pgid)`. Log any error EXCEPT ESRCH (an empty group is the benign case) with `shell_eprintln!`.
  - not(unix) arm: `let _ = child.kill();`, then a `#[cfg(windows)]` sub-block that takes and drops the job exactly as shutdown_child does (per 72-12 D-20).
  - Both arms then call `child.wait()` and log a failure. Then `self.tree_reaped.store(true, SeqCst)` while still holding the lock.
  - Comment the ordering: the group SIGKILL happens BEFORE any wait/try_wait reaps the leader. An unreaped zombie leader keeps its pid, and with it the pgid, from being recycled, so the signal cannot hit an unrelated group. This is why the old `try_wait` "is it gone?" loop is removed rather than kept in front.
  - Do not call `begin_shutdown()` here. The dialog path already sets it after the dialog, and the jest pin "shutdown_child sets the flag before any kill" is untouched.
- In `shutdown_child`'s `#[cfg(unix)]` block, wrap the whole SIGTERM/grace/SIGKILL sequence in `if !self.tree_reaped.load(SeqCst) { … }`. Keep `begin_shutdown()` first in the fn so it stays textually before the first `libc::kill`. Add a comment: after a dead-sidecar reap, the user may sit at the dialog for minutes, during which the old pgid can be recycled to an unrelated group. The final `child.wait()` on an already-waited std Child returns the cached status and stays harmless.
- Leave the not(unix) path as is. `child.kill()` on an exited Windows process handle is harmless, and the job is already `None`.

(c) main.rs: add `tree_reaped: AtomicBool::new(false),` at the single `SidecarState {` literal (~line 873, next to `eof_surfaced`).

(d) sidecar.rs `surface_dead_sidecar`:
- Replace the whole inner `{ … try_wait loop … if !gone { … } }` block with one call, `state.reap_dead_sidecar_tree();`, placed before the existing `shell_eprintln!` and dialog.
- Rewrite the fn's doc comment. It reaps the sidecar's whole tree unconditionally before the dialog (WR-01): the unix group SIGKILL works even after the leader's exit(1), and the Windows path drops the job.
- Above `app.restart()`, add a comment citing the planner finding in this plan's objective. This fn runs on the reader thread, so tauri 2.11.5 `restart()` takes its background branch, which fires RunEvent::Exit → shutdown_child. The tree is already reaped anyway. Per REQ-34.3-06/D-05 and tauriShellSource's single-call-site pin, no `shutdown_child()` call belongs here.

Do NOT write the literal text `shutdown_child()` inside any NEW code line in main.rs, sidecar.rs or shell_state.rs. The comment-stripping pin counts call sites in the concatenated shell source; comments are stripped, so the restriction applies to code only.

Run the tests again: GREEN. Refactor only if clippy (verify step) flags something new.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib/src-tauri && cargo test --bin gamelib-shell 2>&1 | tail -15 && cargo +1.99.1 clippy --workspace --all-targets --message-format=json > /private/tmp/claude-501/clippy-261108-lav.json; node ../meta/clippyRatchet.cjs /private/tmp/claude-501/clippy-261108-lav.json --list</automated>
  </verify>
  <done>
`cargo test --bin gamelib-shell` passes, including the three new `kill_process_group_*` tests and the existing `on_sidecar_eof_*` tests. The clippy ratchet exits 0, with no count above the darwin ceiling. If toolchain 1.99.1 is not installed locally, run `rustup toolchain install 1.99.1 --component clippy` first; it is the CI-pinned toolchain. `surface_dead_sidecar` no longer contains `gone` or a `try_wait` loop.
  </done>
</task>

<task type="auto">
  <name>Task 2: Jest source pin for the pre-dialog reap, full verification, pathspec-only commit</name>
  <files>src/backend/__tests__/sidecarShutdownFlagSource.test.ts</files>
  <action>
In `sidecarShutdownFlagSource.test.ts`, add a new `describe('dead-sidecar tree reap (WR-01)', …)` that reuses the file's existing `code()` and `slice()` helpers. It covers the Windows/Linux arms that local macOS `cargo test` cannot exercise.

1. Assertions on `slice(code('sidecar.rs'), 'fn surface_dead_sidecar', '.blocking_show()')`:
   - It contains `reap_dead_sidecar_tree()`.
   - That call's index is less than `indexOf('.dialog()')`.
   - It contains neither `!gone` nor `try_wait`, so no reap gated on liveness can return.
2. Assertions on `slice(code('shell_state.rs'), 'fn reap_dead_sidecar_tree', 'fn shutdown_child')`:
   - It contains `kill_process_group(`.
   - Its `job.lock()` is present (the Windows job drop).
   - `kill_process_group(` comes before the first `child.wait()` (kill-before-reap ordering).
   - It contains `tree_reaped.store(true`.
3. The `fn shutdown_child … fn write_raw` slice of shell_state.rs contains `tree_reaped.load(`.

Keep a short file-header-style comment on the new describe block citing WR-01. Do not touch the existing `it` blocks.

Then run the full verification below. The `tauriShellSource` suite has a pre-existing WR-07 `.title(` failure. Ignore that single failure, but confirm every other test passes, in particular the two `REQ-34.3-08 / D-05 no-fix: shutdown_child()` pins at lines 981-1000.

Prettier: the `.rs` files report `inferredParser: null` from `npx prettier --file-info` (checked at planning time), meaning prettier cannot format them. Say so in the SUMMARY and run the scoped check only on the `.ts` path.

Run `graphify update .` after the code changes.

Commit. Another Claude session commits concurrently on this working tree, so stage and commit by pathspec ONLY. Never use `git add -A`, `git add .` or `git commit -a`:

git add src-tauri/src/sidecar.rs src-tauri/src/shell_state.rs src-tauri/src/main.rs src/backend/__tests__/sidecarShutdownFlagSource.test.ts && git commit -m "fix(quick-261108-lav): reap dead sidecar's process group unconditionally before the dialog (WR-01)" -- src-tauri/src/sidecar.rs src-tauri/src/shell_state.rs src-tauri/src/main.rs src/backend/__tests__/sidecarShutdownFlagSource.test.ts

End the commit message body with the Co-Authored-By attribution line. Commit the SUMMARY and any STATE.md update the same pathspec-only way.

An optional live check is NOT blocking; record it in the SUMMARY as available. Run `pnpm tauri:dev`. Note the sidecar's pid and its children with `ps -o pid,pgid,comm -g <pgid>`. Kill only the sidecar node process with `kill -9 <sidecar pid>`, so the shell sees EOF outside shutdown. Before clicking anything in the dialog, confirm `ps -g <pgid>` lists nothing.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/__tests__/sidecarShutdownFlagSource.test.ts src/backend/__tests__/tauriShellSource.test.ts 2>&1 | tail -30 && npx prettier --file-info src-tauri/src/sidecar.rs src-tauri/src/shell_state.rs src-tauri/src/main.rs; npx prettier --check src/backend/__tests__/sidecarShutdownFlagSource.test.ts && (cd src-tauri && cargo test --bin gamelib-shell 2>&1 | grep -E "^test result")</automated>
  </verify>
  <done>
The `sidecarShutdownFlagSource` suite passes, including the new WR-01 describe. `tauriShellSource` shows only the pre-existing WR-07 `.title(` failure. `prettier --check` is clean on the `.ts` file. `cargo test --bin gamelib-shell` reports 0 failed. One commit contains exactly the four files.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| shell → OS process table | The shell sends signals to a numeric pgid. A wrong or recycled id hits processes the shell does not own |
| sidecar → shell (stdout EOF) | An unexpected EOF triggers the reap. Shutdown is still gated by the existing `shutting_down`/`eof_surfaced` latches (on_sidecar_eof) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-lav-01 | Denial of Service | kill_process_group | mitigate | Reject pgid <= 1, so kill(-1) (every user process) and kill(0) (the shell's own group) are unreachable. Unit-tested by `kill_process_group_rejects_non_positive_and_init_pgids` |
| T-lav-02 | Tampering / DoS | reap_dead_sidecar_tree pgid recycling | mitigate | SIGKILL the group BEFORE `wait()` reaps the leader. The unreaped zombie leader pins its pid/pgid, so the id cannot be recycled until after the signal |
| T-lav-03 | Denial of Service | shutdown_child after a dead-sidecar reap | mitigate | The `tree_reaped` latch skips the unix SIGTERM/SIGKILL of `-pgid` at RunEvent::Exit. The user may wait minutes at the dialog, during which the old pgid can be recycled. Pinned by jest (`tree_reaped.load(` in shutdown_child) |
| T-lav-04 | Elevation of Privilege | orphaned children (authenticated runner CLIs, comet) outliving the sidecar | mitigate | Unconditional group reap / job drop before the dialog. Unit-tested on unix (group outlives leader), source-pinned for the Windows arm |
</threat_model>

<verification>
- `cd src-tauri && cargo test --bin gamelib-shell` → 0 failed
- `cd src-tauri && cargo +1.99.1 clippy --workspace --all-targets --message-format=json > <tmp>; node ../meta/clippyRatchet.cjs <tmp> --list` → exit 0
- `npx jest src/backend/__tests__/sidecarShutdownFlagSource.test.ts src/backend/__tests__/tauriShellSource.test.ts` → all pass except the pre-existing WR-07 `.title(` failure
- Linux CI leg: the new code is `cfg(unix)` and uses only `libc::{kill, SIGKILL, ESRCH}` and std, all present on Linux. No `cfg(target_os = "macos")` was introduced. Windows code sits only under `cfg(windows)`/`cfg(not(unix))` and touches only the existing `job` field
</verification>

<success_criteria>
- A dead sidecar's surviving group members are SIGKILLed before the dialog shows, whether or not the sidecar had already exited
- The Windows job is dropped on the same pre-dialog path
- shutdown_child has still exactly one call site; the D-05 / REQ-34.3-06 pins stay green
- After a dead-sidecar reap, shutdown_child no longer signals a stale pgid
- The SUMMARY records the planner finding that tauri 2.11.5 `restart()` called from the reader thread does fire RunEvent::Exit, so that half of WR-01 was moot, and still closed by the pre-dialog reap
</success_criteria>

<output>
Create `.planning/quick/261108-lav-fix-phase-72-wr-01-reap-sidecar-group-on/261108-lav-SUMMARY.md` when done
</output>
