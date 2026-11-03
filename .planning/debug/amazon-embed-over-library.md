---
status: awaiting_human_verify
trigger: "Amazon store embed stays drawn over the Library game page after leaving Stores — todo .planning/todos/pending/2026-11-04-amazon-store-embed-stays-drawn-over-library-game-page.md"
created: 2026-11-04
updated: 2026-11-04
todo: .planning/todos/pending/2026-11-04-amazon-store-embed-stays-drawn-over-library-game-page.md
---

## Symptoms

- expected: Leaving the Stores tab always hides the store embed. The Library game page shows no embed, including after a Play and after an app relaunch.
- actual: The Amazon store embed (Luna "Claim Games", https://gaming.amazon.com) stayed drawn over the Library game page after leaving Stores (macOS, 2026-11-03 ~12:28, phase 59 re-UAT 3, G24 in 59-UAT.md). It survived a Play and an app relaunch.
- errors: More than 100 `[WebView] store/wiki route pathname=/store/amazon startUrl=https://gaming.amazon.com` lines within one second (12:28:08), then `[amazonStoreExitRefresh] origin=amazon-store-exit outcome=skipped-in-flight`. Suggests a route re-render loop on /store/amazon, and that the hide/suppression step on leaving the route either never ran or ran and was then overridden.
- timeline: First seen 2026-11-03. Not phase 59 code. The same symptom was fixed earlier for other stores; see .planning/todos/completed/2026-09-29-store-embed-may-stay-visible-over-the-epic-panel.md, 2026-10-14-store-embed-suppression-sticks-with-no-visible-holder.md and 2026-10-01-macos-store-embed-stays-hidden-on-every-return-to-a-store-route.md.
- reproduction: Open Stores > Amazon, wait for the Luna page, switch to Library, open a game page.
- suspect files: src/frontend/screens/WebView/useStoreEmbedHost.ts, src/frontend/screens/WebView/index.tsx, src/frontend/screens/WebView/storeExitRefresh.ts

## Current Focus

- hypothesis: The Amazon route (or its exit refresh in-flight path) bypasses the embed hide path the earlier fixes added, or a /store/amazon re-render loop re-shows the embed after the hide.
- next_action: gather initial evidence: read the three suspect files and the three completed todos, then trace what re-fires the /store/amazon route and whether the skipped-in-flight arm skips the hide.

## Evidence

- checked: Rust dispatch (src-tauri/src/main.rs ~12868) and hide/show/open
  found: each rustInvoke runs on a freshly spawned thread, so store_embed_open and a later store_embed_hide are not ordered. A hide before a first open finishes fails with store_embed_hide:no-webview (renderer only logs it); on a warm open the open's show() can run after the hide.
  implication: a route-leave hide can be lost, leaving the embed drawn over the next page. The renderer never re-hid after the open resolved.
- checked: nothing in Rust or the renderer shows the embed except open/show (suppression release, onTryAgain, refused-target return)
  found: the lost hide is the only unguarded path; the 100+ route lines and skipped-in-flight are refresh-driven re-renders (log is in render) and do not touch the hide.
  implication: the exit-refresh arm is not the cause. Not reproduced live; logs rotated away.

## Eliminated

## Resolution

root_cause: Rust runs each store_embed channel on its own worker thread, so the route-leave storeEmbedHide is unordered against an in-flight storeEmbedOpen. If the hide wins (or fails with no-webview on a first open), the open completes afterwards and leaves the embed visible; nothing re-hides. Inferred from code, not reproduced live.
fix: useStoreEmbedHost open follow-up re-issues storeEmbedHide when the open resolves ok after the hook unmounted and no newer hook instance owns the embed (module-level activeEmbedOwner token).
verification: unit tests 46/46b/46c added; WebView jest suite 573 pass. Live gate pending (macOS, frameless titlebar OFF and ON).
files_changed:
  - src/frontend/screens/WebView/useStoreEmbedHost.ts
  - src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx
