---
created: 2026-11-23T08:00:00.000Z
title: "Rust wiki lookup takes the game title from the caller's argument, not from the library"
area: info
files:
  - src-tauri/crates/gamelib-info/src/wiki/hltb.rs (get: the title the by-title search and the GOG entry use)
  - src-tauri/crates/gamelib-info/src/wiki/gamesdb.rs (get: the title is unused)
  - src/backend/wiki_game_info/wiki_game_info.ts (getWikiGameInfo: game.getGameInfo().title)
severity: minor
platform: any
ready: code
---

## Problem

The TS `getWikiGameInfo(game)` is handed a `Game` and reads everything about it from the library,
`game.getGameInfo()`: `app_name`, `runner` and `title`. The Rust wiki lookup (Phase 86, D-23) has no library: it
takes the title, app name and runner from the renderer's argument. The title is what PCGamingWiki and
AppleGamingWiki are searched for (after `removeSpecialcharacters`, which is also the wiki cache key), what
HowLongToBeat's title search is sent and matched against, and what the GOG branch stores as `gameName`.

So a renderer that passes a title other than the library's (an override title, a stale list entry, a title the user
edited) now searches the wikis and writes the wiki cache under that title, where the TS used the library's.

## Why it is parked

The renderer shows the game it is asking about by its library title, and the TS shims that will forward to the Rust
lookup (86-22, 86-23) are meant to pass `gameInfo.title` straight from the library, so no caller is expected to pass
a different one.

## If it ever matters

Have the sidecar (or the Rust library, once it owns game info) resolve the title from the app name and runner
before the lookup, and ignore the argument's title.
