---
created: 2026-08-22T17:20:00.000Z
updated: 2026-08-22T17:16:00.000Z
title: "REMAINING: a cached wiki miss on pcgamingwiki/howlongtobeat never self-heals (30 days, no invalidateCheck). The PCGamingWiki 403 root cause is FIXED and confirmed live."
area: game-enrichment
severity: low
found_by: "Phase 34.1 UAT item 8a, 2026-08-22 — noticed while establishing which createNewWindow affordance is reachable on macOS; root-caused the same session"
source: ".planning/phases/34.1-tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome/34.1-HUMAN-UAT.md item 8a"
files:
  - src/backend/utils.ts
  - src/backend/wiki_game_info/pcgamingwiki/utils.ts
  - src/backend/wiki_game_info/wiki_game_info.ts
  - src/backend/wiki_game_info/electronStore.ts
  - src/frontend/screens/Game/GamePage/index.tsx
---

## STATUS 2026-08-22: root cause FIXED, cache work still open

The User-Agent fix landed in `src/backend/utils.ts:1696-1701` and is **confirmed live**, not just
in principle. After a full `pnpm tauri:dev` restart and a forced refresh on Avowed
(`gamelib.log` 17:15:10-17:15:11):

```
(17:15:10) [ExtraGameInfo]: Getting PCGamingWiki data for Avowed
(17:15:11) [ExtraGameInfo]: Getting HowLongToBeat data for Avowed (ID: 81115) - steam
```

Zero 403s in the log since restart, and the operator confirmed the **Extra info tab now appears**.
Note `ID: 81115` — the HLTB ID is sourced FROM the PCGamingWiki result, which confirms the
downstream chain below was real and not merely plausible: one 403 meant no ID, which meant HLTB
never issued a request at all.

**What remains: item 2 only (cache invalidation).** Items 1 and 3 below are resolved/optional.

## Root cause (FIXED): PCGamingWiki blocks the `axios/*` User-Agent

`axiosClient` (`src/backend/utils.ts:1669-1672`) is created with only `timeout` and `httpsAgent`
— **no `User-Agent` header** — so axios sends its default `axios/<version>`. PCGamingWiki rejects
that with **HTTP 403**.

Confirmed live 2026-08-22, twice in the app (`gamelib.log` 17:07:03 and 17:07:09, after a forced
refresh):

```
[ERROR] [ExtraGameInfo]: Was not able to get PCGamingWiki data for Avowed
                         AxiosError: Request failed with status code 403
```

Then reproduced out-of-app against the same endpoint using **axios 1.13.5 with the identical
client config** (not a curl reconstruction):

| User-Agent | result |
| --- | --- |
| `axios/1.13.5` (the default we send) | **403** |
| `axios/1.7.2` | 403 |
| empty | 403 |
| `node` | 200 |
| `GameLib/0.7.0 (+https://github.com/gamelib)` | **200**, 1 search result for Avowed |

So this is a targeted UA block, not rate limiting, not an endpoint change, and not specific to
Avowed. MediaWiki sites commonly enforce a UA policy requiring a descriptive agent identifying the
tool and a contact URL; `axios/1.13.5` fails it and essentially anything descriptive passes.

## One failure, two empty fields

`getHowLongToBeat(game, pcgamingwiki?.howLongToBeatID)` (`wiki_game_info.ts:86-89`) takes its ID
**from the PCGamingWiki result**. When that 403s, the ID is undefined and HLTB gives up without a
request of its own:

```
[INFO] [ExtraGameInfo]: No HLTB ID available for Avowed, cannot fetch data
```

So a single 403 empties both `pcgamingwiki` and `howlongtobeat`. That is exactly the pair observed
via instrumentation (`[UAT-8]`, 16:48:59): `applegamingwiki=true codeweavers=true
howlongtobeat=false pcgamingwiki=false`.

User-visible effect: the **Extra info tab never renders** — `hasWikiInfo`
(`GamePage/index.tsx:429`) requires `howlongtobeat`, a pcgamingwiki score, or `steamInfo`. So
Metacritic, OpenCritic and HowLongToBeat are missing app-wide on macOS/Windows, not just for one
title. (`steamInfo` is `isLinux`-only by design, `wiki_game_info.ts:92`, so on macOS the tab hangs
entirely on the two fields this 403 empties.)

## The amplifier: the empty result is cached for 30 days

`wikiGameInfoStore` is a 30-day cache (`electronStore.ts:4-7`, `60 * 24 * 30` minutes) with **no
`invalidateCheck`**. Self-heal is hand-rolled in `wiki_game_info.ts` as two bespoke staleness rules
covering only two of four sub-lookups:

| sub-lookup | staleness rule | self-heals a cached miss? |
| --- | --- | --- |
| `applegamingwiki` | `staleAppleData` (`:38`) | yes, on macOS |
| `codeweavers` | `staleCrossoverData` (`:51-58`), D-13-gated | yes, on macOS/Linux |
| `pcgamingwiki` | none | **no** |
| `howlongtobeat` | none | **no** |

The mechanism already exists twelve lines away: `umuStore` (`electronStore.ts:9`) passes
`invalidateCheck: (data) => !data`, so a falsy cached value is re-fetched automatically.
`wikiGameInfoStore` does not. **So even after the UA is fixed, every already-cached game keeps its
empty pcgamingwiki/HLTB for up to 30 days.**

The manual bypass barely exists either. `forceRefresh` is exposed as `refreshWikiInfo`
(`GamePage/index.tsx:320`), whose only caller is the Refresh `IconButton` inside AppleWikiInfo's
**Crossover row**, which renders only under `showCrossover = is.mac && !!codeweavers`. On
Windows/Linux, or any macOS game with no CodeWeavers entry, there is no UI path to force a refresh
at all — and where it exists it is labelled "Refresh rating", which does not suggest it also
re-fetches Metacritic/OpenCritic/HowLongToBeat.

