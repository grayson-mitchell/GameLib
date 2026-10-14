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

## Resolution

Closed by quick task `261015-9qy`.

**Half (1), the minimum window width: done.** `src-tauri/tauri.conf.json`'s `main`-labelled
window entry now declares `"minWidth": 900` and `"minHeight": 600` — the only place a minimum is
declared; no competing Rust `min_inner_size`/`set_min_size` call or runtime setter exists. 900 is
**measured** — it is the width at which this todo's live gate photographed the message plus both
actions fully visible (`item16-width900.png`), where the 600px arm clipped `Open in browser`. 600
for height is a **judgment call** with no hardware measurement behind it: it sits below the
configured 800 default, keeps the window placeable on a 1366x768 panel after the menu bar and
Dock, and stays under the pristine Epic login window's `inner_size(900.0, 700.0)`. Pinned by a new
describe block in `src/backend/__tests__/tauriWindowConfig.test.ts`, with a SANITY arm that fails
against the exact pre-fix no-min fixture.

**Half (2), the notice row degrading correctly: required no CSS.** The row's full contract was
already in `src/frontend/screens/WebView/index.css` before this todo was filed — `git log -S
"text-overflow: ellipsis" -- src/frontend/screens/WebView/index.css` returns exactly one commit,
`348e28057` (`feat(50-03)`), which predates the 2026-10-14 live gate that photographed the clip.
The message rule already carries a zero inline minimum, hidden overflow, nowrap and
`text-overflow: ellipsis`; the actions rule already carries a no-shrink declaration. This is now
pinned PER SELECTOR (not just present-somewhere-in-the-block) by a new test in
`StoreEmbedTimeoutBanner.test.tsx`, with a string-copy sabotage arm that removes the ellipsis
declaration from an in-memory copy and proves the pin throws.

`EpicLauncherBlockedNotice` renders only the icon and the message — it has no `-actions` element —
so the no-clip clause is `StoreEmbedTimeoutBanner`-only. Confirmed by reading the component; it is
unchanged by this task.

The 600px clip photographed on hardware was **not reproduced at desk** and is not root-caused:
jsdom performs no layout, so nothing in this quick task observes a rendered ellipsis or a rendered
clip. It is now **unreachable at any permitted window size**, since Task 1's floor is the
measured-clean 900px, rather than explained. The clamp itself (AppKit actually refusing a resize
below 900px) is also unverified on hardware by this task; file a `ready: live-gate` todo if no
live gate runs this session.

UI-SPEC E3's overflow row (`50-UI-SPEC.md:152`) now names the concrete width and the file that
declares it, closing the "no defined test point" half of this todo.

**Open observation, not acted on here:** `src/frontend/App.css:26` sizes the shell's columns as
`min-content 1fr`; a `1fr` track's automatic minimum is its content's min-content width;
`.App .content` carries a zero block minimum but no inline one; and the navbar's grid area spans
both columns, so its own min-content width participates in the column sum. Any of those could hold
the shell wider than a narrow viewport while the shell's hidden overflow clips the excess — which
fits "cut off by the window edge" at least as well as anything inside the notice row does. This is
an **unmeasured hypothesis**, not a diagnosis: the blast radius is every route in the app and jest
observes no layout, so it could not be proven or regression-tested at desk in this quick task.
