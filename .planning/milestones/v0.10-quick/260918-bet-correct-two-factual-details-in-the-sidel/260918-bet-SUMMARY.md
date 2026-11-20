---
quick_id: 260918-bet
date: 2026-09-18
status: complete
files_changed:
  - .planning/todos/pending/2026-09-16-sideload-import-hint-trans-uses-key-not-i18nkey.md
---

# Quick Task 260918-bet — Summary

Body-only correction to the pending sideload import-hint todo. No source changes.

## What changed

**1. Count 47 → 46** (lines 3, 35, 41 ×2, 49, 58)

`47` counts catalog *files* carrying the key, and one of them is `en`. Every phrasing that said
"47 non-English" / "47 translated copies" / "47 locales" was off by one. Now 46.

**2. Catalog path corrected** (line 35-38)

Was: "in each locale's `translation.json` or equivalent catalog" — wrong, and actively misleading:
a fixer grepping `translation.json` gets zero hits and could conclude the copies don't exist.
Now names `public/locales/<lang>/gamepage.json` and cites `useTranslation('gamepage')` at
`index.tsx:64` as the reason the namespace is `gamepage`.

The string `translation.json` still appears once, at line 38, as an explicit negation
("NOT `translation.json`"). That is deliberate — it heads off the same wrong grep.

## Third fact recorded (not in the original request)

While measuring the count I found the 49-vs-47 gap has a cause worth writing down: **`br` and `sl`
carry no copy of the key at all.** Line 62-66 now records this, because line 62 asks for a catalog
test "across all 49 locales" — and such a test would fail on `br`/`sl` for a reason unrelated to
this defect. Left the "49" as-is (it is the correct total locale count); explained the gap instead.

## Measured, this run

| fact                                                | value                                  |
| --------------------------------------------------- | -------------------------------------- |
| locale dirs under `public/locales/`                 | 49                                     |
| dirs carrying `sideload.import-hint.content`        | 47 (`br`, `sl` absent)                |
| English among those                                 | 1 (`en`)                               |
| non-English copies to sweep                         | 46                                     |

## Verification

- `todo-frontmatter-gate.py` → exit 0, "26 pending todo(s) all carry in-vocabulary keys"
- no unintended `47` remains; the two survivors (lines 64, 65) are the new explanatory passage
- filename unchanged — the resolver breadcrumb depends on it
- `git status` confirms no other tracked file moved

## Not done

The underlying defect is untouched and the todo stays **pending**. `key=` is still `key=` at
`SideloadDialog/index.tsx:376`. This task corrected the todo's description of the work, not the work.
