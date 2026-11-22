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

## Ruling

2026-11-23, from the operator:

- Cap the stored list at 50 and trim on add. History beyond 50 is dropped the next time `recent::add` writes. That
  deletes play history and cannot be undone, and the operator accepted it.
- Trim on add only. `list` does not trim: a longer list stored by an older build reads back as stored until the next
  add. `remove` does not trim, because a remove never grows the list.
- The Library's "Recently played" view (`src/frontend/screens/Library/filterEngine.ts`, `passesView` case
  `'recentlyPlayed'`, `deps.recentAppNames.includes`) shows every stored entry, so after the cap it shows at most 50.
  The operator was told this and accepted it.

## Resolution

Fixed 2026-11-23 in quick task 261123-bax (cap commit `6e44d4e64`, boundary tests `bb1b96742`).

- `MAX_STORED` (50) is a private constant in `src-tauri/crates/gamelib-info/src/recent.rs`.
- `add` runs `retain`, then `insert(0)`, then `truncate`, then `write`, so the sink and the tray get the trimmed list.
  `list`, `remove`, `keeps` and `write` are unchanged.
- The module doc's length bullet was replaced by the ruling.
- The `sixty-entry-list` golden now expects 50 entries (app1, then app100 to app148; app149 to app159 dropped). It was
  re-derived by hand from the rule and the before-state, with a serialiser round-trip guard, because the TS original
  (deleted in 86-09) never trimmed and the oracle that recorded the goldens was deleted in 86-24. `cases.json` and the
  `golden_recent.rs` module doc say it is hand-derived.
- Four boundary tests in `golden_recent.rs`: `a_full_list_plus_a_new_game_keeps_fifty_and_drops_the_oldest`,
  `re_adding_a_game_in_a_full_list_drops_no_other_entry`, `an_add_below_the_cap_drops_nothing` and
  `list_and_remove_leave_an_oversized_list_untrimmed_until_the_next_add`.
- `golden_recent`: 12 passed. With the cap set to 49 all four new tests fail (and so does the golden case); with 50
  restored, 12 pass and `recent.rs` has no diff.
- The tray's display cap (`maxRecentGames`, at most 20) is untouched.
