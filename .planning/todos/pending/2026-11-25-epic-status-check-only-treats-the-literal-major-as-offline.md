---
created: 2026-11-25T14:00:00.000Z
title: "The Epic status check treats only the literal status \"major\" as offline, but the status page reports \"major_outage\""
area: launch
files:
  - src/backend/utils/epicServiceStatus.ts:61 (checkEpicServiceOffline compares indicator === 'major')
  - src-tauri/crates/gamelib-launch/tests/fixtures/golden/epic_status/expected/epic-epic-games-store-status-major-outage/result.json
  - src-tauri/crates/gamelib-launch/tests/fixtures/golden/epic_status/expected/epic-epic-games-store-status-major/result.json
severity: medium
platform: any
ready: code
---

## Problem

Recorded by the 88.1-02 `epic_status` golden (D-20: kept as recorded, not fixed there).
`checkEpicServiceOffline` returns true only when the component's `status` is exactly `"major"`. The
Statuspage components endpoint (`status.epicgames.com/api/v2/components.json`) names its states
`operational`, `degraded_performance`, `partial_outage`, `major_outage` and `under_maintenance`, so a real
major outage (`major_outage`) never counts as offline: the launch goes online and the notification
"Epic Games Store offline" is never shown. The unit tests pass `status: 'major'`, which the live endpoint
does not send, so the check only ever fires for a value no real response carries.

## Solution

Not part of the port. After the Rust status check replays the golden, decide the rule (`major_outage`, and
whether `partial_outage` counts) in the Rust check and the golden together, in one deliberate change
recorded in `deltas.json`. Check a recorded live response first: the endpoint's current wording is the
evidence, not this note.
