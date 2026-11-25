---
created: 2026-11-25T04:30:00.000Z
title: "GOG library refreshes twice back to back when the connection returns after an offline launch"
area: gog-library
files:
  - src/backend/sidecar/shellFilesFlowRegistration.ts (deferred version-change clear pushes refreshLibrary, ~line 270)
  - src/backend/storeManagers/gog/library.ts (refresh(), ~line 545)
severity: minor
platform: any
ready: code
---

## Problem

Found in the live check of `.planning/debug/resolved/gog-offline-empties-cache.md` (2026-11-25). After an
offline version-change launch, Wi-Fi back on:

- 17:22:27 `Connectivity: online`
- 17:22:28 `Getting GOG library`
- 17:22:32 `No cache found, getting data from gog...`, `Saved games data`, `Getting GOG library` again

Two full GOG refreshes run within ~4 s. Likely one comes from an online-return refresh path and the second
from the deferred version-change clear (`clearAndRefresh` -> `pushFrontendMessage('refreshLibrary')` ->
renderer sees the just-cleared store -> `refreshLibrary('gog')`). Harmless but wastes a full
library + gamesdb refetch. Not checked whether Epic / Amazon double up the same way.

## Done when

Reconnecting after an offline version-change launch produces one `Getting GOG library`, and the library
still ends populated.
