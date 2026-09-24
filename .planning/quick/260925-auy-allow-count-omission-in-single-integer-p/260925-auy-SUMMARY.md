---
phase: quick-260925-auy
plan: 01
status: complete
subsystem: i18n
metrics:
  completed: 2026-09-25
---

# Quick 260925-auy Summary

**Commits**
- `fcd1a0cac`: fix `countIsOptionalFor` and add the translator note for oldSchool
- `847ce9249`: the parity test applies the same rule
- `2f4dc1798`: the operator re-fill, plus the baseline going from 1932 to 0

**Verification (run by the orchestrator)**
- `lint-translations:gamelib`: 0 findings, 0 hard failures
- `gamelibCatalogParity` and `machineFillGamelib`: 349/349 tests pass
- `pnpm codecheck`: passes
- `pnpm lint`: 638 warnings, the same as before; both limits pass
- `prettier --check` over the written `.ts` and `.json` files: clean
- `pnpm planning-gates`: 13/13
- `grep -l Giftable`: `en` only

**What the evidence showed**
- The operator's SKIPPED output (`resultsHeading_two: translation drops placeholder {{count}}`)
  confirmed the cause before any code changed.
- Arabic went from 42 skipped forms to 42 filled.
- Hungarian `oldSchool` needed the translator note: a plain re-fill produced "old schoolchild" a
  second time.

**Limits**
- Every output is still unreviewed machine translation.
- Before this change, the fill already accepted a translation that correctly omits `{{count}}` in
  `_other`. The new rule only relaxes single-integer categories, so it cannot make a multi-number
  form lose its count.
