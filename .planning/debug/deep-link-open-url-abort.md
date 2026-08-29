---
slug: deep-link-open-url-abort
status: investigating
trigger: "Tauri shell aborts (SIGABRT) intermittently inside the macOS deep-link callback. Stack: tao::platform_impl::platform::app_delegate::application_open_urls -> core::panicking::panic_cannot_unwind -> abort. A Rust panic inside an extern \"C\" ObjC callback cannot unwind, so it becomes an abort. The URL was handled SUCCESSFULLY first (game launched, wake lock engaged), then the process died. Did NOT reproduce in two subsequent attempts."
created: 2026-08-29
updated: 2026-08-29
origin: Phase 35 plan 35-07 human-verify gate, Task 4 — blocks the gate and sits BEFORE plan 35-14, the phase's point of no return
---

# Debug: `on_open_url` aborts the shell (panic across a nounwind ObjC boundary)

## Symptoms

Prefilled from evidence captured directly while driving the 35-07 gate on 2026-08-29. Every
item below is a measured observation from that drive, not a user interview.

**1. Expected behavior**

Delivering `gamelib://launch?appName=<id>` to the running packaged app dispatches it to the
sidecar and the shell stays alive. `[shell] delivered OS deep link to sidecar: ok` on stderr,
process continues serving.

**2. Actual behavior**

On the FIRST forced delivery the URL was handled end to end and *then* the shell aborted:

- `[ProtocolHandler]: Received gamelib://launch?appName=1829678475` — reached the sidecar
- `Launching Endless Sky (1829678475)` — the launch actually happened (game PID 22367 ran)
- `Preventing display from sleep` — a wake lock was taken
- shell PID 21058 died with `Abort trap: 6`
- sidecar PID 21065 was ORPHANED and survived the shell

Two subsequent forced deliveries (one of them a real cold game launch, with Endless Sky killed
first) did NOT crash and printed `[shell] delivered OS deep link to sidecar: ok`.

**3. Error messages**

Crash report: `~/Library/Logs/DiagnosticReports/gamelib-shell-2026-08-29-164821.ips`
(116 KB, 23 threads, faultingThread 0 = `com.apple.main-thread`).

```
exception:   {type: EXC_CRASH, signal: SIGABRT, codes: 0x0, 0x0}
termination: {namespace: SIGNAL, code: 6, indicator: "Abort trap: 6", byProc: gamelib-shell, byPid: 21058}
asi:         {"libsystem_c.dylib": ["abort() called"]}
app_version: 0.7.0   bundleID: com.gamelib.shell   os: macOS 26.5.2 (25F84)
```

Faulting thread 0, top frames (verbatim, symbolicated):

```
libsystem_kernel.dylib  __pthread_kill
libsystem_pthread.dylib pthread_kill
libsystem_c.dylib       abort
gamelib-shell           std::sys::pal::unix::abort_internal
gamelib-shell           std::process::abort
gamelib-shell           std::panicking::panic_with_hook
gamelib-shell           std::panicking::panic_handler::{{closure}}
gamelib-shell           std::sys::backtrace::__rust_end_short_backtrace
gamelib-shell           rust_begin_unwind
gamelib-shell           core::panicking::panic_nounwind_fmt
gamelib-shell           core::panicking::panic_nounwind
gamelib-shell           core::panicking::panic_cannot_unwind        <-- the ABORT GUARD
gamelib-shell           tao::platform_impl::platform::app_delegate::application_open_urls
AppKit                  withWindowOrderingObserverHeuristic
AppKit                  -[NSApplication(NSAppleEventHandling) _openURLs:requestedBySourceApp:completionHandler:]
AppKit                  __60-[NSApplication(NSAppleEventHandling) _handleAEGetURLEvent:]_block_invoke
...
AppKit                  -[NSApplication run]
gamelib-shell           tao ... EventLoop::run_return -> run
gamelib-shell           tauri_runtime_wry::Wry::run -> tauri::app::App::run
gamelib-shell           gamelib_shell::main
```

