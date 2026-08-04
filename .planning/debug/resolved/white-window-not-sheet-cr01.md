---
status: awaiting_human_verify
trigger: "— white window opens rather than a expected sheet for login. is not a child CR-01"
created: 2026-08-04
updated: 2026-08-04T03:05:00Z
---

## Symptoms

DATA_START
- **Expected:** A visible Tauri-managed login window (Humble/GOG/Amazon) presents as an AppKit SHEET attached to the app's `main` window on macOS (REQ-34.4.2-01/-02) — un-losable, cannot be ordered behind its parent.
- **Actual:** An ordinary titled macOS window with standard traffic-light buttons and blank white content opens instead — neither a sheet nor a child window — and can be ordered behind the main window. Finding F-34.4.2-03 (BLOCKING).
- **Errors:** None. `present_login_window_as_sheet` logs `sheet_presented=true` regardless (CR-02 — no `attachedSheet`/`isSheet` read-back, registration in `PRESENTED_LOGIN_SHEETS` happens on "dispatch didn't time out"). `gamelib.log` carries no `[shell]`-prefixed Rust output in this environment — capture tauri:dev stdout/stderr for live evidence.
- **Timeline:** Never worked. Both live gates (34.4.2-LIVE-GATE.md and 34.4.2-LIVE-GATE-RERUN.md) measured FAIL 0/6 on real macOS hardware (latest 2026-08-04). Automated suite fully green throughout (cargo 131/131, Jest 191/191) — defect is unreachable by the suite.
- **Reproduction:** On macOS under tauri:dev, trigger a Humble (or GOG/Amazon) login. The login window appears as a free-standing white window instead of a sheet.
DATA_END

## Prior Analysis (from 34.4.2-REVIEW.md / 34.4.2-VERIFICATION.md — verified present in current tree as of 2026-08-04)

- **CR-01 (prime root-cause candidate):** The login `WebviewWindowBuilder` is built with `.visible(visible)` at `src-tauri/src/main.rs:3595` plus `.center()`/`.focused(true)` at `:3600-3601`. tao orders the window in and makes it key during `.build()`, BEFORE `present_login_window_as_sheet` (`main.rs:2712`, call site `:3830-3835`) queues the main-thread closure calling `parent.beginSheet_completionHandler(child, None)` (`:2750`). AppKit's sheet API expects the sheet window to be offscreen; presenting an already-visible, already-key window does not re-parent it — the call silently does nothing. Reverse race also exists: deferred tao show/focus work landing after `beginSheet:` would detach a just-presented sheet.
- **CR-02:** `present_login_window_as_sheet` (`:2712-2775`) returns `true` without reading back `parent.attachedSheet()`/`child.isSheet()` — success signal is unfalsifiable.
- **Suggested fix shape (from review):** macOS sheet path builds the window hidden (`.visible(false)`), drops pre-emptive `.center()`/`.focused(true)` (sheet position/key status are owned by `beginSheet:`), lets `beginSheet:` perform the reveal; on failure fall back to showing the window so the user is never left with an invisible login. CR-02: propagate confirmed-attachment boolean through the channel; only log/register on confirmed true.

## Constraints

- BINDING operator decision: sheet + close affordance. Do NOT re-propose child windows.
- All new behaviour must stay `#[cfg(target_os = "macos")]`-gated; Windows/Linux/Electron unchanged (REQ-34.4.2-08).
- Epic login window is byte-untouched (REQ-34.4.2-10, machine-enforced guard `PHASE_34_4_2_NEW_SYMBOLS`).
- Live proof requires capturing tauri:dev stdout/stderr (gamelib.log has no `[shell]` lines).

## Current Focus

reasoning_checkpoint:
  hypothesis: "CR-01 — the sheet-candidate WebviewWindow is built `.visible(visible)` (main.rs:3595) with `.center()`/`.focused(true)` (3600-3601) inside `if visible`, all executed synchronously during `.build()` (3817) BEFORE `present_login_window_as_sheet` is ever called (3830-3835). tao/wry orders the window in and makes it key at `.build()` time. AppKit's `beginSheet:completionHandler:` (called afterward, at 2750) expects an offscreen, non-key window to convert into a sheet; presenting an already-visible, already-key window is a no-op re: sheet attachment, leaving an ordinary titled window on screen. CR-02 compounds this: `present_login_window_as_sheet` (2712-2775) returns `true` on nothing more than 'the main-thread dispatch didn't time out' -- it never reads back `parent.attachedSheet()`/`child.isSheet()`, so a silently-failed `beginSheet:` is reported as success and registered in PRESENTED_LOGIN_SHEETS regardless."
  confirming_evidence:
    - "Read main.rs:3592-3601 directly: builder chain is `.user_agent(user_agent).visible(visible)` then, inside `if visible`, `.inner_size(900.0,700.0).center().focused(true).theme(...)` — all builder-time, unconditional on platform."
    - "Read main.rs:3817-3835 directly: `.build()` happens first (3817), `present_login_window_as_sheet(app, &label)` is only called after (3832) — confirms strict ordering, window is already on screen and key before the sheet call ever runs."
    - "Read main.rs:2712-2775 (present_login_window_as_sheet) directly: the function calls `parent.beginSheet_completionHandler(child, None)` (2750), sends `()` (not a bool) over the channel, and returns `true` unconditionally once `rx.recv_timeout` doesn't error (2758-2775) — no call to `attachedSheet()` or `isSheet()` anywhere in the function. Confirms CR-02 exactly as prior analysis stated."
    - "Both live gates (34.4.2-LIVE-GATE.md, 34.4.2-LIVE-GATE-RERUN.md) measured FAIL 0/6 with the observed symptom being an ordinary titled/traffic-lighted window, consistent with beginSheet: silently no-op'ing on an already-visible/key window rather than throwing or erroring."
  falsification_test: "If the window were built hidden (`.visible(false)`) with no pre-emptive `.center()`/`.focused(true)`, and `beginSheet:` still failed to attach (confirmed via `attachedSheet()`/`isSheet()` read-back returning false/None), that would falsify CR-01 as sufficient and point to a different mechanism (e.g. `MAIN_WINDOW_LABEL` resolving to the wrong/no NSWindow, or a run_on_main_thread ordering issue). This exact check is what the CR-02 read-back now makes observable for the live gate to run."
  fix_rationale: "Root cause is ordering + an unfalsifiable success signal, not a wrong API call — `beginSheet_completionHandler` is the correct AppKit call (Test 6 already asserts it exists exactly once). Fix (a) builds the macOS sheet-candidate window hidden and defers `.center()`/`.focused(true)` (AppKit-only concerns owned by `beginSheet:`) so there is nothing for AppKit to silently refuse, (b) reads back `attachedSheet()`/`isSheet()` on the main thread immediately after `beginSheet_completionHandler` returns so success is verified, not assumed, and only registers PRESENTED_LOGIN_SHEETS on confirmed attachment, and (c) if attachment is not confirmed, explicitly falls back to `window.center()/.show()/.set_focus()` so the user is never left with an invisible window. This addresses the mechanism directly rather than papering over the symptom (e.g. would NOT be fixed by just suppressing the traffic-light buttons or re-trying beginSheet: in a loop)."
  blind_spots: "Cannot execute this fix on real macOS hardware in this environment — no live AppKit runtime available here, so confirmed-attachment behavior is verified statically (source-shape + cargo build/test) only, not observed live. Also unverified: whether dropping `.center()` for the sheet-candidate build affects the sheet's on-screen position when it does attach (AppKit sheets are typically anchored under the parent's title bar regardless of the child's pre-set frame origin, but this is inference from AppKit sheet semantics, not a direct observation in this codebase)."
