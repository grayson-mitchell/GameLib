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

## Closed 2026-11-05 (quick 261105-pnh)

Store-exit rows now carry `targets`. The Amazon exit refreshes nile, legendary and gog, each
behind its own `resolveSignInState(collectSignInInputs(...)[key])` gate. A signed-out runner
does nothing and never prompts. The in-flight guard is per runner and shared across stores, so
an Epic exit and an Amazon exit cannot stack two legendary refreshes. There is no time
throttle. Steam, Epic and GOG rows stay single-runner and their existing tests are untouched.

Commits: 37563875e (test), c2666b23a (feat, module), 60d3d880f (feat, caller wiring).

- Live check PASSED 2026-11-05 (operator): Epic-delivered Prime claim *Ad Infinitum* appeared
  after leaving `/store/amazon` with no manual Refresh. Log 18:48:59 shows
  `[amazonStoreExitRefresh] origin=amazon-store-exit runner=legendary outcome=refreshed` and
  `[refreshLibrary] runner=legendary origin=amazon-store-exit`; legendary went 18 -> 19 entries at
  18:49:05. The tile was not visible at first only because the title is Windows-only (not Mac
  native), so the grid's runnability view did not show it; it is there under the non-native view.
