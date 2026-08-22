---
task: 260822-rc8
title: "Make a cached PCGamingWiki/HLTB miss self-heal instead of persisting for the 30-day TTL"
status: complete
date: 2026-08-22
branch: wt/smallstuff
resolves_todo: .planning/todos/completed/2026-08-22-wiki-cache-misses-on-pcgamingwiki-and-hltb-never-self-heal.md
files_modified:
  - src/backend/wiki_game_info/wiki_game_info.ts
  - src/backend/wiki_game_info/__tests__/wiki_game_info.test.ts
---

## What changed

`getWikiGameInfo` gained a third staleness flag, `staleWikiFetch`, joining the existing
`staleAppleData` / `staleCrossoverData` in the cache-hit guard. A cached entry is now treated as
a miss when `fetchStatus.pcgamingwiki === 'error'`, when `fetchStatus.howlongtobeat === 'skipped'`,
or when `fetchStatus` is absent entirely (an entry written before the field existed — i.e. exactly
the 403-era entries).

## The todo's prescribed fix was wrong — this is the headline

The todo asked for `invalidateCheck` on `wikiGameInfoStore`. `src/backend/cache.ts:80-83`:

```ts
if (
  minutesSinceUpdate > this.lifespan &&        // <-- AND
  this.invalidateCheck(this.current_store.get(key) as ValueType)
) { evict }
```

`invalidateCheck` is **ANDed with expiry**. It is a retention veto on an already-expired entry, not
an early-invalidation trigger, so:

- It cannot fire inside the 30 days — it cannot fix the stated problem at all.
- The default is `() => true`, so any supplied check can only make eviction **less** likely. The
  todo's suggested per-field check would have left complete entries cached **forever**.

The todo's supporting claim — that `umuStore`'s `invalidateCheck: (data) => !data` makes falsy
values "re-fetch automatically" — is a misreading of the same AND. What it actually does is make a
truthy umu path cache forever past its 6h lifespan. Left untouched (plausibly intended; a resolved
umu path rarely changes), but recorded here because the next reader will hit the same trap.

## Why keyed on the OUTCOME, not on a null field

The todo suggested `!cachedResponse.pcgamingwiki`. A game genuinely absent from PCGamingWiki caches
`outcome: 'notfound'` alongside `pcgamingwiki: null`, so that rule would re-scrape every such game
on **every details-page visit, forever** — against the very site whose UA policy produced the 403
this todo is about. Turning a fixed bug into a self-inflicted one. `notfound` is a real answer and
stays cached; only `error` / `skipped` / unknown re-fetch.

## Collateral caught (and why it mattered)

Adding the "absent `fetchStatus` is stale" clause broke an existing test — `D-13 no re-scrape loop`
— whose fixture predates the field. Fixed the fixture, not the rule.

More importantly, the **sibling** test (`D-13 self-heal`) still passed, but for the wrong reason:
it expects a re-fetch, and with no `fetchStatus` in its fixture it would have re-fetched via the
new clause and stayed green **even if the `crossoverIndexHas` gate broke entirely**. Both fixtures
now carry an explicit successful `fetchStatus` so they keep isolating the D-13 path.

Behavioural note: on first visit after this ships, every pre-`fetchStatus` cache entry re-fetches
once. That is intended (they are the 403-era entries) and is a one-shot, not a loop — after the
re-fetch the entry carries `fetchStatus` and the normal rules govern.

## Verification

- `pnpm exec jest src/backend/wiki_game_info` — **54/54 pass, 7 suites**.
- **RED-proven.** Removed `!staleWikiFetch` from the guard via a scratchpad copy (no `git stash` /
  `git reset`) and re-ran: the two "re-fetches" tests FAIL, and the two "stays cached" tests still
  PASS — the correct split. Two tests prove the fix fires; two prove it does not over-fire.
- Test-validity note recorded in the suite: `use_in_memory()` is required in `beforeEach`, because
  under the bare `jest.mock('electron-store')` automock `store.has()` returns undefined, a cache
  HIT is impossible, and every "it re-fetched" assertion would pass **vacuously**. Verified with a
  throwaway probe before writing the tests.
- `pnpm exec tsc --noEmit` — exit 0.
- `pnpm exec eslint <both files> -f json` filtered on `severity === 2` — 0 errors.

## Not done

Item 3 of the todo (give HLTB a title-based fallback so it does not depend on PCGamingWiki's ID)
is explicitly optional and out of scope here. Left in place; the todo records it.
