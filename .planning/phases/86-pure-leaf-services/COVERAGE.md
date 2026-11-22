# API Coverage — Phase 86 leaf services (parity port)

Decided at plan time (2026-11-22, /gsd-plan-phase 86). Phase 86 re-implements, in the Rust `gamelib-info` crate,
the HTTP clients the TypeScript leaf services already use. SVC-01 is a "works as before" requirement, so the
baseline for each service is the exact capability set the TypeScript calls today: every one of those is INTEGRATE.
Everything else on a service's public surface is an OPT-OUT, each with its reason. Adding a capability the
TypeScript never used would be a new feature inside a parity port, and a golden diff must never mix a port with a
change (D-03).

## IsThereAnyDeal (api.isthereanydeal.com) — store search, deals, Steam gids

| capability | decision | reason |
| --- | --- | --- |
| games search (`GET /games/search/v1`) | INTEGRATE | Store Search query (86-16) |
| prices (`POST /games/prices/v3`) | INTEGRATE | search results and deals (86-16) |
| shop id lookup (`GET /lookup/id/shop/{steam}/v1`) | INTEGRATE | `getItadSteamGids` (86-16) |
| game info, overview, history, bundles, stores-low | OPT-OUT | not needed: never called by the TypeScript this replaces |
| user/OAuth endpoints (waitlist, collection, notes) | OPT-OUT | explicitly out of scope: GameLib uses an API key only, no ITAD account |

## SteamGridDB (www.steamgriddb.com/api/v2) — artwork

| capability | decision | reason |
| --- | --- | --- |
| search autocomplete (`/search/autocomplete/{q}`) | INTEGRATE | `steamgriddb.searchGame` (86-15) |
| grids by game (`/grids/game/{id}`) | INTEGRATE | `steamgriddb.getGrids` (86-15) |
| heroes by game (`/heroes/game/{id}`) | INTEGRATE | `steamgriddb.getHeroes` (86-15) |
| logos, icons, by-platform lookups | OPT-OUT | not needed: never called by the TypeScript this replaces |
| uploads, votes, deletes | OPT-OUT | explicitly out of scope: GameLib only reads artwork |

## GOG

| capability | decision | reason |
| --- | --- | --- |
| catalog discounts (`catalog.gog.com/v1/catalog`, with or without a token) | INTEGRATE | Discounts screen (86-18); the token comes from the TS resolver (D-24) |
| product info (`api.gog.com/v2/games/{id}?locale=en-US`) | INTEGRATE | the HowLongToBeat store link for a GOG title (D-23, 86-21) |
| GamesDB external release (`gamesdb.gog.com/.../external_releases/{id}`) | INTEGRATE | the Steam id for a non-Steam title (D-23, 86-21) |
| other `getExtraInfo` GOG calls and the `gog_api_info` cache write | OPT-OUT | D-23: Rust makes only the two unauthenticated GETs; the TS-only requests are a documented list in the D-10 pin |
| GOG library, auth, downloads | OPT-OUT | out of scope here: the GOG runner ports in Phase 92 |

## Wiki and compatibility sources (wiki game info, 86-20..86-22)

| capability | decision | reason |
| --- | --- | --- |
| PCGamingWiki search, parse wikitext, cargoquery by GOG id | INTEGRATE | wiki block |
| AppleGamingWiki MediaWiki search and parse wikitext | INTEGRATE | wiki block on macOS |
| HowLongToBeat search handshake, site search, `/game/{id}` page | INTEGRATE | wiki block |
| ProtonDB report summary (`/api/v1/reports/summaries/{id}.json`) | INTEGRATE | wiki block on Linux |
| Steam Deck compatibility report (`ajaxgetdeckappcompatibilityreport`) | INTEGRATE | wiki block on Linux |
| umu database (`umu.openwinecomponents.org/umu_api.php`) | INTEGRATE | umu id lookup (D-04) |
| other MediaWiki actions, wiki edit/auth, ProtonDB per-report detail | OPT-OUT | not needed: never called by the TypeScript this replaces |

## GameLib-owned and community data files

| capability | decision | reason |
| --- | --- | --- |
| CrossOver index release asset (`crossover-index.json.gz`) | INTEGRATE | CrossOver rating map and the wiki CrossOver row (86-19) |
| AreWeAntiCheatYet and MacAnticheatData `games.json` (raw GitHub) | INTEGRATE | anticheat badge data (86-12) |
| GitHub API for either repository | OPT-OUT | not needed: the raw file is fetched directly, as before |
