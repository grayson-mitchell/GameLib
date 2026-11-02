---
created: 2026-11-02
title: "Amazon store exit refreshes only nile, but most Prime Gaming claims land in Epic or GOG"
area: store-embed
files:
  - src/frontend/screens/WebView/storeExitRefresh.ts
  - src/frontend/screens/WebView/useStoreEmbedHost.ts
severity: minor
platform: any
ready: code
---

## Problem

The `amazon` row in `STORE_EXIT_ROWS` (`storeExitRefresh.ts`) refreshes only `runner: 'nile'`.
Many Prime Gaming claims are delivered to another store through a linked account, Epic or GOG
for example. Seen live on 2026-11-02: an Epic-delivered claim from `/store/amazon` reached the
library only through the next full refresh (`origin=nav-tabs-games-tab`, legendary returned 17
games). nile synced 0 games. A working Amazon store-exit refresh would not have shown it.

## Proposed shape

Let a row name more than one runner. Amazon's exit then refreshes `nile` plus `legendary` and
`gog`, each gated by its own sign-in state (`collectSignInInputs`/`resolveSignInState`), so a
signed-out store does nothing and never prompts. Keep the in-flight guard per runner and add no
time throttle. Steam, Epic and GOG rows stay single-runner and their tests stay unchanged.

## Verify

- Unit: an Amazon exit refreshes every signed-in runner in its set, skips signed-out ones, and
  respects in-flight. Steam, Epic and GOG are unchanged.
- Live: an Epic-delivered Prime claim appears after leaving `/store/amazon` without a manual
  Refresh, and the log shows `origin=amazon-store-exit` against `legendary`.