test: "Read src-tauri/src/main.rs window-build arm (3592-3601) and present_login_window_as_sheet (2712-2775) — DONE, confirmed CR-01 ordering and CR-02 unconditional-true in current tree, no drift from prior analysis."
expecting: "Confirmed both defects present verbatim as documented; proceed to fix_and_verify."
next_action: "SUPERSEDED by the F-34.4.2-04 continuation below -- commit 751521663 (CR-01/CR-02 fix) was applied, but the operator's first live hardware run of it reported a SYMPTOM CHANGE, not a fix: no window at all plus a spinner that never cleared. See the new reasoning_checkpoint below for the continuation investigation and fix."

## Continuation: F-34.4.2-04 (checkpoint response, post commit 751521663)

reasoning_checkpoint:
  hypothesis: "The CR-01/CR-02 fix (commit 751521663) is directionally correct (building the sheet-candidate window hidden is AppKit's documented precondition for beginSheet:, confirmed via web research) but introduced a NEW single point of failure: `present_login_window_as_sheet`'s visible-fallback (`window.show()`/`window.set_focus()` in `humble_login_open`) is gated entirely on `present_login_window_as_sheet` RETURNING. If that function stalls anywhere along its critical path -- including a leg it does not itself bound with a timeout -- the fallback that exists SPECIFICALLY to guarantee visibility never runs, producing exactly the reported regression: no window at all (worse than F-34.4.2-03's free-standing white window) plus a spinner that never clears. Direct read of `login_window_ns_window` -> `WebviewWindow::ns_window()` -> tauri-runtime-wry's `window_getter!`/`getter!` macros (vendored crate source, tauri-runtime-wry-2.11.4/src/lib.rs:197-211) confirms this call blocks on an UNBOUNDED `rx.recv()` (no timeout parameter exists in that macro) -- and `present_login_window_as_sheet` calls `.ns_window()` TWICE (parent + child), synchronously, BEFORE its own 10s `rx.recv_timeout` bound even begins. That is a genuine, code-provable un-bounded-wait sitting on the critical path the CR-01/CR-02 fix now makes load-bearing for whether the user ever sees a window at all."
  confirming_evidence:
    - "Direct read of dispatch_rust_channel's only call site (main.rs:4901, inside start_reader's per-request thread::spawn) confirms dispatch_rust_channel -- and therefore present_login_window_as_sheet -- ALWAYS runs on a spawned WORKER thread, never the main thread. This FALSIFIES the checkpoint response's specific 'rx.recv on the main thread' self-deadlock theory: the worker thread's recv_timeout/recv calls are never on main, so there is no same-thread reentrant deadlock in this file's own code."
    - "Direct read of tauri-runtime-wry-2.11.4/src/lib.rs: `WryWebviewDispatcher`/`WryWindowDispatcher::run_on_main_thread` (line ~1604/1982) and `Context::create_window` (line ~301-335) both resolve to `send_user_message`, which -- when called off the main thread -- is `context.proxy.send_event(message)`: fire-and-forget, non-blocking. `.build()` and the visible-fallback's `.show()`/`.set_focus()` are therefore NEVER blocking on the worker thread; they queue and return immediately regardless of whether the main thread has processed them yet."
    - "Direct read of the SAME file's `getter!` macro (line 197-204): `$crate::send_user_message(&$self.context, $message)?; $rx.recv().map_err(...)` -- an UNBOUNDED recv with NO timeout. `WebviewWindow::ns_window()` (tauri-2.11.5/src/window/mod.rs:1631-1647) routes through `dispatcher.window_handle()` -> `get_raw_window_handle()` -> exactly this `window_getter!` macro. `login_window_ns_window` (main.rs) calls `.ns_window()` for both the parent and the child, synchronously, at the TOP of `present_login_window_as_sheet`, before the function's own bounded 10s wait even starts."
    - "Web research (Apple Developer Forums / Cocoa sheet documentation) confirms building the sheet-candidate window hidden before calling beginSheet:completionHandler: is the textbook-correct AppKit pattern, not a new hazard -- CR-01's diagnosis and fix direction stand. Nothing found contradicts hiding-before-sheet as a hang source; the hang risk identified here is structural (an unbounded internal getter now sitting upstream of the fallback), not an AppKit precondition violation."
    - "git diff of commit 751521663 (`git show 751521663 -- src-tauri/src/main.rs`) shows the ONLY new AppKit calls added inside the main-thread closure are two cheap property getters (`child.isSheet()`, `parent.attachedSheet()`) -- neither is a plausible hang source by itself. The genuinely new RISK is architectural (fallback fully gated on one function's completion with an un-owned unbounded leg), not a specific new blocking AppKit call."
  falsification_test: "If a live re-run with captured tauri:dev stdout/stderr shows `present_login_window_as_sheet entered` and `both NSWindow addresses resolved` logging promptly (sub-second) but then NOTHING further (no 'main-thread closure entered' line) for many seconds, that would point at the main-thread dispatch/queue itself being starved by something else entirely (not this function's own logic) and would falsify the 'unbounded ns_window getter is the stall' half of this hypothesis -- pointing instead at main-thread saturation from an unrelated source. Conversely, seeing 'main-thread closure entered' but never 'beginSheet dispatch call returned' would falsify the getter-stall hypothesis and implicate beginSheet_completionHandler itself. The diagnostics added in this fix are designed specifically to produce this discriminating evidence on the NEXT live run, which is why they are the primary content of the fix alongside the watchdog."
  fix_rationale: "Two changes, both additive and macOS-scoped: (1) instrument present_login_window_as_sheet with Instant-timed eprintln! at entry, after both ns_window resolutions, at main-thread-closure entry, right after beginSheet_completionHandler returns, and at the read-back result -- so a stall anywhere on this path is localized by the NEXT live run's captured stdout instead of producing another unlocalized 'it hung' report. (2) In humble_login_open, race the ENTIRE present_login_window_as_sheet call (not just its own internal main-thread dispatch) on a background thread against an independent LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT (15s, comfortably above the inner 10s bound). This decouples 'the visible-fallback is guaranteed to run within a bounded time' from 'present_login_window_as_sheet happens to return' -- directly satisfying the standing constraint 'never leave the user with an invisible login window' even in the presence of a stall this file cannot itself bound (tauri's own unbounded internal getter). This addresses the MECHANISM (fallback was reachability-gated on an unbounded dependency) rather than papering over the symptom -- it does not merely lengthen a timeout or retry in a loop."
  blind_spots: "Still cannot execute this on real macOS hardware in this environment -- the watchdog's effectiveness (does the fallback actually produce a visible, usable window when the race fires?) and the new diagnostics' actual output are both UNVERIFIED live. If the true stall is NOT in `login_window_ns_window`'s unbounded getter (e.g. it is genuinely inside AppKit's `beginSheet:` itself, or in `.build()`'s own internal dispatch, which this fix does not add a watchdog around), the 15s watchdog will still fire and the fallback will still run -- so the user-visible outcome (a shown window within ~15s) should hold regardless of which specific leg is slow, but the diagnostic logging's ability to pinpoint the exact leg depends on which hypothesis is correct. A background thread left permanently blocked (if the stall is truly unbounded/permanent) is an accepted resource leak, not remediated here -- consistent with this file's existing 'never fatal' philosophy for presentation failures, but worth surfacing explicitly as a known tradeoff."

