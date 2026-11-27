---
phase: quick-261128-2xo
plan: 01
subsystem: humble
tags: [humble, classifier, expiry, rust-parity, golden-vectors]
requires:
  - quick-261128-22q
provides:
  - "hasFullCalendarDate / has_full_calendar_date: one calendar rule in the TS and Rust Humble expiry extractors"
affects:
  - src/backend/humble/classify.ts
  - src-tauri/crates/gamelib-humble/src/classify.rs
tech-stack:
  added: []
  patterns:
    - "twin helpers with the same steps and regex literals, pinned by TS-recorded goldens replayed in Rust"
key-files:
  created:
    - "src-tauri/crates/gamelib-humble/tests/fixtures/golden/classify/ (56 new case files)"
  modified:
    - src/backend/humble/classify.ts
    - src-tauri/crates/gamelib-humble/src/classify.rs
    - src/backend/humble/__tests__/classify.test.ts
    - src/backend/humble/__tests__/oracle/pureLogic.oracle.test.ts
    - src-tauri/crates/gamelib-humble/tests/fixtures/golden/classify/MANIFEST.json
    - ".planning/todos/completed/2026-11-24-humble-expiry-date-only-feb-30-rolls-into-march.md (moved from pending/)"
key-decisions:
  - "The rule: an absolute expiry is kept only when its written date is a real calendar date with year, month and day all present and a four-digit year from 1000 to 9999, and the parser read that same date: the parsed instant is within one day of the written date's UTC midnight."
  - "No recordDelta and no deltas file: both sides changed together, so there is no deliberate Rust-vs-TS difference. This supersedes the todo Direction's suggestion."
  - "HUMBLE_CLASSIFIER_VERSION stays 7 (orchestrator decision). Reason: no rejected form has been seen from the live API, so no cached row carries one; a bump forces a full re-fetch of every frozen order and re-records the library goldens that embed classifierVersion 7. Precedent: i31 (6dad83a30) changed date-only extraction under v7 without a bump. DISCRETIONARY CALL, flagged for the user, who may reverse it."
status: complete
commits: 3
plan_head_before: 663dcb36cc563b925b4d364f8758de17a893bf0a
plan_head_after: f1213001d
actuals:
  tokens: 60000
  tasks: 3
  commits: 3
metrics:
  duration: ~35min
  completed: 2026-11-28
---

# Phase quick-261128-2xo Plan 01: Humble expiry rejects calendar-invalid and partial dates Summary

One shared calendar rule, `hasFullCalendarDate` (TS) and `has_full_calendar_date` (Rust), now gates the Humble expiry extractor right after the V8 parse gate, so `2026-02-30`, a bare year, a year-month, a two-digit or missing year and years 0000-0999 are ignored like unparseable values.

## What was done

- **Task 1 (`0510abc0b`)**: the rule in both classifiers (same five steps, same `[0-9]+` / `[A-Za-z]+` literals, each doc names its twin). Re-recording the 94-06 goldens from the TS changed exactly the six expected files, each to `"output": null` (date-only-feb-30-utc, year-only-utc, year-month-utc, two-digit-year in UTC, America/Phoenix, Asia/Kolkata). MANIFEST and every other golden were byte-identical.
- **Task 2 (`f6debdb7f`)**: 30 new `values` rows, 2 precedence rows and 2 classify-order-dated labels in the oracle (56 new goldens; MANIFEST count 548, floor 450, classifierVersion 7), a TS describe block (`extractExpiration — calendar-invalid and partial dates are rejected (261128-2xo)`) and a Rust `mod extract_expiration_calendar_date_rule`. They cover every rejected and kept form, fall-through, relative fallback, the UNPICKED deadline and the 200,000-zero long run.
- **Task 3 (`f1213001d`)**: the todo moved to `completed/` with its original bytes intact plus a `## Resolution`; `pnpm planning-gates` 12/12.

## Verification (all green on this Windows host)

- 7 TS suites: 946 tests after Task 1, 1046 after Task 2 (compare mode).
- `cargo test -p gamelib-humble`: all targets pass (282 lib tests, `vectors_classify` replays 548 cases).
- `cargo clippy -D warnings` (crate, all targets) and `cargo fmt --check` clean; the workspace clippy ratchet prints `PASS (win32, toolchain 1.99.1)`.
- prettier, eslint and `pnpm codecheck` clean over the written TS files. The classify goldens and MANIFEST are prettier-ignored, so no prettier check ran over them.
- Golden spot checks: kept rows record the UTC outputs the plan lists; the two precedence rows record `2026-09-01T00:00:00.000Z` and `2026-08-05T00:00:00.000Z`.

## Deviations from Plan

None - plan executed exactly as written. The plan's `<files>` for Task 1 named eight paths and one commit with those eight paths was made. One small extra in the Rust test module: `REJECTED` is a fixed-size array of the same 25 values as the TS list, and `every_rejected_value_parses_but_is_none_in_every_zone` loops all three fixed zones.

## Notes for the user

- Discretionary: `HUMBLE_CLASSIFIER_VERSION` was left at 7 (see key-decisions). If any rejected form is later found in a live cached row, bump it then.
- Accepted limits (also in the todo Resolution): the rule reads written text; contrived strings where V8 and the written fields disagree are rejected by the one-day check; extended `+YYYYYY` years are rejected.
- Pre-1970 vector rows are UTC-only because the Rust replay uses fixed offsets while V8 uses local mean time there.

## Known Stubs

None.

## Threat Flags

None. No new network, auth or file surface; the DoS mitigation (linear run walk) is pinned by the 200,000-zero test on both sides.

## Self-Check: PASSED

- Commits `0510abc0b`, `f6debdb7f`, `f1213001d` present in `git log`.
- `classify.ts`, `classify.rs`, both test files, MANIFEST.json and the completed todo exist; the pending todo is gone.
