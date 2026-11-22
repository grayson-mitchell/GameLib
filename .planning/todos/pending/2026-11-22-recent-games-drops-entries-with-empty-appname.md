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
