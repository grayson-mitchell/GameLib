---
created: 2026-08-15T08:50:00.000Z
updated: 2026-09-01T00:00:00.000Z
title: "Pull upstream i18n catalog refreshes (Heroic v2.22.1) — DONE 2026-09-01"
area: i18n
needs: port
status: "RESOLVED 2026-09-01 via Option A in quick task 260901-ncb (commit 5973d4448) — 74 non-English files taken wholesale at c39d40174. Unblocked first by the drift triage in 260901-n60."
severity: minor
unblocked_by: "Quick task 260901-n60 — the `pnpm i18n` drift was triaged and proven disjoint from this pull"
upstream:
  - c39d40174 (Heroic v2.22.1 — Updated Translations, #5806) — 72 files, +1008/-463
  - 270353382 (Heroic v2.22.1 — Updated Translations, #5694) — 13 files, +164/-124
files:
  - public/locales/
---

## Problem

Two upstream Weblate translation refreshes landed in Heroic v2.22.1. GameLib has not pulled
either.

## Status: DONE

This was held as `BLOCKED` from 2026-08-15 on the theory that pulling 1000+ lines of catalog
churn on top of unresolved `pnpm i18n` drift would mask the drift. **That triage is now
done (quick task `260901-n60`, see its `TRIAGE.md`), and it falsified the premise.** The
drift is 4 files, all under `public/locales/en/`. These two commits touch 73 files across
45 locales and **not one of them is under `en/`**. Disjoint file sets — neither can mask
the other, and neither blocks the other.

The 78-key `en/` drift is now tracked separately as
[[2026-09-01-pnpm-i18n-reports-78-uncommitted-en-keys-4-of-them-test-sentinels]]. Do not
re-couple the two.

## Three claims this todo used to make that are false

Recorded so nobody re-derives them.

1. **"Pulling the refresh risks masking the drift."** False. Measured: the union of both
   commits under `public/locales/` is 73 files over `ar az be bg bs ca cs da de el es et eu
   fa fi fr ga gl he hr hu id it ja ka ko lt ml nb_NO nl pl pt pt_BR ro ru sk sr sv ta th
   tr uk vi zh_Hans zh_Hant` — zero under `en/`. The drift is 100% under `en/`.

2. **"`en/translation.json` has diverged +290 lines and the `en/` half needs
   hand-resolution; GameLib's rebranding edits must survive."** False. Upstream touches no
   `en/` file in either commit, so those fork edits are never contested. There is no `en/`
   half to resolve.

3. **"The `i18nCatalogChurnGuard` may not distinguish an upstream refresh replay from a fork
   edit."** False. `meta/i18nCatalogChurnGuard.ts`'s `runCli()` collects paths from
   `git diff --name-only -- public/locales` — **unstaged working-tree changes only**. A
   committed, or even merely staged, refresh is invisible to it. The guard cannot fire on
   this pull. (Separately: that also makes it fail-open against staged churn. Not this
   todo's problem, but worth knowing.)

## The one real complication

**Nine further upstream commits between the fork base and `c39d40174` also touch
`public/locales/`**, so a two-commit cherry-pick will not apply cleanly — not because of
fork edits, but because of skipped intermediate upstream commits.

Fork base is `b5b5cad3f`. `git log --oneline b5b5cad3f..c39d40174 -- public/locales/` gives,
newest first:

```
c39d40174  [i18n] Updated Translations (#5806)   <- target
8eb7fe7f9  [Input] Improved gamepad key repeat to make navigation snappier (#5059)
adefbca62  [Fix] Description of "Game Arguments" option (#5810)
270353382  [i18n] Updated Translations (#5694)   <- target
ccfc8e849  [Feat] Make the Store Pages controllable with Joystick (#5707)
43dd58cd6  [Feat] Resolve GOG Deals region from the user's GOG account (#5790)
728bd197e  [Feat] Add Humble Bundle deals to the Discounts screen (#5748)
a6bf657bd  Fix various typos (#5761)
6d32bae8e  [Feat] Add Green Man Gaming deals to the Discounts screen (#5740)
a71a8b4b7  [Tech] Point Plausible analytics to the self-hosted instance (#5736)
bdafb95ff  [TECH] Remove Wine-GE from the wine manager options (#5251)
```

Blob comparison confirms it: of the 73 target files, **57 differ between `HEAD` and the
respective upstream commit's parent** — while `git diff b5b5cad3f..HEAD -- public/locales/`
shows the fork has touched only 4 non-English files, and all 4 are the fork-owned
`de|fr/gamelib{,.mt}.json` that upstream does not know about. So every one of those 57
mismatches is intermediate upstream drift, not fork drift.

## Two ways to do the pull — decide before starting

**Option A — take non-English content wholesale at `c39d40174`.** Check out the 45
non-English locale directories at that commit, excluding any `gamelib*.json`. Applies
cleanly by construction and absorbs the 9 intermediate commits' translation content too.
Cost: pulls in non-English strings for `en/` keys the fork does not have. That is
**harmless** — `meta/lintTranslations.ts` sets `printExtraTransations = false`, so extra
keys with no English counterpart are ignored by design (verified: `pnpm lint-translations`
exits 0 today). Recommended.

**Option B — cherry-pick only the two `[i18n]` commits.** Truer to the todo's original
scope, but will conflict on the 57 files and each conflict must be resolved by hand against
intermediate upstream content the fork never took. Not recommended.

## Constraints for whichever option is chosen

- Touch **nothing** under `public/locales/en/` — that is the other todo's territory, and
  keeping the two apart is the whole point of the triage.
- Touch **no** `gamelib.json` / `gamelib.mt.json` in any locale — fork-owned, upstream has
  no version of them. `de/` and `fr/` have them.
- Do not run `pnpm i18n` as part of this work. It writes `en/` and would re-entangle the two
  todos. `pnpm i18n --fail-on-update` is safe (it is a pure check and writes nothing) but is
  currently RED for reasons that belong to the other todo.
- Verify afterwards with `pnpm lint-translations` (expect exit 0) and
  `pnpm i18n-churn-guard` (expect exit 0 once the refresh is committed).

Reference: `git show c39d40174`, `git show 270353382`. Heroic upstream is git remote
`origin`; `gamelib` is the fork remote.

Related: [[2026-08-06-phase-34-8-i18n-context-fork-namespace-llm-machine-fill-defe]] — the
fork-namespace decision that defines which catalogs are fork-owned vs upstream-owned.

---

## Outcome (2026-09-01, quick task `260901-ncb`, commit `5973d4448`)

**Option A taken.** 74 files across 46 locales — 46 `translation.json`, 28 `gamepage.json`,
zero `login.json`. **+1167 / −628.** Locale `uz` is included; it comes from an intermediate
commit, not from either named refresh.

Written with `git show c39d40174:<path> > <path>`, never `git checkout` (fires
`.husky/post-checkout`).

Every constraint above held, verified rather than assumed:

| check | result |
|---|---|
| all 74 byte-identical to their `c39d40174` blobs | PASS |
| changed set is exactly the 74 intended, nothing more | PASS |
| files touched under `public/locales/en/` | **0** |
| `gamelib.json` / `gamelib.mt.json` touched, any locale | **0** |
| anything changed outside `public/locales/` | none |
| all 74 parse as JSON | PASS |
| `pnpm lint-translations` | exit 0 |
| `pnpm i18n-churn-guard` after commit | exit 0 |
| `meta/__tests__/i18nCatalogChurnGuard.test.ts` | 9/9 pass |
| `pnpm i18n --fail-on-update` | still exactly 78 `en/`-only keys (71/4/2/1) — **unchanged** |

That last row is the empirical proof of the disjointness the triage predicted: a 1795-line
refresh moved the drift number by zero.

**Claim 3 above was also confirmed empirically.** `pnpm i18n-churn-guard` exited **1** while
the 74 files sat unstaged, and **0** the moment they were committed — because it reads
`git diff --name-only`, which sees neither staged nor committed changes. It never had any
ability to distinguish a refresh replay from a fork edit; it simply cannot see either one
once committed.

**One thing this pull deliberately did not fix:** the 74 files it touched carry **2117**
occurrences of "Heroic" and **zero** of "GameLib" (2096 before the pull, so +21). Across
*all* non-English catalogs the figure is **2274 over 89 files, still zero "GameLib"**. That
rebranding gap is pre-existing and out of scope here. Tracked as
[[2026-09-01-non-english-catalogs-are-unrebranded-2117-heroic-strings]].
