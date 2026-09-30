---
created: 2026-09-27
title: 'Live-verify the login window title bar shows <origin> — <document title> and survives PageLoadEvent::Finished (Windows/Linux only, unverifiable on this Mac)'
found_during: quick 260927-o3h (fixed the on_page_load Started-only guard; the runtime half is deferred)
severity: minor
platform: windows
ready: live-gate
area: login-window
files:
  - src-tauri/src/main.rs
---

## Mechanism

Quick task 260927-o3h guarded the `humble_login_open` `on_page_load` closure's `set_title`
refresh to `PageLoadEvent::Started` only (D-01, D-02), so the composed
`origin — document title` set by `on_document_title_changed` should now survive `Finished`
instead of being overwritten with the bare origin. That source-shape change is pinned by a
regression test (`src/backend/__tests__/tauriShellSource.test.ts`), and its RED direction was
observed before acceptance.

**What is NOT verified: the actual runtime behaviour.** No verify step anywhere in
260927-o3h's plan claims the title bar was watched. The macOS login window is presented as an
AppKit sheet, which structurally renders no title bar UI at all (`main.rs:2710-2718`,
F-34.5-G6-16), so there is no surface on this machine to observe pass or fail. This is the same
live gate `38-W03` failed and accepted as a deviation during the Phase 38 Windows sitting
(quick `260926-8j9`) — that acceptance is superseded by the 260927-o3h fix, and this todo is
the next sitting's confirmation of it.

## Verification (once run)

Open any store login window (Manage Accounts -> Humble / GOG / Epic / Amazon) on Windows or
Linux and watch the title bar from the instant it appears. It must show the origin
immediately, then become `<origin> — <document title>` (e.g.
`https://www.humblebundle.com — Humble Bundle - Log In`) once the document title arrives, and
must NOT revert to the bare origin through `PageLoadEvent::Finished`.

`severity: minor` — the source-side fix is landed and pinned by a regression test; this todo
tracks only the runtime confirmation on hardware this operator does not have at their desk
right now.
