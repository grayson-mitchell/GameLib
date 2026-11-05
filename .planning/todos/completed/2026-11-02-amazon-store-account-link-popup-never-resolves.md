---
created: 2026-11-02
title: "Amazon store: linking an Epic account opens the system browser and never resolves"
area: store-embed
files:
  - src-tauri/src/store_embed_handoff_policy.rs
  - src-tauri/src/main.rs
severity: medium
platform: any
ready: live-gate
---

## Problem

Seen live on 2026-11-02 while running the Amazon store-exit check (todo
`2026-10-30-store-exit-library-refresh-for-epic-gog-amazon`). On `/store/amazon`
(`gaming.amazon.com`), claiming an Epic-delivered Prime Gaming game first asks you to link an
Amazon account to Epic. Clicking that option opened the page in the system browser, and the
flow never resolved in the embed. Linking the accounts from the browser alone worked.

## Likely cause (not measured)

Every `window.open` from the Tauri-managed embed goes through `store_embed_open`'s
`on_new_window` (`main.rs`, about line 6870) to `store_embed_browser_handoff_policy`, which sends
any http(s) URL to the system browser. An account-link sign-in popup has to report back to the
page that opened it (`window.opener` / postMessage, or a redirect the opener polls for). Once the
popup is in another app, the embed never hears back. The same probably applies to GOG, Ubisoft
and other Prime Gaming account links, and to any popup-based OAuth inside a store embed.

## To do

- Capture the popup URL and host (shell log / `tauri dev` stdout) for the Epic link, and for at
  least one other link such as GOG.
- Decide the shape. One option is an allowlisted in-app popup window for known account-link
  hosts that keeps the opener relationship. Another is to detect the link step and tell the user
  to finish in the browser, then reload the embed. The http(s) → browser default stays for
  everything else.

## Verify

Live: link an Amazon account to Epic from inside `/store/amazon` (unlink first in the
browser), and confirm the claim page sees the link without leaving the app.

## Closed 2026-11-05 (debug amazon-account-link-popup)

The cause was as the todo guessed. The link step is a `window.open` popup to
`www.epicgames.com/id/authorize` (logged live, embed host `luna.amazon.com`) that completes
through `window.opener`. Sending it to the system browser cannot work: the browser tab has no
opener, and reloading the embed still offered "link account". So a finish-in-browser prompt was
ruled out.

- `fe33598ed`: popup hand-off log lines now include the host and path (no query string).
- `d8682c350`: new `OpenInAppPopup` decision in `store_embed_handoff_policy.rs`, for https +
  `www.epicgames.com` + `/id/` only. `on_new_window` opens an in-app window that keeps the
  opener and session (`window_features`). Every other http(s) popup keeps the D-28
  system-browser path.
- Operator live check passed 2026-11-05: the Epic sign-in opened in-app and the account linked
  without leaving the app.
- Other Prime Gaming links: none needed today. GOG claims hand you a code that you redeem on
  GOG's site outside the embed, and the operator confirmed that flow works (2026-11-05). No Ubisoft
  claims are available to test. If an unworked link popup turns up, the hand-off log line shows its
  host. Capture it live before adding it to the allowlist.
