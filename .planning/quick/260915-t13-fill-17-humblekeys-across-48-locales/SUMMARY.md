---
quick_id: 260915-t13
title: Fill the 17 unlocalised humbleKeys keys across 48 locales
date: 2026-09-15
status: complete
---

# Quick Task 260915-t13 — Summary

**The 816-finding CI red is cleared.** 17 `humbleKeys.*` keys filled across all 48 non-English
locales in `public/locales/<locale>/gamelib.json` — 816 strings, hand-written.

## Before / after

| gate | before | after |
| --- | --- | --- |
| `lintTranslations` | 2 failed / 30 passed, **816** findings each | **32 passed**, 0 findings |
| `gamelibCatalogParity` | (green, keys absent) | **198 passed** |
| `i18nCatalogChurnGuard` | green | **9 passed** with 48 unstaged locale edits |
| `pnpm planning-gates` | 11/11 | **11/11** |

## Why hand-written

The sanctioned `pnpm machine-fill-gamelib` path was **re-measured live, not assumed**: the 108-char
`sk-ant-` key in `~/.gamelib.env` returns `HTTP 401 {"type":"authentication_error","message":"API
key is invalid."}`. That independently confirms the 2026-09-08 observation. `machineFillGamelib.ts`'s
own D-08 also states it deliberately does not bulk-run across all 48 locales. Hand-filling is
sanctioned and precedented (quick `260908-iq8`).

## How correctness was established before writing

Rules were **read, not assumed** — and the first assumption was wrong. `validateTranslation` is not
in `lintTranslations.ts`; it lives in `machineFillGamelib.ts` and is applied to committed catalogs
by `gamelibCatalogParity.test.ts:60-82`, over **every non-empty key in every locale**. Measured
constraints across the 17 source strings:

- `claimOnStore`, `loginAndClaim` — must reproduce `{{store}}` verbatim.
- `emptyBody` — must keep glossary term `Humble Bundle` verbatim.
- The other 14 — no placeholder, no `<N></N>` tag, no glossary term.
- `Humble` alone is **not** a glossary term, so `Claim on Humble` is unconstrained.
- `checkStringValueAgainstEnglish` has **no identical-to-English check**, so `Type` → `Type` in
  Dutch is legal rather than a finding.

A **pre-flight validator ran before any file was touched** and reported 0 errors over all 816:
locale set == the real 48 dirs, exactly 17 keys each, placeholder parity both directions, glossary
survival using the repo's own boundary regexes, no empty values, and `filteredEmptyBody` containing
its own locale's `redeemableOnly` label.

## How the write was made safe

Two phases, with **no write until all 48 files proved round-trippable**. Phase 1 auto-detected each
file's exact format and asserted `json.dumps(...)` reproduced the original bytes — all 48 resolved
to `(indent=4, ensure_ascii=False, trailing newline)`. Phase 2 inserted each key **before the first
existing key that sorts after it**, preserving each locale's own order rather than imposing
English's.

That mattered: 7 locales' `humbleKeys` order is not a subsequence of English, so rebuilding in
English order would have reflowed them. Measured result on those exact files (`de`, `et`, `fi`,
`fr`, `hr`): **19 insertions, 1 deletion** each — 17 new lines plus the one-line comma reflow. A
re-sort would have rewritten the whole block.

`assert k not in hk` enforced never-overwrite (D-09); no existing translation was touched.

## Translation policy

House style was **read from each locale's 13 existing `humbleKeys` strings, not imposed**. The
existing rendering of "key" was followed throughout: `de` → **Key**, `nl` → **key**, `vi` → **mã
key**, `ja` → **キー**, `zh_Hans` → **密钥**, `zh_Hant` → **金鑰**, `tr` → **anahtar**. Formality
follows each catalog's register (`de` Sie, `es`/`it` tú/tu, `id` Anda).

## Scope held

- `gamelib.mt.json` **untouched** (verified: 0 `mt.json` files in the diff). These are hand-written;
  stamping MT provenance on them would be a false record.
- `meta/i18nCatalogPresenceBaseline.json` **untouched** (verified: `git diff -- meta/` is empty).
  Filling is the fix; regenerating would have been the green-check-proving-nothing move.
- 48 files changed, all `gamelib.json`. The one other dirty file
  (`todos/completed/2026-09-11-…md`, +31) was already modified at session start and is not mine.

## Residue, named not hidden

1. **These are unreviewed translations.** They are a strict improvement over shipping English to
   every locale, but they are not native-reviewed, and confidence is genuinely lower for `br`, `uz`,
   `ta`, `ml`, `ka`, `eu`, `ga`. They add to the population tracked by todo
   `2026-09-03-all-10032-non-english-fork-strings-are-unreviewed-machine-translation`.
2. **The screen is still not fully localised.** `translation.json` holds 84 fork-added
   `humbleKeys.*` keys absent from all 48 locales, **59 still referenced in `src/`**. That half is
   outside the gate (`FORK_OWNED_NAMESPACES = ['gamelib']`) and needs an operator decision, because
   editing an upstream catalog costs byte-identity with Heroic. The todo was narrowed to that
   remaining scope rather than closed.
3. **No live render was performed.** The gates prove presence and rule-compliance, not that the
   strings read well in situ.
