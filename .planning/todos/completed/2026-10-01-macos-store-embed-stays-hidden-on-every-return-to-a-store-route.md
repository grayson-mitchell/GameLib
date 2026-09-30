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

## Fixed 2026-10-01 (quick task 261001-svm)

**It took two commits, because it was two defects wearing one symptom.** The first fix closed one
return path and left the other broken, and only a live re-run found that out.

1. `d890fe689` — **visibility.** `existing.show()` in `store_embed_open`'s existing-webview branch
   was lifted out of its `#[cfg(target_os = "linux")]` sub-block so it runs before `navigate()` on
   every platform. This is the mechanism named in the section above.
2. `a9bc3f8f0` — **geometry.** A zero-area rect is now ignored on macOS as it already was on Linux
   (`260930-blh` fix 2), keeping the last real geometry and logging that it did. Non-finite input
   folds into the same answer, since Linux rejects it during `i32` conversion and macOS has no
   conversion step to reject it in.

The second was found by running the live gate on the first: `/store/gog` -> `/store/epic` ->
`/store/gog` was still black, but `storeEmbedShow()` no longer restored it while a bounds flush
alone did — a show call failing where a bounds flush succeeds is what separates the two causes.
The Epic panel replaces the slot while the hook stays mounted, so the slot's ResizeObserver reports
a final 0x0 rect that macOS applied verbatim; nothing re-applies a real rect afterwards, so the
embed sat at 0x0 until a genuine window resize. Once in that state even a `/library` round trip
stayed blank.

**This file's own "hidden, not mis-positioned" verdict was right for the path it measured and wrong
as a generalisation.** On the `/library` path the embed is merely hidden and `show()` alone repairs
it, exactly as recorded. The Epic round trip also degrades the geometry, and that was not measured
when this todo was written.

Live verification (both return paths green, Epic panel still clean, no manual API calls in the
scored sequence) is recorded in
`.planning/quick/261001-svm-close-epic-panel-gate-file-macos-embed/261001-svm-LIVE.md`. Measured on
the dev/debug build on this Mac only; the packaged build and Linux were not re-run. Rust gates at
the closing commit: `cargo check` 0, `cargo clippy` 0 with the pinned 15-warning ceiling held,
`cargo test --bin gamelib-shell` 305 passed / 0 failed / 2 ignored.
