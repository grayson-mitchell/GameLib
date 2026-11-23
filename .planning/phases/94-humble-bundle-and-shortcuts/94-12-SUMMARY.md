---
phase: 94-humble-bundle-and-shortcuts
plan: 12
subsystem: backend
tags: [rust, humble, classify, v8-date-parser, js-parity, oracle, d-06, d-20]
status: complete

requires:
  - phase: 94-humble-bundle-and-shortcuts
    provides: 94-02 gamelib-humble crate skeleton; 94-06 492 classify goldens recorded from the TS and their manifest
provides:
  - gamelib_humble::classify (every classify export the library calls, snake_case, plus HUMBLE_CLASSIFIER_VERSION 7)
  - gamelib_humble::js_date (V8 DateParser port, local midnight, toISOString, LocalZone)
  - gamelib_humble::js_value (order-preserving JSON value with JavaScript Object.keys order)
  - tests/vectors_classify.rs (replays every classify golden, manifest count and floor asserted)
  - 116 named Rust tests, one per classify.test.ts test, in 22 modules named after the describes
affects: [94-13, 94-15, 94-30]

requirements-completed: []

actuals:
  tokens: 38700
  tasks: 2
  commits: 2

plan_head_before: c28c1c9873ee39748567731e750a176965074c5e
plan_head_after: 9217ad0c64c5f7c7d4d14b51426072d37821e5b4

tech-stack:
  added: []
  patterns:
    - "a JS-parity port is checked against the engine itself: js_date was run over 27,168 generated date strings against node (V8) in three fixed-offset zones, and the committed proof is the recorded vectors"
    - "order fixtures for ported unit tests are read from the recorded goldens (input.order of the plain variant), not retyped"
    - "an order-preserving JsValue instead of serde_json::Value wherever the TS reads Object.keys, because preserve_order is forbidden by gamelib-store"

key-files:
  created:
    - src-tauri/crates/gamelib-humble/src/classify.rs
    - src-tauri/crates/gamelib-humble/src/js_date.rs
    - src-tauri/crates/gamelib-humble/src/js_value.rs
    - src-tauri/crates/gamelib-humble/tests/vectors_classify.rs
    - .planning/todos/pending/2026-11-24-humble-expiry-date-only-feb-30-rolls-into-march.md
    - .planning/todos/pending/2026-11-24-humble-classifier-local-time-needs-a-host-zone-in-rust.md
  modified:
    - src-tauri/crates/gamelib-humble/src/lib.rs

key-decisions:
  - "Time values are i64 milliseconds, not jiff::Timestamp: V8 accepts years to 275760 and a Timestamp stops at 9999, so an out-of-range days count or a far date would diverge."
  - "The host zone is a caller-supplied fixed offset (js_date::LocalZone), because the crate allows no tz database. It matches V8 for every zone without daylight saving; the open question for 94-15 is filed as a todo."
  - "classify reads JsValue, an order-preserving JSON type, not serde_json::Value: the describe functions list field names in Object.keys order and serde_json sorts keys (preserve_order must stay off, gamelib-store)."
  - "The fixtures of classify.test.ts come from the recorded goldens; a key value there is the string REDACTED, so the two C5 no-leak tests plant their own sentinel and the keyed-value test asserts REDACTED."

patterns-established:
  - "describe -> mod, test -> #[test] with the TS title in a doc comment, so the oracle's meaning survives its deletion in 94-30"

requirements: [SVC-04]
duration: 75min
completed: 2026-11-24
---

# Phase 94 Plan 12: Humble classifier in Rust Summary

**The Humble classifier, with a port of V8's date parser, answers all 492 recorded TypeScript vectors exactly and carries all 116 tests of classify.test.ts as named Rust tests.**

## What was built

- **`classify.rs`**: `classify_order`, `classify_tpk`, `is_terminal`, `is_server_terminal`, `is_freeze_eligible`, `extract_expiration`, `describe_zero_key_order`, `describe_skipped_entitlements`, `describe_missing_expiration_tpks`, with serde types for the key, the states, the order result and its two backend-only side channels (`keyIndexByComposite`, `revealedKeyValueByComposite`). `HUMBLE_CLASSIFIER_VERSION` is 7. The one regex, the date-only pattern, is `^[0-9]{4}-[0-9]{2}-[0-9]{2}$` (explicit classes; `grep -c` for the shorthand classes is 0).
- **`js_date.rs`**: a port of V8's `DateParser` (the ES5 date-time parser tried first, then the legacy Safari-compatible one: named months, `AM`/`PM`, zone names, `GMT+0200`, parentheses, the `kMaxSignificantDigits` cut, NUL as end of input), `MakeDay` bounds, `TimeClip`, `new Date(y, m, d)` with the 0..99 year rule, and `toISOString` including the `+275760` form.
- **`js_value.rs`**: `JsValue`, JSON with objects as ordered entries (a repeated key keeps its first place and last value), `Object.keys` order with integer keys first, JS truthiness and `typeof`, and ECMAScript `Number::toString` for a numeric `steam_app_id`.
- **`tests/vectors_classify.rs`**: reads `MANIFEST.json`, asserts the Rust version equals the recorded `classifierVersion` (7), the case-file count equals the manifest count (492), count >= floor (450), every one of the nine functions has vectors, then replays each case and compares JSON exactly, printing the case id and both values on a mismatch. Proven to discriminate: swapping two expiration field names fails one vector.
- **116 unit tests** in `classify.rs`: 22 modules named after the 22 describes, one test per `test(...)` (116 in the TS, 116 passed). Fixtures are read from the goldens' `plain` variant, not retyped.