test: "cargo check (clean), cargo test (131/131, 1 pre-existing ignored), cargo clippy (only pre-existing warnings, now at shifted line numbers 539-543/918/3765/3781/3907/3916, none inside the touched regions), npx jest src/backend/__tests__/tauriShellSource.test.ts (84/84, including all 9 Plan-02 sheet-presentation tests and the F-4/Test-559 presentation-token-scoping test), npx jest full suite (3735/3735, the previously-flaky enrichmentFlows.test.ts passed clean this run)."
expecting: "All static/structural checks clean; live macOS/tauri:dev proof of the watchdog firing and the fallback producing a visible window remains the open item for the next live run."
next_action: "SUPERSEDED by the F-34.4.2-05 continuation below -- commit 56d4986f8 (F-34.4.2-04 diagnostics + watchdog) was applied and the operator's round-2 live hardware run captured the requested tauri:dev [shell] diagnostics for the first time. They isolate the wedge to a single AppKit call (parent.beginSheet_completionHandler(child, None)) and FALSIFY this continuation's own leading theory (the unbounded login_window_ns_window() getter). See the new reasoning_checkpoint below for the continuation investigation and fix."

## Continuation: F-34.4.2-05 (checkpoint response round 2, post commit 56d4986f8)

reasoning_checkpoint:
  hypothesis: "`parent.beginSheet_completionHandler(child, None)` itself -- the single AppKit call between the two live-confirmed log lines 'main-thread closure entered' and the never-printed 'beginSheet dispatch call returned' -- wedges the real OS main thread forever when invoked synchronously, in the same run-loop turn as the sheet-candidate child window's own creation, on a WKWebView-backed NSWindow that has never completed an on-screen display/layout pass. This is a known class of macOS interaction (independently reported for unrelated Rust/Go webview+native-window stacks: Apple Developer Forums 'WKWebView in a modal window' thread, wailsapp/wails#4226 'Deadlock in webview_window_darwin', r0x0r/pywebview#138 'Deadlock while closing the window with persistent threads running'), not a bug in this file's own dispatch/threading logic, which F-34.4.2-04 already proved runs on a spawned worker thread throughout."
  confirming_evidence:
    - "The operator's round-2 [shell] log (captured via tauri:dev stdout/stderr for the first time, verbatim in Evidence below) shows: 'present_login_window_as_sheet entered' -> 'both NSWindow addresses resolved ... (elapsed=58.516541ms)' -> 'main-thread closure entered' -> then NOTHING further from inside that closure -> 'WARN: main-thread dispatch timed out ... (elapsed=10.063618708s)'. The only AppKit call between 'main-thread closure entered' and the missing 'beginSheet dispatch call returned' line (read directly from the pre-fix source, main.rs, at the time of this checkpoint) is `parent.beginSheet_completionHandler(child, None)` itself."
    - "This FALSIFIES this continuation's own leading theory from the prior round (F-34.4.2-04's reasoning_checkpoint): 'login_window_ns_window's unbounded getter (`.ns_window()`) sitting on the critical path before present_login_window_as_sheet's own bound even starts' -- the live log shows BOTH ns_window() calls completed in 58.5ms, two full orders of magnitude faster than the 10s WARN, and well before the main-thread closure (which does not call `.ns_window()` at all -- both addresses were already resolved on the calling worker thread, before `run_on_main_thread` was ever invoked) even started."
    - "Direct read of tao-0.35.3's vendored source (src/platform_impl/macos/window.rs:246-253) confirms every tao-created NSWindow, regardless of `.visible()`, is created with `backing: NSBackingStoreType::Buffered, defer: NO` -- it always has a real backing store from the moment `.build()` completes, never a deferred/unbacked window. This rules out 'the window has no backing store yet' as the hang's mechanism -- the window IS fully backed; it has simply never been ORDERED onto the window server's screen list (visible=false skips the `if visible { orderFront/makeKeyAndOrderFront }` branch at window.rs:630-637), which is precisely the AppKit-documented CR-01 precondition (confirmed again in this round's research: 'deselect Visible at Launch or it will fail to present modally')."
    - "Web research on the Apple Developer Forums 'WKWebView in a modal window' thread (independently, not this codebase) reports the same class of failure with the same tentative mechanism: 'WKWebView needs a certain NSRunLoop to do its work on, or perhaps it schedules its loading task on a queue that is paused while a modal window is running' -- and that a fix for an analogous case was found by 'rearranging things to avoid [invoking modal presentation] from inside a dispatch_async block', i.e. giving the content view's setup work real run-loop turns to complete BEFORE the modal/sheet transition call, not calling it synchronously back-to-back with the window's own creation."
    - "Direct read of tauri-runtime-wry-2.11.4/src/lib.rs:235-255 (`send_user_message`) confirms: when the caller is ALREADY on the main thread (`current_thread().id() == context.main_thread_id`), the message is handled SYNCHRONOUSLY INLINE (`handle_user_message(...)` called directly, no queueing) -- NOT posted for later processing. This means a second `app.run_on_main_thread(...)` call issued from WITHIN the first closure (itself already running on the main thread) would NOT yield a run-loop turn; it would execute inline, reproducing the exact same synchronous-back-to-back call shape that is the leading suspect. Confirmed by a real `cargo check` failure (E0277, `*mut c_void cannot be sent`) when this was first attempted with `dispatch2` before the `SendPtr`-wrapper rebinding discipline was applied inside the new inner closure too -- an unrelated compile error, but it forced tracing this exact call-shape question before shipping a fix that silently would not have worked."
  falsification_test: "If a live re-run with the new diagnostics shows 'deferred beginSheet closure entered ... (deferred_elapsed=...)' printing (proving the `dispatch2::DispatchQueue::main().after()` deferral genuinely ran on a later run-loop turn, elapsed >= the 250ms warmup delay) followed immediately by 'beginSheet dispatch call returned' and a 'read-back attached=true', that CONFIRMS the hypothesis and the fix. If 'deferred beginSheet closure entered' prints but 'beginSheet dispatch call returned' STILL never prints (i.e. the wedge persists even after a genuine run-loop-yielding deferral), that FALSIFIES this hypothesis's specific mechanism (WKWebView needing warmup turns) and points instead at something unconditional about `beginSheet:completionHandler:` itself in this exact NSWindow/style-mask/subclass configuration (e.g. the `TaoWindow` class's `canBecomeKeyWindow`/`canBecomeMainWindow` override, tao-0.35.3/src/platform_impl/macos/window.rs:415-422, returning a stale/false `focusable` ivar) -- the next round would need to test THAT candidate specifically. If 'deferred beginSheet closure entered' never prints at all, that would mean GCD's main queue itself is not being serviced by this app's run loop, falsifying the whole `dispatch2` approach and requiring a completely different deferral mechanism (e.g. `NSRunLoop` pumping)."
  fix_rationale: "The fix defers the single suspect call (`beginSheet_completionHandler`) by a bounded, deterministic wall-clock delay (250ms, via `dispatch2::DispatchQueue::main().after()`) so WebKit's content-process handshake gets real run-loop turns to complete BEFORE the AppKit call that (per this round's evidence and independent third-party reports) appears to need it to have already happened. This is NOT a race against another thread and does not weaken the standing constraint ('never leave the user without a visible window', 'the hang itself must be prevented, not bounded/raced') -- it is a single-threaded, deterministic delay that runs strictly BEFORE the protected call, on the SAME main thread, and it composes cleanly with F-34.4.2-04's watchdog (still 15s, comfortably above this function's own 10s bound, itself comfortably above the 250ms warmup) rather than replacing it: if this fix's hypothesis is wrong and the wedge persists even after the deferral, the watchdog still fires and the visible-fallback still runs, so the user is never left with nothing regardless of whether this specific hypothesis is confirmed. Addresses the MECHANISM this round's evidence points to (a synchronous call-back-to-back-with-creation timing issue) rather than a symptom -- it does not touch CR-01's window-visibility precondition (still built `.visible(false)`, still never ordered before the deferred call) or CR-02's read-back (unchanged, now inside the deferred closure)."
  blind_spots: "Still cannot execute this on real macOS hardware in this environment -- whether 250ms is actually sufficient warmup time for WebKit's handshake (as opposed to needing longer, or needing an entirely different trigger such as the window's first `orderFront`/`orderOut` cycle rather than mere elapsed time) is UNVERIFIED live. The `TaoWindow` class's `canBecomeKeyWindow`/`canBecomeMainWindow` override (tao-0.35.3 window.rs:415-422) was read and noted as a candidate alternative mechanism but NOT ruled out or fixed here -- this fix targets the higher-confidence, better-corroborated (multiple independent third-party reports) hypothesis first, per one-hypothesis-at-a-time discipline; if the falsification test's second branch fires on the next live run, that ivar-override path is the next candidate to investigate. If GCD's main queue is for some reason not serviced promptly by this specific app's run loop configuration (unconfirmed either way in this environment), the 250ms delay could be exceeded without functional harm (the 10s/15s bounds still apply) but the diagnostic's 'deferred_elapsed' value would look anomalously large, which is itself useful signal for the next round."

