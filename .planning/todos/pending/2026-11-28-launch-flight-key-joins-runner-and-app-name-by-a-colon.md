---
created: 2026-11-28T00:00:00.000Z
title: 'The launch single-flight key joins runner and app name with a colon, so two different pairs can share one flight'
area: launch
severity: minor
platform: any
ready: code
found_by: 'Phase 88.3 plan 88.3-02 recorded it (golden single_flight, single-flight--the-key-is-runner-and-app-name-joined-by-a-colon); plan 88.3-04 copied it into LaunchFlights as recorded.'
files:
  - src-tauri/crates/gamelib-launch/src/funnel/flights.rs
  - src/backend/launchSingleFlight.ts
---

## Problem

The table is keyed `<runner>:<appName>`, in the TypeScript (`launchSingleFlight.ts`) and in the Rust port
(`LaunchFlights::key_of`). A runner `a` with an app named `b:c` and a runner `a:b` with an app named `c` both key as
`a:b:c`, so the second would join the first's launch.

Runners are a closed set (`legendary`, `gog`, `nile`, `sideload`, `steam`), so only an app name holding a colon under a
runner whose name is a prefix of another could collide, and no such pair exists today. A latent trap, no live
consequence.

## Fix

Key the table by the pair `(runner, app_name)` rather than a joined string. Change the golden case
`single-flight--the-key-is-runner-and-app-name-joined-by-a-colon` with it (it records the collision on purpose).
