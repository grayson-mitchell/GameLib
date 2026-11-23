---
created: 2026-11-24T00:00:00.000Z
title: 'Humble classifier: zone-less and date-only expirations depend on the host zone, which the Rust port can only take as one fixed offset'
area: humble
severity: medium
platform: any
ready: human
found_by: 'Phase 94 plan 94-12, porting classify and V8 `new Date(string)` to Rust (js_date.rs); checked against node on 27,168 date strings.'
files:
  - src/backend/humble/classify.ts
  - src-tauri/crates/gamelib-humble/src/js_date.rs
  - src-tauri/crates/gamelib-humble/src/classify.rs
---

## Problem

In the TS, a date-only expiry (`"2026-08-01"`) is anchored to local midnight, and a zone-less date-time
(`"2026-08-01 12:34"`, `"March 5, 2020"`) is read in the host's zone (i31, accepted cost in `classify.ts`). So a cached
`HumbleKey.expiration` depends on the zone of the machine that synced it. The 94-06 goldens record this in three
fixed-offset zones.

`gamelib-humble` allows fixed-offset civil time only (no tz database), so `js_date::LocalZone` is one offset east of UTC
that the caller supplies. That reproduces V8 exactly for a zone with no daylight saving. Against node, the port matched
27,064 of 27,168 strings in UTC, America/Phoenix and Asia/Kolkata; the other 104 are dates before 1900, where those zones
used local mean time (a tz database offset, not a fixed one). A host that observes daylight saving gives a one-hour error
for a date on the other side of a change from the offset the caller passed.

## Direction

94-15 (the library sync port) decides where the shell gets the offset: the offset for the expiry's own date, the offset
now, or no local anchoring at all (treat date-only as UTC and file a delta). Whichever it picks, record the choice
through `recordDelta` if it differs from the TS.
