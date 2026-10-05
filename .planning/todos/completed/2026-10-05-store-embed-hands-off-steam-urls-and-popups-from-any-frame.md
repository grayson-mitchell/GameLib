---
created: 2026-10-05T00:00:00.000Z
title: "Store embed opens steam:// URLs and http(s) popups in the system without a gesture, from any frame including ad iframes"
area: security
severity: medium
platform: any
ready: code
found_by: "Security review of the webview / sidecar / Rust trust boundary, 2026-10-05"
files:
  - src-tauri/src/main.rs:5885-5910
  - src-tauri/src/main.rs:5994-6010
  - src-tauri/src/main.rs:6015-6028
---

## Problem

`on_navigation` hands any `steam:` navigation to `open_external` with no user gesture; it fires for
subframes too (the comment at `:5895` says so) and navigation to any http(s) origin is allowed.
`on_new_window` opens any http(s) popup in the system browser without a prompt.

## Failure scenario

An ad iframe or linked third-party page inside the embed fires `steam://install/...` or
`steam://run/...`, or spams system-browser popups.

## Suggested fix

Only hand off main-frame `steam:` navigations, ideally behind a confirm; rate-limit or require a
gesture for popup handoff.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.

## Resolution (2026-10-05)

**Mechanism confirmed.** `store_embed_navigation_policy(url)` returned `Handoff` for every
`steam:` URL with no other input, and `on_new_window` opened every popup externally.

**Main frame cannot be distinguished.** tauri 2.11.5's `on_navigation` is `Fn(&Url) -> bool`;
wry 0.55.1's `navigation_handler` is `Fn(String) -> bool`. Neither carries frame, initiator or
gesture. "Main-frame only" is therefore not implementable at this hook.

**Safe behaviour chosen (`src-tauri/src/main.rs`).**

- `steam:` is handed off only while the embed's **top-level page** is a Valve host
  (`steampowered.com`, `steamcommunity.com`, or a `.`-prefixed subdomain), recorded into
  `STORE_EMBED_TOP_LEVEL_HOST` from `on_page_load` (main frame only; set on `Started` as well as
  `Finished`). Anywhere else -- GOG/Epic/Amazon pages, lookalike hosts, or before any page has
  loaded -- it is blocked. A poisoned lock fails closed.
- Both hand-off kinds are rate-limited by `HandoffThrottle`: at most one `steam:` hand-off and at
  most one popup hand-off per `STORE_EMBED_HANDOFF_MIN_GAP` (2s). A refused popup is still
  `Deny`d inside the embed; it just is not routed to the system browser.

**RED.** A test asserting `store_embed_navigation_policy(steam://run/570)` is not `Handoff` failed
on the pre-fix code (`left: Handoff, right: Handoff`) -- no input existed that could block it.

**GREEN.** New Rust tests pass: `..._blocks_steam_unless_the_top_level_page_is_valve` (None, GOG,
Amazon, `evilsteampowered.com`, `steampowered.com.example` blocked; store/community/help hosts
handed off), `..._https_is_unaffected_by_the_top_level_host`, `handoff_throttle_admits_one_per_gap`,
`handoff_throttle_refusals_do_not_extend_the_window`; all 36 `store_embed*` tests pass. `cargo
fmt --check` clean; clippy adds nothing (22 pre-existing warnings). Related jest suites green.

**Residual / not done.**

- An iframe embedded IN a Valve page can still fire one `steam:` hand-off per 2s. Steam's client
  shows its own dialog for `steam://install`; `steam://run` of an installed game may launch it.
- No confirm before hand-off: that needs a product decision and translatable shell strings.
- No live run on macOS or Linux (the only platforms the embed exists on): the store's real
  install/launch buttons still handing off, and `Started` firing for the main frame on WebKitGTK,
  are unobserved.
