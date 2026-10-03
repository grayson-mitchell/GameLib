---
created: 2026-10-03T05:35:00.000Z
title: Login sheet's injected title bar shows a light wedge in the scrollbar gutter at the rounded top-right corner
area: ui
severity: minor
platform: macos
ready: live-gate
found_by: "Operator live observation during fast task 261003-sbr (reported as a little white triangle in the upper-right corner when the scrollbar is visible), 2026-10-03"
files:
  - src-tauri/src/main.rs:3155-3245
  - src-tauri/src/main.rs:3040-3140
  - src-tauri/src/main.rs:2919-3000
  - .planning/quick/261003-nsk-humble-login-title-bar/261003-nsk-CONTEXT.md
---

## Problem

The Humble login sheet's in-page title bar (`login_origin_banner_script` +
`login_cancel_strip_script`, with `login_scrollbar_inset_script` holding the scrollbar below it)
leaves a small light wedge in the **scrollbar gutter at the window's rounded top-right corner**,
visible only while a classic scrollbar is showing.

Cosmetic only. Everything the bar is for works: centred origin, `×` flush right with its
accessible name intact, and the scrollbar starting below the bar.

## Measured, 2026-10-03

Pixel-sampled from the live sheet (`screencapture -R` plus an `NSBitmapImageRep` dump), not
eyeballed:

- The wedge is `#e3e3e3`, filling the 14px gutter from **y≈4 to y≈18**, bounded on the right by
  the window's corner arc and cut off by a **sharp horizontal edge** where the dark gutter
  (`#161c1e`) begins.
- The bar itself is correct — dark through to y=31, i.e. exactly its declared 32px height.
- The **bottom**-right corner has no equivalent artifact: the gutter is dark right down to the arc.

Reproduced faithfully in an offscreen `WKWebView` probe **only** once the window was made
borderless (`.fullSizeContentView`, hidden title) so the webview sits flush against the rounded
corner — the geometry a sheet always has. An earlier probe with a visible title bar could not see
this defect at all, which is why it shipped.

## Three hypotheses, all REFUTED by measurement

Record these so the next session does not re-try them:

| hypothesis | result |
| --- | --- |
| it is the `NSWindow` background showing through the corner | **refuted** — `backgroundColor` set to `#161c1e` vs left default produced **byte-identical** captures |
| it is the page canvas; paint a 32px band via `html { background-image: linear-gradient(...); background-size: 100% 32px; background-attachment: fixed }` | **refuted** — crop identical to the control |
| widen the bar to `width: 100vw` so it covers the gutter | **refuted twice** already in 261003-sbr — a classic scrollbar paints above page content and a `position: fixed` element cannot paint into the gutter at all |

So those pixels are painted by something that neither the page CSS nor the window background
reaches. No working explanation yet.

## Arming conditions

- macOS only — the injected chrome is `#[cfg(target_os = "macos")]`, and it exists at all only
  because an AppKit sheet renders no title bar (`F-34.5-G6-16`).
- Needs `AppleShowScrollBars = Always` (a classic, space-taking scrollbar). Under the default
  overlay scrollbars there is no persistent gutter and nothing to see.

## Next step — why `ready: live-gate`

Open Safari's Web Inspector against the live login sheet and find what actually owns those pixels.
That cannot be done at the desk: the artifact only appears in a real sheet attached to the main
window, and the probe harness reproduces the *shape* without explaining the *cause*.

## Worth considering instead of fixing

This may be a genuine limit of the in-page chrome approach (decision **D-1 option (a)**, recorded
in `261003-nsk-CONTEXT.md`) — the one corner the page cannot paint. Both heavier routes already
costed in that file retire it as a side effect rather than for its own sake:

- **route C** — a native AppKit `NSView` bar above the `WKWebView`
- **route D** — a second webview rendering real GameLib UI, which is also the only route that
  makes the bar follow a theme switch

If route D is ever taken for the theming reason, close this row with it rather than spending
separate effort here.