test: "cargo check (clean), cargo test (131/131, 1 pre-existing ignored), cargo clippy (only pre-existing warnings, now at shifted line numbers 539-543/918/3850/3866/3992/4001, none inside the touched regions), npx jest src/backend/__tests__/tauriShellSource.test.ts (84/84, all 9 Plan-02 sheet-presentation tests including Test 1's single-call-site guard still pass -- the dispatch2 deferral is nested INSIDE the existing run_on_main_thread closure, not a second call site), npx jest full suite (3735/3735), git diff --exit-code Cargo.lock shows exactly one line added (dispatch2 promoted from transitive-only to also a direct dependency of gamelib-shell -- no new crate/version enters the tree, confirmed by diff)."
expecting: "All static/structural checks clean; live macOS/tauri:dev proof that the 250ms deferral actually unwedges beginSheet_completionHandler (or, if not, that the new diagnostics correctly localize the wedge to AFTER the deferred closure entered, ruling this hypothesis out cleanly) remains the open item for the next live run."
next_action: "Commit the F-34.4.2-05 fix (dispatch2 warmup-delay deferral + new diagnostics), then request human verification with an explicit ask to capture tauri:dev stdout/stderr again (same as last time) so the new 'deferred beginSheet closure entered' / 'deferred_elapsed' diagnostics can confirm or cleanly falsify this round's hypothesis."

## Evidence

- timestamp: 2026-08-04T00:00:00Z (continuation session)
  checked: src-tauri/src/main.rs humble_login_open builder-setup arm (original lines ~3592-3601) and present_login_window_as_sheet (original lines ~2712-2775), read directly
  found: CR-01 confirmed verbatim — `.visible(visible)` at build time, `.center()`/`.focused(true)` inside `if visible`, all executed before `.build()` (original :3817) which itself runs before `present_login_window_as_sheet` (original :3830-3835). CR-02 confirmed verbatim — function sent `()` over the channel and returned `true` unconditionally once `rx.recv_timeout` didn't error; no call to `attachedSheet()`/`isSheet()` anywhere in the function.
  implication: Both prior-analysis root causes are real and unchanged in the current tree. No drift since the verifier's 2026-08-04 confirmation. Safe to proceed straight to fix.

- timestamp: 2026-08-04T00:05:00Z
  checked: objc2-app-kit-0.3.2 vendored source (src/generated/NSWindow.rs) for attachedSheet()/isSheet() availability and feature gating; src-tauri/Cargo.toml's objc2-app-kit feature list
  found: Both `attachedSheet()` (returns `Option<Retained<NSWindow>>`) and `isSheet()` (returns `bool`) are unconditionally available on NSWindow once the already-enabled `NSWindow` feature is on — no `#[cfg(feature = ...)]` gate beyond that, no new Cargo.toml feature flags needed.
  implication: CR-02's read-back fix requires zero dependency/feature changes — pure logic addition inside the existing main-thread closure.

- timestamp: 2026-08-04T00:10:00Z
  checked: tauri-2.11.5 vendored source (src/webview/webview_window.rs) for post-build WebviewWindow methods
  found: `.center()`, `.show()`, `.set_focus()` all exist as `&self` methods returning `crate::Result<()>` on the built WebviewWindow handle.
  implication: The visible-fallback path can call these directly on the already-built `window` variable in humble_login_open without any new imports.

- timestamp: 2026-08-04T00:15:00Z
  checked: src/backend/__tests__/tauriShellSource.test.ts describe block "Phase 34.4.2 Plan 02 — AppKit sheet presentation" (Tests 1-9) and the F-4 presentation-token test (".inner_size(/.center()/.focused(true)/on_document_title_changed appear ONLY inside... if-visible block")
  found: Test 6 requires beginSheet_completionHandler and endSheet to each appear EXACTLY ONCE in the comment-stripped file — fix must not add a second call site. The F-4 token test requires `.center()` to appear nowhere in the humble_login_open arm body outside the original `if visible {` block.
  implication: Fix constrained to (a) one beginSheet_completionHandler call site (read-back happens inside the SAME main-thread closure, not a second call), and (b) the visible-fallback must use `window.show()`/`window.set_focus()` only, NOT `window.center()` (which would violate the token-scoping test).

- timestamp: 2026-08-04T00:30:00Z
  checked: applied fix (builder-visibility gate, CR-02 read-back, visible-fallback), then `cargo check`, `cargo test`, `npx jest src/backend/__tests__/tauriShellSource.test.ts`, `npx jest` (full suite), `cargo clippy` on real macOS hardware (this environment is macOS/arm64)
  found: `cargo check` clean; `cargo test` 131/131 passed (1 pre-existing ignored); Jest tauriShellSource.test.ts 84/84 passed (was 83/84 failing on first attempt because the initial fallback used `window.center()`, which collided with the F-4 token-scoping test above — fixed by dropping `.center()` from the fallback); full Jest suite 3734/3735 passed, with the single failure (`enrichmentFlows.test.ts` REQ-34.2-07) in a file untouched by this change, and confirmed non-reproducing when run in isolation (28/28 passed alone) — a pre-existing flake, not a regression. `cargo clippy` shows only pre-existing warnings at unrelated line numbers (539-543 doc-list-item, 918 manual hash_one, 3713/3729 borrow-of-already-Deref, 3855/3864 redundant &url) — none inside the code this fix touched.
  implication: Fix is statically/structurally verified — compiles, all Rust tests pass, all Jest guard tests (including the ones specifically written to protect this mechanism) pass, no regressions introduced. Live AppKit sheet-attachment behavior (whether beginSheet: actually attaches now that the race is removed) is NOT verified here — this environment has no way to drive a real tauri:dev session and trigger a login. That remains the phase's live gate's job (per binding constraint: record as a verification limitation, not claimed live proof).

- timestamp: 2026-08-04T01:30:00Z (F-34.4.2-04 continuation)
  checked: Operator checkpoint response to the post-fix human-verify request (commit 751521663 live on macOS hardware).
  found: "STILL BROKEN, and the symptom CHANGED. Operator report: 'window did not open at all, just apple spinner thing that stayed on as could not open form' — no login window appeared at all (neither sheet nor free-standing fallback), and a spinner/busy indicator persisted. No terminal [shell] log lines were captured (gamelib.log has no [shell] output in this environment, and tauri:dev stdout/stderr was not captured for this run either)."
  implication: New finding F-34.4.2-04 (BLOCKING, supersedes the "fix applied, awaiting verification" state). The CR-01/CR-02 fix did not merely fail to fix F-34.4.2-03 — it produced a WORSE observable outcome (nothing visible at all, vs a real-but-wrong window before). This is the strongest possible signal that the fix introduced a new stall somewhere on its own critical path, since the ONLY way "no window + persistent spinner" is worse than "wrong window" is if the code path that used to unconditionally show *something* (pre-fix: build with .visible(true)) no longer runs to completion post-fix (build hidden, present-as-sheet-or-fallback only completes if present_login_window_as_sheet returns).

