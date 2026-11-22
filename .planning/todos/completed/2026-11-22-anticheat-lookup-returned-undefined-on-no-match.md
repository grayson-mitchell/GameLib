---
created: 2026-11-23T00:30:00.000Z
title: "The anticheat lookup returned undefined, not null, when no entry matches"
area: info
files:
  - src-tauri/crates/gamelib-info/src/anticheat.rs (find, matches)
  - src/backend/anticheat/utils.ts (gameAnticheatInfo, deleted by 86-13)
  - src-tauri/crates/gamelib-info/tests/golden_anticheat.rs (golden_value)
severity: minor
platform: any
ready: code
---

## Problem

The TS `gameAnticheatInfo` ended in `jsonData.find(...)`, whose no-match result is `undefined`, although the function
is typed `Promise<AntiCheatInfo | null>`. Over the sidecar wire `undefined` is dropped from the response, so the
renderer saw an absent result where the type promised `null`.

The 86-04 oracle recorded that as the marker `{"undefined": true}` in `golden/anticheat/expected/*/result.json`.

## Why it is parked

Phase 86 (D-03) ported the lookup to Rust as `gamelib_info::anticheat::info`, which answers `null` for no match. The
renderer receives the same thing over IPC (`hasAnticheatInfo` stores the value in state and tests it for truthiness),
so nothing observable differs, and the golden replay asserts the marker as `null` (`golden_value`). The same file also
carries the other parity quirks of the TS (an upper-case argument finds nothing; a malformed entry in front of the
match answers `null` for the whole lookup), pinned by `a_malformed_entry_in_front_of_the_match_answers_null_...`.

## Fix, if it is ever wanted

Nothing to fix for the `undefined` itself: Rust is already the typed contract. If the other quirks are ever wanted
gone, skip a malformed entry instead of aborting, and lower-case the argument as well as the file side. Change
`anticheat::matches` and the parity tests together.

## Acceptance

- The renderer-facing result for no match is `null` (already true).
- Any change to the quirks updates `golden_anticheat.rs`'s parity tests in the same commit.

## Resolution

Closed by quick 261123-928 (2026-11-23). Nothing pushed.

- The null contract is confirmed, with no code change: `anticheat::info` ends in `find(&data, &namespace).unwrap_or(Value::Null)` (`gamelib-info/src/anticheat.rs:108`); the native `getAnticheatInfo` handler (`src-tauri/src/info_dispatch.rs:537`, `get_anticheat_info`) returns `run_info_op(.., "info_anticheat_info", ..)`'s value unchanged, and its shell test asserts the `nomatch` lookup is `Ok(Value::Null)` (lines 1510-1516); `src/frontend/hooks/hasAnticheatInfo.ts:7` keeps `useState<AntiCheatInfo | null>(null)` and stores the resolved value; the golden case `lookup-namespace-absent` (recorded `{"undefined": true}`) is asserted as `null` through `golden_value` (`golden_anticheat.rs:118`).
- `49f03ab67`: `anticheat::find` lower-cases the argument once with Unicode `str::to_lowercase` (the JS `toLowerCase` equivalent), and `matches` now answers a plain `bool`, so an entry the lookup cannot read is skipped and the search continues instead of ending the whole lookup with `null`. A non-string namespace is never stringified into a match.
- The parity tests were flipped in that same commit: `a_malformed_entry_in_front_of_the_match_answers_null_as_the_ts_throw_did` became `a_malformed_entry_in_front_of_the_match_is_skipped_and_the_match_found`, and `the_argument_is_lower_cased_too_so_an_upper_case_argument_matches` is new.
- The golden case `lookup-uppercase-argument-misses` was renamed `lookup-uppercase-argument-matches` and re-expected to the Alpha Game entry, because it pinned the fixed quirk. It is no longer the TS oracle's recording; its note and the test module doc say so.
- This departs from Phase 86 D-03 ("parity quirks copied, not fixed") for these two quirks only, at the user's request. The others stay: an entry with no truthy `storeIds.epic.namespace` never matches, a file that is not a JSON array answers `null`, and an empty argument matches the first non-empty namespace.
