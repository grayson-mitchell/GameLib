---
id: 260905-ew2
title: HLTB title-based fallback for non-GOG games with no PCGamingWiki HLTB ID
status: complete
completed: 2026-09-05
closes_todo: 2026-08-22-hltb-has-no-title-fallback-without-a-pcgamingwiki-id.md
commits:
  - 2bf1544e3 feat — conservative title matcher
  - ebb9d989c feat — title search + third branch
  - 26f0eca9c refactor — stop assigning 'skipped'
---

## What shipped

`getHowLongToBeat` gained a third branch. Non-GOG games whose PCGamingWiki article carries no
HLTB ID previously returned `null` forever; they now resolve by title search, or refuse
explicitly rather than guessing.

| File | Change |
| --- | --- |
| `howlongtobeat/titleMatch.ts` (new) | Pure matching rule + `toSearchTerms` |
| `howlongtobeat/utils.ts` | Search handshake, `getGameDataByTitle`, third branch, shared `toHltbEntry`/`BROWSER_HEADERS` |
| `wiki_game_info.ts` | `'skipped'` no longer assigned; corrected comments |
| 3 test files | 41 new tests in the HLTB module, 1 new in wiki_game_info |

## The endpoint, read off the live site

The circulating recipe for HLTB search is stale — there is no `_app-<hash>.js` to scrape any
more, the site is on Turbopack chunks with opaque names. The current mechanism, extracted from
the live bundle and then exercised end-to-end:

```
GET  /api/search/site/init?t=<ms>   -> { token, hpKey, hpVal }
POST /api/search/site                headers x-auth-token / x-hp-key / x-hp-val
                                     body ALSO carries body[hpKey] = hpVal
403 -> re-init once and retry (what the site itself does)
```

The response already carries `comp_main`/`comp_plus`/`comp_100`, so an accepted match needs no
second round trip.

**Rejected shortcut:** `/?q=<term>` returns 200 with a `__NEXT_DATA__` blob full of `comp_main`
fields and looks like a clean SSR search. It is a static trending list — byte-identical for
`hades` and `celeste`. Parsing it would have reported Cyberpunk 2077's playtime for every game
in the library.

## The matching rule (the actual deliverable)

Three conditions, all required: similarity ≥ 0.9; exactly one candidate within 0.05 of the top
score; trailing sequel numbers agree. Refusal is a normal outcome that logs and returns `null`.

## Live evidence

20 real titles against the live index: **18 matched** with correct playtimes, 1 refused, 1 empty.

- The refusal is `Doom` — HLTB genuinely returns two entries by that name, so the ambiguity
  guard fired on precisely the case the todo predicted. Working as designed.
- The empty was a real defect found only by running it: `Sekiro™: Shadows Die Twice` returns
  ZERO results while `Sekiro Shadows Die Twice` returns the game. `toSearchTerms` now strips
  trademark glyphs and trailing punctuation from the query only; diacritics and interior colons
  are left alone (both verified working). Sekiro now resolves at 30h.

This is the sampling the todo said had never been done. It is a 20-title convenience sample, not
a census of a real library — it bounds the false-match rate loosely, it does not measure how
often the ID is missing in the first place.

## Mutation testing found three tests that proved nothing

Every guard was mutation-checked. Three initially survived deletion of the code they existed
for, and were rewritten:

1. **Sequel filter** — survived with all 24 tests green. The `Portal`/`Portal 2` cases it was
   written for are refused by the 0.9 threshold anyway. Its only load-bearing shape is a long
   title differing by one numeral (`Final Fantasy VII` vs a lone `VIII` scores 0.93 with no
   runner-up); that is now pinned.
2. **GOG exclusion** — the test was vacuous. With axios unstubbed, the fallback's own try/catch
   swallowed the throw, so `post` went uncalled whether the guard existed or not. It now stubs a
   *successful* search.
3. **`staleWikiFetch`'s `'skipped'` clause** — deleting it passed all 10 tests, which exposed a
   false rationale in my own first comment rather than a test gap. See below.

## Correction carried in the code

The first version of the `'skipped'` comment claimed the clause was needed so legacy cached
entries self-heal. That is false: the old derivation only assigned `'skipped'` when
`pcgamingwiki` was `'error'`, so the neighbouring `'error'` clause already re-fetches every such
entry. The clause is kept as a cheap guard for an entry whose two fields disagree, the comment
now says so, and a new test seeds that otherwise-unreachable shape so it is at least pinned.

## Verification

- `npx tsc --noEmit` — clean
- `eslint --max-warnings 4157 .` — 4145 warnings, exit 0 (this file dropped 24 → 17 via the
  shared mapper)
- `prettier --check` on all changed files — clean
- Backend project: 4502 passed. The 2 failures in `tauriShellSource.test.ts` are **pre-existing
  at HEAD** — identical with and without this diff, confirmed by stashing.

## Known limits

- The endpoint is undocumented and has moved repeatedly. It will break again. Every step fails
  soft to `null`, so when it does, behaviour returns to today's (no playtime) rather than
  erroring.
- `MIN_CONFIDENCE`/`MIN_MARGIN` are tuned against a 20-title sample, not a corpus.
- No UI affordance for a user to correct or override a match; the design compensates by
  refusing instead of guessing.
