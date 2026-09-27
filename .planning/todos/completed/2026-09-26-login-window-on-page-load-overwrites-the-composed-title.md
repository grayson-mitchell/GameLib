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

## Resolution (2026-09-27, quick 260927-o3h)

**What shipped:** the `set_title` call in `humble_login_open`'s `on_page_load` closure is now
guarded `Started`-only via an `is_started` bool destructured from the closure's existing single
`match payload.event()` (D-01, D-03). The `page_load_origin` main-frame origin write and the
macOS origin banner (`login_origin_banner_update_script` eval + its `eprintln!`) still run on
both `Started` and `Finished` — the guard is on the one `set_title` line, never on the
enclosing `if visible {` block (D-02).

**The operator's 2026-09-26 acceptance is superseded.** `38-W03`'s discharged
`human_verification_discharged` entry in `38-VERIFICATION.md` is deliberately NOT rewritten —
it is an accurate record of a decision taken at that time, before this fix existed. This todo's
close-out supersedes that acceptance going forward; it does not erase the history of it.

**Two comment corrections landed alongside the guard (D-04, D-05).** The
`This is deliberately the WEAKER of the two guarantees` comment (`main.rs`, immediately above
`builder = builder.title(login_window_title(&origin, None));`) no longer says the document
title "replaces" the origin — `login_window_title` (`main.rs:2083`) APPENDS the document title
AFTER the origin, deliberately, per T-34.5-G6-23, and the comment now says so; it also records
that the composed title now survives `PageLoadEvent::Finished` because of this quick task's
guard. A second, new in-situ comment sits immediately above the `if is_started { ... }` line
itself, naming `page_load_origin` and `login_origin_banner_update_script` explicitly and
explaining why the guard is line-scoped rather than block-scoped.

**A new regression test pins the guard**
(`src/backend/__tests__/tauriShellSource.test.ts`, inside the
`F-34.5-G6-04 (Plan 27) login window origin title driven from on_page_load, never on_navigation`
describe block): it asserts `set_title(` sits INSIDE the `is_started` guard and that
`page_load_origin.lock()` / `login_origin_banner_update_script` both sit OUTSIDE it, with
anti-vacuity controls proving those two statements still exist in the closure at all. Its RED
direction was observed directly — the guard was temporarily unwrapped, the test failed on the
missing guard header (`guardHeaderIdx` was `-1`), then the guard was restored and the suite went
green again. What turns it red once landed: the guard being deleted, the guard being widened to
the whole `if visible {` block, `set_title` being moved out of the guard, or the origin write /
banner being deleted to satisfy the negative assertions. **What it does NOT cover, honestly: it
is a source-shape gate, not a behavioural one — it cannot observe a title bar.**

**Stale citations found while fixing this, so nobody re-chases them.** This todo's own
`main.rs:1551` citation for "the login window is a titleless AppKit sheet on macOS" now points
at an unrelated clipboard-helper doc comment; the live statement of that fact is the comment
block at `main.rs:2710-2718` (F-34.5-G6-16), with a second at `:2847`. Every other line number
in this todo's Mechanism section above (`:6491`, `:6357-6358`, `:6488-6490`, `:6503-6506`,
`:2145-2155`, `:2069`, `:6282-6288`) predates later edits and is off by roughly 110-120 lines at
HEAD `0c3a8b3ac` — re-locate by the anchor text quoted in each, not by the line number.

**The live half, recorded honestly as NOT done.** The behavioural claim — that the title bar
reads `<origin> — <document title>` and STAYS that way through `PageLoadEvent::Finished` — is
not verifiable on this Mac at all, and no verify step in the fixing plan claims otherwise. On
macOS the login window is presented as an AppKit sheet, which structurally renders no title bar
UI at all (`main.rs:2710-2718`), so there is no surface on which to observe pass or fail. The
check is Windows/Linux-only and is deferred to the next Windows sitting, which re-runs it as the
confirmation of this fix — filed as a standing item at
`.planning/todos/pending/2026-09-27-login-window-title-bar-composed-title-survives-finished-needs-a-windows-linux-sitting.md`
since no existing pending todo already covered it.
