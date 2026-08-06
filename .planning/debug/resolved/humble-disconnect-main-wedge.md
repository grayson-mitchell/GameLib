---
status: resolved
trigger: "F-34.4.2-12 — Clicking Humble's disconnect/logout control produces a hard, unbounded macOS main-thread hang (spinning-wait cursor, unresponsive to all further input), requiring a force-kill. Observed live 2026-08-05 during the Phase 34.4.2 RERUN-3 blocking live gate, item 6(a). Escalates F-34.4.2-10 (previously a BOUNDED, non-fatal storage-wipe timeout) to a fatal wedge. BLOCKS Phase 34.4.2 closure; threat T-34.4.2-43 (DoS)."
created: 2026-08-06
updated: 2026-08-06
goal: find_and_fix
phase: 34.4.2
finding: F-34.4.2-12
---

# Debug: Humble disconnect wedges the main thread

## Symptoms

**Expected behavior**
Clicking Humble's disconnect/logout control opens a HIDDEN login window
(`seam.open(HUMBLE_BASE_URL, { visible: false, ... })`, `src/backend/humble/user.ts:812-813`
and `:959-960`), wipes Humble cookies, emits the cookie-census line
(`src/backend/humble/user.ts:1049`):
```
Humble disconnect: cookie census before(total={N}, matched={M}) after(total={N2}, matched={M2}) deleted={D} survivingNonHumble={S}
```
and returns control to the app. Per gate item 6(a) the hidden window must ALSO not be refused by
Plan 14's single-flight guard (scoped to `visible == true` only, `src-tauri/src/main.rs:3355`) —
a refused hidden window would itself be a Plan 14 regression.

**Actual behavior**
Operator verbatim: *"beach balled, had to kill app"* / *"when i clicked on logout on humble
button."* The macOS spinning-wait cursor appears, the app is unresponsive to all further input,
there is no graceful recovery, no error dialog, and no log line. Force-kill required.

**Error messages**
NONE. No error dialog, no toast, no `[shell]` line. The surviving `/tmp/gamelib-dev.log`
(214 lines) ends at the second Humble cancel-strip dismissal with zero occurrences of
"disconnect", "epic", "pristine", or "clear-storage". Whether the wedge preceded any
disconnect-specific emit, or followed the last flushed write with the force-kill discarding the
unflushed OS buffer, is UNKNOWN — both readings fit the evidence.

**Timeline**
The same disconnect flow previously carried a related but strictly less severe defect:
F-34.4.2-10 recorded the Humble disconnect's storage-wipe **timing out — bounded and non-fatal**,
after which the flow continued. This run is the first observation of an unbounded, fatal hang.
Whether gap cycle 3's changes (Plans 13/14) CAUSED the escalation or merely EXPOSED a pre-existing
defect that the bounded timeout was masking is **UNDETERMINED** — the gate document explicitly
declines to assert a root cause.

**Reproduction**
1. `npm run tauri:dev` on macOS
2. Sign in to Humble (visible login sheet)
3. Click Humble's disconnect / logout control
4. App beach-balls; force-kill required

**Reproduction rate: OBSERVED ONCE (the gate run). Not retried since.**
Reproducibility is therefore itself an open question — establishing whether the wedge is
deterministic, intermittent, or one-shot is the first order of business, before any candidate
layer is preferred.

**Live access: AVAILABLE.** The operator can drive live macOS runs on request, including
instrumented launches and capturing a sample of the hung process (`spindump` / `sample` / lldb
backtrace) — which would name the actually-blocked main thread directly rather than inferring it.

## Candidate layers (from the gate document — NONE PREFERRED)

Recorded per this phase's own lesson: when two readings of a measurement both fit, build the
discriminator; do not ship the nicer-sounding cause.

- **(a)** Plan 13's deletion of the `/autofill-request` sentinel arm from the shared
  `.on_navigation(` closure that also carries the `/reveal`, `/clear-storage`, and `/login-cancel`
  arms on the shared `REVEAL_EXFIL_HOST` (`gamelib.invalid`). Removing one arm from a shared
  closure is a structural change to that closure's control flow even though the other three arms'
  bodies are unchanged. **Note the disconnect flow depends on `/clear-storage` — an arm of exactly
  this closure.**
- **(b)** Plan 14's new single-flight latch interacting with the hidden reveal-window path used by
  disconnect. Weaker: the latch is armed only under `if visible == true`
  (`src-tauri/src/main.rs:3355`) and cleared by exact label match, and the surviving transcript
  shows two clean arm/clear cycles on the visible path. NOT eliminated — the hidden-window path
  was never reached this run, so the latch's exemption was never confirmed live.