- timestamp: 2026-08-04T01:40:00Z
  checked: Only call site of dispatch_rust_channel (main.rs:4901, inside start_reader's `if kind == Some("rustInvoke")` branch) — confirmed via direct grep for all call sites of `dispatch_rust_channel(`.
  found: Exactly one call site exists, and it is inside a `thread::spawn(move || { ... })` block (main.rs:4901-4908) spawned per incoming rustInvoke request from the reader thread (itself already a `thread::spawn`'d worker, main.rs:4789). `humble_login_open` (and therefore `present_login_window_as_sheet`) is therefore GUARANTEED to run on a spawned worker thread, never the OS main thread, never the sidecar-stdout reader thread.
  implication: FALSIFIES the checkpoint response's leading theory ("the recv is now itself executing ON the main thread ... classic self-deadlock"). There is no same-thread reentrant deadlock in this file's own code — `rx.recv_timeout`/`rx.recv` calls in this presentation path always run on a background thread, distinct from whatever thread is processing `run_on_main_thread`-queued closures. The hang mechanism, if real, must be something else.

- timestamp: 2026-08-04T01:50:00Z
  checked: tauri-runtime-wry-2.11.4 vendored source (src/lib.rs) — `send_user_message` (line 235-255), `WryWindowDispatcher::run_on_main_thread`/`Context::create_window` (lines ~301-335, ~1982), and the `getter!`/`window_getter!` macros (lines 197-218). Also tauri-2.11.5's `WebviewWindow::ns_window()` (webview_window.rs:1835-1837) and `Window::ns_window()` (window/mod.rs:1631-1647).
  found: (a) `send_user_message`, when called off the main thread, is `context.proxy.send_event(message)` — fire-and-forget, non-blocking; this is what backs `.build()`, `run_on_main_thread`, `.show()`, `.set_focus()`, `.center()`. None of these block the calling worker thread waiting for the main thread to actually process them. (b) The `getter!` macro (used by `.ns_window()`, `.inner_size()`, `.scale_factor()`, etc.) is `send_user_message(...)?; rx.recv()...` — an UNBOUNDED blocking receive with NO timeout parameter anywhere in the macro. `login_window_ns_window` (this file) calls `.ns_window()` for BOTH the parent and the child window, synchronously, at the very top of `present_login_window_as_sheet` — BEFORE that function's own bounded `rx.recv_timeout(Duration::from_secs(10))` around the beginSheet dispatch even begins.
  implication: Identifies a concrete, code-provable un-bounded-wait already latent in this file's pre-existing `login_window_ns_window` helper (unchanged by commit 751521663), now sitting on the critical path the CR-01/CR-02 fix made load-bearing for whether the visible-fallback ever runs at all (the fallback is entirely gated on `present_login_window_as_sheet` returning). If that unbounded getter ever fails to get a timely reply from the main thread — for any reason, including one not otherwise pathological (e.g. a `CreateWindow` message for the freshly-built child window not yet having been processed) — `present_login_window_as_sheet` never returns, and neither does the fallback that exists specifically to guarantee visibility. This is the strongest concrete mechanism found for the reported regression.

- timestamp: 2026-08-04T02:00:00Z
  checked: Web research on `NSWindow beginSheet:completionHandler:` preconditions (Apple Developer Forums, Cocoa sheet documentation/tutorials).
  found: Multiple independent sources confirm the sheet-candidate window must NOT be visible when `beginSheet:completionHandler:` is called — "if your sheet window is already visible when you call beginSheet:completionHandler:, it will fail to present modally" — i.e. hidden-before-sheet is the textbook-correct, expected precondition, not a newly introduced hazard. No source found describing a hang/deadlock specifically caused by presenting a genuinely-hidden window as a sheet.
  implication: CR-01's diagnosis and fix direction (build `.visible(false)`) remain correct and are NOT implicated as the hang's direct cause. The risk identified in this continuation is structural/architectural (the fallback's single point of failure on an unbounded upstream call), not a violation of an AppKit precondition.

- timestamp: 2026-08-04T02:10:00Z
  checked: Applied fix (diagnostics in present_login_window_as_sheet + LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT-bounded background-thread race in humble_login_open's sheet_presented assignment), then `cargo check`, `cargo test`, `cargo clippy`, `npx jest src/backend/__tests__/tauriShellSource.test.ts`, `npx jest` (full suite).
  found: `cargo check` clean. `cargo test`: 131/131 passed (1 pre-existing ignored). `cargo clippy`: only the same pre-existing warnings as before (doc-list-item at what is now 539-543, manual_hash_one at 918, needless-borrow-style warnings at 3765/3781/3907/3916 — all shifted by the same offset as the inserted diagnostic lines, none inside the newly touched logic). `npx jest tauriShellSource.test.ts`: 84/84 passed, including Test 1 (present_login_window_as_sheet( still called exactly once, still inside the humble_login_open arm — the watchdog wraps the call in a nested closure but does not add a second call site) and Test 3 (the call still sits inside `let sheet_presented = if visible { ... }`). `npx jest` full suite: 3735/3735 passed (the previously-noted enrichmentFlows.test.ts flake did not reproduce this run).
  implication: Fix is statically/structurally verified with the same rigor as the original CR-01/CR-02 fix. Live behavior (does the watchdog actually fire under a real stall, does the fallback produce a genuinely visible/usable window, do the new diagnostics pinpoint the exact stalling leg) remains unverified in this environment — that is the explicit ask for the next checkpoint.

- timestamp: 2026-08-04T02:30:00Z (F-34.4.2-05 continuation, checkpoint response round 2)
  checked: Operator checkpoint response to the post-F-34.4.2-04-fix human-verify request (commit 56d4986f8 live on macOS hardware, tauri:dev stdout/stderr captured via `tee` for the first time).
  found: |
    STILL BROKEN -- "endless [beachball], still going now" -- no window ever appeared (neither
    sheet nor fallback); the app's main thread was still wedged as of the report. Captured
    `[shell]` log, verbatim:
    ```
    [shell] humble_login_open: autofill glyph injected for 'loginwin-0-18c8932c04375588-b1b20836'
    [shell] humble_login_open: login cancel strip injected for 'loginwin-0-18c8932c04375588-b1b20836'
    [shell] login-window sheet: present_login_window_as_sheet entered for 'loginwin-0-18c8932c04375588-b1b20836'
    [shell] login-window sheet: both NSWindow addresses resolved for 'loginwin-0-18c8932c04375588-b1b20836' (elapsed=58.516541ms)
    [shell] login-window sheet: main-thread closure entered for 'loginwin-0-18c8932c04375588-b1b20836'
    [shell] WARN: login-window sheet: main-thread dispatch timed out for 'loginwin-0-18c8932c04375588-b1b20836' (elapsed=10.063618708s -- the main-thread closure above may still be running/queued; see LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT in humble_login_open for the caller-side bound that guarantees a fallback regardless)
    [shell] WARN: humble_login_open: 'loginwin-0-18c8932c04375588-b1b20836' sheet attachment unconfirmed -- falling back to a free-standing visible window
    [shell] humble_login_open: presentation requested visible=true width=900 height=700 center=true focus_once=true persistent_pin=false light_theme_requested=true sheet_presented=false
    [shell] humble_login_open: devtools opened for 'loginwin-0-18c8932c04375588-b1b20836' (debug build)
    ```
  implication: |
    New finding F-34.4.2-05 (BLOCKING, supersedes F-34.4.2-04's "fix applied, awaiting
    verification" state). This is the FIRST live evidence that localizes the wedge to a
    specific point: 'main-thread closure entered' prints, then nothing further from inside
    that closure for the full 10s bound -- the WARN that follows is
    `present_login_window_as_sheet`'s OWN `rx.recv_timeout` giving up on the worker thread,
    not a log line the closure itself produced. The only AppKit call between 'main-thread
    closure entered' and the never-printed 'beginSheet dispatch call returned' (read from the
    pre-fix source at the time of this checkpoint) is
    `parent.beginSheet_completionHandler(child, None)` itself. This directly FALSIFIES
    F-34.4.2-04's own leading theory (the unbounded `login_window_ns_window()` getter) --
    both NSWindow addresses resolved in 58.5ms, on the calling worker thread, well before the
    main-thread closure even started -- see the Eliminated entry below. The watchdog and
    fallback (F-34.4.2-04's own fix) DID work as designed on the worker-thread side
    (`sheet_presented=false`, the WARN fallback line, and the presentation-record line all
    printed) -- but the fallback's `window.show()`/`.set_focus()` calls are themselves
    main-thread-dispatched (queued via `send_user_message`) and can never execute while the
    real OS main thread stays wedged inside `beginSheet_completionHandler`, which is why the
    operator still observed no window and a persistent beachball despite the fallback code
    path having run to completion on the worker side. "devtools opened" printing is consistent
    with this too: `window.open_devtools()` is itself fire-and-forget/queued, so the eprintln!
    fires immediately regardless of whether the main thread ever actually processes it.

- timestamp: 2026-08-04T02:40:00Z
  checked: tao-0.35.3 vendored source, src/platform_impl/macos/window.rs -- `UnownedWindow::new` (line 517-644), `create_window` (line 163-338), and the `TaoWindow` custom NSWindow subclass (`WINDOW_CLASS`, line 404-427).
  found: |
    (a) `create_window` always allocates the NSWindow with `backing: NSBackingStoreType::Buffered,
    defer: NO` (line 246-253) regardless of the `visible` attribute -- the window always has a
    real backing store from creation; it is never a deferred/unbacked window. `visible: false`
    only skips the `if visible { makeKeyAndOrderFront/orderFront }` branch in `UnownedWindow::new`
    (line 630-637) -- the window is simply never ORDERED onto the window server's screen list,
    matching the AppKit-documented CR-01 precondition exactly (see the research entry below).
    (b) `create_window` also unconditionally calls `ns_window.center()` (line 331-333) whenever
    `attrs.position` is `None` -- which it always is for this arm's builder (it never calls
    `.position(...)`) -- REGARDLESS of the CR-01 fix's removal of the `humble_login_open` arm's
    own explicit `.center()` call. This centers the (still off-screen/unordered) window in
    space; harmless on its own (never visible while `visible: false`), but noted as a
    pre-existing tao-internal behavior this file's own CR-01 comment did not account for.
    (c) `TaoWindow` (the custom `NSWindow` subclass every tao window uses) overrides
    `canBecomeKeyWindow`/`canBecomeMainWindow` to return a `focusable` ivar set once at creation
    from `attrs.focusable` (line 258) -- a DIFFERENT field from `attrs.focused` (the
    grab-focus-on-creation flag `humble_login_open`'s CR-01 fix already skips on macOS). This
    file never calls a `.focusable(false)` builder method, so this ivar is presumed to stay at
    tao's own default; noted as an UNVERIFIED alternative candidate mechanism (if
    `canBecomeKeyWindow` were somehow `false`, a sheet's request to make its child key could
    behave unexpectedly) but not pursued further this round -- see this round's
    `blind_spots` field.
  implication: |
    Rules out "the child window has no valid backing store" as the hang's mechanism (it always
    does, via `defer: NO`). Confirms CR-01's `.visible(false)` fix is necessary and correctly
    implemented per tao's own window-creation code path. Surfaces two previously-undocumented
    tao-internal behaviors (the always-on `.center()`, and the `TaoWindow` class's
    key/main-window override) as background context for future rounds if this round's fix does
    not resolve the wedge.

- timestamp: 2026-08-04T02:50:00Z
  checked: Web research -- Apple Developer Forums "WKWebView in a modal window" thread; `wailsapp/wails#4226` ("Deadlock in Webview_window_darwin"); `r0x0r/pywebview#138` ("Deadlock while closing the window with persistent threads running"); further research on `NSWindow beginSheet:completionHandler:` preconditions.
  found: |
    Independent reports, across unrelated Rust/Go native-window+WKWebView stacks, describe the
    same CLASS of failure: a WKWebView-backed window participating in a modal/sheet transition
    can hang because "WKWebView needs a certain NSRunLoop to do its work on, or perhaps it
    schedules its loading task on a queue that is paused while a modal window is running" --
    and one developer's fix for an analogous case was "rearranging things to avoid [invoking
    the modal-presentation call] from inside a dispatch_async block", i.e. giving the webview's
    own setup work real run-loop turns to complete BEFORE the modal/sheet call, rather than
    invoking it synchronously back-to-back with window creation. No source found describes an
    EXACT match to this file's specific `beginSheet:completionHandler:` + `objc2` + `tao`
    combination (this remains genuinely novel as far as this research could confirm), but the
    mechanism class (WKWebView content-process handshake vs. modal/sheet transition timing) is
    corroborated by multiple independent, unrelated codebases.
  implication: |
    Provides the strongest available (though not 100% dispositive) support for the F-34.4.2-05
    hypothesis: the wedge is a timing/ordering issue between WebKit's own setup and AppKit's
    sheet-transition machinery, not a logic bug in this file's own Rust code. Directly informs
    the fix direction (defer `beginSheet:` by a real, bounded wall-clock amount rather than
    calling it synchronously in the same run-loop turn as window creation).

- timestamp: 2026-08-04T02:55:00Z
  checked: tauri-runtime-wry-2.11.4 vendored source, `send_user_message` (src/lib.rs:235-255) -- specifically the on-main-thread branch, not the off-main-thread branch already read in the prior round.
  found: |
    When the caller is ALREADY on the main thread (`current_thread().id() ==
    context.main_thread_id`), `send_user_message` calls `handle_user_message(...)` DIRECTLY,
    SYNCHRONOUSLY, INLINE -- it does NOT post the message for later processing via
    `context.proxy.send_event(...)` (that branch is `else`-only, for the off-main-thread case
    already documented in the F-34.4.2-04 evidence).
  implication: |
    A second `app.run_on_main_thread(...)` call issued from WITHIN
    `present_login_window_as_sheet`'s existing main-thread closure would NOT yield a run-loop
    turn -- it would execute synchronously inline, reproducing the exact same
    call-back-to-back-with-creation shape suspected of causing the wedge. This ELIMINATES
    "nest another `run_on_main_thread` call to defer `beginSheet:`" as a viable fix approach
    BEFORE it was implemented incorrectly and shipped for a wasted live-hardware round trip --
    `dispatch2::DispatchQueue::main().after(...)` (GCD, serviced by a dedicated run-loop source
    `NSApplication` registers automatically, independent of tao's own event-proxy pipeline) is
    used instead; confirmed present in this workspace's own dependency tree already (a
    transitive dependency of `tao` itself, `objc2-core-foundation`, `objc2-core-graphics`, and
    `rfd`) at version 0.3.1, added as an explicit direct dependency (`git diff --exit-code
    Cargo.lock` shows exactly one line, no new crate/version).

- timestamp: 2026-08-04T03:00:00Z
  checked: Applied fix (F-34.4.2-05: `SHEET_PRESENT_WKWEBVIEW_WARMUP_DELAY` constant + `dispatch2::DispatchQueue::main().after()` deferral of `beginSheet_completionHandler` and its CR-02 read-back, plus new diagnostics for the deferred closure's own entry/elapsed time; `dispatch2 = "0.3.1"` added to `src-tauri/Cargo.toml`'s macOS target dependencies), then `cargo check`, `cargo test`, `cargo clippy`, `npx jest src/backend/__tests__/tauriShellSource.test.ts`, `npx jest` (full suite), on real macOS hardware (this environment is macOS/arm64).
  found: |
    First `cargo check` attempt failed E0277 (`*mut c_void cannot be sent between threads
    safely`) -- the new inner `dispatch2` closure's direct field access
    (`parent_ptr.0`/`child_ptr.0`) triggered Rust 2021 disjoint closure capture to pull in only
    the bare pointer field, bypassing `SendPtr`'s `Send` impl, exactly the pitfall the OUTER
    closure's own pre-existing rebinding comment already warned about -- fixed by adding the
    same `let parent_ptr = parent_ptr; let child_ptr = child_ptr;` whole-wrapper-capture
    rebinding inside the new inner closure too. After that fix: `cargo check` clean. `cargo
    test`: 131/131 passed (1 pre-existing ignored). `cargo clippy`: only the same pre-existing
    warnings as every prior round, now at shifted line numbers (539-543 doc-list-item, 918
    manual_hash_one, 3850/3866/3992/4001 needless-borrow-style) -- none inside the newly touched
    logic. `npx jest tauriShellSource.test.ts`: 84/84 passed, including Test 1 (
    present_login_window_as_sheet( still called exactly once, still inside the humble_login_open
    arm -- the dispatch2 deferral nests inside the EXISTING run_on_main_thread closure, it does
    not add a second call site) and Test 6 (beginSheet_completionHandler/endSheet each still
    appear exactly once in the comment-stripped source). `npx jest` full suite: 3735/3735 passed
    (191/191 suites; the previously-noted `enrichmentFlows.test.ts` flake did not reproduce this
    run). `git diff --exit-code src-tauri/Cargo.lock`: exactly one line added (`dispatch2`
    promoted from transitive-only to also a direct dependency of `gamelib-shell`) -- no new
    crate/version entered the dependency tree, confirming the Cargo.toml comment's claim.
  implication: |
    Fix is statically/structurally verified with the same rigor as every prior round. Live
    behavior (does the 250ms warmup delay actually let `beginSheet:completionHandler:` return,
    does the new 'deferred beginSheet closure entered'/'deferred_elapsed' diagnostic confirm a
    genuine run-loop yield took place, does the sheet finally attach) remains unverified in this
    environment -- the explicit ask for the next checkpoint, per this round's own
    `falsification_test`.

## Eliminated

- hypothesis: "present_login_window_as_sheet's rx.recv_timeout is executing on the OS main thread, causing a same-thread self-deadlock against the run_on_main_thread-queued beginSheet closure (the checkpoint response's leading theory)."
  evidence: "Direct grep of every call site of dispatch_rust_channel (main.rs) shows exactly one, inside a thread::spawn block in start_reader's rustInvoke branch — present_login_window_as_sheet, and therefore every rx.recv_timeout in this presentation path, always executes on a spawned worker thread, never the main thread."
  timestamp: 2026-08-04T01:40:00Z

- hypothesis: "F-34.4.2-04's own leading theory: login_window_ns_window()'s two `.ns_window()` calls (routing through tauri-runtime-wry's unbounded `getter!`/`rx.recv()` macro, confirmed by direct crate-source read in the prior round) are where present_login_window_as_sheet stalls, sitting on the critical path before that function's own bounded 10s wait even begins."
  evidence: "The operator's round-2 live [shell] log (captured via tauri:dev stdout/stderr for the first time) shows 'both NSWindow addresses resolved ... (elapsed=58.516541ms)' printing promptly, followed by 'main-thread closure entered' -- which does not call `.ns_window()` at all, both addresses having already been resolved on the calling worker thread before `run_on_main_thread` was ever invoked. The 10s stall demonstrably happens AFTER this getter-based resolution completes, inside the main-thread closure itself, not in `login_window_ns_window`."
  timestamp: 2026-08-04T02:30:00Z

## Resolution

root_cause: |
  CR-01 + CR-02 together (commit 751521663), PLUS F-34.4.2-04 found on that commit's first
  live hardware run, confirmed in the current tree (src-tauri/src/main.rs):
  (1) CR-01: the sheet-candidate login window was built `.visible(visible)` with `.center()`/
      `.focused(true)` applied synchronously during `.build()`, which runs strictly BEFORE
      `present_login_window_as_sheet` is called. tao/wry orders the window in and makes it
      key at `.build()` time, so by the time `beginSheet:completionHandler:` runs, the child
      is already an ordinary visible/key window -- AppKit does not re-parent an
      already-visible window into a sheet, so the call silently fails to attach it, leaving
      exactly the observed symptom (F-34.4.2-03: ordinary titled window, not a sheet).
  (2) CR-02: `present_login_window_as_sheet` treated "the main-thread dispatch to run
      `beginSheet:` didn't time out" as proof of success and returned `true`/logged
      `sheet_presented=true` unconditionally, with no read-back of AppKit's own
      `attachedSheet()`/`isSheet()` state -- so CR-01's silent failure was invisible to both
      the operator's log line and the PRESENTED_LOGIN_SHEETS registry that gates the
      autofill right-click poster's authorization check.
  (3) F-34.4.2-04 (this continuation): fixing CR-01/CR-02 made the visible-fallback
      (`window.show()`/`.set_focus()`) entirely dependent on `present_login_window_as_sheet`
      returning at all. `login_window_ns_window`'s `.ns_window()` calls (used for BOTH the
      parent and child window, synchronously, before that function's own 10s bound even
      starts) route through tauri-runtime-wry's `getter!` macro, confirmed by direct read of
      the vendored crate source to block on an UNBOUNDED `rx.recv()` with no timeout anywhere
      in that macro. If that leg (or any other leg of `present_login_window_as_sheet`) ever
      stalls, the fallback that exists specifically to guarantee visibility never runs --
      producing exactly the operator's reported regression: no window at all (worse than
      F-34.4.2-03's wrong-but-real window) plus a spinner that never cleared. The checkpoint
      response's own leading theory (recv executing ON the main thread, self-deadlocking
      against the queued beginSheet closure) was directly falsified by tracing
      dispatch_rust_channel's single call site to a spawned worker thread (main.rs:4901) --
      the real mechanism is architectural (fallback reachability gated on an unbounded
      dependency), not a same-thread reentrant deadlock.
  (4) F-34.4.2-05 (this continuation, checkpoint response round 2): commit 56d4986f8's live
      hardware run captured `tauri:dev` stdout/stderr for the first time, and the F-34.4.2-04
      diagnostics localize the wedge precisely -- `main-thread closure entered` prints, then
      NOTHING further for the full 10s bound. This directly FALSIFIES F-34.4.2-04's own
      leading theory (the unbounded `login_window_ns_window()` getter -- both NSWindow
      addresses resolved in 58.5ms, well before the main-thread closure even started, per the
      Eliminated entry). The only AppKit call between the last-printed line and the
      never-printed `beginSheet dispatch call returned` is
      `parent.beginSheet_completionHandler(child, None)` itself -- the OS main thread is
      wedged inside (or immediately around) that single call. Independent third-party reports
      (Apple Developer Forums "WKWebView in a modal window" thread; `wailsapp/wails#4226`;
      `r0x0r/pywebview#138`) describe the same CLASS of failure for unrelated Rust/Go
      webview+native-window stacks: a WKWebView-backed window that has never completed an
      on-screen display/layout pass can wedge AppKit's modal/sheet-transition machinery when
      the transition call is made synchronously, in the same run-loop turn as the window's
      own creation -- WebKit's content-process handshake needs real run-loop turns to
      complete first. F-34.4.2-04's own watchdog and fallback DID run to completion on the
      worker-thread side (confirmed by the log's WARN/fallback/presentation-record lines all
      printing), but the fallback's `window.show()`/`.set_focus()` calls are themselves
      main-thread-dispatched and can never execute while the real main thread stays wedged --
      explaining why the operator still saw no window and a persistent beachball despite the
      fallback code path having "succeeded" on the worker side.
fix: |
  In src-tauri/src/main.rs, macOS-only (`#[cfg(target_os = "macos")]`):
  CR-01/CR-02 (commit 751521663, unchanged by this continuation):
  (1) The `humble_login_open` sheet-candidate window is always built `.visible(false)` on
      macOS regardless of the arm's `visible` argument, skipping pre-emptive
      `.center()`/`.focused(true)` (Windows/Linux keep those, unchanged).
  (2) `present_login_window_as_sheet` reads back `child.isSheet()` AND
      `parent.attachedSheet()` (pointer-compared to `child`) inside the SAME main-thread
      closure, immediately after `beginSheet_completionHandler` returns, and only
      registers/returns success on confirmed attachment.
  F-34.4.2-04 (this continuation, additive):
  (3) `present_login_window_as_sheet` gained `Instant`-timed `eprintln!` diagnostics at
      entry, after both `ns_window` resolutions, at main-thread-closure entry, right after
      `beginSheet_completionHandler` returns, and at the read-back result -- so a live
      re-run's captured `tauri:dev` stdout can localize a stall to a specific leg instead of
      producing another unlocalized "it hung" report.
  (4) `humble_login_open`'s `sheet_presented` assignment now spawns
      `present_login_window_as_sheet` on its OWN background thread and races the result
      against a new `LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT` (15s, comfortably above the
      function's own internal 10s bound) on a SEPARATE `mpsc_channel`. If the watchdog
      elapses first, `sheet_presented` is treated as `false` and the existing visible
      fallback (`window.show()`/`.set_focus()`, unchanged) runs regardless of whether
      `present_login_window_as_sheet` (or a background thread now potentially still running
      it) ever returns. This decouples "the fallback is guaranteed to run within a bounded
      time" from "present_login_window_as_sheet happens to complete", directly satisfying
      "never leave the user with an invisible login window" even against an unbounded
      internal dependency this file does not own.
  No new Cargo.toml *feature* requirements for the CR-01/CR-02/F-34.4.2-04 work.
  Epic's pristine login window path (`open_pristine_epic_login_window`) remains untouched --
  verified by the pre-existing `PHASE_34_4_2_NEW_SYMBOLS` scope-guard tests, which still pass.
  `present_login_window_as_sheet(` remains called exactly once in the file (Test 1), still
  inside the humble_login_open arm's `let sheet_presented = if visible { ... }` block (Test 3)
  -- the watchdog wraps the call in a nested closure, it does not add a second call site.
  F-34.4.2-05 (this continuation, additive):
  (5) A new constant `SHEET_PRESENT_WKWEBVIEW_WARMUP_DELAY` (250ms) documents the live
      evidence and third-party research behind this fix (main.rs, immediately after
      `LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT`).
  (6) Inside `present_login_window_as_sheet`'s existing main-thread closure, the actual
      `beginSheet_completionHandler` call and its CR-02 read-back are no longer invoked
      synchronously inline. They are moved into a NEW inner closure scheduled via
      `dispatch2::DispatchQueue::main().after(when, ...)`, `SHEET_PRESENT_WKWEBVIEW_WARMUP_DELAY`
      in the future -- deliberately NOT a second `app.run_on_main_thread(...)` call, which
      `tauri-runtime-wry`'s `send_user_message` (confirmed by direct source read) executes
      SYNCHRONOUSLY INLINE when already on the main thread, and so would not yield a
      run-loop turn at all. GCD's main queue is serviced by a dedicated run-loop source
      `NSApplication` registers automatically, independent of tao's own event-proxy pipeline.
  (7) New diagnostics: an `eprintln!` immediately before scheduling the deferral, and one at
      the top of the deferred closure reporting `deferred_elapsed` (time since scheduling) --
      so the next live run can confirm the deferral genuinely happened (elapsed >= 250ms)
      before `beginSheet dispatch call returned`/`read-back attached=...` (both pre-existing
      diagnostics, unchanged, now inside the deferred closure).
  (8) `dispatch2 = "0.3.1"` added to `src-tauri/Cargo.toml`'s `[target.'cfg(target_os =
      "macos")'.dependencies]` block, default features kept. Already resolved in this
      workspace's dependency tree at this exact version (transitive dependency of `tao`,
      `objc2-core-foundation`, `objc2-core-graphics`, `rfd`) -- `git diff --exit-code
      Cargo.lock` shows exactly one line added (this crate promoted from transitive-only to
      also a direct dependency of `gamelib-shell`), no new crate/version enters the tree.
  (9) The SAME `let parent_ptr = parent_ptr; let child_ptr = child_ptr;` whole-wrapper-capture
      rebinding the outer closure already used is now ALSO applied inside the new inner
      `dispatch2` closure -- required because that closure's own direct field access
      (`parent_ptr.0`/`child_ptr.0`) would otherwise let Rust 2021 disjoint closure capture
      pull in only the bare `*mut c_void` field, bypassing `SendPtr`'s `Send` impl (a real
      `cargo check` E0277 failure caught this before it shipped).
  `present_login_window_as_sheet(` still called exactly once (Test 1 still passes) --
  the `dispatch2` deferral nests inside the EXISTING `run_on_main_thread` closure, it does
  not add a second call site; `beginSheet_completionHandler`/`endSheet` each still appear
  exactly once in the comment-stripped source (Test 6 still passes).
verification: |
  Statically/structurally verified only (this environment has no live macOS/tauri:dev
  interactive session available):
  - `cargo check`: clean (after fixing one E0277 caught during this round's own development
    -- see Evidence).
  - `cargo test`: 131/131 passed (1 pre-existing ignored, unrelated).
  - `cargo clippy`: only pre-existing warnings, now at shifted line numbers (539-543
    doc-list-item, 918 manual_hash_one, 3850/3866/3992/4001 needless-borrow-style) -- none
    inside the newly touched logic.
  - `npx jest src/backend/__tests__/tauriShellSource.test.ts`: 84/84 passed, including all
    9 tests in the "AppKit sheet presentation" describe block, Test 1 (single call site,
    still inside the arm), Test 3 (still inside the `if visible {` sheet_presented block),
    Test 6 (beginSheet_completionHandler/endSheet each exactly once), and the F-4/Test-559
    presentation-token-scoping test.
  - `npx jest` (full suite): 3735/3735 passed, 191/191 suites (the previously-flaky
    `enrichmentFlows.test.ts` did not reproduce this run).
  - `git diff --exit-code src-tauri/Cargo.lock`: exactly one line added (`dispatch2` promoted
    from transitive-only to also a direct dependency), no new crate/version in the tree.
  LIVE VERIFICATION LIMITATION (per binding constraint, unchanged): whether the 250ms
  `SHEET_PRESENT_WKWEBVIEW_WARMUP_DELAY` deferral actually lets `beginSheet:completionHandler:`
  return on real macOS hardware, whether the new `deferred beginSheet closure
  entered`/`deferred_elapsed` diagnostic confirms a genuine run-loop yield took place, and
  whether the sheet finally attaches, are all UNVERIFIED here and remain the explicit ask for
  the next checkpoint (capture tauri:dev stdout/stderr again, same as last time).
files_changed:
  - src-tauri/src/main.rs
  - src-tauri/Cargo.toml
  - src-tauri/Cargo.lock
