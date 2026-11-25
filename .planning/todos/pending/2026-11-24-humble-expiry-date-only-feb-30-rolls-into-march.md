---
created: 2026-11-24T00:00:00.000Z
title: 'Humble classifier: a calendar-invalid date-only expiry such as 2026-02-30 is accepted and shifted two days into March'
area: humble
severity: minor
platform: any
ready: code
found_by: 'Phase 94 plan 94-12, porting classify to Rust against the 94-06 vectors (value-date-only-feb-30-utc).'
files:
  - src/backend/humble/classify.ts
  - src-tauri/crates/gamelib-humble/src/classify.rs
  - src-tauri/crates/gamelib-humble/tests/fixtures/golden/classify/extract-expiration-value-date-only-feb-30-utc.json
---

## Problem

`extractExpiration` uses `new Date(value)` as its one validity gate. V8 checks a day only against 1..31, not against the
month, so `"2026-02-30"` is a valid date. The bare date-only branch then rebuilds it with `new Date(2026, 1, 30)`, which
rolls over. The recorded golden is `"2026-03-02T00:00:00.000Z"` (UTC): a key whose Humble expiry says Feb 30 is shown, and
expires, on March 2.

The same gate accepts other forms that are not what Humble documents: a bare year (`"2026"` is 2026-01-01 UTC), a year and
month (`"2026-08"`), a two-digit year (`"8/1/26"` is 2026-08-01 local), a month and day with no year (`"8/1"` is the year
2001), and a four-digit year of 0000 to 0099 matching the date-only pattern (`"0050-01-01"` is rebuilt by
`new Date(50, 0, 1)` as 1950). None of them has been seen from the live API; they are what the gate lets through.

## Direction

The Rust port copies all of this for parity (D-20): `gamelib_humble::js_date` is a port of V8's date parser and
`classify::extract_expiration` rebuilds a date-only value the way the TS does. Decide, in the TS and the Rust together,
whether to reject a day past the month's length and a date with no four-digit year, and re-record the classify goldens
with `recordDelta` when the answer changes.
