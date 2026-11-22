---
created: 2026-11-22T21:00:00.000Z
title: "The recent-games list is stored unbounded"
area: info
files:
  - src-tauri/crates/gamelib-info/src/recent.rs (add, remove)
  - src/backend/recent_games/recent_games.ts (addRecentGame, setRecentGames)
severity: minor
platform: any
ready: code
---

## Problem

`games.recent` in `store/config.json` is never trimmed. Every launch adds an entry at the head and removes only an
earlier entry for the same game, so the list grows by one per distinct game ever launched. A long-lived profile
carries every game it has ever played. Only the display is capped (the focus row's card ceiling and the tray's
`maxRecentGames`), not the stored list.

## Why it is parked

Phase 86 (D-03) ported recent games to Rust as `gamelib_info::recent` and copies this behaviour for parity: the TS
original is unbounded (its own comment records that a cap on the stored list "was considered and declined by
operator ruling: evicting persisted play history is irreversible and belongs in its own change"). The 86-04 golden
`sixty-entry-list` pins it (60 entries become 61). Fixing it inside the port would change what the goldens prove.

## Fix, if it is ever wanted

Decide a cap (and whether it trims on add or on read), change `recent::add` and the golden together, and say what
happens to the history beyond the cap. The decision is the operator's: it deletes play history.

## Acceptance

- The operator rules on a cap or on keeping the list unbounded.
- If capped, `recent::add` trims, the `sixty-entry-list` golden is regenerated from the new rule, and the TS
  original is already gone (86-09), so there is one implementation to change.