- **(c)** The pre-existing `humble_login_clear_storage` exfil-channel wait, which already carried
  the bounded-timeout defect F-34.4.2-10 before this cycle — an already-known weak point in the
  same disconnect flow.

## Prior related knowledge (verify before relying on)

- **F-34.4.2-03** — `beginSheet:` wedges the main thread on a just-created WKWebView window;
  resolved with a 250ms deferral. A DIFFERENT main-thread wedge in the same subsystem, and a
  precedent that AppKit calls in this area can block the main thread outright.
- **wry cookie delete lies about deleting** — use `WKWebsiteDataStore.removeData(for:)`. The
  disconnect flow's whole purpose is a cookie wipe.
- **`cookies_for_url()` drops the session cookie** — use `cookies()` + own suffix match.

## Current Focus

- hypothesis: "CONFIRMED (d). RESOLVED — see Resolution. Session closed after live human
  verification (checkpoint response, 2026-08-06): operator confirmed the disconnect completes
  with no beach-ball, and independent verification (116/116 `cargo test` including the new
  regression pin, genuine `humble_store/config.json` wipe, fresh launch log showing disconnect
  proceeding into store teardown) corroborates it end to end."
- test: "COMPLETE — live sample (`sample 75788 5`) against the hung `gamelib-shell` process
  (pre-fix) plus post-fix live human re-verification of the original repro steps (this
  close-out cycle). Both complete; see Evidence and Resolution.verification."
- expecting: "Satisfied on both counts: (1) pre-fix, the backtrace directly named
  `wry::WebView::cookies` -> `wait_for_blocking_operation` -> reentrant
  `NSRunLoop::acceptInputForMode:beforeDate:` -> `handle_redraw` -> `Mutex::lock` ->
  `__psynch_mutexwait`, confirming (d) and refuting (a)/(b) outright; (2) post-fix, the operator's
  live repro no longer wedges and the disconnect completes."
- next_action: "COMPLETE — session resolved and archived. No further action required for
  F-34.4.2-12 (item 6(a)). NOTE: gate item 6(b) (Epic absence checks) was never attempted and
  remains open — requires a separate live gate runner plan; fixing 6(a) does not clear it."

reasoning_checkpoint:
  hypothesis: "Disconnect's cookie census/count issues 4 wry `WebviewWindow::cookies()` calls
    against a freshly-created hidden WKWebView. Each blocks inside
    `wait_for_blocking_operation`'s reentrant `NSRunLoop` pump while the main thread already
    holds tao's `EventLoopHandler` handler mutex (from `with_callback`); the reentrant pump lets
    a pending CA transaction flush trigger tao's own redraw path, which tries to relock the SAME
    mutex -> self-deadlock."
  confirming_evidence:
    - "Live sample: 4185/4185 samples in the IDENTICAL main-thread state, backtrace naming
      exactly this frame chain (with_callback -> handle_user_message -> wry cookies ->
      wait_for_blocking_operation -> NSRunLoop pump -> CA transaction -> handle_redraw ->
      Mutex::lock -> __psynch_mutexwait)."
    - "[STRUCK 2026-08-06, do not rely on] Originally: '199-line launch log has zero occurrences
      of disconnect/census/clear-storage and a confirmed non-truncated single launch, placing the
      deadlock before the census log line, consistent with the backtrace.' This inference was
      WRONG — see the dedicated correction entry at the end of the Evidence section. Sidecar-side
      log output (including the census line) never reaches this transcript regardless of whether
      the code ran, per the project's `sidecar-console-and-logger-are-invisible` KB lesson, so the
      log's silence discriminates nothing. The backtrace bullet above is unaffected and remains
      the sole basis for the confirmed root cause."
  falsification_test: "If the sample's main-thread backtrace had shown a `beginSheet`/GCD frame
    or an `.on_navigation`/`/clear-storage` frame instead, that would have resurrected (a)/(b).
    It showed neither, in any of the 4185 samples."
  fix_rationale: "The fix eliminates the reentrant pump structurally rather than reducing its
    probability (a warmup delay) or adding a timeout (proven unable to help, since the block is
    below the level any Tauri-side timeout lives): it replaces wry's blocking getter with an
    async native completion-handler call whose main-thread closure only registers the callback
    and returns immediately, never blocking inside `with_callback`'s critical section at all.
    This exact pattern is already proven safe elsewhere in this same file
    (`clear_default_data_store_cookies_for_domain`, `humble_login_clear_cookies`'s own removal
    branch) — not a new, unproven technique."
  blind_spots: "Non-macOS platforms (Windows/webview2, Linux/webkitgtk) are untested for this
    exact hazard and left unchanged (D-09 discipline) — if their wry backends share an analogous
    reentrant-pump implementation, they remain exposed; no evidence either way. The login-poll
    direction (`humble_login_cookies`) shares the identical wry-internal mechanism and is left
    unfixed as explicitly out of this session's scope; recorded as a residual risk, not
    resolved. A live end-to-end reproduction of the deadlock itself was not re-attempted after
    the fix in this session (the checkpoint below requests it)."

