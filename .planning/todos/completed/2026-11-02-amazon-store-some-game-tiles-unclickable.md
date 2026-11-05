---
created: 2026-11-02
title: "Amazon store: several game tiles do nothing when clicked"
area: store-embed
files:
  - src-tauri/src/store_embed_handoff_policy.rs
  - src-tauri/src/main.rs
severity: medium
platform: any
ready: live-gate
---

## Problem

Seen live on 2026-11-02 in `/store/amazon`: several game tiles could not be clicked into. The
operator suspects these were the Amazon-delivered titles. The one tile that opened was an
Epic-delivered game.

## Unknown cause

Nothing about it reached `gamelib.log`. The click handling would show in the shell output
(`tauri dev` stdout), which was not captured. Candidates to test, not facts:

- The tile opens a `window.open` popup. It gets sent to the browser, or dropped by
  `STORE_EMBED_POPUP_THROTTLE` or `store_embed_browser_handoff_policy` (for example a non-http
  scheme or `about:blank`).
- The tile navigates to a host the navigation policy blocks, or to a scheme such as an Amazon
  Games app link.
- A same-document view change the embed draws but never shows (see the back-navigation todo
  `2026-11-02-amazon-store-no-back-navigation-after-claim`).

## To do

Reproduce with the `tauri dev` terminal captured, click a dead tile, and record which hook saw
it (`on_new_window`, `on_navigation`, the handoff policy or the throttle) and the URL.

## Verify

Live: every Prime Gaming tile in `/store/amazon` opens its detail or claim view in the embed.

## Closed 2026-11-05 (not a GameLib defect)

Operator re-checked live: the "dead" tiles are in Amazon's top carousel panel. On Amazon's own
store page, clicking a game there only moves the carousel's highlight to that tile. It does not
open a detail or claim view. Other stores' carousels do navigate, which is why it looked broken.
This is how Amazon's page works, and no embed hook drops the click. The UI is arguably poor, but
it is Amazon's. No code change.
