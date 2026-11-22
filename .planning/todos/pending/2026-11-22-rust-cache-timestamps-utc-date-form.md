---
created: 2026-11-22T20:00:00.000Z
title: "Rust cache timestamps are written in the UTC Date() form, not TS's local-time form"
area: info
files:
  - src-tauri/crates/gamelib-info/src/cache_view.rs (js_date_string, CacheView::set)
  - src/backend/cache.ts (CacheStore.set writes Date())
severity: minor
platform: any
ready: code
---

## Problem

Phase 86 (D-03) ported the TS `CacheStore` to Rust as `gamelib_info::cache_view::CacheView`. TS writes the
`__timestamp.<key>` bookkeeping value with `Date()`, which is the local-time long form with the zone's long name,
for example `Tue Nov 17 2026 21:32:56 GMT+1300 (New Zealand Daylight Time)`. Rust has no long zone names, so
`js_date_string` writes the form Node prints under `TZ=UTC`:
`Sat Nov 21 2026 18:07:08 GMT+0000 (Coordinated Universal Time)`.

Both forms parse to the same instant: the numeric `GMT+HHMM` offset decides it and a JS `new Date()` ignores the
parenthetical (checked in Node during the Phase 86 research). Rust reads either form and ISO 8601
(`CacheView::get_opt` through `parse_js_date`), and TS reads Rust's form, so entries written by one side expire
correctly on the other.

## Why it is parked

The divergence is a copy of the quirk in the other direction, not a bug: nothing compares the strings. It would
only matter if some code compared timestamp text for equality, or if a person read the file and expected their
own zone. A file written by Rust after the Phase 86 cache ports therefore shows UTC where it used to show local time.

## Fix, if it is ever wanted

Write the local form: take the offset and the zone's long name from the OS (jiff `tz-system` plus a long-name
table, or the shell passing both in `InfoCtx`). Not worth a time-zone database for a string nothing reads.

## Acceptance

- Decide whether anything reads the string as text. If not, close this todo as wontfix.
- Otherwise `js_date_string` emits the local form and a golden pins it for at least two zones.
