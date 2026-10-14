---
created: 2026-10-14T00:00:00.000Z
title: "The store-embed notice row's actions clip below ~900px, and the app declares no minimum window width to protect them"
area: webview/store-embed
severity: minor
platform: any
ready: code
found_by: "Live gate of UAT Item 16, 2026-10-14 (Launch 5). Found while verifying the G-50-16 banner fix; unrelated to that fix and deliberately not scored against it."
files:
  - src/frontend/screens/WebView/components/StoreEmbedTimeoutBanner.tsx
  - src/frontend/screens/WebView/index.css
  - src-tauri/tauri.conf.json
  - .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UI-SPEC.md
---

## What was measured

With `StoreEmbedTimeoutBanner` showing on real hardware, the window was resized and the banner
photographed at each width (`live-gate-261014-item16/`):

| window width | result |
| --- | --- |
| 1280px (the configured default) | message + `Reload` + `Open in browser` on one row, nothing clipped |
| 900px | same — all three fully visible (`item16-width900.png`) |
| 600px | **`Open in browser` is cut off by the window edge** (`item16-width600.png`) |

The message does **not** ellipsise to protect the actions; the actions clip instead. UI-SPEC E3's
overflow criterion requires the opposite, in these words:

> At app's minimum window width a single 40px banner row shows message plus both actions (Reload,
> Open in browser) on one row; message may ellipsise, actions may not clip.

## The second half, which is the more interesting one

**The app declares no minimum window width at all.** `src-tauri/tauri.conf.json` sets
`"width": 1280` / `"height": 800` but no `minWidth`/`minHeight`, and an AppleScript resize to
`{200, 800}` was accepted with **no clamp** — the window really did become 200px wide.

So UI-SPEC E3's criterion, which is written against "the app's minimum window width", has **no
defined test point**. It cannot be passed or failed as written, and a user can freely drag the
window to a width that clips a primary action.

Two things to decide, and they are separable:

1. **Set a minimum window width** (`minWidth` in `tauri.conf.json`, or `min_inner_size` in Rust).
   This is the fix that makes E3 testable at all, and it protects every other responsive surface
   in the app, not just this banner. The sidebar alone is ~255pt, so anything below roughly
   600-700px is already unusable.
2. **Make the notice row degrade correctly** regardless — the message should ellipsise (it has
   `min-width: 0` available to it at `index.css:87`/`:152`) before either action is allowed to
   shrink or clip.

Doing only (1) hides the bug at the default size without fixing the row; doing only (2) leaves the
app resizable to 200px. (1) is the cheaper and more generally useful of the two.

## Scope note

This is **not** a G-50-16 regression and must not be filed as one. G-50-16 was the banner never
becoming visible; that is fixed and was verified on hardware in the same run that found this. This
defect is about how the row lays out once it IS visible, and the same row component is shared with
the blocked-launcher notice (`EpicLauncherBlockedNotice`), so a fix should be checked against both.

`WebView/index.css`'s `.WebView__embedNoticeRow` is the element to change; the two actions live in
`.WebView__embedNoticeRow-actions`.
