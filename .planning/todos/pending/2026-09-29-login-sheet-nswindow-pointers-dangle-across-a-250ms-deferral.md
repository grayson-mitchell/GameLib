---
created: 2026-09-29T00:00:00.000Z
title: "Login-sheet NSWindow addresses are resolved on a worker thread and dereferenced 250ms later with no retain — the CR-01/CR-02 fix widened a use-after-free window from one run-loop turn to a measured 260ms"
area: shell
severity: major
platform: macos
ready: live-gate
needs: code-fix-then-live-gate
found_by: "Phase 34.4.2 critical-disposition pass (2026-09-29), measured at HEAD while confirming CR-01/CR-02 as fixed"
source: ".planning/phases/34.4.2-macos-login-window-ux-modal-child-window-attachment-in-field/34.4.2-REVIEW.md (WR-02 + its 2026-09-29 status block)"
files:
  - src-tauri/src/main.rs
---

# Login-sheet `NSWindow` pointers dangle across a 250ms deferral

Phase 34.4.2's **WR-02** is still open, and the fix that closed that phase's two criticals made its
exposure measurably worse rather than better. Both facts were measured at HEAD; neither is inferred
from a SUMMARY.

## The race

`present_login_window_as_sheet` resolves two raw `NSWindow` addresses on the calling (worker) thread
and dereferences them inside a closure that runs later on the main thread:

- `src-tauri/src/main.rs:3882` / `:3888` — `login_window_ns_window(app, MAIN_WINDOW_LABEL)` and
  `login_window_ns_window(app, label)`, each returning `Option<usize>`.
- `:3900-3903` — both wrapped in a local `struct SendPtr(*mut std::ffi::c_void)` carrying
  `unsafe impl Send for SendPtr {}`.
- `:3965-3968` — reconstructed as
  `unsafe { &*(parent_ptr.0 as *const objc2_app_kit::NSWindow) }`, same for the child.

There is no `retain()` and no `Retained<NSWindow>` across the hop. The SAFETY comment at
`:3961-3964` asserts the addresses "were resolved moments ago", which is a timing assumption rather
than an invariant — WR-02's original wording, still accurate.

If the login window closes between resolution and dereference — user Cmd+W, `captureOAuthLogin`
settling, or `humble_login_close` — both pointers dangle and the dereference is a hard crash of the
shell process.

## Why it got worse

The terminal fix for CR-01/CR-02 (commit `8b2fdb315`, diagnosed in
`.planning/debug/resolved/white-window-not-sheet-cr01.md`) had to defer the `beginSheet:` call,
because invoking it synchronously after WKWebView window creation **wedges the main thread** —
WebKit's content-process handshake needs real run-loop turns first. So the call now goes through
`dispatch2::DispatchQueue::main().after(when, …)` with
`SHEET_PRESENT_WKWEBVIEW_WARMUP_DELAY = Duration::from_millis(250)` (`:3762`, armed at `:3941-3943`).

The addresses are resolved *before* that timer is armed and dereferenced *after* it fires. The race
window therefore grew from one run-loop turn to a wall-clock quarter-second. The debug session's own
round-3 live log recorded the deferred closure entering at `deferred_elapsed=260.3ms`.

This is not an argument for reverting that fix — it was necessary, it is confirmed working, and the
phase's live gate passed 5/5 on its ninth attempt because of it. The point is that a latent race was
moved from "narrow" to "measurably wide" while the review still described the narrow version.

## Why this is not a one-line fix

`login_window_ns_window` deliberately returns `usize` rather than a live `Retained<NSWindow>`, and
says so at `:3655`: `Retained<NSWindow>` is **not `Send`**, so it cannot cross the dispatch boundary
as-is. "Just retain it" therefore does not typecheck without further restructuring.

WR-02's first proposed option is the tractable one: pass the `AppHandle` plus the two labels into the
closure and call `login_window_ns_window` *there*, so resolution and use are atomic with respect to
the event loop. `AppHandle` is `Send + Clone`. That also removes the `SendPtr` shim and the two
`unsafe` casts from this path entirely.

Note the dismiss path (`:4103`/`:4109`/`:4124`) has the same shape but is narrower — WR-02 records
its callers as already being on the main thread, so its closure runs inline. Confirm that still holds
before deciding whether to fix one path or both.

## Why `ready: live-gate`

This is `unsafe` Objective-C interop on the login-sheet path, which has a nine-attempt live-gate
history (verdict sequence FAIL 0/6 → FAIL → FAIL 5/6 → FAIL 5/6 → FAIL 1/6 → FAIL 0/5 → PASS 5/5).
A desk-only change here is not verifiable: the whole defect class in this area has only ever been
caught on real hardware, and `cargo` tests exercise the pure helpers while the jest gates assert
source text. Re-running the phase's sheet-attachment live gate after the change is the minimum bar.

Do **not** attempt to prove the fix with a timing test. The useful assertion is structural — that no
raw `NSWindow` address crosses the dispatch boundary on this path — plus the existing
`attachedSheet`/`isSheet` read-back (CR-02's fix) continuing to report `attached=true` on hardware.
