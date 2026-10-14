---
created: 2026-10-14T00:00:00.000Z
title: "The Epic embed subview did not repaint after a confirmed Reload click once the network block was lifted"
area: webview/store-embed
severity: major
platform: macos
ready: code
found_by: "Live gate of UAT Item 16, 2026-10-14 (Launch 5). Originally misattributed to a suppression refcount leak; that cause is refuted (.planning/debug/resolved/embed-suppression-sticks.md) and this is the correctly-scoped residual."
files:
  - src-tauri/src/macos_epic_embed.rs
  - src/frontend/screens/WebView/useStoreEmbedHost.ts
  - .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UAT.md
---

## What was measured

UAT Item 16's recovery half. With a scoped `/etc/hosts` blackhole of `www.epicgames.com` and
`store.epicgames.com` in place, Epic's load timed out and the banner appeared. The operator then
reverted the hosts entry — verified: both hosts resolving to real Cloudflare addresses again, zero
Epic lines in `/etc/hosts` — and the banner's `Reload` was clicked.

**The click landed.** System Events resolved the click point to `button Reload of group 1 of group 3
of UI element 1 of scroll area 1 ...`, and the button took a visible focus ring.

**The store did not repaint**, across roughly 100s of observation (one 10s check, then six 15s
polls). `terminal.log` recorded no new navigation lines at all after the click — no
`didFailProvisionalNavigation`, and no silent success either.

## What this is NOT

It is **not** the suppression refcount. That was the original hypothesis and it is dead: the
placeholder visible in the slot is this route's static default
(`StoreEmbedSlotContents.tsx:52`'s `suppressed || isEpicSurface`, with `isEpicSurface` statically
true on macOS `/store/epic`), not a suppression indicator. All six suppression consumers were
mechanistically eliminated and the context code was read in full and found sound. See
`.planning/debug/resolved/embed-suppression-sticks.md`.

It is also **not** G-50-16. That gap was the timeout banner never becoming visible; it is fixed and
was verified on hardware in this same launch.

## Where to look

The native reload/show path in `src-tauri/src/macos_epic_embed.rs`. Open questions, none answered:

- Does the banner's `onReload` actually reach `epic_embed_reload`, and does that call
  `webview.reload()` on a subview that is in a reloadable state after a failed provisional
  navigation? A WKWebView whose provisional navigation failed may have no current URL to reload —
  `reload()` on such a view can be a no-op, in which case the fix is to re-issue `loadRequest` with
  the intended URL rather than `reload()`.
- Is the subview still `visible`/attached at that point, or did a prior failure path hide it
  without a corresponding show? Note `did_finish_navigation` is silent (no `eprintln`), so a
  successful reload would leave no log evidence either — **absence of log lines after the click does
  not distinguish "nothing happened" from "it worked silently"**, and the instrument needs fixing
  before the behaviour can be judged.
- DNS/connection caching is a confound worth ruling out explicitly: the process may have cached the
  blackholed address for the lifetime of the session, so a reload could legitimately keep failing
  even after `/etc/hosts` is reverted. If so this is a test-method artifact, not a product defect —
  **establish that before blaming the code.** Re-running the arm with a fresh process after the
  revert would separate the two cheaply.

## Suggested instrument

Before another live launch, add an `eprintln` on the success path (`did_finish_navigation`) so a
silent success is distinguishable from a no-op. The whole reason this arm is unresolved is that the
current logging only speaks on failure.
