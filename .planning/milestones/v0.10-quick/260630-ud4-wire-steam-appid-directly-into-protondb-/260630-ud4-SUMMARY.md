---
quick_id: 260630-ud4
slug: wire-steam-appid-directly-into-protondb-
title: Wire Steam AppID directly into ProtonDB lookup
date: 2026-06-30
status: complete
---

# Quick Task 260630-ud4 — Summary

Native Steam games now resolve ProtonDB compatibility from their own AppID
instead of an indirect wiki title lookup. For Steam library games,
`gameInfo.app_name` IS the Steam AppID (`storeManagers/steam/library.ts:168`),
so the GamesDB/PCGamingWiki round-trip was unnecessary and could miss/mismatch.

## What changed (commit `88de6ef2`)

1. **`backend/wiki_game_info/wiki_game_info.ts`** — in the `isLinux` block,
   `steamID = runner === 'steam' ? appName : gamesdb?.steamID || pcgamingwiki?.steamID`.
   This feeds the correct AppID to both `getInfoFromProtonDB` and
   `getSteamDeckComp`, so the inline compatibility tier resolves reliably for
   Steam games.

2. **`frontend/.../GameSubMenu/index.tsx`** — the effect now short-circuits for
   `isSteam`, setting `protondb.com/app/${appName}` immediately (no
   `getWikiGameInfo` round-trip) so "Check Compatibility" opens the exact app
   page instantly.

3. **`frontend/.../GamePage/components/CompatibilityInfo.tsx`** — the inline
   compat row prefers `runner === 'steam'` → `app/${app_name}` over the
   pcgamingwiki steamID when building its ProtonDB link.

## Verification
- `npx tsc --noEmit` → 0 errors.
- `npx jest src/backend/wiki_game_info` → 5 suites, 22 tests pass (util
  signatures unchanged).

## Notes
- ProtonDB API and `getInfoFromProtonDB` signature are unchanged — only the
  AppID *source* changed.
- Non-Steam runners keep the existing wiki-based resolution untouched.
