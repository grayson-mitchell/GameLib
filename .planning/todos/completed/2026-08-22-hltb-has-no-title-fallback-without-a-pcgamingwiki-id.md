---
created: 2026-08-22T00:00:00.000Z
title: "HowLongToBeat has no title-based fallback, so every non-GOG game without a PCGamingWiki HLTB ID shows no playtime — permanently"
area: game-enrichment
severity: low
status: "RESOLVED 2026-09-05 by quick task 260905-ew2. A third branch in `getHowLongToBeat` resolves by title when there is no HLTB ID. All four of this todo's (a)-(d) points were addressed: (a) title-search code written against the LIVE endpoint -- the per-build-token scrape this todo predicted is already obsolete, the site now uses a /api/search/site/init handshake; (b) the two HTTP clients kept separate with a comment saying why; (c) the matching rule treated as the deliverable -- threshold 0.9, single-contender ambiguity guard, sequel-token agreement, refuse rather than guess; (d) the 'skipped' outcome is no longer assigned, and the staleWikiFetch clause keyed on it was kept with a CORRECTED rationale (it is redundant, not load-bearing -- the neighbouring 'error' clause already covers every real legacy entry). The unquantified question this todo flagged is now PARTLY answered: a 20-title live sample matched 18, refused 1 (Doom, the predicted collision), and found 1 search-side defect (trademark glyphs). That bounds the false-match rate loosely; it does NOT measure how often the HLTB ID is actually missing across a real library, which remains unmeasured."
found_by: "Split out of item 3 of 2026-08-22-wiki-cache-misses-on-pcgamingwiki-and-hltb-never-self-heal.md while closing that todo's items 1 and 2 (quick task 260822-rc8)"
source: ".planning/todos/completed/2026-08-22-wiki-cache-misses-on-pcgamingwiki-and-hltb-never-self-heal.md"
files:
  - src/backend/wiki_game_info/howlongtobeat/utils.ts
  - src/backend/wiki_game_info/pcgamingwiki/utils.ts
  - src/backend/wiki_game_info/wiki_game_info.ts
---

## Why this is filed separately

This was item 3 of the wiki-cache todo. Items 1 (the PCGamingWiki 403 / User-Agent) and 2 (cached
misses never self-healing) are both closed, so that todo now reads as done and its framing would
bury this. Item 3 was marked "consider" there and was never actioned.

## Problem

`getHowLongToBeat(game, hltbId)` (`howlongtobeat/utils.ts`) has exactly two working branches:

| Branch | Source | Depends on PCGamingWiki? |
| --- | --- | --- |
| `runner === 'gog'` | scrapes the GOG store page, which embeds HLTB numbers | no |
| `else if (hltbId)` | fetches `howlongtobeat.com/game/{id}`, parses `__NEXT_DATA__` | **yes** |
| otherwise | logs "No HLTB ID available", returns `null` | — |

`hltbId` is only ever `pcgamingwiki?.howLongToBeatID` (`wiki_game_info.ts`, the
`getHowLongToBeat(game, pcgamingwiki?.howLongToBeatID)` call). So for every **non-GOG** game —
Steam, Epic, Amazon, Humble, sideloaded — HLTB data exists only if PCGamingWiki both responded AND
carried an HLTB ID for that title.

There are two distinct failure modes and only one is closed:

1. **PCGamingWiki unreachable.** That was the 403. Fixed (descriptive User-Agent, `utils.ts`).
2. **PCGamingWiki responds fine, but the article carries no HLTB ID.** `pcgamingwiki/utils.ts:57`
   is `wikitext.match(howLongToBeatIDRegEx)?.[1] ?? ''` — an empty string, which is falsy, so
   `getHowLongToBeat` takes neither branch and returns `null`.

**Mode 2 is untouched by the UA fix and is permanent** for any game with a thin PCGamingWiki
article. That is what this todo is about.

Not quantified: how often `howLongToBeatID` is actually absent in a real library. Establishing that
needs sampling against live data and was not done — do not assume it is rare, and do not assume it
is common.

## Solution sketch — a third branch, resolving by title

Add a title-search fallback for the non-GOG, no-ID case. Four things make this more than a
one-liner; all four were established by reading the code, not assumed:

- **(a) No title-search code exists.** `getGameDataById` fetches a canonical `/game/{id}` URL.
  HLTB's search is an undocumented POST endpoint that has moved repeatedly and now needs a
  per-build token scraped out of the site's JS bundle. It will break on their schedule.
- **(b) The UA policy here is the INVERSE of PCGamingWiki's.** This module deliberately spoofs
  `Chrome/120` (Cloudflare) and uses **bare `axios`, not the shared `axiosClient`** — which is why
  it never had the 403 problem. `utils.ts`'s shared client deliberately sends a descriptive agent
  and its comment forbids browser impersonation. A well-meaning "unify the HTTP client" refactor
  breaks one site or the other. Keep them separate and say why in a comment.
- **(c) Fuzzy matching is a CORRECTNESS risk, not just an engineering one.** An ID is exact; a
  title search returns ranked guesses — `Doom` (1993) vs `DOOM` (2016) vs `Doom Eternal`, GOTY/
  Definitive Edition suffixes, regional subtitles. Silently attaching the wrong playtime is worse
  than showing nothing, and there is no UI affordance to correct a bad match. **A confidence
  threshold plus an explicit don't-guess fallback IS most of the work here** — treat the matching
  rule as the deliverable, not the HTTP call.
- **(d) It makes part of the outcome model vestigial.** `fetchStatus.howlongtobeat === 'skipped'`
  means "never issued a request because PCGamingWiki errored". Give HLTB an independent path and
  `'skipped'` becomes largely unreachable for non-GOG games, which leaves the clause keyed on it in
  `staleWikiFetch` (`wiki_game_info.ts`, added by quick task 260822-rc8) dead weight. Revisit the
  outcome derivation at `wiki_game_info.ts:139-145` in the same change rather than leaving a
  self-heal rule that can no longer fire.

## Explicitly out of scope

Do not reopen the cache self-heal or the User-Agent work — both are closed and verified. This todo
is only the independent HLTB lookup path.