Sidecar side, same moment: `uncaught exception: Error: write EPIPE` — caught and logged by the
guard added in D-35-10-01 (its first real-world catch). This is a CONSEQUENCE, not the cause:
the sidecar got EPIPE because the shell had already died.

**4. Timeline**

New. First seen 2026-08-29 while driving the 35-07 gate. `on_open_url` is itself new code —
plan 35-07 added it as the Tauri replacement for `main.ts:501-507`'s
`protocol.handle('gamelib', ...)`. There is no "it used to work" baseline for this callback.

Two OTHER crashes the same day, 16:35:26 and 16:35:39, have the SAME shape (Rust panic across a
nounwind ObjC boundary) but in a DIFFERENT callback — `did_finish_launching`, not
`application_open_urls`. Whether they share a cause is UNKNOWN and must not be assumed.

**5. Reproduction**

Not reliably reproducible. 1 crash in 3 forced deliveries.

```bash
open -a "<packaged .app>" "gamelib://launch?appName=1829678475"
```

Unforced `open "gamelib://..."` does NOT exercise this path at all: a stale user-level
LaunchServices default maps `LSHandlerURLScheme "gamelib"` -> `LSHandlerRoleAll
"com.github.electron"`, so the URL never reaches GameLib. That is a SEPARATE defect (it also
blocks 35-07 steps 2-5) and is NOT this session's subject.

## Evidence

- timestamp: 2026-08-29 (orchestrator, before spawning the debugger)
  finding: `panic_cannot_unwind` is the abort GUARD, not the panic origin. The original panic
  already unwound the frames between it and the `extern "C"` boundary, so those frames are
  ABSENT from the crash report. The crash report therefore cannot tell us where the panic came
  from. It can only tell us the panic originated somewhere on the MAIN THREAD inside the call
  tree of the `on_open_url` closure.

- timestamp: 2026-08-29
  finding: The panic MESSAGE went to stderr and was LOST. The crashing run was launched via
  LaunchServices (`open -a`), whose stderr goes nowhere the operator can see. The `.ips`
  contains no `panicked at` string — Rust does not write panic text into the crash report's
  `asi`/CRASetInfo (confirmed: `asi` is only `abort() called`).

- timestamp: 2026-08-29
  finding: **`src-tauri/src/main.rs` installs NO `panic::set_hook` and uses NO `catch_unwind`
  anywhere** (grep for `set_hook|catch_unwind` returns zero hits). So every panic in the shell
  is diagnosable only from stderr, and under a LaunchServices launch that is /dev/null. This is
  the primary blocker to diagnosing this crash, and is arguably a defect in its own right.

- timestamp: 2026-08-29
  finding: The `on_open_url` closure body (`src-tauri/src/main.rs` ~7339-7366) contains no
  `unwrap`, no `expect`, and matches every `Result` arm explicitly. Its call tree is:
  `event.urls()` -> `url.to_string()` -> `deep_link_decision()` (which calls
  `protocol_url_arg()`, main.rs:6574/6623) -> `SidecarState::invoke()` (main.rs:1044).

- timestamp: 2026-08-29
  finding: `SidecarState::invoke` (main.rs:1044) itself has no obvious panic site — every
  `Mutex::lock` is `.map_err(|e| e.to_string())?` (poison-safe), and `recv`/`recv_timeout`
  return `Err` rather than panicking. It does `next_id()` (main.rs:994), `timeout_for(&channel)`
  (main.rs:900), `serde_json::to_value`, `write_frame` -> `write_raw` -> `stdin.write_all`.
  None of those are audited yet for panic paths.

- timestamp: 2026-08-29
  finding: **The deep-link closure is the ONLY caller that runs `state.invoke()` synchronously
  on the macOS main thread.** The renderer-facing `sidecar_invoke` command (main.rs ~1074)
  deliberately wraps it in `tauri::async_runtime::spawn_blocking` with the comment "Run the
  blocking channel-write + recv off the async runtime's worker." The deep-link path does not.
  So the main thread BLOCKS inside an AppKit AppleEvent callback for as long as the sidecar
  takes to answer `handleProtocolUrl` (up to `timeout_for("handleProtocolUrl")`).