## Parity evidence beyond the vectors

`js_date::parse_js_date` was run over 27,168 generated strings (date forms x time forms x zone forms x padding, plus a few hundred hand-picked edge strings) in UTC, America/Phoenix and Asia/Kolkata, against `new Date(s).getTime()` in node. One real divergence turned up and was fixed: U+2028 and U+2029 are line terminators but V8's word scanner does not count them as white space (so `"2026-08-01\u{2028}"` is invalid while a trailing NBSP is fine). After the fix 27,064 strings agree; the remaining 104 are all dates before 1900 in the two non-UTC zones, where the host used local mean time (a tz database offset) and a fixed offset cannot match. The differential harness is not committed: the committed proof is the recorded TS vectors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] An order-preserving value type instead of `serde_json::Value`**
- **Found during:** Task 1 design (the describe goldens print `order_fields=[...]` in `Object.keys` order)
- **Issue:** `serde_json::Value` sorts object keys, and `preserve_order` cannot be turned on: `gamelib-store`'s Cargo.toml forbids it (feature unification would reach every crate).
- **Fix:** a new `js_value.rs` (`JsValue`), which the classifier takes instead of `Value`. This adds a file the plan's `files_modified` does not list.
- **Files modified:** `src-tauri/crates/gamelib-humble/src/js_value.rs`, `src/lib.rs`
- **Commit:** 0a4055c55

**2. [Rule 1 - Bug] Line separators were treated as white space by the word scanner**
- **Found during:** the differential run against node
- **Issue:** the first `js_date` accepted `"2026-08-01\u{2028}"`; V8 rejects it (U+2028/2029 start an unknown word).
- **Fix:** `is_word_break_unit` (white space without the line terminators) for the word scanner only.
- **Commit:** 0a4055c55 (the fix is in the same commit; it was found before the first commit)

### Plan wording that could not hold as written

**3. `parse_js_date(raw) -> Option<jiff::Timestamp>` and `to_iso_string(ts) -> String`.** The port takes `(raw, LocalZone)` and returns `Option<i64>` milliseconds, and `to_iso_string(i64) -> Option<String>` (`None` where JavaScript throws a `RangeError`). Reasons: V8's range exceeds `jiff::Timestamp`'s, and a zone-less string needs the host's zone, which the plan's signature had no place for. `classify_order` and `extract_expiration` therefore take `now_ms: i64` and a `LocalZone`. The plan's artifact list names `parse_js_date` and `to_iso_string`; both exist.

**4. "unknown fields preserved where the TS spreads objects".** classify.ts spreads nothing, so no type needed to preserve unknown fields.

### Additions beyond the plan

- Two `.planning/todos/pending/` todos (D-20) for the copied quirks the vectors pin: calendar-invalid and loose date-only forms (`2026-02-30` rolls to March 2; `2026`, `2026-08`, `8/1/26`, `8/1`, `0050-01-01` all parse), and the host-zone dependence the Rust port can express only as one fixed offset (`ready: human`, for 94-15). classify.test.ts itself asserts no JS quirk beyond intended behaviour, so no test carries a quirk comment.
- A permanent unit-test set for `js_date` (range ends, rollover, white space set) and `js_value` (key order, truthiness, number formatting); their expected values are ECMAScript spec facts, not recorded oracle values.

## Verification

- `cargo test -p gamelib-humble --test vectors_classify`: 1 passed (492 cases).
- `cargo test -p gamelib-humble --lib classify`: 116 passed. `cargo test -p gamelib-humble`: 138 lib + 1 vector, all pass.
- `cargo clippy -p gamelib-humble --all-targets -- -D warnings`: clean. `cargo fmt -p gamelib-humble --check`: clean.
- `pnpm planning-gates`: 12/12. `pnpm find-deadcode`: PASS at the baseline of 310.
- Windows-only observations: none. The new tests read fixtures by `CARGO_MANIFEST_DIR` and run the same on the CRLF checkout (the fixtures are `-text`).

## Known Stubs

None.

## Threat Flags

None. T-94-22 (regex over server strings): the one regex is the `regex` crate's, linear time, over a string the server action bounds; the date parser is a single forward scan.

## Self-Check: PASSED

- Files: `classify.rs`, `js_date.rs`, `js_value.rs`, `vectors_classify.rs`, both todos and this summary exist.
- Commits: 0a4055c55, 9217ad0c6 in `git log`.