## Evidence

- timestamp: 2026-08-05
  source: `.planning/phases/34.4.2-macos-login-window-ux-modal-child-window-attachment-in-field/34.4.2-LIVE-GATE-RERUN-3.md` (item 6, and finding F-34.4.2-12)
  observation: Live gate item 6(a) FAIL. Operator-observed hard wedge on the Humble disconnect
  click. Item 6(b) (Epic absences) NOT ATTEMPTED as a direct consequence — the session ended with
  the force-kill before Epic's login window could be opened.

- timestamp: 2026-08-05
  source: `/tmp/gamelib-dev.log` (214 surviving lines, per the gate document's own grep)
  observation: ZERO occurrences of "disconnect", "epic", "pristine", "clear-storage". The
  transcript ends at the second Humble cancel-strip dismissal. The required positive evidence for
  item 6(a) (the cookie-census aggregate-count line) is absent. Caveat F-34.4.2-11: the contract's
  mandatory `tee` WITHOUT `-a` truncated the log on every relaunch, so this absence may be an
  artifact of truncation rather than of the wedge. **Do not treat this log's silence as proof the
  disconnect code never ran.**

- timestamp: 2026-08-06
  source: `src/backend/humble/user.ts:851-1157` (`HumbleUser.disconnect()`), read in full.
  observation: The Tauri branch's `wipeSteps` are exactly two, run SEQUENTIALLY (never
  concurrently): `clearHumbleCookies` (opens ONE hidden window via `seam.open(HUMBLE_BASE_URL,
  {visible:false,...})`, does `readCensus()` (`seam.cookiesForDomain`) -> `clearCookies` ->
  `readCensus()` again, then `seam.close()` in a `finally`), THEN `clearHumbleStorage`
  (`seam.clearStorage`, which per `loginWindowSeam.ts` opens/closes its OWN separate hidden
  window entirely inside the Rust arm). No concurrency between the two seam.open() calls -- each
  wipeStep is fully awaited before the next starts. This rules out a cross-request race BETWEEN
  the two wipeSteps' own window-open calls specifically (does not rule out a race against a
  STILL-OPEN prior visible login window from the sign-in that preceded disconnect).

- timestamp: 2026-08-06
  source: `src-tauri/src/main.rs:3287-3785` (`humble_login_open` match arm, read in full) +
  `src-tauri/src/main.rs:3611-3652` (`sheet_presented` block).
  observation: For `visible == false` (disconnect's hidden window): (1) the `if visible == true`
  single-flight latch block (line 3355, candidate (b)) is skipped entirely -- never armed, never
  consulted. (2) `sheet_presented` is computed as `if visible { ... } else { false }` (line 3612)
  -- for a hidden window this takes the `else` branch directly, so `present_login_window_as_sheet`
  (the function containing the `beginSheet:` call candidate (a)/(b)/F-34.4.2-03 concern) is NEVER
  CALLED for a hidden window. (3) The `.on_navigation(` closure Plan 13 edited (deleting the
  `parse_autofill_request`/`post_autofill_right_click` branch) is attached unconditionally
  (not gated on `visible`), but its ONLY surviving branch (`is_login_cancel_request`) checks for
  host==`REVEAL_EXFIL_HOST` -- disconnect's hidden window only ever navigates within
  `humblebundle.com`, so this closure is a pure pass-through (`return true`) for every navigation
  it sees on this window, identically before and after Plan 13's edit. CONCLUSION: candidates (a)
  and (b) as literally described in the gate document do not have an execution path into
  disconnect's hidden-window flow -- both are STATICALLY WEAKENED for this specific bug (not
  eliminated outright: a live spindump could still surprise this reading, e.g. if some OTHER
  in-flight visible window's sheet machinery is what's actually stuck, see next entry).

