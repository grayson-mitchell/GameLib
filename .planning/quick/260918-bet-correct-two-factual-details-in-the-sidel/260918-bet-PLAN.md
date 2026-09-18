---
quick_id: 260918-bet
date: 2026-09-18
description: "Correct two factual details in the sideload import-hint Trans todo: non-English count 47 to 46, and catalog path translation.json to gamepage.json"
files:
  - .planning/todos/pending/2026-09-16-sideload-import-hint-trans-uses-key-not-i18nkey.md
---

# Quick Task 260918-bet

Body-only correction to a pending todo. No source changes, no behaviour change, no gate impact.

## Measured facts (this run, 2026-09-18)

| fact                                              | value                                   |
| ------------------------------------------------- | --------------------------------------- |
| locale directories under `public/locales/`        | 49                                      |
| directories carrying `sideload.import-hint.content` | 47 (`br` and `sl` do **not** carry it) |
| of those 47, English                              | 1 (`en`)                                |
| **non-English translated copies**                 | **46**                                  |
| namespace the key lives in                        | `gamepage` → `public/locales/<lang>/gamepage.json` |

Namespace confirmed against `SideloadDialog/index.tsx:64` (`useTranslation('gamepage')`).

## Task 1 — fix the count (47 → 46)

`47` is the number of catalog files carrying the key, which includes `en`. Every place the todo
says "47 non-English" / "47 translated copies" / "47 locales" is off by one.

Lines to change: 3 (title), 35, 40 (twice), 48, 57.

Line 61's "all 49 locales" is **correct and stays** — 49 is the true total locale count, and a
catalog test should span all of them. The 49-vs-47 gap is explained inline instead.

## Task 2 — fix the catalog path

Line 36 says the copies live "in each locale's `translation.json` or equivalent catalog". They do
not. The key is in the `gamepage` namespace. A fixer grepping `translation.json` gets zero hits
and could wrongly conclude the copies don't exist.

Replace with the real path and cite the `useTranslation` call that fixes the namespace.

## Verify

- `grep -c '47' <todo>` returns only the intended survivors
- no occurrence of `translation.json` remains in the todo
- todo frontmatter still passes `.planning/todos/todo-frontmatter-gate.py`
- filename unchanged (the resolver breadcrumb depends on it)

## Done

Todo body states 46 non-English copies, names `public/locales/<lang>/gamepage.json`, and records
that `br`/`sl` carry no copy at all.