- timestamp: 2026-08-29
  finding: While the main thread is blocked there, the sidecar can and does issue `rustInvoke`
  callbacks in the opposite direction. `start_reader` (main.rs ~7058) does `thread::spawn`
  before calling `dispatch_rust_channel`, so those run on worker threads. main.rs:5961's own
  comment documents that off-main-thread `Dispatcher::with_webview()` posts via
  `context.proxy.send_event(...)` — which requires the main thread's event loop to drain. The
  main thread is not draining it during the blocked window. A worker-thread panic would NOT
  produce this stack, but a main-thread re-entry or a `run_on_main_thread` dependency could
  deadlock or fault.

- timestamp: 2026-08-29
  finding: The observed run took a WAKE LOCK ("Preventing display from sleep") during the
  blocked window. Wake locks are a shell-side `rustInvoke` arm calling
  `IOPMAssertionCreateWithName` through a raw `extern "C"` FFI block (`mod macos_wake_lock`,
  main.rs ~4144), keyed into a `Mutex<WakeLockRegistry>` (main.rs ~4126). This is the one
  confirmed piece of shell-side work that ran inside the crash window. A poisoned
  `wake_locks()` mutex would panic on `.lock().unwrap()` if any arm uses `unwrap` there —
  UNAUDITED.

- timestamp: 2026-08-29 (after the fix below landed)
  finding: **Observability fixed and PROVEN LIVE.** `install_panic_hook()` now writes every
  panic — payload, location, thread, pid, and a `force_capture`d backtrace — to
  `~/Library/Logs/GameLib/gamelib-shell-panic.log` as well as stderr. Proven end to end with a
  temporary scaffold: a real debug binary run under a scratch `HOME` produced the file with the
  correct location (`src/main.rs:7243:9`), payload, and a full symbolicated backtrace. The
  scaffold was then removed and the tree restored byte-identical (shasum verified). The
  formatter's unit test was proven non-vacuous by mutation (rename one field -> RED; restore ->
  GREEN, shasum identical).

- timestamp: 2026-08-29
  finding: **The abort did NOT reproduce in ~30 attempts with the hook installed.** 12 warm
  deliveries against a settled app and ~14 cold-start deliveries, zero aborts, zero panic-log
  entries, `.ips` count unchanged at 5 throughout. The warm run was checked for VACUITY and
  passes: 12 fires produced exactly 12 `[ProtocolHandler]: Received` lines and 12 real game
  launches, so the URL genuinely arrived every time.

- timestamp: 2026-08-29
  finding: The FIRST cold-start loop was VACUOUS and nearly produced a false result. It reported
  "8 clean iterations", but a per-iteration delta count showed 0 of 6 cold starts produced any
  `[ProtocolHandler]` line at all. The 2 receives originally attributed to it came from the
  preceding warm loop; the time-window `awk` filter used to attribute them was unsound because
  the sidecar log wraps lines. Aggregate counts over a shared log cannot attribute events to
  iterations — only before/after deltas per iteration can.

- timestamp: 2026-08-29
  finding: **A SECOND, SEPARATE, 100%-REPRODUCIBLE DEFECT: a cold-start deep link does not
  launch the game.** Instrumenting the callback showed `on_open_url` DOES fire on cold start,
  in the same second as `setup`, with 1 URL — so the URL is not lost by the OS or the plugin.
  What differs is the sidecar's readiness. Two failure shapes, both measured:
    - 17:22:33 — shell reported `delivered OS deep link to sidecar: ok (1010ms)` but the sidecar
      log has NO `[ProtocolHandler]` line for that moment at all. The URL vanished.
    - 17:23:49 — shell reported `ok (671ms)`, the sidecar DID receive it, and answered
      `[ProtocolHandler]: "Endless Sky" not installed.` -> `Not installing game`. The library
      was not hydrated yet, so an INSTALLED game was reported as missing and the deep link
      raised an install prompt instead of launching.
  Warm deliveries in the same session were 3/3 correct. There is no readiness gate between
  `on_open_url` and the sidecar being able to serve a launch.

