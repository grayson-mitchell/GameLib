---
phase: 46-windows-single-instance-guard-and-gamelib-deep-link-registra
fixed_at: 2026-09-25T00:00:00Z
review_path: .planning/phases/46-windows-single-instance-guard-and-gamelib-deep-link-registra/46-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 46: Code Review Fix Report

**Fixed at:** 2026-09-25
**Source review:** .planning/phases/46-windows-single-instance-guard-and-gamelib-deep-link-registra/46-REVIEW.md
**Iteration:** 1

**Summary:**

- Findings in scope: 2 (WR-01, WR-02; fix scope `critical_warning`)
- Fixed: 2
- Skipped: 0 in scope. IN-01 and IN-02 are out of scope and were left unfixed (listed below).

## Fixed Issues

### WR-01: The named-pipe accept loop's blocking read has no timeout, so one silent same-user connection permanently disables all future warm delivery

**Files modified:** `src-tauri/src/main.rs`
**Commit:** 9ca63c7d0
**Status:** fixed: requires human verification (a concurrency change; the tests below check structure, not runtime behaviour)
**Applied fix:** In `run_windows_single_instance_accept_loop`, the normal path no longer services
the accepted connection inline. It hands the connection to a new nested helper,
`spawn_windows_single_instance_connection_worker`, which moves the `OwnedHandle` plus clones of
`Arc<SidecarState>` and `AppHandle` onto a detached, named worker thread
(`gamelib-single-instance-conn`) that runs the unchanged `handle_windows_single_instance_connection`.
The loop then goes straight back to `ConnectNamedPipe` on the next instance. A stalled client can
now only park its own worker, and that worker ends when the client writes or closes its handle.

- Unchanged: the 4096-byte `.take(4096)` payload cap, `protocol_url_arg` re-validation of every
  non-sentinel payload before dispatch, the focus-sentinel raise sequence, and the
  "create the next instance before servicing the current one" ordering.
- Fail-open: if the thread spawn fails, only that one connection is dropped, with a WARN, and the
  loop keeps listening.
- The terminal branch (the next instance could not be created) still services inline on purpose.
  The loop is ending at that point, so parking that thread costs no later delivery.
- Exit contract: the worker is detached and never joined, the same as the accept thread itself,
  so it cannot keep the process alive past shutdown. It holds no timer or watcher.
- Residual: a client that never writes still holds one worker thread and one pipe instance until
  that client closes its handle or exits. The number of these is unbounded. It is not a permanent
  leak, because each one ends when its client goes away. It is also within the per-user trust
  boundary: a same-user process can already act against this process directly. I chose not to
  add a read deadline (overlapped I/O or `CancelSynchronousIo`) because it would make the change
  much larger for little gain.
- No new pure helper was added: the spawn wrapper is FFI/thread glue. So no new unit test was
  added either.

### WR-02: A narrow post-`ConnectNamedPipe`-failure window briefly leaves the pipe name unclaimed

**Files modified:** `src-tauri/src/main.rs`
**Commit:** 1fa6e9e93
**Applied fix:** Closed the gap by reordering rather than only documenting it. The explicit
`drop(current)` before `create_single_instance_pipe_instance(.., false)` is removed. The
replacement is now created while the failed instance is still held, and `current = replacement`
releases the old handle only after the new one exists, so the name stays claimed by this process
the whole time.

The remaining residual is documented next to the fix. When no replacement can be created, the
loop returns and the name can become unclaimed for the rest of the session. The same applies to
the terminal branch. The comment says honestly that the owner-SID check (T-46-01) rejects a
different-user squatter but not a same-user one. A same-user squatter has the same owner SID, so
it would receive the payload. That is availability-only and inside the per-user trust boundary.
The T-46-03 accepted-risk doc comment on `acquire_single_instance_windows` now points to this
note, so a grep for T-46-03 finds it. The owner-SID verification in the secondary is unchanged.

Correction to the review's framing: the review says the owner-SID check "would reject a
squatter's instance". That holds only for a squatter running as a different user. The new comment
states the narrower claim.

## Out-of-Scope Issues (not fixed)

### IN-01: `windows_pipe_sddl` grants Generic-All rather than the narrower right set the pipe actually needs

**File:** `src-tauri/src/main.rs:8237-8239`
**Reason:** Out of scope. This run's fix scope is `critical_warning`, and this is an Info finding.
**Original issue:** `D:P(A;;GA;;;<sid>)` grants Generic-All to the owner SID instead of a narrower
`GRGW`. The review says this is not a security gap, only broader than the least-privilege
framing used elsewhere.

### IN-02: `create_single_instance_pipe_instance`'s doc comment conflates two different collision mechanisms

**File:** `src-tauri/src/main.rs:8542`
**Reason:** Out of scope. This run's fix scope is `critical_warning`, and this is an Info finding.
**Original issue:** The comment credits `FILE_FLAG_FIRST_PIPE_INSTANCE` with catching
cross-session collisions. The session ID in the pipe name already prevents those, so only
same-session squatting is caught. This is a wording nit.

## Verification

After each fix, run in an isolated worktree:

- `cargo build --bin gamelib-shell`: passed. Only the 9 warnings that were already there; none
  come from these changes.
- `cargo test --bin gamelib-shell`: 234 passed / 0 failed / 2 ignored, the same as the baseline.
- `npx jest src/backend/__tests__/tauriShellSource.test.ts src/backend/__tests__/windowsDeepLinkSuppression.test.ts`:
  2 suites, 204/204 passed. No source gate needed changing. The helpers stay nested inside
  `run_windows_single_instance_accept_loop`, so `fnRegion` still sees `.take(4096)`,
  `protocol_url_arg(&[trimmed.to_string()])`, `ERROR_PIPE_CONNECTED`, `bytes={}` and the
  sentinel arm in their existing order.
- `cargo fmt -- --check`: the repo is not rustfmt-clean at baseline (870 lines of diff output).
  After both fixes it is still 870 lines, so the new code adds no formatting diffs.
- Unix-region gate: `46-unix-cfg-regions.awk` run against baseline `5bc4fa825` and against the
  post-fix `main.rs` gives an empty diff (exit 0), with 224 lines on both sides.

**Not live-verified on Windows.** `46-LIVE-GATE-RERUN.md` was run against the build from before
these fixes. I recommend a short live re-check before calling phase 46 fully closed, because
WR-01 changes the primary's runtime concurrency: the connection is now serviced on a spawned
thread. Minimum checks:

1. A warm `gamelib://` deep link from a second launch still dispatches, and the focus sentinel
   still raises the window. This covers Checks 1-3 of the live gate.
2. Check 4: two near-simultaneous cold launches still resolve to one primary.
3. Optionally, the WR-01 scenario itself: a same-user client that opens the pipe and holds it open
   without writing (for example a PowerShell `NamedPipeClientStream` left connected) must not stop
   a following `gamelib://` launch from being delivered.

WR-02's change only matters when `ConnectNamedPipe` genuinely fails, which is hard to trigger
live. The reorder is simple enough that the structural checks above are adequate for it.

---

_Fixed: 2026-09-25_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

## Live check (2026-09-26)

WR-01 was live-verified on Windows on 2026-09-26. With a client connected to the pipe and never
writing, a `gamelib://` ping was still delivered, and a minimized relaunch still restored and
focused the window. WR-02 remains review-only, because a genuine `ConnectNamedPipe` failure
cannot be provoked live. See `46-POSTFIX-LIVE-CHECK.md` (PASS).
