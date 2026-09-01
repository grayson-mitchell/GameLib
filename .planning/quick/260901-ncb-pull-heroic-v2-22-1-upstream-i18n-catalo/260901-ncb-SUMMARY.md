---
id: 260901-ncb
status: complete
date: 2026-09-01
closes_todo: pull-upstream-i18n-catalog-refreshes
---

# Quick Task 260901-ncb — Summary

## What was done

Pulled the Heroic v2.22.1 upstream i18n catalog refreshes via **Option A** — non-English
locale content taken wholesale at upstream `c39d40174`, excluding `public/locales/en/` and
every `gamelib*.json`. Commit `5973d4448`.

**74 files across 46 locales** — 46 `translation.json`, 28 `gamepage.json`, zero
`login.json`. **+1167 / −628.** Locale `uz` is included: it comes from an intermediate
upstream commit, not from either named refresh.

Files were written with `git show c39d40174:<path> > <path>`, never `git checkout`, which
fires `.husky/post-checkout` and fails deterministically in this repo.

## Verification

| check | result |
|---|---|
| all 74 byte-identical to their `c39d40174` blobs | PASS (0 mismatches) |
| changed set is exactly the 74 intended, nothing more | PASS |
| files touched under `public/locales/en/` | **0** |
| `gamelib.json` / `gamelib.mt.json` touched, any locale | **0** |
| anything changed outside `public/locales/` | none |
| all 74 parse as JSON | PASS |
| `pnpm lint-translations` | exit 0 |
| `pnpm i18n-churn-guard` after commit | exit 0 |
| `meta/__tests__/i18nCatalogChurnGuard.test.ts` | 9/9 pass |
| `pnpm i18n --fail-on-update` | still exactly 78 `en/`-only keys (71/4/2/1) — **unchanged** |

## Two triage predictions confirmed empirically

**Disjointness (finding F1).** A 1795-line non-English refresh moved the `pnpm i18n` drift
number by **zero** — 78 keys before, 78 after, same 71/4/2/1 split. The blocker this todo
carried for 17 days was measurably impossible.

**The churn guard cannot see a committed refresh (finding F3).** `pnpm i18n-churn-guard`
exited **1** while the 74 files sat unstaged and **0** the instant they were committed,
because it reads `git diff --name-only`, which sees neither staged nor committed changes. It
was never able to distinguish an upstream replay from a fork edit; it simply cannot see
either once committed.

## Files changed

| file | change |
|---|---|
| `public/locales/{46 locales}/{translation,gamepage}.json` | 74 files refreshed from `c39d40174` |
| `.planning/todos/completed/pull-upstream-i18n-catalog-refreshes.md` | moved from `pending/`, marked RESOLVED, outcome table appended |
| `.planning/todos/pending/2026-09-01-non-english-catalogs-are-unrebranded-2117-heroic-strings.md` | new — the rebranding gap this pull surfaced |
| `.planning/quick/260901-ncb-.../260901-ncb-{PLAN,SUMMARY}.md` | new |

## Success criteria

- [x] All 74 files byte-identical to their `c39d40174` blobs.
- [x] `git status --porcelain public/locales/en/` empty.
- [x] No `gamelib.json` / `gamelib.mt.json` in the diff, in any locale.
- [x] Nothing changed outside `public/locales/`.
- [x] All 74 files parse as JSON.
- [x] `pnpm lint-translations` exits 0.
- [x] `pnpm i18n --fail-on-update` unchanged at 78 `en/`-only keys.
- [x] The todo is moved to `.planning/todos/completed/`.

## Surfaced, not fixed

**Every non-English catalog is unrebranded: 2274 "Heroic" strings across 89 files, zero
"GameLib".** Pre-existing (inherited from fork base `b5b5cad3f` — the fork rebranded `en/`
and never touched translations), and raised by only +21 in the touched files by this pull.
It will recur on every future refresh, so the fix must be re-runnable. A blind token swap is
wrong — some occurrences genuinely refer to upstream Heroic, and several languages inflect
the name. Tracked as its own todo with a proposed key-allowlist approach derived from `en/`.

Also noted: `en/translation.json` still holds 2 "Heroic" occurrences, possibly deliberate.