- timestamp: 2026-08-06
  source: `src-tauri/src/main.rs:3084-3145` (`dispatch_rust_channel`'s own doc comments,
  `clipboard_read_text`/`app_relaunch` arms) confirms: "`dispatch_rust_channel` always runs on a
  `thread::spawn`'d worker thread ... never the main/reader thread" -- EVERY `rustInvoke` request
  (including each of disconnect's several `seam.*` calls) gets its own spawned worker thread, so
  concurrent RPC calls DO run in parallel worker threads even though JS awaits them sequentially
  within one wipeStep.
  implication: `WebviewWindowBuilder::new(...).build()` for disconnect's hidden window therefore
  runs on a worker thread, not the real macOS main thread -- consistent with every other
  AppKit-touching call in this file, all of which cross to the main thread via either
  `app.run_on_main_thread` or tauri's built-in dispatcher (`send_user_message`).

- timestamp: 2026-08-06
  source: `wry-0.55.1/src/wkwebview/mod.rs:1201-1222` (`WKWebViewInner::cookies()`, vendored
  crate at
  `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/wry-0.55.1/src/wkwebview/mod.rs`) +
  `wait_for_blocking_operation` (same file, line 1446) + `tauri-runtime-wry-2.11.4/src/lib.rs`
  (`webview_getter!`/`getter!` macros, lines 197-233, and `WebviewMessage::Cookies` handler,
  line 3913).
  observation: `window.cookies()` (used by BOTH `humble_login_cookies_for_domain`'s census read
  AND `humble_login_clear_cookies`'s own before/after `count_matching` closure -- FOUR total
  calls across disconnect's `clearHumbleCookies` wipeStep alone) resolves to wry's
  `WKWebViewInner::cookies()`, which calls `self.data_store.httpCookieStore().getAllCookies(...)`
  and then blocks in `wait_for_blocking_operation(rx)`. That function does NOT simply
  `rx.recv_timeout()` -- on every 2ms miss it calls
  `objc2_foundation::NSRunLoop::mainRunLoop().acceptInputForMode_beforeDate(...)`, i.e. it
  MANUALLY PUMPS THE MAIN THREAD'S RUN LOOP, reentrantly, from inside whatever call stack
  `handle_user_message` was already executing on the main thread (`getter!`'s `send_user_message`
  ensures this callback body runs ON the main thread, confirmed by `tauri-runtime-wry`'s own
  `if current_thread().id() == context.main_thread_id { handle_user_message(...) } else { ...
  queued ... }` dispatch at `lib.rs:239`). This has its own internal ~1s bound
  (`limit = 1.` seconds), so a SINGLE `cookies()` call should not hang indefinitely on its own --
  BUT `getter!`'s caller-side `$rx.recv()` (line 201, `tauri-runtime-wry-2.11.4/src/lib.rs`) that
  waits for `handle_user_message`'s reply has **NO TIMEOUT AT ALL**. If the reentrant
  `acceptInputForMode:beforeDate:` pump ever processes an event that leaves the run loop /
  dispatch queue in a state where the ORIGINAL `handle_user_message` invocation's `tx.send(...)`
  never fires (or the whole main thread ends up parked inside nested run-loop pumping serving a
  LATER queued request instead of returning to the one that's already 1s deep), the caller-side
  `rx.recv()` for that request -- and everything on the real main thread queued behind it,
  identical in shape to the pre-fix `beginSheet:` wedge this codebase's own KB entry
  (`white-window-not-sheet-cr01`) already diagnosed once for a DIFFERENT AppKit call -- would
  never return. This class of bug (a foreign/reentrant NSRunLoop pump from a busy-wait helper)
  was hardened for `beginSheet:` specifically (`SHEET_PRESENT_WKWEBVIEW_WARMUP_DELAY` +
  `LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT`) but was NEVER generalized to wry's OWN internal
  `cookies()`/`webview_getter!` busy-wait, which disconnect's census calls immediately after
  creating a brand-new hidden window -- the exact "no run-loop turns yet" precondition CR-01/
  TERMINAL already proved dangerous for a sibling AppKit call on this same class of
  freshly-created WKWebView.
  implication: this is a NEW, more specific, falsifiable candidate (d), structurally sound and
  precedented by this exact codebase's own prior finding, that neither the gate document's three
  candidates nor the debug file's initial framing named. It best fits the observed symptom shape
  (unbounded hang, no error, no log line, force-kill required) better than (a)/(b), which this
  session's static read shows have no execution path into the hidden-window flow at all.

- timestamp: 2026-08-06
  source: Live operator reproduction, checkpoint response. Repro refined: the wedge fires after
  confirming the disconnect confirmation panel ("yes"), not on the initial logout button click.
  Reproducibility 2/2 on demand, fresh launch each time — no longer a one-shot observation.
  `sample 75788 5` captured against the hung `gamelib-shell` process (pid 75788, macOS 26.5.2,
  ARM64) BEFORE force-kill. Durable evidence files (not deleted):
  `.planning/debug/evidence/F-34.4.2-12-hang-sample-2026-08-06.txt` (348KB full sample) and
  `.planning/debug/evidence/F-34.4.2-12-gamelib-dev-2026-08-06.log` (199-line launch log).
  observation: 4185 of 4185 samples on the main thread (`Thread_18144426`, com.apple.main-thread)
  in the IDENTICAL state — a hard deadlock, zero forward progress, not slow progress. Condensed
  backtrace: `main -> tauri::app::App::run -> tauri_runtime_wry::Wry::run -> tao
  EventLoop::run_return -> -[NSApplication run] -> __CFRunLoopRun -> tao
  app_state::AppState::cleared -> tao app_state::Handler::handle_user_events -> tao
  EventLoopHandler::with_callback (app_state.rs:78, TAKES THE HANDLER MUTEX) -> tao
  EventLoopHandler::handle_user_events::{{closure}} -> tauri_runtime_wry::make_event_handler ->
  tauri_runtime_wry::handle_event_loop -> tauri_runtime_wry::handle_user_message ->
  wry::WebView::cookies -> wry::wkwebview::InnerWebView::cookies -> wry::wkwebview::
  wait_for_blocking_operation -> NSRunLoop::acceptInputForMode:beforeDate: (REENTRANTLY PUMPS
  THE MAIN RUN LOOP) -> __CFRunLoopRun -> __CFRunLoopDoSources0 -> UC::DriverCore::
  continueProcessing -> CA::Transaction::flush_as_runloop_observer -> CA::Transaction::
  commit_transaction -> -[NSViewBackingLayer display] -> -[NSView
  _recursive:displayRectIgnoringOpacity:...] -> tao platform_impl::platform::view::draw_rect ->
  tao app_state::AppState::handle_redraw -> tao app_state::Handler::handle_nonuser_event ->
  std::sync::poison::mutex::Mutex::lock (RELOCKS THE SAME MUTEX) ->
  _pthread_mutex_firstfit_lock_slow -> __psynch_mutexwait (BLOCKED FOREVER)`.
  implication: MECHANISM CORRECTED — this is a reentrancy self-deadlock on tao's own
  `EventLoopHandler` handler mutex (the main thread relocks a non-reentrant mutex it already
  holds), NOT an unbounded/missing-timeout wait as candidate (d)'s original framing guessed. A
  `getter!`/`rx.recv()`-side timeout would NOT fix this: the main thread is blocked INSIDE the
  wry call, below the level any Tauri-side receive timeout lives — it would convert a guaranteed
  deadlock into a guaranteed timeout, not into working behaviour. Candidates (a) and (b) are
  FALSIFIED outright by this backtrace: no `.on_navigation` frame, no `/clear-storage` arm frame,
  no `beginSheet` frame anywhere in the 4185-sample capture. Candidate (c) (the pre-existing
  bounded-timeout defect on `humble_login_clear_storage`'s exfil-channel wait) is SUBSUMED, not
  eliminated — execution deadlocks inside the cookie-census/count step, strictly BEFORE
  `clearHumbleStorage`'s wipeStep (which owns `humble_login_clear_storage`) ever runs, so (c)'s
  own code path is simply never reached this run; its own bounded-timeout defect is neither
  confirmed nor refuted by this evidence.

- timestamp: 2026-08-06
  source: `.planning/debug/evidence/F-34.4.2-12-gamelib-dev-2026-08-06.log` (199 lines, this
  launch's own log, NOT the prior 214-line truncated one).
  observation: ZERO occurrences of "disconnect", "census", or "clear-storage"; the log ends at
  the sign-in flow's `humble_login_open: title change applied len=42`. This was a SINGLE launch
  with no relaunch, so F-34.4.2-11's truncation caveat does NOT apply here.
  **[CORRECTED 2026-08-06 — see the dedicated correction entry at the end of this Evidence
  section. The clause originally here asserting "the silence is a real signal, not a truncation
  artifact, placing the deadlock BEFORE the cookie-census log line" was WRONG and is struck; the
  discriminating claim does not hold — see correction entry for why. The remaining, unaffected
  part of this observation stands: this was a single non-truncated launch, and the log does show
  the SIGN-IN path's `beginSheet` 250ms deferral (F-34.4.2-03's fix) working correctly
  (`attached=true`, elapsed 603ms).]**

- timestamp: 2026-08-06
  source: `src-tauri/src/main.rs:2623-2685` (`clear_default_data_store_cookies_for_domain`'s
  `count_matching_cookies` closure) and `:3970-4118` (`humble_login_clear_cookies`'s own macOS
  removal branch), both read in full.
  observation: This codebase ALREADY has a proven, working pattern for reading the cookie jar on
  macOS WITHOUT ever calling wry's blocking `WebviewWindow::cookies()`: `app.run_on_main_thread`
  / `window.with_webview` dispatches a closure that only REGISTERS an async
  `WKHTTPCookieStore.getAllCookies(completionHandler:)` call and returns IMMEDIATELY (no blocking
  inside the main-thread closure, so no reentrant pump, so no nested mutex relock); the actual
  wait happens on a plain `mpsc_channel` + `rx.recv_timeout` on the CALLING (worker) thread,
  never nested inside tao's `with_callback` frame. This is the SAME `run_on_main_thread`
  main-thread-confinement shape `open_pristine_epic_login_window` and
  `present_login_window_as_sheet` already use for other AppKit calls in this file.
  implication: The fix does not need a new technique — it needs the TWO implicated call sites
  (`humble_login_cookies_for_domain`'s direct `window.cookies()` read at line 4324, and
  `humble_login_clear_cookies`'s `count_matching` closure's `w.cookies()` read at line 3951,
  used for both its before- and after-removal counts) rewired onto this already-proven pattern,
  gated `#[cfg(target_os = "macos")]` with the existing wry-based read preserved unchanged for
  non-macOS (D-09 discipline: no live evidence implicates `webview2`/`webkitgtk`, so their
  behavior is left declared-unverified, not silently assumed broken).

- timestamp: 2026-08-06
  source: `src-tauri/src/main.rs:3795-3827` (`humble_login_cookies`, the LOGIN-POLL direction
  used by `watchForLogin()`, unrelated to disconnect).
  observation: Also calls `window.cookies()` unconditionally on every platform, sharing the
  identical wry-internal hazard mechanically. NOT touched by this session's fix — it is a
  DIFFERENT call path (single call per poll tick, against a VISIBLE window already past its
  initial CA-transaction burst by the time cookies are polled, not the rapid four-call burst
  against a freshly-created hidden window that reproduced this bug), explicitly out of this
  session's scope, and has zero live evidence of failure.
  implication: A residual, mechanically-identical, but UNCONFIRMED latent risk. Recommend a
  follow-up finding/ticket to evaluate hardening `humble_login_cookies` the same way, rather than
  silently folding it into this fix's scope.

- timestamp: 2026-08-06
  source: Live checkpoint response (operator-relayed independent verification, this close-out
  cycle) + project KB lesson `sidecar-console-and-logger-are-invisible`
  (`~/.claude/projects/.../memory/sidecar-console-and-logger-are-invisible.md`, point 1: "the
  sidecar's stdout IS the RPC frame pipe" — `console.*`/file-logger output from sidecar-side code
  such as `src/backend/humble/user.ts` reaches neither the log file nor a `tee`'d terminal
  transcript, full stop, regardless of whether the code executed).
  observation: **CORRECTION to the Evidence entry immediately above this one (timestamp
  2026-08-06, source `F-34.4.2-12-gamelib-dev-2026-08-06.log`).** That entry's inference — "the
  silence is a real signal, not a truncation artifact, placing the deadlock BEFORE the
  cookie-census log line" — is WRONG. It correctly ruled out TRUNCATION (single launch, no
  relaunch, F-34.4.2-11 doesn't apply) but then treated the log's silence as informative anyway.
  It is not: the cookie-census line at `user.ts:1049` is emitted by sidecar-side JS, and per this
  project's own recorded KB lesson, sidecar `console.*`/file-logger output never reaches a `tee`'d
  terminal transcript under ANY circumstances — the sidecar's stdout is consumed as the RPC frame
  pipe, not surfaced as human-readable log text. So the census line's absence from this log was
  GUARANTEED regardless of whether execution reached it, deadlocked before it, or sailed straight
  through it. The log's silence therefore discriminates NOTHING about where the deadlock occurred
  — it is not corroborating evidence for the backtrace-based root cause, and should not have been
  cited as such.
  implication: This does NOT weaken the confirmed root cause (the 4185/4185-sample hung-process
  backtrace, unaffected by this correction, remains decisive and stands entirely on its own — see
  the "Live operator reproduction" Evidence entry above). It DOES mean the corroboration this
  debug file previously claimed from the log's silence was false corroboration and must not sit in
  the permanent record uncorrected — exactly the discipline this project's [[f10-diagnosis-process-lesson]]
  KB entry warns about (a correlation shipped as cause). The replacement functional-pass evidence
  for this close-out is the `humble_store/config.json` genuine-wipe observation from the live
  checkpoint verification (see Resolution.verification): the file is now 2 bytes (`{}`) with an
  mtime matching the verification run, versus 75-484 byte sibling backups — proof the disconnect's
  storage wipe executed for real, which is a stronger and independently-obtained signal than the
  now-retracted log-silence inference ever was.

## Eliminated

- hypothesis: "(a) Plan 13's deletion of the `/autofill-request` sentinel arm from the shared
  `.on_navigation(` closure caused or contributed to this wedge."
  evidence: Live sample's full main-thread backtrace (4185/4185 samples, see Evidence above)
  contains no `.on_navigation` frame, no `/clear-storage` arm frame, and no navigation-delegate
  frame anywhere. The deadlock is entirely inside `wry::WebView::cookies` ->
  `wait_for_blocking_operation` -> tao's redraw/mutex path — a different call path this closure
  is never on. Confirms the same-session static read (Evidence, 2026-08-06,
  `main.rs:3287-3785`+`:3611-3652`) that already showed no execution path into the
  hidden-window flow.
  timestamp: 2026-08-06

- hypothesis: "(b) Plan 14's single-flight latch (armed only for `visible == true`) interacting
  with the hidden reveal-window path used by disconnect caused or contributed to this wedge."
  evidence: Live sample's full main-thread backtrace contains no latch frame and no
  `beginSheet_completionHandler` frame anywhere. Confirms the same-session static read that the
  latch is skipped entirely for `visible == false` (disconnect's hidden window), and that
  `present_login_window_as_sheet` (the function containing `beginSheet:`) is never called for a
  hidden window at all.
  timestamp: 2026-08-06

(Candidate (c) — the pre-existing `humble_login_clear_storage` exfil-channel wait bounded-timeout
defect — is NOT listed here. It is SUBSUMED, not eliminated: execution never reaches that code
this run, so its own defect is neither confirmed nor refuted. See its own Evidence entry above.)

## Resolution

- root_cause: Reentrancy self-deadlock on tao's `EventLoopHandler` handler mutex. Disconnect's
  cookie census/count (`humble_login_cookies_for_domain` + `humble_login_clear_cookies`'s
  `count_matching` closure) makes FOUR `WebviewWindow::cookies()` round trips in quick succession
  against a just-created hidden WKWebView. Each resolves to wry's `wait_for_blocking_operation`,
  which reentrantly pumps `NSRunLoop::mainRunLoop()` from INSIDE `handle_user_message`, itself
  running inside tao's `EventLoopHandler::with_callback` (which already holds tao's handler
  `Mutex` for the whole user-event dispatch). The reentrant pump lets AppKit service a pending
  CoreAnimation transaction flush (freshly-created windows generate a burst of these during
  initial layout), and tao's own redraw path (`handle_redraw` -> `handle_nonuser_event`) tries to
  relock the SAME mutex the outer frame already holds -> the main thread deadlocks on a lock it
  itself owns. No timeout anywhere in this chain can fix it — the block is below the level any
  Tauri-side receive timeout lives.
- fix: On macOS, replace both implicated call sites' use of wry's blocking
  `WebviewWindow::cookies()` with this codebase's own already-proven async `WKHTTPCookieStore`
  completion-handler pattern (`window.with_webview` + `getAllCookies(completionHandler:)` +
  `mpsc_channel`/`rx.recv_timeout` on the calling thread, never nested inside the main-thread
  closure) — the same shape `clear_default_data_store_cookies_for_domain` and
  `humble_login_clear_cookies`'s own removal branch already use safely in this exact file.
  Non-macOS behavior is left byte-for-byte unchanged (D-09 discipline; no live evidence
  implicates other backends).
- verification: Regression test added to `src-tauri/src/main.rs`'s own `#[cfg(test)] mod tests`
  (`f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated`) — a source-scan pin proving neither
  implicated call site can reach wry's blocking `.cookies()` on macOS.
  RED (pre-fix, `cargo test --bin gamelib-shell f_34_4_2_12_...`):
  `assertion 'left == right' failed: F-34.4.2-12 regression: 'humble_login_clear_cookies' has an
  unconditional (or macOS-reachable) wry '.cookies()' call at main.rs line 3951
  ('Ok(w.cookies()'). ... left: Some("#[cfg(target_os = \"macos\")]") right:
  Some("#[cfg(not(target_os = \"macos\"))]") ... test result: FAILED. 0 passed; 1 failed.`
  GREEN (post-fix, same invocation): `test tests::f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated
  ... ok`. Full suite re-run clean: `cargo test --bin gamelib-shell` -> `test result: ok. 116
  passed; 0 failed; 1 ignored (pre-existing, unrelated); 0 measured; 0 filtered out`. `cargo
  build --tests` and `cargo clippy --tests` both clean (zero warnings in the changed regions;
  all pre-existing warnings elsewhere are unrelated to this fix). A live end-to-end deadlock
  reproduction is NOT safely automatable (it requires a real, contended AppKit/WebKit run loop;
  a flaky/hanging assertion would defeat its own purpose and risk hanging CI) — human
  live-verification requested via checkpoint instead.

  **Live human verification, 2026-08-06 (checkpoint response, closes this session):**
  1. Operator live reproduction (verbatim): signed in to Humble, clicked disconnect/logout,
     confirmed the panel. No beach-ball. The app remained responsive and the disconnect
     completed. This is the exact original repro sequence from Symptoms, now passing.
  2. `cargo test` in `src-tauri`: 116 passed, 0 failed, 1 ignored, 0 warnings, 0 errors. The
     regression pin `f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated` is present and
     GREEN, and its presence in a passing `cargo test` build also proves the macOS-gated async
     branch compiles on this platform.
  3. Functional proof the disconnect did real work rather than short-circuiting:
     `~/Library/Application Support/gamelib/humble_store/config.json` is 2 bytes (`{}`) with an
     mtime (13:52) matching the verification run, versus 75-484 byte sibling backups — the
     Humble credential store was genuinely emptied by this run.
  4. Fresh launch log `/tmp/gamelib-dev-1785981096.log` (197 lines) shows the sign-in sheet path
     working (`beginSheet` deferral, `attached=true`, `elapsed=613ms`) and ends with
     `[sidecar:err] [sidecar/handlers] no live store instance for 'humble_sync'` and
     `refusing to snapshot denied cache store 'humble_library'` — i.e. the disconnect proceeded
     into store teardown, further than the pre-fix wedged run ever reached.

  All four items are consistent and mutually corroborating (operator observation, automated test
  suite, on-disk side effect, and a fresh independent log), from three different evidence
  channels (human, filesystem, process log) that do not share a common failure mode. Session
  verified end to end and closed.
- files_changed:
  - src-tauri/src/main.rs (humble_login_cookies_for_domain arm, humble_login_clear_cookies's
    count_matching closure, new regression test)
  - .planning/debug/humble-disconnect-main-wedge.md (this session file, moved to
    .planning/debug/resolved/ on close)
  - .planning/debug/evidence/F-34.4.2-12-hang-sample-2026-08-06.txt (durable hang-sample evidence)
  - .planning/debug/evidence/F-34.4.2-12-gamelib-dev-2026-08-06.log (durable launch-log evidence)

## Residual Risks

<!-- Deferred/open items surfaced during close-out. NOT resolved by this session's fix. -->

- **`humble_login_cookies` (login-poll direction) is unfixed and mechanically identical.** Used
  by `watchForLogin()` (`src-tauri/src/main.rs:3795-3827`), it still calls wry's blocking
  `.cookies()` on macOS unconditionally — the same reentrant-pump-under-`with_callback` hazard
  this session fixed for the disconnect path. No live failure has been observed on this path
  (it's a single call per poll tick against an already-settled visible window, not the rapid
  four-call burst against a freshly-created hidden window that reproduced F-34.4.2-12), so it is
  explicitly OUT OF SCOPE for this session. Recommend a follow-up finding/ticket to evaluate
  hardening it with the same async `WKHTTPCookieStore` pattern. **OPEN — not resolved.**
- **The regression pin is structural, not behavioural.** `f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated`
  is a source-text scan that matches only two exact call-site prefixes (`Ok(w.cookies()` and
  `let all = window.cookies()`). It proves those two exact call sites stay macOS-gated; it would
  NOT catch a new blocking `.cookies()` call written in a different textual shape (e.g. a
  differently-named binding, a method chain split across lines, or a call added at a third site).
  It is not a substitute for a live end-to-end reproduction test, which remains unautomatable for
  the reasons stated above. **Limitation to keep in mind for future changes near this code.**
- **Gate item 6(b) (Epic absence checks) was NEVER ATTEMPTED.** It was blocked entirely by item
  6(a)'s wedge (the session ended in a force-kill before Epic's login window could even be
  opened). Fixing 6(a) — this session's work — does NOT clear 6(b). A fresh live gate run,
  covering 6(b) specifically, is still required and must be performed by a separate runner plan
  per this phase's binding author/runner separation (decision D-E). **OPEN — not resolved, not
  attempted.**
