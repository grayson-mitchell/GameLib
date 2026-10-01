---
created: 2026-10-01
title: "macOS: the store embed stays hidden (black slot) on every return to a store route"
severity: major
platform: macos
ready: code
area: store-embed
files:
  - src-tauri/src/main.rs
  - src/frontend/screens/WebView/useStoreEmbedHost.ts
---

## The symptom

On macOS the store embed stays hidden after any return to a store route; the slot renders black
indefinitely. The FIRST entry to a store route after app launch is fine — the create path shows the
webview — and it is every later entry that is blank. Measured on live hardware 2026-10-01:

| path measured | result |
| --- | --- |
| `/library` -> `/store/gog` (a *second* visit, after the route had been left) | black slot, still black at +12 s |
| `/store/gog` -> `/store/epic` -> `/store/gog` | black slot, still black at +5 s |
| then `window.api.storeEmbedShow()` alone, nothing else | GOG repaints immediately (872 KB frame) |

## Why it is hidden and not mis-positioned, as a measurement

Because `show()` **alone** — with no bounds flush — restores it, the embed is hidden rather than
mis-positioned, and bounds are fine on macOS. The Linux sibling symptom (the embed drawn at the
window origin, over the app chrome) did not reproduce here: the chrome and sidebar render
normally in every capture. `storeEmbedShow()` returned an ok status, so the native webview still
exists and its label resolved — this is not the `no-webview` error path.

## The mechanism, read from source rather than guessed

`store_embed_open`'s existing-webview branch calls `navigate` on macOS and nothing else. The step
directly above it — show, then re-apply the rect the call carries — is guarded by a
`target_os = "linux"` cfg attribute, added by quick `260930-blh` on 2026-09-30 for exactly this
symptom on Linux, with its in-situ comment calling the macOS behaviour unaltered. Meanwhile the
renderer hides the embed on route leave (the route-lifecycle cleanup in `useStoreEmbedHost.ts`,
D-21) and on remount has `openedRef` false, so its first `flush()` goes through `storeEmbedOpen` —
which on macOS navigates and never shows. Nothing else ever calls `storeEmbedShow` on that path.

This is quick `260930-blh`'s own SUMMARY, "Open observations", item 5 — quoted verbatim: "The macOS
path has the same shape as the two defects fixed here (existing-embed open only navigates; a zero
rect is applied verbatim on unmount). That is unmeasured on macOS, and could be a real macOS
defect." It is no longer unmeasured. `260930-blh` is the predecessor task and its Linux fix (show,
then re-apply the rect, then navigate) is the model for this one.

## Honest caveats

- Measured on the **dev/debug** build only. The branch concerned is plain Rust shared with the
  release build, but a packaged build was not re-measured.
- The measuring session included one renderer reload (`location.reload()`) before these
  reproductions. Both reproductions above were from clean navigation states after it, and the
  mechanism above does not depend on a reload.

## Back-pointer

Found while running the live gate for
`.planning/todos/completed/2026-09-29-store-embed-may-stay-visible-over-the-epic-panel.md`. The two
are opposite symptoms: that todo hypothesized the embed being too VISIBLE after a GOG -> Epic
switch (refuted); this one is the embed being too HIDDEN after any later return to a store route.
