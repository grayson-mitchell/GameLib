---
created: 2026-11-22T21:00:00.000Z
title: "Adding or removing a recent game silently drops every entry whose appName is empty"
area: info
files:
  - src-tauri/crates/gamelib-info/src/recent.rs (keeps, add, remove)
  - src/backend/recent_games/recent_games.ts (the filter in addRecentGame and removeRecentGame)
severity: minor
platform: any
ready: code
---

## Problem

Both `add` and `remove` rebuild the list with the filter `a.appName && a.appName !== appName`. The first half is
meant to drop the game being re-added, but because it is a truthiness test it also drops any stored entry whose
`appName` is missing, empty, `null` or `0`, and any stored value that is not an object. Such an entry vanishes on the
next add or remove with no log line and no event naming it, and nothing else ever removes it.

Real entries always carry an `appName`, so this only affects a hand-edited or damaged `store/config.json`.

## Why it is parked

Phase 86 (D-03) ported recent games to Rust as `gamelib_info::recent` and copies this behaviour for parity. The 86-04
goldens `add-over-empty-appname-entry` and `remove-drops-empty-appname-entry` pin it, and `recent::keeps` has a unit
test per falsy shape. Changing it inside the port would change what the goldens prove.

## Fix, if it is ever wanted

Keep an entry unless its `appName` is a string equal to the game: `entry.appName !== appName`. Decide whether an
entry with no usable `appName` should instead be removed once with a log line. Change `recent::keeps`, the two
goldens and the unit test together.

## Acceptance

- The two goldens and `recent::keeps` agree on the chosen rule.
- A stored entry that is not the game being added or removed survives an add and a remove (or is removed once, loudly).

## Resolution

Fixed 2026-11-27 in quick task 261127-wem (fix `48cd1e575`, end-to-end test `3f5119a81`).

- Rule chosen: keep. `recent::keeps` drops an entry only when it is an object whose `appName` is a string equal to
  the game. Entries with a missing, empty, `null`, `0` or other non-matching `appName`, and non-object values, survive
  every add and remove. There is no remove-once path. `list` already returned such entries unchanged.
- The unused `cache_view::is_falsy` import is gone; the module doc and the `keeps`, `add` and `remove` docs state the
  rule. The unit test is now `keeps_drops_only_the_game_itself`.
- Goldens: `add-over-empty-appname-entry` now expects [app1, ghost, app2]; the remove case is renamed
  `remove-keeps-empty-appname-entry` and expects [ghost, app2]. Both are hand-derived (the TS oracle was deleted in
  86-24) and labelled so in `cases.json` and the `golden_recent.rs` header, following 261123-bax.
- The two concurrent add/remove tests (`golden_recent.rs` and `src-tauri/src/info_dispatch.rs`) now expect the ghost to
  survive.
- New test `every_entry_that_is_not_the_game_survives_add_and_remove` sends ten non-matching shapes through one add and
  two removes. It fails with the falsy drop restored.
- `golden_recent` 13 passed, lib `recent::` 3, shell `info_dispatch::tests::` 54; clippy and rustfmt clean.
