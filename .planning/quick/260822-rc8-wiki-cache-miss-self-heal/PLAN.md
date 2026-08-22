---
task: 260822-rc8
title: "Make a cached PCGamingWiki/HLTB miss self-heal instead of persisting for the 30-day TTL"
type: quick
branch: wt/smallstuff
area: backend/game-enrichment
severity: low
resolves_todo: .planning/todos/pending/2026-08-22-wiki-cache-misses-on-pcgamingwiki-and-hltb-never-self-heal.md
files_modified:
  - src/backend/wiki_game_info/wiki_game_info.ts
  - src/backend/wiki_game_info/__tests__/wiki_game_info.test.ts

must_haves:
  truths:
    - "A cached entry whose fetchStatus.pcgamingwiki is 'error' is treated as a miss and re-fetched"
    - "A cached entry with NO fetchStatus field at all (written before the field existed — the 403-era entries) is treated as a miss and re-fetched"
    - "A cached entry whose fetchStatus.pcgamingwiki is 'notfound' is SERVED FROM CACHE — never re-scraped"
    - "A fully-successful cached entry (both outcomes 'ok') is served from cache"
  artifacts:
    - path: "src/backend/wiki_game_info/wiki_game_info.ts"
      provides: "staleWikiFetch flag joining staleAppleData/staleCrossoverData in the cache-hit guard"
    - path: "src/backend/wiki_game_info/__tests__/wiki_game_info.test.ts"
      provides: "RED-proven regression coverage for all four truths"
  key_links:
    - from: "src/backend/wiki_game_info/wiki_game_info.ts (cache-hit guard)"
      to: "WikiInfo.fetchStatus (src/common/types.ts:856-874)"
      via: "direct read of the persisted per-source outcome"
---

<objective>
A cached wiki miss on `pcgamingwiki` / `howlongtobeat` never self-heals. The PCGamingWiki 403 root
cause (a default `axios/*` User-Agent) is FIXED and confirmed live, but every game whose entry was
cached during the 403 window keeps its empty result for the full 30-day TTL.

Make those entries re-fetch, without re-scraping games that are legitimately absent from
PCGamingWiki.
</objective>

## Deviation from the todo's prescribed fix — deliberate, and load-bearing

The todo (item 2) prescribes adding `invalidateCheck` to `wikiGameInfoStore`. **That does not
work, and a naive version of it is a regression.** `src/backend/cache.ts:80-83`:

```ts
if (
  minutesSinceUpdate > this.lifespan &&        // <-- AND
  this.invalidateCheck(this.current_store.get(key) as ValueType)
) { evict }
```

`invalidateCheck` is **ANDed with expiry**, so it is a *retention veto on an already-expired
entry*, not an early-invalidation trigger. Consequences:

1. It cannot fire before the 30 days elapse — so it cannot fix the stated problem at all.
2. The default is `() => true` (always evict on expiry). Any `invalidateCheck` supplied can
   therefore only make eviction **less** likely. A per-field check such as
   `(d) => !d.pcgamingwiki` would mean entries that DO have the field are never evicted —
   PCGamingWiki scores and HLTB times would freeze permanently.

The todo also cites `umuStore`'s `invalidateCheck: (data) => !data` as proof that "a falsy cached
value is re-fetched automatically". Under the same AND, what it actually does is make a **truthy**
umu path cache forever past its 6h lifespan. (Plausibly intended for umu, whose resolved path
rarely changes — not touched here.)

## The fix that matches this codebase

`getWikiGameInfo` already self-heals two of its four sub-lookups with exactly this pattern —
`staleAppleData` (`wiki_game_info.ts:41`) and `staleCrossoverData` (`:54-62`) treat a cache HIT as
a miss. Add a third sibling flag, keyed off the `fetchStatus` the cache **already persists**
(written at `:139-142`, typed at `src/common/types.ts:856-874`).

Stale when:
- `fetchStatus.pcgamingwiki === 'error'` — the lookup failed; a retry can fix it (this is the 403).
- `fetchStatus.howlongtobeat === 'skipped'` — HLTB never issued a request because PCGamingWiki
  errored. Currently implied by the clause above, kept explicit so a future change to the outcome
  derivation at `:111-117` cannot silently narrow this rule.
- `fetchStatus` absent entirely — an entry written before the field existed, i.e. exactly the
  403-era entries this todo is about. The type's own docstring mandates this reading: *"Treat
  absent as 'unknown outcome' rather than assuming success."* Mirrors how `staleCrossoverData`
  treats `macRating === undefined` as old-shape stale.

NOT stale when `fetchStatus.pcgamingwiki === 'notfound'`. This is the critical exclusion and the
reason not to use the todo's `!cachedResponse.pcgamingwiki` formulation: a game genuinely absent
from PCGamingWiki caches `outcome: 'notfound'` alongside `pcgamingwiki: null`, so keying on the
null field would re-scrape it on **every game-page visit, forever** — hammering the very site
whose UA policy just blocked us, and turning a fixed bug into a self-inflicted one.

## Tasks

1. Add `staleWikiFetch` to `getWikiGameInfo` and join it to the cache-hit guard at `:63-68`.
2. Add regression coverage for all four truths; prove RED against the unfixed guard.
3. Verify: targeted jest, `tsc --noEmit`, `eslint -f json` filtered on `severity === 2`.
