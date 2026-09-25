---
phase: 46-windows-single-instance-guard-and-gamelib-deep-link-registra
reviewed: 2026-09-25T00:00:00Z
depth: deep
files_reviewed: 5
files_reviewed_list:
  - src-tauri/src/main.rs
  - src-tauri/Cargo.toml
  - src-tauri/tauri.windows.conf.json
  - src/backend/__tests__/tauriShellSource.test.ts
  - src/backend/__tests__/windowsDeepLinkSuppression.test.ts
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 46: Code Review Report

**Reviewed:** 2026-09-25
**Depth:** deep
**Files Reviewed:** 5
**Status:** issues_found

## Summary

This reviews the ten phase-46 commits (`0722d3cc6` through `5b6201e26`) that add a hand-rolled
Windows single-instance guard (`CreateMutexW` decision + `CreateNamedPipeW` transport) and lift
the `gamelib://` deep-link suppression on Windows. I read the full diff plus the resulting code at
HEAD: `windows_single_instance_key`/`windows_mutex_name`/`windows_pipe_name`/`windows_pipe_sddl`/
`windows_pipe_connect_should_retry`/`windows_pipe_owner_matches`/`single_instance_payload`
(main.rs:8165-8292), `current_user_identity`, `create_single_instance_pipe_instance`,
`acquire_single_instance_windows`, `deliver_to_running_instance_windows`,
`run_windows_single_instance_accept_loop` (main.rs:8407-9080), the `main()` wiring
(main.rs:9604-9732), the tray/sentinel raise sites (main.rs:790, 9013-9056, 10296-10344), the
`Cargo.toml` `windows-sys` feature list, `tauri.windows.conf.json`, and both jest source-gate
files (`tauriShellSource.test.ts`'s Phase 46 `describe` block, `windowsDeepLinkSuppression.test.ts`).

I traced every unsafe FFI call for handle/allocation lifecycle (`CreateMutexW`,
`CreateNamedPipeW`, `ConvertStringSecurityDescriptorToSecurityDescriptorW`+`LocalFree`,
`GetTokenInformation`+`ConvertSidToStringSidW`+`LocalFree`, `GetSecurityInfo`+`LocalFree`,
`ConnectNamedPipe`, `GetNamedPipeServerProcessId`, `AllowSetForegroundWindow`) against the actual
`windows-sys-0.60.2` vendored type definitions (confirmed `HANDLE = *mut core::ffi::c_void`,
`INVALID_HANDLE_VALUE: HANDLE = -1i32 as _`, so the `.is_null()`/`== INVALID_HANDLE_VALUE` checks
in the diff are well-typed and correct) rather than trusting the source's own doc comments. I did
not find a handle leak, a double-free, a missing `CloseHandle`/`LocalFree` on any path, a
fail-closed regression, an un-re-validated URL source, or a squatting/impersonation bypass — the
owner-SID check in `deliver_to_running_instance_windows` runs before every payload write on both
the fast path and the `ERROR_ACCESS_DENIED`/`READ_CONTROL` retry path, `SECURITY_ANONYMOUS` SQOS
correctly blocks the pipe server from impersonating the secondary, and `AllowSetForegroundWindow`
is only ever granted to the owner-verified PID (never `ASFW_ANY`), after the owner check and
before the write, matching the jest gates that pin this ordering. `46-LIVE-GATE-RERUN.md` (PASS,
including Check 4's two-near-simultaneous-cold-launches check) is accepted as ground truth for
runtime behavior it measured and is not re-litigated here.

The two Warnings below are gaps the live gate could not have caught (it only ever exercised
well-behaved secondaries): an unbounded, un-timed-out blocking read in the single-threaded pipe
accept loop, and a same-user pipe-instance race during `ConnectNamedPipe` error recovery that is
already mostly mitigated by the owner-SID check but is worth naming explicitly since it was not.
Neither is a data-loss or authentication-bypass risk; both are availability/robustness gaps in a
guard whose own design otherwise treats every failure path as fail-open correctly.

## Warnings

### WR-01: The named-pipe accept loop's blocking read has no timeout, so one silent same-user connection permanently disables all future warm delivery

**File:** `src-tauri/src/main.rs:8999-9010` (`handle_windows_single_instance_connection`), consumed
from the single accept-loop thread at `src-tauri/src/main.rs:8916-8989`
(`run_windows_single_instance_accept_loop`)

**Issue:** The pipe is created with `PIPE_WAIT` (synchronous, blocking) and no
`FILE_FLAG_OVERLAPPED`. The accept loop is single-threaded and strictly sequential: it creates the
*next* pipe instance, then calls `handle_windows_single_instance_connection(current, ...)` inline
on the same thread, which does `BufReader::new(file.take(4096)).read_line(&mut line)` — a blocking
read with no deadline. Any process running as the same OS user (the DACL only restricts *who* can
connect, not *what* they do once connected — the doc comment at main.rs:8901-8902 already says
this explicitly for payload content, but the same sentence applies to connection *behavior*) can
open a client handle to the pipe and simply never write or close it. Because
`create_single_instance_pipe_instance` is called with `first=false` for every instance after the
very first, `OpenOptions::open()` on the pipe path succeeds immediately for such a client (a named
pipe instance accepts a client connection as soon as it exists, independent of whether the server
has called `ConnectNamedPipe` yet — this is exactly the `ERROR_PIPE_CONNECTED` idiom the function's
own doc comment cites). Once the accept-loop thread's one worker gets stuck reading from such a
connection, it never returns to the top of `loop { ... }`, so `ConnectNamedPipe` is never called
again on any later pipe instance — every subsequent legitimate secondary's `writeln!` still
succeeds (the pipe's 4096-byte input buffer absorbs it), so the secondary logs delivery success and
exits 0 believing it worked, while the primary never raises its window or dispatches the URL, for
the remainder of that primary's process lifetime, with **no distinguishing log line on either
side** — this is a *silent*, permanent regression of the guard's own warm-delivery purpose, not a
crash and not a lost single message.

This does **not** block process shutdown (the thread is never joined; `std::process::exit`/normal
teardown tears it down like every other unjoined thread here), so it doesn't violate the
stdin-owns-lifetime contract. It also mirrors the pre-existing Unix accept loop's identical
single-threaded, un-timed-out `read_line` shape (`main.rs:9821-9839`) — this is a shared,
inherited pattern, not something phase 46 introduced from scratch — but the live gate's Checks 1-5
only ever exercised well-behaved secondaries that write and exit immediately, so this gap was never
measured on either platform, and Windows's named-pipe API makes a bounded wait straightforward
(`FILE_FLAG_OVERLAPPED` + a deadline, or a per-connection worker thread) where the Unix
implementation would need a `set_read_timeout` on the accepted `UnixStream`.

**Fix:** Give the read a bound. The lowest-risk option is a `set_read_timeout`-equivalent for
Windows named pipes: create the pipe with `FILE_FLAG_OVERLAPPED` and use overlapped I/O with a
short (e.g. 2s) deadline via `GetOverlappedResultEx`, or simpler, spawn a short-lived worker thread
per accepted connection (the pipe already supports `PIPE_UNLIMITED_INSTANCES`) so one stalled
client cannot wedge the loop that services everyone else:

```rust
// Sketch: hand the connected handle to a short-lived thread instead of servicing it inline,
// so the accept loop's own thread is never blocked by a non-cooperative client.
thread::spawn(move || handle_windows_single_instance_connection(current, &accept_state, &accept_app_handle));
```
If a dedicated worker-per-connection is out of scope, at minimum log a WARN with an elapsed-time
watchdog so the silent-forever failure mode becomes an observable one.

### WR-02: A narrow post-`ConnectNamedPipe`-failure window briefly leaves the pipe name unclaimed, during which a same-user squatter's instance could be picked up by a legitimate secondary

**File:** `src-tauri/src/main.rs:8938-8963` (`run_windows_single_instance_accept_loop`)

**Issue:** On a genuine `ConnectNamedPipe` failure (not `ERROR_PIPE_CONNECTED`), the code does
`drop(current)` and only *then* calls `create_single_instance_pipe_instance(&pipe_name, &sddl,
false)`. Between the drop and the successful re-create, if that was the *only* remaining instance
of the pipe name, the kernel object can be momentarily unclaimed (Windows named-object lifetime is
reference-counted and self-cleaning, per the guard's own doc comment on the mutex at
main.rs:8626-8631 — the same applies to the pipe). Because the replacement is created with
`first=false`, `create_single_instance_pipe_instance` does **not** re-assert
`FILE_FLAG_FIRST_PIPE_INSTANCE` here, so if a same-user squatting process claims the name in that
gap, this call joins the existing multi-instance pool rather than detecting the squat. A legitimate
secondary racing to connect in that same window could then be routed to the squatter's instance
instead of the primary's.

**Fix scope:** the actual security impact is already substantially contained by
`deliver_to_running_instance_windows`'s owner-SID check (T-46-01), which runs before any payload is
written and would reject a squatter's instance, so this is availability-only (an occasionally lost
warm delivery), not a confidentiality/integrity gap — the same accepted-risk class the mutex's own
"malicious user can create this mutex before you do" doc comment (main.rs:8633-8638) already
documents for the *initial* acquisition. What's missing is that this *specific* re-creation path
(post-`ConnectNamedPipe`-failure, not the initial `first=true` creation) isn't named alongside that
accepted-risk comment, so a future reader auditing squatting risk by grep for "T-46-01"/"T-46-03"
would not find this branch. Either note it explicitly next to the existing accepted-risk comment,
or close the gap by keeping at least one already-created spare instance alive so `drop(current)`
never leaves the name completely unclaimed.

## Info

### IN-01: `windows_pipe_sddl` grants Generic-All rather than the narrower right set the pipe actually needs

**File:** `src-tauri/src/main.rs:8237-8239`

**Issue:** `D:P(A;;GA;;;<sid>)` grants Generic-All (which maps to `FILE_ALL_ACCESS`, including
`DELETE`/`WRITE_DAC`/`WRITE_OWNER`) to the owner SID, rather than a narrower right set such as
`FILE_GENERIC_READ | FILE_GENERIC_WRITE`. In practice this doesn't expand what the same user could
already do to their own kernel object (the creating owner implicitly holds `WRITE_DAC`/`WRITE_OWNER`
regardless of the DACL), so this is not a security gap, just broader than the least-privilege
framing the surrounding doc comments otherwise use consistently (e.g. `PIPE_ACCESS_INBOUND` over
`PIPE_ACCESS_DUPLEX`, the SQOS/foreground-grant scoping). Consider `GR|GW` (`0x80000000 |
0x40000000`, i.e. `A;;GRGW;;;<sid>`) if a future reader wants the DACL itself to state the
least-privilege intent explicitly rather than relying on owner semantics to make `GA` harmless.

### IN-02: `create_single_instance_pipe_instance`'s doc comment conflates two different collision mechanisms

**File:** `src-tauri/src/main.rs:8542` ("a squatted or cross-session-collided name")

**Issue:** The comment attributes both "squatted" and "cross-session-collided" failure modes to the
same `FILE_FLAG_FIRST_PIPE_INSTANCE` check, but the pipe name already includes the session ID
(`windows_pipe_name`, main.rs:8197-8200, specifically to prevent cross-session collision at the
naming level) — two different Windows sessions of the same user can never produce the same pipe
name in the first place, so there is nothing for `FIRST_PIPE_INSTANCE` to "detect" in that case;
only same-session squatting (by any process running as the same user, or in principle another
process racing within the exact one-shot startup window) is actually caught here. This is a
documentation-accuracy nit, not a functional defect — no fix required beyond tightening the
wording if this file is touched again.

## Structural Findings (fallow)

None provided for this review (no `<structural_findings>` block was supplied).

---

_Reviewed: 2026-09-25_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
