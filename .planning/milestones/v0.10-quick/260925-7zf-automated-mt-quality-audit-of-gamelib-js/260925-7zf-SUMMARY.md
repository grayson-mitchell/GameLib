---
phase: quick-260925-7zf
plan: 01
status: complete
subsystem: i18n
tags: [i18n, machine-translation, quality-audit, model-review]
metrics:
  completed: 2026-09-25
---

# Quick 260925-7zf Summary

**Result:** 2,240 rows reviewed across 8 locales: 2,015 ok, 213 minor, 12 major, 0 critical. The
structural pass covered 13,440 keys in 48 locales. See `260925-7zf-REPORT.md`.

**The headline finding is systemic, and it came from a grep, not from the reviewers:**
`humbleKeys.activateConfirmBody` leaves "Giftable spares" in English in 21 of 48 locales. The
source string itself also defeats translation in several places: an ambiguous chip label, the
`{{minutes}}m` abbreviation, and no plural keys.

**Verification**
- Every findings file has `rows_reviewed` equal to its input count (280/280 × 8). I checked this
  independently when aggregating.
- `pnpm planning-gates` 13/13 after the todo changes.
- `git diff --stat -- public/locales src meta` was empty. No product file was touched.

**Honest limits**
- This is model review of model output, not human review. The parent todo stays open.
- No `ANTHROPIC_API_KEY` was available, so the review went through subagents instead of a script.
  The inputs and outputs are kept, but the run cannot be replayed exactly.
- Reviewers flagged 2 placeholder-grammar cases (et `{{time}} eest`, `{{total}}-st`) that depend
  on runtime values nobody could see.
- The follow-up counts for untranslated words come from a heuristic (value identical to English).
  I hand-filtered it: cognates such as fr *Images* were judged legitimate.
- Prettier does not cover these files: `.planning` is in `.prettierignore`. No formatter check was
  run, so none is claimed.

**Todos:** the parent was updated and stays open. Two were filed:
`2026-09-25-i18n-source-strings-defeat-translation-...` (medium, code) and
`2026-09-25-refill-systemic-mt-defects-found-by-260925-7zf.md` (medium, human).
