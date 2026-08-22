---
created: 2026-08-22
title: "SteamGame.getGameInfo() returns {} on a double async cache miss — root cause of the empty-title install-failure dialog"
area: steam
status: OPEN
severity: minor
files:
  - src/backend/storeManagers/steam/games.ts
found_by: "Phase 37 / REQ-37-03 (D-09) — fallback shipped in 37-04, root cause deliberately not gated"
---

## What's here

37-04 shipped a defensive fallback (`title || appName`) so the Steam install-failure dialog never
renders an empty game name again. Per D-09, that fallback closes REQ-37-03 without fixing the
underlying gap. This todo tracks the gap itself.

## The gap

`SteamGame.getGameInfo()` (`src/backend/storeManagers/steam/games.ts`, `getGameInfo()`, ~:554)
returns `{} as GameInfo` when BOTH of these miss:

1. The in-memory `library` Map (`library.get(this.appId)`)
2. The persisted `steamLibraryStore` cache (`steamLibraryStore.get('games', []).find(...)`)

When both miss, every field on the returned object — not just `title` — is absent, coerced to
`undefined` at runtime despite `GameInfo`'s fields being typed as required (e.g. `title: string`).
The observed symptom (37-04's origin todo) was the install-failure dialog rendering with the game
name missing, at the exact moment the adjacent log line already had the appid
(`Installation of 259130 failed with: ...`) — so the identifier was available, but the enriched
`GameInfo` behind it was not.

## Why this is Steam-only

- `LegendaryLibraryManager.getGameInfo(appName, forceReload)`
  (`src/backend/storeManagers/legendary/library.ts:203`) calls `this.loadFile(appName)`
  **synchronously** when `!library.has(appName)` — the read never returns before the library is
  populated.
- Both `src/backend/storeManagers/gog/games.ts` (~:189) and
  `src/backend/storeManagers/legendary/games.ts` (~:109) carry an explicit `title: ''` fallback
  (with a `logError`) in their own not-found branch — a deliberate, visible placeholder rather
  than a bare `{}`.
- Steam's `getGameInfo()` has neither the synchronous-load pattern nor the explicit-fallback
  pattern its siblings have. The in-memory `library` Map is populated by
  `SteamLibraryManager.refresh()`'s CM sync, which is async and can still be in flight when a
  caller reads `getGameInfo()` — e.g. renderer boot, or (per this todo) an install failure racing
  ahead of a library population that hasn't landed yet.

## Open question research left unanswered

Whether this async-population race causes non-title symptoms elsewhere that would justify closing
it structurally (rather than papering over each call site with its own fallback, the way 37-04 did
for the install-failure dialog). `getGameInfo()` has several other callers in
`src/backend/storeManagers/steam/games.ts` itself (e.g. `isGameAvailable()`, `uninstall()`,
`stop()`) and in `src/backend/downloadmanager/utils.ts` (`installQueueElement`,
`updateQueueElement`, now both routed through `resolveQueueElementTitle`) — each one that
destructures a field straight off `getGameInfo()`'s return without a null/empty guard inherits the
same async-miss gap. A structural fix would likely mirror the two-step fallback
`getGameInfo()` already has for the `library` Map miss (`steamLibraryStore` cache read) at a level
that's reachable before the CM sync completes, or would make the async gap impossible by ensuring
`getGameInfo()` cannot be called before the map is at least cache-hydrated.

## Scope note (D-09)

REQ-37-03 is closed by the 37-04 fallback (`title || appName` in
`src/backend/downloadmanager/utils.ts`'s `resolveQueueElementTitle`). This todo does **not**
reopen it — it exists so the root cause is on record rather than silently dropped once the
symptom stopped being visible.
