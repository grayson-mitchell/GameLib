---
created: 2026-11-25T14:00:00.000Z
title: "The Epic status check shows an \"offline\" notification when the service component is merely missing, then reports online"
area: launch
files:
  - src/backend/utils/epicServiceStatus.ts:69 (the loop ends, deps.notify() runs, false is returned)
  - src-tauri/crates/gamelib-launch/tests/fixtures/golden/epic_status/expected/epic-fortnite-component-absent/events.json
  - src-tauri/crates/gamelib-launch/tests/fixtures/golden/epic_status/expected/epic-epic-games-store-components-empty/events.json
severity: minor
platform: any
ready: code
---

## Problem

Recorded by the 88.1-02 `epic_status` golden (D-20: kept as recorded, not fixed there).
When the components list has no entry named for the asked type (an empty list, a renamed component, a
list of other services), `checkEpicServiceOffline` calls `notify()` and returns false. The notification
reads "<type> offline" and the launch goes ahead online, so the user is told a service is down while the
launcher behaves as if it is up. The unit test pins the notify-and-false pair on purpose ("notifies and
returns false when the component is absent"), so it may be intended as "status unknown, warn".

## Solution

Not part of the port. After the Rust check replays the golden, decide whether an absent component should
warn at all, and with what wording, in one deliberate change recorded in `deltas.json`.
