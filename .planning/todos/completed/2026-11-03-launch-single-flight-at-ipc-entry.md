---
created: 2026-11-03T12:00:00.000Z
title: "Single-flight bridge launches at the launch IPC entry, not only the bridge body"
area: steam-launch
files:
  - src/backend/launcher.ts:181-337
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
severity: medium
platform: any
ready: code
---

## Problem

Phase 59 review WR-03. The G26 single-flight guard covers only the body of
`launchBridgeGame`. A joined second Play still runs `createGameLogWriter`,
`checkWineBeforeLaunch`, `persistBottleWineVersion`, the user's before/after
launch scripts and the launching/done status updates. A non-idempotent launch
script therefore runs twice.

Second entry point (59-48 follow-up, never filed): UAT item 38's concurrent
launches cannot have come from one Play button, because it disables on the
first click. They must have come from a second entry point, for example the
library grid plus the game page. Find it and decide whether it should share
the guard.

## Missing test (IN-04)

The G26 tests drive the private `launchBridgeGame` directly. Add one test
through `launch()` with a deferred body, asserting one body run and one notify.

## Suggested fix

Move the single-flight up to the launch IPC entry so a joined Play returns
before any launcher-level work. This changes the generic launcher flow for
every runner, so it was deferred: G26's bridge-body guard already prevents the
bottle-level damage and no phase-59 gap needs it. Land the IN-04 test with
whichever change moves or keeps the guard.
