---
quick_id: 260922-8xv
slug: fill-the-empty-wikilink-value-in-15-game
created: 2026-09-21
description: "Fill the empty gamepage `wikiLink` value in 15 locales with real translations"
resolves_todo: .planning/todos/pending/2026-09-21-fifteen-locales-carry-an-empty-wikilink-value.md
---

# Quick Task 260922-8xv — fill the 15 empty `wikiLink` catalog values

## Why this runs as `code`, not `human`

The todo is filed `ready: human` on the stated grounds that "closing it needs 15 real human
translations ... not a code change". **That rationale is rotten, and its own sibling is the proof.**
`.planning/todos/completed/2026-09-20-fr-gamepage-wikilink-catalog-entity-is-malformed.md` was filed
`ready: human` with the identical rationale ("still needs an actual French translation of 'Open
page', which this task has no source for") and was closed by `quick-260921-rmj` hand-writing a real
French translation into `public/locales/fr/gamepage.json` (`d466a141d`, `1fbbbcf2c`). That closing
note states the settled precedent in terms:

> the hand-edit route was used instead, following the settled precedent that hand-editing a legacy
> (not upstream-owned, see CLAUDE.md) catalog file is an established, previously shipped-green
> pattern (`474c26c02`, `a9436fa9d`).

This task is the same act, fifteen times, on the same key in the same namespace.

## Measurement re-run at task start (not inherited from the todo)

```
total locale dirs:              49
wikiLink KEY ABSENT:             0
wikiLink PRESENT but == "":     15   az bs eu fa he hr ka ko ml ro sk sr th uz zh_Hant
no gamepage.json FILE at all:    2   br sl
wikiLink PRESENT and non-empty: 32
```

The todo's census reproduces exactly. The 15 files are otherwise substantially translated (2–5
empty values each out of 32 keys) — this is a per-key gap, not a stub-file locale.

## The churn guard, and why this is not blocked by it

`meta/i18nCatalogChurnGuard.ts` classifies any changed path under `public/locales/` that is not a
`gamelib.json`/`gamelib.mt.json` leaf as forbidden `upstream` churn, and
`meta/__tests__/i18nCatalogChurnGuard.test.ts`'s `live tree` block asserts it against the real tree
under `pnpm test:ci`. **It reads `git diff --name-only` — unstaged working tree only.** So the gate
is red between edit and stage, and green once the change is staged or committed. Stage before
running the suite; do not "fix" a red by reverting the catalog.

## Tasks

1. Write a real translation of the English source into each of the 15 files' `wikiLink` value,
   preserving the catalog's established shape: `<sentence>:&nbsp;<1><link text></1>` — colon
   immediately followed by `&nbsp;` with **no space between them** (`1fbbbcf2c` exists solely to
   remove a stray space introduced at exactly this spot in `fr`). Terminology matched per locale
   against that file's own existing `submenu.store` / `info.clickToOpen` values, not chosen freely.
2. Verify by parse + rendering, not by reading the diff: every value non-empty, well-formed
   `&nbsp;`, exactly one `<1>...</1>` pair with non-empty inner text, no stray space before the
   entity, and no value left as English.
3. Stage, run the affected suites, commit.

## Out of scope — named, not silently dropped

- **`br` and `sl` (no `gamepage.json` at all).** Measured at task start: these two locales carry
  **only** `gamelib.json`, `gamelib.mt.json` and `login.json` — they are missing `translation.json`
  as well as `gamepage.json`. That is a whole-locale gap across two legacy namespaces, not a
  `wikiLink` gap, and filling it is not this task's shape. Filed separately.
- **The seven degraded-but-non-empty siblings** found while censusing the other 32 values
  (`ta` malformed `& nbsp;` plus spaces inside its `<1>` tags; `pt_BR` untranslated `Open page` link
  text; `ar`/`gl` stray space before the entity; `ga`/`sv`/`vi` missing the entity entirely). These
  are the `fr` malformed-entity defect class, which the todo being closed here explicitly says
  "must not be conflated" with the empty-value class. Filed separately.
