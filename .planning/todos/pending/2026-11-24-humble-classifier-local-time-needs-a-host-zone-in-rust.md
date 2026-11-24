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

## Decision (94-15): how the shell supplies the zone

`HumbleCtx` carries a `HostZone` seam (`gamelib_humble::ctx::HostZone`: the UTC offset in force at an instant) and
`HumbleCtx::local_zone_at(utc_ms)` turns the answer into the `LocalZone` the classifier takes. The shell implements it
over the same `jiff` system-zone lookup the log writer stamps its lines with (`gamelib_log::SystemTz`), so the offset is
the real host's, daylight saving included, at the instant asked. A context with no zone wired answers UTC, and a golden
replay passes the zone each recorded case names.

The library port (the plan that calls `classify_order`) calls `ctx.local_zone_at(now)`: the offset NOW. That is exact
for a host with no daylight saving and for any date on the same side of a change as the sync. Residual error, accepted:
a zone-less or date-only expiry that falls on the other side of a daylight-saving change from the sync is read with the
offset of the sync, one hour off (the TypeScript read it with the offset of the expiry's own date). The effect is a
date-only expiry that can show a day early (sync in summer, expiry in winter, host east of UTC) or an hour late. The
TypeScript already anchored Humble's zone-less timestamps to the host zone rather than to Humble's own (i31), so this
sits inside an accepted approximation, and the cached `expiration` has always depended on the syncing machine's zone.

The exact alternative, the offset at the expiry's own date, needs `classify`/`extract_expiration` to take a zone
LOOKUP instead of one `LocalZone` (and `parse_js_date` to resolve local time against it). That is a change to the 94-12
classifier API, so it stays here as the follow-up; nothing in 94-15 forecloses it (the seam already answers "the offset
at this instant").
