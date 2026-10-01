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
its callers as already being on the main thread, so its closure runs inline.

**CORRECTED 2026-09-30 (quick task 260930-q11, locked decision D-03).** This section used to end
"Confirm that still holds before deciding whether to fix one path or both." That confirmation was
NOT a precondition and was not made: **both paths were fixed**, deliberately, so the two have one
shape rather than a shape with an exception — which is also what lets the structural gate be a
single clean rule. And the premise behind treating the dismiss path as merely "narrower" was itself
incomplete: per finding A below, the hazard is the autorelease pool, not the thread hop, so a
closure that runs inline on an already-main thread still carries an address resolved into a pool
that is not guaranteed to outlive the hop.

## Why `ready: live-gate`

This is `unsafe` Objective-C interop on the login-sheet path, which has a nine-attempt live-gate
history (verdict sequence FAIL 0/6 → FAIL → FAIL 5/6 → FAIL 5/6 → FAIL 1/6 → FAIL 0/5 → PASS 5/5).
A desk-only change here is not verifiable: the whole defect class in this area has only ever been
caught on real hardware, and `cargo` tests exercise the pure helpers while the jest gates assert
source text. Re-running the phase's sheet-attachment live gate after the change is the minimum bar.

Do **not** attempt to prove the fix with a timing test. The useful assertion is structural — that no
raw `NSWindow` address crosses the dispatch boundary on this path — plus the existing
`attachedSheet`/`isSheet` read-back (CR-02's fix) continuing to report `attached=true` on hardware.

## Desk fix landed 2026-09-30 (quick task 260930-q11) — STILL OPEN, live gate pending

**This todo stays in `pending/` and keeps `ready: live-gate` / `severity: major`. Closure to
`completed/` is gated on the operator's live gate and HAS NOT HAPPENED.** Nothing below is a
hardware result; no live run was performed by the executor. Every number is a desk measurement.

### What changed in both paths

WR-02's option 1, applied to `present_login_window_as_sheet` *and* `dismiss_login_window_sheet`
(commit `bb567faf3`, `src-tauri/src/main.rs`):

- New `login_window_ns_window_retained(app, label) -> Option<Retained<NSWindow>>`: a main-thread-only
  wrapper that delegates to the single existing `login_window_ns_window` resolver (so the file keeps
  ONE resolver, not a second competing one) and immediately retains via `Retained::retain` —
  `objc_retain`, null-safe by contract, deliberately not `retain_autoreleased`. This is now the only
  `unsafe` block on either login-sheet path.
- **Present:** both resolutions moved to the top of the **deferred GCD closure** — the innermost one,
  the one that calls `beginSheet:` — not the outer `run_on_main_thread` closure, which still runs
  250ms too early. A window that no longer resolves there WARNs and then **sends `false` down the
  existing channel**; a bare `return` would have left the worker blocked on `rx.recv_timeout` for the
  full 10s before `humble_login_open`'s `attached == false` visible-fallback arm could run.
- **Dismiss:** same restructure inside its `run_on_main_thread` closure. Every arm now signals on
  `tx`, including the two that never touch AppKit, so the channel answers "did the hop run" rather
  than "did `endSheet:` run" — which is what keeps WR-01's re-registration scoped to a hop that
  genuinely did not run, and keeps the healthy "window already gone" path from re-registering (a
  silent early `return` would drop the sender, `recv_timeout` would report `Disconnected`, and the
  label would be stranded in the registry for the process lifetime).
- Deleted: both `SendPtr` shims with their `unsafe impl Send`, both Rust-2021 disjoint-capture
  rebinding pairs and the comments explaining them, and all four raw-address-to-`&NSWindow`
  reconstructions with their "resolved moments ago" SAFETY comments.
- `SHEET_PRESENT_WKWEBVIEW_WARMUP_DELAY` is **unchanged** in value (250ms) and still unconditional,
  still armed via `dispatch2::DispatchQueue::main().after()`. This makes the deferral safe; it does
  not revert it.
- `LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT`'s doc comment was rewritten: its former justification (the
  two `.ns_window()` calls running before the inner bound, on `getter!`'s unbounded `rx.recv()`) is
  now false on **both** halves. Verdict recorded in the comment: the constant is **KEPT** — the inner
  10s bound still does not cover the entry `eprintln!`, `run_on_main_thread`'s own cross-thread send
  into tao's event proxy, or `register_presented_login_sheet`'s mutex after the bound returns; and
  `PENDING_VISIBLE_LOGIN_WINDOW_TTL` is derived from it with a Rust test asserting TTL > watchdog, so
  deleting it would be a change to `humble_login_open` and that test, not a comment edit.

### Finding A — the handle is AUTORELEASED, so the hazard was UNCONDITIONAL

`~/.cargo/registry/src/index.crates.io-*/tauri-2.11.5/src/window/mod.rs:1642`, read directly:

```rust
Ok(objc2::rc::Retained::autorelease_ptr(ns_window).cast())
```

The address `ns_window()` hands back is **autoreleased**. Its guaranteed validity is bounded by the
autorelease pool of the thread that *resolved* it — not by the login window's lifetime. Carrying it
across a GCD deferral into a later run-loop turn was therefore outside the API's contract
**independent of whether the user closes the window**. This is the strongest justification for the
change, and **it appears in neither this todo's original text nor in WR-02**: both framed the defect
as a race against a window close, which understates it. It also means the "dismiss is narrower"
framing above was not the whole picture.

### Finding B — the AppKit accessor and the autorelease both ran on the WORKER thread

Same file, `ns_window()`'s body: `window_handle()` is the dispatcher getter that crosses to the main
thread, but the `.and_then` closure that follows runs on the **caller's** thread. So at HEAD both
`view.window()` — a plain AppKit accessor — and the autorelease registration executed on a worker
thread, onto a pool that is not the main thread's. Moving resolution into the main-thread closure
fixes this too. Also absent from this todo and from WR-02; a second, independent gain.

### The structural gate added

A new `describe` block in `src/backend/__tests__/tauriShellSource.test.ts` (11 tests), scoped to the
two function **bodies** rather than file-wide — deliberately, because a Send-pointer shim
legitimately survives in `open_pristine_epic_login_window` and an
`as *const objc2_app_kit::NSWindow` cast legitimately survives in the Esc local monitor running the
*opposite* direction (reference → `usize`, never dereferenced). A file-wide negative would
false-fire on both. It carries: two body-scoped negatives; a positive that the retaining resolver is
still called (so deleting the resolution cannot satisfy the gate); a brace-matched nesting assertion
that the present path's two resolutions sit *inside* the deferred closure; assertions that the
present arms send `false` and that all three dismiss arms send; a two-arm non-vacuity test; and
three `SELF-TEST (RED direction)` tests proving the negatives **reject** the pre-fix shape via
injected source (`loadMainRsCode(source)`) rather than any working-tree mutation.

### Desk gates, measured (baselines re-measured at `9f7cd017a` before editing)

| gate | before | after |
|---|---|---|
| `cargo check --bin gamelib-shell` | exit 0, clean | exit 0, clean |
| `cargo test --bin gamelib-shell` | 297 passed, 0 failed, 2 ignored | 297 passed, 0 failed, 2 ignored |
| clippy warnings in `main.rs` (count) | 15 | 15 |
| `cargo fmt --check` hunks (count) | 76 | 76 |
| `tauriShellSource` jest (1 suite) | 228 passed | 239 passed |
| `SELF-TEST (RED direction).*q11` tests | 0 | 2 |
| `unsafe impl Send for SendPtr` in `main.rs` | 3 | 1 |

`cargo fmt --check` is red at HEAD on 76 pre-existing hunks, all in `main.rs`, none inside either
target body — so the count is scored, never the exit code, and `cargo fmt` was never run.

### What only hardware can tell us

Whether AppKit still actually attaches the sheet. The gates above prove the shape is right and that
it compiles; they cannot prove `beginSheet:` still works. Re-run the phase's sheet-attachment live
gate per
`.planning/phases/34.4.2-macos-login-window-ux-modal-child-window-attachment-in-field/34.4.2-LIVE-GATE-RERUN-6.md`
(its PASS 5/5 is the reference contract). The pass literal is
`[shell] login-window sheet: read-back attached=true for '{label}'`.

### RERUN-7 authored 2026-09-30 (quick task 260930-r22) — this todo's live gate is now contracted there

The live gate for this todo is contracted at
`.planning/phases/34.4.2-macos-login-window-ux-modal-child-window-attachment-in-field/34.4.2-LIVE-GATE-RERUN-7.md`,
authored 2026-09-30 by quick task 260930-r22. RERUN-6 stays the reference contract — its PASS 5/5
from 2026-08-19 is byte-unchanged. RERUN-7 exists because every one of RERUN-6's machine-evidence
citations had drifted 1,700–3,600 lines in `main.rs` since planning, and because it adds the
q11-specific assertion (D-G7): the `attached=true` read-back must be preceded, for the same window
label, by the main-thread resolution line the q11 fix introduced inside the deferred closure.
**Nothing in RERUN-7 is a hardware result and no live run has been performed** — the contract's
result keys are unset, and this todo stays `ready: live-gate` in `pending/` until an operator runs
it.

For the operator: RERUN-7's operator-cost disclosure (top of the document) names item 6(a) as
destructive of a live Humble session and item 4 as requiring real credentials, and its minimum-bar
table marks item 1 as the strict requirement for closing this todo specifically.

## CLOSED 2026-09-30 — live gate PASSED (RERUN-7 item 1)

The desk fix landed in quick task `260930-q11` (`bb567faf3`, structural gate `3488a8c0b`) and the
live gate this todo's own `ready: live-gate` demanded was run the same day and **PASSED**.

Scored against `34.4.2-LIVE-GATE-RERUN-7.md` **item 1** — the one row that contract's minimum-bar
table marks **STRICTLY REQUIRED** for this todo's closure — not against an improvised bar. That
distinction was nearly lost: the orchestrating session first ran a weaker ad-hoc check of its own
devising (presentation + `attached=true` + both dismissal routes) and was about to close this todo
on it, before finding RERUN-7 and discovering that item 1 additionally requires the
**minimize/restore cycle** — the exact failure mode that sank the predecessor child-window
mechanism (F-34.4.2-01/-02), and the half the ad-hoc check had no coverage of at all.

**Human half.** All five of item 1's sub-checks (a)-(e) observed as specified on a single reused
login form (preparatory-sequence branch (b) — the form rendered on first open, no auto-login).
Operator's verdict, verbatim: *"all pass"*.

**Machine half**, from the LAUNCH-1 `tee -a` transcript segment: the D-G7 pairing holds — the
`read-back attached=true` line is preceded, for the same window label, by the
`both NSWindow handles resolved on the main thread` line the fix introduced inside the deferred
closure; `attached=false` 0; `sheet_presented=true` present; both forbidden lines
(`parent deminiaturized, re-raising …`, and the q11-deleted `both NSWindow addresses resolved`)
0 and 0.

**Corroborating, and recorded as intermittency evidence only** — this earlier unscored pass did NOT
perform sub-checks (a)-(e) and is not item-1 evidence: 4 presentations, `attached=true` 4/4,
D-G7 pairing 4/4, `deferred_elapsed` 255.5-261.1 ms every time (so the deferral never collapsed
inline), Esc and cancel-strip dismissals once each, and 0 occurrences of `dispatch failed`,
`unconfirmed within 10s`, `re-registered as still presented`, or any panic/`EXC_BAD_ACCESS`. That
matters against this area's history, whose failures ran 5/6 and 1/6 rather than 0/6.

**What this does NOT close.** REQ-34.4.2-09 is untouched: RERUN-7's items 2, 3(a), 4 and 6(a) were
not run, its contract `verdict` is deliberately still unset, and no requirement box moved. Items 4
and 6(a) carry costs (live credentials; destruction of a live Humble session) that this todo never
required anyone to pay.