- timestamp: 2026-08-29
  finding: The main-thread block inside the ObjC callback is measurable and cold/warm asymmetric:
  **671ms / 1010ms / 1191ms on cold start, 1-2ms warm.** `handleProtocolUrl` is deliberately
  bounded at `INVOKE_TIMEOUT` (pinned by `handle_protocol_url_channel_is_bounded_at_invoke_timeout`),
  so the worst case for this synchronous main-thread block is the full 60s.

## Eliminated

- hypothesis: The crash is on the game-launch path (i.e. launching Endless Sky causes it).
  evidence: Killed Endless Sky and re-fired the deep link so a genuine cold launch occurred
  (game PID 22713). The shell SURVIVED and logged `delivered OS deep link to sidecar: ok`.
  verdict: ELIMINATED. This was the orchestrator's own first hypothesis and it is wrong.

- hypothesis: The URL failed validation and something in the reject path faulted.
  evidence: The URL was fully accepted — `deep_link_decision` returned `Dispatch`, the sidecar
  logged `[ProtocolHandler]: Received ...`, and the game launched. The crash is AFTER a
  successful dispatch, not instead of one.
  verdict: ELIMINATED.

- hypothesis: The cold-start URL is lost because `main.rs` never calls the plugin's
  `deep_link().get_current()`, the documented "was the app STARTED by a deep link" accessor.
  evidence: Instrumented and measured on three cold starts. `get_current()` returned `None` at
  setup EVERY time, because the plugin only populates `current` from its `RunEvent::Opened`
  handler, which fires AFTER setup. Meanwhile `on_open_url` DID fire with the URL. Calling
  `get_current()` would have changed nothing.
  verdict: ELIMINATED — and worth recording, because it is a plausible fix that a code read
  alone would have endorsed. A comment now sits at the call site so it is not re-proposed.

## Current Focus

hypothesis: |
  UNRESOLVED for the abort. The instrument is now in place but the fault has not recurred.

  The strongest surviving structural candidate, NOT yet demonstrated: the deep-link closure is
  the ONLY caller that runs the blocking `state.invoke()` synchronously on the macOS main thread
  — every other call site goes through `tauri::async_runtime::spawn_blocking`. It therefore
  blocks inside AppKit's AppleEvent handler while tao holds BOTH its `HANDLER.callback`
  `Mutex` (`app_state.rs:204`, `.lock().unwrap()`) and the `RefCell` behind it
  (`app_state.rs:77`, `callback.borrow_mut()`) for the whole dispatch. A poisoned mutex or a
  re-entrant borrow there panics on the main thread inside `extern "C"`, which is exactly the
  observed abort shape. Measured block: 671-1191ms cold, bounded at 60s by `INVOKE_TIMEOUT`.
  This remains a HYPOTHESIS — no measurement yet connects it to the observed abort.
test: |
  Left armed rather than actively driven: the panic hook now captures any recurrence with
  payload, location and backtrace, in the packaged app, under LaunchServices. The next
  occurrence is self-diagnosing.
expecting: |
  A `gamelib-shell-panic.log` entry naming the panic. If it reads `PoisonError` or
  `BorrowMutError` with a tao frame, the hypothesis above is confirmed and the fix is to move
  the invoke off the main thread. If it names something else, the hypothesis is wrong.
next_action: |
  (cold start) STILL OPEN and unaddressed by the change below. Root-caused and reproducible: no
  readiness gate between `on_open_url` and a hydrated sidecar library, so a cold-start deep link
  either vanishes or reports an INSTALLED game as "not installed" and offers to install it.
  Re-confirmed after the fix (2026-08-29 17:39:00, cold delivery -> `"Endless Sky" not
  installed.` while all 8 warm deliveries in the same run launched correctly). This is 35-07
  step 5's own subject matter. The fix is a design choice — queue the URL until the library is
  ready, vs. have `handleProtocolUrl` itself await hydration — and has NOT been made
  unilaterally.

## A THIRD, UNRELATED crash — root-caused 2026-08-29 by the new panic hook

The hook's first real catch, and it paid for itself: a crash that would previously have been
another `abort() called` mystery was named in seconds.

**Not the deep-link abort.** Payload, identical across all 6 occurrences:

```
location: tauri-2.11.5/src/app.rs:1425:11
payload:  Failed to setup app: error encountered during setup hook:
          No such file or directory (os error 2)
```

Each crash logs TWO panics — that one, then `panic in a function that cannot unwind` from
`did_finish_launching`. That is the abort mechanism captured end to end, and it CONFIRMS the
mechanism this whole session hypothesised: a real panic crossing an `extern "C"` ObjC boundary
becomes SIGABRT, and the crash report can only ever show the guard.

**Cause.** `.setup()` has four fallible steps; three return string errors with distinct
messages, so only `spawn_sidecar(app.handle())?` (`main.rs:7385`) can yield an `io::Error`
ENOENT. In a `--debug` build `use_dev_sidecar()` is `cfg!(debug_assertions)` — unconditionally
true — so the shell runs `Command::new("node")`. LaunchServices gives a bundled app
`PATH=/usr/bin:/bin:/usr/sbin:/sbin` (verified by reading a running instance's environment) and
node is nvm-installed at `~/.nvm/versions/node/<version>/bin/node`, which is not on it. Not
found -> ENOENT -> `?` -> panic -> abort.

**DEBUG BUILDS ONLY.** A release build takes `spawn_sidecar_packaged` and uses the bundled
`gamelib-sidecar` externalBin. No node, no exposure.

**Why it never appeared during this session's ~40 launches:** every one used `open -a` from a
shell carrying the nvm PATH. Launching from Finder / Dock / Spotlight does not.

**An apparent anomaly, since RESOLVED — do not re-open it.** One instance (pid 37515) was
observed alive with no sidecar and no panic, which contradicted the account above and was
reported as unexplained. It later panicked with the same ENOENT payload: started 18:10:45,
panicked 18:13:58. The panic is DELAYED, not absent — it surfaces from
`make_run_event_loop_callback` (`app.rs:1425`) rather than from the setup call itself. The
observation was simply taken inside that window. All 9 crash reports on 2026-08-29 are now
accounted for.

**Both follow-ups are now DONE and verified live.**

1. **`resolve_node_program()`** replaces the bare `Command::new("node")`. Ordered candidates:
   `GAMELIB_NODE` override -> `node` on the inherited `PATH` -> newest
   `~/.nvm/versions/node/<v>/bin/node` -> `/opt/homebrew/bin/node` -> `/usr/local/bin/node` ->
   bare `"node"` so a total failure still names the missing program. It deliberately does NOT
   shell out to `$SHELL -lc 'command -v node'`: that runs the user's full profile on the startup
   path, where a slow or interactive profile would hang launch with nothing to report why.

   nvm directory names are ordered NUMERICALLY, newest first. A lexical sort puts `v9.x` after
   `v26.x` and would select a years-old runtime; `nvm_versions_are_ordered_numerically_newest_first`
   pins this and was proven non-vacuous by mutation (lexical sort -> RED with `v9.0.0` first;
   restored byte-identical by shasum -> GREEN).

2. **A spawn failure no longer aborts.** `.setup()` matches on the error instead of `?`: it
   writes a `FATAL` line naming the node it tried and why the spawn failed, shows a native error
   dialog pointing at the log, then `std::process::exit(1)`. `blocking_show()` is safe there
   because `.setup()` runs on the main thread from inside the already-running event loop.
   All six `spawn_sidecar_dev` diagnostics moved from `eprintln!` to `shell_diag`, so they
   survive LaunchServices' discarded stderr — the single change that would have diagnosed this
   in one line instead of an afternoon.

**Live verification, packaged `.app`, launched under the exact failing condition
(`env PATH=/usr/bin:/bin:/usr/sbin:/sbin open -a ...`):**
  - Success path: resolves `~/.nvm/versions/node/v26.2.0/bin/node` via the nvm fallback,
    `sidecar process spawned OK`, 1 shell + 1 sidecar, **0 new crash reports, no panic log.**
  - Failure path, forced with `GAMELIB_NODE` pointing at a non-executable file:
    `FAILED to spawn sidecar: Permission denied (os error 13) (tried node="...", entry_exists=true)`
    then `FATAL: sidecar spawn failed, exiting`, dialog shown, **no panic log and no crash
    report** — i.e. a clean exit where it previously aborted.

**Not verified, and stated rather than glossed:** a true "no node anywhere" environment could not
be produced on this machine, because `/usr/local/bin/node` exists and fallback 5 always resolves.
The failure arm was therefore exercised via a non-executable `GAMELIB_NODE` (`EACCES`) rather
than a genuine `ENOENT`. Same `match` arm, same handling; the specific errno differs.

## Change applied (2026-08-29): the invoke no longer runs on the main thread

Does NOT claim to fix the abort. Closes the structural window in which the abort occurred, and
fixes a UI freeze that is a defect in its own right.

**What changed.** `on_open_url` no longer calls `SidecarState::invoke` inline. Validation still
happens on the main thread (`deep_link_decision` is pure and fast, and keeping it there means an
unvalidated URL is never enqueued), then the validated URL is sent over an `mpsc` channel to a
SINGLE long-lived worker thread that performs the blocking round-trip.

A single worker rather than `thread::spawn` per URL, for two reasons: URLs stay FIFO so two deep
links cannot interleave their round-trips, and thread count is bounded at one — a page firing
`gamelib://` in a loop is a realistic input that thread-per-URL would let spawn without limit.

**Why it matters independently of the abort.** `handleProtocolUrl` is deliberately NOT on
`LONG_RUNNING_CHANNELS`, so its bound is the full `INVOKE_TIMEOUT` (60s). Blocking inline meant
the entire UI froze inside AppKit's AppleEvent handler for the duration of the sidecar
round-trip. This was also the only `invoke` call site that blocked the main thread — the
renderer-facing `sidecar_invoke` command has always used `spawn_blocking`.

**Verification (live, packaged `.app`, LaunchServices delivery).**
- Delivery is unbroken: 2 trials x (1 cold + 8 burst) = 18 deliveries, `fired=9 ok=9 err=0` in
  each trial. No drops, no errors.
- The main thread is genuinely free: the diagnostic log now contains `on_open_url fired` lines
  BACK TO BACK with no `delivered` line between them (3 occurrences in trial 1, 1 in trial 2).
  A blocked main thread cannot fire the callback twice in a row, so this is direct positive
  evidence rather than an inference from timings. Before the change, every `fired` was
  immediately followed by its own `delivered`.
- Thread count does not grow under the burst: 28->26 and 27->27 across an 8-URL burst,
  confirming the single-worker design; thread-per-URL would have shown growth.
- No crash in any run; shell alive at the end of both trials.
- `cargo test` 200 passed / 0 failed / 1 ignored. New code is clippy- and rustfmt-clean (the
  repo has 54 pre-existing rustfmt diffs elsewhere, left untouched).

**Also landed, same session:** `install_panic_hook()` (panic payload + location + thread + pid +
`force_capture`d backtrace -> `~/Library/Logs/GameLib/gamelib-shell-panic.log`) and `shell_diag`
(shell diagnostics -> `~/Library/Logs/GameLib/gamelib-shell.log`). The deep-link outcome and
reject lines were `eprintln!` and therefore invisible in the packaged app; they now go to the
file sink. Reject still carries a byte count only, never the payload.

## Constraints

- The repo is PUBLIC. No tokens, cookies, Steam IDs, absolute home paths or personal
  identifiers in code, comments, tests or commit messages.
- Never run `git stash`, `git reset`, or `git checkout -- <file>` (the post-checkout hook fires
  a helper download that throws).
- Never use `gsd-sdk` state-writing verbs — they corrupt STATE.md and ROADMAP.md.
- Do not add capability grants to `capabilities/default.json` without explicit justification.
- `pnpm tauri:dev` exits 0 WITHOUT replacing a running instance — kill the running shell first
  or you will test a stale binary. Never run bare `tauri dev` (serves a stale static bundle).
- A packaged build needs `tauri build --debug --bundles app`; without `--bundles app` the DMG
  step DELETES the `.app`.
- This blocks phase 35 plan 35-07's gate, which sits BEFORE plan 35-14, the phase's
  irreversible point of no return.
