---
id: 260901-ncb
slug: pull-heroic-v2-22-1-upstream-i18n-catalo
created: 2026-09-01
description: "Pull the Heroic v2.22.1 upstream i18n catalog refreshes — Option A, non-English wholesale at c39d40174"
type: quick
closes_todo: pull-upstream-i18n-catalog-refreshes
---

# Quick Task 260901-ncb — Pull the upstream i18n catalog refreshes (Option A)

## Why

`.planning/todos/pending/pull-upstream-i18n-catalog-refreshes.md`, unblocked by quick task
`260901-n60`. User chose **Option A**: take non-English locale content wholesale at
`c39d40174` rather than cherry-picking the two `[i18n]` commits, which would conflict on 57
files because 9 intermediate upstream commits also touch `public/locales/`.

## Scope, measured before starting

| quantity | value |
|---|---|
| files under `public/locales/` at `c39d40174` | 142 |
| files under `public/locales/` at `HEAD` | 147 |
| present upstream but absent from HEAD | **0** |
| present in HEAD but absent upstream | 5 — all fork-owned `gamelib*.json` (`de`, `fr`, `en`) |
| target set (upstream, minus `en/`, minus `gamelib*.json`) | 139 |
| **of those, actually differing from HEAD** | **74** — 46 `translation.json`, 28 `gamepage.json` |
| diff size | **+1167 / −628** |
| locales touched | 46, incl. `uz` (which neither named commit touches — it comes from an intermediate commit) |
| `login.json` files changed | **0** |

## Safety facts established before the edit

- **No fork content is at risk.** `git diff b5b5cad3f..HEAD -- public/locales/` touches only
  4 non-English files, all of them the fork-owned `de|fr/gamelib{,.mt}.json` which are
  excluded from the target set. Every one of the 74 files is byte-identical to fork base, so
  overwriting with upstream content loses nothing fork-authored.
- **No rebranding is lost.** The 74 files contain **0** occurrences of "GameLib" at HEAD and
  0 upstream; they carry 2096 occurrences of "Heroic" at HEAD and 2117 after. Non-English
  rebranding is a pre-existing gap that this pull neither creates nor repairs. Flag it, do
  not fix it here.
- **Extra keys are safe.** `meta/lintTranslations.ts` sets `printExtraTransations = false`,
  so non-English keys with no `en/` counterpart are ignored by design.

## Method

Write each target file with `git show c39d40174:<path> > <path>`.

**Do NOT use `git checkout <commit> -- <paths>`** — it fires `.husky/post-checkout`, which
fails deterministically in this repo. `git show` redirection has no such side effect.

## Tasks

1. Recompute the 74-file changed set from first principles (do not trust a cached list).
2. Write each file from `c39d40174` via `git show` redirection.
3. Assert the negative constraints hold: nothing under `en/` changed, no `gamelib*.json`
   changed, nothing outside `public/locales/` changed.
4. Assert every written file is byte-identical to its `c39d40174` blob.
5. Assert all 74 files are still valid JSON.
6. Run `pnpm lint-translations` (expect exit 0) and `pnpm i18n-churn-guard`.
7. Commit; move the todo to `.planning/todos/completed/`; update STATE.md.

## Success criteria

- [ ] All 74 files byte-identical to their `c39d40174` blobs.
- [ ] `git status --porcelain public/locales/en/` empty.
- [ ] No `gamelib.json` / `gamelib.mt.json` appears in the diff, in any locale.
- [ ] `git diff --name-only` contains nothing outside `public/locales/`.
- [ ] All 74 files parse as JSON.
- [ ] `pnpm lint-translations` exits 0.
- [ ] `pnpm i18n --fail-on-update` is no worse than its pre-existing RED (78 keys, `en/` only)
      — this pull must not change that number.
- [ ] The todo is moved to `.planning/todos/completed/`.
