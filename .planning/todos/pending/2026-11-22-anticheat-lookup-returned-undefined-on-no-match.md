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
