---
created: 2026-09-26
title: 'Login window on_page_load handler overwrites the composed origin — document title with an origin-only reset'
found_during: Phase 38 Windows sitting 4 (quick 260926-8j9 close-out)
severity: minor
platform: any
ready: code
area: login-window
files:
  - src-tauri/src/main.rs
  - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md
---

## Mechanism

Filed after the 2026-09-26 Phase 38 Windows sitting (quick `260926-8j9`), which discharged
`38-W03` as FAIL, accepted by operator decision. The `on_page_load` closure at
`src-tauri/src/main.rs:6491` calls `window.set_title(&login_window_title(&new_origin, None))` —
origin only. That call sits OUTSIDE the closure's `match payload.event()` (which only builds a
diagnostic `kind` string for `push_login_window_event`) and INSIDE `if visible {`, so it runs on
BOTH `PageLoadEvent::Started` AND `PageLoadEvent::Finished`. The `Finished` call overwrites the
composed `origin — document title` set at `:6357-6358` by `on_document_title_changed`, and nothing
restores it. Net effect on Windows: the title bar shows the bare origin forever, never the
document title.

**Proposed fix**, stated precisely because the obvious version is wrong: guard ONLY the
`set_title` call on `PageLoadEvent::Started`, keeping the `page_load_origin` main-frame origin
refresh (the `if let Ok(mut guard) = page_load_origin.lock()` write at :6488-6490) running on BOTH
events. A GUARD ON ONE LINE, NOT ON THE BLOCK. Guarding the whole `if visible` block would stop
the trusted main-frame origin tracking on `Finished`, which the macOS origin banner and the title
composer both read.

**The operator already weighed this and chose to accept it** on 2026-09-26, during the Phase 38
Windows sitting, rather than fix it: the origin is the trustworthy, shell-resolved half and it is
the half that survives; the lost document title costs usability, not security. This was DECIDED,
not MISSED — see `38-W03`'s discharged entry in `38-VERIFICATION.md` (`human_verification_discharged`)
for the full record, including the operator-decision framing and the root-cause analysis.

**Why it went unseen for so long**: silent on Windows, because the closure's only `eprintln!` is
inside a `#[cfg(target_os = "macos")]` block (the origin-banner update at :6503-6506) and
`push_login_window_event` (`:2145-2155`) only queues a value in memory and prints nothing. And
structurally invisible on macOS, where the login window is an AppKit sheet with no title bar at
all (`main.rs:1551`).

**The tension to resolve if this is ever fixed**: `main.rs:6282-6288` states that the document
title arriving and replacing the provisional title "is WR-07's actual requirement", so the current
behaviour deviates from that comment's own stated requirement. Note that the comment's word
"replaces" is itself imprecise — `login_window_title` (`main.rs:2069`) APPENDS the document title
after the origin, deliberately, per T-34.5-G6-23 — so a fix should correct the comment too.

`severity: minor` — the deviation was deliberately accepted by the operator; the origin (the
security-load-bearing half) is unaffected; only the cosmetic document-title half is lost.

## Verification (once fixed)

Open any store login window (Manage Accounts -> Humble/GOG/Epic/Amazon) on Windows or Linux and
watch the title bar from the instant it appears. It should show the origin immediately, then
become `<origin> — <document title>` (e.g. `https://www.humblebundle.com — Humble Bundle - Log In`)
once the document title arrives, and STAY that way through `PageLoadEvent::Finished` rather than
reverting to the bare origin.
