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

## Resolution

Fixed 2026-11-28 in quick task 261128-2xo (the rule `0510abc0b`, vectors and tests `f6debdb7f`).

- The decision. Both questions the Direction asked were answered "reject" (the user's choice "Both"): a day past the
  month's length, and any value without a full year-month-day whose year is four digits from 1000 to 9999. Every form
  the Problem lists is now rejected: `2026-02-30`, `2026-04-31`, `February 30, 2026`, `2026`, `2026-08`, `8/1/26`,
  `8/1` and `0050-01-01`. A rejected value behaves like an unparseable one: the loop moves to the next absolute field,
  then `num_days_until_expired`, then null.
- The rule. "An absolute expiry is kept only when its written date is a real calendar date with year, month and day all
  present and a four-digit year from 1000 to 9999, and the parser read that same date: the parsed instant is within one
  day of the written date's UTC midnight." It lives in `hasFullCalendarDate` (classify.ts) and `has_full_calendar_date`
  (classify.rs), with the same steps and regex literals, and runs right after the V8 parse gate. It is linear in the
  input: the digit and letter runs are walked with a global match loop, never a pattern that backtracks across a digit
  run.
- Parity. Both sides changed together, and the goldens were re-recorded from the TS: six flipped to null, 56 added,
  MANIFEST count 548. No `recordDelta` and no deltas file, because that tool is for a deliberate Rust-vs-TS difference
  and there is none here. This supersedes the Direction's suggestion.
- The classifier version stays 7. No rejected form has been seen from the live API, so no cached row carries one. A bump
  forces a full re-fetch of every frozen order for every user and re-records the `library` goldens that embed
  `"classifierVersion": 7`. The precedent is i31 (`6dad83a30`), which changed date-only field extraction under v7
  without a bump. This was a discretionary call and can be reversed.
- Accepted limits. The rule reads the written text. On contrived strings where V8 assigns a number differently it
  decides on the written fields, and the one-day check rejects them (`Feb 28 GMT+2026`, `Feb 30 2026 (Mar)`). Extended
  `+YYYYYY` years are rejected (not four digits). An offset of a day or more would be rejected; no real zone has one.
