---
created: 2026-11-23T08:00:00.000Z
title: "Rust wiki lookup takes the game title from the caller's argument, not from the library"
area: info
files:
  - src-tauri/crates/gamelib-info/src/wiki/hltb.rs (get: the title the by-title search and the GOG entry use)
  - src-tauri/crates/gamelib-info/src/wiki/gamesdb.rs (get: the title is unused)
  - src-tauri/crates/gamelib-info/src/wiki/mod.rs (WikiArgs.title; lookup: the cache key and search term)
  - src-tauri/src/info_dispatch.rs (parse_get_wiki_game_info / get_wiki_game_info: the renderer's title arg)
  - src/frontend/screens/Game/GamePage/index.tsx (getWikiGameInfo callers at :342 and :358)
  - src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx (getWikiGameInfo caller at :238)
  - src/backend/info/wiki.ts (getWikiGameInfo shim: game.getGameInfo().title, the non-Steam shortcut flow)
severity: minor
platform: any
ready: blocked
needs: phase-92
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

## Resolve in Phase 92

Decided 2026-11-23: fix this in **Phase 92 (GOG, Amazon and sideloaded runners)**, not before. Rust can map
`appName` + `runner` to a library title only once all five runners that `info_wiki_get` accepts have a Rust
library owner: Steam (Phase 89), legendary (Phase 91), and gog, nile and sideload (Phase 92). Routing the native
channel back through the sidecar now would undo 86-22's native routing (D-17) just to redo it in 92.

In Phase 92: drop `title` from `WikiArgs` and from the `getWikiGameInfo` channel's arguments (`info_dispatch.rs`
and the three renderer call sites), and have `wiki::get` resolve the title from the Rust library by app name and
runner, as the TS did with `game.getGameInfo()`. The non-Steam shortcut shim in `src/backend/info/wiki.ts` is
deleted with the shortcut flow in Phase 94 and should use the same resolution.

## Original note: if it ever matters

Have the sidecar (or the Rust library, once it owns game info) resolve the title from the app name and runner
before the lookup, and ignore the argument's title.