## Fix

1. ~~**Set a descriptive `User-Agent` on `axiosClient`**~~ — **DONE 2026-08-22**, `utils.ts:1696`.
   Sends `GameLib/${pkg_json.version} (+https://github.com/grayson-mitchell/GameLib)`. Uses a
   STATIC package.json import because `process.env.npm_package_version` is unset in the packaged
   SEA sidecar (the T-34.1-17 trap). Uses the FORK's repo URL, not `package.json`'s
   `repository.url`, which still points at upstream Heroic. Verified: tsc clean, prettier clean,
   `pnpm build:sidecar` exits 0 with the version interpolated inline in the bundle
   (`GameLib/${package_default.version}`, `version: "0.7.0"`) — the aliased JSON import survives
   esbuild. Blast radius accepted: the shared client has 52 call sites across 39 backend files, so
   every outbound backend request now carries this identifier.
2. **Add `invalidateCheck` to `wikiGameInfoStore`** so a cached miss on any sub-lookup re-fetches,
   matching `umuStore`. Without this, fix 1 does not reach any already-cached game for 30 days.
   Note the check must be per-field, not `(data) => !data` — the cached object is non-null with
   *some* fields populated, so a whole-object falsy test would never fire here.
3. Consider giving HLTB a title-based fallback so it is not wholly dependent on PCGamingWiki's ID.

~~**Do not fix 2 without 1.**~~ No longer a constraint — 1 is done, so 2 is now safe to land on
its own. (The original ordering hazard was that re-fetching on every page visit while the UA was
still blocked would convert a cached miss into a 403 on every game-page open.)

## Secondary finding, same area (Linux-only)

`GamePage/index.tsx:308` accepts a result into state only when
`info.applegamingwiki || info.howlongtobeat || info.pcgamingwiki`, but `hasWikiInfo` (`:429`)
treats `steamInfo` as sufficient to show the tab. A `steamInfo`-only result — reachable on Linux,
where `steamInfo` is the platform-specific field — is therefore discarded by the setter despite
satisfying the tab condition, so the Extra info tab could never appear for it. The adjacent
comment at `:317` already concedes this asymmetry for the codeweavers case and works around it
only in the force-refresh path.

## Resolved during investigation, not defects

- `steamInfo=false` on macOS is correct by design (`wiki_game_info.ts:92`, `if (isLinux)`).
- That also explains why `CompatibilityInfo`'s ProtonDB row never appears on macOS despite not
  being platform-gated in its own JSX — it is gated on `steamInfo?.compatibilityLevel`, which
  macOS never populates.
- `refreshWikiInfo` itself works: the forced refresh did issue live fetches
  ("Getting PCGamingWiki data for Avowed", 17:07:03).

## Resolution — item 2 CLOSED (2026-08-22, quick task 260822-rc8)

Summary: `.planning/quick/260822-rc8-wiki-cache-miss-self-heal/SUMMARY.md`

**This todo's prescribed fix for item 2 was wrong, and was NOT applied.** It asked for
`invalidateCheck` on `wikiGameInfoStore`. `src/backend/cache.ts:80-83` ANDs that hook with
`minutesSinceUpdate > this.lifespan`, so it is a retention veto on an *already-expired* entry, not
an early-invalidation trigger:

- It cannot fire inside the 30 days, so it could not have fixed the stated problem at all.
- The default is `() => true`, so any check supplied can only make eviction **less** likely. The
  per-field check this todo specified would have left complete entries cached **forever**.

The todo's supporting claim — that `umuStore`'s `invalidateCheck: (data) => !data` makes falsy
values "re-fetch automatically" — is a misreading of the same AND. It actually makes a *truthy* umu
path cache forever past its 6h lifespan. Left untouched (plausibly intended for umu), recorded here
so the next reader does not repeat the inference.

**What was done instead:** a third staleness flag, `staleWikiFetch`, in `getWikiGameInfo`, joining
the existing `staleAppleData` / `staleCrossoverData` — the established in-repo idiom for exactly
this, and the mechanism this todo itself documented as covering two of the four sub-lookups. Keyed
off the `fetchStatus` the cache already persists: stale on `pcgamingwiki === 'error'`, on
`howlongtobeat === 'skipped'`, or on `fetchStatus` absent entirely (pre-field entries — the 403-era
ones; `WikiInfo.fetchStatus`'s own docstring mandates "treat absent as unknown outcome").

**Deliberately NOT keyed on `!cachedResponse.pcgamingwiki`**, which this todo suggested: a game
genuinely absent from PCGamingWiki caches `outcome: 'notfound'` alongside a null info field, so that
rule would re-scrape it on every details-page visit forever — against the very site whose UA policy
produced the 403 this todo is about.

Verification: wiki_game_info 54/54 across 7 suites, RED-proven against the unfixed guard,
`tsc --noEmit` 0, eslint severity-2 0.

**Item 1** (User-Agent) was already done and is re-confirmed present at `src/backend/utils.ts:1696`.

**Item 3** (give HLTB a title-based fallback so it does not depend on PCGamingWiki's ID) is marked
optional in this todo and was NOT done. It remains a real, un-actioned improvement — if it should
survive this todo's closure, re-file it.

**The secondary finding in this todo is also still open:** `GamePage/index.tsx:308` accepts a result
into state only when `applegamingwiki || howlongtobeat || pcgamingwiki`, while `hasWikiInfo` (`:429`)
treats `steamInfo` as sufficient — so a `steamInfo`-only result (reachable on Linux) is discarded by
the setter despite satisfying the tab condition. Untouched here; out of scope for item 2.
